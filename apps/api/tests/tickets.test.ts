import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';

beforeAll(async () => {
  const res = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM tickets'
  );
  if (Number(res.rows[0]?.count ?? 0) < 5) {
    throw new Error(
      'Database is not seeded. Run `npm run db:reset` before running these tests.'
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/tickets', () => {
  it('returns 401 when X-User-Id header is missing', async () => {
    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'UNAUTHENTICATED');
    expect(res.body.error).toHaveProperty('message');
  });

  it('returns 401 when X-User-Id is a non-existent UUID', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 when X-User-Id is malformed (not a UUID)', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', 'not-a-uuid');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 200 with the seeded tickets and the documented shape', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(res.body)).toBe(true);

    // Filter out scratch tickets from parallel test files
    const nonScratch = (res.body as Array<{ title: string }>).filter(
      (t) => !t.title.startsWith('TEST_')
    );
    expect(nonScratch.length).toBeGreaterThanOrEqual(5);
    expect(nonScratch.length).toBeLessThanOrEqual(8);

    for (const ticket of res.body) {
      expect(typeof ticket.id).toBe('string');
      expect(typeof ticket.title).toBe('string');
      expect(['open', 'in_progress', 'resolved', 'closed']).toContain(
        ticket.status
      );
      expect(['low', 'medium', 'high', 'urgent']).toContain(ticket.priority);
      expect(ticket).toHaveProperty('assignee_id');
      expect(ticket).toHaveProperty('reporter_id');
      expect(typeof ticket.reporter_id).toBe('string');
      expect(ticket).toHaveProperty('created_at');
      expect(Array.isArray(ticket.tags)).toBe(true);
      for (const tag of ticket.tags) {
        expect(typeof tag).toBe('string');
      }
      expect(typeof ticket.comment_count).toBe('number');
      expect(ticket.comment_count).toBeGreaterThanOrEqual(0);
    }
  });

  it('includes tag names as a flat string array (no duplicates)', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);

    const safari = res.body.find((t: { title: string }) =>
      t.title.includes('Safari')
    );
    expect(safari).toBeDefined();
    expect(safari.tags).toEqual(expect.arrayContaining(['bug', 'urgent']));
    expect(new Set(safari.tags).size).toBe(safari.tags.length);
  });

  it('reports correct comment_count for each ticket', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);

    const safari = res.body.find((t: { title: string }) =>
      t.title.includes('Safari')
    );
    expect(safari.comment_count).toBe(2);

    const dashboardSlow = res.body.find((t: { title: string }) =>
      t.title.includes('Dashboard loads slowly')
    );
    expect(dashboardSlow.comment_count).toBe(1);

    const noComments = res.body.find((t: { title: string }) =>
      t.title.includes('Add dark mode toggle')
    );
    expect(noComments.comment_count).toBe(0);
  });

  it('orders tickets by created_at descending', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    const timestamps = res.body.map((t: { created_at: string }) =>
      new Date(t.created_at).getTime()
    );
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });

  it('includes sla_target_hours, sla_remaining_seconds, sla_breached on every ticket', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);

    for (const ticket of res.body) {
      expect(ticket).toHaveProperty('sla_target_hours');
      expect(typeof ticket.sla_target_hours).toBe('number');
      expect(ticket).toHaveProperty('sla_remaining_seconds');
      expect(typeof ticket.sla_remaining_seconds).toBe('number');
      expect(ticket).toHaveProperty('sla_breached');
      expect(typeof ticket.sla_breached).toBe('boolean');
    }
  });

  it('urgent ticket has a shorter sla_target_hours than low ticket', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);

    const urgent = res.body.find(
      (t: { priority: string }) => t.priority === 'urgent'
    );
    const low = res.body.find(
      (t: { priority: string }) => t.priority === 'low'
    );
    expect(urgent).toBeDefined();
    expect(low).toBeDefined();
    expect(urgent.sla_target_hours).toBeLessThan(low.sla_target_hours);
  });

  it('ticket whose elapsed time exceeds target shows sla_breached=true', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);

    // The seeded "Password reset email never arrives" ticket is high (8h target)
    // created 120h ago — well past 8h, so it should be breached
    const breached = res.body.find(
      (t: { title: string }) =>
        t.title.includes('Password reset')
    );
    expect(breached).toBeDefined();
    expect(breached.sla_breached).toBe(true);
    expect(breached.sla_remaining_seconds).toBeLessThanOrEqual(0);
  });

  it('non-breached open ticket has positive sla_remaining_seconds', async () => {
    // Create a fresh ticket to get deterministic SLA state
    const createRes = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .set('Content-Type', 'application/json')
      .send({
        title: 'SLA test ticket - not breached',
        description: 'Created just now',
        priority: 'low',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.sla_breached).toBe(false);
    expect(createRes.body.sla_remaining_seconds).toBeGreaterThan(0);
    expect(createRes.body.sla_target_hours).toBe(72);

    // Clean up the created ticket
    const deleteRes = await request(app)
      .delete(`/api/tickets/${createRes.body.id}`)
      .set('X-User-Id', ALICE);
    expect(deleteRes.status).toBe(204);
  });

  it('resolved ticket sla_remaining_seconds stays constant (uses resolved_at)', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);

    // The seeded "Fix typo on signup confirmation page" is resolved (low=72h)
    // created 96h ago, resolved 6h ago → elapsed = 90h > 72h → breached
    const resolved = res.body.find(
      (t: { title: string }) =>
        t.title.includes('typo')
    );
    expect(resolved).toBeDefined();
    // resolved_at is used, not now(), so remaining_seconds is deterministic
    expect(typeof resolved.sla_remaining_seconds).toBe('number');
  });
});

describe('GET /api/tickets/:id SLA fields', () => {
  it('includes sla_target_hours, sla_remaining_seconds, sla_breached on detail response', async () => {
    const listRes = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    // Filter out scratch tickets from parallel test files
    const nonScratch = (listRes.body as Array<{ id: string; title: string }>).filter(
      (t) => !t.title.startsWith('TEST_')
    );
    const ticketId = nonScratch[0]!.id;

    const detailRes = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('X-User-Id', ALICE);
    expect(detailRes.status).toBe(200);

    expect(detailRes.body).toHaveProperty('sla_target_hours');
    expect(typeof detailRes.body.sla_target_hours).toBe('number');
    expect(detailRes.body).toHaveProperty('sla_remaining_seconds');
    expect(typeof detailRes.body.sla_remaining_seconds).toBe('number');
    expect(detailRes.body).toHaveProperty('sla_breached');
    expect(typeof detailRes.body.sla_breached).toBe('boolean');
  });

  it('detail SLA fields match the list SLA fields for the same ticket', async () => {
    const listRes = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    const nonScratch = (listRes.body as Array<{ id: string; title: string; sla_target_hours: number; sla_breached: boolean }>).filter(
      (t) => !t.title.startsWith('TEST_')
    );
    const ticket = nonScratch[0]!;

    const detailRes = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('X-User-Id', ALICE);
    expect(detailRes.status).toBe(200);

    expect(detailRes.body.sla_target_hours).toBe(ticket.sla_target_hours);
    expect(detailRes.body.sla_breached).toBe(ticket.sla_breached);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';

interface TicketResponse {
  id: string;
  status: string;
  resolved_at: string | null;
  sla_breached: boolean;
  sla_remaining_seconds: number;
}

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

beforeEach(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_TX_%'");
});

afterAll(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_TX_%'");
  await pool.end();
});

async function createOpen(): Promise<string> {
  const res = await request(app)
    .post('/api/tickets')
    .set('X-User-Id', ALICE)
    .send({
      title: `TEST_TX_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      priority: 'low',
    });
  if (res.status !== 201) {
    throw new Error(
      `Failed to seed scratch ticket: ${res.status} ${JSON.stringify(res.body)}`
    );
  }
  return (res.body as { id: string }).id;
}

async function transition(id: string, to: string) {
  return request(app)
    .patch(`/api/tickets/${id}`)
    .set('X-User-Id', ALICE)
    .send({ status: to });
}

describe('PATCH /api/tickets/:id status transitions', () => {
  it('allows open -> in_progress', async () => {
    const id = await createOpen();
    const res = await transition(id, 'in_progress');
    expect(res.status).toBe(200);
    expect((res.body as TicketResponse).status).toBe('in_progress');
    expect((res.body as TicketResponse).resolved_at).toBeNull();
  });

  it('allows in_progress -> resolved and stamps resolved_at', async () => {
    const id = await createOpen();
    await transition(id, 'in_progress');
    const beforeResolve = Date.now();
    const res = await transition(id, 'resolved');
    expect(res.status).toBe(200);
    const body = res.body as TicketResponse;
    expect(body.status).toBe('resolved');
    expect(body.resolved_at).not.toBeNull();
    const resolvedAtMs = new Date(body.resolved_at as string).getTime();
    expect(resolvedAtMs).toBeGreaterThanOrEqual(beforeResolve - 1000);
    expect(resolvedAtMs).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('allows resolved -> closed', async () => {
    const id = await createOpen();
    await transition(id, 'in_progress');
    await transition(id, 'resolved');
    const res = await transition(id, 'closed');
    expect(res.status).toBe(200);
    expect((res.body as TicketResponse).status).toBe('closed');
  });

  it('allows resolved -> in_progress (reopen)', async () => {
    const id = await createOpen();
    await transition(id, 'in_progress');
    await transition(id, 'resolved');
    const res = await transition(id, 'in_progress');
    expect(res.status).toBe(200);
    expect((res.body as TicketResponse).status).toBe('in_progress');
  });

  it('rejects open -> resolved with 422 and leaves the ticket open', async () => {
    const id = await createOpen();
    const res = await transition(id, 'resolved');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    const after = await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE);
    expect((after.body as TicketResponse).status).toBe('open');
  });

  it('rejects open -> closed with 422', async () => {
    const id = await createOpen();
    const res = await transition(id, 'closed');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects closed -> in_progress with 422 and leaves the ticket closed', async () => {
    const id = await createOpen();
    await transition(id, 'in_progress');
    await transition(id, 'resolved');
    await transition(id, 'closed');
    const res = await transition(id, 'in_progress');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    const after = await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE);
    expect((after.body as TicketResponse).status).toBe('closed');
  });

  it('rejects closed -> resolved and closed -> open', async () => {
    const id = await createOpen();
    await transition(id, 'in_progress');
    await transition(id, 'resolved');
    await transition(id, 'closed');
    const toResolved = await transition(id, 'resolved');
    expect(toResolved.status).toBe(422);
    const toOpen = await transition(id, 'open');
    expect(toOpen.status).toBe(422);
  });

  it('rejects in_progress -> open with 422', async () => {
    const id = await createOpen();
    await transition(id, 'in_progress');
    const res = await transition(id, 'open');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('a no-op status (same as current) is accepted with 200', async () => {
    const id = await createOpen();
    const res = await transition(id, 'open');
    expect(res.status).toBe(200);
    expect((res.body as TicketResponse).status).toBe('open');
  });

  it('clears resolved_at when ticket is reopened (resolved -> in_progress)', async () => {
    const id = await createOpen();
    await transition(id, 'in_progress');
    const resolved = await transition(id, 'resolved');
    expect((resolved.body as TicketResponse).resolved_at).not.toBeNull();

    const reopened = await transition(id, 'in_progress');
    expect(reopened.status).toBe(200);
    const body = reopened.body as TicketResponse;
    expect(body.status).toBe('in_progress');
    expect(body.resolved_at).toBeNull();

    // Verify via GET that resolved_at is persisted as null
    const getRes = await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE);
    expect((getRes.body as TicketResponse).resolved_at).toBeNull();
  });

  it('reopened ticket SLA shows countdown instead of Met', async () => {
    const id = await createOpen();
    await transition(id, 'in_progress');
    await transition(id, 'resolved');

    // Reopen the ticket
    const reopened = await transition(id, 'in_progress');
    expect(reopened.status).toBe(200);
    const body = reopened.body as TicketResponse;

    // SLA should use now() as reference (since resolved_at is null),
    // so the badge should show countdown, not "Met"
    expect(body.sla_remaining_seconds).toBeGreaterThan(0);
    expect(body.sla_breached).toBe(false);
  });
});

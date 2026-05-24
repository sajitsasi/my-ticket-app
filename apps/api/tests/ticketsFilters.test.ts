import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

interface TicketShape {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  tags: string[];
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

afterAll(async () => {
  await pool.end();
});

function getTickets(query: string = ''): request.Test {
  const path = query.length > 0 ? `/api/tickets?${query}` : '/api/tickets';
  return request(app).get(path).set('X-User-Id', ALICE);
}

describe('GET /api/tickets filtering', () => {
  it('returns the full list when no params are provided', async () => {
    const res = await getTickets();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const nonScratch = (res.body as TicketShape[]).filter(
      (t) => !t.title.startsWith('TEST_')
    );
    expect(nonScratch.length).toBe(6);
  });

  it('filters by status=open', async () => {
    const res = await getTickets('status=open');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body as TicketShape[]) {
      expect(t.status).toBe('open');
    }
  });

  it('filters by status=in_progress', async () => {
    const res = await getTickets('status=in_progress');
    expect(res.status).toBe(200);
    for (const t of res.body as TicketShape[]) {
      expect(t.status).toBe('in_progress');
    }
  });

  it('filters by priority=urgent', async () => {
    const res = await getTickets('priority=urgent');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body as TicketShape[]) {
      expect(t.priority).toBe('urgent');
    }
  });

  it('filters by priority=high', async () => {
    const res = await getTickets('priority=high');
    expect(res.status).toBe(200);
    for (const t of res.body as TicketShape[]) {
      expect(t.priority).toBe('high');
    }
  });

  it('filters by assignee uuid', async () => {
    const res = await getTickets(`assignee=${ALICE}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body as TicketShape[]) {
      expect(t.assignee_id).toBe(ALICE);
    }
  });

  it('filters by tag returns only tickets carrying the tag (no duplicates)', async () => {
    const res = await getTickets('tag=urgent');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const ids = (res.body as TicketShape[]).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of res.body as TicketShape[]) {
      expect(t.tags).toContain('urgent');
    }
  });

  it('q=safari matches title (case-insensitive)', async () => {
    const res = await getTickets('q=safari');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect((res.body as TicketShape[])[0]!.title.toLowerCase()).toContain(
      'safari'
    );
  });

  it('q=SAFARI is case-insensitive', async () => {
    const res = await getTickets('q=SAFARI');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('q matches description text not present in title', async () => {
    const res = await getTickets('q=oauth');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body as TicketShape[]) {
      const haystack = `${t.title} ${t.description}`.toLowerCase();
      expect(haystack).toContain('oauth');
    }
  });

  it('q with no match returns an empty array', async () => {
    const res = await getTickets('q=zzzzzzzzz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('combines status, priority, and assignee with AND', async () => {
    const res = await getTickets(
      `status=open&priority=high&assignee=${ALICE}`
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body as TicketShape[]) {
      expect(t.status).toBe('open');
      expect(t.priority).toBe('high');
      expect(t.assignee_id).toBe(ALICE);
    }
  });

  it('combined filters with no overlap returns empty array', async () => {
    const res = await getTickets(`status=closed&assignee=${BOB}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('combines tag and status', async () => {
    const res = await getTickets('tag=bug&status=open');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body as TicketShape[]) {
      expect(t.status).toBe('open');
      expect(t.tags).toContain('bug');
    }
  });

  it('combines q with priority', async () => {
    const res = await getTickets('q=password&priority=high');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect((res.body as TicketShape[])[0]!.priority).toBe('high');
  });

  it('rejects invalid status with 400 VALIDATION_FAILED', async () => {
    const res = await getTickets('status=bogus');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('rejects invalid priority with 400 VALIDATION_FAILED', async () => {
    const res = await getTickets('priority=super');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects malformed assignee with 400 VALIDATION_FAILED', async () => {
    const res = await getTickets('assignee=not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('treats blank query params as absent', async () => {
    const res = await getTickets('status=&priority=&assignee=&tag=&q=');
    expect(res.status).toBe(200);
    const nonScratch = (res.body as TicketShape[]).filter(
      (t) => !t.title.startsWith('TEST_')
    );
    expect(nonScratch.length).toBe(6);
  });

  it('still requires X-User-Id even when filters are present', async () => {
    const res = await request(app).get('/api/tickets?status=open');
    expect(res.status).toBe(401);
  });
});

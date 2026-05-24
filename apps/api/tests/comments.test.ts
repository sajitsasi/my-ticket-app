import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';

const SAFARI_TICKET = 'bbbbbbb1-0000-0000-0000-000000000001';

const SEED_COMMENT_IDS = new Set([
  'ccccccc1-0000-0000-0000-000000000001',
  'ccccccc2-0000-0000-0000-000000000002',
  'ccccccc3-0000-0000-0000-000000000003',
]);

// Scratch ticket ID for POST comment tests (avoids modifying seeded ticket comment_count)
let scratchTicketId: string;

interface CommentResponse {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
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

  // Create a scratch ticket for POST comment tests so we don't affect seeded ticket comment_counts
  const createRes = await request(app)
    .post('/api/tickets')
    .set('X-User-Id', ALICE)
    .send({
      title: 'TEST_COMMENT_scratch',
      description: 'Scratch ticket for comment tests',
      priority: 'low',
    });
  if (createRes.status !== 201) {
    throw new Error(`Failed to create scratch ticket: ${createRes.status}`);
  }
  scratchTicketId = createRes.body.id;
});

afterEach(async () => {
  await query(
    `DELETE FROM comments WHERE id != ALL($1::uuid[])`,
    [Array.from(SEED_COMMENT_IDS)]
  );
});

afterAll(async () => {
  // Clean up scratch ticket
  if (scratchTicketId) {
    await query('DELETE FROM comments WHERE ticket_id = $1', [scratchTicketId]);
    await query('DELETE FROM audit_log WHERE ticket_id = $1', [scratchTicketId]);
    await query('DELETE FROM tickets WHERE id = $1', [scratchTicketId]);
  }
  await pool.end();
});

describe('GET /api/tickets/:id/comments', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const res = await request(app).get(`/api/tickets/${SAFARI_TICKET}/comments`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns comments array with author_id, body, created_at for a known ticket', async () => {
    const res = await request(app)
      .get(`/api/tickets/${SAFARI_TICKET}/comments`)
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(res.body)).toBe(true);

    const comments = res.body as CommentResponse[];
    expect(comments.length).toBeGreaterThanOrEqual(2);
    for (const c of comments) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.author_id).toBe('string');
      expect(typeof c.author_name).toBe('string');
      expect(typeof c.body).toBe('string');
      expect(typeof c.created_at).toBe('string');
    }

    // Comments should be chronological (oldest first)
    for (let i = 1; i < comments.length; i++) {
      const prev = new Date(comments[i - 1]!.created_at).getTime();
      const curr = new Date(comments[i]!.created_at).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('returns 404 for an unknown ticket id', async () => {
    const res = await request(app)
      .get('/api/tickets/00000000-0000-0000-0000-000000000000/comments')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a malformed (non-UUID) ticket id', async () => {
    const res = await request(app)
      .get('/api/tickets/not-a-uuid/comments')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/tickets/:id/comments', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const res = await request(app)
      .post(`/api/tickets/${scratchTicketId}/comments`)
      .send({ body: 'Hello' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('creates a comment and returns it with author_id from the persona', async () => {
    const bodyText = `Test comment at ${Date.now()}`;
    const res = await request(app)
      .post(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', BOB)
      .send({ body: bodyText });
    expect(res.status).toBe(201);
    const comment = res.body as CommentResponse;
    expect(comment.body).toBe(bodyText);
    expect(comment.author_id).toBe(BOB);
    expect(comment.author_name).toBe('Bob Agent');
    expect(typeof comment.id).toBe('string');
    expect(typeof comment.created_at).toBe('string');

    // Verify it appears in GET
    const getRes = await request(app)
      .get(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', ALICE);
    const comments = getRes.body as CommentResponse[];
    const found = comments.find((c) => c.id === comment.id);
    expect(found).toBeDefined();
    expect(found!.body).toBe(bodyText);
  });

  it('accepts empty body (server-side validation gap)', async () => {
    const beforeRes = await request(app)
      .get(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', ALICE);
    const countBefore = (beforeRes.body as CommentResponse[]).length;

    const res = await request(app)
      .post(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', ALICE)
      .send({ body: '' });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe('');

    // Row was created
    const afterRes = await request(app)
      .get(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', ALICE);
    const countAfter = (afterRes.body as CommentResponse[]).length;
    expect(countAfter).toBe(countBefore + 1);
  });

  it('accepts whitespace-only body (server-side validation gap)', async () => {
    const beforeRes = await request(app)
      .get(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', ALICE);
    const countBefore = (beforeRes.body as CommentResponse[]).length;

    const res = await request(app)
      .post(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', ALICE)
      .send({ body: '   \t  ' });
    expect(res.status).toBe(201);

    // Row was created
    const afterRes = await request(app)
      .get(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', ALICE);
    const countAfter = (afterRes.body as CommentResponse[]).length;
    expect(countAfter).toBe(countBefore + 1);
  });

  it('rejects missing body field with 400', async () => {
    const res = await request(app)
      .post(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', ALICE)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 for an unknown ticket id', async () => {
    const res = await request(app)
      .post('/api/tickets/00000000-0000-0000-0000-000000000000/comments')
      .set('X-User-Id', ALICE)
      .send({ body: 'Test' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a malformed ticket id', async () => {
    const res = await request(app)
      .post('/api/tickets/not-a-uuid/comments')
      .set('X-User-Id', ALICE)
      .send({ body: 'Test' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('persists author_id as the persona that posted, not another user', async () => {
    const bodyText = `Author test ${Date.now()}`;
    const res = await request(app)
      .post(`/api/tickets/${scratchTicketId}/comments`)
      .set('X-User-Id', CAROL)
      .send({ body: bodyText });
    expect(res.status).toBe(201);
    const comment = res.body as CommentResponse;
    expect(comment.author_id).toBe(CAROL);
    expect(comment.author_name).toBe('Carol Requester');
  });
});

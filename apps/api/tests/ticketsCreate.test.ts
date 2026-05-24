import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';
const TAG_BUG = 'aaaaaaa1-0000-0000-0000-000000000001';
const TAG_FEATURE = 'aaaaaaa2-0000-0000-0000-000000000002';

interface Created {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  reporter_id: string;
  assignee_id: string | null;
  assignee_name: string | null;
  tags: string[];
  comment_count: number;
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
  await pool.query(
    "DELETE FROM tickets WHERE title LIKE 'TEST_CREATE_%'"
  );
});

afterAll(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_CREATE_%'");
  await pool.end();
});

describe('POST /api/tickets', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ title: 'TEST_CREATE_x', priority: 'low' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('creates a ticket with all fields and returns 201', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: 'TEST_CREATE_full',
        description: 'A description',
        priority: 'high',
        status: 'open',
        assignee_id: BOB,
        tags: [TAG_BUG, TAG_FEATURE],
      });
    expect(res.status).toBe(201);
    const body = res.body as Created;
    expect(typeof body.id).toBe('string');
    expect(body.title).toBe('TEST_CREATE_full');
    expect(body.description).toBe('A description');
    expect(body.status).toBe('open');
    expect(body.priority).toBe('high');
    expect(body.reporter_id).toBe(ALICE);
    expect(body.assignee_id).toBe(BOB);
    expect(body.assignee_name).toBe('Bob Agent');
    expect(new Set(body.tags)).toEqual(new Set(['bug', 'feature']));
    expect(body.comment_count).toBe(0);

    const list = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(list.status).toBe(200);
    const found = (list.body as Created[]).find((t) => t.id === body.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('TEST_CREATE_full');
  });

  it('creates with required-only fields, defaulting status, assignee, tags', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({ title: 'TEST_CREATE_min', priority: 'low' });
    expect(res.status).toBe(201);
    const body = res.body as Created;
    expect(body.status).toBe('open');
    expect(body.assignee_id).toBeNull();
    expect(body.assignee_name).toBeNull();
    expect(body.tags).toEqual([]);
    expect(body.description).toBe('');
  });

  it('rejects empty title with 400 and persists no row', async () => {
    const before = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM tickets WHERE title NOT LIKE 'TEST_%'"
    );
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({ title: '', priority: 'low' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const after = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM tickets WHERE title NOT LIKE 'TEST_%'"
    );
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });

  it('rejects whitespace-only title with 400', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({ title: '    ', priority: 'low' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects missing title with 400', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({ priority: 'low' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects invalid priority with 400 and no row created', async () => {
    const before = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM tickets WHERE title NOT LIKE 'TEST_%'"
    );
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({ title: 'TEST_CREATE_bad_priority', priority: 'super' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const after = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM tickets WHERE title NOT LIKE 'TEST_%'"
    );
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });

  it('rejects missing priority with 400', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({ title: 'TEST_CREATE_no_priority' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects invalid status with 400 and no row created', async () => {
    const before = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM tickets WHERE title NOT LIKE 'TEST_%'"
    );
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: 'TEST_CREATE_bad_status',
        priority: 'low',
        status: 'archived',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const after = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM tickets WHERE title NOT LIKE 'TEST_%'"
    );
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });

  it('rejects assignee_id that does not reference a known user', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: 'TEST_CREATE_bad_assignee',
        priority: 'low',
        assignee_id: '00000000-0000-0000-0000-000000000000',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects malformed assignee_id with 400', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: 'TEST_CREATE_malformed_assignee',
        priority: 'low',
        assignee_id: 'not-a-uuid',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects unknown tag id with 400', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: 'TEST_CREATE_bad_tag',
        priority: 'low',
        tags: ['00000000-0000-0000-0000-000000000000'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('records reporter as the active persona; switching persona records the new persona', async () => {
    const r1 = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({ title: 'TEST_CREATE_persona_a', priority: 'low' });
    expect(r1.status).toBe(201);
    expect((r1.body as Created).reporter_id).toBe(ALICE);

    const r2 = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', CAROL)
      .send({ title: 'TEST_CREATE_persona_b', priority: 'low' });
    expect(r2.status).toBe(201);
    expect((r2.body as Created).reporter_id).toBe(CAROL);
  });

  it('trims surrounding whitespace from a non-empty title', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({ title: '  TEST_CREATE_trim  ', priority: 'low' });
    expect(res.status).toBe(201);
    expect((res.body as Created).title).toBe('TEST_CREATE_trim');
  });
});

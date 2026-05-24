import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const TAG_BUG = 'aaaaaaa1-0000-0000-0000-000000000001';
const TAG_FEATURE = 'aaaaaaa2-0000-0000-0000-000000000002';

const SAFARI_TICKET = 'bbbbbbb1-0000-0000-0000-000000000001';

interface DetailResponse {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  reporter_id: string;
  reporter_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  tags: string[];
  comments: unknown[];
  audit_log: unknown[];
  sla_target_hours: number;
  sla_remaining_seconds: number;
  sla_breached: boolean;
}

interface TagResponse {
  id: string;
  name: string;
  color: string;
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

async function createScratch(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/tickets')
    .set('X-User-Id', ALICE)
    .send({
      title: `TEST_ASSIGN_TAG_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      priority: 'low',
      ...overrides,
    });
  if (res.status !== 201) {
    throw new Error(`Failed to seed scratch ticket: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { id: string }).id;
}

beforeEach(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_ASSIGN_TAG_%'");
});

afterAll(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_ASSIGN_TAG_%'");
  await pool.end();
});

/* ── GET /api/tags ─────────────────────────────────────────────────── */

describe('GET /api/tags', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns an array of tag objects with id and name', async () => {
    const res = await request(app)
      .get('/api/tags')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const tags = res.body as TagResponse[];
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThanOrEqual(5);
    for (const tag of tags) {
      expect(typeof tag.id).toBe('string');
      expect(typeof tag.name).toBe('string');
      expect(tag.name.length).toBeGreaterThan(0);
    }
    const names = tags.map((t) => t.name);
    expect(names).toContain('bug');
    expect(names).toContain('feature');
    expect(names).toContain('ux');
    expect(names).toContain('backend');
    expect(names).toContain('urgent');
  });
});

/* ── POST /api/tickets/:id/tags ─────────────────────────────────────── */

describe('POST /api/tickets/:id/tags', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const res = await request(app)
      .post(`/api/tickets/${SAFARI_TICKET}/tags`)
      .send({ tag_id: TAG_BUG });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('adds a tag to a ticket and returns the updated ticket', async () => {
    const id = await createScratch();
    const res = await request(app)
      .post(`/api/tickets/${id}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: TAG_FEATURE });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.tags).toContain('feature');
  });

  it('adding the same tag twice is idempotent — only one association', async () => {
    const id = await createScratch();
    await request(app)
      .post(`/api/tickets/${id}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: TAG_BUG });

    const second = await request(app)
      .post(`/api/tickets/${id}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: TAG_BUG });
    expect(second.status).toBe(200);

    const detail = (await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)).body as DetailResponse;
    const bugCount = detail.tags.filter((t) => t === 'bug').length;
    expect(bugCount).toBe(1);
  });

  it('returns 400 for a non-existent tag_id', async () => {
    const id = await createScratch();
    const res = await request(app)
      .post(`/api/tickets/${id}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 for a non-existent ticket id', async () => {
    const res = await request(app)
      .post('/api/tickets/00000000-0000-0000-0000-000000000000/tags')
      .set('X-User-Id', ALICE)
      .send({ tag_id: TAG_BUG });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for an invalid tag_id format', async () => {
    const id = await createScratch();
    const res = await request(app)
      .post(`/api/tickets/${id}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('does not remove existing tags when adding a new one', async () => {
    const id = await createScratch({ tags: [TAG_BUG] });
    const res = await request(app)
      .post(`/api/tickets/${id}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: TAG_FEATURE });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.tags).toContain('bug');
    expect(body.tags).toContain('feature');
  });

  it('response includes sla_target_hours, sla_remaining_seconds, sla_breached', async () => {
    const id = await createScratch({ priority: 'low' });
    const res = await request(app)
      .post(`/api/tickets/${id}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: TAG_FEATURE });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body).toHaveProperty('sla_target_hours');
    expect(typeof body.sla_target_hours).toBe('number');
    expect(body).toHaveProperty('sla_remaining_seconds');
    expect(typeof body.sla_remaining_seconds).toBe('number');
    expect(body).toHaveProperty('sla_breached');
    expect(typeof body.sla_breached).toBe('boolean');
  });

  it('SLA fields match those from GET /api/tickets/:id', async () => {
    const id = await createScratch({ priority: 'low' });
    const addRes = await request(app)
      .post(`/api/tickets/${id}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: TAG_FEATURE });
    expect(addRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE);
    expect(getRes.status).toBe(200);

    const addBody = addRes.body as DetailResponse;
    const getBody = getRes.body as DetailResponse;
    expect(addBody.sla_target_hours).toBe(getBody.sla_target_hours);
    expect(addBody.sla_breached).toBe(getBody.sla_breached);
  });
});

/* ── DELETE /api/tickets/:id/tags/:tagId ────────────────────────────── */

describe('DELETE /api/tickets/:id/tags/:tagId', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const res = await request(app).delete(`/api/tickets/${SAFARI_TICKET}/tags/${TAG_BUG}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('removes a tag from a ticket and returns the updated ticket', async () => {
    const id = await createScratch({ tags: [TAG_BUG, TAG_FEATURE] });
    const res = await request(app)
      .delete(`/api/tickets/${id}/tags/${TAG_BUG}`)
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.tags).not.toContain('bug');
    expect(body.tags).toContain('feature');
  });

  it('is idempotent when the tag is already removed', async () => {
    const id = await createScratch({ tags: [TAG_BUG] });
    await request(app)
      .delete(`/api/tickets/${id}/tags/${TAG_BUG}`)
      .set('X-User-Id', ALICE);

    const second = await request(app)
      .delete(`/api/tickets/${id}/tags/${TAG_BUG}`)
      .set('X-User-Id', ALICE);
    expect(second.status).toBe(200);
    const body = second.body as DetailResponse;
    expect(body.tags).not.toContain('bug');
  });

  it('returns 404 for a non-existent ticket id', async () => {
    const res = await request(app)
      .delete(`/api/tickets/00000000-0000-0000-0000-000000000000/tags/${TAG_BUG}`)
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('response includes sla_target_hours, sla_remaining_seconds, sla_breached', async () => {
    const id = await createScratch({ tags: [TAG_BUG], priority: 'high' });
    const res = await request(app)
      .delete(`/api/tickets/${id}/tags/${TAG_BUG}`)
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body).toHaveProperty('sla_target_hours');
    expect(typeof body.sla_target_hours).toBe('number');
    expect(body).toHaveProperty('sla_remaining_seconds');
    expect(typeof body.sla_remaining_seconds).toBe('number');
    expect(body).toHaveProperty('sla_breached');
    expect(typeof body.sla_breached).toBe('boolean');
  });

  it('SLA fields match those from GET /api/tickets/:id', async () => {
    const id = await createScratch({ tags: [TAG_BUG], priority: 'high' });
    const deleteRes = await request(app)
      .delete(`/api/tickets/${id}/tags/${TAG_BUG}`)
      .set('X-User-Id', ALICE);
    expect(deleteRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE);
    expect(getRes.status).toBe(200);

    const deleteBody = deleteRes.body as DetailResponse;
    const getBody = getRes.body as DetailResponse;
    expect(deleteBody.sla_target_hours).toBe(getBody.sla_target_hours);
    expect(deleteBody.sla_breached).toBe(getBody.sla_breached);
  });
});

/* ── Assignee validation (PATCH /api/tickets/:id with assignee_id) ── */

describe('PATCH /api/tickets/:id assignee validation', () => {
  it('reassigns a ticket and the change is reflected in the API', async () => {
    const id = await createScratch({ assignee_id: BOB });
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: ALICE });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.assignee_id).toBe(ALICE);
    expect(body.assignee_name).toBe('Alice Agent');

    const after = (await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)).body as DetailResponse;
    expect(after.assignee_id).toBe(ALICE);
    expect(after.assignee_name).toBe('Alice Agent');
  });

  it('sets assignee_id to null when selecting unassigned', async () => {
    const id = await createScratch({ assignee_id: BOB });
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: null });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.assignee_id).toBeNull();
    expect(body.assignee_name).toBeNull();
  });

  it('rejects assignee_id that does not reference a known user with 400', async () => {
    const id = await createScratch({ assignee_id: BOB });
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');

    const after = (await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)).body as DetailResponse;
    expect(after.assignee_id).toBe(BOB);
  });
});

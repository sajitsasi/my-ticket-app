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
const TAG_UX = 'aaaaaaa3-0000-0000-0000-000000000003';

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
  comments: Array<{
    id: string;
    ticket_id: string;
    author_id: string;
    author_name: string | null;
    body: string;
    created_at: string;
  }>;
  audit_log: Array<{
    id: string;
    ticket_id: string;
    actor_id: string;
    actor_name: string | null;
    action: string;
    from_value: string | null;
    to_value: string | null;
    created_at: string;
  }>;
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
      title: `TEST_DETAIL_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      priority: 'low',
      ...overrides,
    });
  if (res.status !== 201) {
    throw new Error(`Failed to seed scratch ticket: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { id: string }).id;
}

beforeEach(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_DETAIL_%'");
});

afterAll(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_DETAIL_%'");
  await pool.end();
});

describe('GET /api/tickets/:id', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const res = await request(app).get(`/api/tickets/${SAFARI_TICKET}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the full detail payload with ticket, comments, audit_log', async () => {
    const res = await request(app)
      .get(`/api/tickets/${SAFARI_TICKET}`)
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.body as DetailResponse;
    expect(body.id).toBe(SAFARI_TICKET);
    expect(body.title).toBe('Login button does nothing on Safari');
    expect(typeof body.description).toBe('string');
    expect(body.status).toBe('open');
    expect(body.priority).toBe('urgent');
    expect(body.reporter_id).toBe(CAROL);
    expect(body.reporter_name).toBe('Carol Requester');
    expect(body.assignee_id).toBeNull();
    expect(body.assignee_name).toBeNull();
    expect(typeof body.created_at).toBe('string');
    expect(typeof body.updated_at).toBe('string');
    expect(body.resolved_at).toBeNull();
    expect(new Set(body.tags)).toEqual(new Set(['bug', 'urgent']));

    expect(Array.isArray(body.comments)).toBe(true);
    expect(body.comments.length).toBe(2);
    for (const c of body.comments) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.body).toBe('string');
      expect(typeof c.author_id).toBe('string');
      expect(typeof c.author_name).toBe('string');
      expect(typeof c.created_at).toBe('string');
    }
    const t1 = new Date(body.comments[0]!.created_at).getTime();
    const t2 = new Date(body.comments[1]!.created_at).getTime();
    expect(t1).toBeLessThanOrEqual(t2);

    expect(Array.isArray(body.audit_log)).toBe(true);
  });

  it('returns 404 with JSON error body for an unknown UUID', async () => {
    const res = await request(app)
      .get('/api/tickets/00000000-0000-0000-0000-000000000000')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('returns 404 for a malformed (non-UUID) id', async () => {
    const res = await request(app)
      .get('/api/tickets/not-a-uuid')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/tickets/:id', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const res = await request(app)
      .patch(`/api/tickets/${SAFARI_TICKET}`)
      .send({ title: 'should not change' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .patch('/api/tickets/00000000-0000-0000-0000-000000000000')
      .set('X-User-Id', ALICE)
      .send({ title: 'nope' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('updates only title and leaves other fields untouched', async () => {
    const id = await createScratch({
      description: 'original description',
      priority: 'medium',
      assignee_id: BOB,
      tags: [TAG_BUG],
    });
    const before = (
      await request(app).get(`/api/tickets/${id}`).set('X-User-Id', ALICE)
    ).body as DetailResponse;

    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ title: 'TEST_DETAIL_renamed_only_title' });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.title).toBe('TEST_DETAIL_renamed_only_title');
    expect(body.description).toBe(before.description);
    expect(body.priority).toBe(before.priority);
    expect(body.assignee_id).toBe(before.assignee_id);
    expect(body.tags).toEqual(before.tags);
  });

  it('updates only description without touching other fields', async () => {
    const id = await createScratch({
      description: 'original',
      priority: 'medium',
    });
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ description: 'updated description body' });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.description).toBe('updated description body');
    expect(body.priority).toBe('medium');
  });

  it('updates only priority without touching other fields', async () => {
    const id = await createScratch({ priority: 'low' });
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ priority: 'urgent' });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.priority).toBe('urgent');
    expect(body.status).toBe('open');
  });

  it('updates only status without touching other fields', async () => {
    const id = await createScratch();
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect((res.body as DetailResponse).status).toBe('in_progress');
  });

  it('updates only assignee_id, accepting null to unassign', async () => {
    const id = await createScratch({ assignee_id: BOB });
    const reassign = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: ALICE });
    expect(reassign.status).toBe(200);
    expect((reassign.body as DetailResponse).assignee_id).toBe(ALICE);
    expect((reassign.body as DetailResponse).assignee_name).toBe('Alice Agent');

    const unassign = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: null });
    expect(unassign.status).toBe(200);
    expect((unassign.body as DetailResponse).assignee_id).toBeNull();
    expect((unassign.body as DetailResponse).assignee_name).toBeNull();
  });

  it('replaces tags with the provided list, leaving non-tag fields intact', async () => {
    const id = await createScratch({ tags: [TAG_BUG] });
    const before = (
      await request(app).get(`/api/tickets/${id}`).set('X-User-Id', ALICE)
    ).body as DetailResponse;

    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ tags: [TAG_FEATURE, TAG_UX] });
    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(new Set(body.tags)).toEqual(new Set(['feature', 'ux']));
    expect(body.title).toBe(before.title);
    expect(body.priority).toBe(before.priority);
  });

  it('rejects invalid priority with 400 and persists nothing', async () => {
    const id = await createScratch({ priority: 'low' });
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ priority: 'super' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const after = (
      await request(app).get(`/api/tickets/${id}`).set('X-User-Id', ALICE)
    ).body as DetailResponse;
    expect(after.priority).toBe('low');
  });

  it('rejects assignee_id that does not reference a known user', async () => {
    const id = await createScratch({ assignee_id: BOB });
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const after = (
      await request(app).get(`/api/tickets/${id}`).set('X-User-Id', ALICE)
    ).body as DetailResponse;
    expect(after.assignee_id).toBe(BOB);
  });

  it('rejects whitespace-only title with 400', async () => {
    const id = await createScratch();
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('partial PATCH does not write audit entries for unchanged fields', async () => {
    const id = await createScratch({
      priority: 'medium',
      assignee_id: BOB,
    });

    // Capture baseline audit count (should include 'created' entry)
    const before = (
      await request(app).get(`/api/tickets/${id}`).set('X-User-Id', ALICE)
    ).body as DetailResponse;
    const baselineAuditCount = before.audit_log.length;

    // PATCH only title — priority and assignee stay the same
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ title: 'TEST_DETAIL_partial_patch_title' });
    expect(res.status).toBe(200);

    const after = (
      await request(app).get(`/api/tickets/${id}`).set('X-User-Id', ALICE)
    ).body as DetailResponse;
    // No priority_changed or assignee_changed audit rows should appear
    expect(after.audit_log.length).toBe(baselineAuditCount);
    const actions = after.audit_log.map((e) => e.action);
    expect(actions).not.toContain('priority_changed');
    expect(actions).not.toContain('assignee_changed');
  });

  it('PATCH with only a title update preserves status changed by a prior inline PATCH', async () => {
    const id = await createScratch({ status: 'open' });

    // First: change status (simulating an inline StatusBadge control)
    const statusPatch = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'in_progress' });
    expect(statusPatch.status).toBe(200);

    // Second: change only title (simulating edit-form save)
    const titlePatch = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ title: 'TEST_DETAIL_title_after_status_change' });
    expect(titlePatch.status).toBe(200);

    // Status should still be in_progress (not reverted)
    const after = (
      await request(app).get(`/api/tickets/${id}`).set('X-User-Id', ALICE)
    ).body as DetailResponse;
    expect(after.status).toBe('in_progress');
    expect(after.title).toBe('TEST_DETAIL_title_after_status_change');
  });
});

describe('DELETE /api/tickets/:id', () => {
  it('returns 401 when X-User-Id is missing', async () => {
    const id = await createScratch();
    const res = await request(app).delete(`/api/tickets/${id}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .delete('/api/tickets/00000000-0000-0000-0000-000000000000')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 204, then GET returns 404 and list does not include the id', async () => {
    const id = await createScratch();
    const del = await request(app)
      .delete(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE);
    expect(del.status).toBe(204);
    expect(del.text === '' || del.body === undefined || Object.keys(del.body).length === 0).toBe(
      true
    );

    const after = await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE);
    expect(after.status).toBe(404);

    const list = await request(app).get('/api/tickets').set('X-User-Id', ALICE);
    expect(list.status).toBe(200);
    const ids = (list.body as Array<{ id: string }>).map((t) => t.id);
    expect(ids).not.toContain(id);
  });
});

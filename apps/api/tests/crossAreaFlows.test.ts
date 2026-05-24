import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';

interface TicketListShape {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  reporter_id: string;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  tags: string[];
  comment_count: number;
  sla_target_hours: number;
  sla_remaining_seconds: number;
  sla_breached: boolean;
}

interface TicketDetailShape {
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
  sla_target_hours: number;
  sla_remaining_seconds: number;
  sla_breached: boolean;
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

beforeEach(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_CROSS_%'");
});

afterAll(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_CROSS_%'");
  await pool.end();
});

describe('Cross-area flow: newly created ticket is searchable, filterable, listable', () => {
  const UNIQUE_TOKEN = 'xenon-marker-42';

  it('creates a ticket with a unique title token', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: `TEST_CROSS_${UNIQUE_TOKEN}`,
        description: 'Cross-area flow verification ticket',
        priority: 'high',
        assignee_id: BOB,
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(`TEST_CROSS_${UNIQUE_TOKEN}`);
  });

  it('surfaces the unique-title ticket in the default list', async () => {
    // Create first
    await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: `TEST_CROSS_${UNIQUE_TOKEN}_list`,
        description: 'desc',
        priority: 'high',
        assignee_id: BOB,
      });

    // Then fetch default list
    const list = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(list.status).toBe(200);
    const found = (list.body as TicketListShape[]).find((t) =>
      t.title.includes(UNIQUE_TOKEN)
    );
    expect(found).toBeDefined();
    expect(found!.title).toBe(`TEST_CROSS_${UNIQUE_TOKEN}_list`);
    expect(found!.priority).toBe('high');
    expect(found!.assignee_id).toBe(BOB);
  });

  it('surfaces the unique-title ticket in search results', async () => {
    // Create
    await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: `TEST_CROSS_${UNIQUE_TOKEN}_search`,
        description: 'desc',
        priority: 'high',
      });

    // Search
    const res = await request(app)
      .get(`/api/tickets?q=${UNIQUE_TOKEN}`)
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    const results = res.body as TicketListShape[];
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const t of results) {
      expect(t.title).toContain(UNIQUE_TOKEN);
    }
  });

  it('surfaces the ticket under matching filters (status + priority)', async () => {
    // Create
    await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: `TEST_CROSS_${UNIQUE_TOKEN}_filter`,
        description: 'desc',
        priority: 'high',
        status: 'open',
      });

    // Filter by status=open & priority=high
    const res = await request(app)
      .get('/api/tickets?status=open&priority=high')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    const results = res.body as TicketListShape[];
    const found = results.find((t) => t.title.includes(UNIQUE_TOKEN));
    expect(found).toBeDefined();
    expect(found!.status).toBe('open');
    expect(found!.priority).toBe('high');
  });

  it('does NOT surface the ticket under a non-matching filter', async () => {
    // Create with priority=high
    await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: `TEST_CROSS_${UNIQUE_TOKEN}_exclude`,
        description: 'desc',
        priority: 'high',
      });

    // Filter by priority=low (should not include it)
    const res = await request(app)
      .get('/api/tickets?priority=low')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    const results = res.body as TicketListShape[];
    const found = results.find((t) => t.title.includes(UNIQUE_TOKEN));
    expect(found).toBeUndefined();
  });
});

describe('Cross-area flow: tag added on detail page is filterable on list', () => {
  it('adding a tag to a ticket makes it appear when filtering by that tag', async () => {
    // Create a ticket without tags
    const createRes = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .send({
        title: 'TEST_CROSS_tag_flow',
        description: 'desc',
        priority: 'medium',
      });
    expect(createRes.status).toBe(201);
    const ticketId = (createRes.body as TicketListShape).id;

    // Verify it has no tags initially
    const detail0 = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('X-User-Id', ALICE);
    expect(detail0.status).toBe(200);
    expect((detail0.body as TicketDetailShape).tags).toEqual([]);

    // Find a tag to add
    const tagsRes = await request(app)
      .get('/api/tags')
      .set('X-User-Id', ALICE);
    expect(tagsRes.status).toBe(200);
    const tags = tagsRes.body as Array<{ id: string; name: string }>;
    expect(tags.length).toBeGreaterThan(0);
    const targetTag = tags[0]!;
    const targetTagName = targetTag.name;

    // Add the tag via POST /api/tickets/:id/tags
    const addRes = await request(app)
      .post(`/api/tickets/${ticketId}/tags`)
      .set('X-User-Id', ALICE)
      .send({ tag_id: targetTag.id });
    expect(addRes.status).toBe(200);
    expect((addRes.body as TicketDetailShape).tags).toContain(targetTagName);

    // Now filter the list by that tag
    const listRes = await request(app)
      .get(`/api/tickets?tag=${encodeURIComponent(targetTagName)}`)
      .set('X-User-Id', ALICE);
    expect(listRes.status).toBe(200);
    const filtered = listRes.body as TicketListShape[];
    const found = filtered.find((t) => t.id === ticketId);
    expect(found).toBeDefined();
    expect(found!.tags).toContain(targetTagName);
  });
});

describe('Cross-area flow: API and UI agree field-by-field for the same ticket', () => {
  it('GET /api/tickets/:id returns the same field values as the list endpoint for that ticket', async () => {
    // Pick a non-scratch ticket from the list (scratch rows from parallel tests may be deleted mid-test)
    const listRes = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    expect(listRes.status).toBe(200);
    const listTickets = (listRes.body as TicketListShape[]).filter(
      (t) => !t.title.startsWith('TEST_')
    );
    expect(listTickets.length).toBeGreaterThan(0);
    const fromList = listTickets[0]!;

    // Fetch the same ticket via detail endpoint
    const detailRes = await request(app)
      .get(`/api/tickets/${fromList.id}`)
      .set('X-User-Id', ALICE);
    expect(detailRes.status).toBe(200);
    const fromDetail = detailRes.body as TicketDetailShape;

    // Compare shared fields
    expect(fromDetail.id).toBe(fromList.id);
    expect(fromDetail.title).toBe(fromList.title);
    expect(fromDetail.description).toBe(fromList.description);
    expect(fromDetail.status).toBe(fromList.status);
    expect(fromDetail.priority).toBe(fromList.priority);
    expect(fromDetail.reporter_id).toBe(fromList.reporter_id);
    expect(fromDetail.assignee_id).toBe(fromList.assignee_id);
    expect(fromDetail.assignee_name).toBe(fromList.assignee_name);
    expect(fromDetail.resolved_at).toBe(fromList.resolved_at);
    expect(new Set(fromDetail.tags)).toEqual(new Set(fromList.tags));
    // Detail returns comments array; length must match list's comment_count
    expect(fromDetail.comments.length).toBe(fromList.comment_count);
    expect(fromDetail.sla_target_hours).toBe(fromList.sla_target_hours);
    expect(fromDetail.sla_breached).toBe(fromList.sla_breached);
  });

  it('detail endpoint includes all fields the UI needs: reporter_name, comments, audit_log', async () => {
    const listRes = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    const nonScratch = (listRes.body as TicketListShape[]).filter(
      (t) => !t.title.startsWith('TEST_')
    );
    const fromList = nonScratch[0]!;

    const detailRes = await request(app)
      .get(`/api/tickets/${fromList.id}`)
      .set('X-User-Id', ALICE);
    const detail = detailRes.body as TicketDetailShape;

    // Fields that only exist on the detail endpoint
    expect(typeof detail.reporter_name).toBe('string');
    expect(Array.isArray(detail.comments)).toBe(true);
    expect(Array.isArray(detail.audit_log)).toBe(true);
  });

  it('a newly created ticket has consistent data across list and detail', async () => {
    // Create a ticket with all fields
    const createRes = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', CAROL)
      .send({
        title: 'TEST_CROSS_consistency',
        description: 'Field consistency check',
        priority: 'urgent',
        assignee_id: BOB,
      });
    expect(createRes.status).toBe(201);
    const created = createRes.body as TicketListShape;

    // Fetch from list
    const listRes = await request(app)
      .get('/api/tickets')
      .set('X-User-Id', ALICE);
    const fromList = (listRes.body as TicketListShape[]).find(
      (t) => t.id === created.id
    );
    expect(fromList).toBeDefined();

    // Fetch from detail
    const detailRes = await request(app)
      .get(`/api/tickets/${created.id}`)
      .set('X-User-Id', ALICE);
    const fromDetail = detailRes.body as TicketDetailShape;

    // Field-by-field consistency
    expect(fromDetail.title).toBe(fromList!.title);
    expect(fromDetail.description).toBe(fromList!.description);
    expect(fromDetail.status).toBe(fromList!.status);
    expect(fromDetail.priority).toBe(fromList!.priority);
    expect(fromDetail.reporter_id).toBe(fromList!.reporter_id);
    expect(fromDetail.reporter_id).toBe(CAROL);
    expect(fromDetail.assignee_id).toBe(fromList!.assignee_id);
    expect(fromDetail.assignee_id).toBe(BOB);
    expect(fromDetail.assignee_name).toBe(fromList!.assignee_name);
    expect(new Set(fromDetail.tags)).toEqual(new Set(fromList!.tags));
    // Detail returns comments array; length must match list's comment_count
    expect(fromDetail.comments.length).toBe(fromList!.comment_count);
    expect(fromDetail.comments.length).toBe(0);
    expect(fromDetail.sla_target_hours).toBe(fromList!.sla_target_hours);
    expect(fromDetail.sla_breached).toBe(fromList!.sla_breached);

    // Detail has the created audit entry
    const createdAudit = fromDetail.audit_log.find(
      (e) => e.action === 'created'
    );
    expect(createdAudit).toBeDefined();
    expect(createdAudit!.actor_id).toBe(CAROL);
  });
});

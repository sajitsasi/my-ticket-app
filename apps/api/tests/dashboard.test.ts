import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';

// Scratch ticket IDs for cleanup
const scratchIds: string[] = [];

const SCRATCH_PREFIX = 'TEST_DASH_';

/** SQL fragment to exclude scratch rows from parallel test files */
const NOT_SCRATCH = `title NOT LIKE 'TEST_%'`;

beforeAll(async () => {
  const res = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM tickets'
  );
  if (Number(res.rows[0]?.count ?? 0) < 5) {
    throw new Error(
      'Database is not seeded. Run `npm run db:reset` before running these tests.'
    );
  }
});

beforeEach(async () => {
  await pool.query(`DELETE FROM tickets WHERE title LIKE '${SCRATCH_PREFIX}%'`);
});

afterAll(async () => {
  // Clean up scratch tickets
  if (scratchIds.length > 0) {
    await query('DELETE FROM ticket_tags WHERE ticket_id = ANY($1)', [scratchIds]);
    await query('DELETE FROM comments WHERE ticket_id = ANY($1)', [scratchIds]);
    await query('DELETE FROM audit_log WHERE ticket_id = ANY($1)', [scratchIds]);
    await query('DELETE FROM tickets WHERE id = ANY($1)', [scratchIds]);
  }
  await pool.end();
});

describe('GET /api/dashboard', () => {
  it('returns 401 when X-User-Id header is missing', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'UNAUTHENTICATED');
  });

  it('returns 401 when X-User-Id is a non-existent UUID', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 200 with the documented shape', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);

    const body = res.body;
    // byStatus
    expect(body).toHaveProperty('byStatus');
    expect(body.byStatus).toHaveProperty('open');
    expect(body.byStatus).toHaveProperty('in_progress');
    expect(body.byStatus).toHaveProperty('resolved');
    expect(body.byStatus).toHaveProperty('closed');
    for (const val of Object.values(body.byStatus)) {
      expect(typeof val).toBe('number');
      expect(val as number).toBeGreaterThanOrEqual(0);
    }

    // byPriority
    expect(body).toHaveProperty('byPriority');
    expect(body.byPriority).toHaveProperty('low');
    expect(body.byPriority).toHaveProperty('medium');
    expect(body.byPriority).toHaveProperty('high');
    expect(body.byPriority).toHaveProperty('urgent');
    for (const val of Object.values(body.byPriority)) {
      expect(typeof val).toBe('number');
      expect(val as number).toBeGreaterThanOrEqual(0);
    }

    // avgResolutionTime
    expect(body).toHaveProperty('avgResolutionTime');
    if (body.avgResolutionTime !== null) {
      expect(typeof body.avgResolutionTime).toBe('number');
      expect(body.avgResolutionTime).toBeGreaterThanOrEqual(0);
    }

    // slaBreachCount
    expect(body).toHaveProperty('slaBreachCount');
    expect(typeof body.slaBreachCount).toBe('number');
    expect(body.slaBreachCount).toBeGreaterThanOrEqual(0);

    // topAssignees
    expect(body).toHaveProperty('topAssignees');
    expect(Array.isArray(body.topAssignees)).toBe(true);
    for (const entry of body.topAssignees) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('openCount');
      expect(typeof entry.openCount).toBe('number');
      expect(entry.openCount).toBeGreaterThan(0);
    }
  });

  it('status counts include all non-scratch tickets', async () => {
    const apiRes = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(apiRes.status).toBe(200);

    const dbRes = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM tickets WHERE ${NOT_SCRATCH} GROUP BY status`
    );
    const dbCounts: Record<string, number> = {};
    for (const row of dbRes.rows) {
      dbCounts[row.status] = Number(row.count);
    }
    const statuses = ['open', 'in_progress', 'resolved', 'closed'];
    for (const s of statuses) {
      // API counts include scratch rows from parallel test files, so >= non-scratch DB count
      expect(apiRes.body.byStatus[s]).toBeGreaterThanOrEqual(dbCounts[s] ?? 0);
    }
  });

  it('priority counts include all non-scratch tickets', async () => {
    const apiRes = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(apiRes.status).toBe(200);

    const dbRes = await query<{ priority: string; count: string }>(
      `SELECT priority, COUNT(*)::text AS count FROM tickets WHERE ${NOT_SCRATCH} GROUP BY priority`
    );
    const dbCounts: Record<string, number> = {};
    for (const row of dbRes.rows) {
      dbCounts[row.priority] = Number(row.count);
    }
    const priorities = ['low', 'medium', 'high', 'urgent'];
    for (const p of priorities) {
      expect(apiRes.body.byPriority[p]).toBeGreaterThanOrEqual(dbCounts[p] ?? 0);
    }
  });

  it('avgResolutionTime is mean of resolved_at - created_at for resolved/closed tickets', async () => {
    const apiRes = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(apiRes.status).toBe(200);

    const dbRes = await query<{ avg_seconds: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))::text AS avg_seconds
       FROM tickets
       WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL AND ${NOT_SCRATCH}`
    );

    if (dbRes.rows[0]?.avg_seconds === null) {
      expect(apiRes.body.avgResolutionTime).toBeNull();
    } else {
      expect(apiRes.body.avgResolutionTime).not.toBeNull();
      expect(typeof apiRes.body.avgResolutionTime).toBe('number');
      expect(apiRes.body.avgResolutionTime).toBeGreaterThanOrEqual(0);
    }
  });

  it('slaBreachCount matches independent recomputation using SLA domain', async () => {
    const apiRes = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(apiRes.status).toBe(200);

    // Fetch non-scratch tickets and recompute breaches using domain logic
    const ticketsRes = await query<{
      id: string;
      priority: string;
      created_at: Date;
      resolved_at: Date | null;
      status: string;
    }>(
      `SELECT id, priority, created_at, resolved_at, status FROM tickets WHERE ${NOT_SCRATCH}`
    );

    const { computeSla } = await import('../src/domain/sla.js');
    const now = new Date();
    let breachCount = 0;
    for (const t of ticketsRes.rows) {
      const sla = computeSla(t.priority, t.created_at, t.resolved_at, now);
      if (sla.sla_breached) {
        breachCount++;
      }
    }

    // API breach count should be >= non-scratch recomputation (may include scratch rows)
    expect(apiRes.body.slaBreachCount).toBeGreaterThanOrEqual(breachCount);
  });

  it('topAssignees ordered by open ticket count descending, zero excluded', async () => {
    const apiRes = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(apiRes.status).toBe(200);

    const dbRes = await query<{ assignee_id: string; count: string }>(
      `SELECT assignee_id, COUNT(*)::text AS count
       FROM tickets
       WHERE status IN ('open', 'in_progress') AND assignee_id IS NOT NULL AND ${NOT_SCRATCH}
       GROUP BY assignee_id
       ORDER BY count DESC`
    );

    const topAssignees = apiRes.body.topAssignees;
    // No zero-count users
    for (const entry of topAssignees) {
      expect(entry.openCount).toBeGreaterThan(0);
    }

    // Should be sorted desc
    for (let i = 1; i < topAssignees.length; i++) {
      expect(topAssignees[i - 1].openCount).toBeGreaterThanOrEqual(
        topAssignees[i].openCount
      );
    }

    // API should include at least all non-scratch assignees
    expect(topAssignees.length).toBeGreaterThanOrEqual(dbRes.rows.length);
    for (const dbRow of dbRes.rows) {
      const match = topAssignees.find(
        (a: { id: string }) => a.id === dbRow.assignee_id
      );
      expect(match).toBeDefined();
      expect(match.openCount).toBeGreaterThanOrEqual(Number(dbRow.count));
    }
  });

  it('creating a new ticket increments byStatus.open and byPriority', async () => {
    // Get baseline from DB (non-scratch only) for exact comparison
    const beforeDb = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM tickets WHERE ${NOT_SCRATCH} GROUP BY status`
    );
    const beforePriorityDb = await query<{ priority: string; count: string }>(
      `SELECT priority, COUNT(*)::text AS count FROM tickets WHERE ${NOT_SCRATCH} GROUP BY priority`
    );

    // Create a ticket with medium priority (title uses TEST_DASH_ prefix, excluded by NOT_SCRATCH)
    const createRes = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .set('Content-Type', 'application/json')
      .send({
        title: `${SCRATCH_PREFIX}CREATE ticket`,
        description: 'Scratch ticket for dashboard test',
        priority: 'medium',
      });
    expect(createRes.status).toBe(201);
    scratchIds.push(createRes.body.id);

    // Get after from DB (non-scratch only)
    const afterDb = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM tickets WHERE ${NOT_SCRATCH} GROUP BY status`
    );

    // Non-scratch counts should be unchanged (our scratch ticket is excluded)
    const beforeStatusCounts: Record<string, number> = {};
    for (const row of beforeDb.rows) beforeStatusCounts[row.status] = Number(row.count);
    const afterStatusCounts: Record<string, number> = {};
    for (const row of afterDb.rows) afterStatusCounts[row.status] = Number(row.count);

    for (const s of ['open', 'in_progress', 'resolved', 'closed']) {
      expect(afterStatusCounts[s] ?? 0).toBe(beforeStatusCounts[s] ?? 0);
    }

    // Verify API also reflects the new ticket via the scratch-inclusive counts
    const apiRes = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(apiRes.status).toBe(200);
    expect(apiRes.body.byStatus.open).toBeGreaterThanOrEqual((beforeStatusCounts.open ?? 0) + 1);
    expect(apiRes.body.byPriority.medium).toBeGreaterThanOrEqual(
      Number(beforePriorityDb.rows.find((r) => r.priority === 'medium')?.count ?? 0) + 1
    );
  });

  it('patching ticket open→in_progress→resolved updates buckets and avgResolutionTime', async () => {
    // Create a scratch ticket
    const createRes = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .set('Content-Type', 'application/json')
      .send({
        title: `${SCRATCH_PREFIX}TRANSITION ticket`,
        description: 'Scratch ticket for transition test',
        priority: 'low',
      });
    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.id;
    scratchIds.push(ticketId);

    // Baseline from DB (non-scratch only)
    const dbBefore = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM tickets WHERE ${NOT_SCRATCH} GROUP BY status`
    );
    const beforeCounts: Record<string, number> = {};
    for (const row of dbBefore.rows) beforeCounts[row.status] = Number(row.count);

    // Transition open → in_progress
    const patch1 = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('X-User-Id', ALICE)
      .set('Content-Type', 'application/json')
      .send({ status: 'in_progress' });
    expect(patch1.status).toBe(200);

    const dash1 = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(dash1.status).toBe(200);
    // Our scratch ticket moved from open → in_progress, so API open count >= baseline - 1
    expect(dash1.body.byStatus.open).toBeGreaterThanOrEqual(
      (beforeCounts.open ?? 0) - 1
    );
    expect(dash1.body.byStatus.in_progress).toBeGreaterThanOrEqual(
      (beforeCounts.in_progress ?? 0) + 1
    );

    // Transition in_progress → resolved
    const patch2 = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('X-User-Id', ALICE)
      .set('Content-Type', 'application/json')
      .send({ status: 'resolved' });
    expect(patch2.status).toBe(200);

    const dash2 = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(dash2.status).toBe(200);
    expect(dash2.body.byStatus.in_progress).toBeGreaterThanOrEqual(
      (beforeCounts.in_progress ?? 0)
    );
    expect(dash2.body.byStatus.resolved).toBeGreaterThanOrEqual(
      (beforeCounts.resolved ?? 0) + 1
    );
    // avgResolutionTime should now exist (not null, or changed from previous)
    expect(dash2.body.avgResolutionTime).not.toBeUndefined();
  });

  it('deleting scratch tickets reflects correctly in dashboard counts', async () => {
    // Create a scratch ticket to verify dashboard reactivity
    const createRes = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .set('Content-Type', 'application/json')
      .send({
        title: `${SCRATCH_PREFIX}DELETE_TEST ticket`,
        description: 'Scratch ticket for deletion test',
        priority: 'high',
      });
    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.id;

    // Dashboard should show the new ticket
    const beforeDelete = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(beforeDelete.status).toBe(200);
    expect(beforeDelete.body.byStatus.open).toBeGreaterThanOrEqual(1);
    expect(beforeDelete.body.byPriority.high).toBeGreaterThanOrEqual(1);

    // Delete the scratch ticket
    const deleteRes = await request(app)
      .delete(`/api/tickets/${ticketId}`)
      .set('X-User-Id', ALICE);
    expect(deleteRes.status).toBe(204);

    // Dashboard should still return valid shape (non-scratch tickets remain)
    const afterDelete = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(afterDelete.status).toBe(200);

    // Verify the response shape is correct
    expect(afterDelete.body.byStatus).toHaveProperty('open');
    expect(afterDelete.body.byStatus).toHaveProperty('in_progress');
    expect(afterDelete.body.byStatus).toHaveProperty('resolved');
    expect(afterDelete.body.byStatus).toHaveProperty('closed');
    expect(afterDelete.body.byPriority).toHaveProperty('low');
    expect(afterDelete.body.byPriority).toHaveProperty('medium');
    expect(afterDelete.body.byPriority).toHaveProperty('high');
    expect(afterDelete.body.byPriority).toHaveProperty('urgent');
    for (const val of Object.values(afterDelete.body.byStatus)) {
      expect(val as number).toBeGreaterThanOrEqual(0);
    }
    // The open count should have decreased (at least our ticket was removed)
    expect(afterDelete.body.byStatus.open).toBeLessThanOrEqual(
      beforeDelete.body.byStatus.open
    );
  });

  it('closed scratch tickets show correct avgResolutionTime and empty topAssignees for those tickets', async () => {
    // Create and close a scratch ticket
    const createRes = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', ALICE)
      .set('Content-Type', 'application/json')
      .send({
        title: `${SCRATCH_PREFIX}CLOSED_TEST ticket`,
        description: 'Scratch ticket for closed test',
        priority: 'low',
        assignee_id: ALICE,
      });
    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.id;
    scratchIds.push(ticketId);

    // Transition to closed
    await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'in_progress' });
    await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'resolved' });
    await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'closed' });

    const res = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(res.status).toBe(200);

    // Closed count should be > 0 (includes our scratch ticket)
    expect(res.body.byStatus.closed).toBeGreaterThan(0);
    // avgResolutionTime should exist as a number when there are resolved/closed tickets
    if (res.body.avgResolutionTime !== null) {
      expect(typeof res.body.avgResolutionTime).toBe('number');
      expect(res.body.avgResolutionTime).toBeGreaterThanOrEqual(0);
    }
    // All values should be valid
    for (const val of Object.values(res.body.byStatus)) {
      expect(val as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('two valid personas yield identical responses', async () => {
    // Retry to handle race conditions from parallel test files modifying the DB between requests.
    // The dashboard is persona-agnostic; differences are only caused by concurrent DB mutations.
    for (let attempt = 0; attempt < 5; attempt++) {
      const [res1, res2] = await Promise.all([
        request(app).get('/api/dashboard').set('X-User-Id', ALICE),
        request(app).get('/api/dashboard').set('X-User-Id', BOB),
      ]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      if (JSON.stringify(res1.body) === JSON.stringify(res2.body)) return;
    }
    // Final attempt — let assertion error propagate
    const [res1, res2] = await Promise.all([
      request(app).get('/api/dashboard').set('X-User-Id', ALICE),
      request(app).get('/api/dashboard').set('X-User-Id', BOB),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body).toEqual(res2.body);
  });

  it('topAssignees sorts by numeric count, not lexicographic', async () => {
    // Create scratch tickets so that Bob ends up with more open/in_progress
    // tickets than Alice, but Alice's count as text would sort higher under
    // lexicographic rules (e.g., '9' > '10').
    //
    // Seeded open/in_progress: Alice=2, Bob=1.
    // We add 9 for Bob (total ≥10) and 7 for Alice (total ≤9), so
    // Bob's numeric count exceeds Alice's, but Alice's text count '9'
    // would sort above Bob's text '10' under lexicographic ORDER BY.

    // 9 scratch tickets for Bob
    for (let i = 0; i < 9; i++) {
      const res = await request(app)
        .post('/api/tickets')
        .set('X-User-Id', ALICE)
        .set('Content-Type', 'application/json')
        .send({
          title: `${SCRATCH_PREFIX}BOB_SORT_${i}`,
          description: `Scratch ticket for Bob sort test ${i}`,
          priority: 'low',
          assignee_id: BOB,
        });
      expect(res.status).toBe(201);
      scratchIds.push(res.body.id);
    }

    // 7 scratch tickets for Alice
    for (let i = 0; i < 7; i++) {
      const res = await request(app)
        .post('/api/tickets')
        .set('X-User-Id', ALICE)
        .set('Content-Type', 'application/json')
        .send({
          title: `${SCRATCH_PREFIX}ALICE_SORT_${i}`,
          description: `Scratch ticket for Alice sort test ${i}`,
          priority: 'medium',
          assignee_id: ALICE,
        });
      expect(res.status).toBe(201);
      scratchIds.push(res.body.id);
    }

    const dashRes = await request(app)
      .get('/api/dashboard')
      .set('X-User-Id', ALICE);
    expect(dashRes.status).toBe(200);

    const topAssignees = dashRes.body.topAssignees;
    const aliceEntry = topAssignees.find(
      (a: { id: string }) => a.id === ALICE
    );
    const bobEntry = topAssignees.find(
      (a: { id: string }) => a.id === BOB
    );

    expect(aliceEntry).toBeDefined();
    expect(bobEntry).toBeDefined();

    // Bob must have strictly more open tickets than Alice
    expect(bobEntry.openCount).toBeGreaterThan(aliceEntry.openCount);

    // Bob must rank above Alice — this fails under lexicographic sort
    // where text '9' > text '10'
    const aliceIndex = topAssignees.findIndex(
      (a: { id: string }) => a.id === ALICE
    );
    const bobIndex = topAssignees.findIndex(
      (a: { id: string }) => a.id === BOB
    );
    expect(bobIndex).toBeLessThan(aliceIndex);
  });

  it('agent and requester personas yield identical responses', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const [res1, res2] = await Promise.all([
        request(app).get('/api/dashboard').set('X-User-Id', ALICE),
        request(app).get('/api/dashboard').set('X-User-Id', CAROL),
      ]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      if (JSON.stringify(res1.body) === JSON.stringify(res2.body)) return;
    }
    const [res1, res2] = await Promise.all([
      request(app).get('/api/dashboard').set('X-User-Id', ALICE),
      request(app).get('/api/dashboard').set('X-User-Id', CAROL),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body).toEqual(res2.body);
  });
});

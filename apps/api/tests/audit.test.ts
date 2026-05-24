import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';
interface AuditEntry {
  id: string;
  ticket_id: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

interface DetailResponse {
  id: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignee_name: string | null;
  audit_log: AuditEntry[];
}

beforeAll(async () => {
  const res = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM tickets',
  );
  if (Number(res.rows[0]?.count ?? 0) < 5) {
    throw new Error(
      'Database is not seeded. Run `npm run db:reset` before running these tests.',
    );
  }
});

beforeEach(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_AUDIT_%'");
});

afterAll(async () => {
  await pool.query("DELETE FROM tickets WHERE title LIKE 'TEST_AUDIT_%'");
  await pool.end();
});

async function createScratch(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await request(app)
    .post('/api/tickets')
    .set('X-User-Id', ALICE)
    .send({
      title: `TEST_AUDIT_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      priority: 'low',
      ...overrides,
    });
  if (res.status !== 201) {
    throw new Error(
      `Failed to seed scratch ticket: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return (res.body as { id: string }).id;
}

async function getDetail(id: string, userId = ALICE): Promise<DetailResponse> {
  const res = await request(app)
    .get(`/api/tickets/${id}`)
    .set('X-User-Id', userId);
  expect(res.status).toBe(200);
  return res.body as DetailResponse;
}

describe('Audit log: ticket creation', () => {
  it('writes a "created" audit row when a ticket is created', async () => {
    const id = await createScratch();
    const detail = await getDetail(id);

    const createdEntries = detail.audit_log.filter(
      (e) => e.action === 'created',
    );
    expect(createdEntries.length).toBe(1);
    expect(createdEntries[0]!.actor_id).toBe(ALICE);
    expect(createdEntries[0]!.actor_name).toBe('Alice Agent');
    expect(createdEntries[0]!.from_value).toBeNull();
    expect(createdEntries[0]!.to_value).toBeNull();
  });

  it('records the active persona as actor on creation', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('X-User-Id', BOB)
      .send({
        title: `TEST_AUDIT_bob_creator_${Date.now()}`,
        priority: 'low',
      });
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;

    const detail = await getDetail(id);
    const createdEntry = detail.audit_log.find((e) => e.action === 'created');
    expect(createdEntry).toBeDefined();
    expect(createdEntry!.actor_id).toBe(BOB);
    expect(createdEntry!.actor_name).toBe('Bob Agent');
  });
});

describe('Audit log: status changes', () => {
  it('writes a status_changed audit row with from/to values', async () => {
    const id = await createScratch();
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'in_progress' });

    const after = await getDetail(id);
    const newEntries = after.audit_log.slice(createdCount);
    expect(newEntries.length).toBe(1);
    expect(newEntries[0]!.action).toBe('status_changed');
    expect(newEntries[0]!.from_value).toBe('open');
    expect(newEntries[0]!.to_value).toBe('in_progress');
    expect(newEntries[0]!.actor_id).toBe(ALICE);
    expect(newEntries[0]!.actor_name).toBe('Alice Agent');
  });

  it('records the persona at the time of the status change', async () => {
    const id = await createScratch();
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', BOB)
      .send({ status: 'in_progress' });

    const after = await getDetail(id);
    const statusEntry = after.audit_log.slice(createdCount).find(
      (e) => e.action === 'status_changed',
    );
    expect(statusEntry).toBeDefined();
    expect(statusEntry!.actor_id).toBe(BOB);
    expect(statusEntry!.actor_name).toBe('Bob Agent');
  });
});

describe('Audit log: priority changes', () => {
  it('writes a priority_changed audit row with from/to values', async () => {
    const id = await createScratch({ priority: 'low' });
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ priority: 'urgent' });

    const after = await getDetail(id);
    const newEntries = after.audit_log.slice(createdCount);
    expect(newEntries.length).toBe(1);
    expect(newEntries[0]!.action).toBe('priority_changed');
    expect(newEntries[0]!.from_value).toBe('low');
    expect(newEntries[0]!.to_value).toBe('urgent');
    expect(newEntries[0]!.actor_id).toBe(ALICE);
  });
});

describe('Audit log: assignee changes', () => {
  it('writes an assignee_changed audit row with assignee names as from/to', async () => {
    const id = await createScratch({ assignee_id: ALICE });
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: BOB });

    const after = await getDetail(id);
    const newEntries = after.audit_log.slice(createdCount);
    expect(newEntries.length).toBe(1);
    expect(newEntries[0]!.action).toBe('assignee_changed');
    expect(newEntries[0]!.from_value).toBe('Alice Agent');
    expect(newEntries[0]!.to_value).toBe('Bob Agent');
  });

  it('shows "Unassigned" as from_value when changing from null assignee', async () => {
    const id = await createScratch(); // no assignee
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: BOB });

    const after = await getDetail(id);
    const newEntries = after.audit_log.slice(createdCount);
    expect(newEntries.length).toBe(1);
    expect(newEntries[0]!.action).toBe('assignee_changed');
    expect(newEntries[0]!.from_value).toBe('Unassigned');
    expect(newEntries[0]!.to_value).toBe('Bob Agent');
  });

  it('shows "Unassigned" as to_value when unassigning', async () => {
    const id = await createScratch({ assignee_id: BOB });
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: null });

    const after = await getDetail(id);
    const newEntries = after.audit_log.slice(createdCount);
    expect(newEntries.length).toBe(1);
    expect(newEntries[0]!.from_value).toBe('Bob Agent');
    expect(newEntries[0]!.to_value).toBe('Unassigned');
  });
});

describe('Audit log: rejected transitions write no row', () => {
  it('does not write an audit row for a rejected status transition', async () => {
    const id = await createScratch(); // status = open
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    // open -> resolved is not allowed
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'resolved' });
    expect(res.status).toBe(422);

    const after = await getDetail(id);
    expect(after.audit_log.length).toBe(createdCount);
  });

  it('does not write an audit row for closed -> in_progress rejection', async () => {
    const id = await createScratch();
    // open -> in_progress -> resolved -> closed
    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'in_progress' });
    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'resolved' });
    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'closed' });

    const before = await getDetail(id);
    const countBeforeReject = before.audit_log.length;

    // closed -> in_progress is not allowed
    const res = await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(422);

    const after = await getDetail(id);
    expect(after.audit_log.length).toBe(countBeforeReject);
  });
});

describe('Audit log: chronological order and multi-field changes', () => {
  it('writes multiple audit rows in chronological order after sequential changes', async () => {
    const id = await createScratch({ priority: 'low' });

    // 1) Change status as Alice
    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'in_progress' });

    // 2) Change priority as Bob
    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', BOB)
      .send({ priority: 'high' });

    // 3) Change assignee as Carol
    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', CAROL)
      .send({ assignee_id: ALICE });

    const detail = await getDetail(id);
    const log = detail.audit_log;

    // Created + 3 changes = 4 entries
    expect(log.length).toBe(4);

    // Chronological order: oldest first (ASC order from query)
    expect(log[0]!.action).toBe('created');
    expect(log[1]!.action).toBe('status_changed');
    expect(log[2]!.action).toBe('priority_changed');
    expect(log[3]!.action).toBe('assignee_changed');

    // Verify timestamps are in order
    for (let i = 1; i < log.length; i++) {
      const prev = new Date(log[i - 1]!.created_at).getTime();
      const curr = new Date(log[i]!.created_at).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }

    // Verify actors match the persona at the time of each change
    expect(log[0]!.actor_id).toBe(ALICE); // creator
    expect(log[1]!.actor_id).toBe(ALICE); // status change by Alice
    expect(log[2]!.actor_id).toBe(BOB); // priority change by Bob
    expect(log[3]!.actor_id).toBe(CAROL); // assignee change by Carol
  });

  it('writes separate audit rows when multiple fields change in one PATCH', async () => {
    const id = await createScratch({ priority: 'low' });
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'in_progress', priority: 'high', assignee_id: BOB });

    const after = await getDetail(id);
    const newEntries = after.audit_log.slice(createdCount);

    // 3 separate audit rows: status, priority, assignee
    expect(newEntries.length).toBe(3);
    const actions = newEntries.map((e) => e.action);
    expect(actions).toContain('status_changed');
    expect(actions).toContain('priority_changed');
    expect(actions).toContain('assignee_changed');
  });
});

describe('Audit log: seeded tickets have "created" entries', () => {
  const seededTicketIds = [
    'bbbbbbb1-0000-0000-0000-000000000001',
    'bbbbbbb2-0000-0000-0000-000000000002',
    'bbbbbbb3-0000-0000-0000-000000000003',
    'bbbbbbb4-0000-0000-0000-000000000004',
    'bbbbbbb5-0000-0000-0000-000000000005',
    'bbbbbbb6-0000-0000-0000-000000000006',
  ];

  const seededReporters: Record<string, string> = {
    'bbbbbbb1-0000-0000-0000-000000000001': CAROL,
    'bbbbbbb2-0000-0000-0000-000000000002': CAROL,
    'bbbbbbb3-0000-0000-0000-000000000003': CAROL,
    'bbbbbbb4-0000-0000-0000-000000000004': CAROL,
    'bbbbbbb5-0000-0000-0000-000000000005': CAROL,
    'bbbbbbb6-0000-0000-0000-000000000006': ALICE,
  };

  it('each seeded ticket has exactly one "created" audit_log row', async () => {
    const res = await pool.query<{
      ticket_id: string;
      action: string;
      actor_id: string;
    }>(
      `SELECT ticket_id, action, actor_id
       FROM audit_log
       WHERE ticket_id = ANY($1) AND action = 'created'`,
      [seededTicketIds],
    );

    const byTicket = new Map<string, { action: string; actor_id: string }[]>();
    for (const row of res.rows) {
      const arr = byTicket.get(row.ticket_id) ?? [];
      arr.push(row);
      byTicket.set(row.ticket_id, arr);
    }

    for (const id of seededTicketIds) {
      const entries = byTicket.get(id) ?? [];
      expect(entries.length, `ticket ${id} should have exactly 1 "created" audit row`).toBe(1);
    }
  });

  it('actor_id on "created" rows matches the ticket reporter_id', async () => {
    const res = await pool.query<{
      ticket_id: string;
      actor_id: string;
    }>(
      `SELECT ticket_id, actor_id
       FROM audit_log
       WHERE ticket_id = ANY($1) AND action = 'created'`,
      [seededTicketIds],
    );

    for (const row of res.rows) {
      expect(row.actor_id).toBe(seededReporters[row.ticket_id]);
    }
  });
});

describe('Audit log: unchanged fields write no row', () => {
  it('does not write a status_changed row when PATCH sends the same status', async () => {
    const id = await createScratch(); // status = open
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ status: 'open' }); // same as current

    const after = await getDetail(id);
    // Only the 'created' entry from before, no new entries
    expect(after.audit_log.length).toBe(createdCount);
  });

  it('does not write a priority_changed row when PATCH sends the same priority', async () => {
    const id = await createScratch({ priority: 'low' });
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ priority: 'low' }); // same as current

    const after = await getDetail(id);
    expect(after.audit_log.length).toBe(createdCount);
  });

  it('does not write an assignee_changed row when PATCH sends the same assignee', async () => {
    const id = await createScratch({ assignee_id: BOB });
    const before = await getDetail(id);
    const createdCount = before.audit_log.length;

    await request(app)
      .patch(`/api/tickets/${id}`)
      .set('X-User-Id', ALICE)
      .send({ assignee_id: BOB }); // same as current

    const after = await getDetail(id);
    expect(after.audit_log.length).toBe(createdCount);
  });
});

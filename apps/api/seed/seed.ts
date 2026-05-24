import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { Pool, type PoolClient } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '..', '..', '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

type Role = 'agent' | 'requester';
type Status = 'open' | 'in_progress' | 'resolved' | 'closed';
type Priority = 'low' | 'medium' | 'high' | 'urgent';

type SeedUser = { id: string; name: string; email: string; role: Role };
type SeedTag = { id: string; name: string; color: string };
type SeedTicket = {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  reporterId: string;
  assigneeId: string | null;
  createdHoursAgo: number;
  resolvedHoursAgo: number | null;
  tagIds: string[];
};
type SeedComment = {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdHoursAgo: number;
};

const users: SeedUser[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Alice Agent',
    email: 'alice@example.com',
    role: 'agent',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Bob Agent',
    email: 'bob@example.com',
    role: 'agent',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Carol Requester',
    email: 'carol@example.com',
    role: 'requester',
  },
];

const tags: SeedTag[] = [
  { id: 'aaaaaaa1-0000-0000-0000-000000000001', name: 'bug', color: '#dc2626' },
  { id: 'aaaaaaa2-0000-0000-0000-000000000002', name: 'feature', color: '#2563eb' },
  { id: 'aaaaaaa3-0000-0000-0000-000000000003', name: 'ux', color: '#7c3aed' },
  { id: 'aaaaaaa4-0000-0000-0000-000000000004', name: 'backend', color: '#0f766e' },
  { id: 'aaaaaaa5-0000-0000-0000-000000000005', name: 'urgent', color: '#ea580c' },
];

const alice = users[0]!;
const bob = users[1]!;
const carol = users[2]!;
const tagBug = tags[0]!;
const tagFeature = tags[1]!;
const tagUx = tags[2]!;
const tagBackend = tags[3]!;
const tagUrgent = tags[4]!;

const tickets: SeedTicket[] = [
  {
    id: 'bbbbbbb1-0000-0000-0000-000000000001',
    title: 'Login button does nothing on Safari',
    description: 'Clicking Sign in on Safari 17 produces no network request and no error in console.',
    status: 'open',
    priority: 'urgent',
    reporterId: carol.id,
    assigneeId: null,
    createdHoursAgo: 2,
    resolvedHoursAgo: null,
    tagIds: [tagBug.id, tagUrgent.id],
  },
  {
    id: 'bbbbbbb2-0000-0000-0000-000000000002',
    title: 'Password reset email never arrives',
    description: 'Customers report the password reset email is missing even after retrying. Affects ~10 reports this week.',
    status: 'open',
    priority: 'high',
    reporterId: carol.id,
    assigneeId: alice.id,
    createdHoursAgo: 120,
    resolvedHoursAgo: null,
    tagIds: [tagBug.id, tagBackend.id],
  },
  {
    id: 'bbbbbbb3-0000-0000-0000-000000000003',
    title: 'Dashboard loads slowly with many tickets',
    description: 'When a workspace has more than ~200 tickets, the dashboard takes 5+ seconds to render.',
    status: 'in_progress',
    priority: 'medium',
    reporterId: carol.id,
    assigneeId: alice.id,
    createdHoursAgo: 30,
    resolvedHoursAgo: null,
    tagIds: [tagBackend.id],
  },
  {
    id: 'bbbbbbb4-0000-0000-0000-000000000004',
    title: 'Add dark mode toggle',
    description: 'Several customers asked for a dark theme; toggle should live in the header next to the persona dropdown.',
    status: 'in_progress',
    priority: 'low',
    reporterId: carol.id,
    assigneeId: bob.id,
    createdHoursAgo: 48,
    resolvedHoursAgo: null,
    tagIds: [tagFeature.id, tagUx.id],
  },
  {
    id: 'bbbbbbb5-0000-0000-0000-000000000005',
    title: 'Fix typo on signup confirmation page',
    description: 'The confirmation page says "Welcom" instead of "Welcome".',
    status: 'resolved',
    priority: 'low',
    reporterId: carol.id,
    assigneeId: bob.id,
    createdHoursAgo: 96,
    resolvedHoursAgo: 6,
    tagIds: [tagBug.id, tagUx.id],
  },
  {
    id: 'bbbbbbb6-0000-0000-0000-000000000006',
    title: 'Investigate OAuth token expiry crash',
    description: 'Stack trace shows the API server crashed when an OAuth refresh token expired mid-request. Restarted manually.',
    status: 'closed',
    priority: 'high',
    reporterId: alice.id,
    assigneeId: alice.id,
    createdHoursAgo: 240,
    resolvedHoursAgo: 72,
    tagIds: [tagBug.id, tagBackend.id, tagUrgent.id],
  },
];

const comments: SeedComment[] = [
  {
    id: 'ccccccc1-0000-0000-0000-000000000001',
    ticketId: tickets[0]!.id,
    authorId: alice.id,
    body: 'I can reproduce on Safari 17 — looks like a JS error swallowed by an event handler.',
    createdHoursAgo: 1,
  },
  {
    id: 'ccccccc2-0000-0000-0000-000000000002',
    ticketId: tickets[0]!.id,
    authorId: carol.id,
    body: 'Thanks Alice! Let me know if you need additional reproduction steps.',
    createdHoursAgo: 0,
  },
  {
    id: 'ccccccc3-0000-0000-0000-000000000003',
    ticketId: tickets[2]!.id,
    authorId: bob.id,
    body: 'I added an index on tickets.status; need to benchmark before/after.',
    createdHoursAgo: 4,
  },
];

async function wipe(client: PoolClient) {
  await client.query(
    'TRUNCATE audit_log, ticket_tags, comments, tickets, tags, users RESTART IDENTITY CASCADE'
  );
}

async function insertUsers(client: PoolClient) {
  for (const u of users) {
    await client.query(
      'INSERT INTO users (id, name, email, role) VALUES ($1, $2, $3, $4)',
      [u.id, u.name, u.email, u.role]
    );
  }
}

async function insertTags(client: PoolClient) {
  for (const t of tags) {
    await client.query(
      'INSERT INTO tags (id, name, color) VALUES ($1, $2, $3)',
      [t.id, t.name, t.color]
    );
  }
}

async function insertTickets(client: PoolClient) {
  for (const t of tickets) {
    await client.query(
      `INSERT INTO tickets (
         id, title, description, status, priority,
         reporter_id, assignee_id,
         created_at, updated_at, resolved_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7,
         now() - make_interval(hours => $8::int),
         now() - make_interval(hours => $8::int),
         now() - make_interval(hours => $9::int)
       )`,
      [
        t.id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.reporterId,
        t.assigneeId,
        t.createdHoursAgo,
        t.resolvedHoursAgo,
      ]
    );

    for (const tagId of t.tagIds) {
      await client.query(
        'INSERT INTO ticket_tags (ticket_id, tag_id) VALUES ($1, $2)',
        [t.id, tagId]
      );
    }
  }
}

async function insertComments(client: PoolClient) {
  for (const c of comments) {
    await client.query(
      `INSERT INTO comments (id, ticket_id, author_id, body, created_at)
       VALUES ($1, $2, $3, $4, now() - make_interval(hours => $5))`,
      [c.id, c.ticketId, c.authorId, c.body, c.createdHoursAgo]
    );
  }
}

async function insertAuditEntries(client: PoolClient) {
  for (const t of tickets) {
    await client.query(
      `INSERT INTO audit_log (ticket_id, actor_id, action, from_value, to_value, created_at)
       VALUES ($1, $2, 'created', NULL, NULL, now() - make_interval(hours => $3))`,
      [t.id, t.reporterId, t.createdHoursAgo]
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await wipe(client);
    await insertUsers(client);
    await insertTags(client);
    await insertTickets(client);
    await insertComments(client);
    await insertAuditEntries(client);
    await client.query('COMMIT');
    process.stdout.write(
      `[seed] inserted ${users.length} users, ${tickets.length} tickets, ${tags.length} tags, ${comments.length} comments, ${tickets.length} audit entries\n`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

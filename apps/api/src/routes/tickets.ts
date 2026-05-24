import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { writeAudit } from '../domain/audit.js';
import {
  isAllowedTransition,
  type TicketStatus,
} from '../domain/ticketStatus.js';
import { computeSla } from '../domain/sla.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requirePersona } from '../middleware/persona.js';
import { createTicketSchema, updateTicketSchema } from '../schemas/tickets.js';

export const ticketsRouter: Router = Router();

interface BaseTicketRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  reporter_id: string;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

interface TicketListRow extends BaseTicketRow {
  tags: string[];
  comment_count: number;
}

function addSlaFields<T extends { priority: string; created_at: Date; resolved_at: Date | null }>(
  row: T
): T & { sla_target_hours: number; sla_remaining_seconds: number; sla_breached: boolean } {
  const sla = computeSla(row.priority, row.created_at, row.resolved_at);
  return { ...row, ...sla };
}

const STATUS_VALUES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FilterIssue {
  param: string;
  message: string;
}

interface ParsedFilters {
  status?: (typeof STATUS_VALUES)[number];
  priority?: (typeof PRIORITY_VALUES)[number];
  assignee?: string;
  tag?: string;
  q?: string;
}

function singleString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseFilters(
  raw: Record<string, unknown>
): { filters: ParsedFilters; issues: FilterIssue[] } {
  const issues: FilterIssue[] = [];
  const filters: ParsedFilters = {};

  const status = singleString(raw.status);
  if (status !== undefined) {
    if ((STATUS_VALUES as readonly string[]).includes(status)) {
      filters.status = status as ParsedFilters['status'];
    } else {
      issues.push({
        param: 'status',
        message: `status must be one of ${STATUS_VALUES.join(', ')}`,
      });
    }
  }

  const priority = singleString(raw.priority);
  if (priority !== undefined) {
    if ((PRIORITY_VALUES as readonly string[]).includes(priority)) {
      filters.priority = priority as ParsedFilters['priority'];
    } else {
      issues.push({
        param: 'priority',
        message: `priority must be one of ${PRIORITY_VALUES.join(', ')}`,
      });
    }
  }

  const assignee = singleString(raw.assignee);
  if (assignee !== undefined) {
    if (UUID_RE.test(assignee)) {
      filters.assignee = assignee;
    } else {
      issues.push({
        param: 'assignee',
        message: 'assignee must be a UUID',
      });
    }
  }

  const tag = singleString(raw.tag);
  if (tag !== undefined) {
    filters.tag = tag;
  }

  const q = singleString(raw.q);
  if (q !== undefined) {
    filters.q = q;
  }

  return { filters, issues };
}

function buildListQuery(filters: ParsedFilters): {
  text: string;
  params: unknown[];
} {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (filters.status !== undefined) {
    params.push(filters.status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (filters.priority !== undefined) {
    params.push(filters.priority);
    conditions.push(`t.priority = $${params.length}`);
  }
  if (filters.assignee !== undefined) {
    params.push(filters.assignee);
    conditions.push(`t.assignee_id = $${params.length}`);
  }
  if (filters.tag !== undefined) {
    params.push(filters.tag);
    conditions.push(`ftg.name = $${params.length}`);
  }
  if (filters.q !== undefined) {
    params.push(`%${filters.q}%`);
    conditions.push(
      `(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`
    );
  }

  const where =
    conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;

  const tagJoin =
    filters.tag !== undefined
      ? `JOIN ticket_tags ftt ON ftt.ticket_id = t.id
         JOIN tags ftg ON ftg.id = ftt.tag_id`
      : '';

  const text = `
    SELECT
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.reporter_id,
      t.assignee_id,
      u.name AS assignee_name,
      t.created_at,
      t.updated_at,
      t.resolved_at
    FROM tickets t
    LEFT JOIN users u ON u.id = t.assignee_id
    ${tagJoin}
    ${where}
    ORDER BY t.created_at DESC
  `;

  return { text, params };
}

ticketsRouter.get('/', requirePersona, async (req, res, next) => {
  try {
    const { filters, issues } = parseFilters(
      req.query as Record<string, unknown>
    );
    if (issues.length > 0) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'One or more filter parameters are invalid.',
        issues
      );
    }
    const { text, params } = buildListQuery(filters);
    const result = await query<BaseTicketRow>(text, params);

    const tickets: TicketListRow[] = [];
    for (const row of result.rows) {
      const tagsResult = await query<{ name: string }>(
        `SELECT tg.name FROM ticket_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.ticket_id = $1`,
        [row.id]
      );
      const tags = tagsResult.rows.map((r) => r.name);

      const countResult = await query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM comments WHERE ticket_id = $1`,
        [row.id]
      );
      const comment_count = countResult.rows[0]?.count ?? 0;

      tickets.push({ ...row, tags, comment_count });
    }

    res.json(tickets.map(addSlaFields));
  } catch (err) {
    next(err);
  }
});

const SELECT_TICKET_BY_ID = `
  SELECT
    t.id,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.reporter_id,
    t.assignee_id,
    u.name AS assignee_name,
    t.created_at,
    t.updated_at,
    t.resolved_at,
    COALESCE(
      ARRAY_AGG(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL),
      ARRAY[]::text[]
    ) AS tags,
    COALESCE(cc.comment_count, 0)::int AS comment_count
  FROM tickets t
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN ticket_tags tt ON tt.ticket_id = t.id
  LEFT JOIN tags tg ON tg.id = tt.tag_id
  LEFT JOIN (
    SELECT ticket_id, COUNT(*) AS comment_count
    FROM comments
    GROUP BY ticket_id
  ) cc ON cc.ticket_id = t.id
  WHERE t.id = $1
  GROUP BY t.id, u.name, cc.comment_count
`;

ticketsRouter.post('/', requirePersona, async (req, res, next) => {
  try {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Ticket payload is invalid.',
        parsed.error.issues.map((issue: z.ZodIssue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }

    const reporter = req.user!;
    const { title, description, priority, status, assignee_id, tags } =
      parsed.data;
    const trimmedTitle = title.trim();
    const finalDescription = description ?? '';
    const finalStatus = status ?? 'open';
    const finalAssigneeId = assignee_id ?? null;
    const tagIds = tags ?? [];

    if (finalAssigneeId !== null) {
      const userResult = await query<{ id: string }>(
        'SELECT id FROM users WHERE id = $1',
        [finalAssigneeId]
      );
      if (userResult.rows.length === 0) {
        throw new ApiError(
          400,
          'VALIDATION_FAILED',
          'assignee_id does not reference a known user.',
          [{ path: 'assignee_id', message: 'Unknown user id.' }]
        );
      }
    }

    if (tagIds.length > 0) {
      const tagResult = await query<{ id: string }>(
        'SELECT id FROM tags WHERE id = ANY($1::uuid[])',
        [tagIds]
      );
      if (tagResult.rows.length !== new Set(tagIds).size) {
        throw new ApiError(
          400,
          'VALIDATION_FAILED',
          'One or more tag ids do not reference a known tag.',
          [{ path: 'tags', message: 'Unknown tag id.' }]
        );
      }
    }

    const newId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO tickets (title, description, status, priority, reporter_id, assignee_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          trimmedTitle,
          finalDescription,
          finalStatus,
          priority,
          reporter.id,
          finalAssigneeId,
        ]
      );
      const id = inserted.rows[0]!.id;
      for (const tagId of new Set(tagIds)) {
        await client.query(
          'INSERT INTO ticket_tags (ticket_id, tag_id) VALUES ($1, $2)',
          [id, tagId]
        );
      }
      await writeAudit({
        client,
        ticket_id: id,
        actor_id: reporter.id,
        action: 'created',
      });
      return id;
    });

    const created = await query<TicketListRow>(SELECT_TICKET_BY_ID, [newId]);
    res.status(201).json(addSlaFields(created.rows[0]!));
  } catch (err) {
    next(err);
  }
});

interface TicketDetailRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  reporter_id: string;
  reporter_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  tags: string[];
}

interface CommentRow {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: Date;
}

interface AuditRow {
  id: string;
  ticket_id: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  created_at: Date;
}

const SELECT_TICKET_DETAIL_BY_ID = `
  SELECT
    t.id,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.reporter_id,
    r.name AS reporter_name,
    t.assignee_id,
    u.name AS assignee_name,
    t.created_at,
    t.updated_at,
    t.resolved_at,
    COALESCE(
      ARRAY_AGG(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL),
      ARRAY[]::text[]
    ) AS tags
  FROM tickets t
  LEFT JOIN users r ON r.id = t.reporter_id
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN ticket_tags tt ON tt.ticket_id = t.id
  LEFT JOIN tags tg ON tg.id = tt.tag_id
  WHERE t.id = $1
  GROUP BY t.id, r.name, u.name
`;

async function loadTicketDetail(id: string): Promise<{
  ticket: TicketDetailRow;
  comments: CommentRow[];
  audit_log: AuditRow[];
} | null> {
  const ticketResult = await query<TicketDetailRow>(
    SELECT_TICKET_DETAIL_BY_ID,
    [id]
  );
  const ticket = ticketResult.rows[0];
  if (!ticket) {
    return null;
  }

  const commentsResult = await query<CommentRow>(
    `SELECT c.id, c.ticket_id, c.author_id, u.name AS author_name, c.body, c.created_at
     FROM comments c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.ticket_id = $1
     ORDER BY c.created_at ASC`,
    [id]
  );

  const auditResult = await query<AuditRow>(
    `SELECT a.id, a.ticket_id, a.actor_id, u.name AS actor_name, a.action,
            a.from_value, a.to_value, a.created_at
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.ticket_id = $1
     ORDER BY a.created_at ASC`,
    [id]
  );

  return {
    ticket,
    comments: commentsResult.rows,
    audit_log: auditResult.rows,
  };
}

ticketsRouter.get('/:id', requirePersona, async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    if (!UUID_RE.test(id)) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }
    const detail = await loadTicketDetail(id);
    if (!detail) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }
    const ticketWithSla = addSlaFields(detail.ticket);
    res.json({
      ...ticketWithSla,
      comments: detail.comments,
      audit_log: detail.audit_log,
    });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/:id', requirePersona, async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    if (!UUID_RE.test(id)) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Ticket payload is invalid.',
        parsed.error.issues.map((issue: z.ZodIssue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }

    const data = parsed.data;
    const existing = await query<{
      id: string;
      status: TicketStatus;
      priority: string;
      assignee_id: string | null;
      old_assignee_name: string | null;
    }>(
      `SELECT t.id, t.status, t.priority, t.assignee_id,
              oa.name AS old_assignee_name
       FROM tickets t
       LEFT JOIN users oa ON oa.id = t.assignee_id
       WHERE t.id = $1`,
      [id],
    );
    if (existing.rows.length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    const current = existing.rows[0]!;
    const currentStatus = current.status;
    const currentPriority = current.priority;
    const currentAssigneeId = current.assignee_id;
    const currentAssigneeName = current.old_assignee_name;

    if (data.status !== undefined && data.status !== currentStatus) {
      if (!isAllowedTransition(currentStatus, data.status)) {
        throw new ApiError(
          422,
          'INVALID_TRANSITION',
          `Status cannot transition from ${currentStatus} to ${data.status}.`,
          [
            {
              path: 'status',
              message: `Cannot transition from ${currentStatus} to ${data.status}.`,
            },
          ]
        );
      }
    }

    let newAssigneeName: string | null | undefined;
    if (data.assignee_id !== undefined && data.assignee_id !== null) {
      const userResult = await query<{ id: string; name: string }>(
        'SELECT id, name FROM users WHERE id = $1',
        [data.assignee_id],
      );
      if (userResult.rows.length === 0) {
        throw new ApiError(
          400,
          'VALIDATION_FAILED',
          'assignee_id does not reference a known user.',
          [{ path: 'assignee_id', message: 'Unknown user id.' }],
        );
      }
      newAssigneeName = userResult.rows[0]!.name;
    } else if (data.assignee_id === null) {
      newAssigneeName = null;
    }

    const tagIds = data.tags;
    if (tagIds !== undefined && tagIds.length > 0) {
      const tagResult = await query<{ id: string }>(
        'SELECT id FROM tags WHERE id = ANY($1::uuid[])',
        [tagIds]
      );
      if (tagResult.rows.length !== new Set(tagIds).size) {
        throw new ApiError(
          400,
          'VALIDATION_FAILED',
          'One or more tag ids do not reference a known tag.',
          [{ path: 'tags', message: 'Unknown tag id.' }]
        );
      }
    }

    const actor = req.user!;

    await withTransaction(async (client) => {
      const sets: string[] = [];
      const params: unknown[] = [];

      if (data.title !== undefined) {
        params.push(data.title.trim());
        sets.push(`title = $${params.length}`);
      }
      if (data.description !== undefined) {
        params.push(data.description);
        sets.push(`description = $${params.length}`);
      }
      if (data.priority !== undefined) {
        params.push(data.priority);
        sets.push(`priority = $${params.length}`);
      }
      if (data.status !== undefined) {
        params.push(data.status);
        sets.push(`status = $${params.length}`);
        if (data.status === 'resolved' && currentStatus !== 'resolved') {
          sets.push('resolved_at = now()');
        } else if (data.status !== 'resolved' && data.status !== 'closed') {
          sets.push('resolved_at = NULL');
        }
      }
      if (data.assignee_id !== undefined) {
        params.push(data.assignee_id);
        sets.push(`assignee_id = $${params.length}`);
      }

      if (sets.length > 0) {
        sets.push('updated_at = now()');
        params.push(id);
        await client.query(
          `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params
        );
      }

      if (tagIds !== undefined) {
        await client.query('DELETE FROM ticket_tags WHERE ticket_id = $1', [id]);
        for (const tagId of new Set(tagIds)) {
          await client.query(
            'INSERT INTO ticket_tags (ticket_id, tag_id) VALUES ($1, $2)',
            [id, tagId]
          );
        }
      }

      // Audit log writes for changed fields
      if (data.status !== undefined && data.status !== currentStatus) {
        await writeAudit({
          client,
          ticket_id: id,
          actor_id: actor.id,
          action: 'status_changed',
          from: currentStatus,
          to: data.status,
        });
      }

      if (data.priority !== undefined && data.priority !== currentPriority) {
        await writeAudit({
          client,
          ticket_id: id,
          actor_id: actor.id,
          action: 'priority_changed',
          from: currentPriority,
          to: data.priority,
        });
      }

      if (data.assignee_id !== undefined && data.assignee_id !== currentAssigneeId) {
        const fromName = currentAssigneeName ?? 'Unassigned';
        const toName = data.assignee_id === null
          ? 'Unassigned'
          : newAssigneeName ?? 'Unassigned';
        await writeAudit({
          client,
          ticket_id: id,
          actor_id: actor.id,
          action: 'assignee_changed',
          from: fromName,
          to: toName,
        });
      }
    });

    const detail = await loadTicketDetail(id);
    if (!detail) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }
    const ticketWithSla = addSlaFields(detail.ticket);
    res.json({
      ...ticketWithSla,
      comments: detail.comments,
      audit_log: detail.audit_log,
    });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete('/:id', requirePersona, async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    if (!UUID_RE.test(id)) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }
    const result = await query<{ id: string }>(
      'DELETE FROM tickets WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ── Tag association endpoints ──────────────────────────────────────── */

const addTagSchema = z.object({
  tag_id: z
    .string()
    .refine((v) => UUID_RE.test(v), { message: 'tag_id must be a valid UUID.' }),
});

ticketsRouter.post('/:id/tags', requirePersona, async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    if (!UUID_RE.test(id)) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    const parsed = addTagSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Tag payload is invalid.',
        parsed.error.issues.map((issue: z.ZodIssue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }

    const { tag_id } = parsed.data;

    const ticketExists = await query<{ id: string }>(
      'SELECT id FROM tickets WHERE id = $1',
      [id]
    );
    if (ticketExists.rows.length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    const tagExists = await query<{ id: string }>(
      'SELECT id FROM tags WHERE id = $1',
      [tag_id]
    );
    if (tagExists.rows.length === 0) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'tag_id does not reference a known tag.',
        [{ path: 'tag_id', message: 'Unknown tag id.' }]
      );
    }

    await query(
      `INSERT INTO ticket_tags (ticket_id, tag_id) VALUES ($1, $2)
       ON CONFLICT (ticket_id, tag_id) DO NOTHING`,
      [id, tag_id]
    );

    const detail = await loadTicketDetail(id);
    if (!detail) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }
    const ticketWithSla = addSlaFields(detail.ticket);
    res.json({
      ...ticketWithSla,
      comments: detail.comments,
      audit_log: detail.audit_log,
    });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete('/:id/tags/:tagId', requirePersona, async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    const tagId = req.params.tagId ?? '';
    if (!UUID_RE.test(id)) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }
    if (!UUID_RE.test(tagId)) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'tagId must be a valid UUID.');
    }

    const ticketExists = await query<{ id: string }>(
      'SELECT id FROM tickets WHERE id = $1',
      [id]
    );
    if (ticketExists.rows.length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    await query(
      'DELETE FROM ticket_tags WHERE ticket_id = $1 AND tag_id = $2',
      [id, tagId]
    );

    const detail = await loadTicketDetail(id);
    if (!detail) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }
    const ticketWithSla = addSlaFields(detail.ticket);
    res.json({
      ...ticketWithSla,
      comments: detail.comments,
      audit_log: detail.audit_log,
    });
  } catch (err) {
    next(err);
  }
});

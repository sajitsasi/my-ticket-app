import { Router } from 'express';
import { query } from '../db.js';
import { requirePersona } from '../middleware/persona.js';
import { computeSla } from '../domain/sla.js';

export const dashboardRouter = Router();

dashboardRouter.use(requirePersona);

interface StatusRow {
  status: string;
  count: string;
}

interface PriorityRow {
  priority: string;
  count: string;
}

interface AvgRow {
  avg_seconds: string | null;
}

interface AssigneeRow {
  assignee_id: string;
  assignee_name: string;
  count: string;
}

interface TicketRow {
  id: string;
  priority: string;
  created_at: Date;
  resolved_at: Date | null;
  status: string;
}

const ALL_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const ALL_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

dashboardRouter.get('/', async (_req, res, next) => {
  try {
    // byStatus
    const statusRes = await query<StatusRow>(
      'SELECT status, COUNT(*)::text AS count FROM tickets GROUP BY status'
    );
    const byStatus: Record<string, number> = {};
    for (const s of ALL_STATUSES) {
      byStatus[s] = 0;
    }
    for (const row of statusRes.rows) {
      byStatus[row.status] = Number(row.count);
    }

    // byPriority
    const priorityRes = await query<PriorityRow>(
      'SELECT priority, COUNT(*)::text AS count FROM tickets GROUP BY priority'
    );
    const byPriority: Record<string, number> = {};
    for (const p of ALL_PRIORITIES) {
      byPriority[p] = 0;
    }
    for (const row of priorityRes.rows) {
      byPriority[row.priority] = Number(row.count);
    }

    // avgResolutionTime
    const avgRes = await query<AvgRow>(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))::text AS avg_seconds
       FROM tickets
       WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL`
    );
    const avgResolutionTime: number | null =
      avgRes.rows[0]?.avg_seconds === null
        ? null
        : Number(avgRes.rows[0]?.avg_seconds);

    // slaBreachCount — recompute using domain/sla.ts
    const ticketsRes = await query<TicketRow>(
      'SELECT id, priority, created_at, resolved_at, status FROM tickets'
    );
    const now = new Date();
    let slaBreachCount = 0;
    for (const t of ticketsRes.rows) {
      const sla = computeSla(t.priority, t.created_at, t.resolved_at, now);
      if (sla.sla_breached) {
        slaBreachCount++;
      }
    }

    // topAssignees — users with open/in_progress tickets, sorted desc
    const assigneeRes = await query<AssigneeRow>(
      `SELECT t.assignee_id, u.name AS assignee_name, COUNT(*)::text AS count
       FROM tickets t
       JOIN users u ON u.id = t.assignee_id
       WHERE t.status IN ('open', 'in_progress') AND t.assignee_id IS NOT NULL
       GROUP BY t.assignee_id, u.name
       ORDER BY COUNT(*) DESC`
    );
    const topAssignees = assigneeRes.rows.map((row) => ({
      id: row.assignee_id,
      name: row.assignee_name,
      openCount: Number(row.count),
    }));

    res.json({
      byStatus,
      byPriority,
      avgResolutionTime,
      slaBreachCount,
      topAssignees,
    });
  } catch (err) {
    next(err);
  }
});

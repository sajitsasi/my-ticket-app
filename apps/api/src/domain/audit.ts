import type { PoolClient } from 'pg';

export type AuditAction =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assignee_changed';

export interface WriteAuditParams {
  client: PoolClient;
  ticket_id: string;
  actor_id: string;
  action: AuditAction;
  from?: string | null;
  to?: string | null;
}

export async function writeAudit({
  client,
  ticket_id,
  actor_id,
  action,
  from = null,
  to = null,
}: WriteAuditParams): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (ticket_id, actor_id, action, from_value, to_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticket_id, actor_id, action, from, to],
  );
}

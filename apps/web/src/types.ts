export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
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

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface TicketAuditEntry {
  id: string;
  ticket_id: string;
  actor_id: string;
  actor_name: string | null;
  action: 'status_changed' | 'assignee_changed' | 'priority_changed' | 'created';
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export interface TicketDetail {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  reporter_id: string;
  reporter_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  tags: string[];
  comments: TicketComment[];
  audit_log: TicketAuditEntry[];
  sla_target_hours: number;
  sla_remaining_seconds: number;
  sla_breached: boolean;
}

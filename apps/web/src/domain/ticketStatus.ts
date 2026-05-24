import type { TicketStatus } from '../types';

const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

export function nextStatuses(current: TicketStatus): readonly TicketStatus[] {
  return ALLOWED_TRANSITIONS[current];
}

export function isAllowedTransition(
  from: TicketStatus,
  to: TicketStatus
): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

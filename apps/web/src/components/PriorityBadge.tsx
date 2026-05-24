import type { TicketPriority } from '../types';

const LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

interface PriorityBadgeProps {
  priority: TicketPriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`priority-badge priority-${priority}`}
      data-priority={priority}
    >
      {LABELS[priority]}
    </span>
  );
}

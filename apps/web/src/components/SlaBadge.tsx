import type { TicketStatus } from '../types';

interface SlaBadgeProps {
  status: TicketStatus;
  sla_target_hours: number;
  sla_remaining_seconds: number;
  sla_breached: boolean;
}

export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function SlaBadge({
  status,
  sla_target_hours: _slaTargetHours,
  sla_remaining_seconds,
  sla_breached,
}: SlaBadgeProps) {
  const isResolved = status === 'resolved' || status === 'closed';

  if (isResolved) {
    if (sla_breached) {
      return (
        <span
          className="sla-badge sla-breached"
          data-testid="sla-badge"
          data-sla-state="breached"
          aria-label="SLA breached"
        >
          Breached
        </span>
      );
    }
    return (
      <span
        className="sla-badge sla-met"
        data-testid="sla-badge"
        data-sla-state="met"
        aria-label="SLA met"
      >
        Met
      </span>
    );
  }

  if (sla_breached) {
    return (
      <span
        className="sla-badge sla-breached"
        data-testid="sla-badge"
        data-sla-state="breached"
        aria-label="SLA breached"
      >
        Breached
      </span>
    );
  }

  return (
    <span
      className="sla-badge sla-countdown"
      data-testid="sla-badge"
      data-sla-state="countdown"
      aria-label={`${formatRemaining(sla_remaining_seconds)} remaining`}
    >
      {formatRemaining(sla_remaining_seconds)}
    </span>
  );
}

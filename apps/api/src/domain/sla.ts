export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low';

export const SLA_TARGET_HOURS: Record<TicketPriority, number> = {
  urgent: 4,
  high: 8,
  medium: 24,
  low: 72,
};

export interface SlaResult {
  sla_target_hours: number;
  sla_remaining_seconds: number;
  sla_breached: boolean;
}

const HOUR_IN_SECONDS = 3600;

export function computeSla(
  priority: string,
  createdAt: Date,
  resolvedAt: Date | null,
  now: Date = new Date()
): SlaResult {
  const targetHours = (SLA_TARGET_HOURS as Record<string, number>)[priority] ?? 0;
  const targetSeconds = targetHours * HOUR_IN_SECONDS;

  const referenceDate = resolvedAt ?? now;
  const elapsedSeconds = Math.floor(
    (referenceDate.getTime() - createdAt.getTime()) / 1000
  );
  const remainingSeconds = targetSeconds - elapsedSeconds;

  return {
    sla_target_hours: targetHours,
    sla_remaining_seconds: remainingSeconds,
    sla_breached: elapsedSeconds >= targetSeconds,
  };
}

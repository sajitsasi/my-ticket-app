import { useId } from 'react';
import { nextStatuses } from '../domain/ticketStatus';
import type { TicketStatus } from '../types';

const LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

interface StatusBadgeProps {
  status: TicketStatus;
  onChange?: (next: TicketStatus) => void;
  disabled?: boolean;
}

export function StatusBadge({ status, onChange, disabled }: StatusBadgeProps) {
  const selectId = useId();
  const next = nextStatuses(status);
  const showSelect = onChange !== undefined && next.length > 0;

  return (
    <span className="status-badge-control">
      <span
        className={`status-badge status-${status}`}
        data-status={status}
        data-testid="status-badge-label"
      >
        {LABELS[status]}
      </span>
      {showSelect ? (
        <>
          <label htmlFor={selectId} className="visually-hidden">
            Change status
          </label>
          <select
            id={selectId}
            className="status-badge-select"
            aria-label="Change status"
            value=""
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value as TicketStatus | '';
              event.target.value = '';
              if (value && value !== status) {
                onChange(value);
              }
            }}
          >
            <option value="" disabled>
              Change status…
            </option>
            {next.map((s) => (
              <option key={s} value={s}>
                {LABELS[s]}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </span>
  );
}

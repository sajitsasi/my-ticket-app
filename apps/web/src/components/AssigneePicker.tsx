import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import type { TicketDetail } from '../types';

interface UserSummary {
  id: string;
  name: string;
}

interface AssigneePickerProps {
  ticketId: string;
  assigneeId: string | null;
  onAssigneeChange: (updatedTicket: TicketDetail) => void;
}

export function AssigneePicker({
  ticketId,
  assigneeId,
  onAssigneeChange,
}: AssigneePickerProps) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UserSummary[]>('/api/users')
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch(() => {
        /* dropdown stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChange(newAssigneeId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const resolvedId = newAssigneeId.length > 0 ? newAssigneeId : null;
    try {
      const updated = await apiFetch<TicketDetail>(
        `/api/tickets/${ticketId}`,
        {
          method: 'PATCH',
          body: { assignee_id: resolvedId },
        },
      );
      onAssigneeChange(updated);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to change assignee.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assignee-picker" data-testid="assignee-picker">
      <select
        aria-label="Assignee"
        value={assigneeId ?? ''}
        onChange={(event) => handleChange(event.target.value)}
        disabled={busy}
      >
        <option value="">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="assignee-picker-error">
          {error}
        </p>
      )}
    </div>
  );
}

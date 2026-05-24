import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { apiFetch } from '../api';
import { personaStore, usePersonaId } from '../personaStore';

interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface HeaderProps {
  initialUsers: UserSummary[];
}

export function Header({ initialUsers }: HeaderProps) {
  const personaId = usePersonaId();
  const [users, setUsers] = useState<UserSummary[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);

  async function refreshUsers(): Promise<void> {
    if (!personaStore.getId()) {
      return;
    }
    try {
      const data = await apiFetch<UserSummary[]>('/api/users');
      setUsers(data);
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to refresh users';
      setError(message);
    }
  }

  const activeUser = users.find((u) => u.id === personaId);
  const activeLabel = activeUser?.name ?? 'Select persona';

  return (
    <header className="app-header">
      <span className="brand">Ticket App</span>
      <nav aria-label="Primary">
        <NavLink to="/" end>
          Tickets
        </NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/tickets/new">New Ticket</NavLink>
      </nav>
      <div className="persona-control">
        <label htmlFor="persona-select">Persona:</label>
        <span data-testid="active-persona-label" className="persona-label">
          {activeLabel}
        </span>
        <select
          id="persona-select"
          aria-label="Persona"
          value={personaId ?? ''}
          onFocus={() => {
            void refreshUsers();
          }}
          onChange={(event) => personaStore.setId(event.target.value)}
          disabled={users.length === 0}
        >
          {users.length === 0 ? (
            <option value="">Loading…</option>
          ) : (
            users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))
          )}
        </select>
        {error ? (
          <span role="alert" className="persona-error">
            {error}
          </span>
        ) : null}
      </div>
    </header>
  );
}

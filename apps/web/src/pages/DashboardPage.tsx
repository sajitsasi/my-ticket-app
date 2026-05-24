import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

interface DashboardData {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  avgResolutionTime: number | null;
  slaBreachCount: number;
  topAssignees: { id: string; name: string; openCount: number }[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: DashboardData }
  | { status: 'error'; message: string };

const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed'] as const;
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'] as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function DashboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch<DashboardData>('/api/dashboard')
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load dashboard';
          setState({ status: 'error', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <section aria-labelledby="dashboard-heading">
        <h1 id="dashboard-heading">Dashboard</h1>
        <div role="status" aria-live="polite">
          Loading…
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-labelledby="dashboard-heading">
        <h1 id="dashboard-heading">Dashboard</h1>
        <div role="alert">{state.message}</div>
      </section>
    );
  }

  const { data } = state;

  return (
    <section aria-labelledby="dashboard-heading">
      <h1 id="dashboard-heading">Dashboard</h1>

      <div className="dashboard-grid">
        {/* By Status */}
        <div className="dashboard-card">
          <h2>Tickets by Status</h2>
          <ul className="stat-bars">
            {STATUS_ORDER.map((status) => {
              const count = data.byStatus[status] ?? 0;
              const max = Math.max(...Object.values(data.byStatus), 1);
              const pct = (count / max) * 100;
              return (
                <li key={status} className="stat-row">
                  <span className="stat-label">{STATUS_LABELS[status]}</span>
                  <div className="stat-bar-track">
                    <div
                      className={`stat-bar-fill status-${status}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="stat-value">{count}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* By Priority */}
        <div className="dashboard-card">
          <h2>Tickets by Priority</h2>
          <ul className="stat-bars">
            {PRIORITY_ORDER.map((priority) => {
              const count = data.byPriority[priority] ?? 0;
              const max = Math.max(...Object.values(data.byPriority), 1);
              const pct = (count / max) * 100;
              return (
                <li key={priority} className="stat-row">
                  <span className="stat-label">
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </span>
                  <div className="stat-bar-track">
                    <div
                      className={`stat-bar-fill priority-${priority}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="stat-value">{count}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Average Resolution Time */}
        <div className="dashboard-card">
          <h2>Average Resolution Time</h2>
          <p className="stat-big">
            {data.avgResolutionTime !== null
              ? `${Math.round(data.avgResolutionTime)} seconds`
              : 'N/A'}
          </p>
        </div>

        {/* SLA Breach Count */}
        <div className="dashboard-card">
          <h2>SLA Breach Count</h2>
          <p className="stat-big">{data.slaBreachCount}</p>
        </div>

        {/* Top Assignees */}
        <div className="dashboard-card">
          <h2>Top Assignees</h2>
          {data.topAssignees.length === 0 ? (
            <p>No assignees with open tickets</p>
          ) : (
            <ul className="stat-list">
              {data.topAssignees.map((a) => (
                <li key={a.id} className="stat-row">
                  <span className="stat-label">{a.name}</span>
                  <span className="stat-value">{a.openCount} open</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

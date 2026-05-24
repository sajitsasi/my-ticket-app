import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TicketList } from '../components/TicketList';
import { Filters } from '../components/Filters';
import {
  EMPTY_FILTERS,
  isFiltersEmpty,
  type FilterValues,
} from '../components/filterValues';
import { apiFetch } from '../api';
import type { Ticket, TicketPriority, TicketStatus } from '../types';

/**
 * Filter persistence strategy: URL-encoded.
 * Active filter/search state is synced to the URL query string (e.g. ?status=open&priority=high&q=login).
 * On hard reload the URL is re-read into component state, so the same filtered view is restored.
 * Clearing filters removes all query params, returning to the base path.
 */
interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
}

type TicketsState =
  | { status: 'loading' }
  | { status: 'ready'; tickets: Ticket[] }
  | { status: 'error'; message: string };

function filtersFromSearchParams(sp: URLSearchParams): FilterValues {
  return {
    status: (sp.get('status') as TicketStatus) || '',
    priority: (sp.get('priority') as TicketPriority) || '',
    assignee: sp.get('assignee') || '',
    tag: sp.get('tag') || '',
    q: sp.get('q') || '',
  };
}

function syncFiltersToUrl(filters: FilterValues): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.status) sp.set('status', filters.status);
  if (filters.priority) sp.set('priority', filters.priority);
  if (filters.assignee) sp.set('assignee', filters.assignee);
  if (filters.tag) sp.set('tag', filters.tag);
  if (filters.q) sp.set('q', filters.q);
  return sp;
}

function buildTicketsUrl(filters: FilterValues): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.assignee) params.set('assignee', filters.assignee);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return qs.length === 0 ? '/api/tickets' : `/api/tickets?${qs}`;
}

export function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<TicketsState>({ status: 'loading' });
  const [filters, setFilters] = useState<FilterValues>(
    () => filtersFromSearchParams(searchParams)
  );
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const tagsCaptured = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UserSummary[]>('/api/users')
      .then((data) => {
        if (!cancelled) {
          setUsers(data);
        }
      })
      .catch(() => {
        // Filters can still operate without the assignee list; surface no error here.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const url = buildTicketsUrl(filters);
    apiFetch<Ticket[]>(url)
      .then((tickets) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', tickets });
        if (!tagsCaptured.current && isFiltersEmpty(filters)) {
          const unique = Array.from(
            new Set(tickets.flatMap((t) => t.tags))
          ).sort();
          setAvailableTags(unique);
          tagsCaptured.current = true;
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load tickets';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const userOptions = useMemo(
    () => users.map((u) => ({ id: u.id, name: u.name })),
    [users]
  );

  return (
    <section aria-labelledby="tickets-heading">
      <h1 id="tickets-heading">Tickets</h1>
      <Filters
        values={filters}
        users={userOptions}
        availableTags={availableTags}
        onChange={(next) => {
          setFilters(next);
          setSearchParams(syncFiltersToUrl(next), { replace: true });
        }}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
          setSearchParams({}, { replace: true });
        }}
      />
      {state.status === 'loading' ? (
        <p role="status" aria-live="polite">
          Loading tickets…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p role="alert" className="tickets-error">
          Failed to load tickets: {state.message}
        </p>
      ) : null}
      {state.status === 'ready' ? <TicketList tickets={state.tickets} /> : null}
    </section>
  );
}

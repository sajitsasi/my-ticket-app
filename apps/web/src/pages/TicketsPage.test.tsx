import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TicketsPage } from './TicketsPage';
import { TicketDetailPage } from './TicketDetailPage';
import { personaStore } from '../personaStore';
import type { Ticket } from '../types';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

const SEEDED_USERS = [
  { id: ALICE, name: 'Alice Agent', email: 'alice@example.com', role: 'agent' },
  { id: BOB, name: 'Bob Agent', email: 'bob@example.com', role: 'agent' },
];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function CurrentLocation() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Login button does nothing on Safari',
    description: 'desc',
    status: 'open',
    priority: 'urgent',
    reporter_id: '33333333-3333-3333-3333-333333333333',
    assignee_id: null,
    assignee_name: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
    tags: ['bug', 'urgent'],
    comment_count: 0,
    sla_target_hours: 4,
    sla_remaining_seconds: 7200,
    sla_breached: false,
    ...overrides,
  };
}

let fetchMock: Mock;

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

const DETAIL_PATH_RE = /^\/api\/tickets\/[^?]+$/;

function routedFetch(handlers: {
  tickets?: (queryString: string) => unknown | Response;
  users?: () => unknown | Response;
}) {
  return (input: unknown) => {
    const url = urlOf(input);
    if (url === '/api/users' && handlers.users) {
      const result = handlers.users();
      return Promise.resolve(
        result instanceof Response ? result : jsonResponse(result)
      );
    }
    if (DETAIL_PATH_RE.test(url)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: 'NOT_FOUND', message: 'Ticket not found.' },
          }),
          { status: 404, headers: { 'content-type': 'application/json' } }
        )
      );
    }
    if (url.startsWith('/api/tickets') && handlers.tickets) {
      const idx = url.indexOf('?');
      const qs = idx >= 0 ? url.slice(idx + 1) : '';
      const result = handlers.tickets(qs);
      return Promise.resolve(
        result instanceof Response ? result : jsonResponse(result)
      );
    }
    return Promise.resolve(jsonResponse([]));
  };
}

beforeEach(() => {
  window.localStorage.clear();
  personaStore.setId(ALICE);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

function renderPage(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <>
        <CurrentLocation />
        <Routes>
          <Route path="/" element={<TicketsPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </>
    </MemoryRouter>
  );
}

describe('TicketsPage', () => {
  it('fetches /api/tickets and renders one row per ticket', async () => {
    const tickets = [
      makeTicket({
        id: 'bbbbbbb1-0000-0000-0000-000000000001',
        title: 'Login button does nothing on Safari',
        status: 'open',
        priority: 'urgent',
        assignee_name: null,
        tags: ['bug', 'urgent'],
      }),
      makeTicket({
        id: 'bbbbbbb2-0000-0000-0000-000000000002',
        title: 'Password reset email never arrives',
        status: 'open',
        priority: 'high',
        assignee_name: 'Alice Agent',
        tags: ['bug', 'backend'],
      }),
    ];
    fetchMock.mockImplementation(
      routedFetch({
        tickets: () => tickets,
        users: () => SEEDED_USERS,
      })
    );

    renderPage();

    expect(
      await screen.findByText('Login button does nothing on Safari')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Password reset email never arrives')
    ).toBeInTheDocument();

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getAllByText('Alice Agent').length).toBeGreaterThan(0);

    const ticketCalls = fetchMock.mock.calls.filter((args) =>
      urlOf(args[0]).startsWith('/api/tickets')
    );
    expect(ticketCalls.length).toBeGreaterThan(0);
    const init = ticketCalls[0]![1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-User-Id')).toBe(ALICE);
  });

  it('shows an empty state when zero tickets are returned', async () => {
    fetchMock.mockImplementation(
      routedFetch({
        tickets: () => [],
        users: () => SEEDED_USERS,
      })
    );
    renderPage();

    await waitFor(() => {
      const emptyHeading = screen.getByRole('heading', {
        name: /no tickets to show/i,
      });
      expect(emptyHeading).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('navigates to /tickets/:id when a row is clicked', async () => {
    const ticket = makeTicket({
      id: 'bbbbbbb1-0000-0000-0000-000000000001',
    });
    fetchMock.mockImplementation(
      routedFetch({
        tickets: () => [ticket],
        users: () => SEEDED_USERS,
      })
    );

    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByTestId(`ticket-row-${ticket.id}`);
    await user.click(row);

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/tickets/${ticket.id}`
    );
  });

  it('renders an error state when the tickets fetch fails', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === '/api/users') {
        return Promise.resolve(jsonResponse(SEEDED_USERS));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: 'UNAUTHENTICATED', message: 'no header' },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        )
      );
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i);
    });
  });
});

describe('TicketsPage filters', () => {
  function setup(initialTickets: Ticket[]) {
    const ticketsHandler = vi.fn((queryString: string) => {
      const params = new URLSearchParams(queryString);
      let result = [...initialTickets];
      const status = params.get('status');
      if (status) result = result.filter((t) => t.status === status);
      const priority = params.get('priority');
      if (priority) result = result.filter((t) => t.priority === priority);
      const assignee = params.get('assignee');
      if (assignee) result = result.filter((t) => t.assignee_id === assignee);
      const tag = params.get('tag');
      if (tag) result = result.filter((t) => t.tags.includes(tag));
      const q = params.get('q');
      if (q) {
        const needle = q.toLowerCase();
        result = result.filter(
          (t) =>
            t.title.toLowerCase().includes(needle) ||
            t.description.toLowerCase().includes(needle)
        );
      }
      return result;
    });
    fetchMock.mockImplementation(
      routedFetch({
        tickets: ticketsHandler,
        users: () => SEEDED_USERS,
      })
    );
    return { ticketsHandler };
  }

  const SAFARI = makeTicket({
    id: 'bbbbbbb1-0000-0000-0000-000000000001',
    title: 'Login button does nothing on Safari',
    description: 'safari issue',
    status: 'open',
    priority: 'urgent',
    assignee_id: null,
    assignee_name: null,
    tags: ['bug', 'urgent'],
  });
  const PASSWORD = makeTicket({
    id: 'bbbbbbb2-0000-0000-0000-000000000002',
    title: 'Password reset email never arrives',
    description: 'reset',
    status: 'open',
    priority: 'high',
    assignee_id: ALICE,
    assignee_name: 'Alice Agent',
    tags: ['bug', 'backend'],
  });
  const DARK = makeTicket({
    id: 'bbbbbbb3-0000-0000-0000-000000000003',
    title: 'Add dark mode toggle',
    description: 'theme',
    status: 'in_progress',
    priority: 'low',
    assignee_id: BOB,
    assignee_name: 'Bob Agent',
    tags: ['feature', 'ux'],
  });

  it('refetches with status param when status dropdown changes', async () => {
    const { ticketsHandler } = setup([SAFARI, PASSWORD, DARK]);
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText('Filter by status'),
      'in_progress'
    );

    await waitFor(() => {
      expect(screen.queryByText('Login button does nothing on Safari')).toBeNull();
    });
    expect(screen.getByText('Add dark mode toggle')).toBeInTheDocument();

    const lastCall = ticketsHandler.mock.calls.at(-1)![0];
    expect(lastCall).toContain('status=in_progress');
  });

  it('refetches per keystroke for search (no debounce)', async () => {
    const { ticketsHandler } = setup([SAFARI, PASSWORD, DARK]);
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const initialCalls = ticketsHandler.mock.calls.length;
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search tickets'), 'safari');

    await waitFor(() => {
      expect(ticketsHandler.mock.calls.length).toBe(initialCalls + 6);
    });
    const lastQuery = ticketsHandler.mock.calls.at(-1)![0] as string;
    expect(lastQuery).toContain('q=safari');
    expect(screen.getByText('Login button does nothing on Safari')).toBeInTheDocument();
    expect(screen.queryByText('Password reset email never arrives')).toBeNull();
  });

  it('shows the empty state when search has no matches', async () => {
    setup([SAFARI, PASSWORD, DARK]);
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search tickets'), 'zzzzzzzz');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /no tickets to show/i })
      ).toBeInTheDocument();
    });
  });

  it('AND-combines multiple filters', async () => {
    const { ticketsHandler } = setup([SAFARI, PASSWORD, DARK]);
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText('Filter by status'),
      'open'
    );
    await user.selectOptions(
      screen.getByLabelText('Filter by priority'),
      'high'
    );

    await waitFor(() => {
      expect(screen.queryByText('Login button does nothing on Safari')).toBeNull();
    });
    expect(screen.getByText('Password reset email never arrives')).toBeInTheDocument();

    const lastCall = ticketsHandler.mock.calls.at(-1)![0] as string;
    expect(lastCall).toContain('status=open');
    expect(lastCall).toContain('priority=high');
  });

  it('selecting a tag chip narrows the list and reselecting clears it', async () => {
    const { ticketsHandler } = setup([SAFARI, PASSWORD, DARK]);
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const tagsRegion = screen.getByRole('group', { name: /filter by tag/i });
    const user = userEvent.setup();
    await user.click(within(tagsRegion).getByRole('button', { name: 'feature' }));

    await waitFor(() => {
      expect(screen.queryByText('Login button does nothing on Safari')).toBeNull();
    });
    expect(screen.getByText('Add dark mode toggle')).toBeInTheDocument();
    expect(ticketsHandler.mock.calls.at(-1)![0]).toContain('tag=feature');

    await user.click(within(tagsRegion).getByRole('button', { name: 'feature' }));
    await waitFor(() => {
      expect(
        screen.getByText('Login button does nothing on Safari')
      ).toBeInTheDocument();
    });
  });

  it('Clear filters restores the original unfiltered list and count', async () => {
    setup([SAFARI, PASSWORD, DARK]);
    renderPage();
    await screen.findByText('Login button does nothing on Safari');
    const initialRowCount = screen.getAllByRole('row').length;

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText('Filter by status'),
      'in_progress'
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Login button does nothing on Safari')
      ).toBeNull();
    });

    const clear = screen.getByRole('button', { name: /clear filters/i });
    expect(clear).not.toBeDisabled();
    await user.click(clear);

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBe(initialRowCount);
    });
    expect(
      screen.getByText('Login button does nothing on Safari')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Password reset email never arrives')
    ).toBeInTheDocument();
    expect(screen.getByText('Add dark mode toggle')).toBeInTheDocument();
  });

  it('populates the assignee dropdown from /api/users', async () => {
    setup([SAFARI, PASSWORD, DARK]);
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const select = screen.getByLabelText('Filter by assignee');
    const options = within(select).getAllByRole('option');
    const labels = options.map((o) => o.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(['All assignees', 'Alice Agent', 'Bob Agent'])
    );
  });
});

describe('TicketsPage URL filter persistence', () => {
  const SAFARI = makeTicket({
    id: 'bbbbbbb1-0000-0000-0000-000000000001',
    title: 'Login button does nothing on Safari',
    description: 'safari issue',
    status: 'open',
    priority: 'urgent',
    assignee_id: null,
    assignee_name: null,
    tags: ['bug', 'urgent'],
  });
  const PASSWORD = makeTicket({
    id: 'bbbbbbb2-0000-0000-0000-000000000002',
    title: 'Password reset email never arrives',
    description: 'reset',
    status: 'open',
    priority: 'high',
    assignee_id: ALICE,
    assignee_name: 'Alice Agent',
    tags: ['bug', 'backend'],
  });
  const DARK = makeTicket({
    id: 'bbbbbbb3-0000-0000-0000-000000000003',
    title: 'Add dark mode toggle',
    description: 'theme',
    status: 'in_progress',
    priority: 'low',
    assignee_id: BOB,
    assignee_name: 'Bob Agent',
    tags: ['feature', 'ux'],
  });

  function setupFilterFetches() {
    const ticketsHandler = vi.fn((queryString: string) => {
      const params = new URLSearchParams(queryString);
      let result = [SAFARI, PASSWORD, DARK];
      const status = params.get('status');
      if (status) result = result.filter((t) => t.status === status);
      const priority = params.get('priority');
      if (priority) result = result.filter((t) => t.priority === priority);
      const q = params.get('q');
      if (q) {
        const needle = q.toLowerCase();
        result = result.filter(
          (t) =>
            t.title.toLowerCase().includes(needle) ||
            t.description.toLowerCase().includes(needle)
        );
      }
      return result;
    });
    fetchMock.mockImplementation(
      routedFetch({
        tickets: ticketsHandler,
        users: () => SEEDED_USERS,
      })
    );
    return { ticketsHandler };
  }

  it('updates the URL query string when a status filter is applied', async () => {
    setupFilterFetches();
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText('Filter by status'),
      'in_progress'
    );

    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).toContain('status=in_progress');
    });
  });

  it('updates the URL query string when a search term is entered', async () => {
    setupFilterFetches();
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search tickets'), 'safari');

    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).toContain('q=safari');
    });
  });

  it('removes query params when Clear filters is clicked', async () => {
    setupFilterFetches();
    renderPage();
    await screen.findByText('Login button does nothing on Safari');

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText('Filter by status'),
      'in_progress'
    );

    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).toContain('status=in_progress');
    });

    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).not.toContain('status=');
    });
  });

  it('restores filters from URL params on mount (simulating hard reload)', async () => {
    const { ticketsHandler } = setupFilterFetches();

    // Render the page with a URL that contains filter params
    // (simulates the state after a hard reload where URL is preserved)
    renderPage('/?status=in_progress&priority=low');

    // The initial fetch should include the filter params from the URL
    await waitFor(() => {
      const lastCall = ticketsHandler.mock.calls.at(-1)![0] as string;
      expect(lastCall).toContain('status=in_progress');
    });

    // The status filter dropdown should reflect the URL param
    const statusSelect = screen.getByLabelText('Filter by status') as HTMLSelectElement;
    expect(statusSelect.value).toBe('in_progress');

    // The filtered results should be shown (only DARK matches)
    await waitFor(() => {
      expect(screen.getByText('Add dark mode toggle')).toBeInTheDocument();
    });
    expect(screen.queryByText('Login button does nothing on Safari')).toBeNull();
  });

  it('restores search query from URL param on mount', async () => {
    setupFilterFetches();

    renderPage('/?q=safari');

    await waitFor(() => {
      expect(screen.getByText('Login button does nothing on Safari')).toBeInTheDocument();
    });
    expect(screen.queryByText('Password reset email never arrives')).toBeNull();

    const searchInput = screen.getByLabelText('Search tickets') as HTMLInputElement;
    expect(searchInput.value).toBe('safari');
  });

  it('clearing filters from a URL-prepopulated state resets to base URL', async () => {
    setupFilterFetches();

    renderPage('/?status=in_progress');

    await screen.findByText('Add dark mode toggle');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).not.toContain('status=');
    });

    // All tickets should be visible again
    await waitFor(() => {
      expect(screen.getByText('Login button does nothing on Safari')).toBeInTheDocument();
    });
  });
});

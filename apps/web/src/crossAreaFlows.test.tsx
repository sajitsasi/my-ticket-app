import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App';
import { personaStore } from './personaStore';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';

const SEED_USERS = [
  { id: ALICE, name: 'Alice Agent', email: 'alice@example.com', role: 'agent' },
  { id: BOB, name: 'Bob Agent', email: 'bob@example.com', role: 'agent' },
  { id: CAROL, name: 'Carol Coder', email: 'carol@example.com', role: 'requester' },
];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="current-location">
      {location.pathname}{location.search}
    </div>
  );
}

let fetchMock: Mock;

beforeEach(() => {
  window.localStorage.clear();
  personaStore.setId(ALICE);
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/bootstrap') {
      return jsonResponse({ users: SEED_USERS, defaultPersonaId: ALICE });
    }
    if (url === '/api/users') {
      return jsonResponse(SEED_USERS);
    }
    if (url === '/api/tags') {
      return jsonResponse([
        { id: 'aaaaaaa1-0000-0000-0000-000000000001', name: 'bug' },
        { id: 'aaaaaaa2-0000-0000-0000-000000000002', name: 'feature' },
      ]);
    }
    if (url.startsWith('/api/tickets?')) {
      return jsonResponse([]);
    }
    if (url === '/api/tickets') {
      return jsonResponse([]);
    }
    if (url.startsWith('/api/tickets/')) {
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }
    if (url === '/api/dashboard') {
      return jsonResponse({
        byStatus: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
        byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
        avgResolutionTime: null,
        slaBreachCount: 0,
        topAssignees: [],
      });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationDisplay />
      <App />
    </MemoryRouter>
  );
}

describe('Cross-area: first-visit reachability via header navigation', () => {
  it('from / a user can reach Tickets via the header nav link', async () => {
    const user = userEvent.setup();
    renderApp();

    // Wait for bootstrap to complete
    await waitFor(() => {
      expect(screen.getByTestId('active-persona-label')).toBeInTheDocument();
    });

    // Click the Tickets nav link
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const ticketsLink = within(nav).getByRole('link', { name: 'Tickets' });
    await user.click(ticketsLink);

    // Should be on the tickets page (URL = /)
    await waitFor(() => {
      expect(screen.getByTestId('current-location').textContent).toBe('/');
    });
    // Tickets page heading should be visible (the h1 with id tickets-heading)
    expect(
      screen.getByRole('heading', { level: 1, name: /tickets/i })
    ).toBeInTheDocument();
  });

  it('from / a user can reach New Ticket via the header nav link', async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('active-persona-label')).toBeInTheDocument();
    });

    const nav = screen.getByRole('navigation', { name: /primary/i });
    const newTicketLink = within(nav).getByRole('link', { name: 'New Ticket' });
    await user.click(newTicketLink);

    await waitFor(() => {
      expect(screen.getByTestId('current-location').textContent).toContain('/tickets/new');
    });
    // The New Ticket page should have a form or heading
    expect(
      screen.getByRole('heading', { level: 1, name: /new ticket|create ticket/i })
    ).toBeInTheDocument();
  });

  it('from / a user can reach Dashboard via the header nav link', async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('active-persona-label')).toBeInTheDocument();
    });

    const nav = screen.getByRole('navigation', { name: /primary/i });
    const dashboardLink = within(nav).getByRole('link', { name: 'Dashboard' });
    await user.click(dashboardLink);

    await waitFor(() => {
      expect(screen.getByTestId('current-location').textContent).toContain('/dashboard');
    });
    // The Dashboard page should render its heading
    expect(
      screen.getByRole('heading', { level: 1, name: /dashboard/i })
    ).toBeInTheDocument();
  });

  it('all three nav links are visible in the header without scrolling', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('active-persona-label')).toBeInTheDocument();
    });

    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(within(nav).getByRole('link', { name: 'Tickets' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'New Ticket' })).toBeVisible();
  });
});

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Header } from './Header';
import { personaStore } from '../personaStore';

const alice = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Alice Agent',
  email: 'alice@example.io',
  role: 'agent',
};
const bob = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Bob Builder',
  email: 'bob@example.io',
  role: 'requester',
};
const carol = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'Carol Coder',
  email: 'carol@example.io',
  role: 'agent',
};
const seedUsers = [alice, bob, carol];

let fetchMock: Mock;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function renderHeader(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Header initialUsers={seedUsers} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/users') {
      return jsonResponse(seedUsers);
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('Header', () => {
  it('renders nav links to Tickets, Dashboard, and New Ticket', () => {
    personaStore.setId(alice.id);
    renderHeader();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(within(nav).getByRole('link', { name: 'Tickets' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(
      within(nav).getByRole('link', { name: 'Dashboard' })
    ).toHaveAttribute('href', '/dashboard');
    expect(
      within(nav).getByRole('link', { name: 'New Ticket' })
    ).toHaveAttribute('href', '/tickets/new');
  });

  it('renders the persona dropdown with the seeded users supplied via props', () => {
    personaStore.setId(alice.id);
    renderHeader();
    const select = screen.getByLabelText('Persona');
    expect(within(select).getAllByRole('option')).toHaveLength(seedUsers.length);
    for (const u of seedUsers) {
      expect(
        within(select).getByRole('option', { name: u.name })
      ).toBeInTheDocument();
    }
  });

  it('does not fire any /api/* fetch on initial mount', () => {
    personaStore.setId(alice.id);
    renderHeader();
    const apiCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : String(input);
      return url.startsWith('/api/');
    });
    expect(apiCalls).toHaveLength(0);
  });

  it('reflects the active persona from localStorage', () => {
    personaStore.setId(carol.id);
    renderHeader();
    expect(screen.getByTestId('active-persona-label')).toHaveTextContent(
      carol.name
    );
    expect(personaStore.getId()).toBe(carol.id);
  });

  it('switches the active persona and persists to localStorage', async () => {
    personaStore.setId(alice.id);
    const user = userEvent.setup();
    renderHeader();

    const select = screen.getByLabelText('Persona') as HTMLSelectElement;
    await user.selectOptions(select, bob.id);

    await waitFor(() => {
      expect(personaStore.getId()).toBe(bob.id);
    });
    expect(screen.getByTestId('active-persona-label')).toHaveTextContent(
      bob.name
    );
    expect(window.localStorage.getItem(personaStore.STORAGE_KEY)).toBe(bob.id);
  });

  it('persists persona across remount (simulating reload)', async () => {
    personaStore.setId(alice.id);
    const user = userEvent.setup();
    const first = renderHeader();

    await user.selectOptions(screen.getByLabelText('Persona'), carol.id);
    await waitFor(() => {
      expect(personaStore.getId()).toBe(carol.id);
    });

    first.unmount();
    renderHeader();

    expect(screen.getByTestId('active-persona-label')).toHaveTextContent(
      carol.name
    );
    expect(personaStore.getId()).toBe(carol.id);
  });

  it('refreshes users via /api/users with X-User-Id when the dropdown is focused', async () => {
    personaStore.setId(alice.id);
    const refreshed = [
      alice,
      { ...bob, name: 'Bob Renamed' },
      carol,
    ];
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/users') {
        return jsonResponse(refreshed);
      }
      return new Response('not found', { status: 404 });
    });

    const user = userEvent.setup();
    renderHeader();

    const select = screen.getByLabelText('Persona');
    await user.click(select);

    await waitFor(() => {
      expect(
        within(select).getByRole('option', { name: 'Bob Renamed' })
      ).toBeInTheDocument();
    });

    const usersCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : String(input);
      return url === '/api/users';
    });
    expect(usersCalls.length).toBeGreaterThan(0);
    const [, init] = usersCalls[0] as [unknown, RequestInit | undefined];
    const headers = new Headers(init?.headers);
    expect(headers.get('X-User-Id')).toBe(alice.id);
  });
});

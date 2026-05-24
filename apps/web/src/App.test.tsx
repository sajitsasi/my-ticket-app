import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { personaStore } from './personaStore';

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

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/bootstrap') {
      return jsonResponse({ users: seedUsers, defaultPersonaId: alice.id });
    }
    if (url === '/api/users') {
      return jsonResponse(seedUsers);
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('App bootstrap flow', () => {
  it('fetches /bootstrap first and never fires /api/* before personaStore is set', async () => {
    let bootstrapResolve: ((value: Response) => void) | undefined;
    const bootstrapPromise = new Promise<Response>((resolve) => {
      bootstrapResolve = resolve;
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/bootstrap') {
        return bootstrapPromise;
      }
      if (url === '/api/users') {
        return jsonResponse(seedUsers);
      }
      return new Response('not found', { status: 404 });
    });

    renderApp();

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

    expect(personaStore.getId()).toBeNull();
    const calls = fetchMock.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : String(input)
    );
    expect(calls).toContain('/bootstrap');
    const apiCallsBeforeBootstrap = calls.filter((url) =>
      url.startsWith('/api/')
    );
    expect(apiCallsBeforeBootstrap).toHaveLength(0);

    bootstrapResolve!(
      jsonResponse({ users: seedUsers, defaultPersonaId: alice.id })
    );

    await waitFor(() => {
      expect(personaStore.getId()).toBe(alice.id);
    });

    expect(
      await screen.findByRole('heading', { name: /tickets/i })
    ).toBeInTheDocument();
  });

  it('sets the default persona to defaultPersonaId after bootstrap', async () => {
    renderApp();
    await waitFor(() => {
      expect(personaStore.getId()).toBe(alice.id);
    });
    expect(window.localStorage.getItem(personaStore.STORAGE_KEY)).toBe(
      alice.id
    );
  });

  it('preserves an existing persona instead of overwriting with defaultPersonaId', async () => {
    personaStore.setId(carol.id);
    renderApp();
    await waitFor(() => {
      expect(
        screen.getByTestId('active-persona-label')
      ).toHaveTextContent(carol.name);
    });
    expect(personaStore.getId()).toBe(carol.id);
  });

  it('renders the persona dropdown populated from the bootstrap response', async () => {
    renderApp();
    const select = await screen.findByLabelText('Persona');
    expect(within(select).getAllByRole('option')).toHaveLength(seedUsers.length);
    for (const u of seedUsers) {
      expect(
        within(select).getByRole('option', { name: u.name })
      ).toBeInTheDocument();
    }
  });

  it('shows an error state when bootstrap fails and never fires /api/*', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/bootstrap') {
        return new Response('boom', { status: 500 });
      }
      return new Response('not found', { status: 404 });
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(personaStore.getId()).toBeNull();
    const apiCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : String(input);
      return url.startsWith('/api/');
    });
    expect(apiCalls).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NewTicketPage } from './NewTicketPage';
import { personaStore } from '../personaStore';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const TAG_BUG = 'aaaaaaa1-0000-0000-0000-000000000001';
const TAG_FEATURE = 'aaaaaaa2-0000-0000-0000-000000000002';

const SEEDED_USERS = [
  { id: ALICE, name: 'Alice Agent', email: 'alice@example.com', role: 'agent' },
  { id: BOB, name: 'Bob Agent', email: 'bob@example.com', role: 'agent' },
];

const SEEDED_TAGS = [
  { id: TAG_BUG, name: 'bug', color: '#dc2626' },
  { id: TAG_FEATURE, name: 'feature', color: '#2563eb' },
];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

function CurrentLocation() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

let fetchMock: Mock;

beforeEach(() => {
  window.localStorage.clear();
  personaStore.setId(ALICE);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tickets/new']}>
      <>
        <CurrentLocation />
        <Routes>
          <Route path="/tickets/new" element={<NewTicketPage />} />
          <Route
            path="/tickets/:id"
            element={<div data-testid="detail-placeholder">detail</div>}
          />
        </Routes>
      </>
    </MemoryRouter>
  );
}

function bindInitialFetches() {
  fetchMock.mockImplementation((input: unknown) => {
    const url = urlOf(input);
    if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
    if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
    return Promise.resolve(jsonResponse({}));
  });
}

describe('NewTicketPage', () => {
  it('renders the form with title, description, priority, assignee, and tag fields', async () => {
    bindInitialFetches();
    renderPage();

    expect(
      screen.getByRole('heading', { name: /new ticket/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'bug' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'feature' })).toBeInTheDocument();

    const assignee = screen.getByLabelText(/assignee/i);
    await waitFor(() => {
      expect(within(assignee).getByText('Alice Agent')).toBeInTheDocument();
    });
    expect(within(assignee).getByText('Bob Agent')).toBeInTheDocument();
    expect(within(assignee).getByText('Unassigned')).toBeInTheDocument();
  });

  it('shows inline validation when required fields are blank on submit, preserving other inputs', async () => {
    bindInitialFetches();
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: 'bug' });
    await user.type(
      screen.getByLabelText(/description/i),
      'Some helpful context about this report'
    );

    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
    expect(screen.getByText(/priority is required/i)).toBeInTheDocument();

    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'Some helpful context about this report'
    );

    const ticketCalls = fetchMock.mock.calls.filter((args) =>
      urlOf(args[0]).startsWith('/api/tickets')
    );
    expect(ticketCalls.length).toBe(0);
  });

  it('rejects whitespace-only title without calling the API', async () => {
    bindInitialFetches();
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: 'bug' });
    await user.type(screen.getByLabelText(/title/i), '   ');
    await user.selectOptions(screen.getByLabelText(/priority/i), 'low');
    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
    const ticketCalls = fetchMock.mock.calls.filter((args) =>
      urlOf(args[0]).startsWith('/api/tickets')
    );
    expect(ticketCalls.length).toBe(0);
  });

  it('submits a complete payload and redirects to /tickets/:id on success', async () => {
    const newId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === '/api/tickets' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve(
          jsonResponse(
            {
              id: newId,
              title: body.title,
              description: body.description ?? '',
              status: body.status ?? 'open',
              priority: body.priority,
              reporter_id: ALICE,
              assignee_id: body.assignee_id ?? null,
              assignee_name: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              resolved_at: null,
              tags: [],
              comment_count: 0,
              sla_target_hours: 8,
              sla_remaining_seconds: 28800,
              sla_breached: false,
            },
            { status: 201 }
          )
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'bug' });

    await user.type(screen.getByLabelText(/title/i), 'A new ticket');
    await user.type(screen.getByLabelText(/description/i), 'Body of report');
    await user.selectOptions(screen.getByLabelText(/priority/i), 'high');
    await user.selectOptions(screen.getByLabelText(/assignee/i), BOB);
    await user.click(screen.getByRole('button', { name: 'bug' }));

    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/tickets/${newId}`
      );
    });

    const postCall = fetchMock.mock.calls.find((args) => {
      const init = args[1] as RequestInit | undefined;
      return urlOf(args[0]) === '/api/tickets' && init?.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const init = postCall![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('X-User-Id')).toBe(ALICE);
    expect(headers.get('Content-Type')).toBe('application/json');
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({
      title: 'A new ticket',
      priority: 'high',
      description: 'Body of report',
      assignee_id: BOB,
      tags: [TAG_BUG],
    });
  });

  it('submits with required-only fields when description, assignee and tags are omitted', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      calls.push({ url, init });
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === '/api/tickets' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              title: 'minimal',
              description: '',
              status: 'open',
              priority: 'low',
              reporter_id: ALICE,
              assignee_id: null,
              assignee_name: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              resolved_at: null,
              tags: [],
              comment_count: 0,
              sla_target_hours: 72,
              sla_remaining_seconds: 259200,
              sla_breached: false,
            },
            { status: 201 }
          )
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'bug' });

    await user.type(screen.getByLabelText(/title/i), 'minimal');
    await user.selectOptions(screen.getByLabelText(/priority/i), 'low');
    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/tickets/');
    });

    const postCall = calls.find(
      (c) => c.url === '/api/tickets' && c.init?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    const sent = JSON.parse(postCall!.init!.body as string);
    expect(sent).toEqual({ title: 'minimal', priority: 'low' });
    expect(sent).not.toHaveProperty('assignee_id');
    expect(sent).not.toHaveProperty('tags');
    expect(sent).not.toHaveProperty('description');
    expect(sent).not.toHaveProperty('status');
  });

  it('surfaces server validation errors next to the relevant field', async () => {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === '/api/tickets' && init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'VALIDATION_FAILED',
                message: 'Ticket payload is invalid.',
                details: [
                  { path: 'priority', message: 'Priority must be one of low, medium, high, urgent.' },
                ],
              },
            }),
            {
              status: 400,
              headers: { 'content-type': 'application/json' },
            }
          )
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'bug' });

    await user.type(screen.getByLabelText(/title/i), 'has title');
    await user.selectOptions(screen.getByLabelText(/priority/i), 'low');
    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    expect(
      await screen.findByText(/priority must be one of/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/tickets/new');
  });
});

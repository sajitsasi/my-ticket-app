import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TicketDetailPage } from './TicketDetailPage';
import { personaStore } from '../personaStore';
import type { TicketDetail } from '../types';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';
const TICKET_ID = 'bbbbbbb1-0000-0000-0000-000000000001';

const SEEDED_USERS = [
  { id: ALICE, name: 'Alice Agent', email: 'alice@example.com', role: 'agent' },
  { id: BOB, name: 'Bob Agent', email: 'bob@example.com', role: 'agent' },
  {
    id: CAROL,
    name: 'Carol Requester',
    email: 'carol@example.com',
    role: 'requester',
  },
];

const SEEDED_TAGS = [
  { id: 'aaaaaaa1-0000-0000-0000-000000000001', name: 'bug', color: '#dc2626' },
  { id: 'aaaaaaa2-0000-0000-0000-000000000002', name: 'feature', color: '#2563eb' },
  { id: 'aaaaaaa3-0000-0000-0000-000000000003', name: 'ux', color: '#7c3aed' },
  { id: 'aaaaaaa4-0000-0000-0000-000000000004', name: 'backend', color: '#0f766e' },
  { id: 'aaaaaaa5-0000-0000-0000-000000000005', name: 'urgent', color: '#ea580c' },
];

function makeDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: TICKET_ID,
    title: 'Login button does nothing on Safari',
    description: 'Clicking sign-in does nothing.',
    status: 'open',
    priority: 'urgent',
    reporter_id: CAROL,
    reporter_name: 'Carol Requester',
    assignee_id: null,
    assignee_name: null,
    created_at: '2026-05-22T05:00:00.000Z',
    updated_at: '2026-05-22T05:00:00.000Z',
    resolved_at: null,
    tags: ['bug', 'urgent'],
    comments: [
      {
        id: 'c1',
        ticket_id: TICKET_ID,
        author_id: ALICE,
        author_name: 'Alice Agent',
        body: 'Reproduced on Safari 17.',
        created_at: '2026-05-22T05:30:00.000Z',
      },
    ],
    audit_log: [],
    sla_target_hours: 4,
    sla_remaining_seconds: 7200,
    sla_breached: false,
    ...overrides,
  };
}

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

let fetchMock: Mock;

beforeEach(() => {
  window.localStorage.clear();
  personaStore.setId(ALICE);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

function renderPage(id: string = TICKET_ID) {
  return render(
    <MemoryRouter initialEntries={[`/tickets/${id}`]}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TicketDetailPage', () => {
  it('renders all detail fields, badges, and placeholder sections', async () => {
    const detail = makeDetail();
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === `/api/tickets/${TICKET_ID}`)
        return Promise.resolve(jsonResponse(detail));
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      return Promise.resolve(jsonResponse({}));
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-title')
      ).toHaveTextContent('Login button does nothing on Safari');
    });
    expect(screen.getByText('Clicking sign-in does nothing.')).toBeInTheDocument();

    const badgesContainer = screen.getByTestId('ticket-detail-title')
      .parentElement!.parentElement!;
    expect(within(badgesContainer).getByText('Open')).toBeInTheDocument();
    expect(within(badgesContainer).getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByTestId('sla-badge')).toBeInTheDocument();

    // Reporter is rendered in a <dd> inside the detail fields
    const detailFields = screen.getByTestId('ticket-detail-description')
      .closest('dl')!;
    expect(within(detailFields).getByText('Carol Requester')).toBeInTheDocument();

    const assigneePicker = screen.getByTestId('assignee-picker');
    expect(assigneePicker).toBeInTheDocument();

    const tagSection = screen.getByTestId('ticket-detail-tags');
    expect(await within(tagSection).findByText('bug')).toBeInTheDocument();
    expect(within(tagSection).getByText('urgent')).toBeInTheDocument();

    const commentsSection = screen.getByTestId('ticket-detail-comments');
    expect(within(commentsSection).getByText('Alice Agent')).toBeInTheDocument();
    expect(
      within(commentsSection).getByText('Reproduced on Safari 17.')
    ).toBeInTheDocument();

    const auditSection = screen.getByTestId('ticket-detail-audit');
    expect(
      within(auditSection).getByText(/no audit entries yet/i)
    ).toBeInTheDocument();
  });

  it('shows a not-found state when the API returns 404', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === `/api/tickets/${TICKET_ID}`) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'NOT_FOUND', message: 'Ticket not found.' },
            }),
            { status: 404, headers: { 'content-type': 'application/json' } }
          )
        );
      }
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      return Promise.resolve(jsonResponse({}));
    });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /ticket not found/i })
    ).toBeInTheDocument();
  });

  it('edits title, description, priority and assignee, sending only changed fields and updating the display', async () => {
    const initial = makeDetail();
    const updated = makeDetail({
      title: 'Login button bug — Safari',
      description: 'Updated description body',
      priority: 'high',
      assignee_id: BOB,
      assignee_name: 'Bob Agent',
      updated_at: '2026-05-22T06:00:00.000Z',
    });

    let patchInit: RequestInit | undefined;
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === `/api/tickets/${TICKET_ID}`) {
        if (init?.method === 'PATCH') {
          patchInit = init;
          return Promise.resolve(jsonResponse(updated));
        }
        return Promise.resolve(jsonResponse(initial));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Clicking sign-in does nothing.');

    await user.click(screen.getByRole('button', { name: /edit/i }));

    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Login button bug — Safari');

    const descInput = screen.getByLabelText(/description/i);
    await user.clear(descInput);
    await user.type(descInput, 'Updated description body');

    await user.selectOptions(screen.getByLabelText(/priority/i), 'high');
    await user.selectOptions(screen.getByLabelText(/assignee/i), BOB);

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-detail-title')).toHaveTextContent(
        'Login button bug — Safari'
      );
    });

    expect(screen.getByText('Updated description body')).toBeInTheDocument();
    const badgesContainer = screen.getByTestId('ticket-detail-title')
      .parentElement!.parentElement!;
    expect(within(badgesContainer).getByText('High')).toBeInTheDocument();
    const assigneePicker = screen.getByTestId('assignee-picker');
    expect(within(assigneePicker as HTMLElement).getByLabelText('Assignee')).toHaveValue(BOB);

    expect(patchInit).toBeDefined();
    const headers = new Headers(patchInit!.headers);
    expect(headers.get('X-User-Id')).toBe(ALICE);
    const sent = JSON.parse(patchInit!.body as string);
    expect(sent).toEqual({
      title: 'Login button bug — Safari',
      description: 'Updated description body',
      priority: 'high',
      assignee_id: BOB,
    });
  });

  it('rejects whitespace-only title without sending a PATCH', async () => {
    const initial = makeDetail();
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === `/api/tickets/${TICKET_ID}`)
        return Promise.resolve(jsonResponse(initial));
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Clicking sign-in does nothing.');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, '   ');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();

    const patchCalls = fetchMock.mock.calls.filter((args) => {
      const init = args[1] as RequestInit | undefined;
      return init?.method === 'PATCH';
    });
    expect(patchCalls.length).toBe(0);
  });

  it('changes status via StatusBadge select, sending a PATCH and updating the badge', async () => {
    const initial = makeDetail();
    const updated = makeDetail({ status: 'in_progress' });

    let patchInit: RequestInit | undefined;
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === `/api/tickets/${TICKET_ID}`) {
        if (init?.method === 'PATCH') {
          patchInit = init;
          return Promise.resolve(jsonResponse(updated));
        }
        return Promise.resolve(jsonResponse(initial));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Clicking sign-in does nothing.');

    await user.selectOptions(
      screen.getByLabelText('Change status'),
      'in_progress'
    );

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-label')).toHaveTextContent(
        'In Progress'
      );
    });

    expect(patchInit).toBeDefined();
    expect(patchInit!.method).toBe('PATCH');
    const sent = JSON.parse(patchInit!.body as string);
    expect(sent).toEqual({ status: 'in_progress' });
    expect(screen.queryByTestId('status-error-toast')).toBeNull();
  });

  it('shows a toast and leaves the badge unchanged when the backend rejects a status change', async () => {
    const initial = makeDetail({ status: 'open' });

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === `/api/tickets/${TICKET_ID}`) {
        if (init?.method === 'PATCH') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: 'INVALID_TRANSITION',
                  message:
                    'Status cannot transition from open to in_progress.',
                },
              }),
              { status: 422, headers: { 'content-type': 'application/json' } }
            )
          );
        }
        return Promise.resolve(jsonResponse(initial));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Clicking sign-in does nothing.');

    await user.selectOptions(
      screen.getByLabelText('Change status'),
      'in_progress'
    );

    expect(
      await screen.findByTestId('status-error-toast')
    ).toHaveTextContent(/cannot transition/i);
    expect(screen.getByTestId('status-badge-label')).toHaveTextContent('Open');
  });

  it('renders audit log entries with actor name, action, from→to, and timestamp', async () => {
    const detail = makeDetail({
      audit_log: [
        {
          id: 'a1',
          ticket_id: TICKET_ID,
          actor_id: CAROL,
          actor_name: 'Carol Requester',
          action: 'created',
          from_value: null,
          to_value: null,
          created_at: '2026-05-22T05:00:00.000Z',
        },
        {
          id: 'a2',
          ticket_id: TICKET_ID,
          actor_id: ALICE,
          actor_name: 'Alice Agent',
          action: 'status_changed',
          from_value: 'open',
          to_value: 'in_progress',
          created_at: '2026-05-22T06:00:00.000Z',
        },
        {
          id: 'a3',
          ticket_id: TICKET_ID,
          actor_id: BOB,
          actor_name: 'Bob Agent',
          action: 'assignee_changed',
          from_value: 'Unassigned',
          to_value: 'Bob Agent',
          created_at: '2026-05-22T07:00:00.000Z',
        },
      ],
    });
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === `/api/tickets/${TICKET_ID}`)
        return Promise.resolve(jsonResponse(detail));
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      return Promise.resolve(jsonResponse({}));
    });

    renderPage();

    const auditSection = await screen.findByTestId('ticket-detail-audit');
    const entries = within(auditSection).getAllByRole('listitem');
    expect(entries.length).toBe(3);

    // First entry: created action with actor name
    expect(within(entries[0]!).getByText('created')).toBeInTheDocument();
    expect(within(entries[0]!).getByText('Carol Requester')).toBeInTheDocument();

    // Second entry: status_changed with from→to values
    expect(within(entries[1]!).getByText('status_changed')).toBeInTheDocument();
    expect(within(entries[1]!).getByText('Alice Agent')).toBeInTheDocument();
    // from→to rendered inside a single span
    const changeSpan2 = within(entries[1]!).getByText(/open.*in_progress/);
    expect(changeSpan2).toBeInTheDocument();

    // Third entry: assignee_changed with from→to values
    expect(within(entries[2]!).getByText('assignee_changed')).toBeInTheDocument();
    expect(within(entries[2]!).getByText('Bob Agent')).toBeInTheDocument();
    const changeSpan3 = within(entries[2]!).getByText(/Unassigned.*Bob Agent/);
    expect(changeSpan3).toBeInTheDocument();
  });

  it('does not overwrite assignee set via inline control while the edit form is open', async () => {
    // Simulate: user opens edit form, then an inline control (e.g. concurrent
    // PATCH) changes the assignee while the form is open.  The form should
    // compare against the values when editing started, not the current ticket
    // state, so the inline control's change is preserved.
    const initial = makeDetail({ status: 'open', assignee_id: null, assignee_name: null });
    // StatusBadge PATCH response also includes a new assignee (simulates a
    // concurrent change or server-side side-effect that sets assignee).
    const afterStatusChange = makeDetail({ status: 'in_progress', assignee_id: BOB, assignee_name: 'Bob Agent' });
    const afterFormSave = makeDetail({ status: 'in_progress', title: 'Updated title', assignee_id: BOB, assignee_name: 'Bob Agent', updated_at: '2026-05-22T06:00:00.000Z' });

    const patchBodies: Record<string, unknown>[] = [];
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === `/api/tickets/${TICKET_ID}`) {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(init.body as string) as Record<string, unknown>;
          patchBodies.push(body);
          if (body.status) return Promise.resolve(jsonResponse(afterStatusChange));
          return Promise.resolve(jsonResponse(afterFormSave));
        }
        // GET: return latest state
        const hasStatusPatch = patchBodies.some((p) => p.status);
        if (hasStatusPatch) return Promise.resolve(jsonResponse(afterStatusChange));
        return Promise.resolve(jsonResponse(initial));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Clicking sign-in does nothing.');

    // 1. Open the edit form FIRST (captures original: assignee=null)
    await user.click(screen.getByRole('button', { name: /edit/i }));
    // 2. Change title in the form (user's actual edit)
    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated title');

    // 3. Change status via StatusBadge while form is open
    //    The response also changes assignee_id → BOB (simulating concurrent change)
    await user.selectOptions(
      screen.getByLabelText('Change status'),
      'in_progress'
    );
    await waitFor(() => {
      expect(screen.getByTestId('status-badge-label')).toHaveTextContent('In Progress');
    });

    // 4. Save the form (user only changed title, not assignee)
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-detail-title')).toHaveTextContent('Updated title');
    });

    // The form-save PATCH should only include `title`, NOT `assignee_id`
    const formPatch = patchBodies.find((p) => p.title && !p.status);
    expect(formPatch).toBeDefined();
    expect(formPatch!.body ?? formPatch).not.toHaveProperty('assignee_id');
    // The assignee set by the StatusBadge's response should still be visible
    const assigneePicker = screen.getByTestId('assignee-picker');
    expect(within(assigneePicker as HTMLElement).getByLabelText('Assignee')).toHaveValue(BOB);
  });

  it('sends only fields modified in the edit form, not fields changed by inline controls', async () => {
    const initial = makeDetail({ status: 'open', assignee_id: null, assignee_name: null });
    const afterStatusPatch = makeDetail({ status: 'in_progress', assignee_id: null, assignee_name: null });
    const afterFormSave = makeDetail({
      status: 'in_progress',
      title: 'Updated title',
      assignee_id: null,
      assignee_name: null,
      updated_at: '2026-05-22T06:00:00.000Z',
    });

    const patchCalls: { body: unknown }[] = [];
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === `/api/tickets/${TICKET_ID}`) {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(init.body as string);
          patchCalls.push({ body });
          if (body.status) return Promise.resolve(jsonResponse(afterStatusPatch));
          return Promise.resolve(jsonResponse(afterFormSave));
        }
        const hasStatusPatch = patchCalls.some((p) => (p.body as Record<string, unknown>).status);
        if (hasStatusPatch) return Promise.resolve(jsonResponse(afterStatusPatch));
        return Promise.resolve(jsonResponse(initial));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Clicking sign-in does nothing.');

    // Change status via StatusBadge inline control
    await user.selectOptions(
      screen.getByLabelText('Change status'),
      'in_progress'
    );
    await waitFor(() => {
      expect(screen.getByTestId('status-badge-label')).toHaveTextContent('In Progress');
    });

    // Open edit form, only change title
    await user.click(screen.getByRole('button', { name: /edit/i }));
    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated title');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-detail-title')).toHaveTextContent('Updated title');
    });

    // Verify the form PATCH only includes the title change
    const formPatchCall = patchCalls.find((p) => (p.body as Record<string, unknown>).title);
    expect(formPatchCall).toBeDefined();
    const body = formPatchCall!.body as Record<string, unknown>;
    expect(body).toEqual({ title: 'Updated title' });
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('priority');
    expect(body).not.toHaveProperty('assignee_id');
  });

  it('closes the form without PATCH when nothing was changed', async () => {
    const initial = makeDetail();
    fetchMock.mockImplementation((input: unknown, _init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === `/api/tickets/${TICKET_ID}`)
        return Promise.resolve(jsonResponse(initial));
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Clicking sign-in does nothing.');

    // Open and immediately save without changes
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // Should close the form and return to detail view
    await waitFor(() => {
      expect(screen.getByTestId('ticket-detail-title')).toHaveTextContent(
        'Login button does nothing on Safari'
      );
    });

    // No PATCH should have been sent
    const patchCalls = fetchMock.mock.calls.filter((args) => {
      const init = args[1] as RequestInit | undefined;
      return init?.method === 'PATCH';
    });
    expect(patchCalls.length).toBe(0);
  });

  it('cancel restores the detail view without persisting edits', async () => {
    const initial = makeDetail();
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === '/api/tags') return Promise.resolve(jsonResponse(SEEDED_TAGS));
      if (url === `/api/tickets/${TICKET_ID}`)
        return Promise.resolve(jsonResponse(initial));
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Clicking sign-in does nothing.');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Should be discarded');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByTestId('ticket-detail-title')).toHaveTextContent(
      'Login button does nothing on Safari'
    );

    const patchCalls = fetchMock.mock.calls.filter((args) => {
      const init = args[1] as RequestInit | undefined;
      return init?.method === 'PATCH';
    });
    expect(patchCalls.length).toBe(0);
  });
});

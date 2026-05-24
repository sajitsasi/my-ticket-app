import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssigneePicker } from './AssigneePicker';
import { personaStore } from '../personaStore';
import type { TicketDetail } from '../types';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';
const TICKET_ID = 'bbbbbbb1-0000-0000-0000-000000000001';

const SEEDED_USERS = [
  { id: ALICE, name: 'Alice Agent', email: 'alice@example.com', role: 'agent' },
  { id: BOB, name: 'Bob Agent', email: 'bob@example.com', role: 'agent' },
  { id: CAROL, name: 'Carol Requester', email: 'carol@example.com', role: 'requester' },
];

function makeDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: TICKET_ID,
    title: 'Test ticket',
    description: '',
    status: 'open',
    priority: 'low',
    reporter_id: CAROL,
    reporter_name: 'Carol Requester',
    assignee_id: null,
    assignee_name: null,
    created_at: '2026-05-22T05:00:00.000Z',
    updated_at: '2026-05-22T05:00:00.000Z',
    resolved_at: null,
    tags: [],
    comments: [],
    audit_log: [],
    sla_target_hours: 72,
    sla_remaining_seconds: 259200,
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

describe('AssigneePicker', () => {
  it('lists all users plus Unassigned option', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      return Promise.resolve(jsonResponse({}));
    });

    render(
      <AssigneePicker
        ticketId={TICKET_ID}
        assigneeId={null}
        onAssigneeChange={() => {}}
      />
    );

    const select = await screen.findByLabelText('Assignee');
    const options = within(select as HTMLElement).getAllByRole('option');
    const optionTexts = options.map((o) => (o as HTMLOptionElement).text);
    expect(optionTexts).toContain('Unassigned');
    expect(optionTexts).toContain('Alice Agent');
    expect(optionTexts).toContain('Bob Agent');
    expect(optionTexts).toContain('Carol Requester');
  });

  it('shows the current assignee as selected', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      return Promise.resolve(jsonResponse({}));
    });

    render(
      <AssigneePicker
        ticketId={TICKET_ID}
        assigneeId={BOB}
        onAssigneeChange={() => {}}
      />
    );

    const select = await screen.findByLabelText('Assignee');
    expect((select as HTMLSelectElement).value).toBe(BOB);
  });

  it('calls PATCH and onAssigneeChange when a new user is selected', async () => {
    const onChange = vi.fn();
    const updatedResponse = makeDetail({
      assignee_id: BOB,
      assignee_name: 'Bob Agent',
    });

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === `/api/tickets/${TICKET_ID}` && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(updatedResponse));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    render(
      <AssigneePicker
        ticketId={TICKET_ID}
        assigneeId={null}
        onAssigneeChange={onChange}
      />
    );

    const select = await screen.findByLabelText('Assignee');
    await user.selectOptions(select, BOB);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(updatedResponse);
    });

    const patchCalls = fetchMock.mock.calls.filter((args) => {
      const init = args[1] as RequestInit | undefined;
      return init?.method === 'PATCH';
    });
    expect(patchCalls.length).toBe(1);
    const sent = JSON.parse((patchCalls[0]![1] as RequestInit).body as string);
    expect(sent).toEqual({ assignee_id: BOB });
  });

  it('sends assignee_id: null when Unassigned is selected', async () => {
    const onChange = vi.fn();
    const updatedResponse = makeDetail({
      assignee_id: null,
      assignee_name: null,
    });

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === `/api/tickets/${TICKET_ID}` && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(updatedResponse));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    render(
      <AssigneePicker
        ticketId={TICKET_ID}
        assigneeId={BOB}
        onAssigneeChange={onChange}
      />
    );

    const select = await screen.findByLabelText('Assignee');
    await user.selectOptions(select, '');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(updatedResponse);
    });

    const patchCalls = fetchMock.mock.calls.filter((args) => {
      const init = args[1] as RequestInit | undefined;
      return init?.method === 'PATCH';
    });
    expect(patchCalls.length).toBe(1);
    const sent = JSON.parse((patchCalls[0]![1] as RequestInit).body as string);
    expect(sent).toEqual({ assignee_id: null });
  });

  it('shows an error when the PATCH fails (e.g., invalid assignee_id)', async () => {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/users') return Promise.resolve(jsonResponse(SEEDED_USERS));
      if (url === `/api/tickets/${TICKET_ID}` && init?.method === 'PATCH') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'VALIDATION_FAILED',
                message: 'assignee_id does not reference a known user.',
              },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AssigneePicker
        ticketId={TICKET_ID}
        assigneeId={null}
        onAssigneeChange={onChange}
      />
    );

    const select = await screen.findByLabelText('Assignee');
    await user.selectOptions(select, BOB);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /does not reference a known user/i
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

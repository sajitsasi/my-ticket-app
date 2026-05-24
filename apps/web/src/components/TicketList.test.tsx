import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TicketList } from './TicketList';
import type { Ticket } from '../types';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'A bug',
    description: 'desc',
    status: 'open',
    priority: 'high',
    reporter_id: 'r1',
    assignee_id: 'a1',
    assignee_name: 'Alice Agent',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
    tags: ['bug', 'urgent'],
    comment_count: 2,
    sla_target_hours: 8,
    sla_remaining_seconds: 28800,
    sla_breached: false,
    ...overrides,
  };
}

function renderList(tickets: Ticket[]) {
  return render(
    <MemoryRouter>
      <TicketList tickets={tickets} />
    </MemoryRouter>
  );
}

describe('TicketList', () => {
  it('renders one row per ticket with title, status, priority, assignee, and tags', () => {
    const tickets = [
      makeTicket({
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Login broken',
        status: 'open',
        priority: 'urgent',
        assignee_name: 'Alice Agent',
        tags: ['bug', 'urgent'],
      }),
      makeTicket({
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Add dark mode',
        status: 'in_progress',
        priority: 'low',
        assignee_name: 'Bob Agent',
        tags: ['feature'],
      }),
    ];
    renderList(tickets);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);

    const firstRow = screen.getByTestId(
      'ticket-row-11111111-1111-1111-1111-111111111111'
    );
    expect(within(firstRow).getByText('Login broken')).toBeInTheDocument();
    expect(within(firstRow).getByText('Open')).toBeInTheDocument();
    expect(within(firstRow).getByText('Urgent')).toBeInTheDocument();
    expect(within(firstRow).getByText('Alice Agent')).toBeInTheDocument();
    expect(within(firstRow).getByText('bug')).toBeInTheDocument();
    expect(within(firstRow).getByText('urgent')).toBeInTheDocument();

    const secondRow = screen.getByTestId(
      'ticket-row-22222222-2222-2222-2222-222222222222'
    );
    expect(within(secondRow).getByText('Add dark mode')).toBeInTheDocument();
    expect(within(secondRow).getByText('In Progress')).toBeInTheDocument();
    expect(within(secondRow).getByText('Low')).toBeInTheDocument();
    expect(within(secondRow).getByText('Bob Agent')).toBeInTheDocument();
    expect(within(secondRow).getByText('feature')).toBeInTheDocument();
  });

  it('shows "Unassigned" when assignee_name is null', () => {
    renderList([makeTicket({ assignee_id: null, assignee_name: null })]);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders an empty state when there are no tickets', () => {
    renderList([]);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/no tickets/i);
  });
});

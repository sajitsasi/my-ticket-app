import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TicketRow } from './TicketRow';
import type { Ticket } from '../types';

function CurrentLocation() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const ticket: Ticket = {
  id: 'bbbbbbb1-0000-0000-0000-000000000001',
  title: 'Login button does nothing on Safari',
  description: 'desc',
  status: 'open',
  priority: 'urgent',
  reporter_id: 'r1',
  assignee_id: 'a1',
  assignee_name: 'Alice Agent',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  resolved_at: null,
  tags: ['bug', 'urgent'],
  comment_count: 0,
  sla_target_hours: 4,
  sla_remaining_seconds: 7200,
  sla_breached: false,
};

function renderRow() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <table>
              <tbody>
                <TicketRow ticket={ticket} />
              </tbody>
            </table>
          }
        />
        <Route path="/tickets/:id" element={<CurrentLocation />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TicketRow', () => {
  it('navigates to /tickets/:id when the row is clicked', async () => {
    const user = userEvent.setup();
    renderRow();

    const row = screen.getByTestId(`ticket-row-${ticket.id}`);
    await user.click(row);

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/tickets/${ticket.id}`
    );
  });

  it('navigates to /tickets/:id when the title link is clicked', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole('link', { name: ticket.title }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/tickets/${ticket.id}`
    );
  });
});

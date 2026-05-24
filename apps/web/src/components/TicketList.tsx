import { TicketRow } from './TicketRow';
import type { Ticket } from '../types';

interface TicketListProps {
  tickets: Ticket[];
}

export function TicketList({ tickets }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className="ticket-empty-state" role="status">
        <h2>No tickets to show</h2>
        <p>There are no tickets matching the current view.</p>
      </div>
    );
  }

  return (
    <table className="ticket-table">
      <thead>
        <tr>
          <th scope="col">Title</th>
          <th scope="col">Status</th>
          <th scope="col">Priority</th>
          <th scope="col">Assignee</th>
          <th scope="col">Tags</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} />
        ))}
      </tbody>
    </table>
  );
}

import { useNavigate } from 'react-router-dom';
import { PriorityBadge } from './PriorityBadge';
import { SlaBadge } from './SlaBadge';
import { StatusBadge } from './StatusBadge';
import type { Ticket } from '../types';

interface TicketRowProps {
  ticket: Ticket;
}

export function TicketRow({ ticket }: TicketRowProps) {
  const navigate = useNavigate();
  const detailHref = `/tickets/${ticket.id}`;

  function go() {
    navigate(detailHref);
  }

  return (
    <tr
      className="ticket-row"
      data-testid={`ticket-row-${ticket.id}`}
      onClick={go}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          go();
        }
      }}
      tabIndex={0}
      aria-label={`Open ticket ${ticket.title}`}
    >
      <td className="ticket-title-cell">
        <a
          href={detailHref}
          onClick={(event) => {
            event.preventDefault();
            go();
          }}
        >
          {ticket.title}
        </a>
      </td>
      <td>
        <StatusBadge status={ticket.status} />
      </td>
      <td>
        <PriorityBadge priority={ticket.priority} />
      </td>
      <td>
        <SlaBadge
          status={ticket.status}
          sla_target_hours={ticket.sla_target_hours}
          sla_remaining_seconds={ticket.sla_remaining_seconds}
          sla_breached={ticket.sla_breached}
        />
      </td>
      <td className="ticket-assignee-cell">
        {ticket.assignee_name ? (
          ticket.assignee_name
        ) : (
          <span className="ticket-unassigned">Unassigned</span>
        )}
      </td>
      <td className="ticket-tags-cell">
        {ticket.tags.length === 0 ? (
          <span className="ticket-no-tags">—</span>
        ) : (
          <ul className="tag-chip-list">
            {ticket.tags.map((tag) => (
              <li key={tag} className="tag-chip">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

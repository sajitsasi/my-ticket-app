import type { TicketPriority, TicketStatus } from '../types';
import { isFiltersEmpty, type FilterValues } from './filterValues';

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

interface UserOption {
  id: string;
  name: string;
}

interface FiltersProps {
  values: FilterValues;
  users: UserOption[];
  availableTags: string[];
  onChange: (next: FilterValues) => void;
  onReset: () => void;
}

export function Filters({
  values,
  users,
  availableTags,
  onChange,
  onReset,
}: FiltersProps) {
  function update<K extends keyof FilterValues>(
    key: K,
    value: FilterValues[K]
  ) {
    onChange({ ...values, [key]: value });
  }

  function toggleTag(tag: string) {
    update('tag', values.tag === tag ? '' : tag);
  }

  return (
    <section
      className="ticket-filters"
      aria-label="Ticket filters"
      role="region"
    >
      <div className="filter-row">
        <label className="filter-field">
          <span>Search</span>
          <input
            type="search"
            value={values.q}
            onChange={(event) => update('q', event.target.value)}
            placeholder="Search title or description"
            aria-label="Search tickets"
          />
        </label>

        <label className="filter-field">
          <span>Status</span>
          <select
            value={values.status}
            onChange={(event) =>
              update('status', event.target.value as FilterValues['status'])
            }
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>Priority</span>
          <select
            value={values.priority}
            onChange={(event) =>
              update(
                'priority',
                event.target.value as FilterValues['priority']
              )
            }
            aria-label="Filter by priority"
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>Assignee</span>
          <select
            value={values.assignee}
            onChange={(event) => update('assignee', event.target.value)}
            aria-label="Filter by assignee"
          >
            <option value="">All assignees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="filter-reset"
          onClick={onReset}
          disabled={isFiltersEmpty(values)}
        >
          Clear filters
        </button>
      </div>

      {availableTags.length > 0 ? (
        <div className="filter-tags" role="group" aria-label="Filter by tag">
          <span className="filter-tags-label">Tags:</span>
          <ul className="tag-chip-list">
            {availableTags.map((tag) => {
              const active = values.tag === tag;
              return (
                <li key={tag}>
                  <button
                    type="button"
                    className={`tag-chip tag-chip-button${
                      active ? ' tag-chip-active' : ''
                    }`}
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

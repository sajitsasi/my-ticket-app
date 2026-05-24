import type { TicketPriority, TicketStatus } from '../types';

export interface FilterValues {
  status: TicketStatus | '';
  priority: TicketPriority | '';
  assignee: string;
  tag: string;
  q: string;
}

export const EMPTY_FILTERS: FilterValues = {
  status: '',
  priority: '',
  assignee: '',
  tag: '',
  q: '',
};

export function isFiltersEmpty(filters: FilterValues): boolean {
  return (
    filters.status === '' &&
    filters.priority === '' &&
    filters.assignee === '' &&
    filters.tag === '' &&
    filters.q === ''
  );
}

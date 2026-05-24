import { z } from 'zod';

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;
export const TICKET_PRIORITIES = [
  'low',
  'medium',
  'high',
  'urgent',
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidString = z
  .string()
  .refine((v) => UUID_RE.test(v), { message: 'Must be a UUID' });

export const createTicketSchema = z.object({
  title: z
    .string({ message: 'Title is required.' })
    .trim()
    .min(1, 'Title is required.'),
  description: z.string().optional(),
  priority: z.enum(TICKET_PRIORITIES, {
    message: `Priority must be one of ${TICKET_PRIORITIES.join(', ')}.`,
  }),
  status: z
    .enum(TICKET_STATUSES, {
      message: `Status must be one of ${TICKET_STATUSES.join(', ')}.`,
    })
    .optional(),
  assignee_id: uuidString.nullable().optional(),
  tags: z.array(uuidString).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: z
    .string({ message: 'Title must be a string.' })
    .trim()
    .min(1, 'Title is required.')
    .optional(),
  description: z.string().optional(),
  priority: z
    .enum(TICKET_PRIORITIES, {
      message: `Priority must be one of ${TICKET_PRIORITIES.join(', ')}.`,
    })
    .optional(),
  status: z
    .enum(TICKET_STATUSES, {
      message: `Status must be one of ${TICKET_STATUSES.join(', ')}.`,
    })
    .optional(),
  assignee_id: uuidString.nullable().optional(),
  tags: z.array(uuidString).optional(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

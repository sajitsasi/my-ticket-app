import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.string({ message: 'Body is required.' }),
});

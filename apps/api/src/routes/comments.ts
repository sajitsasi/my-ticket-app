import { Router } from 'express';
import { query } from '../db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requirePersona } from '../middleware/persona.js';
import { createCommentSchema } from '../schemas/comments.js';

export const commentsRouter: Router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CommentRow {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: Date;
}

async function ticketExists(id: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    'SELECT id FROM tickets WHERE id = $1',
    [id]
  );
  return result.rows.length > 0;
}

commentsRouter.get('/:id/comments', requirePersona, async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    if (!UUID_RE.test(id)) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    if (!(await ticketExists(id))) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    const result = await query<CommentRow>(
      `SELECT c.id, c.ticket_id, c.author_id, u.name AS author_name, c.body, c.created_at
       FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.ticket_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

commentsRouter.post('/:id/comments', requirePersona, async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    if (!UUID_RE.test(id)) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    if (!(await ticketExists(id))) {
      throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    }

    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Comment payload is invalid.',
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }

    const author = req.user!;
    const { body: commentBody } = parsed.data;

    const inserted = await query<CommentRow>(
      `INSERT INTO comments (ticket_id, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, ticket_id, author_id, body, created_at`,
      [id, author.id, commentBody]
    );

    const row = inserted.rows[0]!;

    res.status(201).json({
      ...row,
      author_name: author.name,
    });
  } catch (err) {
    next(err);
  }
});

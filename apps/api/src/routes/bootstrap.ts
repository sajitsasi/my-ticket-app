import { Router } from 'express';
import { query } from '../db.js';
import type { User } from '../types.js';

export const bootstrapRouter: Router = Router();

bootstrapRouter.get('/', async (_req, res, next) => {
  try {
    const result = await query<User>(
      'SELECT id, name, email, role FROM users ORDER BY created_at ASC'
    );
    const users = result.rows;
    const defaultPersonaId = users[0]?.id ?? null;
    res.json({ users, defaultPersonaId });
  } catch (err) {
    next(err);
  }
});

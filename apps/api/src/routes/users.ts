import { Router } from 'express';
import { query } from '../db.js';
import type { User } from '../types.js';

export const usersRouter: Router = Router();

usersRouter.get('/', async (_req, res, next) => {
  try {
    const result = await query<User>(
      'SELECT id, name, email, role FROM users ORDER BY created_at ASC'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

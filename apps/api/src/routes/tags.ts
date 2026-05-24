import { Router } from 'express';
import { query } from '../db.js';
import { requirePersona } from '../middleware/persona.js';

interface TagRow {
  id: string;
  name: string;
  color: string;
}

export const tagsRouter: Router = Router();

tagsRouter.get('/', requirePersona, async (_req, res, next) => {
  try {
    const result = await query<TagRow>(
      'SELECT id, name, color FROM tags ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

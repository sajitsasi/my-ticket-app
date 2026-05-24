import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { query } from '../db.js';
import type { User } from '../types.js';
import { ApiError } from './errorHandler.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const persona: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const headerValue = req.header('x-user-id');
  if (!headerValue || !UUID_RE.test(headerValue)) {
    return next();
  }

  try {
    const result = await query<User>(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [headerValue]
    );
    const row = result.rows[0];
    if (row) {
      req.user = row;
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const requirePersona: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(
      new ApiError(401, 'UNAUTHENTICATED', 'A valid X-User-Id header is required.')
    );
  }
  next();
};

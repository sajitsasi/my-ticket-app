import type { ErrorRequestHandler, RequestHandler } from 'express';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found.`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    const body: { error: { code: string; message: string; details?: unknown } } = {
      error: { code: err.code, message: err.message },
    };
    if (err.details !== undefined) {
      body.error.details = err.details;
    }
    res.status(err.status).json(body);
    return;
  }

  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};

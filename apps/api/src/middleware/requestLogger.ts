import type { RequestHandler } from 'express';

export const requestLogger: RequestHandler = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    // eslint-disable-next-line no-console
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`
    );
  });
  next();
};

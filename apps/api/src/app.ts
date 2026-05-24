import cors from 'cors';
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { persona } from './middleware/persona.js';
import { requestLogger } from './middleware/requestLogger.js';
import { bootstrapRouter } from './routes/bootstrap.js';
import { commentsRouter } from './routes/comments.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';
import { tagsRouter } from './routes/tags.js';
import { ticketsRouter } from './routes/tickets.js';
import { usersRouter } from './routes/users.js';
import { env } from './env.js';
import './types.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: env.webOrigin,
      credentials: false,
    })
  );
  app.use(express.json());
  app.use(requestLogger);
  app.use(persona);

  app.use('/health', healthRouter);
  app.use('/bootstrap', bootstrapRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/tickets', commentsRouter);
  app.use('/api/dashboard', dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

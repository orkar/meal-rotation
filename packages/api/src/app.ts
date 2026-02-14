import cors from 'cors';
import express from 'express';

import { errorHandler } from './middleware/error-handler.js';
import recipesRouter from './routes/recipes.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: (_origin, cb) => cb(null, true),
      credentials: true
    })
  );

  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/recipes', recipesRouter);

  app.use(errorHandler);

  return app;
}

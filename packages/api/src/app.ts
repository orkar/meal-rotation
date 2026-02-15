import cors from 'cors';
import express from 'express';

import { errorHandler } from './middleware/error-handler.js';
import { attachSessionUser } from './middleware/session-user.js';
import { requireAuth } from './middleware/require-auth.js';
import authRouter from './routes/auth.js';
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

  app.use(attachSessionUser);

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/auth', authRouter);
  app.use('/recipes', requireAuth, recipesRouter);

  app.use(errorHandler);

  return app;
}

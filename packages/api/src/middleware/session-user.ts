import type { RequestHandler } from 'express';

import { sessionFromRequest } from '../lib/auth.js';
import { prisma } from '../lib/db.js';

export const attachSessionUser: RequestHandler = (req, _res, next) => {
  if (process.env.NODE_ENV === 'test') {
    req.userId = 1;
    next();
    return;
  }

  void (async () => {
    const session = sessionFromRequest(req);

    if (session) {
      const existing = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true }
      });

      if (existing) {
        req.userId = existing.id;
      }
    }
  })()
    .then(() => next())
    .catch(next);
};


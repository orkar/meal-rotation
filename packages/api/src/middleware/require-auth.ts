import type { RequestHandler } from 'express';

import { HttpError } from '../lib/http-error.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.userId) {
    next(new HttpError(401, 'Please sign in'));
    return;
  }

  next();
};


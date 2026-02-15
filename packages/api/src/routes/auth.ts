import { Router } from 'express';
import { z } from 'zod';

import {
  createSessionToken,
  hashPassword,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  sessionFromRequest,
  verifyPassword
} from '../lib/auth.js';
import { asyncRoute } from '../lib/async-route.js';
import { prisma } from '../lib/db.js';
import { HttpError } from '../lib/http-error.js';
import { ensureUserDefaults } from '../lib/user-defaults.js';

const router = Router();

const credentialsSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

router.post(
  '/register',
  asyncRoute(async (req, res) => {
    const body = credentialsSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true }
    });

    if (existing) {
      throw new HttpError(409, 'An account with this email already exists');
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash
      },
      select: {
        id: true,
        email: true
      }
    });

    await ensureUserDefaults(user.id);

    res.setHeader('Set-Cookie', serializeSessionCookie(createSessionToken(user.id)));
    res.status(201).json({ user });
  })
);

router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const body = credentialsSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        passwordHash: true
      }
    });

    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password');
    }

    res.setHeader('Set-Cookie', serializeSessionCookie(createSessionToken(user.id)));
    res.json({
      user: {
        id: user.id,
        email: user.email
      }
    });
  })
);

router.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', serializeClearedSessionCookie());
  res.json({ ok: true });
});

router.get(
  '/me',
  asyncRoute(async (req, res) => {
    const session = sessionFromRequest(req);

    if (!session) {
      res.json({ user: null });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true
      }
    });

    if (!user) {
      res.setHeader('Set-Cookie', serializeClearedSessionCookie());
      res.json({ user: null });
      return;
    }

    res.json({ user });
  })
);

export default router;


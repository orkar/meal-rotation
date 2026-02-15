import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { Request } from 'express';

const scrypt = promisify(scryptCallback);

const SESSION_COOKIE_NAME = 'mr_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-session-secret-change-me';

function sign(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function safeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;

  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [salt, hashHex] = encodedHash.split(':');
  if (!salt || !hashHex) {
    return false;
  }

  const storedHash = Buffer.from(hashHex, 'hex');
  const candidateHash = (await scrypt(password, salt, storedHash.length)) as Buffer;

  if (storedHash.length !== candidateHash.length) {
    return false;
  }

  return timingSafeEqual(storedHash, candidateHash);
}

export function createSessionToken(userId: number, now = Date.now()): string {
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = sign(payload);

  return `${payload}.${signature}`;
}

export function parseSessionToken(token: string, now = Date.now()): { userId: number } | null {
  const [userIdRaw, expiresAtRaw, signature] = token.split('.');
  if (!userIdRaw || !expiresAtRaw || !signature) {
    return null;
  }

  const userId = Number.parseInt(userIdRaw, 10);
  const expiresAt = Number.parseInt(expiresAtRaw, 10);

  if (!Number.isInteger(userId) || userId < 1 || !Number.isInteger(expiresAt) || expiresAt < now) {
    return null;
  }

  const payload = `${userId}.${expiresAt}`;
  const expectedSignature = sign(payload);

  if (!safeStringEquals(signature, expectedSignature)) {
    return null;
  }

  return { userId };
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};

  for (const cookie of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    if (!rawKey || rawValue.length === 0) {
      continue;
    }

    const joinedValue = rawValue.join('=');

    try {
      cookies[rawKey] = decodeURIComponent(joinedValue);
    } catch {
      cookies[rawKey] = joinedValue;
    }
  }

  return cookies;
}

function baseCookieAttributes(): string[] {
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax'];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes;
}

export function serializeSessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    ...baseCookieAttributes(),
    `Max-Age=${SESSION_TTL_SECONDS}`
  ].join('; ');
}

export function serializeClearedSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    ...baseCookieAttributes(),
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ].join('; ');
}

export function sessionFromRequest(req: Request): { userId: number } | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];

  if (!rawToken) {
    return null;
  }

  return parseSessionToken(rawToken);
}


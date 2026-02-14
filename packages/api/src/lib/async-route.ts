import type { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

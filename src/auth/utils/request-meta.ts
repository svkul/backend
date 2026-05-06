import type { Request } from 'express';
import type { RequestMeta } from '../types/request-meta.types';

export function extractRequestMeta(req: Request): RequestMeta {
  const userAgent = req.headers['user-agent'];
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : (forwardedFor ?? req.socket.remoteAddress);

  return { userAgent, ip };
}

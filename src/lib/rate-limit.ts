import type { NextFunction, Response } from "express";
import type { IUserRequest } from "../interface";
import { redis } from "./redis-connection";

interface RateLimitOptions {
  windowSeconds: number;
  max: number;
  keyPrefix: string;
  // Without a per-account identity, an attacker rotating IPs against one account is never limited.
  identify?: (req: IUserRequest) => string | undefined;
  message?: string;
}

// Fails open: a Redis outage locking everyone out of sign-in is worse than briefly
// losing rate limiting.
export const rateLimit = function (options: RateLimitOptions) {
  const { windowSeconds, max, keyPrefix, identify, message } = options;

  return async function (req: IUserRequest, res: Response, next: NextFunction) {
    try {
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
      const extra = identify?.(req);
      const key = `ratelimit:${keyPrefix}:${extra ? `${extra}:` : ""}${ip}`;

      const count = await redis.incr(key);

      // Only set the TTL on first hit, or the window would slide forward on
      // every request and never expire under sustained load.
      if (count === 1) await redis.expire(key, windowSeconds);

      if (count > max) {
        const ttl = await redis.ttl(key);

        res.setHeader("Retry-After", Math.max(ttl, 1));
        return res.status(429).json({
          message: message ?? "Too many attempts. Please try again shortly.",
          retryAfterSeconds: Math.max(ttl, 1),
        });
      }

      return next();
    } catch (error) {
      console.error("Rate limiter unavailable, allowing request:", error);
      return next();
    }
  };
};

const ATTEMPT_LIMIT = 5;

// Separate from rateLimit: a six-digit OTP is only a million guesses, so request
// limiting alone slows account takeover rather than preventing it.
export const otpAttempts = {
  key: (scope: string, userId: string) => `otp-attempts:${scope}:${userId}`,

  async record(scope: string, userId: string, ttlSeconds: number) {
    const key = this.key(scope, userId);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttlSeconds);
    return count;
  },

  async isExhausted(scope: string, userId: string) {
    const value = await redis.get(this.key(scope, userId));
    return Number(value ?? 0) >= ATTEMPT_LIMIT;
  },

  async clear(scope: string, userId: string) {
    await redis.del(this.key(scope, userId));
  },

  limit: ATTEMPT_LIMIT,
};

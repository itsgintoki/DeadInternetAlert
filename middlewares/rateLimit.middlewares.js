import redis from "../db/redis.js";

/**
 * Global Redis-backed rate limiting middleware.
 * Uses atomic increments and TTL expiration in Redis.
 *
 * @param {number} limit - Maximum number of requests allowed in the window
 * @param {number} windowSec - Window size in seconds
 */
export const globalRateLimiter = (limit = 100, windowSec = 60) => {
  return async (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const key = `ip:${ip}:count`;

    try {
      const multi = redis.multi();
      multi.incr(key);
      multi.ttl(key);

      const results = await multi.exec();
      
      if (!results || results.length < 2) {
        throw new Error("Redis multi command failed to return results");
      }

      const count = results[0][1];
      const ttl = results[1][1];

      // If it is a new key or TTL was not set (ttl is -1 or less)
      if (ttl === -1 || ttl === -2) {
        await redis.expire(key, windowSec);
      }

      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - count));

      if (count > limit) {
        return res.status(429).json({
          success: false,
          message: "Too many requests, please try again later.",
        });
      }
      next();
    } catch (err) {
      console.error("Rate limiter middleware error:", err);
      // Soft-fail: if Redis fails, still allow the request to proceed in production
      next();
    }
  };
};

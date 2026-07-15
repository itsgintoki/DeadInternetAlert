import redis from "../db/redis.js";

/**
 * Global Redis-backed rate limiting middleware.
 * Uses atomic increments and TTL expiration in Redis.
 *
 * @param {number} limit - Maximum number of requests allowed in the window
 * @param {number} windowSec - Window size in seconds
 */
export const globalRateLimiter = (limit = 100, windowSec = 60, { failClosed = false } = {}) => {
  return async (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const key = `ip:${ip}:count`;

    try {
      const [count, ttl] = await redis.eval(
        'local count = redis.call("INCR", KEYS[1]); if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]); end; return {count, redis.call("TTL", KEYS[1])}',
        1,
        key,
        windowSec,
      );

      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - count));

      if (count > limit) {
        res.setHeader('Retry-After', Math.max(1, ttl));
        return res.status(429).json({
          success: false,
          message: "Too many requests, please try again later.",
        });
      }
      next();
    } catch (err) {
      console.error("Rate limiter middleware error:", err);
      if (failClosed) return res.status(503).json({ success: false, message: 'Rate limiting is temporarily unavailable.' });
      next();
    }
  };
};

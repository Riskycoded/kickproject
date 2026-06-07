// Simple, offline-safe in-memory rate limiter middleware
const rateLimitStore = {};

function rateLimiter(limit, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

    if (!rateLimitStore[ip]) {
      rateLimitStore[ip] = [];
    }

    // Filter out timestamps outside the current sliding window
    rateLimitStore[ip] = rateLimitStore[ip].filter(timestamp => now - timestamp < windowMs);

    if (rateLimitStore[ip].length >= limit) {
      console.log(`Rate limit exceeded for IP: ${ip}`);
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    rateLimitStore[ip].push(now);
    next();
  };
}

// Periodically prune stale entries (older than 1 hour) every 5 minutes
// .unref() ensures this background timer does not block process termination or test exit
setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimitStore) {
    rateLimitStore[ip] = rateLimitStore[ip].filter(timestamp => now - timestamp < 3600000);
    if (rateLimitStore[ip].length === 0) {
      delete rateLimitStore[ip];
    }
  }
}, 300000).unref();

module.exports = rateLimiter;

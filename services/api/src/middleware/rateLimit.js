// Fixed-window in-memory rate limiter (per process). Put a shared store (Redis) behind it when scaling out.
const { HttpError } = require('./errors');

function rateLimit({ windowMs, max, key = req => req.ip, message = 'Too many attempts – try again later' }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset <= now) { h = { n: 0, reset: now + windowMs }; hits.set(k, h); }
    h.n++;
    res.set('RateLimit-Remaining', String(Math.max(0, max - h.n)));
    if (h.n > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return next(new HttpError(429, message));
    }
    next();
  };
}

module.exports = { rateLimit };

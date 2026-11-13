function createReviewRateLimiter({ limit = 10, windowMs = 60_000, now = Date.now } = {}) {
    const clients = new Map();

    return function reviewRateLimit(req, res, next) {
        const currentTime = now();
        const clientId = req.ip || req.socket?.remoteAddress || 'unknown';
        let bucket = clients.get(clientId);

        if (!bucket || currentTime >= bucket.resetAt) {
            bucket = { count: 0, resetAt: currentTime + windowMs };
            clients.set(clientId, bucket);
        }

        const remaining = Math.max(0, limit - bucket.count - 1);
        res.setHeader('RateLimit-Limit', String(limit));
        res.setHeader('RateLimit-Remaining', String(remaining));
        res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - currentTime) / 1000)));

        if (bucket.count >= limit) {
            res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))));
            return res.status(429).send('Review limit reached. Try again after the rate limit resets.');
        }

        bucket.count += 1;
        if (clients.size > 1000) {
            for (const [id, entry] of clients) {
                if (currentTime >= entry.resetAt) clients.delete(id);
            }
        }
        next();
    };
}

module.exports = createReviewRateLimiter;

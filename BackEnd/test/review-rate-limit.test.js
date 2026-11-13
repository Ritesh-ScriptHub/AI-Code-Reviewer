const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const createReviewRateLimiter = require('../src/middleware/review-rate-limit');

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: undefined,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        send(body) { this.body = body; return this; },
    };
}

describe('review rate limiter', () => {
    it('allows the configured number of requests and rejects excess until the window resets', () => {
        let now = 1000;
        let nextCalls = 0;
        const limiter = createReviewRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });
        const req = { ip: 'test-client', socket: {} };
        const first = createResponse();
        limiter(req, first, () => { nextCalls += 1; });
        const second = createResponse();
        limiter(req, second, () => { nextCalls += 1; });
        const blocked = createResponse();
        limiter(req, blocked, () => { nextCalls += 1; });

        assert.equal(nextCalls, 2);
        assert.equal(blocked.statusCode, 429);
        assert.ok(Number(blocked.headers['Retry-After']) > 0);
        assert.match(blocked.body, /Review limit reached/);

        now += 60_000;
        limiter(req, createResponse(), () => { nextCalls += 1; });
        assert.equal(nextCalls, 3);
    });
});

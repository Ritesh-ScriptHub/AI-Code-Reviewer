const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createAiController } = require('../src/controllers/ai.controller');

function responseRecorder() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        send(body) { this.body = body; return this; },
        json(body) { this.body = body; return this; },
    };
}

async function callController(body, reviewService = async () => ({ summary: 'Reviewed', findings: [] })) {
    const res = responseRecorder();
    await createAiController(reviewService).getReview({ body }, res);
    return res;
}

describe('AI review controller', () => {
    it('rejects missing code before calling the provider', async () => {
        let called = false;
        const res = await callController({ code: '  ' }, async () => { called = true; });
        assert.equal(res.statusCode, 400);
        assert.equal(called, false);
    });

    it('rejects invalid options and file counts', async () => {
        assert.equal((await callController({ code: 'x', focus: 'all' })).statusCode, 400);
        assert.equal((await callController({ files: Array.from({ length: 11 }, (_, i) => ({ path: `${i}.js`, content: 'x' })) })).statusCode, 400);
    });

    it('enforces per-file and combined content limits', async () => {
        const oversizedFile = await callController({ files: [{ path: 'large.js', content: 'x'.repeat(256 * 1024 + 1) }] });
        assert.equal(oversizedFile.statusCode, 413);
        const oversizedTotal = await callController({ files: Array.from({ length: 5 }, (_, i) => ({ path: `${i}.js`, content: 'x'.repeat(220 * 1024) })) });
        assert.equal(oversizedTotal.statusCode, 413);
    });

    it('passes validated review options and files to the service', async () => {
        const files = [{ path: 'app.py', content: 'print(1)' }];
        let argumentsReceived;
        const res = await callController({ files, language: 'python', focus: 'security', strictness: 'strict' }, async (...args) => {
            argumentsReceived = args;
            return { summary: 'Reviewed', findings: [] };
        });
        assert.deepEqual(argumentsReceived, [files, { language: 'python', focus: 'security', strictness: 'strict' }]);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.summary, 'Reviewed');
    });

    it('maps provider outages, timeouts, missing keys, and invalid credentials to useful statuses', async (t) => {
        const cases = [
            ['provider outage', Object.assign(new Error('busy'), { status: 503 }), 503, /temporarily unavailable/],
            ['request timeout', Object.assign(new Error('slow'), { code: 'REVIEW_TIMEOUT' }), 504, /too long/],
            ['missing key', new Error('GOOGLE_GEMINI_KEY is not configured'), 503, /GOOGLE_GEMINI_KEY/],
            ['invalid key', Object.assign(new Error('denied'), { status: 403 }), 502, /rejected the API key/],
        ];
        for (const [name, error, expectedStatus, expectedMessage] of cases) {
            await t.test(name, async () => {
                const previousLog = console.error;
                console.error = () => {};
                try {
                    const res = await callController({ code: 'const x = 1' }, async () => { throw error; });
                    assert.equal(res.statusCode, expectedStatus);
                    assert.match(res.body, expectedMessage);
                } finally {
                    console.error = previousLog;
                }
            });
        }
    });
});

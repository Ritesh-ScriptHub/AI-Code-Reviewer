const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

describe('API request parsing', () => {
    let server;
    let baseUrl;

    before(async () => {
        server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    it('returns a readable 400 for malformed JSON', async () => {
        const response = await fetch(`${baseUrl}/ai/get-review`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{invalid',
        });
        assert.equal(response.status, 400);
        assert.match(await response.text(), /valid JSON/);
    });

    it('returns a readable 413 when the JSON request body exceeds the cap', async () => {
        const response = await fetch(`${baseUrl}/ai/get-review`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: 'x'.repeat(2300 * 1024) }),
        });
        assert.equal(response.status, 413);
        assert.match(await response.text(), /up to 1 MiB/);
    });
});

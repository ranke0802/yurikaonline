import http from 'node:http';
import https from 'node:https';
import { RELEASE_LIMITS } from './qa-network-policy.cjs';
// No fetch, redirects, retry, credentials, image body or open-ended stream.
// Budgets count response body bytes; HTTP/TLS headers are additional overhead.
export function createBoundedClient(policy) {
    policy = Object.freeze({ ...policy });
    if (!Number.isInteger(policy.maxRequests) || policy.maxRequests < 1 || policy.maxRequests > RELEASE_LIMITS.requests
        || !Number.isInteger(policy.maxBytes) || policy.maxBytes < 1 || policy.maxBytes > RELEASE_LIMITS.bytes) {
        throw Error('Release client hard ceiling: 8 requests / 524288 response body bytes');
    }
    const stats = { requests: 0, bytes: 0, maxRequests: policy.maxRequests, maxBytes: policy.maxBytes };
    let failed = false;
    let queue = Promise.resolve();
    async function perform(path, { method = 'GET', expectedBytes } = {}) {
        if (failed) throw Error('Release checker stopped after its first failure');
        try {
            if ((path !== '/' && !/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(path)) || path.includes('..')) throw Error('Invalid release path');
            if (!['GET', 'HEAD'].includes(method)) throw Error('Invalid release method');
            if (method === 'GET' && /\.(webp|png|svg|jpe?g|gif)$/i.test(path)) throw Error('Release image bodies are prohibited');
            if (stats.requests >= policy.maxRequests) throw Error('Release request budget exceeded');
            const remaining = policy.maxBytes - stats.bytes;
            if (remaining <= 0 || (method === 'GET' && expectedBytes > remaining)) throw Error('Release byte budget exceeded');
            stats.requests++;
            return await new Promise((resolve, reject) => {
                const url = new URL(path, policy.origin), client = url.protocol === 'https:' ? https : http;
                const request = client.request(url, { method, maxHeaderSize: 16384, headers: { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache', Connection: 'close' } }, response => {
                    const fail = message => { response.destroy(); request.destroy(); reject(Error(message)); };
                    if (response.statusCode !== 200) return fail(`Release HTTP ${response.statusCode}; no retry or redirect`);
                    if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') return fail('Unexpected content encoding');
                    const declared = response.headers['content-length'];
                    const length = /^\d+$/.test(declared || '') ? Number(declared) : NaN;
                    if (method === 'GET' && (!Number.isSafeInteger(length) || length > remaining || (expectedBytes != null && length !== expectedBytes))) return fail('Release response length exceeds budget or differs from local artifact');
                    const chunks = []; let size = 0;
                    response.on('data', chunk => {
                        size += chunk.length; stats.bytes += chunk.length;
                        if (stats.bytes > policy.maxBytes || size > length) return fail('Release stream exceeded declared size or budget');
                        chunks.push(chunk);
                    });
                    response.once('error', reject);
                    response.once('end', () => {
                        if (method === 'GET' && size !== length) return fail('Truncated release response');
                        request.destroy();
                        resolve({ bytes: Buffer.concat(chunks), headers: response.headers });
                    });
                });
                const timeout = setTimeout(() => request.destroy(Error('Release request timeout; no retry')), 10000);
                request.once('close', () => clearTimeout(timeout)); request.once('error', reject); request.end();
            });
        } catch (error) { failed = true; throw error; }
    }
    // Even concurrently submitted probes share one serial request/byte budget.
    // A failure marks the client stopped before any queued probe can start.
    function get(...args) {
        const result = queue.then(() => perform(...args));
        queue = result.catch(() => {});
        return result;
    }
    return { get, get stats() { return { ...stats }; } };
}

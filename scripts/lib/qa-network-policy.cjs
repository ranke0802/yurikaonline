'use strict';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const RELEASE_ORIGIN = 'https://yurika-online.web.app';
const RELEASE_LIMITS = Object.freeze({ requests: 8, bytes: 512 * 1024 });

function assertLoopbackUrl(value, label = 'QA URL', base) {
    let url;
    try { url = new URL(String(value), base); }
    catch { throw new Error(`QA_NETWORK_POLICY: ${label} must be an absolute loopback URL`); }
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
        || !LOOPBACK.has(url.hostname) || url.username || url.password) {
        throw new Error(`QA_NETWORK_POLICY: ${label} must use 127.0.0.1, localhost or [::1]; remote regression tests are prohibited`);
    }
    return url;
}

function assertLocalQaEnvironment(env = process.env) {
    for (const [key, value] of Object.entries(env)) {
        if (value && (/^QA_.*URL$/.test(key) || ['BASE_URL', 'PLAYWRIGHT_TEST_BASE_URL'].includes(key))) {
            assertLoopbackUrl(value, key);
        }
        if (value && /^FIREBASE_.*_EMULATOR_HOST$/.test(key)) assertLoopbackUrl(`http://${value}`, key);
    }
}

function releasePolicy(env = process.env) {
    const origin = env.YURIKA_RELEASE_ORIGIN || 'http://127.0.0.1:8100';
    let url;
    try { url = new URL(origin); }
    catch { throw new Error('RELEASE_NETWORK_POLICY: invalid origin'); }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('RELEASE_NETWORK_POLICY: specify an origin without credentials, path or query');
    }
    const local = LOOPBACK.has(url.hostname) && ['http:', 'https:'].includes(url.protocol);
    if (!local && (url.origin !== RELEASE_ORIGIN || env.YURIKA_REMOTE_CHECK_APPROVED !== '1')) {
        throw new Error('RELEASE_NETWORK_POLICY: remote verification requires explicit approval for the configured Hosting origin');
    }
    function limit(key, maximum) {
        const text = env[key] || (local ? String(maximum) : '');
        if (!/^[1-9]\d*$/.test(text) || Number(text) > maximum) {
            throw new Error(`RELEASE_NETWORK_POLICY: ${key} must be explicitly set between 1 and ${maximum}`);
        }
        return Number(text);
    }
    return { origin: url.origin, remote: !local,
        maxRequests: limit('YURIKA_RELEASE_MAX_REQUESTS', RELEASE_LIMITS.requests),
        maxBytes: limit('YURIKA_RELEASE_MAX_BYTES', RELEASE_LIMITS.bytes) };
}

module.exports = { assertLoopbackUrl, assertLocalQaEnvironment, releasePolicy, RELEASE_ORIGIN, RELEASE_LIMITS };

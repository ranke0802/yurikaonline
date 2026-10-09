'use strict';

// Every executable QA network/browser script imports this before doing work.
// The release verifier uses a separate, explicitly approved and budgeted client.
const { assertLoopbackUrl, assertLocalQaEnvironment } = require('./qa-network-policy.cjs');
assertLocalQaEnvironment();

const marker = Symbol.for('yurika.localQaNetworkPolicy');
if (!globalThis[marker]) {
    const http = require('node:http');
    const https = require('node:https');
    const state = globalThis[marker] = { blockedProxyRequests: 0 };
    const originalFetch = globalThis.fetch;
    function requestUrl(input, protocol) {
        if (typeof input === 'string' || input instanceof URL) return input;
        if (input?.url) return input.url;
        let host = input?.hostname || input?.host || 'localhost';
        if (host === '::1') host = '[::1]';
        return `${input?.protocol || protocol}//${host}${input?.port ? ':' + input.port : ''}${input?.path || '/'}`;
    }
    globalThis.fetch = function(input, options) {
        const url = input?.url || String(input);
        if (!/^(data:|blob:)/.test(url)) assertLoopbackUrl(url, 'fetch target');
        // Never let an allowed localhost endpoint redirect fetch to production.
        return originalFetch.call(this, input, { ...options, redirect: 'error' });
    };
    for (const [client, protocol] of [[http, 'http:'], [https, 'https:']]) {
        for (const method of ['request', 'get']) {
            const original = client[method];
            client[method] = function(input, ...args) {
                if (!input?.socketPath) assertLoopbackUrl(requestUrl(input, protocol), `${protocol} ${method} target`);
                if (args[0] && typeof args[0] === 'object' && (args[0].hostname || args[0].host)) {
                    assertLoopbackUrl(requestUrl(args[0], protocol), `${protocol} request override`);
                }
                return original.call(this, input, ...args);
            };
        }
    }
    require('node:module').syncBuiltinESMExports();

    // A local deny proxy blocks browser subresources/redirects without route(),
    // which would disable HTTP cache and invalidate cold/warm/update testing.
    let proxyPromise;
    function denyProxy() {
        if (!proxyPromise) proxyPromise = new Promise((resolve, reject) => {
            const server = http.createServer((_req, res) => {
                state.blockedProxyRequests++;
                res.writeHead(403, { 'Content-Length': '0', Connection: 'close' }); res.end();
            });
            server.on('connect', (_req, socket) => {
                state.blockedProxyRequests++;
                socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
            });
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => { server.unref(); resolve(`http://127.0.0.1:${server.address().port}`); });
        });
        return proxyPromise;
    }
    const wrapped = new WeakSet();
    function wrapPage(page, baseURL) {
        if (wrapped.has(page)) return page;
        wrapped.add(page);
        const go = page.goto;
        page.goto = function(url, ...args) {
            if (!/^(about:blank$|data:|blob:)/.test(String(url))) assertLoopbackUrl(url, 'browser navigation', baseURL);
            return go.call(this, url, ...args);
        };
        return page;
    }
    function wrapContext(context, baseURL) {
        if (wrapped.has(context)) return context;
        wrapped.add(context);
        const create = context.newPage;
        context.newPage = async function(...args) { return wrapPage(await create.apply(this, args), baseURL); };
        context.on('page', page => wrapPage(page, baseURL));
        return context;
    }
    function wrapBrowser(browser) {
        const createContext = browser.newContext;
        browser.newContext = async function(options = {}) {
            if (options.baseURL) assertLoopbackUrl(options.baseURL, 'browser baseURL');
            if (options.proxy) throw new Error('QA_NETWORK_POLICY: per-context proxy overrides are prohibited');
            return wrapContext(await createContext.call(this, options), options.baseURL);
        };
        const createPage = browser.newPage;
        browser.newPage = async function(options = {}) {
            if (options.baseURL) assertLoopbackUrl(options.baseURL, 'browser baseURL');
            if (options.proxy) throw new Error('QA_NETWORK_POLICY: per-page proxy overrides are prohibited');
            return wrapPage(await createPage.call(this, options), options.baseURL);
        };
        return browser;
    }
    const playwright = require('playwright');
    const apiContext = playwright.request.newContext;
    playwright.request.newContext = async function(options = {}) {
        if (options.baseURL) assertLoopbackUrl(options.baseURL, 'API baseURL');
        if (options.proxy) throw new Error('QA_NETWORK_POLICY: API proxy overrides are prohibited');
        return apiContext.call(this, { ...options, proxy: { server: await denyProxy(), bypass: 'localhost,127.0.0.1,[::1]' } });
    };
    for (const type of [playwright.chromium, playwright.firefox, playwright.webkit]) {
        const launch = type.launch;
        type.launch = async function(options = {}) {
            if (options.proxy || (options.args || []).some(arg => /^--proxy-|^--no-proxy-server/.test(arg))) {
                throw new Error('QA_NETWORK_POLICY: browser proxy overrides are prohibited');
            }
            const server = await denyProxy();
            return wrapBrowser(await launch.call(this, { ...options,
                proxy: { server, bypass: 'localhost,127.0.0.1,[::1]' } }));
        };
        for (const method of ['connect', 'connectOverCDP', 'launchPersistentContext']) {
            if (typeof type[method] === 'function') type[method] = async () => {
                throw new Error('QA_NETWORK_POLICY: attached/persistent browsers are prohibited in project QA; use isolated loopback contexts');
            };
        }
    }
}

module.exports = globalThis[marker];

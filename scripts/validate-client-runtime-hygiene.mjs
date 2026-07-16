#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const logger = readFileSync('src/js/utils/Logger.js', 'utf8');
const serviceWorker = readFileSync('sw.js', 'utf8');

function fail(message) {
    console.error(`[client-runtime-hygiene] ${message}`);
    process.exit(1);
}

if (!/static duplicateWindowMs\s*=\s*5000/.test(logger)
    || !/static burstWindowMs\s*=\s*5000/.test(logger)
    || !/warn:\s*40/.test(logger)
    || !/error:\s*20/.test(logger)
    || !/static duplicateLogState\s*=\s*new Map\(\)/.test(logger)
    || !/static burstLogState\s*=\s*new Map\(\)/.test(logger)
    || !/normalizeDuplicateKeyPart\(value\)/.test(logger)
    || !/monster_reward:<id>/.test(logger)
    || !/반복 로그/.test(logger)
    || !/버스트 로그/.test(logger)) {
    fail('Logger must rate-limit repeated semantic warnings and bounded warning bursts without losing the first visible signal');
}

if (!/static maxTrackedDuplicateKeys\s*=\s*256/.test(logger)
    || !/pruneDuplicateLogState\(now\s*=\s*Date\.now\(\)\)/.test(logger)) {
    fail('Logger duplicate tracking must be bounded so the rate limiter cannot become a leak');
}

if (!/const CACHE_ENTRY_LIMITS\s*=\s*\{[\s\S]*\[SHELL_CACHE\]:\s*32,[\s\S]*\[STATIC_CACHE\]:\s*320/.test(serviceWorker)
    || !/const CACHE_TRIM_INTERVAL_MS\s*=\s*60000/.test(serviceWorker)
    || !/async function trimCacheEntries\(cacheName,\s*cache,\s*options\s*=\s*\{\}\)/.test(serviceWorker)
    || !/keys\.slice\(0,\s*overflow\)\.map\(\(request\)\s*=>\s*cache\.delete\(request\)\)/.test(serviceWorker)) {
    fail('service worker runtime caches must have bounded per-version entry trimming');
}

if (!/async function putResponseInCache\(cacheName,\s*cache,\s*request,\s*response\)[\s\S]*try\s*\{[\s\S]*cache\.put\(request,\s*response\.clone\(\)\)[\s\S]*catch \(error\)/.test(serviceWorker)) {
    fail('service worker cache writes must not block network responses when browser storage fails');
}

if (!/ACTIVE_CACHES\.map\(async \(cacheName\) => \{[\s\S]*trimCacheEntries\(cacheName,\s*cache,\s*\{ force:\s*true \}\)/.test(serviceWorker)) {
    fail('service worker activation must trim active caches after deleting stale versions');
}

console.log('[client-runtime-hygiene] OK: bounded console repetition and PWA runtime cache growth');

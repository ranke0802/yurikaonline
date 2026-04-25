#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const DEFAULT_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8081/';
const CHROME_PATH = process.env.CHROME_PATH || DEFAULT_CHROME_PATH;
const CDP_PORT = Number(process.env.SMOKE_CDP_PORT || 9231);
const OUT_DIR = process.env.SMOKE_OUT_DIR || '/tmp/yurika-smoke';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCdp(timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
            if (res.ok) return;
        } catch (error) {
            // Chrome is still starting.
        }
        await sleep(160);
    }
    throw new Error(`Chrome DevTools did not become ready on port ${CDP_PORT}`);
}

async function createTarget() {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, {
        method: 'PUT'
    });
    if (!res.ok) throw new Error(`Failed to create CDP target: ${res.status}`);
    return res.json();
}

function createClient(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const logs = [];
    const events = new Map();

    ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result || {});
            return;
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            logs.push(`exception: ${msg.params?.exceptionDetails?.text || 'unknown'}`);
        }
        if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params?.type)) {
            logs.push(`${msg.params.type}: ${(msg.params.args || []).map((arg) => arg.value || arg.description || '').join(' ')}`);
        }
        events.get(msg.method)?.forEach((handler) => handler(msg.params || {}));
    });

    const opened = new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
    });

    return {
        logs,
        opened,
        on(method, handler) {
            if (!events.has(method)) events.set(method, []);
            events.get(method).push(handler);
        },
        send(method, params = {}) {
            const id = nextId++;
            ws.send(JSON.stringify({ id, method, params }));
            return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        },
        close() {
            ws.close();
        }
    };
}

async function evaluate(client, expression) {
    const result = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
    });
    return result.result?.value;
}

async function capture(client, name) {
    const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false
    });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const filePath = path.join(OUT_DIR, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
    return filePath;
}

async function runViewport(name, metrics, actions = []) {
    const target = await createTarget();
    const client = createClient(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    await client.send('Emulation.setDeviceMetricsOverride', metrics);
    await client.send('Page.navigate', { url: BASE_URL });
    await sleep(4500);

    for (const action of actions) {
        await action(client);
    }

    const state = await evaluate(client, `(() => {
        const opening = document.querySelector('#opening-scene-ui');
        const dialog = document.querySelector('#dialog-box');
        const loader = document.querySelector('#loading-overlay');
        const canvas = document.querySelector('#gameCanvas');
        const rect = canvas?.getBoundingClientRect?.();
        return {
            scene: window.game?.sceneManager?.currentScene?.constructor?.name || '',
            href: location.href,
            lang: document.documentElement.lang,
            openingVisible: !!opening && getComputedStyle(opening).display !== 'none',
            dialogVisible: !!dialog && getComputedStyle(dialog).display !== 'none',
            hasBackdrop: !!document.querySelector('#story-backdrop-layer') && !document.querySelector('#story-backdrop-layer').classList.contains('hidden'),
            charSelectVisible: !!document.querySelector('#char-select-ui') && getComputedStyle(document.querySelector('#char-select-ui')).display !== 'none',
            charChoices: [...document.querySelectorAll('#char-select-ui .character-choice')].map((b) => b.textContent.trim()),
            charPreviewRect: (() => {
                const r = document.querySelector('#char-select-ui .character-selection-preview')?.getBoundingClientRect?.();
                return r ? { width: Math.round(r.width), height: Math.round(r.height) } : null;
            })(),
            charConceptRect: (() => {
                const r = document.querySelector('#char-concept-art')?.getBoundingClientRect?.();
                return r ? {
                    top: Math.round(r.top),
                    bottom: Math.round(r.bottom),
                    width: Math.round(r.width),
                    height: Math.round(r.height)
                } : null;
            })(),
            charConceptSrc: document.querySelector('#char-concept-art')?.getAttribute('src') || '',
            charCardRect: (() => {
                const r = document.querySelector('#char-select-ui .char-card')?.getBoundingClientRect?.();
                return r ? {
                    top: Math.round(r.top),
                    bottom: Math.round(r.bottom),
                    width: Math.round(r.width),
                    height: Math.round(r.height)
                } : null;
            })(),
            charCanvasRect: (() => {
                const r = document.querySelector('#char-preview-canvas')?.getBoundingClientRect?.();
                return r ? { width: Math.round(r.width), height: Math.round(r.height) } : null;
            })(),
            charBackdrop: document.querySelector('#char-select-ui')
                ? getComputedStyle(document.querySelector('#char-select-ui')).backgroundImage
                : '',
            charAtmosphereDisplay: document.querySelector('#char-select-ui .scene-atmosphere')
                ? getComputedStyle(document.querySelector('#char-select-ui .scene-atmosphere')).display
                : '',
            spriteMetrics: (() => {
                const measure = (id) => {
                    const sheet = window.game?.resources?.cache?.get?.('character_spritesheet_' + id);
                    if (!sheet?.getContext) return null;
                    const cols = 8;
                    const rows = 5;
                    const cellW = sheet.width / cols;
                    const cellH = sheet.height / rows;
                    const ctx = sheet.getContext('2d', { willReadFrequently: true });
                    const data = ctx.getImageData(0, 0, sheet.width, sheet.height).data;
                    const heights = [];
                    const bottoms = [];
                    for (let row = 0; row < rows; row += 1) {
                        for (let col = 0; col < cols; col += 1) {
                            let minY = cellH;
                            let maxY = -1;
                            for (let y = 0; y < cellH; y += 1) {
                                for (let x = 0; x < cellW; x += 1) {
                                    const sx = Math.floor(col * cellW + x);
                                    const sy = Math.floor(row * cellH + y);
                                    const alpha = data[(sy * sheet.width + sx) * 4 + 3];
                                    if (alpha <= 24) continue;
                                    if (y < minY) minY = y;
                                    if (y > maxY) maxY = y;
                                }
                            }
                            if (maxY >= minY) {
                                heights.push(maxY - minY + 1);
                                bottoms.push(maxY + 1);
                            }
                        }
                    }
                    return {
                        heightSpread: Math.max(...heights) - Math.min(...heights),
                        bottomSpread: Math.max(...bottoms) - Math.min(...bottoms),
                        minHeight: Math.min(...heights),
                        maxHeight: Math.max(...heights),
                        minBottom: Math.min(...bottoms),
                        maxBottom: Math.max(...bottoms)
                    };
                };
                return {
                    father: measure('father'),
                    yurika: measure('yurika')
                };
            })(),
            loadingDisplay: loader ? getComputedStyle(loader).display : 'missing',
            dialogName: document.querySelector('#dialog-name')?.innerText || '',
            dialogText: document.querySelector('#dialog-text')?.innerText || '',
            languageButtons: [...document.querySelectorAll('.opening-lang-btn')].map((b) => b.textContent.trim()),
            canvasSize: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
            bodyClass: document.body.className,
            scroll: {
                innerWidth,
                innerHeight,
                documentWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body.scrollWidth
            }
        };
    })()`);

    const screenshot = await capture(client, name);
    const logs = client.logs.filter((entry) => !entry.includes('service worker controller changed'));
    client.close();
    return { name, state, logs, screenshot };
}

async function waitForSelector(client, selector, timeoutMs = 7000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const exists = await evaluate(client, `!!document.querySelector(${JSON.stringify(selector)})`);
        if (exists) return true;
        await sleep(160);
    }
    return false;
}

async function clickSelector(client, selector) {
    const found = await waitForSelector(client, selector);
    if (!found) {
        const state = await evaluate(client, `(() => ({
            scene: window.game?.sceneManager?.currentScene?.constructor?.name || '',
            bodyClass: document.body.className,
            text: document.body.innerText.slice(0, 300),
            openingHtml: document.querySelector('#opening-scene-ui')?.outerHTML?.slice(0, 300) || ''
        }))()`);
        throw new Error(`Cannot click missing selector: ${selector}\n${JSON.stringify(state, null, 2)}`);
    }

    const point = await evaluate(client, `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!point) throw new Error(`Cannot click missing selector: ${selector}`);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertState(condition, message, state) {
    if (!condition) throw new Error(`${message}\n${JSON.stringify(state, null, 2)}`);
}

async function main() {
    const userDataDir = path.join('/tmp', `yurika-smoke-chrome-${process.pid}`);
    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        `--remote-debugging-port=${CDP_PORT}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${userDataDir}`,
        'about:blank'
    ], {
        stdio: ['ignore', 'ignore', 'pipe']
    });

    const chromeErrors = [];
    chrome.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        if (!/DEPRECATED_ENDPOINT|GoogleUpdater|Trying to load the allocator/.test(text)) {
            chromeErrors.push(text.trim());
        }
    });

    try {
        await waitForCdp();
        const desktop = await runViewport('desktop-opening', {
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
            mobile: false
        });
        assertState(desktop.state.openingVisible, 'Desktop opening screen did not render', desktop.state);
        assertState(desktop.state.languageButtons.includes('한국어'), 'Desktop language buttons missing Korean', desktop.state);

        const language = await runViewport('desktop-language', {
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
            mobile: false
        }, [
            async (client) => {
                await clickSelector(client, '.opening-lang-btn[data-lang="en"]');
                await sleep(800);
            }
        ]);
        assertState(language.state.openingVisible, 'Language click unexpectedly left opening scene', language.state);
        assertState(language.state.lang === 'en', 'Language click did not switch document language to English', language.state);
        assertState(!language.state.dialogVisible, 'Language click unexpectedly opened prologue dialog', language.state);

        const prologue = await runViewport('desktop-prologue', {
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
            mobile: false
        }, [
            async (client) => {
                await clickSelector(client, '#opening-start-btn');
                await sleep(7000);
            }
        ]);
        assertState(prologue.state.scene === 'OpeningPrologueScene', 'Start button did not enter opening prologue scene', prologue.state);
        assertState(prologue.state.dialogVisible, 'Opening prologue dialog did not render', prologue.state);
        assertState(prologue.state.hasBackdrop, 'Opening prologue backdrop did not render', prologue.state);

        const characterSelect = await runViewport('desktop-character-select', {
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
            mobile: false
        }, [
            async (client) => {
                await evaluate(client, `(async () => {
                    const profile = {
                        name: '아빠',
                        level: 10,
                        exp: 44,
                        maxExp: 100,
                        manastone: 3017,
                        hp: 30,
                        maxHp: 30,
                        mp: 70,
                        maxMp: 70,
                        characterId: 'father',
                        questData: { prologueCompleted: true }
                    };
                    window.game.net.getPlayerProfile = async () => profile;
                    window.game.net.getLatestProfileSnapshot = async () => ({ profile });
                    await window.game.sceneManager.changeScene('charSelect', {
                        user: { uid: 'smoke-character-select', displayName: '아빠' }
                    });
                    await window.game.resources.loadCharacterSpriteSheet(false, 'father');
                    await window.game.resources.loadCharacterSpriteSheet(false, 'yurika');
                    return true;
                })()`);
                await sleep(1800);
            }
        ]);
        assertState(characterSelect.state.scene === 'CharacterSelectionScene', 'Character select scene did not render', characterSelect.state);
        assertState(characterSelect.state.charSelectVisible, 'Character select UI is not visible', characterSelect.state);
        assertState(characterSelect.state.charChoices.length === 2, 'Character choices missing', characterSelect.state);
        assertState(characterSelect.state.charCardRect?.top >= 0, 'Character select card is clipped at the top', characterSelect.state);
        assertState(characterSelect.state.charCardRect?.bottom <= characterSelect.state.scroll?.innerHeight, 'Character select card is clipped at the bottom', characterSelect.state);
        assertState(characterSelect.state.charConceptSrc.includes('father_concept_fullbody.webp'), 'Character select concept art missing', characterSelect.state);
        assertState(characterSelect.state.charConceptRect?.height >= 520, 'Character concept art is too small on desktop', characterSelect.state);
        assertState(characterSelect.state.charConceptRect?.bottom <= characterSelect.state.charCardRect?.bottom, 'Character concept art is clipped at the bottom', characterSelect.state);
        assertState(characterSelect.state.charBackdrop.includes('opening_guardian_oath.webp'), 'Character select generated backdrop missing', characterSelect.state);
        assertState(characterSelect.state.charAtmosphereDisplay === 'none', 'Legacy vector atmosphere is still visible on character select', characterSelect.state);
        assertState(characterSelect.state.spriteMetrics?.father?.heightSpread <= 1, 'Father sprite frame height is unstable', characterSelect.state);
        assertState(characterSelect.state.spriteMetrics?.father?.bottomSpread <= 1, 'Father sprite baseline is unstable', characterSelect.state);
        assertState(characterSelect.state.spriteMetrics?.yurika?.heightSpread <= 1, 'Yurika sprite frame height is unstable', characterSelect.state);
        assertState(characterSelect.state.spriteMetrics?.yurika?.bottomSpread <= 1, 'Yurika sprite baseline is unstable', characterSelect.state);

        const mobile = await runViewport('mobile-opening', {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: true,
            screenOrientation: { type: 'portraitPrimary', angle: 0 }
        });
        assertState(mobile.state.openingVisible, 'Mobile opening screen did not render', mobile.state);
        assertState(mobile.state.canvasSize?.width === 390, 'Mobile canvas width mismatch', mobile.state);
        assertState(mobile.state.scroll?.documentWidth <= mobile.state.scroll?.innerWidth, 'Mobile opening has horizontal overflow', mobile.state);

        const mobileLandscape = await runViewport('mobile-landscape-opening', {
            width: 844,
            height: 390,
            deviceScaleFactor: 2,
            mobile: true,
            screenOrientation: { type: 'landscapePrimary', angle: 90 }
        });
        assertState(mobileLandscape.state.openingVisible, 'Mobile landscape opening screen did not render', mobileLandscape.state);
        assertState(mobileLandscape.state.scroll?.documentWidth <= mobileLandscape.state.scroll?.innerWidth, 'Mobile landscape opening has horizontal overflow', mobileLandscape.state);

        const tablet = await runViewport('tablet-opening', {
            width: 820,
            height: 1180,
            deviceScaleFactor: 2,
            mobile: true,
            screenOrientation: { type: 'portraitPrimary', angle: 0 }
        });
        assertState(tablet.state.openingVisible, 'Tablet opening screen did not render', tablet.state);
        assertState(tablet.state.scroll?.documentWidth <= tablet.state.scroll?.innerWidth, 'Tablet opening has horizontal overflow', tablet.state);

        const results = [desktop, language, prologue, characterSelect, mobile, mobileLandscape, tablet];
        const logFailures = results.flatMap((result) => result.logs.map((log) => `${result.name}: ${log}`));
        assert(logFailures.length === 0, `Browser console warnings/errors:\n${logFailures.join('\n')}`);

        console.log(JSON.stringify({
            ok: true,
            baseUrl: BASE_URL,
            screenshots: results.map((result) => result.screenshot),
            states: Object.fromEntries(results.map((result) => [result.name, result.state])),
            chromeErrors: chromeErrors.slice(0, 5)
        }, null, 2));
    } finally {
        chrome.kill('SIGTERM');
        await sleep(500);
        if (!chrome.killed) chrome.kill('SIGKILL');
    }
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});

require('../lib/qa-preflight.cjs');
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

const base = process.env.QA_URL || 'http://127.0.0.1:8100';
const output = process.env.QA_OUTPUT || '/tmp/yurika-warrior-audio-v170';
const report = { cases: [], errors: [], external: [] };
async function newPage(browser) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
        report.external.push(url.href);
        return route.abort();
    });
    return page;
}
async function installProbe(page, standalone = false) {
    await page.evaluate(standalone => {
        const sound = standalone ? window.fixtureSound : game.sound;
        const analyser = sound.ctx.createAnalyser();
        analyser.fftSize = 1024;
        sound.sfxGain.connect(analyser);
        const events = [], original = sound.playClassEvent.bind(sound);
        sound.playClassEvent = (name, data, options) => {
            const accepted = original(name, data, options);
            events.push({ name, id: data?.audioId, accepted });
            return accepted;
        };
        window.audioQA = { sound, events, async collect() {
            const samples = new Float32Array(1024);
            let energy = 0, peak = 0, count = 0;
            for (let i = 0; i < 12; i++) {
                await new Promise(resolve => setTimeout(resolve, 25));
                analyser.getFloatTimeDomainData(samples);
                for (const value of samples) {
                    if (!Number.isFinite(value)) throw Error('Nonfinite audio sample');
                    energy += value * value; peak = Math.max(peak, Math.abs(value)); count++;
                }
            }
            return { rms: Math.sqrt(energy / count), peak, state: sound.ctx.state };
        } };
    }, standalone);
}
function audible(row, cue) {
    assert.equal(row.state, 'running');
    assert.deepEqual(row.events.filter(event => event.accepted).map(event => event.name), [cue], JSON.stringify(row));
    assert.ok(row.rms > 1e-5 && row.peak > 0 && row.peak < 1, JSON.stringify(row));
}
function silent(row) {
    assert.equal(row.events.filter(event => event.accepted).length, 0, JSON.stringify(row));
    assert.equal(row.rms, 0, JSON.stringify(row));
}
async function gestureChecks(browser) {
    const page = await newPage(browser);
    report.sourceHashes = {};
    for (const path of ['src/js/core/SoundManager.js', 'src/js/combat/ClassCombatBridge.js']) {
        const response = await page.request.get(base + '/' + path);
        assert.equal(response.status(), 200);
        const bytes = await response.body();
        assert.deepEqual(bytes, fs.readFileSync(path), 'served runtime must match the tested checkout: ' + path);
        report.sourceHashes[path] = createHash('sha256').update(bytes).digest('hex');
    }
    // A fresh origin profile tests the real autoplay gate before any gesture.
    await page.route(base + '/audio-gesture-fixture', route => route.fulfill({ contentType: 'text/html', body: `
        <button style="width:200px;height:100px">Resume audio</button>
        <script type="module">
            import SoundManager from '/src/js/core/SoundManager.js';
            const s = window.fixtureSound = new SoundManager({}); s.init();
            window.initialAudio = { state: s.ctx.state, accepted: s.playClassEvent('sword_wave', { audioId: 'before-gesture' }) };
        </script>` }));
    await page.goto(base + '/audio-gesture-fixture');
    await page.waitForFunction(() => !!window.initialAudio);
    const initial = await page.evaluate(() => initialAudio);
    assert.equal(initial.state, 'suspended'); assert.equal(initial.accepted, false);
    report.cases.push({ mode: 'before-first-gesture', ...initial });
    await page.locator('button').tap();
    await page.waitForFunction(() => fixtureSound.ctx.state === 'running');
    await installProbe(page, true);
    for (const cue of ['sword_wave', 'shield_rush']) {
        await page.waitForTimeout(450);
        const row = await page.evaluate(async cue => {
            const q = audioQA; q.events.length = 0;
            q.sound.playClassEvent(cue, { audioId: 'gesture:' + cue });
            return { mode: 'gesture-unlocked', cue, events: q.events, ...await q.collect() };
        }, cue);
        audible(row, cue); report.cases.push(row);
    }
    const background = await page.evaluate(async () => {
        const s = fixtureSound; s.setMasterVolume(.17); s.setMuted(true);
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await s.ctx.suspend();
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden;
        return { mode: 'synthetic-background-return', state: s.ctx.state, gain: s.masterGain.gain.value, muted: s.isMuted };
    });
    assert.equal(background.state, 'suspended'); assert.equal(background.gain, 0); assert.equal(background.muted, true);
    report.cases.push(background);
    await page.locator('button').tap();
    await page.waitForFunction(() => fixtureSound.ctx.state === 'running');
    const muted = await page.evaluate(async () => {
        const q = audioQA; q.events.length = 0;
        q.sound.playClassEvent('shield_rush', { audioId: 'muted-resume' });
        return { mode: 'gesture-resume-preserves-mute', gain: q.sound.masterGain.gain.value, events: q.events, ...await q.collect() };
    });
    silent(muted); assert.equal(muted.gain, 0); report.cases.push(muted);
    const restored = await page.evaluate(async () => {
        const q = audioQA; q.events.length = 0; q.sound.setMuted(false);
        q.sound.playClassEvent('shield_rush', { audioId: 'unmuted-resume' });
        return { mode: 'resume-restores-selected-volume', gain: q.sound.masterGain.gain.value, events: q.events, ...await q.collect() };
    });
    audible(restored, 'shield_rush'); assert.ok(Math.abs(restored.gain - .17) < 1e-6); report.cases.push(restored);
    await page.context().close();
}
async function gameplayChecks(browser) {
    const page = await newPage(browser);
    await page.goto(base + '/?local=1');
    await page.locator('#camp-name').fill('전사 효과음 검증');
    await page.locator('[data-camp=create]').tap();
    await page.locator('[data-camp=character]').first().waitFor();
    await page.evaluate(async () => {
        const n = game.net, p = await n.getPlayerProfile(n.playerId);
        await n.savePlayerData(n.playerId, { ...p, activeClassId: 'warrior', questData: { ...p.questData, basicTrainingCompleted: true, prologueCompleted: true } });
    });
    await page.reload();
    await page.locator('[data-camp=prepare]').tap(); await page.locator('[data-camp=depart]').tap();
    await page.locator('.camp-return').waitFor(); await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => game.sound.ctx?.state === 'running');
    await page.evaluate(() => {
        game.loop.stop(); game.tutorial = null; game.input.setEnabled(true); game.input.setAllowedActions(null);
        game.monsterManager.monsters.clear(); game.projectiles = [];
        game.sceneManager.currentScene.checkCollision = () => false;
        game.sound.setBgmVolume(0);
    });
    await installProbe(page);
    async function reset() {
        await page.waitForTimeout(450);
        await page.evaluate(() => {
            game.input.releaseAllActions(); game.ui.isPaused = false;
            const p = game.localPlayer; p.classStatuses = {}; p.hp = p.maxHp = 1000; p.isDead = p.isDying = false;
            p.autoAttackEnabled = false; p.initializeClassCombat(); p.classCombat.controller.rage = 100;
            audioQA.events.length = 0;
        });
    }
    const cdp = await page.context().newCDPSession(page);
    const rect = await page.locator('#action-attack-j').boundingBox();
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    for (const mode of ['tap', 'charge', 'cancel-charge']) {
        await reset();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        const held = await page.evaluate(mode => {
            const p = game.localPlayer;
            for (let i = 0; i < (mode === 'tap' ? 1 : 3); i++) p.update(mode === 'tap' ? .05 : .2);
            return { aim: !!p.classAim, elapsed: p.classAim?.elapsed, events: audioQA.events.length };
        }, mode);
        assert.equal(held.aim, true); assert.equal(held.events, 0);
        await cdp.send('Input.dispatchTouchEvent', { type: mode === 'cancel-charge' ? 'touchCancel' : 'touchEnd', touchPoints: [] });
        const row = await page.evaluate(async mode => {
            const p = game.localPlayer, c = p.classCombat.controller, q = audioQA;
            return { mode, events: q.events, aim: p.classAim, rage: c.rage, projectiles: c.projectiles.map(p => p.kind), effects: p.classCombat.effects.map(f => f.name), ...await q.collect() };
        }, mode);
        assert.equal(row.aim, null);
        if (mode === 'cancel-charge') { silent(row); assert.equal(row.rage, 100); }
        else { audible(row, mode === 'tap' ? 'warrior_slash' : 'sword_wave'); assert.equal(row.rage, mode === 'tap' ? 100 : 75); }
        assert.deepEqual(row.projectiles, mode === 'charge' ? ['sword_wave'] : []);
        assert.ok(!row.effects.includes('sword_wave'), 'audio cannot add a fake visual effect');
        report.cases.push(row);
    }
    for (const mode of ['insufficient-rage', 'paused', 'dead', 'shield-rooted', 'shield-wall', 'aim-repeat', 'shield-repeat', 'remote-snapshot']) {
        await reset();
        const row = await page.evaluate(async mode => {
            const p = game.localPlayer, b = p.classCombat, c = b.controller, q = audioQA, options = { aimed: true, x: p.x + 160, y: p.y };
            if (mode === 'insufficient-rage') c.rage = 24;
            if (mode === 'paused') game.ui.isPaused = true;
            if (mode === 'dead') p.isDead = true;
            if (mode === 'shield-rooted') p.classStatuses.root = { remaining: 1 };
            if (mode === 'shield-wall') game.sceneManager.currentScene.checkCollision = () => true;
            let accepted, repeat, remoteAccepted;
            if (mode === 'remote-snapshot') {
                b.basic(options); const wave = b.visualSnapshot();
                b.skill(1, options); const shield = b.visualSnapshot();
                await new Promise(resolve => setTimeout(resolve, 500)); q.events.length = 0;
                const { default: RemoteClassVisuals } = await import('/src/js/combat/ClassVisuals.js');
                const remote = new RemoteClassVisuals({ id: 'audio-remote', x: p.x, y: p.y, hp: 100, width: 48, height: 48 });
                wave.ts = shield.ts = Date.now();
                remoteAccepted = [remote.receive(wave), remote.receive(wave), remote.receive(shield), remote.receive(shield)];
            } else {
                accepted = mode.startsWith('shield') ? b.skill(1, options) : b.basic(options);
                if (mode.endsWith('repeat')) repeat = mode === 'shield-repeat' ? b.skill(1, options) : b.basic(options);
            }
            const result = { mode, accepted, repeat, remoteAccepted, rage: c.rage, projectiles: c.projectiles.map(p => p.kind), events: q.events, ...await q.collect() };
            game.sceneManager.currentScene.checkCollision = () => false;
            return result;
        }, mode);
        if (mode.endsWith('repeat')) {
            audible(row, mode === 'aim-repeat' ? 'sword_wave' : 'shield_rush');
            assert.equal(row.accepted, true); assert.equal(row.repeat, false);
            if (mode === 'aim-repeat') { assert.equal(row.rage, 75); assert.deepEqual(row.projectiles, ['sword_wave']); }
        } else {
            silent(row);
            if (mode === 'remote-snapshot') assert.deepEqual(row.remoteAccepted, [true, false, true, false]);
            else assert.equal(row.accepted, false);
        }
        report.cases.push(row);
    }
    for (const cue of ['sword_wave', 'shield_rush']) for (const guard of ['duplicate', 'remote', 'mute', 'sfx-zero', 'background']) {
        await reset();
        const row = await page.evaluate(async ({ cue, guard }) => {
            const q = audioQA, s = q.sound, data = { audioId: `guard:${cue}:${guard}` };
            if (guard === 'duplicate') { s.playClassEvent(cue, data); await new Promise(resolve => setTimeout(resolve, 450)); }
            if (guard === 'mute') s.setMuted(true);
            if (guard === 'sfx-zero') s.setSfxVolume(0);
            if (guard === 'background') { s.isBackgrounded = true; s._applyMasterGain(); }
            q.events.length = 0; s.playClassEvent(cue, data, { remote: guard === 'remote' });
            const result = { mode: guard, cue, events: [...q.events], ...await q.collect() };
            s.isBackgrounded = false; s.setMuted(false); s.setSfxVolume(.85);
            return result;
        }, { cue, guard });
        silent(row); report.cases.push(row);
    }
    await page.context().close();
}
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required', '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplay'] });
    try {
        await gestureChecks(browser); await gameplayChecks(browser);
        assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
        console.log(JSON.stringify({ test: 'warrior-audio-v170', cases: report.cases.length, passed: true, humanListening: false, physicalBackgroundSwitch: false }));
    } finally {
        fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(output + '/report.json', JSON.stringify(report, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });

const { chromium } = require('playwright');
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const OUT = process.env.QA_OUTPUT || '/tmp/yurika-display-quality';
const baseline = process.env.QA_BASELINE_REF;
const changed = new Set(['/src/css/style.css', '/src/js/main.js', '/src/js/core/Sprite.js', '/src/js/core/ResourceManager.js', '/src/js/entities/Player.js', '/src/js/entities/RemotePlayer.js', '/src/js/ui/FieldHudReadability.js', ...['AuthoredCharacterFrames', 'WizardAttackFrames', 'ShieldRush'].map(n => `/src/js/combat/${n}.js`)]);
fs.mkdirSync(OUT, { recursive: true });
const report = { scope: 'Local Chromium desktop/retina/mobile emulation; screenshots at device DPR, raster-flushed synthetic character load, no live accounts or physical-device FPS claim', baseline: baseline || null, cases: [], errors: [] };
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        for (const [name, width, height, dpr] of [['desktop', 1280, 800, 1], ['retina', 1440, 900, 2], ['portrait', 393, 852, 3], ['landscape', 852, 393, 3]]) {
            if (process.env.QA_VIEWPORT && name !== process.env.QA_VIEWPORT) continue;
            for (const classId of (process.env.QA_CLASSES || 'wizard,witch,warrior,archer').split(',')) {
                const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: width < 1024, hasTouch: width < 1024, serviceWorkers: 'block' });
                const page = await context.newPage(); page.setDefaultTimeout(20000);
                page.on('pageerror', e => report.errors.push(e.message));
                await page.route('**/*', route => {
                    const url = new URL(route.request().url());
                    if (url.origin !== 'http://127.0.0.1:8100') return route.abort();
                    if (baseline && changed.has(url.pathname)) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: cp.execFileSync('git', ['show', `${baseline}:${url.pathname.slice(1)}`]) });
                    return route.continue();
                });
                await page.goto('http://127.0.0.1:8100/?local=1');
                await page.locator('#camp-name').fill('출력 화질 확인'); await page.locator('[data-camp=create]').click();
                await page.locator('[data-camp=character]').first().waitFor();
                await page.evaluate(async id => {
                    const n = game.net, a = await n.getPlayerProfile(n.playerId);
                    await n.savePlayerData(n.playerId, { ...a, activeClassId: id, questData: { ...a.questData, basicTrainingCompleted: true, prologueCompleted: true } });
                }, classId);
                await page.reload(); await page.locator('[data-camp=prepare]').click(); await page.locator('[data-camp=depart]').click();
                await page.locator('.camp-return').waitFor(); await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
                await page.evaluate(() => {
                    game.loop.stop(); const p = game.localPlayer, s = game.sceneManager.currentScene;
                    game.monsterManager.monsters.clear(); s.zoneSpawnRules = []; s.safeZone = null;
                    game.ui.hideAllPopups(); p.x = p.y = 2000; p.direction = 1; p.state = 'idle'; p.animFrame = p.animTimer = 0; p.isAttacking = false; p.autoAttackEnabled = false;
                    p.hp = p.maxHp; p.mp = p.maxMp;
                    game.ui._appendChatLogEntry({ name: '표시 기준', text: '채팅 메시지 크기입니다. 123456789' });
                    game.ui.updateStats(100, 100, p.level, 0); game.ui.fieldHudReadability.sync(game.ui, true);
                    s.camera.x = p.x + p.width / 2 - game.canvas.width / game.dpr / game.zoom / 2;
                    s.camera.y = p.y + p.height / 2 - game.canvas.height / game.dpr / game.zoom / 2;
                    window.displayQa = { p, s };
                    window.inspectHud = () => {
                        const font = e => { let scale = 1; for (let a = e; a; a = a.parentElement) scale *= game.ui.getElementComputedScale(a); return parseFloat(getComputedStyle(e).fontSize) * scale; };
                        const chat = font(document.querySelector('.chat-text'));
                        const fonts = [...document.querySelectorAll('.stat-label,.bar-text,.level-badge,.quest-title,.quest-progress,.quest-panel-header h3,.camp-return')].filter(e => e.getClientRects().length).map(e => ({ selector: e.id || e.className || e.tagName, px: font(e) }));
                        const clips = [...document.querySelectorAll('.bar-text')].flatMap(e => {
                            const range = document.createRange(); range.selectNodeContents(e); const bar = e.closest('.bar-bg').getBoundingClientRect();
                            return [...range.getClientRects()].filter(r => r.width && r.height && (r.left < bar.left - 1 || r.right > bar.right + 1 || r.top < bar.top - 1 || r.bottom > bar.bottom + 1)).map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
                        });
                        return { chat, fonts, clips };
                    };
                });
                const data = await page.evaluate(() => {
                    const { p, s } = displayQa, ctx = game.ctx, draws = [], original = ctx.drawImage;
                    const images = [p.sprite.image, p.classCombat?.images.authored, p.wizardAttackImage].filter(Boolean);
                    ctx.drawImage = function (img, ...args) { if (images.includes(img)) { const t = this.getTransform(); draws.push({ source: [img.width, img.height], args, scale: Math.hypot(t.a, t.b), smoothing: this.imageSmoothingEnabled, quality: this.imageSmoothingQuality }); } return original.call(this, img, ...args); };
                    s.render(ctx); ctx.drawImage = original;
                    const canvas = game.canvas.getBoundingClientRect();
                    return { hud: inspectHud(), draws, dpr: game.dpr, deviceDpr: devicePixelRatio, zoom: game.zoom, canvas: { width: game.canvas.width, height: game.canvas.height, cssWidth: canvas.width, cssHeight: canvas.height, imageRendering: getComputedStyle(game.canvas).imageRendering }, limits: game.getPerformanceProfile(), attackPower: p.attackPower };
                });
                assert.ok(data.draws.length > 0, `${name}/${classId}: real character draw must exist`);
                assert.equal(data.canvas.width, Math.round(data.canvas.cssWidth * data.dpr));
                assert.equal(data.canvas.height, Math.round(data.canvas.cssHeight * data.dpr));
                if (!baseline) {
                    assert.equal(data.canvas.imageRendering, 'auto');
                    assert.ok(data.draws.every(d => d.smoothing && d.quality === 'high'), `${name}/${classId}: character reductions filter original frames`);
                    assert.ok(data.hud.fonts.every(f => f.px <= data.hud.chat + .2), JSON.stringify(data.hud));
                    assert.deepEqual(data.hud.clips, [], `${name}/${classId}: default number clipping`);
                }
                await page.screenshot({ path: `${OUT}/${name}-${classId}.png` });
                const canvas = await page.locator('#gameCanvas').boundingBox();
                await page.screenshot({ path: `${OUT}/${name}-${classId}-detail.png`, clip: { x: canvas.x + canvas.width / 2 - 70, y: canvas.y + canvas.height / 2 - 90, width: 140, height: 130 } });
                data.stress = await page.evaluate(() => {
                    const { p, s } = displayQa, ctx = game.ctx, samples = [];
                    for (let i = 0; i < 30; i++) {
                        const start = performance.now(); s.render(ctx);
                        // Rendering load only: no extra players, simulation, network or allocations.
                        for (let n = 0; n < 31; n++) { ctx.save(); ctx.scale(game.zoom * game.dpr, game.zoom * game.dpr); ctx.translate(-s.camera.x + n % 8 * 8, -s.camera.y + Math.floor(n / 8) * 8); p.render(ctx, s.camera); ctx.restore(); }
                        ctx.getImageData(0, 0, 1, 1); // Flush raster work; timing is not just command submission.
                        if (i >= 10) samples.push(performance.now() - start);
                    }
                    samples.sort((a, b) => a - b); s.render(ctx);
                    return { characters: 32, p50Ms: samples[10], p95Ms: samples[18], backingPixels: game.canvas.width * game.canvas.height };
                });
                data.long = await page.evaluate(() => {
                    const p = game.localPlayer; p.hp = p.maxHp = 999999999; p.mp = p.maxMp = 888888888;
                    game.ui.updateStats(100, 100, p.level, 0);
                    document.querySelector('#active-quest-title').textContent = '오래된 유적에서 몬스터를 처치하고 마을로 돌아오세요. 보상과 남은 목표를 확인합니다.';
                    document.querySelector('#active-quest-task').textContent = '진행도 999999 / 999999 · 남은 임무를 확인해 주세요.';
                    game.ui.fieldHudReadability.sync(game.ui, true); return inspectHud();
                });
                if (!baseline) assert.deepEqual(data.long.clips, [], `${name}/${classId}: 9-digit number clipping`);
                report.cases.push({ name, classId, ...data });
                await context.close(); console.log(`PASS ${name}/${classId}`);
            }
        }
        assert.deepEqual(report.errors, []);
    } finally { fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

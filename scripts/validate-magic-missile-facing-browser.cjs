require('./lib/qa-preflight.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = process.env.QA_OUTPUT || `/tmp/yurika-missile-facing-${Date.now()}`;
const directions = [[1,0,3], [1,1,1], [0,1,1], [-1,1,1], [-1,0,2], [-1,-1,0], [0,-1,0], [1,-1,0]];

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const report = { scope: 'Local game keyboard/touch input, real cast pose and synthetic targets; no production account or DB', cases: [], errors: [] };
    try {
        for (const mode of ['keyboard', 'touch']) {
            const page = await browser.newPage({ viewport: mode === 'touch' ? { width: 390, height: 844 } : { width: 1000, height: 700 }, hasTouch: true });
            page.on('pageerror', error => report.errors.push(error.message));
            await page.goto('http://127.0.0.1:8100/?local=1');
            await page.locator('#camp-name').fill('Missile facing QA');
            await page.locator('[data-camp=create]').click();
            await page.waitForFunction(() => {
                const scene = game.sceneManager.currentScene;
                return scene?.constructor.name === 'CampScene' && !scene.busy && scene.preparation && game.localPlayer;
            });
            await page.evaluate(async () => {
                const net = game.net, profile = await net.getPlayerProfile(net.playerId);
                await net.savePlayerData(net.playerId, { ...profile, activeClassId: 'wizard', questData: { ...profile.questData, basicTrainingCompleted: true, prologueCompleted: true } });
            });
            await page.reload();
            await page.locator('[data-camp=prepare]').click();
            await page.locator('[data-camp=depart]').click();
            await page.locator('.camp-return').waitFor();
            await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
            await page.evaluate(async () => {
                if (!game.isLocalMode) throw Error('Local fixture required');
                game.loop.stop(); game.ui.isPaused = false; game.ui.hideAllPopups();
                game.tutorial = { isActionAllowed: () => true, trigger() {} };
                window.missileArt = await import('/src/js/combat/WizardAttackFrames.js');
                window.MissileMonster = (await import('/src/js/entities/Monster.js')).default;
                window.missileDefinition = await game.monsterData.loadDefinition('slime');
                await game.localPlayer.spriteReady;
                window.castPackets = [];
                game.localPlayer.net.sendChanneling = () => {};
                game.localPlayer.net.sendPlayerAttack = (...args) => castPackets.push(args);
                window.contact = document.createElement('canvas'); contact.width = 960; contact.height = 480;
            });
            for (const [index, [dx, dy, expected]] of directions.entries()) {
                await page.evaluate(({ dx, dy, expected }) => {
                    const player = game.localPlayer;
                    game.input.releaseAllActions(); game.monsterManager.monsters.clear(); game.projectiles = [];
                    Object.assign(player, { x: 1600, y: 1600, vx: 0, vy: 0, direction: (expected + 1) % 4,
                        hp: 10000, maxHp: 10000, mp: 1000, maxMp: 1000, isDead: false, isDying: false,
                        isAttacking: false, isChanneling: false, skillAttackTimer: 0, autoAttackEnabled: false,
                        missileFireQueue: [], skillCooldowns: { h: 0 }, state: 'idle', wizardArtMoving: false });
                    player.skillLevels.missile = 1;
                    const target = new MissileMonster(player.x + player.width / 2 + dx * 180, player.y + player.height / 2 + dy * 180, missileDefinition);
                    Object.assign(target, { id: 'missile-facing-target', isLocalOnly: true, hp: 100000, maxHp: 100000 });
                    game.monsterManager.monsters.set(target.id, target); player.setCurrentTarget(target);
                    castPackets.length = 0;
                }, { dx, dy, expected });
                if (mode === 'keyboard') await page.keyboard.press('h');
                else await page.locator('#action-skill-h').tap();
                const sample = await page.evaluate(({ index, dx, dy }) => {
                    const player = game.localPlayer, pose = missileArt.sampleWizardAttack(player);
                    const ctx = contact.getContext('2d'), x = (index % 4) * 240, y = Math.floor(index / 4) * 240;
                    ctx.fillStyle = '#f3f0e9'; ctx.fillRect(x, y, 240, 240);
                    ctx.strokeStyle = '#d4c8b7'; ctx.strokeRect(x, y, 240, 240);
                    const drawn = missileArt.drawWizardAttack(ctx, player, x + 60, y + 55);
                    const length = Math.hypot(dx, dy);
                    ctx.fillStyle = '#cc5539'; ctx.beginPath(); ctx.arc(x + 120 + dx / length * 96, y + 112 + dy / length * 96, 7, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#282625'; ctx.font = '14px sans-serif'; ctx.fillText(`Target (${dx}, ${dy})`, x + 14, y + 226);
                    return { direction: player.direction, angle: player.facingAngle, pose, drawn,
                        packets: castPackets.map(packet => ({ direction: packet[2], type: packet[3] })), missiles: player.missileFireQueue.length };
                }, { index, dx, dy });
                assert.equal(sample.direction, expected, `${mode}: ${dx},${dy}`);
                assert.equal(sample.pose.row, expected); assert.equal(sample.drawn, true);
                assert.equal(sample.packets.length, 1); assert.equal(sample.packets[0].direction, expected);
                assert.equal(sample.missiles, 2);
                report.cases.push({ mode, dx, dy, ...sample });
            }
            const contact = await page.evaluate(() => window.contact.toDataURL());
            fs.writeFileSync(path.join(output, `${mode}-directions.png`), Buffer.from(contact.split(',')[1], 'base64'));
            await page.close();
        }
        assert.deepEqual(report.errors, []);
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors, output }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

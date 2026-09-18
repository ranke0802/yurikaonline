const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

async function openIsolatedUi(page, viewport) {
    await page.setViewportSize(viewport);
    const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (url.pathname === '/index.html') return route.fulfill({ contentType: 'text/html', body: html });
        return route.continue();
    });
    await page.goto('/index.html');
    await page.evaluate(async () => {
        const { UIManager } = await import('/src/js/ui/UIManager.js');
        const { default: TutorialManager } = await import('/src/js/core/TutorialManager.js');
        const game = { localPlayer: {}, isMobileDevice: innerWidth < 1024 };
        const ui = Object.create(UIManager.prototype);
        window.auditUi = ui;
        game.ui = ui;
        game.tutorial = new TutorialManager(game);
        game.tutorial.activeTutorial = await (await fetch('/assets/data/tutorials/basic_training.json')).json();
        Object.assign(ui, {
            game, settings: {}, tutorialGuideState: null, tutorialHighlightTargets: [],
            tutorialHighlightState: { targets: [] }, confirmModal: document.getElementById('confirm-modal'),
            tutorialGuideDragState: { active: false }, tutorialGuideManualPosition: null
        });
        document.querySelector('#loading-overlay')?.remove();
        document.querySelector('#ui-layer').classList.remove('hidden');
        window.showStep = (id) => {
            const tutorial = game.tutorial;
            tutorial.currentStepIndex = tutorial.activeTutorial.steps.findIndex(step => step.id === id);
            const step = tutorial.getCurrentStep();
            ui.showTutorialGuide(tutorial.getStepGuidePayload(step));
            ui.highlightTutorialTargets(tutorial.getStepHighlightConfig(step));
        };
        window.showPopup = (id) => {
            document.querySelectorAll('.game-popup').forEach(node => node.classList.add('hidden'));
            document.getElementById('popup-overlay').classList.remove('hidden');
            document.getElementById(id).classList.remove('hidden');
        };
    });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    test(`tutorial step transitions clear old highlights at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await openIsolatedUi(page, viewport);
        const steps = ['move_check', 'attack_dummy', 'open_status', 'preview_status_change', 'save_status',
            'open_skill', 'inspect_laser_detail', 'close_laser_detail', 'upgrade_laser', 'open_inventory', 'close_inventory', 'finish'];
        for (const id of steps) {
            await page.evaluate(id => {
                document.getElementById('popup-overlay').classList.add('hidden');
                document.querySelectorAll('.game-popup').forEach(node => node.classList.add('hidden'));
                document.getElementById('skill-detail-modal').classList.add('hidden');
                if (['preview_status_change', 'save_status'].includes(id)) showPopup('status-popup');
                if (['inspect_laser_detail', 'close_laser_detail', 'upgrade_laser'].includes(id)) showPopup('skill-popup');
                if (id === 'close_laser_detail') document.getElementById('skill-detail-modal').classList.remove('hidden');
                if (id === 'close_inventory') showPopup('inventory-popup');
                showStep(id);
            }, id);
            const expected = id === 'finish' || (id === 'move_check' && viewport.width > 1024) ? 0 : 1;
            await expect(page.locator('.tutorial-highlight-box'), id).toHaveCount(expected);
            await expect(page.locator('#tutorial-highlight-layer'), id).toHaveCount(1);
        }
        await page.evaluate(() => auditUi.clearTutorialHighlight());
    });

    test(`tutorial shows one save action at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await openIsolatedUi(page, viewport);
        await page.evaluate(() => { showPopup('status-popup'); showStep('save_status'); });
        await expect(page.locator('.tutorial-highlight-box')).toHaveCount(1);
        await expect.poll(() => page.evaluate(() => {
            const box = document.querySelector('.tutorial-highlight-box').getBoundingClientRect();
            const targets = auditUi.getTutorialRuntimeFocusTargets();
            const rect = auditUi.resolveTutorialTargetRect(targets[0]);
            return Math.abs((box.left + box.right) / 2 - (rect.left + rect.right) / 2) < 1;
        })).toBe(true);
        await page.evaluate(() => document.getElementById('confirm-modal').classList.remove('hidden'));
        await expect.poll(() => page.evaluate(() => {
            const box = document.querySelector('.tutorial-highlight-box')?.getBoundingClientRect();
            const yes = document.querySelector('#confirm-yes').getBoundingClientRect();
            return box && Math.abs((box.left + box.right) / 2 - (yes.left + yes.right) / 2) < 1;
        })).toBe(true);
        await expect(page.locator('.tutorial-highlight-box')).toHaveCount(1);
        await expect(page.locator('.tutorial-guide-body')).toHaveText('확인을 눌러 스탯을 저장하세요.');
        await page.screenshot({ path: `reports/tutorial-save-${viewport.width}x${viewport.height}.png` });
        await page.evaluate(() => { auditUi.clearTutorialHighlight(); auditUi.hideTutorialGuide(); });
        await expect(page.locator('.tutorial-highlight-box')).toHaveCount(0);
        expect(errors).toEqual([]);
    });
}

test('tutorial deduplicates targets, follows scrolling/animation, reuses DOM and cleans up', async ({ page }) => {
    await openIsolatedUi(page, { width: 1280, height: 720 });
    await page.evaluate(() => {
        auditUi.game.tutorial.currentStepIndex = -1;
        const scroller = document.createElement('div');
        scroller.id = 'audit-scroll';
        scroller.style.cssText = 'position:fixed;left:180px;top:150px;width:260px;height:200px;overflow:auto';
        scroller.innerHTML = '<div style="height:600px;padding-top:70px"><div id="audit-target" style="width:180px;height:80px"><span id="audit-child" style="display:block;width:100px;height:40px"></span></div></div>';
        document.body.append(scroller);
        auditUi.highlightTutorialTargets({ targets: ['#audit-target', '#audit-child', '#audit-target'], padding: 0 });
        window.originalBox = document.querySelector('.tutorial-highlight-box');
    });
    await expect(page.locator('.tutorial-highlight-box')).toHaveCount(1);
    await page.evaluate(() => auditUi.refreshTutorialHighlight());
    expect(await page.evaluate(() => originalBox === document.querySelector('.tutorial-highlight-box'))).toBe(true);
    await page.evaluate(() => {
        document.getElementById('audit-scroll').scrollTop = 100;
        document.getElementById('audit-scroll').style.left = '240px';
    });
    await expect.poll(() => page.locator('.tutorial-highlight-box').boundingBox()).toEqual({ x: 240, y: 150, width: 180, height: 50 });
    await page.evaluate(() => document.getElementById('audit-scroll').style.visibility = 'hidden');
    await expect(page.locator('.tutorial-highlight-box')).toHaveCount(0);
    await page.evaluate(() => {
        document.getElementById('audit-scroll').style.visibility = 'visible';
        document.getElementById('audit-scroll').scrollTop = 300;
    });
    await expect(page.locator('.tutorial-highlight-box')).toHaveCount(0);
    await page.evaluate(() => {
        auditUi.clearTutorialHighlight();
        document.getElementById('audit-scroll').scrollTop = 0;
    });
    expect(await page.evaluate(() => auditUi.tutorialHighlightFrame)).toBe(0);
    await expect(page.locator('.tutorial-highlight-box')).toHaveCount(0);
    await expect(page.locator('#tutorial-highlight-layer')).toHaveCount(1);
});

test('render combat warnings and impacts in eight directions using shipped assets', async ({ page }) => {
    await openIsolatedUi(page, { width: 1280, height: 960 });
    await page.evaluate(async () => {
        const { default: Monster } = await import('/src/js/entities/Monster.js');
        const { preloadMonsterSkillVfxAtlas } = await import('/src/js/effects/MonsterSkillVfxRenderer.js');
        await preloadMonsterSkillVfxAtlas().decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1280; canvas.height = 960;
        canvas.style.cssText = 'position:fixed;inset:0;z-index:99999';
        document.body.append(canvas);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#15252b'; ctx.fillRect(0, 0, 1280, 960);
        window.game = { zone: { currentZone: { id: 'zone_1' } } };
        for (let index = 0; index < 8; index += 1) {
            const x = 160 + (index % 4) * 320, y = 210 + Math.floor(index / 4) * 390;
            const angle = index * Math.PI / 4;
            const m = new Monster(x, y, { visual: { width: 48, height: 64, effectTheme: index % 2 ? 'water' : 'thunder' } });
            m.startCharge(x + Math.cos(angle) * 115, y + Math.sin(angle) * 115);
            m.chargeTimer = 0.3;
            m.renderTelegraph(ctx);
            m.chargeState = 'charging';
            m._renderChargeTrail(ctx, x, y, 80);
            ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
            ctx.fillText(`${index * 45}°`, x - 20, y + 160);
            ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        }
        const m = new Monster(0, 0, {});
        m._drawBossTelegraphLine(ctx, { x1: 170, y1: 870, x2: 1100, y2: 780, width: 65 },
            { elapsedMs: 1100, warningMs: 1000, effect: 'water' }, 1, 0.35, false);
    });
    await page.screenshot({ path: 'reports/combat-directions.png' });
});

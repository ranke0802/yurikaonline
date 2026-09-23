const { test, expect } = require('@playwright/test');

test('skill atlases decode once, animate in eight directions and render offline without requests', async ({ page, context }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto('/reports/asset-qa/player-skills/preview.html?still');
    await page.waitForFunction(() => !!window.skillPreview);
    const atlasRequests = () => requests.filter(url => /player-skills\/.*\.webp/.test(url));
    expect(atlasRequests()).toHaveLength(4);
    expect(new Set(atlasRequests()).size).toBe(4);
    const before = await page.locator('canvas').screenshot();
    await page.evaluate(() => skillPreview.draw(0.55));
    expect((await page.locator('canvas').screenshot()).equals(before)).toBe(false);
    await page.evaluate(() => skillPreview.draw(0.25));
    await page.locator('canvas').screenshot({ path: 'reports/asset-qa/player-skills/preview.png' });
    await context.setOffline(true);
    const requestCount = requests.length;
    const result = await page.evaluate(async () => {
        const { resources, preloadPlayerSkillVfx, preloadMonsterSkillVfxAssets, Projectile, canvas, draw } = skillPreview;
        await Promise.all(Array.from({ length: 30 }, () => Promise.all([
            preloadPlayerSkillVfx(resources), preloadMonsterSkillVfxAssets(resources),
            resources.loadImage('./assets/resource/effects/player-skills/fireball.webp'.replace('./', '/'))
        ])));
        const cached = resources.getImage('/assets/resource/effects/player-skills/fireball.webp');
        const again = await resources.loadImage(new URL('/assets/resource/effects/player-skills/fireball.webp', location.href).href);
        const originalCreate = document.createElement, originalFetch = window.fetch, originalImage = window.Image;
        document.createElement = window.fetch = window.Image = () => { throw new Error('Resource allocation during render'); };
        try {
            for (let i = 0; i < 120; i++) {
                window.game.useReducedEffects = i >= 60;
                draw(i / 30);
                const angle = i * Math.PI / 4;
                for (const type of ['fireball', 'missile']) {
                    const projectile = new Projectile(400, 400, null, type, { radius: 10, vx: Math.cos(angle) * 200, vy: Math.sin(angle) * 200 });
                    projectile.visualAge = i / 30;
                    projectile.trail = [{ x: 400 - Math.cos(angle) * 24, y: 400 - Math.sin(angle) * 24 }];
                    projectile.render(canvas.getContext('2d'));
                }
            }
        } finally {
            document.createElement = originalCreate; window.fetch = originalFetch; window.Image = originalImage;
        }
        return { identical: cached === again, width: cached.naturalWidth };
    });
    expect(result).toEqual({ identical: true, width: 768 });
    expect(requests.length).toBe(requestCount);
    expect(atlasRequests()).toHaveLength(4);
});

test('PWA cache serves assets to a fresh resource manager offline after reload', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow', baseURL });
    try {
        const page = await context.newPage();
        await page.goto('/reports/asset-qa/player-skills/preview.html?still');
        await page.waitForFunction(() => !!window.skillPreview);
        await page.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
            await Promise.all([
                '/assets/resource/effects/player-skills/fireball.webp',
                '/assets/data/emotes/basic_emotes.json', '/README.md'
            ].map(path => fetch(`${path}?v=${window.GAME_VERSION}`).then(response => {
                if (!response.ok) throw new Error(path);
                return response.arrayBuffer();
            })));
        });
        await page.reload();
        await page.waitForFunction(() => !!window.skillPreview);
        const servedByWorker = [];
        page.on('response', response => {
            if (/basic_emotes\.json|README\.md/.test(response.url())) servedByWorker.push(response.fromServiceWorker());
        });
        await context.setOffline(true);
        const result = await page.evaluate(async () => {
            const { default: ResourceManager } = await import('/src/js/core/ResourceManager.js');
            const fresh = new ResourceManager();
            const [image, emotes, history] = await Promise.all([
                fresh.loadImage('/assets/resource/effects/player-skills/fireball.webp'),
                fresh.loadJSON('/assets/data/emotes/basic_emotes.json'), fresh.loadText('/README.md')
            ]);
            return { width: image.naturalWidth, emotes: Array.isArray(emotes) ? emotes.length : emotes.emotes.length, history: history.length };
        });
        expect(result.width).toBe(768);
        expect(result.emotes).toBeGreaterThan(0);
        expect(result.history).toBeGreaterThan(0);
        expect(servedByWorker).toEqual([true, true]);
    } finally {
        await context.close();
    }
});

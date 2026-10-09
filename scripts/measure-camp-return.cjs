require('./lib/qa-preflight.cjs');
// Actual return button, equal isolated local profiles and viewport; no live writes.
// First return has field sprites necessarily warmed by departure. "evicted" is
// an explicit diagnostic intervention, NOT an ordinary first-return measurement.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8100';
const report = { coverage: 'Chromium desktop, isolated local storage. Save timings are not RTDB latency. Decode calls overlap; do not sum them.', cases: [], errors: [] };
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
 try {
  for (let trial = 0; trial < Number(process.env.QA_TRIALS || 3); trial++) {
   const ids = ['wizard','witch','warrior','archer'];
   for (const id of [...ids.slice(trial % 4), ...ids.slice(0, trial % 4)]) {
    const context = await browser.newContext({ viewport: { width: 780, height: 360 }, serviceWorkers: 'block' });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => report.errors.push(e.message));
    await page.route('**/*', route => {
     const url = new URL(route.request().url());
     if (url.origin !== BASE) return route.abort();
     if (process.env.QA_BASELINE_FILE && url.pathname.endsWith('/CampScene.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.QA_BASELINE_FILE) });
     return route.continue();
    });
    await page.goto(BASE + '/?local=1');
    await page.locator('#camp-name').fill('복귀 측정'); await page.locator('[data-camp=create]').click();
    await page.locator('[data-camp=character]').first().waitFor();
    await page.evaluate(async id => {
     const n = game.net, p = await n.getPlayerProfile(n.playerId);
     await n.savePlayerData(n.playerId, { ...p, activeClassId: id, questData: { ...p.questData, basicTrainingCompleted: true, prologueCompleted: true } });
    }, id);
    await page.reload(); await page.locator('[data-camp=character]').first().waitFor();
    for (const cache of ['first-return', 'warm', 'evicted']) {
     await page.locator('[data-camp=prepare]').click(); await page.locator('[data-camp=depart]').click();
     await page.locator('.camp-return').waitFor(); await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
     await page.evaluate(async cache => {
      await Promise.allSettled([...game.resources.loading.values()]);
      window.qaTimes = []; window.qaDone = null;
      const wrap = (obj, key, label) => {
       const original = obj[key];
       obj[key] = function(...args) {
        const start = performance.now(), end = () => qaTimes.push({ label, start: start - qaStart, ms: performance.now() - start });
        try { const value = original.apply(this, args); if (value?.then) return value.finally(end); end(); return value; }
        catch (error) { end(); throw error; }
       };
       return () => obj[key] = original;
      };
      window.qaRestore = [wrap(game.localPlayer,'saveState','save-confirmation'), wrap(game.net,'flushProfileWrites','flush-confirmation'),
       wrap(game.net,'getLatestProfileSnapshot','profile'), wrap(game.characterData,'loadDefinition','definition'),
       wrap(game.resources,'preparePlayableClassAssets','field-assets'), wrap(HTMLImageElement.prototype,'decode','decode'),
       wrap(game.resources,'_processAndDrawFrame','mage-compose'), wrap(game.sceneManager.scenes.get('camp'),'renderUI','ui-build'),
       wrap(game.sceneManager.scenes.get('world'),'exit','world-exit')];
      if (cache === 'evicted') { game.resources.cache.clear(); game.characterData.definitions.clear(); }
      const camp = game.sceneManager.scenes.get('camp'), enter = camp.enter;
      camp.enter = async function(...args) {
       await enter.apply(this,args);
       const uiReadyMs = performance.now() - qaStart;
       const images = [...this.root.querySelectorAll('img')], start = performance.now();
       await Promise.all(images.map(image => image.decode()));
       const campImagesMs = performance.now() - start;
       await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
       window.qaDone = { uiReadyMs, campImagesMs, paintedMs: performance.now() - qaStart, failed: this.failed };
      };
      qaRestore.push(() => camp.enter = enter);
      window.qaStart = 0;
      document.querySelector('.camp-return').addEventListener('click', () => { qaTimes.length = 0; qaStart = performance.now(); }, { once: true, capture: true });
     }, cache);
     await page.locator('.camp-return').click(); await page.waitForFunction(() => window.qaDone);
     const row = await page.evaluate(async () => {
      await Promise.allSettled([...game.resources.loading.values()]);
      const result = { ...qaDone, times: qaTimes.slice(), selected: game.localPlayer.activeClassId };
      qaRestore.forEach(restore => restore()); return result;
     });
     assert.equal(row.failed,false); assert.equal(row.selected,id);
     report.cases.push({ trial,id,cache,...row });
     console.log(JSON.stringify({ trial,id,cache,uiReadyMs:row.uiReadyMs,paintedMs:row.paintedMs }));
    }
    await context.close();
   }
  }
  assert.deepEqual(report.errors,[]);
 } finally {
  fs.writeFileSync(process.env.QA_OUTPUT || '/tmp/camp-return.json', JSON.stringify(report,null,2));
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });

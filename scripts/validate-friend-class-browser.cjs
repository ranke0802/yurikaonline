require('./lib/qa-preflight.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const out = process.env.QA_OUTPUT || '/tmp/friend-class-qa';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const report = { cases: [], errors: [] };
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
      page.on('pageerror', error => report.errors.push(error.message));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (process.env.QA_BASELINE && url.pathname === '/src/js/ui/friends/FriendsUIController.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('/tmp/friend-class-baseline.js') });
        return route.continue();
      });
      await page.goto('http://127.0.0.1:8100/?local=1');
      await page.locator('#camp-name').fill('프로필 검증');
      await page.locator('[data-camp=create]').click();
      await page.locator('[data-camp=character]').first().waitFor();
      await page.evaluate(async () => {
        await game.net.savePlayerData(game.net.playerId, { questData: { basicTrainingCompleted: true, prologueCompleted: true } });
      });
      await page.locator('[data-camp=prepare]').click();
      await page.locator('[data-camp=depart]').click();
      await page.locator('.camp-return').waitFor();
      await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        game.monsterManager.clearAll({ preserveNetwork: true });
        game.sceneManager.currentScene.zoneSpawnRules = [];
        game.net.getFriendListSnapshot = () => [{ uid: 'fixture-friend', name: '테스트 친구', online: true }];
        game.net.getFriendThreadMetaSnapshot = () => null;
        game.ui.togglePopup('friends-popup');
      });
      for (const id of ['wizard', 'witch', 'warrior', 'archer']) {
        const result = await page.evaluate(async id => {
          const ui = game.ui, friends = ui.friendsUI;
          const account = { name: '테스트 친구', activeClassId: id, level: 88, vitality: 10, wisdom: 12, hp: 101, mp: 102, maxHp: 150, maxMp: 170,
            equipment: { weapon: { id: 'magic_staff', name: '마법사 무기' } },
            classProfiles: { [id]: { level: 7, vitality: 2, wisdom: 3, hp: 41, mp: 22, maxHp: 85, maxMp: 60, equipment: { weapon: null } } } };
          window.qaAccount = account;
          game.net.getPlayerProfile = async () => structuredClone(account);
          ui.friendProfileCache.delete('fixture-friend');
          await ui.selectFriend('fixture-friend');
          await friends.ensureFriendPortraitAsset(id);
          friends.refreshFriendsPopup();
          const sheet = id === 'wizard' ? await game.resources.loadCharacterSpriteSheet() : await game.resources.loadImage(`assets/resource/classes/mage-style-v159/${id}-runtime.webp`);
          const c = document.createElement('canvas'); c.width = c.height = 96;
          const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sheet, 0, sheet.height / 5, sheet.width / 8, sheet.height / 5, 0, 0, 96, 96);
          const actual = document.querySelector('#friend-profile-avatar .friend-avatar-image')?.style.backgroundImage;
          return { id, viewport: innerWidth, derived: friends.buildFriendDerivedStats(account), exactPortrait: actual?.includes(c.toDataURL()) || false,
            stats: document.getElementById('friend-profile-stats').innerText,
            weapon: document.getElementById('friend-profile-weapon').innerText,
            unchanged: JSON.stringify(ui.friendProfileCache.get('fixture-friend')) === JSON.stringify(account) };
        }, id);
        report.cases.push(result);
        await page.locator('#friends-popup').screenshot({ path: `${out}/${viewport.width}-${id}.png` });
        if (!process.env.QA_BASELINE) {
          assert.equal(result.exactPortrait, true, `${id}: actual avatar pixels`);
          assert.equal(result.derived.level, id === 'wizard' ? 88 : 7);
          assert.equal(result.derived.hp, id === 'wizard' ? 101 : 41);
          assert.equal(result.derived.maxHp, id === 'wizard' ? 150 : 85);
          assert.equal(result.unchanged, true, 'display must not mutate account');
          assert.equal(result.weapon.includes('마법사 무기'), id === 'wizard');
        }
        await page.evaluate(() => game.ui.friendsUI.openFriendProfileFromChat({ uid: 'fixture-friend' }));
        await page.locator('#friend-chat-profile-modal').screenshot({ path: `${out}/${viewport.width}-${id}-chat.png` });
        const chatStats = await page.locator('#friend-chat-profile-stats').innerText();
        assert.equal(chatStats.replace(/\s+/g, ' ').trim(), result.stats.replace(/\s+/g, ' ').trim(), 'chat and friends panel agree');
        await page.evaluate(() => game.ui.friendsUI.toggleFriendChatProfileModal(false));
      }
      await page.close();
    }
    assert.deepEqual(report.errors, []);
  } finally {
    fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import FriendsUIController from '../src/js/ui/friends/FriendsUIController.js';

const ids = ['wizard', 'witch', 'warrior', 'archer'];
const definitions = Object.fromEntries(ids.map(id => [id, JSON.parse(readFileSync(new URL(`../assets/data/characters/${id}.json`, import.meta.url)))]));
const makeUI = viewer => new FriendsUIController({
  game: { localPlayer: { definition: definitions[viewer] }, characterData: { getDefinition: id => definitions[id] } }
});

for (const id of ids) test(`${id}: friend stats use selected profile, independent of viewer`, () => {
  const account = { activeClassId: id, level: 80, hp: 301, mp: 202, maxHp: 400, maxMp: 300, vitality: 30, wisdom: 20,
    classProfiles: { [id]: { level: 6, hp: 0, mp: 0, maxHp: 123, maxMp: 87, vitality: 2, wisdom: 3 } } };
  const before = structuredClone(account);
  for (const viewer of ids) {
    const stats = makeUI(viewer).buildFriendDerivedStats(account);
    assert.equal(stats.level, id === 'wizard' ? 80 : 6);
    assert.equal(stats.hp, id === 'wizard' ? 301 : 0);
    assert.equal(stats.mp, id === 'wizard' ? 202 : 0);
    assert.equal(stats.maxHp, id === 'wizard' ? 400 : 123);
    assert.equal(stats.maxMp, id === 'wizard' ? 300 : 87);
  }
  assert.deepEqual(account, before);
});

test('missing new-class snapshot cannot inherit root Mage progression or HP', () => {
  const account = { activeClassId: 'warrior', level: 80, hp: 999, maxHp: 1000, wisdom: 100 };
  const stats = makeUI('witch').buildFriendDerivedStats(account);
  assert.equal(stats.level, 1);
  assert.equal(stats.hp, 0);
  assert.equal(stats.maxHp, definitions.warrior.baseStats.maxHp + definitions.warrior.growthStats.hp);
  assert.equal(stats.maxMp, definitions.warrior.baseStats.maxMp + 2 * definitions.warrior.growthStats.mp);
});

test('legacy and invalid class IDs use Mage definition, not viewer definition', () => {
  for (const activeClassId of [undefined, 'unknown']) {
    const stats = makeUI('warrior').buildFriendDerivedStats({ activeClassId, level: 12, vitality: 4, wisdom: 5 });
    assert.equal(stats.level, 12);
    assert.equal(stats.maxHp, definitions.wizard.baseStats.maxHp + 4 * definitions.wizard.growthStats.hp);
    assert.equal(stats.maxMp, definitions.wizard.baseStats.maxMp + 5 * definitions.wizard.growthStats.mp);
  }
});

test('portrait cache stays class-specific and retains explicit portraits', () => {
  const ui = makeUI('wizard');
  ids.forEach(id => ui.friendPortraits.set(id, `data:${id}`));
  for (const id of ids) assert.equal(ui.getFriendPortraitUrl({ activeClassId: id }), `data:${id}`);
  assert.equal(ui.getFriendPortraitUrl({ activeClassId: 'invalid' }), 'data:wizard');
  assert.equal(ui.getFriendPortraitUrl({ activeClassId: 'witch', portraitDataUrl: 'data:custom' }), 'data:custom');
});

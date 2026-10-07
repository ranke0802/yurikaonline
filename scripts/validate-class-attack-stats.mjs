import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Player from '../src/js/entities/Player.js';
import CampPreparation from '../src/js/core/CampPreparation.js';
import Controller from '../src/js/combat/ClassCombatController.js';
import FriendsUIController from '../src/js/ui/friends/FriendsUIController.js';
import { UIManager } from '../src/js/ui/UIManager.js';

const ids = ['wizard', 'witch', 'warrior', 'archer'];
const definitions = Object.fromEntries(ids.map(id => [id, JSON.parse(readFileSync(new URL(`../assets/data/characters/${id}.json`, import.meta.url)))]));
const stats = { vitality: 8, intelligence: 10, wisdom: 5, agility: 7 };
const expected = { wizard: 17, witch: 19, warrior: 18, archer: 15 };
const weapon = { type: 'fixture', slot: 'weapon', baseStats: { attackPower: 7 }, enhancementLevel: 2, enhancementBonuses: { attackPowerPerLevel: 3 } };
function player(id) {
    globalThis.window = { game: { tutorial: { isActionAllowed: () => true } } };
    const p = new Player(0, 0, 'isolated fixture', definitions[id]);
    Object.assign(p, stats);
    p.refreshStats();
    return p;
}
const close = (actual, wanted) => assert.ok(Math.abs(actual - wanted) < 1e-8, `${actual} != ${wanted}`);

for (const id of ids) {
    test(`${id}: each stat point follows class attack rule and retains other effects`, () => {
        const p = player(id);
        assert.equal(p.attackPower, expected[id]);
        const deltas = { wizard: [0, 1, 1, 0], witch: [0, 1, 1, 0], warrior: [1, 0, 0, 0], archer: [0, 0, 0, 1] }[id];
        Object.keys(stats).forEach((stat, i) => {
            p[stat]++;
            p.refreshStats();
            assert.equal(p.attackPower, expected[id] + deltas[i], stat);
            p[stat]--;
        });
        p.refreshStats();
        assert.equal(p.maxHp, definitions[id].baseStats.maxHp + 80);
        assert.equal(p.maxMp, definitions[id].baseStats.maxMp + 50);
        assert.equal(p.defense, definitions[id].baseStats.def + 8);
        assert.equal(p.hpRegen, 8); assert.equal(p.mpRegen, 5);
        close(p.attackSpeed, 2.2); close(p.critRate, .27);
        close(p.moveSpeedBonus, 1.35); close(p.skillCDR, .15);
        p.hp = 1; p.refreshStats();
        assert.equal(p.attackPower, expected[id], 'current HP never contributes to attack');
    });

    test(`${id}: zero stats and odd/even wisdom boundaries agree with friend display`, () => {
        const p = player(id);
        const ui = { game: { characterData: { getDefinition: key => definitions[key] } } };
        const friends = new FriendsUIController(ui);
        Object.assign(p, { vitality: 0, intelligence: 0, agility: 0 });
        for (const [wisdom, magicBonus] of [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [99, 49]]) {
            p.wisdom = wisdom; p.refreshStats();
            const atk = definitions[id].baseStats.atk + (['wizard', 'witch'].includes(id) ? magicBonus : 0);
            assert.equal(p.attackPower, atk);
            const profile = { vitality: 0, intelligence: 0, agility: 0, wisdom };
            const account = id === 'wizard' ? profile : { activeClassId: id, classProfiles: { [id]: profile } };
            assert.equal(friends.buildFriendDerivedStats(account).attack, atk);
            assert.equal(UIManager.prototype.buildFriendDerivedStats.call(ui, account).attack, atk);
        }
    });

    test(`${id}: equipment, enhancement, repeated refresh and temporary buffs remain additive then multiplicative`, () => {
        const p = player(id);
        p.equipment = { weapon: structuredClone(weapon) };
        p.classCombat = { multipliers: () => ({ attack: 1.2 }) };
        for (let n = 0; n < 3; n++) {
            p.refreshStats();
            assert.equal(p.attackPower, expected[id] + 13);
            close(p.getEffectiveClassAttackPower(), (expected[id] + 13) * 1.2);
        }
        p.equipment.weapon = null; p.refreshStats();
        assert.equal(p.attackPower, expected[id]);
        p.classCombat = null;
        assert.equal(p.getEffectiveClassAttackPower(), expected[id]);
    });

    test(`${id}: class profile investment survives save/reload without derived attack migration`, async () => {
        const profile = { ...stats, statPoints: 10, equipment: { weapon: structuredClone(weapon) }, hp: 1 };
        const saved = id === 'wizard' ? { ...profile } : { activeClassId: id, intelligence: 99, classProfiles: { [id]: profile, wizard: { level: 42 } } };
        const game = { net: { savePlayerDataPatch: async (_uid, patch) => { Object.assign(saved, structuredClone(patch)); return { ok: true }; } } };
        globalThis.window = { game };
        const prep = new CampPreparation(game, { uid: 'local-fixture' }, saved, definitions[id]);
        const p = prep.player;
        assert.equal(p.attackPower, expected[id] + 13);
        const stat = { wizard: 'intelligence', witch: 'intelligence', warrior: 'vitality', archer: 'agility' }[id];
        p[stat]++; p.statPoints--; p.refreshStats();
        assert.equal((await p.saveProfilePatch([stat, 'statPoints'])).ok, true);
        const loaded = new CampPreparation(game, { uid: 'local-fixture' }, saved, definitions[id]).player;
        assert.equal(loaded.attackPower, expected[id] + 14);
        assert.equal(loaded.statPoints, 9); assert.equal(loaded.hp, 1);
        assert.equal(saved.attackPower, undefined);
        if (id !== 'wizard') { assert.equal(saved.intelligence, 99); assert.equal(saved.classProfiles.wizard.level, 42); }
    });

    test(`${id}: actual basic damage consumes recalculated attack with existing coefficients`, () => {
        const p = player(id);
        p.hp = p.maxHp; p.critRate = 0;
        p.classCombat = { multipliers: () => ({ attack: 1.2 }) };
        const hits = [];
        const enemy = { id: 'isolated-target', x: 40, y: 0, radius: 1, hp: 10000, maxHp: 10000, isMonster: true, defense: 0, takeDamage: amount => { hits.push(amount); return true; } };
        if (id === 'wizard') {
            window.game.monsterManager = { monsters: new Map([[enemy.id, enemy]]) };
            p.chargeTime = 0; p.lightningTickTimer = 0;
            p.performLaserAttack(.01);
            assert.equal(hits[0], Math.ceil(expected[id] * 1.2 * .1));
        } else {
            const c = new Controller(p, id, { enemies: () => [enemy], damage: (_target, amount) => { hits.push(amount); return amount; } });
            assert.equal(c.basic({ x: 400, y: 0 }), true);
            c.update(.25);
            assert.equal(hits[0], Math.ceil(expected[id] * 1.2 * { witch: .7, warrior: 1, archer: .85 }[id]));
        }
    });
}

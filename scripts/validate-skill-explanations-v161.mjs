import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { skillAvailability } from '../src/js/ui/SkillAvailability.js';
import { enhancementExplanation } from '../src/js/ui/EnhancementExplanation.js';
import ClassCombatController from '../src/js/combat/ClassCombatController.js';

function fixture(classId) {
    const p = { classId, x: 0, y: 0, hp: 100, maxHp: 100, mp: 100, attackPower: 20,
        skillCooldowns: { h: 0, u: 0, k: 0, j: 0 }, classStatuses: {},
        getMagicMissileManaCost: () => 7, getFireballManaCost: () => 12 };
    const c = new ClassCombatController(p, classId, { summon: () => ({ hp: 10 }), enemies: () => [] });
    p.classCombat = { controller: c, paused: () => false };
    return { p, c, reason: key => skillAvailability(p, key) };
}
function freeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value); Object.values(value).forEach(v => freeze(v, seen)); Object.freeze(value);
}
for (const id of ['wizard', 'witch', 'warrior', 'archer']) test(`${id}: repeated display queries do not mutate deeply frozen combat/resources`, () => {
    const { p } = fixture(id); freeze(p);
    for (let n = 0; n < 30; n++) for (const key of ['j', 'h', 'u', 'k']) skillAvailability(p, key);
});
test('Witch strict HP boundary matches actual summon acceptance and cost', () => {
    for (const hp of [79, 80, 81]) {
        const { p, c, reason } = fixture('witch'); p.hp = hp;
        assert.equal(reason('u').code, hp <= 80 ? 'hp' : '');
        assert.equal(c.skill(2, { level: 1 }), hp > 80);
        assert.equal(p.hp, hp > 80 ? hp - 80 : hp);
    }
});
test('Warrior rage hint never rejects a tap; charged threshold remains 25', () => {
    for (const rage of [24, 25]) for (const aimed of [false, true]) {
        const { c, reason } = fixture('warrior'); c.rage = rage;
        assert.equal(reason('j').code, rage < 25 ? 'rage' : '');
        if (rage < 25) assert.equal(reason('j').hint, true);
        assert.equal(c.basic({ aimed, x: 200, y: 0 }), !aimed || rage >= 25);
    }
});
test('MP boundary uses cast cost getters; laser never needs MP', () => {
    const { p, reason } = fixture('wizard');
    for (const [key, cost] of [['h', 7], ['u', 12], ['k', 20]]) {
        p.mp = cost - 1; assert.equal(reason(key).code, 'mp');
        p.mp = cost; assert.equal(reason(key).code, '');
    }
    p.mp = 0; assert.equal(reason('j').code, '');
});
test('cooldown, stun, rush, root and charge hints follow action-specific guards', () => {
    const { p, c, reason } = fixture('warrior'); c.rage = 100;
    c.cooldowns[1] = c.time + .01; assert.equal(reason('h').code, 'cooldown');
    c.time += .01; assert.equal(reason('h').code, '');
    p.classStatuses.stun = { remaining: 1 }; assert.equal(reason('h').code, 'stun');
    assert.equal(reason('j').code, ''); // Existing basic guard has no stun check.
    p.classStatuses = { root: { remaining: 1 } }; assert.equal(reason('h').code, 'root');
    assert.equal(reason('k').code, '');
    c.shieldRush = {}; assert.equal(reason('k').code, 'rush');
});
test('free aim has no fabricated target gate; barrage reads do not cancel it', () => {
    const { p, c, reason } = fixture('warrior');
    c.barrage = { marker: 1 }; const barrage = c.barrage;
    assert.equal(reason('u').code, 'barrage'); assert.equal(reason('k').code, '');
    assert.equal(c.barrage, barrage);
    p.classAim = { action: 'SKILL_1' }; assert.equal(reason('h').code, '');
    assert.equal(reason('k').code, 'aim');
});
test('tutorial, dead and pause explanation clears when the underlying state clears', () => {
    const { p } = fixture('archer');
    assert.equal(skillAvailability(p, 'h', { tutorial: { isActionAllowed: () => false } }).code, 'tutorial');
    p.isDead = true; assert.equal(skillAvailability(p, 'h').code, 'dead');
    p.isDead = false; p.classCombat.paused = () => true;
    assert.equal(skillAvailability(p, 'h').code, 'paused');
    p.classCombat.paused = () => false; assert.equal(skillAvailability(p, 'h').code, '');
});
test('ordinary enhancement explicitly names conditional probability and preserves decimals', () => {
    for (const successRate of [1, .5, .25, .15, .05]) {
        const c = Object.freeze({ successRate, destroyChanceOnFail: successRate === 1 ? 0 : .5 });
        assert.equal(enhancementExplanation(c), `성공 ${successRate * 100}% / ${successRate === 1 ? '안전' : '실패한 경우 파괴 50%'}`);
    }
    assert.equal(enhancementExplanation({ successRate: .375, destroyChanceOnFail: .125 }, ' | '), '성공 37.5% | 실패한 경우 파괴 12.5%');
});

const originalCampHashes = {
    "party-rpg-concept/assets/camp-guardian.webp": "e9c9856c6da22b1031017eeeaa574e7447000c9dee588d6e8c816b07a1648f82",
    "party-rpg-concept/assets/camp-archer.webp": "f1eda971a09f92f540ed617fb16b3b86ca8c02cac9a861ae558fa313d317140e",
    "party-rpg-concept/assets/camp-mage.webp": "bf9940431ce2ca98973e8155ff16ce6f12faff0c32d12afaa4b2fcb2cdf41035",
    "party-rpg-concept/assets/camp-witch.webp": "3a06af6a46e14d800a0343098360ae1d1577cf33b04af83899fe9990798ffb6b",
    "party-rpg-concept/assets/guardian-key.webp": "bd708ab00c331a47da26accb74b430084ebc5fe161b9c1d94444e5c8c9dac095",
    "party-rpg-concept/assets/archer-key.webp": "a20a4f4f5d5ed635e1b9f831be59704283347fc5ecc8cf7547e02e61cc76fb78",
    "party-rpg-concept/assets/mage-key.webp": "ec3e9c11d8b2e280c2b0d8b05f9f8c34e2926cd716c78de17d3e8bef347937d6",
    "party-rpg-concept/assets/witch-key.webp": "6a8b0ef9b8d96fa9163725b8b547a728052948b3eed043e4268619b677676602",
    "party-rpg-concept/assets/idle-guardian.webp": "f712295b34e9339013d1161ce7d1aca861a4522f374c017ca00a31fbcf06abba",
    "party-rpg-concept/assets/idle-archer.webp": "e552dc19c2ac948058ef32026bbc4c0ba3b36a22a5a5933339fd1b812a2eed4d",
    "party-rpg-concept/assets/idle-mage.webp": "494ad7367acf6184462d2ee1d957be268b9a47221bcd32f78c5ed926851b011d",
    "party-rpg-concept/assets/idle-witch.webp": "03be1a085990aefa1341e6234d022d172626102b92860a23c8d296a33488204f"
};
test('all 12 v160 camp concept images retain their exact original bytes', () => {
    for (const [path, expected] of Object.entries(originalCampHashes)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, path);
});

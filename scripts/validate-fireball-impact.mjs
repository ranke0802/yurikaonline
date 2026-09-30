import assert from 'node:assert/strict';
// Exercise the real release -> useSkill -> deferred Projectile creation path.
// UI upgrades have no explicit cap; 1..1024 includes every finite-price upgrade
// (300 * 2 ** (level - 1)), with additional imported high-level stress cases.
globalThis.window = { setTimeout() {}, game: {} };
const { default: Player } = await import('../src/js/entities/Player.js');
const levels = [...Array.from({ length: 1024 }, (_, i) => i + 1), 10000];
const baseline = process.argv.includes('--baseline');
let cases = 0;
const misses = [];
for (const level of levels) {
  for (const distance of [80, 240, 600, 1150]) {
    for (const fps of [20, 60]) {
      for (const mode of ['initial-lock-release', 'manual-release', 'direct-auto']) {
        const monster = { id: 'target', type: 'monster', isMonster: true, isDead: false,
          x: distance, y: 0, width: 40, defense: 0, hits: 0,
          takeDamage() { this.hits++; }, applyEffect() {} };
        let packets = 0;
        const player = Object.assign(Object.create(Player.prototype), {
          id: 'local', x: -24, y: -24, width: 48, height: 48, name: 'QA',
          skillLevels: { fireball: level }, skillCooldowns: { u: 0 }, attackPower: 10,
          fireballMaxRange: 1200, fireballAimActive: true, fireballAimAngle: 0,
          fireballAimLockedTarget: mode === 'initial-lock-release' ? { x: distance, y: 0 } : null,
          getWeaponCombatProfile: () => ({}), useMana: () => true, triggerAction() {},
          canAttackTarget: () => true, findNearestFireballTarget: () => monster,
          getCurrentFacingAngle: () => 0
        });
        const game = window.game = {
          localPlayer: player, projectiles: [], remotePlayers: new Map(),
          monsterManager: { monsters: new Map([[monster.id, monster]]) },
          tutorial: { isActionAllowed: () => true, trigger() {} },
          net: { playerId: 'local', sendMonsterDamage() { packets++; return true; } },
          addExplosion() {}, addSpark() {}
        };
        if (mode === 'direct-auto') player.useSkill(2);
        else { player.updateFireballAimGuide(); player.releaseFireballAim(); }
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(game.projectiles.length, 1);
        const projectile = game.projectiles[0];
        for (let f = 0; f < 180 && !projectile.isDead; f++) projectile.update(1 / fps, [monster]);
        cases++;
        if (monster.hits !== 1 || packets !== 1) {
          if (misses.length < 20) misses.push({ level, distance, fps, mode, hits: monster.hits, packets });
          if (!baseline) assert.fail(JSON.stringify(misses.at(-1)));
        }
      }
    }
  }
}
console.log(JSON.stringify({ cases, sampledFailures: misses, passed: misses.length === 0 }, null, 2));

// Simulated online snapshots: the damage boundary resolves current instances,
// including a moving target, multiple AoE victims, and rejection by authority.
const { Projectile } = await import('../src/js/entities/Projectile.js');
let onlineCases = 0;
for (const level of [1, 6, 7, 20, 100]) for (const angle of [0, Math.PI/2, Math.PI, -Math.PI/2]) {
  for (const accepted of [true, false]) {
    const create = (id, radius) => ({ id, type:'monster', isMonster:true, isDead:false,
      x:Math.cos(angle)*radius, y:Math.sin(angle)*radius, width:40, defense:0,
      hits:0, takeDamage(){this.hits++;}, applyEffect(){} });
    let target=create('moving',400), neighbor=create('neighbor',415);
    const monsters=new Map([[target.id,target],[neighbor.id,neighbor]]);
    const packets=[];
    const game=window.game={localPlayer:{id:'local'}, remotePlayers:new Map(),
      monsterManager:{monsters}, net:{playerId:'local',sendMonsterDamage(id){packets.push(id);return accepted;}},
      addExplosion(){},addSpark(){}};
    const projectile=new Projectile(0,0,null,'fireball',{
      ownerId:'local',speed:800,vx:Math.cos(angle)*800,vy:Math.sin(angle)*800,
      radius:20+(level-1)*10,aoeRadius:(20+(level-1)*10)*2.5,
      lifeTime:400/800+.08,penetrationDelay:(level-1)*.05,
      targetX:target.x,targetY:target.y
    });
    for(let frame=0;frame<120&&!projectile.isDead;frame++){
      // Replace online render objects after first contact, preserving identity.
      if(frame===5){target={...target};neighbor={...neighbor};monsters.set(target.id,target);monsters.set(neighbor.id,neighbor);}
      target.x+=Math.cos(angle)*.15; target.y+=Math.sin(angle)*.15;
      neighbor.x+=Math.cos(angle)*.15;neighbor.y+=Math.sin(angle)*.15;
      projectile.update(1/60,monsters);
    }
    assert.equal(target.hits,accepted?1:0,`online moving Lv${level}`);
    assert.equal(neighbor.hits,accepted?1:0,`online AoE Lv${level}`);
    assert.equal(packets.filter(id=>id==='moving').length,1,'one authored hit only');
    assert.equal(packets.filter(id=>id==='neighbor').length,1,'one AoE hit only');
    onlineCases++;
  }
}
console.log(JSON.stringify({onlineSnapshotAndAuthorityCases:onlineCases,passed:true}));

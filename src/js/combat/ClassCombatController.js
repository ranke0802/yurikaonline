import { acquireBarrageLock, enforceBarrageLock, releaseBarrageLock } from './BarrageLock.js';
import { warriorBarrageProfile, swordWaveProfile, barrageReach } from './WarriorBarrage.js';
import { skillHealingBudget, applyAllocatedHealing } from './SkillHealing.js';
import { SHIELD_RUSH, shieldRushDirection, shieldRushProfile } from './ShieldRush.js';
import { ARROW_RAIN } from './ArrowRain.js';
import { classWeaponBonuses, basicWeaponBonuses } from '../core/ClassWeapons.js';
import { basicAttackProfile } from './BasicAttackProgression.js';
import { basicAttackInterval } from './AttackCadence.js';
import { acceptPoisonPulse } from './WitchPoison.js';
import { WARRIOR_GEOMETRY as WG } from './ClassGeometry.js';
/** Owner-only, simulation-time class mechanics. Never instantiate for remote players.
 * hooks.damage MUST return actual accepted HP loss (0 for rejected/blocked packets).
 * Hooks perform network authority, collision, rendering and summon construction.
 * No wall-clock timers, persistence, account writes or temporary base-stat mutation.
 */
export const SUMMON_TYPES = ['slime', 'squirtle', 'emolga', 'gastly', 'king_slime', 'ruin_wobbuffet', 'thunder_pikachu', 'astral_sylveon'];
const alive = e => e && !e.isDead && e.hp > 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export default class ClassCombatController {
    constructor(owner, classId, hooks = {}) {
        this.owner = owner; this.classId = classId; this.hooks = hooks;
        this.time = 0; this.cooldowns = {}; this.tasks = []; this.projectiles = [];
        this.summons = []; this.statuses = new Map(); this.rage = 0; this.combo = 0; this.effectSerial = 0; this.poisonCastSerial = 0;
        this.basicReady = 0; this.empowered = false; this.disposed = false;
    }
    enemies() { return (this.hooks.enemies?.() || []).filter(alive); }
    allies() { return [...new Set([...(this.hooks.allies?.() || []), ...this.summons])].filter(e => e !== this.owner && alive(e)); }
    state(e) { if (!this.statuses.has(e)) this.statuses.set(e, {}); return this.statuses.get(e); }
    effect(name, data = {}) { const id=data.id || `effect-${++this.effectSerial}`; this.hooks.effect?.(name, { id, ...this.combatOrigin(), ...data }); return id; }
    cancelEffect(id) { if(id)this.hooks.cancelEffect?.(id); }
    schedule(delay, fn) { this.tasks.push({ at: this.time + delay, fn }); }
    area(point, radius) { return this.enemies().filter(e => distance(e, point) <= radius + (e.radius || 16)); }
    attack() { return Math.max(1, this.owner.getEffectiveClassAttackPower?.() || this.owner.attackPower || 1); }
    hit(e, amount, meta = {}, healingGroup = null) {
        if (!alive(e)) return 0;
        const before = e.hp;
        const accepted = this.hooks.damage?.(e, Math.max(1, Math.ceil(amount)), { classId: this.classId, ...meta });
        const actual = clamp(Number(accepted) || 0, 0, before);
        if (actual && this.bloodUntil > this.time) {
            const beforeHeal = this.owner.hp;
            this.heal(this.owner, skillHealingBudget(actual*.2*(this.bloodPotency||1),healingGroup),false);
            const restored = Math.max(0, this.owner.hp - beforeHeal);
            if (restored > 0) this.hooks.lifestealFeedback?.(restored);
        }
        return actual;
    }
    basicHit(e, amount, meta = {}, weapon = null, healState = null, healingGroup = null) {
        const actual = this.hit(e, amount, meta, healingGroup||healState);
        if (actual && weapon?.restoreHpPerLaserHit && (!healState || !healState.healed)) {
            this.healWeapon(weapon.restoreHpPerLaserHit);
            if (healState) healState.healed = true;
        }
        if (actual) { this.queueWeaponChain(e,amount,weapon,healingGroup||healState||{}); this.hooks.basicHit?.(e, actual); }
        return actual;
    }
    skillHit(e, amount, meta, weapon, chainState = {}) {
        const damage = amount * (1 + (weapon?.damageBonus ?? weapon?.missileDamageBonus ?? 0));
        const actual = this.hit(e, damage, meta, chainState);
        if (actual) {
            if(weapon?.restoreHpPerLaserHit && !chainState.healed){this.healWeapon(weapon.restoreHpPerLaserHit);chainState.healed=true;}
            this.queueWeaponChain(e,damage,weapon,chainState);
        }
        return actual;
    }
    queueWeaponChain(e, damage, weapon, chainState = {}) {
        if (!(weapon?.fireballChainChance > 0) || chainState.triggered) return;
        chainState.triggered = true;
        const point = { x:e.x, y:e.y };
        const chain = index => {
            if(this.disposed || !alive(this.owner) || index>12 || (this.hooks.random?.()??Math.random())>=weapon.fireballChainChance)return;
            this.schedule(.3,()=>{
                this.area(point,weapon.radius).forEach(target=>this.hit(target,damage*weapon.fireballChainDamageRatio,{weaponChain:true},chainState));
                this.effect(weapon.effect,{...point,radius:weapon.radius,duration:.3});chain(index+1);
            });
        };
        chain(1);
    }
    heal(e,amount,round=true) {
        const budget=round?skillHealingBudget(amount):Math.max(0,Number(amount)||0);
        if(!budget)return 0;
        if(this.hooks.heal)return this.hooks.heal(e,budget);
        return budget-applyAllocatedHealing(e,budget);
    }
    healWeapon(amount) {
        const before=this.owner.hp;
        this.heal(this.owner,amount);
        const actual=Math.max(0,this.owner.hp-before);
        // Drain return and blood lifesteal already have their own feedback.
        if(actual>0)this.hooks.healFeedback?.(this.owner,actual);
    }
    control(e, type, duration, data = {}, bossReduced = true) {
        if (!alive(e)) return;
        this.hooks.status?.(e, type, bossReduced && e.isBoss ? Math.min(.6, duration) : duration, data);
    }
    mark(e, count = 1) {
        if (!alive(e)) return;
        const s = this.state(e); s.marks = Math.min(5, (s.markUntil > this.time ? s.marks : 0) + count); s.markUntil = this.time + 8;
        this.control(e, 'mark', 8, { stacks: s.marks });
    }
    multipliers(e) {
        const s = this.statuses.get(e);
        return s?.berserkUntil > this.time ? { move: 1.25, attackSpeed: 1.7, attack: 1 + .2*(s.berserkPotency||1) } : { move: 1, attackSpeed: 1, attack: 1 };
    }
    modifyIncomingDamage(amount) {
        if(this.isShieldRushBlocking())return 0;
        if (this.evadeUntil > this.time) return 0;
        const guard = this.guardUntil > this.time, blood = this.bloodUntil > this.time;
        const reduced = Math.max(0, amount * (guard ? .6 : blood ? .8 : 1));
        if (guard) this.rage = Math.min(100, this.rage + Math.min(15, reduced / Math.max(1, this.owner.maxHp) * 100));
        return reduced;
    }
    combatOrigin() {
        const origin = this.hooks.combatOrigin?.();
        return origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
            ? { x: origin.x, y: origin.y } : { x: this.owner.x, y: this.owner.y };
    }
    direction(point) { const origin = this.combatOrigin(); const dx = (point.x ?? origin.x + 1) - origin.x, dy = (point.y ?? origin.y) - origin.y; const len = Math.hypot(dx, dy) || 1; return { x: dx / len, y: dy / len }; }
    line(point, range, width) {
        const origin = this.combatOrigin(), d = this.direction(point);
        return this.enemies().filter(e => { const x = e.x - origin.x, y = e.y - origin.y; const along = x * d.x + y * d.y; const side = Math.abs(x * d.y - y * d.x), radius = e.radius || 16; return Math.hypot(Math.max(0,-along,along-range),Math.max(0,side-width)) <= radius; }).sort((a,b) => distance(a,origin)-distance(b,origin));
    }
    basic({ aimed = false, x, y } = {}) {
        if (this.disposed || !alive(this.owner) || this.hooks.paused?.() || this.shieldRush || this.time < this.basicReady) return false;
        if (this.classId === 'warrior' && aimed && this.rage < 25) {
            this.hooks.failure?.('검격 발사에는 분노 25가 필요합니다. 짧게 눌렀다 놓으면 연속 베기를 사용합니다.');
            return false;
        }
        this.cancelBarrage();
        const weapon = basicWeaponBonuses(this.owner,aimed),healingGroup={};
        let interval = basicAttackInterval(this.classId, {
            aimed, empowered: this.classId === 'archer' && this.empowered,
            speed: this.owner.getEffectiveClassAttackSpeed?.() ?? this.owner.attackSpeed ?? 1
        });
        if (interval === null) return false;
        interval=Math.max(.2,interval*(1-(weapon?.missileManaCostReduction||0)));
        // Reserve before damage/effect hooks: reentrant input cannot spend twice.
        // Schedule from now, never from a stale deadline; low FPS cannot bank bursts.
        this.basicReady = this.time + interval;
        const growth = basicAttackProfile(this.classId, this.owner.skillLevels);
        const power = this.attack() * growth.damageMultiplier * (1 + (weapon?.damageBonus || 0));
        const center = this.combatOrigin();
        let point = { x: x ?? center.x + 100, y: y ?? center.y };
        if (this.classId === 'witch') {
            if (aimed) this.orb(point, growth);
            else point = this.homingDrain(point, growth);
        } else if (this.classId === 'warrior') {
            if (aimed) {
                this.rage -= 25;
                const origin=this.combatOrigin(),direction=shieldRushDirection(this.owner,this.direction(point)),wave=this.getSwordWaveProfile();
                this.projectiles.push({kind:'sword_wave',...origin,direction,speed:wave.speed,remaining:wave.range,
                    age:0,healingGroup,launchOrigin:origin,halfWidth:wave.halfWidth,halfLength:wave.halfLength,hit:new Set(),power:power*wave.damageMultiplier,weapon,knockback:growth.heavy.knockback});
            } else {
                this.combo = this.time - (this.lastCombo || 0) > 1.6 ? 1 : this.combo % 3 + 1; this.lastCombo = this.time;
                let hits = 0; this.line(point, growth.tap.range, growth.tap.halfWidth).forEach(e => {
                    if (this.basicHit(e, power * (this.combo === 3 ? 1.5 : 1), {}, weapon,null,healingGroup)) { hits++; this.pushBasicTarget(e, point, growth.tap.knockback); }
                });
                if (hits && this.combo === 3) this.rage = Math.min(100, this.rage + 18);
                this.effect('warrior_slash', { target: point, combo: this.combo, range: growth.tap.range, halfWidth: growth.tap.halfWidth });
            }
        } else if (this.classId === 'archer') {
            if (aimed) this.snipe(point, growth);
            else this.arrow(point, growth);
        } else return false;
        this.hooks.action?.('basic', { aimed, target: point, interval, combo: this.classId === 'warrior' ? this.combo : undefined, empowered: this.classId === 'archer' && aimed && this.lastEmpowered });
        return true;
    }
    pushBasicTarget(enemy, point, amount) {
        if (!amount || enemy.isBoss || !alive(enemy)) return;
        const d = this.direction(point);
        this.hooks.move?.(enemy, enemy.x + d.x * amount, enemy.y + d.y * amount);
    }
    attackOrigin(point, kind) {
        const origin = this.hooks.attackOrigin?.(point, kind);
        return origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
            ? { x: origin.x, y: origin.y } : { x: this.owner.x, y: this.owner.y };
    }
    projectileDirection(origin, point) {
        const forward = this.direction(point), dx = point.x - origin.x, dy = point.y - origin.y;
        // A close target can lie behind an authored bow/palm. Extend the aim ray
        // forward at least100px from that hand instead of drawing backwards.
        // Normalizing origin + forward *100 gives this same unit forward vector.
        if (dx * forward.x + dy * forward.y < 10) return forward;
        const length = Math.hypot(dx, dy);
        return length > 0 ? { x: dx / length, y: dy / length } : forward;
    }
    launchSweep(origin, point) {
        const from = this.combatOrigin(), forward = this.direction(point), reach = distance(from, origin);
        // Physical near-target compensation follows the aim ray, not the lateral
        // artwork hand offset. The normal projectile remains drawn at that hand.
        return { from, to: { x: from.x + forward.x * reach, y: from.y + forward.y * reach }, forward };
    }
    arrow(point, growth = basicAttackProfile(this.classId, this.owner.skillLevels)) {
        const weapon = basicWeaponBonuses(this.owner,false);
        const origin = this.attackOrigin(point, 'arrow');
        this.projectiles.push({ kind: 'arrow', ...origin, direction: this.projectileDirection(origin, point), spawnSweep: this.launchSweep(origin, point), launchPlane: { origin: this.combatOrigin(), forward: this.direction(point) }, speed: 540, remaining: 600, age:0, weapon, power: this.attack() * growth.damageMultiplier * (1 + (weapon?.damageBonus || 0)) });
        this.effect('archer_shot', { ...origin, target: point });
    }
    orb(point, growth = basicAttackProfile(this.classId, this.owner.skillLevels)) {
        const weapon = basicWeaponBonuses(this.owner,true);
        const origin = this.attackOrigin(point, 'orb');
        this.projectiles.push({ kind: 'orb', ...origin, direction: this.projectileDirection(origin, point), spawnSweep: this.launchSweep(origin, point), launchPlane: { origin: this.combatOrigin(), forward: this.direction(point) }, speed: 210, remaining: 560, radius: growth.orbRadius, weapon, power: this.attack() * growth.damageMultiplier * (1 + (weapon?.damageBonus || 0)) });
        this.effect('drain_orb', { ...origin, target: point });
    }
    homingDrain(fallback, growth) {
        const center=this.combatOrigin();
        const target=this.enemies().filter(e=>distance(e,center)<=560).sort((a,b)=>distance(a,center)-distance(b,center))[0];
        const point=target?{x:target.x,y:target.y}:fallback,origin=this.attackOrigin(point,'orb');
        const weapon=basicWeaponBonuses(this.owner,false);
        this.projectiles.push({kind:'orb',...origin,age:0,homing:true,target,launchCenter:center,
            direction:this.projectileDirection(origin,point),speed:360,remaining:560,radius:growth.orbRadius,
            impactRadius:growth.tapRadius,weapon,power:this.attack()*growth.damageMultiplier*(1+(weapon?.damageBonus||0))});
        this.effect('drain_orb',{...origin,target:point});
        return point;
    }
    impactHomingDrain(p) {
        let drained=0;const healState={};
        for(const target of this.area(p,p.impactRadius)) {
            if(distance(target,p.launchCenter)>560)continue;
            // Splash must not reach through walls adjacent to the impact.
            if(this.drainPathBlocked(p,target,p.radius))continue;
            drained+=this.basicHit(target,p.power*2,{drain:true},p.weapon,healState);
        }
        this.effect('life_circle',{x:p.x,y:p.y,radius:p.impactRadius});
        if(drained>0)this.projectiles.push({kind:'return',x:p.x,y:p.y,speed:300,remaining:Infinity,age:0,life:5,healing:drained*.5});
    }
    drainPathBlocked(from,to,radius) {
        const count=Math.max(1,Math.ceil(distance(from,to)/12));
        for(let i=1;i<=count;i++)if(this.hooks.projectileBlocked?.(from.x+(to.x-from.x)*i/count,from.y+(to.y-from.y)*i/count,radius))return true;
        return false;
    }
    poison(e, pulse = null, weapon = null, chainState = {}) {
        const accepted = this.skillHit(e, this.attack() + e.maxHp * .05, { poison: true, classPoisonPulse: true, ...(pulse ? {poisonPulse:pulse} : {}) }, weapon, chainState);
        // Production Monster applies target-wide state only on the current host.
        if (!accepted || !alive(e) || this.hooks.managesPoisonStatuses) return;
        const s=acceptPoisonPulse(e,this.time,pulse); if(!s)return;
        if(s.stunUntil>this.time)this.control(e,'stun',3,{},false);
        else this.control(e,'poison',5,{stacks:s.stacks,slow:s.stacks*.2},false);
    }
    snipe(point, growth = basicAttackProfile(this.classId, this.owner.skillLevels)) {
        const weapon = basicWeaponBonuses(this.owner,true);
        this.lastEmpowered = this.empowered; this.empowered = false;
        const origin = this.attackOrigin(point, 'snipe');
        this.projectiles.push({kind:'snipe', ...origin, age:0,
            direction:this.projectileDirection(origin,point), spawnSweep:this.launchSweep(origin,point),
            launchPlane:{origin:this.combatOrigin(),forward:this.direction(point)},
            speed:780, remaining:650, hitTargets:new Set(), healingGroup:{}, weapon, power:this.attack() * growth.damageMultiplier * (1 + (weapon?.damageBonus || 0)), empowered:this.lastEmpowered});
        // This committed event drives the firing sound; the moving projectile owns
        // the visible arrow. Damage and mark consumption happen only on contact.
        this.effect('piercing_snipe', { ...origin, target:point, empowered:this.lastEmpowered });
    }
    hitSnipe(p,e) {
        const key=e.id??e;
        if(p.hitTargets.has(key))return;
        p.hitTargets.add(key);
        const s=this.state(e),marks=s.markUntil>this.time?s.marks||0:0;
        const actual=this.basicHit(e,p.power*(1.8+marks*(p.empowered?.85:.5)),{armorPierce:.5},p.weapon,null,p.healingGroup);
        if(!actual)return;
        s.marks=0;s.markUntil=0;this.hooks.clearStatus?.(e,'mark');
        if(s.trappedUntil>this.time){
            s.trappedUntil=0;
            this.area(e,130).filter(other=>other!==e).forEach(other=>{this.hit(other,p.power);this.mark(other,2);});
            this.effect('trap_burst',{x:e.x,y:e.y,radius:130});
        }
    }
    skill(slot, options = {}) {
        if(this.castingSkill)return false;
        this.castingSkill=true;
        try { return this.castSkill(slot,options); } finally { this.castingSkill=false; }
    }
    castSkill(slot, { x, y, level = 1 } = {}) {
        if (this.disposed || !alive(this.owner) || this.hooks.paused?.() || (this.cooldowns[slot] || 0) > this.time || this.shieldRush) return false;
        if(this.barrage&&slot===2||this.owner.classStatuses?.stun?.remaining>0)return false;
        this.cancelBarrage();
        const center = this.combatOrigin();
        const point = { x: x ?? center.x, y: y ?? center.y }; const d = this.direction(point); const reach = distance(point, center);
        if (reach > 450) { point.x = center.x + d.x * 450; point.y = center.y + d.y * 450; }
        const skillLevel = clamp(Math.floor(Number(level) || 1), 1, 8);
        const power = this.attack() * (1 + .08 * (skillLevel - 1));
        const bonuses = classWeaponBonuses(this.owner);
        const weapon = bonuses?.slot === slot ? bonuses : null;
        const chainState = {};
        let cooldown;
        if (this.classId === 'witch') {
            if (slot === 1) {
                // Five pulses at t=1..5; a target entering late only gets remaining pulses.
                const castId = `poison-${++this.poisonCastSerial}`;
                for (let i = 1; i <= 5; i++) this.schedule(i, () => this.area(point, 140).forEach(e => this.poison(e,{castId,index:i}, weapon, chainState)));
                // Throw lands before the unchanged first damage pulse at t=1.
                const flight = .45;
                this.effect('poison_potion', { ...this.attackOrigin(point, 'poison_potion'), target: point, duration: flight });
                this.schedule(flight, () => this.effect('poison_cloud', { ...point, duration: 5 - flight, radius: 140 })); cooldown = 9;
            } else if (slot === 2) {
                const cost = this.owner.maxHp * .8;
                if (this.owner.hp <= cost) { this.hooks.failure?.('소환하려면 최대 HP의 80%보다 많은 현재 HP가 필요합니다.'); return false; }
                const summon = this.hooks.summon?.(SUMMON_TYPES[clamp(Math.floor(level), 1, 8) - 1], level, weapon);
                if (!summon) return false;
                this.owner.hp -= cost; this.summons.push(summon);
                if (this.summons.length > 3) this.hooks.dismiss?.(this.summons.shift());
                this.effect('summon', { x: summon.x, y: summon.y }); cooldown = 1;
            } else if (slot === 3) {
                const targets=this.allies(),potency=1+(weapon?.damageBonus||0);
                targets.forEach(e => { Object.assign(this.state(e),{berserkUntil:this.time+10,berserkPotency:potency}); this.control(e,'berserk',10,{potency},false); });
                if(targets.length&&weapon?.restoreHpPerLaserHit)this.healWeapon(weapon.restoreHpPerLaserHit);
                this.effect('berserk_potion', { radius: 240 }); cooldown = 16;
            }
        } else if (this.classId === 'warrior') {
            if (slot === 1) {
                if(this.hooks.canStartShieldRush?.()===false)return false;
                const forward=shieldRushDirection(this.owner,d);
                if(this.hooks.canMoveShieldRush?.(this.owner.x+forward.x*8,this.owner.y+forward.y*8)===false) {
                    this.hooks.failure?.('앞이 막혀 있어 방패 돌진을 시작할 수 없습니다.');
                    return false;
                }
                const profile=shieldRushProfile(skillLevel);
                this.shieldRush={started:this.time,until:this.time+profile.duration,remaining:profile.distance,profile,
                    elapsed:0,bank:0,direction:forward,lastX:this.owner.x,lastY:this.owner.y,hit:new Map(),
                    totalDamage:Math.max(profile.hits,Math.ceil(power*(1+(weapon?.damageBonus||0)))),weapon,chainState};
                this.shieldRush.effectId=this.effect('shield_rush',{duration:profile.duration,target:{x:center.x+forward.x*profile.distance,y:center.y+forward.y*profile.distance}});
                this.hitShieldRushTargets();
                cooldown = 10;
            } else if (slot === 2) {
                const profile=warriorBarrageProfile(skillLevel),direction=shieldRushDirection(this.owner,d);
                const totalDamage=Math.max(1,Math.ceil(this.attack()*profile.damageMultiplier*(1+(weapon?.damageBonus||0))));
                this.barrage={started:this.time,profile,direction,totalDamage,weapon,chainState,nextPulse:0,refunded:false,lastX:this.owner.x,lastY:this.owner.y,targets:new Map(),locked:new Set()};
                const b=this.barrage;b.castId=`barrage-${++this.effectSerial}`;
                acquireBarrageLock(this.owner,b,{active:()=>this.barrage===b});
                const geometry=this.barrageGeometry();
                this.barrage.effectId=this.effect('gwangcheon',{...geometry,duration:profile.duration,pulseCount:profile.hits});
                this.advanceBarrage();cooldown=7;
            } else if (slot === 3) {
                this.bloodUntil = this.time + 8; this.bloodPotency=1+(weapon?.damageBonus||0);
                this.schedule(8, () => { const spent = this.rage; this.rage = 0; this.area(this.combatOrigin(), WG.finale.radius).forEach(e => this.skillHit(e, power * (1 + spent * .04),{},weapon,chainState)); this.effect('blood_finale', { radius: 170, rage: spent }); });
                this.effect('blood_pact', { duration: 8 }); cooldown = 20;
            }
        } else if (this.classId === 'archer') {
            if (slot === 1) {
                this.cancelEffect(this.trap?.id);
                const id=this.effect('hunter_trap', { ...point, duration: 10 }); this.trap = { ...point, id, weapon, power, chainState, until: this.time + 10 }; cooldown = 7;
            } else if (slot === 2) {
                const origin = { x: this.owner.x, y: this.owner.y };
                const retreat=shieldRushDirection(this.owner,d);
                const visualOrigin = this.combatOrigin();
                const retreatDistance=160*(1+(weapon?.damageBonus||0));
                for(let traveled=0;traveled<retreatDistance;traveled+=20){const step=Math.min(20,retreatDistance-traveled);if(this.hooks.move?.(this.owner,this.owner.x-retreat.x*step,this.owner.y-retreat.y*step)===false)break;}
                this.evadeUntil = this.time + .35; this.empowered = true;
                this.hooks.decoy?.(origin, 2); this.effect('shadow_leap', { ...visualOrigin, target: this.combatOrigin() }); cooldown = 8;
            } else if (slot === 3) {
                const transferred = new Set();
                for (let i = 1; i <= ARROW_RAIN.waves; i++) this.schedule(i * ARROW_RAIN.interval, () => {
                    for (const e of this.area(point, 165)) {
                        const s = this.state(e), marks = s.markUntil > this.time ? s.marks || 0 : 0;
                        const actual = this.skillHit(e, power * (.55 + (marks ? .45 : 0)), {}, weapon, chainState);
                        if (actual && !alive(e) && marks && !transferred.has(e)) {
                            transferred.add(e); const next = this.area(e, 180).sort((a,b) => distance(a,e)-distance(b,e))[0];
                            if (next) this.mark(next, marks); // transfer only; no recursive damage or immediate extra pulse
                        }
                    }
                });
                this.effect('tracking_rain', { ...point, duration: ARROW_RAIN.waves * ARROW_RAIN.interval + ARROW_RAIN.impactLife, radius: 165 }); cooldown = 12;
            }
        }
        if (!cooldown) return false;
        // Skill growth reduces cooldown by 3% per level (cap 21%). Witch
        // explicitly requested damage/heal/HP-cost/buff values remain unchanged.
        this.cooldowns[slot] = this.time + cooldown * (1 - .03 * (skillLevel - 1)) * (1 - (weapon?.missileManaCostReduction || 0));
        this.hooks.action?.('skill', { slot, level: skillLevel, target: point, cooldown: this.cooldowns[slot] - this.time });
        return true;
    }
    isShieldRushBlocking() {
        return !this.disposed && alive(this.owner) && !!this.shieldRush && this.time<this.shieldRush.until
            && Math.hypot(this.owner.x-this.shieldRush.lastX,this.owner.y-this.shieldRush.lastY)<=4;
    }
    shieldBlockFeedback() {
        if(!this.isShieldRushBlocking() || this.time<(this.shieldFlashReady||0))return;
        this.shieldFlashReady=this.time+.14;
        this.effect('shield_block',{duration:.28});
    }
    stopShieldRush() {
        if(!this.shieldRush)return;
        this.cancelEffect(this.shieldRush.effectId);this.shieldRush=null;
        this.hooks.shieldRushEnded?.();
    }
    hitShieldRushTargets() {
        const rush=this.shieldRush;if(!rush)return;
        const {profile,direction:d}=rush,center=this.combatOrigin();
        const pulse=Math.min(profile.hits-1,Math.floor((rush.elapsed+1e-9)/profile.interval));
        for(const e of this.area(center,SHIELD_RUSH.halfWidth)){
            if((e.x-center.x)*d.x+(e.y-center.y)*d.y<0)continue;
            const record=rush.hit.get(e)||{pulse:-1,knockbacks:0,hits:0};
            if(record.pulse===pulse)continue;
            record.pulse=pulse;rush.hit.set(e,record);
            const damage=Math.floor(rush.totalDamage*(pulse+1)/profile.hits)-Math.floor(rush.totalDamage*pulse/profile.hits);
            if(damage<=0 || !this.skillHit(e,damage,{},rush.weapon?{...rush.weapon,damageBonus:0,missileDamageBonus:0}:null,rush.chainState))continue;
            record.hits++;this.state(e).shieldHitUntil=this.time+SHIELD_RUSH.markSeconds;
            if(!e.isBoss){
                let pushed=this.hooks.pushShieldTarget?.(e,d,profile.push)||0;
                for(let left=this.hooks.pushShieldTarget?0:profile.push;left>1e-8;){const step=Math.min(8,left);
                    if(this.hooks.move?.(e,e.x+d.x*step,e.y+d.y*step)!==true)break;
                    pushed+=step;left-=step;
                }
                if(pushed>0)record.knockbacks++;
                if(record.knockbacks>=3){this.state(e).shieldStunUntil=this.time+profile.stun;this.control(e,'stun',profile.stun);}
            }
            this.effect('shield_impact',{x:e.x,y:e.y,duration:.28});
        }
    }
    advanceShieldRush(dt) {
        const rush=this.shieldRush;if(!rush)return;
        if(Math.hypot(this.owner.x-rush.lastX,this.owner.y-rush.lastY)>4){this.stopShieldRush();return;}
        // Fixed simulation steps make contact, pulse windows and pushes independent of render FPS.
        const end=this.time; rush.bank+=dt;
        while(rush.bank+1e-9>=1/120 && this.shieldRush){
            const delta=Math.min(1/120,rush.profile.duration-rush.elapsed),step=delta*SHIELD_RUSH.speed,d=rush.direction;
            rush.bank-=1/120;rush.elapsed+=delta;this.time=rush.started+rush.elapsed;
            if(this.hooks.move?.(this.owner,this.owner.x+d.x*step,this.owner.y+d.y*step)!==true){this.stopShieldRush();break;}
            rush.remaining-=step;rush.lastX=this.owner.x;rush.lastY=this.owner.y;
            this.hitShieldRushTargets();
            if(rush.elapsed+1e-8>=rush.profile.duration){this.stopShieldRush();break;}
        }
        this.time=end;
    }
    getSwordWaveProfile() {
        return swordWaveProfile(basicAttackProfile(this.classId,this.owner.skillLevels),this.hooks.viewportSpan?.());
    }
    barrageGeometry() {
        const b=this.barrage,origin=this.combatOrigin();
        const range=barrageReach(origin,b.direction,b.profile,this.hooks.projectileBlocked);
        return {...origin,range,halfWidth:b.profile.halfWidth,target:{x:origin.x+b.direction.x*range,y:origin.y+b.direction.y*range}};
    }
    cancelBarrage() {
        if(!this.barrage)return;
        const b=this.barrage;this.barrage=null;
        releaseBarrageLock(this.owner,b);
        for(const e of b.locked){releaseBarrageLock(e,b);this.hooks.barrageRelease?.(e,b.castId);}
        this.cancelEffect(b.effectId);this.hooks.barrageEnded?.();
    }
    advanceBarrage() {
        const b=this.barrage;if(!b)return;
        if(!alive(this.owner)||this.owner.classStatuses?.stun?.remaining>0){this.cancelBarrage();return;}
        enforceBarrageLock(this.owner);
        for(const e of b.locked)enforceBarrageLock(e);
        const geometry=this.barrageGeometry(),end=this.time,elapsed=end-b.started;
        this.hooks.updateEffect?.(b.effectId,{...geometry,age:elapsed});
        while(this.barrage===b && b.nextPulse<b.profile.hits && b.nextPulse*b.profile.interval<=elapsed+1e-8){
            const index=b.nextPulse++;
            this.time=b.started+index*b.profile.interval;
            if(geometry.range<=0)continue;
            const d=b.direction,seen=new Set();
            for(const e of this.enemies()){
                const key=e.id??e;if(seen.has(key))continue;seen.add(key);
                const x=e.x-geometry.x,y=e.y-geometry.y,along=x*d.x+y*d.y,side=Math.abs(x*d.y-y*d.x);
                if(along<0||along>geometry.range||side>b.profile.halfWidth+(e.radius||16))continue;
                // Whole corridor stops at the first wall; never hit through it.
                if(!b.targets.has(key))b.targets.set(key,Math.max(1,Math.ceil(b.totalDamage-Math.max(0,Number(e.defense)||0))));
                const budget=b.targets.get(key),damage=Math.ceil(budget*(index+1)/b.profile.hits)-Math.ceil(budget*index/b.profile.hits);
                if(damage<=0)continue;
                const accepted=this.skillHit(e,damage,{barrage:true,pulse:index,armorPierce:1,barrageCastId:b.castId,barrageRemaining:Math.max(0,b.profile.duration-(this.time-b.started))},b.weapon?{...b.weapon,damageBonus:0,missileDamageBonus:0}:null,b.chainState);
                if(this.barrage!==b){this.hooks.barrageRelease?.(e,b.castId);break;}
                if(accepted&&alive(e)){b.locked.add(e);acquireBarrageLock(e,b,{active:()=>this.barrage===b,blockAttacks:true});}
                if(accepted&&!b.refunded&&this.state(e).shieldHitUntil>this.time){b.refunded=true;this.rage=Math.min(100,this.rage+25);}
            }
        }
        this.time=end;
        if(this.barrage===b&&elapsed>=b.profile.duration-1e-8)this.cancelBarrage();
    }
    advanceSwordWave(p,dt) {
        p.age+=dt;
        const distance=Math.min(p.remaining,p.speed*dt),steps=Math.max(1,Math.ceil(distance/4));
        for(let i=0;i<steps;i++){
            const x=p.x+p.direction.x*distance/steps,y=p.y+p.direction.y*distance/steps;
            // Sweep the full blade width through walls, not just its center.
            for(let side=-p.halfWidth;side<=p.halfWidth;side+=8){
                if(this.hooks.projectileBlocked?.(x+p.direction.x*(p.halfLength||36)-p.direction.y*side,y+p.direction.y*(p.halfLength||36)+p.direction.x*side,4)){
                    this.projectiles.splice(this.projectiles.indexOf(p),1);return;
                }
            }
            p.x=x;p.y=y;
            for(const e of this.enemies()){
                const dx=e.x-x,dy=e.y-y,along=dx*p.direction.x+dy*p.direction.y,side=Math.abs(dx*p.direction.y-dy*p.direction.x);
                const key=e.id??e;
                if(p.hit.has(key)||(e.x-p.launchOrigin.x)*p.direction.x+(e.y-p.launchOrigin.y)*p.direction.y<0||Math.abs(along)>(p.halfLength||36)+(e.radius||16)||side>p.halfWidth+(e.radius||16))continue;
                p.hit.add(key);
                if(this.basicHit(e,p.power,{armorPierce:1},p.weapon,null,p.healingGroup)&&!e.isBoss&&p.knockback)
                    this.hooks.move?.(e,e.x+p.direction.x*p.knockback,e.y+p.direction.y*p.knockback);
            }
        }
        p.remaining-=distance;
        if(p.remaining<=1e-8)this.projectiles.splice(this.projectiles.indexOf(p),1);
    }
    update(dt) {
        if (this.disposed || !Number.isFinite(dt) || dt <= 0 || this.hooks.paused?.()) return;
        if (!alive(this.owner)) { this.dispose(); return; }
        // Process at exact simulation deadlines (including staggered 1s drain ticks).
        const end = this.time + Math.min(dt, .25);
        this.time=end;this.advanceShieldRush(Math.min(dt,.25));this.advanceBarrage();
        this.tasks.sort((a,b) => a.at - b.at);
        while (this.tasks[0]?.at <= end) { const task = this.tasks.shift(); this.time = task.at; task.fn(); this.tasks.sort((a,b) => a.at - b.at); }
        this.time = end;
        this.summons = this.summons.filter(e => { if (alive(e)) return true; this.hooks.dismiss?.(e); return false; });
        if (this.trap && this.trap.until > this.time) {
            const e = this.area(this.trap, 36)[0];
            if (e) { this.queueWeaponChain(e,this.trap.power,this.trap.weapon,this.trap.chainState); this.mark(e, 3); this.state(e).trappedUntil = this.time + 4; this.control(e, 'root', 2); this.cancelEffect(this.trap.id); this.effect('trap_trigger', { x:this.trap.x,y:this.trap.y }); this.trap = null; }
        } else { this.cancelEffect(this.trap?.id); this.trap = null; }
        for (const p of [...this.projectiles]) this.advanceProjectile(p, Math.min(dt, .25));
        for (const [e, s] of this.statuses) if (!alive(e)) this.statuses.delete(e);
    }
    resolveProjectileHit(p, e) {
        if(p.homing){
            if(!this.projectiles.includes(p))return;
            this.projectiles.splice(this.projectiles.indexOf(p),1);
            this.impactHomingDrain(p);return;
        }
        if(p.kind==='snipe'){this.hitSnipe(p,e);return;}
        if (p.kind === 'arrow') { if (this.basicHit(e, (p.power ?? this.attack()) * .85, {}, p.weapon)) this.mark(e); }
        else {
            this.control(e, 'stagger', .35); let drained = 0; const healState = {};
            // Contact starts a 3-second channel, total 100% ATK, three 1-second ticks.
            const atk = Math.ceil(p.power ?? this.attack()); const start = { x: p.x, y: p.y };
            for (let tick = 1; tick <= 3; tick++) this.schedule(tick, () => {
                const portion = tick < 3 ? Math.floor(atk / 3) : atk - 2 * Math.floor(atk / 3);
                if (portion > 0) drained += this.basicHit(e, portion, { drain: true }, p.weapon, healState);
                if (tick === 3) this.projectiles.push({ ...start, kind: 'return', speed: 300, remaining: Infinity, healing: drained * .5 });
            });
            this.effect('drain_link', { ...start, target: e, duration: 3 });
        }
        const index = this.projectiles.indexOf(p);
        if (index >= 0) this.projectiles.splice(index, 1);
    }
    advanceProjectile(p, dt) {
        if(!this.projectiles.includes(p))return;
        if(p.kind==='sword_wave'){this.advanceSwordWave(p,dt);return;}
        if(p.homing){
            p.age+=dt;
            if(p.age>3 || (p.target && (!alive(p.target) || !this.enemies().includes(p.target)))){this.projectiles.splice(this.projectiles.indexOf(p),1);return;}
            if(p.target && distance(p.target,p.launchCenter)<=560){
                const dx=p.target.x-p.x,dy=p.target.y-p.y,len=Math.hypot(dx,dy);
                if(len>0)p.direction={x:dx/len,y:dy/len};
            }
        }
        if(p.kind==='arrow'||p.kind==='snipe')p.age=(p.age||0)+dt;
        const amount = Math.min(p.remaining, p.speed * dt), steps = Math.max(1, Math.ceil(amount / 12));
        if (p.kind === 'return') {
            if(Number.isFinite(p.life)){p.life-=dt;p.age+=dt;if(p.life<=0){this.projectiles.splice(this.projectiles.indexOf(p),1);return;}}
            const origin = this.attackOrigin(p, 'return');
            const dist = distance(p, origin), step = p.speed * dt;
            if (dist <= step + 12) {
                const budget=skillHealingBudget(p.healing);let excess=budget;
                for(const target of [this.owner,...this.allies()]){
                    const before=target.hp;excess=this.heal(target,excess,false);
                    const actual=Math.max(0,target.hp-before);if(actual>0)this.hooks.healFeedback?.(target,actual);
                    if(excess<=0)break;
                }
                const healed = Math.max(0,budget-excess);
                if(healed>0)this.effect('drain_heal',{...origin,amount:healed});
                this.projectiles.splice(this.projectiles.indexOf(p), 1); return;
            }
            p.direction={x:(origin.x-p.x)/dist,y:(origin.y-p.y)/dist};
            p.x += (origin.x - p.x) / dist * step; p.y += (origin.y - p.y) / dist * step; return;
        }
        if (p.spawnSweep) {
            const { from, to, forward } = p.spawnSweep; delete p.spawnSweep;
            const sx = to.x - from.x, sy = to.y - from.y, length2 = sx * sx + sy * sy;
            if (length2 > 0) {
                if(p.kind==='snipe'){
                    const count=Math.max(1,Math.ceil(Math.sqrt(length2)/4));
                    for(let i=0;i<=count;i++)if(this.hooks.projectileBlocked?.(from.x+sx*i/count,from.y+sy*i/count,18)){
                        this.projectiles.splice(this.projectiles.indexOf(p),1);return;
                    }
                }
                const contacts = this.enemies().map(e => {
                    const ex=e.x-from.x, ey=e.y-from.y;
                    const t=clamp((ex*sx+ey*sy)/length2,0,1), x=from.x+sx*t, y=from.y+sy*t;
                    return {e,t,x,y,front:ex*forward.x+ey*forward.y>=0,within:Math.hypot(e.x-x,e.y-y)<=(e.radius||16)+(p.kind==='orb'?(p.radius ?? 14):p.kind==='snipe'?18:8)};
                }).filter(c=>c.front&&c.within).sort((a,b)=>a.t-b.t);
                if(contacts.length){
                    if(p.kind==='snipe')contacts.forEach(c=>this.resolveProjectileHit(p,c.e));
                    else {const c=contacts[0];p.x=c.x;p.y=c.y;this.resolveProjectileHit(p,c.e);return;}
                }
            }
        }
        for (let i = 0; i < steps; i++) {
            if((p.homing||p.kind==='snipe') && this.hooks.projectileBlocked?.(p.x+p.direction.x*amount/steps,p.y+p.direction.y*amount/steps,p.kind==='snipe'?18:p.radius)){this.projectiles.splice(this.projectiles.indexOf(p),1);return;}
            p.x += p.direction.x * amount / steps; p.y += p.direction.y * amount / steps;
            const contacts=this.area(p,p.kind==='orb'?(p.radius ?? 14):p.kind==='snipe'?18:8).filter(e=>(!p.homing || distance(e,p.launchCenter)<=560) && (!p.launchPlane||(e.x-p.launchPlane.origin.x)*p.launchPlane.forward.x+(e.y-p.launchPlane.origin.y)*p.launchPlane.forward.y>=0));
            if(p.kind==='snipe'){contacts.forEach(e=>this.resolveProjectileHit(p,e));continue;}
            if(!contacts.length)continue;
            this.resolveProjectileHit(p,contacts[0]);return;
        }
        p.remaining -= amount;
        if (p.remaining <= 0) this.projectiles.splice(this.projectiles.indexOf(p), 1);
    }
    dispose() {
        if (this.disposed) return;
        this.stopShieldRush();
        this.cancelBarrage();
        this.disposed = true; this.tasks = []; this.projectiles = []; this.trap = null;
        this.summons.forEach(e => this.hooks.dismiss?.(e)); this.summons = [];
        for (const [e] of this.statuses) for (const type of ['berserk', 'mark', 'root', 'taunt']) this.hooks.clearStatus?.(e, type);
        this.statuses.clear(); this.rage = 0; this.bloodUntil = this.guardUntil = this.evadeUntil = 0;
    }
}

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
        this.summons = []; this.statuses = new Map(); this.rage = 0; this.combo = 0; this.effectSerial = 0;
        this.basicReady = 0; this.empowered = false; this.disposed = false;
    }
    enemies() { return (this.hooks.enemies?.() || []).filter(alive); }
    allies() { return [...new Set([...(this.hooks.allies?.() || []), ...this.summons])].filter(e => e !== this.owner && alive(e)); }
    state(e) { if (!this.statuses.has(e)) this.statuses.set(e, {}); return this.statuses.get(e); }
    effect(name, data = {}) { const id=data.id || `effect-${++this.effectSerial}`; this.hooks.effect?.(name, { id, x: this.owner.x, y: this.owner.y, ...data }); return id; }
    cancelEffect(id) { if(id)this.hooks.cancelEffect?.(id); }
    schedule(delay, fn) { this.tasks.push({ at: this.time + delay, fn }); }
    area(point, radius) { return this.enemies().filter(e => distance(e, point) <= radius + (e.radius || 16)); }
    attack() { return Math.max(1, this.owner.getEffectiveClassAttackPower?.() || this.owner.attackPower || 1); }
    hit(e, amount, meta = {}) {
        if (!alive(e)) return 0;
        const before = e.hp;
        const accepted = this.hooks.damage?.(e, Math.max(1, Math.ceil(amount)), { classId: this.classId, ...meta });
        const actual = clamp(Number(accepted) || 0, 0, before);
        if (actual && this.bloodUntil > this.time) this.heal(this.owner, actual * .2);
        return actual;
    }
    heal(e, amount) { if (this.hooks.heal) return this.hooks.heal(e, amount); const accepted = Math.min(Math.max(0, (e.maxHp || e.hp) - e.hp), amount); e.hp += accepted; return amount - accepted; }
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
        return s?.berserkUntil > this.time ? { move: 1.25, attackSpeed: 1.7, attack: 1.2 } : { move: 1, attackSpeed: 1, attack: 1 };
    }
    modifyIncomingDamage(amount) {
        if (this.evadeUntil > this.time) return 0;
        const guard = this.guardUntil > this.time, blood = this.bloodUntil > this.time;
        const reduced = Math.max(0, amount * (guard ? .6 : blood ? .8 : 1));
        if (guard) this.rage = Math.min(100, this.rage + Math.min(15, reduced / Math.max(1, this.owner.maxHp) * 100));
        return reduced;
    }
    direction(point) { const dx = (point.x ?? this.owner.x + 1) - this.owner.x, dy = (point.y ?? this.owner.y) - this.owner.y; const len = Math.hypot(dx, dy) || 1; return { x: dx / len, y: dy / len }; }
    line(point, range, width) {
        const d = this.direction(point);
        return this.enemies().filter(e => { const x = e.x - this.owner.x, y = e.y - this.owner.y; const along = x * d.x + y * d.y; return along >= 0 && along <= range && Math.abs(x * d.y - y * d.x) <= width + (e.radius || 16); }).sort((a,b) => distance(a,this.owner)-distance(b,this.owner));
    }
    basic({ aimed = false, x, y } = {}) {
        if (this.disposed || !alive(this.owner) || this.time < this.basicReady) return false;
        const point = { x: x ?? this.owner.x + 100, y: y ?? this.owner.y };
        if (this.classId === 'witch') {
            if (aimed) this.orb(point);
            else { this.area(this.owner, 95).forEach(e => this.hit(e, this.attack() * 2)); this.effect('life_circle', { radius: 95 }); }
        } else if (this.classId === 'warrior') {
            if (aimed) {
                if (this.rage < 25) return false;
                this.rage -= 25;
                this.line(point, WG.heavy.range, WG.heavy.halfWidth).forEach(e => this.hit(e, this.attack() * 3, { armorPierce: 1 }));
                this.effect('rage_smash', { target: point });
            } else {
                this.combo = this.time - (this.lastCombo || 0) > 1.6 ? 1 : this.combo % 3 + 1; this.lastCombo = this.time;
                let hits = 0; this.line(point, WG.tap.range, WG.tap.halfWidth).forEach(e => { if(this.hit(e, this.attack() * (this.combo === 3 ? 1.5 : 1))) hits++; });
                if (hits && this.combo === 3) this.rage = Math.min(100, this.rage + 18);
                this.effect('warrior_slash', { target: point, combo: this.combo });
            }
        } else if (this.classId === 'archer') {
            if (aimed) this.snipe(point);
            else this.arrow(point);
        } else return false;
        this.basicReady = this.time + (aimed ? (this.classId === 'archer' && this.lastEmpowered ? .35 : .85) : .45) / Math.max(.1, this.owner.getEffectiveClassAttackSpeed?.() || this.owner.attackSpeed || 1);
        return true;
    }
    arrow(point) {
        this.projectiles.push({ kind: 'arrow', x: this.owner.x, y: this.owner.y, direction: this.direction(point), speed: 540, remaining: 600 });
        this.effect('archer_shot', { target: point });
    }
    orb(point) {
        this.projectiles.push({ kind: 'orb', x: this.owner.x, y: this.owner.y, direction: this.direction(point), speed: 210, remaining: 560 });
        this.effect('drain_orb', { target: point });
    }
    poison(e) {
        const accepted = this.hit(e, this.attack() + e.maxHp * .05, { poison: true, classPoisonPulse: true });
        // Production Monster applies target-wide state only on the current host.
        if (!accepted || !alive(e) || this.hooks.managesPoisonStatuses) return;
        const s=acceptPoisonPulse(e,this.time); if(!s)return;
        if(s.stunUntil>this.time)this.control(e,'stun',3,{},false);
        else this.control(e,'poison',5,{stacks:s.stacks,slow:s.stacks*.2},false);
    }
    snipe(point) {
        this.lastEmpowered = this.empowered; this.empowered = false;
        for (const e of this.line(point, 650, 18)) {
            const s = this.state(e), marks = s.markUntil > this.time ? s.marks || 0 : 0;
            const actual = this.hit(e, this.attack() * (1.8 + marks * (this.lastEmpowered ? .85 : .5)), { armorPierce: .5 });
            if (!actual) continue;
            s.marks = 0; s.markUntil = 0; this.hooks.clearStatus?.(e, 'mark');
            if (s.trappedUntil > this.time) {
                s.trappedUntil = 0;
                this.area(e, 130).filter(other => other !== e).forEach(other => { this.hit(other, this.attack()); this.mark(other, 2); });
                this.effect('trap_burst', { x: e.x, y: e.y });
            }
        }
        this.effect('piercing_snipe', { target: point, empowered: this.lastEmpowered });
    }
    skill(slot, { x = this.owner.x, y = this.owner.y, level = 1 } = {}) {
        if (this.disposed || !alive(this.owner) || (this.cooldowns[slot] || 0) > this.time) return false;
        const point = { x, y }; const d = this.direction(point); const reach = distance(point, this.owner);
        if (reach > 450) { point.x = this.owner.x + d.x * 450; point.y = this.owner.y + d.y * 450; }
        const skillLevel = clamp(Math.floor(Number(level) || 1), 1, 8);
        const power = this.attack() * (1 + .08 * (skillLevel - 1));
        let cooldown;
        if (this.classId === 'witch') {
            if (slot === 1) {
                // Five pulses at t=1..5; a target entering late only gets remaining pulses.
                for (let i = 1; i <= 5; i++) this.schedule(i, () => this.area(point, 140).forEach(e => this.poison(e)));
                this.effect('poison_cloud', { ...point, duration: 5, radius: 140 }); cooldown = 9;
            } else if (slot === 2) {
                const cost = this.owner.maxHp * .8;
                if (this.owner.hp <= cost) { this.hooks.failure?.('소환하려면 최대 HP의 80%보다 많은 현재 HP가 필요합니다.'); return false; }
                const summon = this.hooks.summon?.(SUMMON_TYPES[clamp(Math.floor(level), 1, 8) - 1], level);
                if (!summon) return false;
                this.owner.hp -= cost; this.summons.push(summon);
                if (this.summons.length > 3) this.hooks.dismiss?.(this.summons.shift());
                this.effect('summon', { x: summon.x, y: summon.y }); cooldown = 1;
            } else if (slot === 3) {
                this.allies().forEach(e => { this.state(e).berserkUntil = this.time + 10; this.control(e, 'berserk', 10, {}, false); });
                this.effect('berserk_potion', { radius: 240 }); cooldown = 16;
            }
        } else if (this.classId === 'warrior') {
            if (slot === 1) {
                this.guardUntil = this.time + 4;
                this.area(this.owner, WG.challenge.radius).forEach(e => { this.state(e).tauntUntil = this.time + (e.isBoss ? .6 : 4); this.control(e, 'taunt', 4, { target: this.owner }); });
                this.effect('challenge', { radius: 230 }); cooldown = 10;
            } else if (slot === 2) {
                // Swept 20px collision steps: no teleport through walls or missed targets.
                const hit = new Set(); let refund = false;
                for (let i = 0; i < 12; i++) {
                    if (this.hooks.move?.(this.owner, this.owner.x + d.x * 20, this.owner.y + d.y * 20) === false) break;
                    for (const e of this.area(this.owner, WG.charge.halfWidth)) {
                        if (hit.has(e)) continue; hit.add(e);
                        if (!this.hit(e, power * 1.6)) continue;
                        if (this.state(e).tauntUntil > this.time) refund = true;
                        if (!e.isBoss && this.hooks.move?.(e, e.x + d.x * 80, e.y + d.y * 80) === false) this.control(e, 'stun', 1.5);
                    }
                }
                if (refund) this.rage = Math.min(100, this.rage + 25);
                this.effect('punishing_charge', { target: point }); cooldown = 7;
            } else if (slot === 3) {
                this.bloodUntil = this.time + 8;
                this.schedule(8, () => { const spent = this.rage; this.rage = 0; this.area(this.owner, WG.finale.radius).forEach(e => this.hit(e, power * (1 + spent * .04))); this.effect('blood_finale', { radius: 170, rage: spent }); });
                this.effect('blood_pact', { duration: 8 }); cooldown = 20;
            }
        } else if (this.classId === 'archer') {
            if (slot === 1) {
                this.cancelEffect(this.trap?.id);
                const id=this.effect('hunter_trap', { ...point, duration: 10 }); this.trap = { ...point, id, until: this.time + 10 }; cooldown = 7;
            } else if (slot === 2) {
                const origin = { x: this.owner.x, y: this.owner.y };
                for (let i = 0; i < 8; i++) if (this.hooks.move?.(this.owner, this.owner.x + d.x * 20, this.owner.y + d.y * 20) === false) break;
                this.evadeUntil = this.time + .35; this.empowered = true;
                this.hooks.decoy?.(origin, 2); this.effect('shadow_leap', { ...origin, target: { x: this.owner.x, y: this.owner.y } }); cooldown = 8;
            } else if (slot === 3) {
                const transferred = new Set();
                for (let i = 1; i <= 5; i++) this.schedule(i * .6, () => {
                    for (const e of this.area(point, 165)) {
                        const s = this.state(e), marks = s.markUntil > this.time ? s.marks || 0 : 0;
                        const actual = this.hit(e, power * (.55 + (marks ? .45 : 0)));
                        if (actual && !alive(e) && marks && !transferred.has(e)) {
                            transferred.add(e); const next = this.area(e, 180).sort((a,b) => distance(a,e)-distance(b,e))[0];
                            if (next) this.mark(next, marks); // transfer only; no recursive damage or immediate extra pulse
                        }
                    }
                });
                this.effect('tracking_rain', { ...point, duration: 3, radius: 165 }); cooldown = 12;
            }
        }
        if (!cooldown) return false;
        // Skill growth reduces cooldown by 3% per level (cap 21%). Witch
        // explicitly requested damage/heal/HP-cost/buff values remain unchanged.
        this.cooldowns[slot] = this.time + cooldown * (1 - .03 * (skillLevel - 1)); return true;
    }
    update(dt) {
        if (this.disposed || !Number.isFinite(dt) || dt <= 0 || this.hooks.paused?.()) return;
        if (!alive(this.owner)) { this.dispose(); return; }
        // Process at exact simulation deadlines (including staggered 1s drain ticks).
        const end = this.time + Math.min(dt, .25);
        this.tasks.sort((a,b) => a.at - b.at);
        while (this.tasks[0]?.at <= end) { const task = this.tasks.shift(); this.time = task.at; task.fn(); this.tasks.sort((a,b) => a.at - b.at); }
        this.time = end;
        this.summons = this.summons.filter(e => { if (alive(e)) return true; this.hooks.dismiss?.(e); return false; });
        if (this.trap && this.trap.until > this.time) {
            const e = this.area(this.trap, 36)[0];
            if (e) { this.mark(e, 3); this.state(e).trappedUntil = this.time + 4; this.control(e, 'root', 2); this.cancelEffect(this.trap.id); this.effect('trap_trigger', { x:this.trap.x,y:this.trap.y }); this.trap = null; }
        } else { this.cancelEffect(this.trap?.id); this.trap = null; }
        for (const p of [...this.projectiles]) this.advanceProjectile(p, Math.min(dt, .25));
        for (const [e, s] of this.statuses) if (!alive(e)) this.statuses.delete(e);
    }
    advanceProjectile(p, dt) {
        const amount = Math.min(p.remaining, p.speed * dt), steps = Math.max(1, Math.ceil(amount / 12));
        if (p.kind === 'return') {
            const dist = distance(p, this.owner), step = p.speed * dt;
            if (dist <= step + 12) {
                let excess = this.heal(this.owner, p.healing);
                for (const ally of this.allies()) { excess = this.heal(ally, excess); if (excess <= 0) break; }
                this.projectiles.splice(this.projectiles.indexOf(p), 1); return;
            }
            p.x += (this.owner.x - p.x) / dist * step; p.y += (this.owner.y - p.y) / dist * step; return;
        }
        for (let i = 0; i < steps; i++) {
            p.x += p.direction.x * amount / steps; p.y += p.direction.y * amount / steps;
            const e = this.area(p, p.kind === 'orb' ? 14 : 8)[0];
            if (!e) continue;
            if (p.kind === 'arrow') { if (this.hit(e, this.attack() * .85)) this.mark(e); }
            else {
                this.control(e, 'stagger', .35); let drained = 0;
                // Contact starts a 3-second channel, total 100% ATK, three 1-second ticks.
                const atk = Math.ceil(this.attack()); const start = { x: p.x, y: p.y };
                for (let tick = 1; tick <= 3; tick++) this.schedule(tick, () => {
                    const portion = tick < 3 ? Math.floor(atk / 3) : atk - 2 * Math.floor(atk / 3);
                    if (portion > 0) drained += this.hit(e, portion, { drain: true });
                    if (tick === 3) this.projectiles.push({ ...start, kind: 'return', speed: 300, remaining: Infinity, healing: drained * .5 });
                });
                this.effect('drain_link', { ...start, target: e, duration: 3 });
            }
            this.projectiles.splice(this.projectiles.indexOf(p), 1); return;
        }
        p.remaining -= amount;
        if (p.remaining <= 0) this.projectiles.splice(this.projectiles.indexOf(p), 1);
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.tasks = []; this.projectiles = []; this.trap = null;
        this.summons.forEach(e => this.hooks.dismiss?.(e)); this.summons = [];
        for (const [e] of this.statuses) for (const type of ['berserk', 'mark', 'root', 'taunt']) this.hooks.clearStatus?.(e, type);
        this.statuses.clear(); this.rage = 0; this.bloodUntil = this.guardUntil = this.evadeUntil = 0;
    }
}

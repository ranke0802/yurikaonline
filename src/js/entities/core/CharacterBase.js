import Actor from './Actor.js';
import Logger from '../../utils/Logger.js';

/**
 * CharacterBase - Base class for all living entities (Players, Monsters, NPCs)
 * Extends Actor with stats, health, mana, and combat capabilities.
 */
export default class CharacterBase extends Actor {
    constructor(x, y, speed = 180) {
        super(x, y, speed);

        // Identity
        this.name = "Unknown";

        // Core Stats
        this.vitality = 1;
        this.intelligence = 1;
        this.wisdom = 1;
        this.agility = 1;

        // Health & Mana
        this.hp = 10;
        this.maxHp = 10;
        this.mp = 10;
        this.maxMp = 10;

        // Derived Stats
        this.defense = 0;
        this.attackPower = 0;
        this.critRate = 0;

        // Combat State
        this.isAttacking = false;
        this.lastHitTimer = 0;
        this.deathTimer = 0;
        this.state = 'idle'; // idle, move, attack, hit, die

        // Skill Slots
        this.skillSlots = [];
        this.skillCooldowns = {};
        this._knockbackSequenceId = 0;
        this._knockbackTimers = [];
    }

    /**
     * Common damage handling logic
     */
    takeDamage(amount, sourceX = null, sourceY = null) {
        if (this.isDead) return 0;

        const finalDmg = Math.max(1, Math.round(amount - this.defense));
        this.hp = Math.max(0, this.hp - finalDmg);
        this.lastHitTimer = 0;

        // Apply knockback if source is provided
        if (sourceX !== null && sourceY !== null) {
            const angle = Math.atan2(this.y - sourceY, this.x - sourceX);
            this.applyKnockback(Math.cos(angle) * 100, Math.sin(angle) * 100);
        }

        if (this.hp <= 0) {
            this.die();
        }

        return finalDmg;
    }

    die() {
        this.isDead = true;
        this.state = 'die';
        this.deathTimer = 3.0; // Default 3s death state
    }

    _clearKnockbackSequence() {
        this._knockbackSequenceId += 1;
        this._knockbackTimers.forEach((timerId) => clearTimeout(timerId));
        this._knockbackTimers = [];
    }

    _runKnockbackSequence(steps = []) {
        this._clearKnockbackSequence();
        const sequenceId = this._knockbackSequenceId;

        steps.forEach((step) => {
            const delayMs = Math.max(0, Math.round(step?.delayMs || 0));
            const applyStep = () => {
                if (this.isDead || sequenceId !== this._knockbackSequenceId) return;
                this.applyKnockback(step?.vx || 0, step?.vy || 0);
            };

            if (delayMs === 0) {
                applyStep();
                return;
            }

            const timerId = setTimeout(() => {
                applyStep();
                this._knockbackTimers = this._knockbackTimers.filter((entry) => entry !== timerId);
            }, delayMs);
            this._knockbackTimers.push(timerId);
        });
    }

    applyCombustionCollapse(sourceX, sourceY, options = {}) {
        if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY)) return;

        const dx = this.x - sourceX;
        const dy = this.y - sourceY;
        const distance = Math.hypot(dx, dy);
        const angle = distance > 0.001 ? Math.atan2(dy, dx) : (Math.random() * Math.PI * 2);
        const outwardForce = Math.max(20, options.outwardForce ?? 70);
        const inwardForce = Math.max(outwardForce + 20, options.inwardForce ?? 190);
        const delayMs = Math.max(40, options.delayMs ?? 80);

        this._runKnockbackSequence([
            {
                delayMs: 0,
                vx: Math.cos(angle) * outwardForce,
                vy: Math.sin(angle) * outwardForce
            },
            {
                delayMs,
                vx: -Math.cos(angle) * inwardForce,
                vy: -Math.sin(angle) * inwardForce
            }
        ]);
    }

    /**
     * Common HUD Rendering (HP Bar, Name)
     */
    drawHUD(ctx, centerX, y) {
        const barW = 60, barH = 8, barY = y + this.height + 5;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(centerX - barW / 2, barY, barW, barH);

        // HP Fill
        const hpP = Math.min(1, Math.max(0, this.hp / this.maxHp));
        ctx.fillStyle = hpP > 0.3 ? '#4ade80' : '#ef4444';
        ctx.fillRect(centerX - barW / 2, barY, barW * hpP, barH);

        // Name
        const nameY = y - 50;
        ctx.save();
        ctx.font = 'bold 13px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeText(this.name, centerX, nameY);
        ctx.fillStyle = '#fff'; ctx.fillText(this.name, centerX, nameY);
        ctx.restore();
    }
}

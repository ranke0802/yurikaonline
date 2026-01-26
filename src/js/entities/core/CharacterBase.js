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

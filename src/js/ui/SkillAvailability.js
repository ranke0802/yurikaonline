// Presentation only: never call an action, spend resources or change input gates.
// Direction-dependent collision and target selection remain the cast's responsibility.
export function skillAvailability(player, key, game) {
    const slot = { h: 1, u: 2, k: 3 }[key];
    const action = key === 'j' ? 'ATTACK' : `SKILL_${slot}`;
    const reason = (code, text, hint = false) => ({ code, text, hint });
    if (!player || (!slot && key !== 'j')) return reason('', '');
    if (player.isDead) return reason('dead', '전투 불가');
    if (game?.tutorial?.isActionAllowed?.(action) === false) return reason('tutorial', '안내 진행 중');
    const wizard = !player.classId || player.classId === 'wizard';
    const bridge = player.classCombat, c = bridge?.controller;
    if (!wizard) {
        if (!c || c.disposed) return reason('loading', '준비 중');
        if (player.hp <= 0) return reason('dead', '전투 불가');
        if (bridge.paused()) return reason('paused', '일시 정지');
        if (c.shieldRush) return reason('rush', '돌진 중');
        if (player.classAim && player.classAim.action !== action) return reason('aim', '조준 중');
        if (slot && c.castingSkill) return reason('casting', '시전 중');
    }
    const cooldown = wizard ? player.skillCooldowns?.[key]
        : slot ? (c.cooldowns[slot] || 0) - c.time : c.basicReady - c.time;
    if (cooldown > 0 && !(wizard && key === 'j' && player.isChanneling)) return reason('cooldown', '재사용 대기');
    if (wizard) {
        // Laser has no MP gate. Use the same read-only cost getters as the casts.
        const cost = key === 'h' ? player.getMagicMissileManaCost()
            : key === 'u' ? player.getFireballManaCost() : key === 'k' ? 20 : 0;
        if (player.mp < cost) return reason('mp', 'MP 부족');
    } else {
        if (slot === 2 && c.barrage) return reason('barrage', '연속 공격 중');
        if (slot && player.classStatuses?.stun?.remaining > 0) return reason('stun', '기절 중');
        if (player.classId === 'witch' && slot === 2 && player.hp <= player.maxHp * .8) return reason('hp', 'HP 80% 초과 필요');
        if (player.classId === 'warrior') {
            if (slot === 1 && player.classStatuses?.root?.remaining > 0) return reason('root', '이동 불가');
            if (slot === 1 && Math.hypot(player.knockback?.vx || 0, player.knockback?.vy || 0) > 1) return reason('knockback', '밀려나는 중');
            // Low rage never disables tap attacks; this is explicitly a charge hint.
            if (key === 'j' && c.rage < 25) return reason('rage', '차지: 분노 25 필요', true);
        }
    }
    return reason('', '');
}

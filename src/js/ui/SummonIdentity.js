// Canvas UI only: no sprite processing or combat/stat changes.
const styles = {
    owned: { label: '내 소환수', color: '#5ee7f2' },
    ally: { label: '아군 소환수', color: '#80cbff' },
    other: { label: '소환수', color: '#d3bbff' },
    hostile: { label: '적 소환수', color: '#ff9c96' }
};

export function summonRelationship(local, owner) {
    if (local === owner || local?.id && local.id === owner?.id) return 'owned';
    if (local?.canAttackTarget?.(owner) || owner?.canAttackTarget?.(local)) return 'hostile';
    if (local?.party?.members?.includes(owner?.id)) return 'ally';
    return 'other';
}

export function drawSummonIdentity(ctx, actor, visual, relationship = 'owned') {
    if (!visual?.sprite || !actor || actor.isDead || !(actor.hp > 0)
        || !Number.isFinite(actor.x) || !Number.isFinite(actor.y)) return null;
    const { label, color } = styles[relationship] || styles.other;
    ctx.save();
    try {
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const width = Math.ceil(ctx.measureText(label).width) + 24;
        const x = Math.round(actor.x - width / 2);
        const y = Math.round(actor.y - (visual.renderHeight || visual.height || actor.height || 64) / 2 - 28);
        // Opaque plate and diamond remain distinct over enemy silhouettes/names.
        ctx.fillStyle = '#102536'; ctx.fillRect(x, y, width, 19);
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, width - 1, 18);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(x+8,y+5); ctx.lineTo(x+12,y+9.5);
        ctx.lineTo(x+8,y+14); ctx.lineTo(x+4,y+9.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f4fbff'; ctx.fillText(label, x+18, y+9.5);
        const ratio = actor.maxHp > 0 ? Math.max(0, Math.min(1, actor.hp / actor.maxHp)) : 0;
        ctx.fillStyle = '#102536'; ctx.fillRect(x, y+21, width, 5);
        ctx.fillStyle = color; ctx.fillRect(x+1, y+22, (width-2)*ratio, 3);
        return { x, y, width, height:26, label, relationship, ratio };
    } finally { ctx.restore(); }
}

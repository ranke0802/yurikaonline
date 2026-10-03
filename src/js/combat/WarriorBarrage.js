// Saved active-skill key remains `charge`. No movement impulse or timers.
export function warriorBarrageProfile(level=1) {
    level=Math.max(1,Math.min(8,Math.floor(Number(level)||1)));
    const growth=level-1,hits=24+2*growth,duration=2.4;
    return {level,hits,duration,interval:duration/hits,range:600+20*growth,halfWidth:32+growth,damageMultiplier:4.8*(1+.08*growth)};
}
export function swordWaveProfile(growth,viewportSpan=0) {
    return {...growth.heavy,range:Math.max(growth.heavy.range,Math.min(6000,Math.max(0,Number(viewportSpan)||0)*.6)),speed:720,damageMultiplier:3.5};
}
export function barrageReach(origin,direction,profile,blocked) {
    let range=0;
    for(let step=Math.min(10,profile.range);step<=profile.range;step=Math.min(profile.range,step+10)){
        if(blocked?.(origin.x+direction.x*step,origin.y+direction.y*step,profile.halfWidth))break;
        range=step;if(step===profile.range)break;
    }
    return range;
}

import { basicChargeSeconds } from '../combat/BasicAttackProgression.js';
export function classChargeState(player) {
    const aim=player?.classAim;
    if(!['warrior','witch','archer'].includes(player?.classId)||player.isDead||player.isDying||player.classCombat?.controller.disposed||aim?.action!=='ATTACK')return null;
    const duration=basicChargeSeconds(player,player.classCombat?.controller.empowered);
    const progress=Math.max(0,Math.min(1,(Number(aim.elapsed)||0)/duration));
    return {progress,duration,ready:progress>=1};
}
export function updateClassChargeGauge(player,element) {
    if(!element)return;
    const state=classChargeState(player);element.hidden=!state;
    if(!state){element.classList.remove('ready');return;}
    element.style.setProperty('--charge-progress',String(state.progress));
    element.classList.toggle('ready',state.ready);element.setAttribute('aria-valuenow',String(Math.round(state.progress*100)));
    element.setAttribute('aria-valuetext',state.ready?'차징 완료':`차징 ${Math.round(state.progress*100)}%`);
}

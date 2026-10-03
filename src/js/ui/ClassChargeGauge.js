import { Sprite } from '../core/Sprite.js';
import { basicChargeSeconds } from '../combat/BasicAttackProgression.js';
export function classChargeState(player) {
    const controller=player?.classCombat?.controller,b=controller?.barrage;
    if(b&&!player.isDead&&!player.isDying&&!controller.disposed)return{progress:Math.min(1,Math.max(0,(controller.time-b.started)/b.profile.duration)),duration:b.profile.duration,ready:false,mode:"channel"};
    const aim=player?.classAim;
    if(!['warrior','witch','archer'].includes(player?.classId)||player.isDead||player.isDying||player.classCombat?.controller?.disposed||aim?.action!=='ATTACK')return null;
    const duration=basicChargeSeconds(player,player.classCombat?.controller.empowered);
    const progress=Math.max(0,Math.min(1,(Number(aim.elapsed)||0)/duration));
    return {progress,duration,ready:progress>=1};
}
// Called immediately after the player's world MP bar, under the same camera
// transform and pixel snapping. No screen/HUD coordinates or animation lag.
export function drawClassChargeGauge(ctx, player, mpBar) {
    const state=classChargeState(player);
    if(!state)return null;
    const {x,width,height}=mpBar;
    const y=Sprite.snapWorldCoordinate(ctx,mpBar.y+height+3,'y');
    ctx.save();
    ctx.fillStyle='#594719';ctx.fillRect(x,y,width,height);
    ctx.fillStyle=state.ready?'#fff0a3':'#ffd451';ctx.fillRect(x,y,width*state.progress,height);
    if(state.ready){ctx.strokeStyle='#fff0a3';ctx.lineWidth=1;ctx.strokeRect(x,y,width,height);}
    ctx.restore();
    return {x,y,width,height,...state};
}

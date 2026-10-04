import { drawMonsterSkillVfx, resolveMonsterSkillVfxFrame } from '../effects/MonsterSkillVfxRenderer.js';
import { drawMonsterGroundTelegraph } from '../entities/Monster.js';
import { drawSkillProjectile } from '../effects/PlayerSkillVfxRenderer.js';
const finite=n=>Number.isFinite(n)&&Math.abs(n)<1e7;
const positive=n=>finite(n)&&n>0&&n<=8000;
function validZone(z){
    if(!z)return false;
    if(z.shape==='line')return [z.x1,z.y1,z.x2,z.y2].every(finite)&&positive(z.width)&&Math.hypot(z.x2-z.x1,z.y2-z.y1)<=8000;
    if(!finite(z.x)||!finite(z.y))return false;
    if(z.shape==='circle')return positive(z.radius);
    return z.shape==='donut'&&finite(z.innerRadius)&&z.innerRadius>=0&&positive(z.outerRadius)&&z.innerRadius<z.outerRadius;
}
// Visual-only packets never create attacks, entities, damage or deadlines.
// Ground casts run before bodies in both local and remote world rendering.
export function drawSummonAbilities(ctx,actor,snapshot,layer='all'){
    if(!snapshot||!Number.isFinite(snapshot.ts)||Date.now()-snapshot.ts>500||snapshot.ts>Date.now()+1000)return;
    const draw=(theme,stage,x,y,w,h,progress=0,alpha=.65)=>{
        if(!finite(x)||!finite(y)||!positive(w)||!positive(h))return;
        drawMonsterSkillVfx(ctx,theme,resolveMonsterSkillVfxFrame(stage,progress),x,y,w,h,alpha,.9,0,false,'ground');
    };
    const foot=finite(snapshot.footOffset)?Math.min(400,Math.max(0,snapshot.footOffset)):16;
    if(layer!=='foreground')for(const c of (Array.isArray(snapshot.casts)?snapshot.casts:[]).slice(0,12)){
        if(!finite(c.age)||c.age<0||!finite(c.warning)||c.warning<0||!finite(c.remaining)||c.remaining<=0)continue;
        const progress=c.warning>0?Math.min(1,c.age/c.warning):1;
        if(c.kind==='area'){
            const zones=(Array.isArray(c.zones)?c.zones:[]).slice(0,8).filter(validZone);
            drawMonsterGroundTelegraph(ctx,{zones,elapsedMs:c.age*1000,warningMs:c.warning*1000,
                impactMs:Math.max(120,Math.min(5000,(c.impactDuration||.32)*1000)),
                persistentMs:Math.max(0,Math.min(15000,(c.persistent||0)*1000)),
                color:c.color||'#88cbdc',secondaryColor:c.secondaryColor||'#effbff',effect:c.theme||snapshot.theme},true);
        }else if(c.kind==='ambush'){
            draw(c.theme,'cast',actor.x,actor.y+foot,100,65,progress,.68*(1-progress*.45));
            draw(c.theme,'cast',c.x,c.y+foot,85,55,progress,.5+progress*.32);
        }else if(c.kind==='charge'){
            if(c.age<c.warning)draw(c.theme,'cast',actor.x,actor.y+foot,100,65,progress);
            else draw(c.theme,'residue',actor.x-(c.dx||0)*24,actor.y-(c.dy||0)*24+foot,70,45,1,.4);
        }
    }
    if(layer==='ground')return;
    if(snapshot.shield)draw(snapshot.theme,'cast',actor.x,actor.y+foot,80,80,.5,.45);
    for(const p of (Array.isArray(snapshot.projectiles)?snapshot.projectiles:[]).slice(0,24)){
        if(!finite(p.x)||!finite(p.y)||!finite(p.dx)||!finite(p.dy))continue;
        const trail=(Array.isArray(p.trail)?p.trail:[]).slice(-8).filter(t=>finite(t.x)&&finite(t.y));
        drawSkillProjectile(ctx,'missile',p.x,p.y,6,Math.atan2(p.dy,p.dx),trail,{age:Math.max(0,Number(p.age)||0),reducedEffects:true});
    }
}

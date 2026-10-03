import { drawMonsterSkillVfx, resolveMonsterSkillVfxFrame } from '../effects/MonsterSkillVfxRenderer.js';
const finite=n=>Number.isFinite(n)&&Math.abs(n)<1e7;
// The same bounded, visual-only packet is used locally and remotely. It cannot
// create attacks, status effects, entities, timers or damage.
export function drawSummonAbilities(ctx,actor,snapshot){
    if(!snapshot||!Number.isFinite(snapshot.ts)||Date.now()-snapshot.ts>500||snapshot.ts>Date.now()+1000)return;
    const draw=(theme,stage,x,y,w,h,progress=0,angle=0)=>{
        if(!finite(x)||!finite(y)||!finite(w)||!finite(h)||w<=0||h<=0||w>8000||h>8000)return;
        drawMonsterSkillVfx(ctx,theme,resolveMonsterSkillVfxFrame(stage,progress),x,y,w,h,.65,.5,angle,false,'center');
    };
    if(snapshot.shield)draw(snapshot.theme,'cast',actor.x,actor.y,80,80,.5);
    for(const c of (Array.isArray(snapshot.casts)?snapshot.casts:[]).slice(0,12)){
        const stage=c.age<c.warning?'cast':'impact',progress=c.warning>0?Math.min(1,c.age/c.warning):1;
        if(c.kind==='area')for(const z of (Array.isArray(c.zones)?c.zones:[]).slice(0,8)){
            if(z.shape==='line'){
                const len=Math.hypot(z.x2-z.x1,z.y2-z.y1),angle=Math.atan2(z.y2-z.y1,z.x2-z.x1),count=Math.max(1,Math.min(24,Math.ceil(len/150)));
                for(let i=0;i<count;i++)draw(c.theme,stage,z.x1+(z.x2-z.x1)*(i+.5)/count,z.y1+(z.y2-z.y1)*(i+.5)/count,len/count,z.width,progress,angle);
            }else if(z.shape==='circle')draw(c.theme,stage,z.x,z.y,z.radius*2,z.radius*2,progress);
            else if(z.shape==='donut'){
                const radius=(z.innerRadius+z.outerRadius)/2,size=z.outerRadius-z.innerRadius;
                for(let i=0;i<16;i++){const angle=i*Math.PI/8;draw(c.theme,stage,z.x+Math.cos(angle)*radius,z.y+Math.sin(angle)*radius,size,size,progress);}
            }
        }else draw(c.theme,stage,c.x,c.y,80,80,progress);
    }
    for(const p of (Array.isArray(snapshot.projectiles)?snapshot.projectiles:[]).slice(0,24))draw(p.theme,'charge',p.x,p.y,28,28);
}

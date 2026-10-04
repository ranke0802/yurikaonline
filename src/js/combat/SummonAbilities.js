import { applySlimeCombatOverrides } from '../world/MonsterManager.js';

const alive=e=>e&&!e.isDead&&e.hp>0;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Owns every deadline, projectile and hazard. Never invokes hostile Monster AI,
// hostile network attacks, player damage, or global projectile/telegraph queues.
export default class SummonAbilities {
    constructor(actor,bridge){
        this.actor=actor;this.bridge=bridge;this.source=actor.visual;
        applySlimeCombatOverrides(this.source);
        this.time=bridge.controller?.time||0;this.cooldowns=new Map();this.casts=[];this.projectiles=[];this.shieldUntil=0;this.disposed=false;this.serial=0;
        this.skills=this.source.skills;this.mechanics=this.source.bossMechanics;
        for(const m of this.mechanics)this.cooldowns.set(m.id,this.time+(m.initialCooldownMs??Math.max(1200,(m.cooldownMs||6000)*.45))/1000);
        for(const s of this.skills)this.cooldowns.set(s.id,this.time+this.random()*2);
    }
    random(){return this.bridge.controller?.hooks?.random?.()??Math.random();}
    enemies(){return this.bridge.hostileSummonTargets();}
    valid(e){return alive(e)&&this.enemies().includes(e);}
    power(){return this.actor.attackPower*(this.actor.weaponAttackMultiplier||1)*this.bridge.multipliers(this.actor).attack;}
    hit(e,power,skill){if(!this.disposed&&alive(this.actor)&&this.valid(e))return this.bridge.damage(e,power,{summon:true,summonId:this.actor.id,summonSkill:skill,summonX:this.actor.x,summonY:this.actor.y});return 0;}
    ready(id){return this.time>=(this.cooldowns.get(id)||0);}
    reserve(id,ms){this.cooldowns.set(id,this.time+Math.max(0,ms)/1000);}
    sound(){this.bridge.game?.sound?.playSfx?.(this.source.sounds.attack);}
    dispose(){this.disposed=true;this.casts=[];this.projectiles=[];this.shieldUntil=0;this.cooldowns.clear();}
    onDamage(){
        if(this.disposed)return;
        if(this.source.typeId==='king_slime'&&!this.source.chargeOnly){if(this.ready('shield'))this.shield({id:'shield',cooldown:this.source.shieldMaxCooldown,data:{duration:1000}});return;}
        for(const s of this.skills)if(s.id==='shield'&&s.trigger==='damage_received'&&this.ready(s.id)&&this.random()<(s.chance??.1))this.shield(s);
    }
    shield(s){this.shieldUntil=this.time+(s.data?.duration||1000)/1000;this.reserve(s.id,s.cooldown||5000);this.sound();}
    get busy(){return this.casts.some(c=>c.kind==='charge'||c.kind==='ambush');}
    moveTo(x,y){
        const a=this.actor,dx=x-a.x,dy=y-a.y,len=Math.hypot(dx,dy);if(!len)return true;
        // Commit short swept steps, preserving the last safe position at walls.
        const steps=Math.max(1,Math.ceil(len/8));
        for(let i=0;i<steps;i++)if(!this.bridge.move(a,a.x+dx/steps,a.y+dy/steps))return false;
        return true;
    }
    areaCast(mechanic,target,special=false){
        const v=this.source;v.x=this.actor.x;v.y=this.actor.y;
        const zones=v._buildBossMechanicZones(mechanic,{x:target.x,y:target.y,width:0,height:0});
        const warning=Math.max(.35,(mechanic.warningMs||1000)*(special?1:v._getBossMechanicCastScale(mechanic))/1000);
        const persistent=Math.max(0,(mechanic.persistentMs||0)/1000);
        this.casts.push({id:++this.serial,kind:'area',skill:mechanic.id,theme:mechanic.effect||v.effectTheme,zones,
            start:this.time,impact:this.time+warning,end:this.time+warning+(persistent||(mechanic.impactMs||320)/1000),impactDuration:(mechanic.impactMs||320)/1000,
            color:mechanic.color||v.bossEffects.color||v.bossEffects.auraColor,secondaryColor:mechanic.secondaryColor||v.bossEffects.secondaryColor,
            tick:Math.max(.18,(mechanic.tickMs||500)/1000),next:this.time+warning,persistent,
            power:this.power()*(mechanic.damageMultiplier||1)*(special?1:v._getBossMechanicDamageScale(mechanic))});this.sound();
    }
    start(skill,target){
        const a=this.actor,v=this.source,data=skill.data||{};
        if(skill.id==='water_cannon')this.areaCast({...data,id:skill.id,areaScale:1,damageScale:1,castScale:1},target,true);
        else if(skill.id==='missile'){
            const dx=target.x-a.x,dy=target.y-a.y,angle=Math.atan2(dy,dx),count=Math.max(1,Math.min(12,data.count||4));
            this.casts.push({id:++this.serial,kind:'missile',skill:skill.id,start:this.time,next:this.time,index:0,count,angle,power:this.power()*.45});this.sound();
        }else if(skill.id==='shadow_ambush'){
            const dx=target.x-a.x,dy=target.y-a.y,len=Math.hypot(dx,dy)||1,behind=Math.max(56,data.behindDistance||92);
            this.casts.push({id:++this.serial,kind:'ambush',skill:skill.id,start:this.time,impact:this.time+Math.max(.5,(data.castMs||1050)/1000),
                x:target.x+dx/len*behind,y:target.y+dy/len*behind,target,power:this.power()*(data.damageMultiplier||1),reach:a.attackRange+behind});this.sound();
        }else return false;
        this.reserve(skill.id,skill.cooldown||5000);return true;
    }
    startCharge(target){
        const a=this.actor,v=this.source,dx=target.x-a.x,dy=target.y-a.y,len=Math.hypot(dx,dy)||1;
        this.casts.push({id:++this.serial,kind:'charge',skill:'charge',theme:v.effectTheme,start:this.time,impact:this.time+v.chargeCastSeconds,
            dx:dx/len,dy:dy/len,remaining:Math.min(len,v.chargeRange),power:this.power()*v.chargeDamage/Math.max(1,v.definition.baseStats.atk),hit:false});
        this.reserve('charge',v.chargeCooldownMs);this.sound();
    }
    landing(){
        if(this.disposed||!alive(this.actor))return;
        const h=this.source.behavior.charge?.landingHazard;if(!h)return;
        const duration=(h.durationMs||5000)/1000,tick=Math.max(.18,(h.tickMs||500)/1000),a=this.actor;
        this.casts.push({id:++this.serial,kind:'area',skill:'lightning_landing',theme:'thunder',zones:[{shape:'circle',x:a.x,y:a.y,radius:h.radius||92}],
            start:this.time,impact:this.time,end:this.time+duration,next:this.time,persistent:duration,tick,
            power:this.power()*(h.damage||this.source.chargeDamage)/Math.max(1,this.source.definition.baseStats.atk)});
    }
    advanceCasts(dt){
        const a=this.actor,v=this.source;
        for(const c of [...this.casts]){
            if(this.disposed)break;
            if(c.kind==='area'){
                while(c.next<=this.time+1e-8&&c.next<c.end-1e-8){
                    const seen=new Set();for(const e of this.enemies())if(!seen.has(e.id??e)&&c.zones.some(z=>v._isPointInsideBossTelegraphZone(e,e.radius||16,z))){seen.add(e.id??e);this.hit(e,c.power,c.skill);}
                    c.next=c.persistent?c.next+c.tick:Infinity;
                }
                if(this.time>=c.end)this.casts=this.casts.filter(s=>s!==c);
            }else if(c.kind==='missile'){
                while(c.index<c.count&&c.next<=this.time+1e-8){
                    const angle=c.angle+(c.index-(c.count-1)/2)*(Math.PI*4/9/Math.max(1,c.count-1))+(this.random()-.5)*.4;
                    this.projectiles.push({x:a.x,y:a.y,dx:Math.cos(angle),dy:Math.sin(angle),speed:700,life:2,trail:[],power:c.power,theme:v.effectTheme,skill:c.skill});c.index++;c.next+=.1;
                }
                if(c.index===c.count)this.casts=this.casts.filter(s=>s!==c);
            }else if(c.kind==='ambush'&&this.time>=c.impact){
                // Original destination, swept relocation: no teleport through walls.
                const reached=this.moveTo(c.x,c.y);if(reached&&this.valid(c.target)&&distance(a,c.target)<=c.reach)this.hit(c.target,c.power,c.skill);
                this.casts=this.casts.filter(s=>s!==c);
            }else if(c.kind==='charge'&&this.time>=c.impact){
                const seconds=Math.min(dt,Math.max(0,this.time-c.impact)),travel=Math.min(c.remaining,v.chargeSpeed*seconds),steps=Math.max(1,Math.ceil(travel/8));
                for(let i=0;i<steps&&!c.hit;i++){
                    const step=travel/steps;if(!this.moveTo(a.x+c.dx*step,a.y+c.dy*step)){c.hit=true;break;}c.remaining-=step;
                    const e=this.enemies().find(e=>distance(a,e)<a.width/2+(e.radius||16));if(e){this.hit(e,c.power,'charge');c.hit=true;}
                }
                if(c.hit||c.remaining<1e-8){this.landing();this.casts=this.casts.filter(s=>s!==c);}
            }
        }
    }
    advanceProjectiles(dt){
        for(const p of [...this.projectiles]){
            p.trail ||= [];p.trail.push({x:p.x,y:p.y});if(p.trail.length>8)p.trail.shift();
            p.life-=dt;const steps=Math.max(1,Math.ceil(p.speed*dt/8));
            for(let i=0;i<steps&&p.life>0;i++){
                const x=p.x+p.dx*p.speed*dt/steps,y=p.y+p.dy*p.speed*dt/steps;
                if(this.bridge.controller.hooks.projectileBlocked?.(x,y,6)){p.life=0;break;}p.x=x;p.y=y;
                const e=this.enemies().find(e=>distance(p,e)<(e.radius||16)+6);if(e){this.hit(e,p.power,p.skill);p.life=0;}
            }
        }this.projectiles=this.projectiles.filter(p=>p.life>0);
    }
    update(dt,target){
        if(this.disposed||!alive(this.actor)){this.dispose();return;}
        this.time=this.bridge.controller.time;
        if(this.actor.classStatuses?.stun?.remaining>0){this.casts=[];this.projectiles=[];return;}
        this.advanceCasts(dt);if(this.disposed||!alive(this.actor)){this.dispose();return;}this.advanceProjectiles(dt);
        if(this.disposed||!alive(this.actor)){this.dispose();return;}
        for(const s of this.skills)if(s.id==='shield'&&this.ready(s.id)&&((s.trigger==='cooldown')||(s.trigger==='hp_below_70'&&this.actor.hp<this.actor.maxHp*.7&&this.random()<(s.chance??.1)*dt)))this.shield(s);
        if(!this.valid(target)||this.busy||this.casts.some(c=>c.kind==='missile'))return;
        for(const m of this.mechanics)if(!this.casts.some(c=>c.kind==='area')&&this.ready(m.id)&&distance(this.actor,target)<=Math.max(120,m.range||600)*this.source._getBossMechanicAreaScale(m)){
            this.areaCast(m,target);this.reserve(m.id,m.cooldownMs||7000);return;
        }
        for(const s of this.skills)if(s.id!=='shield'&&this.ready(s.id)&&((s.trigger==='cooldown')||(s.trigger==='random'&&this.random()<(s.chance??.1)*dt)))if(this.start(s,target))return;
        const dist=distance(this.actor,target),v=this.source;
        if(v.chargeEnabled&&this.ready('charge')&&dist>v.minChargeDistance&&dist<v.chargeRange)this.startCharge(target);
    }
    snapshot(){if(this.disposed||(!this.casts.length&&!this.projectiles.length&&this.shieldUntil<=this.time))return null;return {ts:Date.now(),shield:this.shieldUntil>this.time,theme:this.source.effectTheme,footOffset:this.source.height/2,
        casts:this.casts.slice(0,12).map(c=>({kind:c.kind,theme:c.theme||this.source.effectTheme,zones:c.zones||[],impactDuration:c.impactDuration||.32,persistent:c.persistent||0,color:c.color,secondaryColor:c.secondaryColor,dx:c.dx,dy:c.dy,x:c.x??this.actor.x,y:c.y??this.actor.y,age:this.time-c.start,warning:Math.max(0,(c.impact??c.start)-c.start),remaining:Math.max(0,(c.end??c.impact??this.time+.2)-this.time)+(c.kind==='charge'?Math.max(0,c.remaining)/Math.max(1,this.source.chargeSpeed):0)})),
        projectiles:this.projectiles.slice(0,24).map(p=>({x:p.x,y:p.y,theme:p.theme,dx:p.dx,dy:p.dy,age:2-p.life,trail:p.trail||[]}))};}
}

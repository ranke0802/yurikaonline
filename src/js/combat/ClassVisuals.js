import { getSharedResourceManager } from '../core/ResourceManager.js';
import { captureProjectileWorldContext, isProjectileWorldContextCurrent } from '../entities/ProjectileWorldContext.js';

export const EFFECT_ROWS = {
    witch: [['life_circle','drain_orb','drain_link','orb','return'], ['poison_cloud'], ['summon'], ['berserk_potion']],
    warrior: [['warrior_slash','rage_smash'], ['challenge'], ['punishing_charge'], ['blood_pact','blood_finale']],
    archer: [['archer_shot','piercing_snipe','arrow'], ['hunter_trap','trap_burst','trap_trigger'], ['shadow_leap'], ['tracking_rain']]
};
const GROUND = new Set(['life_circle','poison_cloud','summon','hunter_trap','tracking_rain','blood_pact','berserk_potion']);
const DIRECTIONAL = new Set(['warrior_slash','rage_smash','punishing_charge','archer_shot','piercing_snipe','shadow_leap']);
export const STATUS_ICONS = ['poison','berserk','rage','mark','root','taunt','bloodPact','empowered'];
export function loadClassVisualImages(classId, images) {
    const resources=getSharedResourceManager();
    for(const [key,path] of [['status','status'],...(classId==='wizard'?[]:[['effects',`${classId}-effects`]]),...(classId==='witch'?[['lifeCircle','life-circle']]:[])])
        resources?.loadImage(`assets/resource/classes/${path}.webp`).then(image=>{images[key]=image;}).catch(()=>{});
}
export function drawClassEffect(renderer,ctx,name,x,y,size,age=0,options={}) {
    const circle=name==='life_circle',img=circle?renderer.images.lifeCircle:renderer.images.effects;if(!img)return;
    const classId=renderer.classId||renderer.controller?.classId;
    const row=circle?0:(EFFECT_ROWS[classId]||[]).findIndex(names=>names.includes(name));if(row<0)return;
    const w=img.width/4,h=img.height/(circle?1:4),tick=Math.max(0,Math.floor(age/.16));
    const phase=tick%6,frame=options.sustained?(phase<=3?phase:6-phase):Math.min(3,tick);
    const angle=options.angle||0,width=options.width||size,height=options.height||size;
    const transformed=!!angle||options.opacity<1; if(transformed)ctx.save();if(options.opacity<1)ctx.globalAlpha*=options.opacity;
    if(angle){ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(img,frame*w,row*h,w,h,-width/2,-height/2,width,height);}
    else ctx.drawImage(img,frame*w,row*h,w,h,x-width/2,y-height/2,width,height);
    if(transformed)ctx.restore();
}
export function renderGroundEffects(renderer,ctx) {
    for(const f of renderer.effects)if(GROUND.has(f.name))renderer.drawEffect(ctx,f.name,
        f.name==='blood_pact'?renderer.owner.x:f.x,f.name==='blood_pact'?renderer.owner.y:f.y,
        f.name==='blood_pact'?110:f.name==='berserk_potion'?140:(f.radius||70)*2,f.age,
        {sustained:f.duration>1,opacity:['poison_cloud','tracking_rain'].includes(f.name)?.7:1});
}
export function renderForegroundEffects(renderer,ctx) {
    for(const f of renderer.effects)if(!GROUND.has(f.name)){
        const angle=DIRECTIONAL.has(f.name)&&f.target?Math.atan2(f.target.y-f.y,f.target.x-f.x):0;
        renderer.drawEffect(ctx,f.name,f.x,f.y,f.name==='challenge'?160:(f.radius||70)*2,f.age,{angle,sustained:f.duration>1});
    }
    for(const p of renderer.controller?.projectiles||renderer.projectiles||[])
        renderer.drawEffect(ctx,p.kind,p.x,p.y,p.kind==='arrow'?48:58,p.age??renderer.controller?.time??0,
            {angle:p.kind==='arrow'?Math.atan2(p.direction.y,p.direction.x):0,sustained:true});
    const d=renderer.decoy,owner=renderer.owner;
    if(d?.remaining>0&&owner.sprite){
        ctx.save();ctx.globalAlpha*=.5;
        owner.sprite.draw(ctx,d.direction||0,d.frame||0,d.x+(owner.width||48)/2-60,d.y+(owner.height||48)-110,120,120);
        ctx.restore();
    }
}
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<100000&&Math.abs(p.y)<100000;
// A renderer only: no combat controller, damaging projectiles, summons or support hooks.
export default class RemoteClassVisuals {
    constructor(owner){this.owner=owner;this.images={};this.effects=[];this.projectiles=[];this.badges=[];this.epoch=0;this.sequence=-1;}
    receive(packet){
        const game=globalThis.window?.game, now=Date.now();
        if(!packet||!['witch','warrior','archer','wizard'].includes(packet.classId)
            ||packet.fieldId!==game?.net?._getCurrentFieldId?.()||!Number.isFinite(packet.ts)||packet.ts>now+1000||now-packet.ts>12000
            ||!Number.isSafeInteger(packet.epoch)||!Number.isSafeInteger(packet.sequence)
            ||packet.epoch<this.epoch||(packet.epoch===this.epoch&&packet.sequence<=this.sequence))return false;
        this.epoch=packet.epoch;this.sequence=packet.sequence;
        this.context=captureProjectileWorldContext(game);
        if(this.classId!==packet.classId){this.classId=packet.classId;this.images={};loadClassVisualImages(this.classId,this.images);}
        this.effects=[];this.projectiles=[];this.badges=[];this.decoy=null;
        if(this.owner.isDead||this.owner.hp<=0)return true;
        const lag=Math.max(0,(now-packet.ts)/1000),names=(EFFECT_ROWS[this.classId]||[]).flat();
        for(const f of (Array.isArray(packet.effects)?packet.effects:[]).slice(0,64)){
            if(!finitePoint(f)||typeof f.id!=='string'||!names.includes(f.name)||!Number.isFinite(f.duration)||!Number.isFinite(f.age))continue;
            const duration=Math.max(0,Math.min(10,f.duration)),age=Math.max(0,f.age)+lag;
            if(age>=duration)continue;
            this.effects.push({id:f.id,name:f.name,x:f.x,y:f.y,target:finitePoint(f.target)?{x:f.target.x,y:f.target.y}:null,
                radius:Math.max(0,Math.min(700,Number(f.radius)||0)),duration,age,receivedAt:now});
        }
        for(const p of (Array.isArray(packet.projectiles)?packet.projectiles:[]).slice(0,32)){
            if(!finitePoint(p)||!['orb','return','arrow'].includes(p.kind)||!finitePoint(p.direction)||!Number.isFinite(p.speed)||lag>.4)continue;
            this.projectiles.push({...p,speed:Math.max(0,Math.min(650,p.speed)),age:Number(p.age)||0,receivedAt:now,expiresAt:packet.ts+400});
        }
        const d=packet.decoy;
        if(finitePoint(d)&&Number.isFinite(d.remaining)&&d.remaining>lag)this.decoy={x:d.x,y:d.y,direction:Math.max(0,Math.min(3,d.direction||0)),frame:Math.max(0,Math.min(3,d.frame||0)),remaining:Math.min(2,d.remaining)-lag,receivedAt:now};
        this.badges=(Array.isArray(packet.badges)?packet.badges:[]).filter(b=>STATUS_ICONS.includes(b.type)).slice(0,8).map(b=>({type:b.type,count:Math.max(0,Math.min(100,Number(b.count)||0))}));
        this.badgesUntil=packet.ts+500;
        return true;
    }
    advance(){
        if(!isProjectileWorldContextCurrent(this.context)||this.owner.isDead||this.owner.hp<=0){this.effects=[];this.projectiles=[];this.decoy=null;this.badges=[];return;}
        const now=Date.now();
        this.effects=this.effects.filter(f=>{f.age+=(now-f.receivedAt)/1000;f.receivedAt=now;return f.age<f.duration;});
        this.projectiles=this.projectiles.filter(p=>{const dt=Math.max(0,(now-p.receivedAt)/1000);p.x+=p.direction.x*p.speed*dt;p.y+=p.direction.y*p.speed*dt;p.age+=dt;p.receivedAt=now;return now<p.expiresAt;});
        if(this.decoy){this.decoy.remaining-=(now-this.decoy.receivedAt)/1000;this.decoy.receivedAt=now;if(this.decoy.remaining<=0)this.decoy=null;}
        if(now>this.badgesUntil)this.badges=[];
    }
    drawEffect(...args){drawClassEffect(this,...args);}
    renderGround(ctx){this.advance();renderGroundEffects(this,ctx);}
    render(ctx){
        this.advance();renderForegroundEffects(this,ctx);
        const img=this.images.status;if(!img)return;
        this.badges.forEach((badge,i)=>{const index=STATUS_ICONS.indexOf(badge.type),w=img.width/4,h=img.height/2,x=this.owner.x+(i-(this.badges.length-1)/2)*24-11,y=this.owner.y-(this.owner.height||64)/2-28;
            ctx.drawImage(img,index%4*w,Math.floor(index/4)*h,w,h,x,y,22,22);
            if(badge.count){ctx.save();ctx.font='bold 12px sans-serif';ctx.textAlign='right';ctx.lineWidth=3;ctx.strokeStyle='#17212c';ctx.fillStyle='white';ctx.strokeText(String(badge.count),x+24,y+23);ctx.fillText(String(badge.count),x+24,y+23);ctx.restore();}
        });
    }
}

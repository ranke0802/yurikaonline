import { drawShieldRushBody } from './ShieldRush.js';
import { renderArrowRain } from './ArrowRain.js';
import { drawAuthoredClassBody, classArtPath } from './AuthoredCharacterFrames.js';
import { combatCenter } from './ClassAnchors.js';
import { drawActionBody } from './ClassActionMotion.js';
import { getSharedResourceManager } from '../core/ResourceManager.js';
import { captureProjectileWorldContext, isProjectileWorldContextCurrent } from '../entities/ProjectileWorldContext.js';

export const EFFECT_ROWS = {
    witch: [['life_circle','drain_orb','drain_link','drain_heal','orb','return'], ['poison_cloud','poison_potion'], ['summon'], ['berserk_potion']],
    warrior: [['warrior_slash','rage_smash'], ['challenge','shield_rush','shield_impact','shield_block'], ['punishing_charge'], ['blood_pact','blood_finale']],
    archer: [['archer_shot','piercing_snipe','arrow','snipe'], ['hunter_trap','trap_burst','trap_trigger'], ['shadow_leap'], ['tracking_rain']]
};
const GROUND = new Set(['life_circle','poison_cloud','summon','hunter_trap','tracking_rain','blood_pact','berserk_potion']);
const DIRECTIONAL = new Set(['warrior_slash','rage_smash','punishing_charge','archer_shot','piercing_snipe','shadow_leap']);
export const STATUS_ICONS = ['poison','berserk','rage','mark','root','taunt','bloodPact','empowered'];
export function loadClassVisualImages(classId, images) {
    const resources=getSharedResourceManager();
    for(const [key,path] of [['status','status'],...(classId==='wizard'?[]:[['effects',`${classId}-effects`],['authored',`${classId}-body`]]),...(classId==='warrior'?[['shieldBody','warrior-shield-rush-body'],['shieldEffects','warrior-shield-rush-effects']]:[]),...(classId==='witch'?[['lifeCircle','life-circle'],['potion','poison-potion']]:[])])
        resources?.loadImage(path==='status'?'assets/resource/classes/status.webp':classArtPath(path)).then(image=>{images[key]=image;}).catch(()=>{});
}
export function drawClassEffect(renderer,ctx,name,x,y,size,age=0,options={}) {
    if(['shield_rush','shield_impact','shield_block'].includes(name)){
        const image=renderer.images.shieldEffects;if(!image)return;
        const barrier=name==='shield_rush',row=barrier?[1,0,2,3][options.direction??1]:4;
        const frame=barrier?Math.floor((age+1e-9)/.18)%4:Math.min(3,Math.floor(age/.07));
        const span=barrier?144:96;ctx.drawImage(image,frame*192,row*192,192,192,x-span/2,y-span/2,span,span);return;
    }
    const circle=name==='life_circle',potion=name==='poison_potion',img=potion?renderer.images.potion:circle?renderer.images.lifeCircle:renderer.images.effects;if(!img)return;
    const classId=renderer.classId||renderer.controller?.classId;
    const row=circle||potion?0:(EFFECT_ROWS[classId]||[]).findIndex(names=>names.includes(name));if(row<0)return;
    const w=img.width/4,h=img.height/(circle||potion?1:4),tick=Math.max(0,Math.floor(age/(potion?.45/4:.16)));
    const phase=tick%6,frame=options.sustained?(phase<=3?phase:6-phase):Math.min(3,tick);
    const angle=options.angle||0,width=options.width||size,height=options.height||size;
    const pivotX=Number.isFinite(options.pivotX)?options.pivotX:.5;
    const transformed=!!angle||options.opacity<1; if(transformed)ctx.save();if(options.opacity<1)ctx.globalAlpha*=options.opacity;
    if(angle){ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(img,frame*w,row*h,w,h,-width*pivotX,-height/2,width,height);}
    else ctx.drawImage(img,frame*w,row*h,w,h,x-width*pivotX,y-height/2,width,height);
    if(transformed)ctx.restore();
}
function renderProjectiles(renderer,ctx,behind) {
    const center=combatCenter(renderer.owner);
    for(const p of renderer.controller?.projectiles||renderer.projectiles||[]) {
        const isBehind=p.kind==='return'?p.y<center.y:(p.direction?.y||0)<0;
        if(isBehind!==behind)continue;
        renderer.drawEffect(ctx,p.kind,p.x,p.y,p.kind==='snipe'?72:p.kind==='arrow'?48:p.kind==='orb'?58*(p.radius||14)/14:58,p.age??renderer.controller?.time??0,
            {angle:p.direction?Math.atan2(p.direction.y,p.direction.x):0,sustained:true});
    }
}
function renderPotion(renderer,ctx,f,behind) {
    if(!f.target)return;
    const t=Math.max(0,Math.min(1,f.age/(f.duration||.45)));
    const x=f.x+(f.target.x-f.x)*t,y=f.y+(f.target.y-f.y)*t-(t===0||t===1?0:Math.sin(Math.PI*t)*24);
    if((y<combatCenter(renderer.owner).y)!==behind)return;
    renderer.drawEffect(ctx,'poison_potion',x,y,34,f.age,{angle:0});
}
export function renderGroundEffects(renderer,ctx) {
    const center=combatCenter(renderer.owner);
    for(const f of renderer.effects) {
        if(f.name==='poison_potion'){renderPotion(renderer,ctx,f,true);continue;}
        if(f.name==='tracking_rain'){renderArrowRain(renderer,ctx,f,true);continue;}
        if(GROUND.has(f.name))renderer.drawEffect(ctx,f.name,
            f.name==='blood_pact'?center.x:f.x,f.name==='blood_pact'?center.y:f.y,
            f.name==='blood_pact'?110:f.name==='berserk_potion'?140:(f.radius||70)*2,f.age,
            {angle:0,sustained:f.duration>1,opacity:['poison_cloud','tracking_rain'].includes(f.name)?.7:1});
    }
    renderProjectiles(renderer,ctx,true);
}
export function renderForegroundEffects(renderer,ctx) {
    for(const f of renderer.effects){
        if(f.name==='shield_rush'){
            const center=combatCenter(renderer.owner),motion=renderer.currentMotion?.()||renderer.motion;
            if(!motion?.shieldRush)continue;
            const d=motion.direction,dx=[0,0,-1,1][d],dy=[-1,1,0,0][d];
            renderer.drawEffect(ctx,f.name,center.x+dx*30,center.y-28+dy*12,144,f.age,{direction:d});continue;
        }
        if(f.name==='tracking_rain'){renderArrowRain(renderer,ctx,f,false);continue;}
        if(GROUND.has(f.name))continue;
        // Launch packets remain useful for audio; moving projectiles own their image.
        if(['archer_shot','drain_orb','piercing_snipe'].includes(f.name))continue;
        if(f.name==='poison_potion'){renderPotion(renderer,ctx,f,false);continue;}
        const directional=DIRECTIONAL.has(f.name)&&f.target;
        const angle=directional?Math.atan2(f.target.y-f.y,f.target.x-f.x):0;
        const options={angle,sustained:f.duration>1};
        let size=f.name==='challenge'?160:f.name==='drain_heal'?44:(f.radius||70)*2;
        if(['warrior_slash','rage_smash'].includes(f.name)){options.pivotX=.15;options.width=f.range||(f.name==='rage_smash'?150:100);options.height=f.halfWidth?f.halfWidth*2:(f.name==='rage_smash'?96:104);}
        if(['punishing_charge','shadow_leap'].includes(f.name)&&f.target){options.pivotX=0;options.width=Math.max(1,Math.hypot(f.target.x-f.x,f.target.y-f.y));options.height=80;}
        renderer.drawEffect(ctx,f.name,f.x,f.y,size,f.age,options);
    }
    renderProjectiles(renderer,ctx,false);
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
        this.effects=[];this.projectiles=[];this.badges=[];this.decoy=null;this.motion=null;
        if(this.owner.isDead||this.owner.hp<=0)return true;
        const lag=Math.max(0,(now-packet.ts)/1000),names=(EFFECT_ROWS[this.classId]||[]).flat();
        const m=packet.motion;
        if(m&&Number.isSafeInteger(m.id)&&Number.isInteger(m.row)&&m.row>=0&&m.row<4&&Number.isFinite(m.age)&&m.age>=0&&Number.isFinite(m.duration)&&m.duration>=.2&&m.duration<=(m.shieldRush===true&&this.classId==='warrior'&&m.row===1?1.6:.60)&&(m.direction===undefined||(Number.isInteger(m.direction)&&m.direction>=0&&m.direction<=3))) {
            const age=m.age+lag;if(m.held&&lag<.3||!m.held&&age<m.duration)this.motion={id:m.id,row:m.row,shieldRush:m.shieldRush===true&&this.classId==='warrior'&&m.row===1,direction:m.direction??(Number.isInteger(this.owner.direction)&&this.owner.direction>=0&&this.owner.direction<=3?this.owner.direction:1),held:!!m.held,age,duration:m.duration,receivedAt:now,expiresAt:m.held?packet.ts+300:now+(m.duration-age)*1000};
        }
        for(const f of (Array.isArray(packet.effects)?packet.effects:[]).slice(0,64)){
            if(!finitePoint(f)||typeof f.id!=='string'||!names.includes(f.name)||!Number.isFinite(f.duration)||!Number.isFinite(f.age))continue;
            const duration=Math.max(0,Math.min(10,f.duration)),age=Math.max(0,f.age)+lag;
            if(age>=duration)continue;
            this.effects.push({id:f.id,name:f.name,x:f.x,y:f.y,target:finitePoint(f.target)?{x:f.target.x,y:f.target.y}:null,
                radius:Math.max(0,Math.min(700,Number(f.radius)||0)),range:Math.max(0,Math.min(243,Number(f.range)||0)),halfWidth:Math.max(0,Math.min(95,Number(f.halfWidth)||0)),duration,age,receivedAt:now});
        }
        for(const p of (Array.isArray(packet.projectiles)?packet.projectiles:[]).slice(0,32)){
            if(!finitePoint(p)||!['orb','return','arrow','snipe'].includes(p.kind)||!finitePoint(p.direction)||!Number.isFinite(p.speed)||lag>.4)continue;
            const speed=Math.max(0,Math.min(p.kind==='snipe'?780:650,p.speed));
            const remaining=Number.isFinite(p.remaining)?Math.max(0,Math.min(650,p.remaining)):speed*.4;
            this.projectiles.push({...p,radius:p.kind==='orb'?Math.max(14,Math.min(18.9,Number(p.radius)||14)):0,speed,remaining,age:Number(p.age)||0,receivedAt:now,expiresAt:packet.ts+400});
        }
        const d=packet.decoy;
        if(finitePoint(d)&&Number.isFinite(d.remaining)&&d.remaining>lag)this.decoy={x:d.x,y:d.y,direction:Math.max(0,Math.min(3,d.direction||0)),frame:Math.max(0,Math.min(3,d.frame||0)),remaining:Math.min(2,d.remaining)-lag,receivedAt:now};
        this.badges=(Array.isArray(packet.badges)?packet.badges:[]).filter(b=>STATUS_ICONS.includes(b.type)).slice(0,8).map(b=>({type:b.type,count:Math.max(0,Math.min(100,Number(b.count)||0))}));
        this.badgesUntil=packet.ts+500;
        return true;
    }
    advance(){
        if(!isProjectileWorldContextCurrent(this.context)||this.owner.isDead||this.owner.hp<=0){this.effects=[];this.projectiles=[];this.decoy=null;this.badges=[];this.motion=null;return;}
        const now=Date.now();
        if(this.motion){this.motion.age+=Math.max(0,(now-this.motion.receivedAt)/1000);this.motion.receivedAt=now;if(now>=this.motion.expiresAt)this.motion=null;}
        this.effects=this.effects.filter(f=>{f.age+=(now-f.receivedAt)/1000;f.receivedAt=now;return f.age<f.duration;});
        this.projectiles=this.projectiles.filter(p=>{const dt=Math.max(0,(now-p.receivedAt)/1000);const step=Math.min(p.remaining,p.speed*dt);p.x+=p.direction.x*step;p.y+=p.direction.y*step;p.remaining-=step;p.age+=dt;p.receivedAt=now;return now<p.expiresAt&&p.remaining>0;});
        if(this.decoy){this.decoy.remaining-=(now-this.decoy.receivedAt)/1000;this.decoy.receivedAt=now;if(this.decoy.remaining<=0)this.decoy=null;}
        if(now>this.badgesUntil)this.badges=[];
    }
    drawBody(ctx,x,y,w,h){this.advance();return drawShieldRushBody(this.images.shieldBody,this.motion,ctx,x,y) || drawAuthoredClassBody(this.images.authored,this.owner,this.motion,ctx,x,y) || drawActionBody(this.images.actions,this.motion,ctx,x,y,w,h);}
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

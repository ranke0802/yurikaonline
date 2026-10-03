import { drawAuthoredClassBody } from './AuthoredCharacterFrames.js';
import { basicChargeSeconds } from './BasicAttackProgression.js';
import { actionRow, createActionMotion, drawActionBody } from './ClassActionMotion.js';
import { combatCenter, attackAnchor, facingDirection } from './ClassAnchors.js';
import ClassCombatController, { SUMMON_TYPES } from './ClassCombatController.js';
import Monster from '../entities/Monster.js';
import { captureProjectileWorldContext, isProjectileWorldContextCurrent } from '../entities/ProjectileWorldContext.js';

import { EFFECT_ROWS, STATUS_ICONS as ICONS, loadClassVisualImages, drawClassEffect, renderGroundEffects, renderForegroundEffects } from './ClassVisuals.js';
export { EFFECT_ROWS };
const alive = e => e && !e.isDead && e.hp > 0;
export default class ClassCombatBridge {
    constructor(owner, classId = owner.classId) {
        this.owner = owner; this.game = globalThis.window?.game; this.context = captureProjectileWorldContext(this.game);
        this.visualEpoch=ClassCombatBridge.lastEpoch=Math.max(Date.now(),(ClassCombatBridge.lastEpoch||0)+1); this.visualSequence=0; this.hitSerial=0; this.motionSerial=0;
        this.effects = []; this.actors = []; this.definitions = new Map(); this.images = {};
        this.controller = new ClassCombatController(owner, classId, {
            managesPoisonStatuses: true,
            combatOrigin:()=>combatCenter(this.owner),
            projectileBlocked:(x,y,r)=>!!this.game?.sceneManager?.currentScene?.checkCollision?.(x-r,y-r,r*2,r*2),
            attackOrigin:(target,kind)=>attackAnchor(this.owner,target,kind),
            action: (kind,data)=>this.startActionMotion(kind,data),
            failure: text=>this.game?.ui?.logSystemMessage?.(text),
            cancelEffect: id=>{this.effects=this.effects.filter(f=>f.id!==id);},
            enemies: () => [...(this.game?.monsterManager?.monsters?.values?.() || [])],
            allies: () => [...this.actors, ...this.allies()], paused: () => this.paused(),
            heal: (e,n) => this.heal(e,n),
            lifestealFeedback: amount => {
                if (!(this.pendingLifesteal > 0)) this.lifestealTextAt = this.controller.time + .12;
                this.pendingLifesteal = (this.pendingLifesteal || 0) + amount;
            },
            damage: (e,n,m) => this.damage(e,n,m), status: (e,t,d,data) => this.status(e,t,d,data),
            clearStatus: (e,t) => this.clearStatus(e,t), move: (e,x,y) => this.move(e,x,y),
            summon: (id,level) => this.summon(id,level), dismiss: e => { e.isDead = true; this.actors = this.actors.filter(a => a !== e); },
            effect: (name,data) => {
                this.game?.sound?.playClassEvent?.(name,{...data,audioId:`${this.visualEpoch}:${data.id}`},{remote:false});
                const origin=['warrior_slash','rage_smash'].includes(name)?attackAnchor(this.owner,data.target,name):{};
                const d=origin.x!==undefined?this.controller.direction(data.target):null;
                const reach=data.range || (name==='rage_smash'?150:100);
                const target=d?{x:origin.x+d.x*reach,y:origin.y+d.y*reach}:data.target;
                this.effects.push({name,...data,...origin,target,age:0,duration:data.duration || .65});
                if(name==='blood_finale')this.startActionMotion('finale',{});
            },
            decoy: (point,duration) => this.createDecoy(point,duration)
        });
        if (classId === 'witch') for (const id of SUMMON_TYPES) this.game?.monsterData?.loadDefinition(id).then(d => { if(d) this.definitions.set(id,d); }).catch(() => {});
        loadClassVisualImages(classId, this.images);
    }
    allies() {
        const ids = this.owner.party?.members || [];
        return [...(this.game?.sceneManager?.currentScene?.remotePlayers?.values?.() || [])].filter(e => ids.includes(e.id) && alive(e));
    }
    receiveSummonDamage(id,amount) {
        const actor = this.actors.find(e => e.id === id && alive(e));
        if(!actor || !Number.isFinite(amount) || amount <= 0) return false;
        actor.takeDamage(amount); return true;
    }
    receiveSupport(support) {
        if(support?.type === 'berserk') { this.controller.state(this.owner).berserkUntil = this.controller.time + 10; this.owner.classStatuses ||= {}; this.owner.classStatuses.berserk = {remaining:10}; }
        if(support?.type === 'heal') this.owner.hp = Math.min(this.owner.maxHp,this.owner.hp+Math.max(0,Number(support.amount)||0));
    }
    paused() { return !!this.game?.story?.isStoryActive || !!this.game?.ui?.isPaused && !this.game?.net?.isSharedFieldActive?.(); }
    startActionMotion(kind,data) {
        const direction=this.requestDirection??facingDirection(this.owner,data.target);
        const previous = this.motion;
        this.motion=createActionMotion(this.controller.classId,kind,{...data,direction},this.controller.time,++this.motionSerial);
        if (kind==='basic' && previous && this.controller.time-previous.started < previous.duration) {
            this.motion.started=previous.started; // Fast attacks never pin the body to its first pose.
        }
        this.owner.direction=direction;
        this.syncVisuals(true);
    }
    currentMotion() {
        if(this.controller.disposed||!alive(this.owner))return null;
        if(this.motion) {const age=this.controller.time-this.motion.started;if(age<this.motion.duration)return {...this.motion,age};}
        const aim=this.owner.classAim;if(!aim)return null;
        if(this.controller.classId==='warrior' && aim.action==='ATTACK'
            && (this.controller.time<this.controller.basicReady || aim.elapsed<basicChargeSeconds(this.owner) || this.controller.rage<25)) return null;
        const data=aim.action==='ATTACK'?{aimed:aim.elapsed>=basicChargeSeconds(this.owner,this.controller.empowered)}:{slot:Number(aim.action.slice(-1))};
        return {id:0,row:actionRow(this.controller.classId,aim.action==='ATTACK'?'basic':'skill',data),direction:facingDirection(this.owner,aim),held:true,age:0,duration:.4};
    }
    drawBody(ctx,x,y,w,h) {return drawAuthoredClassBody(this.images.authored,this.owner,this.currentMotion(),ctx,x,y) || drawActionBody(this.images.actions,this.currentMotion(),ctx,x,y,w,h);}
    basic(options) { return !this.paused() && this.controller.basic(options); }
    skill(slot,options={}) {
        if(this.paused())return false;
        // Charge may finish beyond the selected point. Capture its facing before
        // movement; recomputing from the destination would turn the body backwards.
        this.requestDirection=facingDirection(this.owner,options);
        try{return this.controller.skill(slot,options);}finally{this.requestDirection=null;}
    }
    modifyIncomingDamage(n) { return this.controller.evadeUntil > this.controller.time ? 0 : this.controller.modifyIncomingDamage(n); }
    multipliers(e = this.owner) { return this.controller.multipliers(e); }
    heal(e,amount) {
        const accepted=Math.min(Math.max(0,e.maxHp-e.hp),Math.max(0,amount));
        if(this.allies().includes(e)) this.game?.net?.sendPlayerDamage(e.id,0,null,0,0,{classSupport:{type:'heal',amount:accepted}});
        e.hp+=accepted;return amount-accepted;
    }
    damage(e, amount, meta = {}) {
        if (!alive(e) || this.game?.monsterManager?.isMonsterCombatBlocked?.()) return 0;
        const defense = Math.max(0, Number(e.defense || 0)) * (1 - Math.min(1, meta.armorPierce || 0));
        const damage = Math.max(1, Math.ceil(meta.poison ? amount : amount - defense));
        if (e.hasEffect?.('shield')) return 0;
        const net = this.game?.net, before = e.hp;
        const pulse = meta.poisonPulse ? { ...meta.poisonPulse, castId:`${this.owner.id}:${this.visualEpoch}:${meta.poisonPulse.castId}` } : null;
        const packet = {...meta, ...(pulse ? {poisonPulse:pulse} : {}), classHitId:`${this.owner.id}:${this.visualEpoch}:${++this.hitSerial}`, impactX:this.owner.x,impactY:this.owner.y,attackerLevel:this.owner.level};
        if (net && !e.isLocalOnly && net.sendMonsterDamage(e.id,damage,packet) === false) return 0;
        e.lastAttackerId = net?.playerId || this.owner.id;
        if (e.takeDamage(damage,false,false,this.owner.x,this.owner.y,packet) === false) return 0;
        const actual=Math.max(0,before-e.hp);
        if(actual>0&&meta.poison)this.game?.sound?.playClassEvent?.('poison_tick',{targetId:e.id,audioId:`${this.visualEpoch}:poison:${this.hitSerial}`},{remote:false});
        return actual;
    }
    status(e,type,duration,data = {}) {
        if(type === 'stun' && e.classStatuses) delete e.classStatuses.poison;
        if(type === 'berserk' && this.allies().includes(e)) this.game?.net?.sendPlayerDamage(e.id,0,null,0,0,{classSupport:{type:'berserk',duration:10}});
        const safe = {sourceId:this.owner.id,stacks:data.stacks || 0,slow:data.slow || 0,targetId:data.target?.id || this.owner.id,targetX:data.target?.x ?? this.owner.x,targetY:data.target?.y ?? this.owner.y};
        if (typeof e.applyClassStatus === 'function') {
            const packet = {type,duration,...safe};
            if (this.game?.net && !e.isLocalOnly && this.game.net.sendMonsterDamage(e.id,0,{classStatus:packet}) === false) return;
            e.applyClassStatus(packet);
        } else { e.classStatuses ||= {}; e.classStatuses[type] = {remaining:duration,...safe}; }
    }
    clearStatus(e,type) {
        if(e.classStatuses && (!e.classStatuses[type]?.sourceId || e.classStatuses[type].sourceId === this.owner.id)) delete e.classStatuses[type];
        if (typeof e.applyClassStatus === 'function' && !e.isLocalOnly) this.game?.net?.sendMonsterDamage(e.id,0,{classStatus:{type,duration:0,sourceId:this.owner.id}});
    }
    move(e,x,y) {
        const scene = this.game?.sceneManager?.currentScene;
        const dx=x-e.x,dy=y-e.y,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/10));
        for(let i=1;i<=steps;i++) if(scene?.checkCollision?.(e.x+dx*i/steps,e.y+dy*i/steps,e.width || 32,e.height || 32)) return false;
        if(e !== this.owner && !e.isSummon && typeof e.applyClassStatus === 'function' && this.game?.net && !e.isLocalOnly) {
            if(this.game.net.sendMonsterDamage(e.id,0,{classMove:{x,y}}) === false)return false;
        }
        e.x=x;e.y=y;return true;
    }
    summon(id,level) {
        const definition=this.definitions.get(id); if(!definition) return null;
        const visual=new Monster(this.owner.x+36,this.owner.y+24,definition);
        const actor={id:`summon:${this.owner.id}:${++ClassCombatBridge.serial}`,ownerId:this.owner.id,isSummon:true,typeId:id,x:visual.x,y:visual.y,hp:this.owner.maxHp*.55,maxHp:this.owner.maxHp*.55,isDead:false,width:32,height:32,visual,attackReady:0,classStatuses:{},isLocalOnly:true};
        actor.takeDamage=n=>{actor.hp=Math.max(0,actor.hp-n);actor.isDead=actor.hp<=0;};
        const scale=visual.isBoss ? .6 : 1;
        visual.width*=scale;visual.height*=scale;if(visual.renderWidth)visual.renderWidth*=scale;if(visual.renderHeight)visual.renderHeight*=scale;
        visual.isBoss=false;visual.init(visual.assetPath);this.actors.push(actor);return actor;
    }
    createDecoy(point,duration) {
        this.decoy={...point,direction:this.owner.direction,frame:this.owner.animFrame,remaining:duration,id:`decoy:${this.owner.id}`,hp:1,isDead:false};
        for(const e of this.controller.area(point,220)) this.status(e,'taunt',Math.min(duration,e.isBoss?.6:duration),{target:this.decoy});
    }
    update(dt) {
        if (!isProjectileWorldContextCurrent(this.context,this.game)) {this.dispose();return;}
        if(this.paused()) return;
        this.game?.net?.syncClassSummons?.();
        this.controller.update(dt);
        if(this.pendingLifesteal>0 && this.controller.time>=this.lifestealTextAt){
            const amount=this.pendingLifesteal;this.pendingLifesteal=0;
            const label=Number(amount.toFixed(2)) || Number(amount.toPrecision(2));
            this.game?.addDamageText?.(this.owner.x+(this.owner.width||48)/2,this.owner.y-12,`+${label}`,'#66e38b',false);
        }
        const delta=Math.min(.25,Math.max(0,dt));
        for(const [key,status] of Object.entries(this.owner.classStatuses || {})){status.remaining-=delta;if(status.remaining<=0)delete this.owner.classStatuses[key];}
        this.effects=this.effects.filter(f=>{f.age+=delta;return f.age<f.duration;});
        if(this.decoy){this.decoy.remaining-=delta;if(this.decoy.remaining<=0)this.decoy=null;}
        for(const actor of this.actors) {
            for(const [k,s] of Object.entries(actor.classStatuses)){s.remaining-=delta;if(s.remaining<=0)delete actor.classStatuses[k];}
            if(!alive(actor))continue;
            const enemy=this.controller.enemies().filter(e=>Math.hypot(e.x-actor.x,e.y-actor.y)<320).sort((a,b)=>Math.hypot(a.x-actor.x,a.y-actor.y)-Math.hypot(b.x-actor.x,b.y-actor.y))[0];
            const target=enemy || this.owner,dist=Math.hypot(target.x-actor.x,target.y-actor.y),mult=this.multipliers(actor);
            if(dist>(enemy?55:70)){const step=Math.min(dist,125*mult.move*delta);this.move(actor,actor.x+(target.x-actor.x)/dist*step,actor.y+(target.y-actor.y)/dist*step);}
            if(enemy&&dist<=65&&this.controller.time>=actor.attackReady){this.damage(enemy,this.owner.attackPower*.6*mult.attack,{summon:true});actor.attackReady=this.controller.time+1.2/mult.attackSpeed;}
            actor.visual.x=actor.x;actor.visual.y=actor.y;actor.visual._advanceAnimation(delta);
        }
        this.syncVisuals();
    }
    drawEffect(...args) { drawClassEffect(this,...args); }
    renderGround(ctx) { renderGroundEffects(this,ctx); }
    render(ctx) {
        for(const a of this.actors) if(alive(a)&&a.visual.sprite) {const v=a.visual; v.sprite.draw(ctx,v.usesV2Atlas?v.animationRow:0,v.frame,a.x-(v.renderWidth||v.width)/2,a.y-(v.renderHeight||v.height)/2,v.renderWidth||v.width,v.renderHeight||v.height);}
        renderForegroundEffects(this,ctx);
        for(const a of this.actors) if(alive(a)) {
            const width=40,y=a.y-(a.visual.renderHeight||a.visual.height)/2-8;
            ctx.fillStyle='#1c2430';ctx.fillRect(a.x-width/2,y,width,4);
            ctx.fillStyle='#85dc8d';ctx.fillRect(a.x-width/2,y,width*Math.max(0,a.hp/a.maxHp),4);
        }
        for(const e of [this.owner,...this.controller.enemies(),...this.actors,...this.allies()])this.renderStatus(ctx,e);
    }
    visualSnapshot() {
        const c=this.controller,point=p=>({x:p.x,y:p.y});
        const badges=Object.entries(this.owner.classStatuses||{}).filter(([type])=>ICONS.includes(type)).map(([type,s])=>({type,count:s.stacks||0}));
        if(c.rage>0)badges.push({type:'rage',count:Math.floor(c.rage)});
        if(c.bloodUntil>c.time)badges.push({type:'bloodPact',count:0});
        if(c.empowered)badges.push({type:'empowered',count:0});
        return {epoch:this.visualEpoch,sequence:++this.visualSequence,ts:Date.now(),fieldId:this.context.fieldId,classId:c.classId,
            motion:this.currentMotion(),
            effects:this.effects.slice(-64).map(f=>({id:f.id,name:f.name,...point(f),target:f.target?point(f.target):null,radius:f.radius||0,range:f.range||0,halfWidth:f.halfWidth||0,duration:f.duration,age:f.age})),
            projectiles:c.projectiles.slice(-32).map(p=>{const target=c.attackOrigin(p,'return'),dx=target.x-p.x,dy=target.y-p.y,len=Math.hypot(dx,dy)||1;const d=p.kind==='return'?{x:dx/len,y:dy/len}:p.direction;return{kind:p.kind,...point(p),radius:p.radius||0,direction:d,speed:p.speed,remaining:Number.isFinite(p.remaining)?p.remaining:null,age:p.age??c.time};}),
            decoy:this.decoy?{...point(this.decoy),remaining:this.decoy.remaining,direction:this.decoy.direction||0,frame:this.decoy.frame||0}:null,badges};
    }
    syncVisuals(force=false) {
        const now=Date.now(),c=this.controller;
        if(c.classId==='wizard')return;
        const active=this.currentMotion()||this.effects.length||c.projectiles.length||this.decoy||c.rage||c.empowered||c.bloodUntil>c.time||Object.keys(this.owner.classStatuses||{}).length;
        if(!active&&!this.visualPublished)return;
        if(!force&&now-(this.lastVisualSync||0)<100)return;
        this.lastVisualSync=now;this.visualPublished=!!active;
        this.game?.net?.sendPlayerAttack?.(this.owner.x,this.owner.y,this.owner.direction,'class_vfx',this.visualSnapshot());
    }
    renderStatus(ctx,e) {
        const img=this.images.status;if(!img||!alive(e))return;
        const types=Object.keys(e.classStatuses || {}).filter(t=>ICONS.includes(t));
        if(e===this.owner&&this.controller.rage>0)types.push('rage');
        if(e===this.owner&&this.controller.bloodUntil>this.controller.time)types.push('bloodPact');
        if(e===this.owner&&this.controller.empowered)types.push('empowered');
        types.forEach((type,i)=>{
            const index=ICONS.indexOf(type),size=22,w=img.width/4,h=img.height/2;
            const x=e.x+(i-(types.length-1)/2)*24-11,y=e.y-(e.visual?.renderHeight||e.visual?.height||e.height||64)/2-28;
            ctx.drawImage(img,(index%4)*w,Math.floor(index/4)*h,w,h,x,y,size,size);
            const count=type==='rage'?Math.floor(this.controller.rage):Number(e.classStatuses?.[type]?.stacks || 0);
            if(count>0){ctx.save();ctx.font='bold 12px sans-serif';ctx.textAlign='right';ctx.lineWidth=3;ctx.strokeStyle='#17212c';ctx.fillStyle='#ffffff';ctx.strokeText(String(count),x+24,y+23);ctx.fillText(String(count),x+24,y+23);ctx.restore();}
        });
    }
    dispose(){this.pendingLifesteal=0;this.motion=null;this.controller.dispose();this.controller.empowered=false;this.effects=[];this.actors=[];this.decoy=null;this.syncVisuals(true);this.game?.net?.syncClassSummons?.({force:true});}
}
ClassCombatBridge.serial=0;

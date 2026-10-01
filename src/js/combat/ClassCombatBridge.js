import ClassCombatController, { SUMMON_TYPES } from './ClassCombatController.js';
import Monster from '../entities/Monster.js';
import { getSharedResourceManager } from '../core/ResourceManager.js';
import { captureProjectileWorldContext, isProjectileWorldContextCurrent } from '../entities/ProjectileWorldContext.js';

// Atlas rows are authored raster animations; no generated geometry substitutes.
export const EFFECT_ROWS = {
    witch: [['life_circle','drain_orb','drain_link','orb','return'], ['poison_cloud'], ['summon'], ['berserk_potion']],
    warrior: [['warrior_slash','rage_smash'], ['challenge'], ['punishing_charge'], ['blood_pact','blood_finale']],
    archer: [['archer_shot','piercing_snipe','arrow'], ['hunter_trap','trap_burst','trap_trigger'], ['shadow_leap'], ['tracking_rain']]
};
const ICONS = ['poison','berserk','rage','mark','root','taunt','bloodPact','empowered'];
const alive = e => e && !e.isDead && e.hp > 0;
export default class ClassCombatBridge {
    constructor(owner, classId = owner.classId) {
        this.owner = owner; this.game = globalThis.window?.game; this.context = captureProjectileWorldContext(this.game);
        this.effects = []; this.actors = []; this.definitions = new Map(); this.images = {};
        this.controller = new ClassCombatController(owner, classId, {
            enemies: () => [...(this.game?.monsterManager?.monsters?.values?.() || [])],
            allies: () => [...this.actors, ...this.allies()], paused: () => this.paused(),
            heal: (e,n) => this.heal(e,n),
            damage: (e,n,m) => this.damage(e,n,m), status: (e,t,d,data) => this.status(e,t,d,data),
            clearStatus: (e,t) => this.clearStatus(e,t), move: (e,x,y) => this.move(e,x,y),
            summon: (id,level) => this.summon(id,level), dismiss: e => { e.isDead = true; this.actors = this.actors.filter(a => a !== e); },
            effect: (name,data) => this.effects.push({name,...data,age:0,duration:data.duration || .65}),
            decoy: (point,duration) => this.createDecoy(point,duration)
        });
        if (classId === 'witch') for (const id of SUMMON_TYPES) this.game?.monsterData?.loadDefinition(id).then(d => { if(d) this.definitions.set(id,d); }).catch(() => {});
        const resources = getSharedResourceManager();
        if(classId === 'witch') resources?.loadImage('assets/resource/classes/life-circle.webp').then(img=>{this.images.lifeCircle=img;}).catch(()=>{});
        for (const name of (classId === 'wizard' ? ['status'] : ['effects','status'])) resources?.loadImage(`assets/resource/classes/${name === 'effects' ? classId + '-effects' : name}.webp`).then(img => {this.images[name] = img;}).catch(() => {});
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
    basic(options) { return !this.paused() && this.controller.basic(options); }
    skill(slot,options) { return !this.paused() && this.controller.skill(slot,options); }
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
        const packet = {...meta, impactX:this.owner.x,impactY:this.owner.y,attackerLevel:this.owner.level};
        if (net && !e.isLocalOnly && net.sendMonsterDamage(e.id,damage,packet) === false) return 0;
        e.lastAttackerId = net?.playerId || this.owner.id;
        if (e.takeDamage(damage,false,false,this.owner.x,this.owner.y,packet) === false) return 0;
        return Math.max(0,before-e.hp);
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
        this.decoy={...point,remaining:duration,id:`decoy:${this.owner.id}`,hp:1,isDead:false};
        for(const e of this.controller.area(point,220)) this.status(e,'taunt',Math.min(duration,e.isBoss?.6:duration),{target:this.decoy});
    }
    update(dt) {
        if (!isProjectileWorldContextCurrent(this.context,this.game)) {this.dispose();return;}
        if(this.paused()) return;
        this.game?.net?.syncClassSummons?.();
        this.controller.update(dt);const delta=Math.min(.25,Math.max(0,dt));
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
    }
    drawEffect(ctx,name,x,y,size,age=0,options={}) {
        const circle=name==='life_circle';
        const img=circle?this.images.lifeCircle:this.images.effects;if(!img)return;
        const row=circle?0:(EFFECT_ROWS[this.controller.classId] || []).findIndex(names => names.includes(name));if(row<0)return;
        const w=img.width/4,h=img.height/(circle?1:4),tick=Math.floor(age/.16);
        const phase=tick%6,frame=options.sustained ? (phase<=3?phase:6-phase) : Math.min(3,tick);
        const angle=options.angle || 0,width=options.width || size,height=options.height || size;
        if(options.opacity<1){ctx.save();ctx.globalAlpha*=options.opacity;}
        if(angle){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(img,frame*w,row*h,w,h,-width/2,-height/2,width,height);ctx.restore();}
        else ctx.drawImage(img,frame*w,row*h,w,h,x-width/2,y-height/2,width,height);
        if(options.opacity<1)ctx.restore();
    }
    renderGround(ctx) {
        for(const f of this.effects) if(['life_circle','poison_cloud','summon','hunter_trap','tracking_rain','blood_pact','berserk_potion'].includes(f.name))this.drawEffect(ctx,f.name,f.name==='blood_pact'?this.owner.x:f.x,f.name==='blood_pact'?this.owner.y:f.y,f.name==='blood_pact'?110:f.name==='berserk_potion'?140:(f.radius||70)*2,f.age,{sustained:f.duration>1,opacity:['poison_cloud','tracking_rain'].includes(f.name)?.7:1});
    }
    render(ctx) {
        for(const a of this.actors) if(alive(a)&&a.visual.sprite) {const v=a.visual; v.sprite.draw(ctx,v.usesV2Atlas?v.animationRow:0,v.frame,a.x-(v.renderWidth||v.width)/2,a.y-(v.renderHeight||v.height)/2,v.renderWidth||v.width,v.renderHeight||v.height);}
        for(const f of this.effects) if(!['life_circle','poison_cloud','summon','hunter_trap','tracking_rain','blood_pact','berserk_potion'].includes(f.name)) {
            const directional=['warrior_slash','rage_smash','punishing_charge','archer_shot','piercing_snipe','shadow_leap'].includes(f.name);
            const angle=directional&&f.target ? Math.atan2(f.target.y-f.y,f.target.x-f.x):0;
            this.drawEffect(ctx,f.name,f.x,f.y,f.name==='challenge'?160:(f.radius||70)*2,f.age,{angle,sustained:f.duration>1});
        }
        for(const p of this.controller.projectiles)this.drawEffect(ctx,p.kind,p.x,p.y,p.kind==='arrow'?48:58,this.controller.time,{angle:p.kind==='arrow'?Math.atan2(p.direction.y,p.direction.x):0,sustained:true});
        for(const a of this.actors) if(alive(a)) {
            const width=40,y=a.y-(a.visual.renderHeight||a.visual.height)/2-8;
            ctx.fillStyle='#1c2430';ctx.fillRect(a.x-width/2,y,width,4);
            ctx.fillStyle='#85dc8d';ctx.fillRect(a.x-width/2,y,width*Math.max(0,a.hp/a.maxHp),4);
        }
        for(const e of [this.owner,...this.controller.enemies(),...this.actors,...this.allies()])this.renderStatus(ctx,e);
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
    dispose(){this.controller.dispose();this.effects=[];this.actors=[];this.decoy=null;this.game?.net?.syncClassSummons?.({force:true});}
}
ClassCombatBridge.serial=0;

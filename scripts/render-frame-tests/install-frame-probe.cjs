// Test-only browser instrumentation. Wrappers record exceptions and rethrow them.
// No production error handler, entity list, culling result, or rendering fallback is changed.
function installFrameProbe({fault='none'}={}) {
    const g=window.game,s=g.sceneManager.currentScene,p=g.localPlayer,ctx=g.ctx;
    const probe={frames:[],callbacks:[],frame:null,owner:null,depth:0,callbackIndex:0,fault,contextEvents:[]};
    const errorData=e=>({name:e?.name||'Error',message:String(e?.message||e),stack:String(e?.stack||'')});
    const state=()=>{const m=ctx.getTransform();return{alpha:ctx.globalAlpha,composite:ctx.globalCompositeOperation,
        transform:[m.a,m.b,m.c,m.d,m.e,m.f],depth:probe.depth,smoothing:ctx.imageSmoothingEnabled}};
    const event=key=>{if(!probe.frame)return;probe.frame.events[key]=(probe.frame.events[key]||0)+1;probe.frame.drawStates.push({key,...state()})};
    const pass=(key,fn)=>{
        if(!probe.frame)return fn();
        const entry={key,before:state(),completed:false,error:null};probe.frame.passes.push(entry);
        try{const result=fn();entry.completed=true;return result;}
        catch(e){entry.error=errorData(e);throw e;}
        finally{entry.after=state();}
    };
    const owned=(owner,fn)=>{const previous=probe.owner;probe.owner=owner;try{return fn()}finally{probe.owner=previous}};
    // The identity/HP UI is now painted by the shared WorldScene pass, outside
    // ClassCombatBridge.render. Attribute its actual Canvas calls by geometry.
    const summonPlate=a=>{
        const width=Math.ceil(ctx.measureText('내 소환수').width)+24;
        return{x:Math.round(a.x-width/2),y:Math.round(a.y-(a.visual.renderHeight||a.visual.height||a.height||64)/2-28)};
    };
    const wrap=(object,method,key,owner,body)=>{const original=object[method];object[method]=function(...args){
        return pass(key,()=>owned(owner,()=>body?body(original,this,args):original.apply(this,args)));
    }};
    for(const method of ['save','restore']){const original=ctx[method].bind(ctx);ctx[method]=(...args)=>{
        probe.depth+=method==='save'?1:-1;return original(...args);
    }}
    for(const type of ['contextlost','contextrestored'])g.canvas.addEventListener(type,()=>probe.contextEvents.push({type,frame:probe.frame?.id??null}));
    const spritePrototype=Object.getPrototypeOf(window.renderFixture.live.sprite),spriteDraw=spritePrototype.draw;
    spritePrototype.draw=function(...args){
        const owner=probe.owner;
        const result=spriteDraw.apply(this,args);
        if(owner?.kind==='monster')event(`${owner.key}:body`);
        if(owner?.kind==='summons'){
            const actor=p.classCombat.actors.find(a=>a.visual.sprite===this
                &&Math.abs(args[3]-(a.x-(a.visual.renderWidth||a.visual.width)/2))<1e-7
                &&Math.abs(args[4]-(a.y-(a.visual.renderHeight||a.visual.height)/2))<1e-7);
            if(actor)event(`summon:${actor.id}:body`);
        }
        return result;
    };
    const drawImage=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{
        const result=drawImage(...args),owner=probe.owner;
        if(owner?.kind==='player'&&(args[0]===p.classCombat.images.authored||args[0]===p.sprite?.image))event('player:body');
        return result;
    };
    for(const method of ['fillText','strokeText']){
        const original=ctx[method].bind(ctx);ctx[method]=(...args)=>{
            const result=original(...args),owner=probe.owner;
            if(owner?.kind==='monster'&&args[0]===owner.entity.name)event(`${owner.key}:name:${method}`);
            if(owner?.kind==='hud'&&args[0]===p.name)event(`player:name:${method}`);
            if(method==='fillText'&&args[0]==='내 소환수')for(const a of p.classCombat.actors){
                const plate=summonPlate(a);
                if(args[1]===plate.x+18&&args[2]===plate.y+9.5)event(`summon:${a.id}:label`);
            }
            return result;
        };
    }
    const fillRect=ctx.fillRect.bind(ctx);ctx.fillRect=(...args)=>{
        const summon=p.classCombat.actors.find(a=>{
            const plate=summonPlate(a);
            return (args[0]===plate.x&&args[1]===plate.y+21&&args[3]===5)
                ||(args[0]===plate.x+1&&args[1]===plate.y+22&&args[3]===3);
        });
        if(summon&&probe.fault==='summon-hp'&&probe.callbackIndex%2===0)return;
        const result=fillRect(...args),owner=probe.owner;
        if(owner?.kind==='monster'&&owner.hud&&args[0]===owner.hud.hpX&&args[1]===owner.hud.hpY&&args[3]===6)
            event(`${owner.key}:hp`);
        if(owner?.kind==='hud'&&(ctx.fillStyle==='#4ade80'||ctx.fillStyle==='#ef4444'))event('player:hp');
        if(owner?.kind==='hud'&&ctx.fillStyle==='#48dbfb')event('player:mp');
        if(summon)event(`summon:${summon.id}:hp`);
        return result;
    };
    const monsterOwners=[];
    for(const m of g.monsterManager.monsters.values()){
        const owner={kind:'monster',key:`monster:${m.id}`,entity:m,hud:null};monsterOwners.push(owner);
        wrap(m,'render',owner.key,owner,(original,self,args)=>{
            owner.hud=args[2];
            if(probe.fault==='omit'&&probe.callbackIndex%2===0&&m===window.renderFixture.live)return;
            return original.apply(self,args);
        });
    }
    wrap(p,'render','player:render',{kind:'player'});
    wrap(p,'drawHUD','player:hud',{kind:'hud'},(original,self,args)=>{
        if(probe.fault==='exception'&&probe.callbackIndex%2===0)throw new Error('INJECTED_RENDER_HUD_EXCEPTION');
        return original.apply(self,args);
    });
    wrap(p.classCombat,'renderGround','summons:ground',{kind:'ground'});
    wrap(p.classCombat,'render','summons:foreground',{kind:'summons'},(original,self,args)=>{
        const result=original.apply(self,args);
        if(probe.fault==='state'&&probe.callbackIndex%2===0)ctx.globalAlpha=.25;
        return result;
    });
    // Independent geometric oracle, not WorldScene.isOnScreen or render-list membership.
    const visible=e=>{
        const center={x:e.x+(e.width||0)/2,y:e.y+(e.height||0)/2};
        const right=g.camera.x+g.canvas.width/g.dpr/g.zoom+500;
        const bottom=g.camera.y+g.canvas.height/g.dpr/g.zoom+500;
        return Number.isFinite(center.x)&&Number.isFinite(center.y)
            &&center.x>=g.camera.x-500&&center.x<=right&&center.y>=g.camera.y-500&&center.y<=bottom;
    };
    const expected=()=>{
        const passes=['player:render','player:hud','summons:ground','summons:foreground'];
        const events={'player:body':1,'player:name:fillText':1,'player:name:strokeText':1,'player:hp':1,'player:mp':1};
        const monsters=[...g.monsterManager.monsters.values()].filter(m=>visible(m)&&m.deathTimer<m.deathDuration);
        for(const m of monsters){const key=`monster:${m.id}`;passes.push(key);Object.assign(events,{[`${key}:body`]:1,[`${key}:name:fillText`]:1,[`${key}:name:strokeText`]:1,[`${key}:hp`]:2})}
        for(const a of p.classCombat.actors)if(a.hp>0&&!a.isDead){events[`summon:${a.id}:body`]=1;events[`summon:${a.id}:hp`]=2;events[`summon:${a.id}:label`]=1;}
        return{passes,events,visibleIds:monsters.map(m=>m.id)};
    };
    const render=g.loop.renderFn;g.loop.renderFn=()=>{
        const exp=expected();
        const f={id:probe.frames.length,callback:probe.callbackIndex,expected:exp,events:{},passes:[],drawStates:[],before:state(),completed:false,error:null,
            fixture:{monsters:g.monsterManager.monsters.size,summons:p.classCombat.actors.length,expectedMonsters:exp.visibleIds.length}};
        probe.frames.push(f);probe.frame=f;
        try{render();f.completed=true;}catch(e){f.error=errorData(e);throw e;}
        finally{f.after=state();probe.frame=null;}
    };
    probe.run=({name,intervals,renderFps,updateFps,callbacks})=>{
        probe.frames=[];probe.callbacks=[];g.loop.stop();
        const raf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;
        g.loop.running=true;g.loop.paused=false;g.loop.setMaxRenderFps(renderFps);g.loop.setUpdateFps(updateFps);g.loop.accumulator=0;
        let now=10000;g.loop.lastTime=g.loop.lastRenderTime=now;
        const originalNow=Date.now,epoch=originalNow()-now;Date.now=()=>epoch+now;
        try{for(let i=0;i<callbacks;i++){
            probe.callbackIndex=i;now+=intervals[i%intervals.length];
            const count=probe.frames.length,entry={index:i,timestamp:now,renderAttempts:0,error:null};
            try{g.loop._loop(now);}catch(e){entry.error=errorData(e);}
            // This is the external test driver. Any collected exception makes auditFrames fail.
            // It never changes the product render/error handlers or repairs leaked context state.
            entry.renderAttempts=probe.frames.length-count;probe.callbacks.push(entry);
        }}finally{Date.now=originalNow;g.loop.running=false;window.requestAnimationFrame=raf;}
        return{name,requestedCallbacks:callbacks,frames:probe.frames,callbacks:probe.callbacks,contextEvents:probe.contextEvents};
    };
    window.frameProbe=probe;
    return{instrumentedMonsters:monsterOwners.length};
}
module.exports={installFrameProbe};

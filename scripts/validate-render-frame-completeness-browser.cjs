const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {installFrameProbe}=require('./render-frame-tests/install-frame-probe.cjs');
const {auditFrames,assertFrameAudit}=require('./render-frame-tests/frame-audit.cjs');
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const mode=arg('mode')||'matrix',fault=arg('fault')||'exception';
assert.ok(['matrix','fault','ab'].includes(mode));
assert.ok(['exception','omit','state','summon-hp'].includes(fault));
const root=path.resolve(__dirname,'..'),version=fs.readFileSync(path.join(root,'version.txt'),'utf8').trim();
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8100';
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Run isolated loopback diagnostics only.');
const out=process.env.QA_OUTPUT||`/tmp/yurika-render-frame-regression/${mode}${mode==='fault'?'-'+fault:''}`;
fs.mkdirSync(out,{recursive:true});
const cases=[
    ['60hz',[1000/60],0,60,240],['90hz',[1000/90],0,60,240],
    ['120hz',[1000/120],0,60,240],['144hz',[1000/144],0,60,240],
    ['variable',[8.3,25,16.7,6.9,33.3,11.1],0,60,240],
    ['additional-cap60-update30',[1000/120],60,30,240],
    ['mobile50-60hz',[1000/60],50,50,120],['pwa45-60hz',[1000/60],45,45,120],
    ['mobile50-120hz',[1000/120],50,50,120],['pwa45-120hz',[1000/120],45,45,120]
].map(([name,intervals,renderFps,updateFps,callbacks])=>({name,intervals,renderFps,updateFps,callbacks}));

async function newFixture(browser,viewport,variant,faultMode='none',standaloneEmulated=false) {
    const context=await browser.newContext({viewport,deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block'});
    await context.addInitScript(({variant,standaloneEmulated})=>{
        if(standaloneEmulated){
            const matchMedia=window.matchMedia.bind(window);
            window.matchMedia=query=>{
                const result=matchMedia(query);
                if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});
                return result;
            };
        }
        const original=HTMLCanvasElement.prototype.getContext;
        window.__gameContextCalls=[];
        HTMLCanvasElement.prototype.getContext=function(type,...rest){
            if(this.id!=='gameCanvas'||type!=='2d')return original.call(this,type,...rest);
            const requested=rest.length?{...rest[0]}:null;
            const applied=variant==='default'?[]:variant==='synchronized'?[{...rest[0],desynchronized:false}]:rest;
            const ctx=original.call(this,type,...applied);
            window.__gameContextCalls.push({call:window.__gameContextCalls.length+1,requested,
                applied:applied.length?{...applied[0]}:null,actual:ctx?.getContextAttributes?.()||null,success:!!ctx});
            return ctx;
        };
    },{variant,standaloneEmulated});
    const page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await page.goto(base+'/?local=1');
    assert.equal(await page.evaluate(()=>window.BOOTSTRAP_VERSION),version);
    await page.locator('#camp-name').fill('렌더 회귀 검사');await page.locator('[data-camp=create]').click();
    await page.locator('[data-camp=character]').first().waitFor();
    await page.evaluate(async()=>{
        const n=game.net,d=await n.getPlayerProfile(n.playerId);
        await n.savePlayerData(n.playerId,{...d,activeClassId:'witch',level:19,
            questData:{...d.questData,basicTrainingCompleted:true,prologueCompleted:true}});
    });
    await page.reload();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();
    await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
    const metadata=await page.evaluate(async()=>{
        const g=game,p=g.localPlayer,s=g.sceneManager.currentScene;
        g.loop.stop();g.ui.hideAllPopups();g.ui.isPaused=false;g.tutorial.activeTutorial=null;g.story.isStoryActive=false;
        p.level=19;await s.changeZone('zone_3');g.loop.stop();p.initializeClassCombat();
        Object.assign(p.classCombat.images,await g.resources.preparePlayableClassAssets('witch'));
        s.safeZone=null;s.zoneSpawnRules=[];s.checkCollision=()=>false;
        g.monsterManager.monsters.clear();g.monsterManager.spawnTimer=-Infinity;
        p.x=p.y=1800;p.hp=p.maxHp=p.mp=p.maxMp=1e8;p.autoAttackEnabled=false;p.shieldTimer=p.spawnProtectionTimer=0;
        const M=(await import('/src/js/entities/Monster.js')).default;
        const spawn=async(id,x,y,key)=>{
            const m=new M(x,y,await g.monsterData.loadDefinition(id));m.id=key;m.isLocalOnly=true;m.hp=m.maxHp=1e8;
            await m.init(m.assetPath);g.monsterManager.monsters.set(key,m);return m;
        };
        const live=await spawn('thunder_pikachu',1870,1880,'frame-live');
        const dead=await spawn('thunder_pikachu',1800,1680,'frame-dead');dead.isDead=true;dead.hp=0;dead.deathDuration=1e9;
        p.classCombat.definitions.set('astral_sylveon',await g.monsterData.loadDefinition('astral_sylveon'));
        const summon=p.classCombat.summon('astral_sylveon',3);summon.hp=summon.maxHp=1e8;summon.x=1730;summon.y=1880;
        await summon.visual.init(summon.visual.assetPath);
        g.camera.x=1500;g.camera.y=1530;window.renderFixture={live,dead,summon};
        return{version:window.BOOTSTRAP_VERSION,zone:g.zone.currentZone.id,localMode:g.isLocalMode,
            dpr:g.dpr,zoom:g.zoom,standalone:g.isStandaloneLike(),profile:g.getPerformanceProfile(),contextCalls:window.__gameContextCalls,
            canvas:[g.canvas.width,g.canvas.height],userAgent:navigator.userAgent};
    });
    metadata.standaloneEmulated=standaloneEmulated;
    assert.equal(metadata.localMode,true,'Never use production accounts.');
    assert.equal(metadata.contextCalls[0].requested.desynchronized,true,'Observe the real initial creation path.');
    assert.equal(metadata.contextCalls[0].actual.desynchronized,variant==='production');
    assert.equal(metadata.contextCalls[0].actual.alpha,variant==='default');
    await page.evaluate(installFrameProbe,{fault:faultMode});
    return{context,page,pageErrors,metadata};
}

(async()=>{
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
    const results=[];
    try{
        const variants=mode==='ab'?['production','synchronized','default']:['production'];
        const viewports=mode==='fault'?[{width:844,height:390}]:[{width:844,height:390},{width:1404,height:648}];
        for(const variant of variants)for(const viewport of viewports){
            const fixture=await newFixture(browser,viewport,variant,mode==='fault'?fault:'none',mode==='ab');
            try{
                const selected=mode==='matrix'?cases:mode==='fault'?[{name:`injected-${fault}`,intervals:[1000/60],renderFps:0,updateFps:60,callbacks:12}]
                    :[cases[0],cases[8],cases[9]];
                for(const testCase of selected){
                    const start=performance.now();
                    const run=await fixture.page.evaluate(c=>frameProbe.run(c),testCase);
                    run.pageErrors=[...fixture.pageErrors];
                    const audit=auditFrames(run),file=`${variant}-${viewport.width}-${testCase.name}`;
                    fs.writeFileSync(path.join(out,file+'.json'),JSON.stringify({metadata:fixture.metadata,variant,viewport,fault:mode==='fault'?fault:null,testCase,run,audit},null,2));
                    const item={variant,viewport,name:testCase.name,callbacks:run.callbacks.length,renderAttempts:audit.renderAttempts,
                        completedFrames:audit.completedFrames,failedFrames:audit.failedFrames,violationKinds:audit.violationKinds,
                        ok:audit.ok,wallMs:Math.round(performance.now()-start),contextCreation:fixture.metadata.contextCalls[0]};
                    results.push(item);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({version,mode,results,limitations:[
                        'Desktop headless Chromium, not Galaxy S23 hardware or its unidentified installed browser.',
                        'RAF times are simulated; high-refresh modes are not physical display tests.',
                        'Draw completion and canvas state do not prove final display scanout.',
                        'User video observations are delegated parent observations; no video pixels acquired here.'
                    ]},null,2));
                    console.log(JSON.stringify(item));
                    assertFrameAudit(run); // Deliberate faults exit nonzero through this same validator.
                }
                if(mode==='ab')await fixture.page.screenshot({path:path.join(out,`${variant}-${viewport.width}.png`)});
            }finally{await fixture.context.close();}
        }
    }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});

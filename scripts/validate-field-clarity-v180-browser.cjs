const { chromium } = require('playwright');
const fs = require('node:fs'), assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8100';
const out = process.env.QA_OUTPUT || '/tmp/yurika-field-clarity-v180';
fs.mkdirSync(out, { recursive:true });
const report = { origin:base, scope:'Isolated local profiles; tutorial fixture skips prior combat/movement, then actual stat/cancel/save/skill/camp inputs. Controlled combat targets and remote render fixtures; no live multiplayer.', cases:[], errors:[], external:[] };
(async()=>{
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
    try {
        for(const [layout,width,height,mobile] of [['desktop',1280,800,false],['portrait',393,852,true],['landscape',852,393,true]]) {
            if(process.env.QA_LAYOUTS && !process.env.QA_LAYOUTS.split(',').includes(layout))continue;
            for(const [id,stat,basic] of [['wizard','intelligence','laser'],['witch','intelligence','lifeDrain'],['warrior','vitality','cleave'],['archer','agility','shot']]) {
                if(process.env.QA_CLASSES && !process.env.QA_CLASSES.split(',').includes(id))continue;
                const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
                await context.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();report.external.push(new URL(route.request().url()).origin);return route.abort()});
                const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push({layout,id,message:e.message}));
                const click=selector=>mobile?page.locator(selector).tap():page.locator(selector).click();
                const depart=async()=>{await click('[data-camp=prepare]');await click('[data-camp=depart]');await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});};
                await page.goto(base+'/?local=1');await page.locator('#camp-name').fill('직업 성장 검증');await click('[data-camp=create]');await page.locator('[data-camp=character]').first().waitFor();
                await page.evaluate(async id=>{
                    const n=game.net,a=await n.getPlayerProfile(n.playerId),other=id==='wizard'?'warrior':'wizard';
                    await n.savePlayerData(n.playerId,{...a,activeClassId:id,classProfiles:{...a.classProfiles,[other]:{level:7,exp:13,vitality:8,intelligence:9,wisdom:4,agility:5,statPoints:3}},questData:{...a.questData,prologueCompleted:true,basicTrainingCompleted:false}});
                },id);
                await page.reload();await depart();await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='move_check');
                await page.evaluate(()=>{const t=game.tutorial;t.currentStepIndex=t.activeTutorial.steps.findIndex(s=>s.id==='open_status');t._showCurrentStep();});
                await click('#btn-status');await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='preview_status_change');
                const guide=await page.evaluate(()=>({target:game.tutorial.getCurrentStep().target,text:document.querySelector('#tutorial-guide').innerText}));
                assert.equal(guide.target,stat);assert.ok(guide.text.includes({vitality:'체력',intelligence:'지능',agility:'순발력'}[stat]));
                if(['wizard','witch'].includes(id))assert.ok(guide.text.includes('지혜'));
                await page.screenshot({path:`${out}/${layout}-${id}-guidance.png`});
                const before=await page.evaluate(stat=>({stat:game.localPlayer[stat],attack:game.localPlayer.attackPower,points:game.localPlayer.statPoints,intelligence:game.localPlayer.intelligence}),stat);
                await click(`.stat-up-btn[data-stat=${stat}]`);
                assert.equal(await page.evaluate(()=>parseInt(document.querySelector('#val-atk').textContent,10)),before.attack+1);
                assert.equal(await page.evaluate(stat=>game.localPlayer[stat],stat),before.stat,'preview must not commit');
                await page.screenshot({path:`${out}/${layout}-${id}-growth.png`});
                await click('#status-close-btn-bottom');await click('#confirm-no');
                assert.equal(await page.evaluate(stat=>game.ui.pendingStats[stat],stat),1);
                await click('#status-close-btn-bottom');await click('#confirm-yes');
                await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='open_skill');
                await click('#btn-skill');await click(`#skill-item-${basic} .skill-icon`);await click('#skill-detail-modal-close');await click(`#skill-up-${basic}`);
                await click('#btn-inventory');await click('#inventory-popup .close-btn-bottom');
                await page.waitForFunction(()=>game.localPlayer.questData.basicTrainingCompleted);
                await click('.camp-return');await page.locator('[data-camp=character]').first().waitFor();await page.reload();await depart();
                const saved=await page.evaluate(async({id,stat,basic})=>{
                    const p=game.localPlayer,a=await game.net.getPlayerProfile(game.net.playerId),other=id==='wizard'?'warrior':'wizard';
                    return{classId:p.classId,stat:p[stat],attack:p.attackPower,points:p.statPoints,intelligence:p.intelligence,skill:p.skillLevels[basic],completed:p.questData.basicTrainingCompleted,activeTutorial:!!game.tutorial.activeTutorial,other:a.classProfiles[other],imageRendering:game.canvas.style.imageRendering};
                },{id,stat,basic});
                assert.equal(saved.classId,id);assert.equal(saved.stat,before.stat+1);assert.equal(saved.attack,before.attack+1);assert.equal(saved.points,before.points-1);
                assert.equal(saved.skill,2);assert.ok(saved.completed);assert.equal(saved.activeTutorial,false);assert.equal(saved.imageRendering,'pixelated');
                if(id==='warrior'||id==='archer')assert.equal(saved.intelligence,before.intelligence,'do not move old INT points');
                assert.equal(saved.other.level,7);assert.equal(saved.other.exp,13);assert.equal(saved.other.intelligence,9);assert.equal(saved.other.statPoints,3);
                const hud=await page.evaluate(()=>{
                    game.loop.stop();const p=game.localPlayer,s=game.sceneManager.currentScene,ui=game.ui;
                    game.monsterManager.monsters.clear();s.zoneSpawnRules=[];game.monsterManager.spawnTimer=-Infinity;s.safeZone=null;
                    p.hp=10;p.mp=12;ui.lastCooldownUiUpdate=performance.now();s.hudUpdateTimer=0;s.render(game.ctx);
                    const first=[document.querySelector('#ui-hp-cur').textContent,document.querySelector('#ui-mp-cur').textContent];
                    p.hp=13;p.mp=15;s.render(game.ctx);
                    const second=[document.querySelector('#ui-hp-cur').textContent,document.querySelector('#ui-mp-cur').textContent];
                    const observer=new MutationObserver(()=>{});observer.observe(document.getElementById('ui-layer'),{subtree:true,attributes:true,childList:true,characterData:true});
                    const old=ui.getCooldownRefs;let lookups=0;ui.getCooldownRefs=function(...a){lookups++;return old.apply(this,a)};
                    for(let i=0;i<120;i++)ui.syncCombatHud();
                    const mutations=observer.takeRecords().length;observer.disconnect();ui.getCooldownRefs=old;
                    return{first,second,mutations,lookups};
                });
                assert.deepEqual(hud.first,['10','12']);assert.deepEqual(hud.second,['13','15']);assert.equal(hud.mutations,0);assert.equal(hud.lookups,0);
                let orb=null,summon=null;
                if(id==='witch') {
                    await page.evaluate(async()=>{
                        const p=game.localPlayer,b=p.classCombat,c=b.controller,s=game.sceneManager.currentScene;
                        p.x=p.y=2000;p.hp=10;p.hpRegen=0;p.skillLevels.lifeDrain=7;p.autoAttackEnabled=false;s.checkCollision=()=>false;
                        const{default:Monster}=await import('/src/js/entities/Monster.js');
                        const enemy=new Monster(p.x+150,p.y+24,await game.monsterData.loadDefinition('slime'));await enemy.init(enemy.assetPath);enemy.id='clarity-target';enemy.isLocalOnly=true;enemy.hp=enemy.maxHp=10000;enemy.update=()=>{};game.monsterManager.monsters.set(enemy.id,enemy);
                        const q=window.clarityQa={p,b,c,s,enemy,heals:[],mismatches:[],frames:0,maxActive:0};
                        const heal=c.hooks.healFeedback;c.hooks.healFeedback=(e,n)=>{q.heals.push(n);return heal?.(e,n)};
                        const render=s.render;s.render=function(...args){const result=render.apply(this,args),slots=c.orbSlots();q.frames++;q.maxActive=Math.max(q.maxActive,slots.active);if(document.querySelector('#ui-hp-cur').textContent!==String(Math.floor(p.hp))||document.querySelector('#action-attack-j').getAttribute('aria-label')!==`생명의 구슬 ${slots.available}/${slots.maximum}`)q.mismatches.push({hp:p.hp,slots});return result};
                        s.camera.x=p.x+p.width/2-game.canvas.width/game.dpr/game.zoom/2;s.camera.y=p.y+p.height/2-game.canvas.height/game.dpr/game.zoom/2;game.loop.start();
                    });
                    for(let i=0;i<6;i++){await click('#action-attack-j');await page.waitForTimeout(35);}
                    await page.waitForFunction(()=>clarityQa.heals.length>0);await page.screenshot({path:`${out}/${layout}-witch-heal.png`});
                    await page.waitForFunction(()=>clarityQa.c.orbSlots().available===4&&clarityQa.heals.length===4);
                    orb=await page.evaluate(()=>{game.loop.stop();const q=clarityQa;return{hp:q.p.hp,heals:q.heals,frames:q.frames,maxActive:q.maxActive,mismatches:q.mismatches,slots:q.c.orbSlots()}});
                    assert.equal(orb.maxActive,4);assert.equal(orb.hp,22);assert.deepEqual(orb.heals,[3,3,3,3]);assert.deepEqual(orb.mismatches,[]);
                    await page.evaluate(()=>{clarityQa.p.hp=clarityQa.p.maxHp;game.loop.start()});await click('#action-skill-u');
                    await page.waitForFunction(()=>clarityQa.b.actors[0]?.visual.sprite);
                    // Let natural summon/heal feedback finish before the overlap fixture.
                    await page.waitForTimeout(1400);
                    summon=await page.evaluate(async()=>{
                        game.loop.stop();const q=clarityQa,a=q.b.actors[0];
                        q.enemy.x=a.x-q.enemy.width/2;q.enemy.y=a.y-q.enemy.height/2;
                        const{default:Remote}=await import('/src/js/entities/RemotePlayer.js');const remote=new Remote('clarity-ally',q.p.x-130,q.p.y,null);remote.activeClassId='witch';remote.name='테스트 아군';await remote._loadSpriteSheet(game.resources);
                        const ally={id:'summon:clarity-ally:1',ownerId:remote.id,typeId:'slime',x:a.x+80,y:a.y+10,hp:36,maxHp:50,width:32,height:32};remote.classSummons=[ally];remote.summonVisuals=new Map([[ally.id,a.visual]]);q.s.remotePlayers.set(remote.id,remote);q.p.party.members.push(remote.id);
                        const labels=[],ctx=game.ctx,original=ctx.fillText;ctx.fillText=function(text,...args){if(String(text).includes('소환수'))labels.push(text);return original.call(this,text,...args)};
                        q.s.render(ctx);ctx.fillText=original;
                        return{labels,ownerHp:q.p.hp,maxHp:q.p.maxHp,actor:{hp:a.hp,maxHp:a.maxHp,attack:a.attackPower,defense:a.defense,cooldown:a.attackCooldownSeconds},mismatches:q.mismatches};
                    });
                    assert.ok(summon.labels.includes('내 소환수'));assert.ok(summon.labels.includes('아군 소환수'));
                    assert.equal(summon.ownerHp,summon.maxHp*.2);assert.deepEqual(summon.actor,{hp:50,maxHp:50,attack:1,defense:1,cooldown:3});assert.deepEqual(summon.mismatches,[]);
                    await page.screenshot({path:`${out}/${layout}-summon-overlap.png`});
                }
                report.cases.push({layout,id,guide,before,saved,hud,orb,summon});await context.close();console.log(`PASS ${layout}/${id}: growth, cancel/save/reentry, immediate HUD${orb?', four orbs and summon identity':''}`);
            }
        }
        assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
    } finally {fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

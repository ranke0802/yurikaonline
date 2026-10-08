// Controlled renderer fixtures, not a live multiplayer or natural gameplay test.
const { chromium } = require('playwright');
const fs = require('node:fs'), cp = require('node:child_process');
const assert = require('node:assert/strict');
const OUT = process.env.QA_OUTPUT || '/tmp/yurika-character-crispness';
const baseline = process.env.QA_BASELINE_REF;
const replaced = new Set(['src/css/style.css', 'src/js/main.js',
    'src/js/core/CharacterFrameRenderer.js', 'src/js/core/ResourceManager.js', 'src/js/core/Sprite.js',
    'src/js/entities/Player.js', 'src/js/entities/RemotePlayer.js',
    ...['AuthoredCharacterFrames', 'WizardAttackFrames', 'ShieldRush'].map(n => `src/js/combat/${n}.js`)]);
const report = { baseline: baseline || null, scope: 'Same-origin Chromium fixtures: actual local/remote render entry points; no live multiplayer or physical device claim', cases: [], layouts: [], errors: [], external: [] };
fs.mkdirSync(OUT, { recursive: true });
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        for (const [layout, width, height, deviceScaleFactor] of [['desktop',1280,800,1], ['retina',1440,900,2], ['portrait',393,852,3], ['landscape',852,393,3]]) {
            if (process.env.QA_VIEWPORT && layout !== process.env.QA_VIEWPORT) continue;
            const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, isMobile: width < 1024, hasTouch: width < 1024, serviceWorkers: 'block' });
            await context.route('**/*', route => {
                const url = new URL(route.request().url()), path = url.pathname.slice(1);
                if (url.origin !== 'http://127.0.0.1:8100') { report.external.push(url.origin); return route.abort(); }
                if (baseline && replaced.has(path)) return route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : 'text/javascript', body: cp.execFileSync('git', ['show', `${baseline}:${path}`]) });
                return route.continue();
            });
            const page = await context.newPage(); page.setDefaultTimeout(30000);
            page.on('pageerror', e => report.errors.push(e.message));
            await page.goto('http://127.0.0.1:8100/?local=1');
            await page.locator('#camp-name').waitFor();
            const setup = await page.evaluate(async () => {
                game.loop.stop();
                const { default: Player } = await import('/src/js/entities/Player.js');
                const { default: Remote } = await import('/src/js/entities/RemotePlayer.js');
                const { captureProjectileWorldContext } = await import('/src/js/entities/ProjectileWorldContext.js');
                const actors = {};
                for (const id of ['wizard', 'witch', 'warrior', 'archer']) {
                    const local = new Player(0, 0, 'Sampling fixture', { id });
                    local.initializeClassCombat(); await local._loadSpriteSheet(game.resources);
                    const remote = new Remote(`fixture-${id}`, 0, 0, null);
                    remote.activeClassId = id; await remote._loadSpriteSheet(game.resources);
                    remote.classVisuals.context = captureProjectileWorldContext(game);
                    actors[id] = { local, remote };
                }
                const hash = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2,'0')).join('');
                const sheet = actors.wizard.local.sprite.image;
                window.crispQa = { actors, hash };
                const root = document.createElement('div'); root.id = 'sampling-fixture';
                Object.assign(root.style, { position:'fixed', inset:'0', zIndex:'2147483647', overflow:'auto', background:'#24323d', color:'white', font:'13px sans-serif', padding:'10px', boxSizing:'border-box' });
                document.body.append(root);
                return { dpr:game.dpr, deviceDpr:devicePixelRatio, zoom:game.zoom, canvas:[game.canvas.width,game.canvas.height], css:[game.canvas.clientWidth,game.canvas.clientHeight], imageRendering:getComputedStyle(game.canvas).imageRendering, wizardAtlasSmoothing:sheet.getContext('2d').imageSmoothingEnabled, wizardAtlasSha256:await hash(sheet.getContext('2d').getImageData(0,0,sheet.width,sheet.height).data) };
            });
            report.layouts.push({ layout, ...setup });
            if (!baseline) {
                assert.equal(setup.imageRendering, 'pixelated');
                assert.equal(setup.wizardAtlasSmoothing, false, 'Mage runtime atlas must retain nearest sampling');
            }
            for (const classId of ['wizard', 'witch', 'warrior', 'archer']) {
                const cases = await page.evaluate(async classId => {
                    const { actors, hash } = crispQa, pair = actors[classId], results = [];
                    const root = document.querySelector('#sampling-fixture');
                    root.replaceChildren();
                    const title = document.createElement('p'); title.textContent = `${classId} · local / remote · actual CSS size · idle / move / attack / moving attack`; root.append(title);
                    const grid = document.createElement('div'); Object.assign(grid.style, { display:'grid', gridTemplateColumns:`repeat(2, ${160*game.zoom}px)`, gap:'4px' }); root.append(grid);
                    const scaleNow = game.dpr * game.zoom;
                    const scales = [...new Set([scaleNow, 1, 2])];
                    for (const scale of scales) for (const state of ['idle','move','attack','moving-attack']) for (let direction=0; direction<4; direction++) for (let frame=0; frame<6; frame++) {
                        const attacking = state.includes('attack'), moving = state==='move' || state==='moving-attack';
                        for (const [role, actor] of Object.entries(pair)) {
                            Object.assign(actor, { direction, state:attacking?'attack':moving?'move':'idle', isAttacking:attacking, classArtMoving:moving, wizardArtMoving:moving, animTimer:frame, animFrame:state==='idle'?0:frame % actor.frameCounts[direction], wizardGaitAge:(frame+.001)*.12, wizardAttackAge:Math.max(0,frame-2)*.1+.001, hp:100, maxHp:100 });
                            const motion = attacking ? { direction, age:frame<2?frame*.11:Math.max(0,frame-2)*.14+.001, duration:.56, held:frame<2 } : null;
                            if (role==='local') actor.classCombat.currentMotion = () => motion;
                            else actor.classVisuals.motion = motion ? { ...motion, receivedAt:Date.now(), expiresAt:Date.now()+10000 } : null;
                            const canvas = document.createElement('canvas'); canvas.width=canvas.height=Math.ceil(160*scale);
                            const ctx = canvas.getContext('2d'); ctx.setTransform(scale,0,0,scale,56*scale+.3,72*scale+.6);
                            // Start with filtering ON to ensure body renderers explicitly select their own sampling.
                            ctx.imageSmoothingEnabled=true;
                            const body = document.createElement('canvas'); body.width=canvas.width; body.height=canvas.height;
                            const only = body.getContext('2d'), original = ctx.drawImage, calls=[];
                            const images=[actor.sprite.image, actor.wizardAttackImage, (actor.classCombat || actor.classVisuals).images.authored].filter(Boolean);
                            ctx.drawImage=function(image,...args) {
                                if(images.includes(image)) {
                                    const t=this.getTransform();
                                    calls.push({args, transform:[t.a,t.b,t.c,t.d,t.e,t.f], smoothing:this.imageSmoothingEnabled});
                                    only.setTransform(t); only.imageSmoothingEnabled=this.imageSmoothingEnabled;
                                    only.imageSmoothingQuality=this.imageSmoothingQuality;
                                    only.drawImage(image,...args);
                                }
                                return original.call(this,image,...args);
                            };
                            actor.render(ctx,{x:-500,y:-500,width:1000,height:1000});
                            const pixels=only.getImageData(0,0,body.width,body.height).data;
                            results.push({classId,role,state,direction,frame,scale,calls,visible:pixels.some((v,i)=>i%4===3&&v>0),sha256:await hash(pixels),restored:ctx.imageSmoothingEnabled});
                            if (scale===scaleNow && direction===1 && frame===(state==='idle'?0:3)) {
                                const cell=document.createElement('div'), label=document.createElement('div'); label.textContent=`${role} · ${state}`;
                                Object.assign(label.style,{fontSize:'12px',lineHeight:'16px',height:'32px'});
                                Object.assign(body.style,{width:`${160*game.zoom}px`,height:`${160*game.zoom}px`,imageRendering:getComputedStyle(game.canvas).imageRendering});
                                cell.append(label,body); grid.append(cell);
                            }
                        }
                    }
                    return results;
                }, classId);
                for (let i=0; i<cases.length; i+=2) {
                    const local=cases[i], remote=cases[i+1];
                    for (const c of [local,remote]) {
                        assert.equal(c.calls.length,1,JSON.stringify(c)); assert.ok(c.visible,JSON.stringify(c));
                        if (!baseline) assert.ok(c.calls.every(d=>!d.smoothing),JSON.stringify(c));
                        assert.ok(c.restored,`${classId}/${c.role}: body sampling must not leak`);
                    }
                    assert.deepEqual(local.calls,remote.calls,`${classId}: local/remote geometry and sampling`);
                    assert.equal(local.sha256,remote.sha256,`${classId}: local/remote body pixels`);
                }
                report.cases.push(...cases.map(c=>({layout,...c})));
                // Full scrollable fixture capture preserves device scale; no resize or sharpen pass.
                await page.locator('#sampling-fixture').evaluate(e=>{e.style.position='absolute';e.style.inset='auto';e.style.left=e.style.top='0';e.style.height='auto';e.style.overflow='visible';});
                await page.locator('#sampling-fixture').screenshot({path:`${OUT}/${layout}-${classId}-states.png`});
                console.log(`PASS ${layout}/${classId}: ${cases.length} local/remote render samples`);
            }
            // Verify canvas policy survives an actual viewport orientation/size change.
            await page.setViewportSize({width:height,height:width});
            await page.waitForTimeout(150);
            const resized=await page.evaluate(()=>{game.resize();return {imageRendering:game.canvas.style.imageRendering,smoothing:game.ctx.imageSmoothingEnabled,width:game.canvas.width,height:game.canvas.height,dpr:game.dpr};});
            report.layouts.at(-1).resized=resized;
            if(!baseline){assert.equal(resized.imageRendering,'pixelated');assert.equal(resized.smoothing,false);}
            await context.close();
        }
        assert.deepEqual(report.errors,[]); assert.deepEqual(report.external,[]);
    } finally { fs.writeFileSync(`${OUT}/report.json`,JSON.stringify(report,null,2)); await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

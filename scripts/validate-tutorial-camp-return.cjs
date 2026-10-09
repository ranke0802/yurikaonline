require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{const c=await b.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true});
const p=await c.newPage();
p.setDefaultTimeout(10000);
const errors=[];
const external=[];
p.on('pageerror',e=>errors.push(e.message));
await p.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue(); external.push(r.request().url());return r.abort()});
await p.goto('http://127.0.0.1:8100/?local=1');
await p.locator('#camp-name').fill('첫 모험');
await p.locator('[data-camp=create]').tap();
await p.locator('[data-camp=prepare]').tap();
await p.locator('[data-camp=depart]').tap();
await p.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='move_check');
await p.locator('#loading-overlay').waitFor({state:'hidden'});
const boxes=await p.evaluate(()=>{const a=document.querySelector('.camp-return').getBoundingClientRect(),g=document.querySelector('#tutorial-guide').getBoundingClientRect();
return {button:a.toJSON(),guide:g.toJSON(),overlap:Math.max(0,Math.min(a.right,g.right)-Math.max(a.left,g.left))*Math.max(0,Math.min(a.bottom,g.bottom)-Math.max(a.top,g.top))}});
console.log(boxes);
assert.equal(boxes.overlap,0);
await p.locator('.camp-return').tap();
await p.locator('[data-camp=character]').first().waitFor();
await p.locator('[data-camp=prepare]').tap();
await p.locator('[data-camp=depart]').tap();
await p.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='move_check');
await p.locator('#loading-overlay').waitFor({state:'hidden'});
const cdp=await c.newCDPSession(p);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:156,y:288,id:0}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:215,y:288,id:0}]});
// Movement training counts update ticks; keep genuine touch held until the
// training condition completes instead of assuming a fixed frame rate.
try {
await p.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='attack_dummy');
} finally {
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
await p.goBack();
await p.locator('#confirm-no').waitFor();
assert.equal(await p.evaluate(()=>{const r=document.querySelector('.camp-return').getBoundingClientRect();
return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.camp-return')}),false,'confirmation overlay must still block field exit');
await p.locator('#confirm-no').tap();
await p.locator('.camp-return').tap();
await p.locator('[data-camp=character]').first().waitFor();
assert.deepEqual(errors,[]);
assert.deepEqual(external,[]);
console.log('PASS fresh mobile move_check touch return, reentry, real joystick progression to attack_dummy and touch return')}finally{await b.close()}})().catch(e=>{console.error(e);
process.exitCode=1});

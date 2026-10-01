import test from 'node:test';
import assert from 'node:assert/strict';
import AndroidDisplay from '../src/js/ui/AndroidDisplayController.js';
function fixture({standalone=false,fail=false}={}) {
 const listeners={},calls=[];let full=false;
 const document={visibilityState:'visible',addEventListener:(k,f)=>listeners[k]=f,documentElement:{requestFullscreen(){calls.push('fullscreen');if(fail)return Promise.reject(Error('denied'));full=true;return Promise.resolve()}}};
 const env={document,screen:{orientation:{lock:async mode=>calls.push(mode),unlock:()=>calls.push('unlock')}},setTimeout,clearTimeout};
 const ui={getSetting:()=>true,isFullscreenActive:()=>full,isStandaloneDisplayMode:()=>standalone,syncMobileEnvironmentClasses(){},game:{}};
 const c=new AndroidDisplay(ui,env);c.showNotice=message=>calls.push('notice');c.hideNotice=()=>{};c.init();
 return{c,calls,listeners,document,setFull:v=>full=v};
}
test('Android isolation and no fullscreen request on ordinary page load',()=>{assert.equal(AndroidDisplay.supported({userAgent:'Android'}),true);assert.equal(AndroidDisplay.supported({userAgent:'iPhone'}),false);assert.equal(AndroidDisplay.supported({userAgent:'Linux x86'}),false);assert.deepEqual(fixture().calls,[])});
test('trusted start requests synchronously, shares pending work, then locks landscape',async()=>{const f=fixture();f.listeners.click({isTrusted:true,target:{closest:()=>({})}});assert.deepEqual(f.calls,['fullscreen']);const p=f.c.pending;assert.equal(f.c.request(),p);await p;assert.deepEqual(f.calls,['fullscreen','landscape']);assert.equal(f.c.locked,true)});
test('denial offers fallback but never retries arbitrary click or lifecycle events',async()=>{const f=fixture({fail:true});await f.c.request();f.listeners.click({isTrusted:true,target:{closest:()=>({})}});f.document.visibilityState='hidden';f.listeners.visibilitychange();f.document.visibilityState='visible';f.listeners.visibilitychange();assert.deepEqual(f.calls,['fullscreen','notice']);await f.c.request();assert.equal(f.calls.filter(x=>x==='fullscreen').length,2)});
test('fullscreen exit does not immediately reenter or relock',async()=>{const f=fixture();await f.c.request();f.setFull(false);f.listeners.fullscreenchange();assert.equal(f.c.locked,false);assert.equal(f.calls.filter(x=>x==='fullscreen').length,1);assert.equal(f.calls.filter(x=>x==='landscape').length,1)});
test('installed launch skips API fullscreen and attempts orientation once',async()=>{const f=fixture({standalone:true});await f.c.pending;assert.deepEqual(f.calls,['landscape'])});
test('untrusted start and disabled automatic setting do nothing',()=>{const f=fixture();f.listeners.click({isTrusted:false,target:{closest:()=>({})}});f.c.ui.getSetting=()=>false;f.listeners.click({isTrusted:true,target:{closest:()=>({})}});assert.deepEqual(f.calls,[])});
test('unsupported orientation keeps fullscreen and exposes nonblocking retry',async()=>{const f=fixture();f.c.env.screen.orientation.lock=async()=>{throw Error('unsupported')};assert.equal(await f.c.request(),true);assert.equal(f.c.locked,false);assert.deepEqual(f.calls,['fullscreen','notice'])});
test('backgrounding invalidates a pending lock without any automatic reentry',async()=>{const f=fixture();let release;f.c.env.screen.orientation.lock=()=>new Promise(r=>release=r);const request=f.c.request();await Promise.resolve();f.document.visibilityState='hidden';f.listeners.visibilitychange();release();await request;assert.equal(f.c.locked,false);f.document.visibilityState='visible';f.listeners.visibilitychange();assert.deepEqual(f.calls,['fullscreen'])});

import './lib/qa-preflight.cjs';
// Production Firebase 10.7.1 and Player.saveState, isolated loopback RTDB wire.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import NetworkManager from '../src/js/core/NetworkManager.js';
import Player from '../src/js/entities/Player.js';
import {projectClassProfile,attachClassProfile,createClassProfile} from '../src/js/core/ClassProfiles.js';
const require=createRequire(resolve(process.env.YURIKA_FIREBASE_FIXTURE_ROOT||'/tmp/yurika-sdk-fixture','package.json'));
const firebase=require('firebase/compat/app');require('firebase/compat/database');const {Server}=require('ws');
assert.equal(firebase.SDK_VERSION,'10.7.1');
const server=new Server({host:'127.0.0.1',port:0});await new Promise(r=>server.on('listening',r));
const port=server.address().port, records=new Map();let writes=0;
server.on('connection',socket=>{const send=data=>socket.send(JSON.stringify(data));send({t:'c',d:{t:'h',d:{ts:Date.now(),v:'5',h:`127.0.0.1:${port}`,s:'class-exit-fixture'}}});socket.on('message',raw=>{const message=JSON.parse(raw);if(message.t!=='d')return;const{r,a,b}=message.d;
 if(a==='q')send({t:'d',d:{a:'d',b:{p:b.p,d:records.get(b.p)||null}}});
 if(a==='p'){records.set(b.p,b.d);if(b.p.endsWith('/profile'))writes++;}
 send({t:'d',d:{r,b:{s:'ok',d:{}}}});
})});
const app=firebase.initializeApp({projectId:'demo-yurika-exit',databaseURL:'https://demo-yurika-exit.firebaseio.com'},'class-exit');const db=app.database();db.useEmulator('127.0.0.1',port);
const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
globalThis.firebase={database:()=>db};globalThis.localStorage=storage;globalThis.window={firebase:globalThis.firebase,localStorage:storage};
const report=[];const deadline=setTimeout(()=>{console.error('SDK deadline');process.exit(1)},30000);
try{for(const id of ['wizard','witch','warrior','archer'])for(const cache of ['cold','warm']){
 const uid=`exit-${id}-${cache}`,path=`/users/${uid}/profile`;
 const account={name:'fixture',activeClassId:id,level:19,exp:2411,maxExp:147789,manastone:9000,inventory:[{type:'manastone',amount:9000}],equipment:{weapon:null},skillLevels:{fireball:4},currentZoneId:'zone_4',x:722,y:611,_profileRevision:41,unknown:{preserve:1},classProfiles:Object.fromEntries(['witch','warrior','archer'].map(c=>[c,{...createClassProfile(c),level:7,exp:31,maxExp:1000}]))};records.set(path,structuredClone(account));
 const net=new NetworkManager();clearInterval(net._batchTimer);net.playerId=uid;net.connected=true;net.zoneParticipationEnabled=false;
 let subscriptions=0,unsubscriptions=0;const getRef=net.getProfileRef.bind(net);net.getProfileRef=(uid)=>{const ref=getRef(uid),on=ref.on.bind(ref),off=ref.off.bind(ref);ref.on=(...args)=>{subscriptions++;return on(...args)};ref.off=(...args)=>{unsubscriptions++;return off(...args)};return ref};
 window.game={net,ui:{isPaused:true},zone:{currentZone:{id:'zone_1'}}};
 const p=new Player(10,20,'fixture',{id,baseStats:{maxHp:100,maxMp:100,atk:10}});Object.assign(p,projectClassProfile(account));attachClassProfile(p,account);p.id=uid;p.net=net;p.exp+=7;window.game.localPlayer=p;
 const initialRead=await net.getPlayerProfile(uid,{throwOnError:true});
 const listener=()=>{};if(cache==='warm'){db.ref(path).on('value',listener);await db.ref(path).once('value');}
 const start=performance.now(),before=writes;const result=await p.saveState(false,{debounceMs:0,forceImmediate:true,checkpointPolicy:'durable',syncRecoveryProfile:false,reason:'camp_return'});
 const row={id,cache,saveMs:performance.now()-start,ok:result.ok,reason:result.reason,lowerExperienceGuarded:result.lowerExperienceGuarded,writes:writes-before,savedExp:projectClassProfile(records.get(path)).exp,expectedExp:p.exp,rootLevel:records.get(path).level,activeClassId:records.get(path).activeClassId,localCheckpointPersisted:result.localCheckpointPersisted,subscriptions,unsubscriptions};report.push(row);console.log(JSON.stringify(row));
 if(cache==='warm')db.ref(path).off('value',listener);
 if(process.env.QA_CAPTURE_BASELINE!=='1'){assert.equal(result.ok,true);assert.equal(subscriptions,1);assert.equal(unsubscriptions,1);assert.equal(net.getLocalProfilePatchJournal(uid),null);assert.equal(row.savedExp,row.expectedExp);assert.equal(row.rootLevel,id==='wizard'?p.level:19);assert.equal(row.activeClassId,id);assert.deepEqual(records.get(path).unknown,{preserve:1});for(const other of ['witch','warrior','archer'].filter(c=>c!==id))assert.deepEqual(records.get(path).classProfiles[other],initialRead.classProfiles[other]);}
}}finally{writeFileSync(process.env.QA_OUTPUT||'/tmp/class-exit-sdk.json',JSON.stringify(report,null,2));clearTimeout(deadline);db.goOffline();await app.delete();for(const c of server.clients)c.terminate();await new Promise(r=>server.close(r));}

import test from 'node:test';
import assert from 'node:assert/strict';
import Player from '../src/js/entities/Player.js';
import NetworkManager from '../src/js/core/NetworkManager.js';
import LocalNetworkManager from '../src/js/local/LocalNetworkManager.js';

const unknown = '사망 원인: 확인 불가';
function fixture() {
    const events = [];
    globalThis.window = { game: {} };
    const p = new Player(2000, 2000, '검증');
    p.id = 'victim'; p.hp = 20; p.maxHp = 100; p.defense = 3;
    p.spawnProtectionTimer = 0; p.shieldTimer = 0;
    p.saveProfilePatch = (...args) => { events.push(['save', ...args]); return Promise.resolve({ok:true}); };
    p.endAllDuels = reason => events.push(['duels', reason]);
    p.net = {currentHostId:'host', sendPlayerHp:(...a)=>events.push(['hp',...a])};
    const monster = {id:'m1', type:'monster', typeId:'slime', name:'슬라임'};
    const host = {id:'host', type:'player', name:'호스트 이름'};
    const peer = {id:'peer', type:'player', name:'상대'};
    const game = window.game = {
        localPlayer:p, net:p.net, monsterManager:{monsters:new Map([['m1',monster]])},
        remotePlayers:new Map([['host',host],['peer',peer]]),
        ui:{logSystemMessage:s=>events.push(['log',s]), showDeathModal:s=>events.push(['death',s]), updatePartyUI:()=>events.push(['party'])},
        addDamageText:(...a)=>events.push(['text',...a]), sound:{playSfx:s=>events.push(['sound',s])}
    };
    return {p,game,monster,host,peer,events};
}
const fatal=(p,attacker=null)=>p.takeDamage(30,false,false,null,null,attacker);

test('only fatal accepted damage captures the exact monster, not the selected monster',()=>{
    const {p,monster,events}=fixture();p.currentTarget={name:'다른 선택 대상'};
    assert.equal(p.takeDamage(10,false,false,null,null,monster),7);
    assert.equal(p.hp,13);assert.equal(p.deathCauseText,null);
    assert.equal(fatal(p,monster),27);assert.equal(p.hp,0);
    assert.equal(p.deathCauseText,'사망 원인: 슬라임의 공격');
    assert.equal(events.filter(e=>e[0]==='death').length,1);
});
test('source-less damage cannot reuse a previous nonfatal attacker or selected target',()=>{
    const {p,monster}=fixture();p.currentTarget=monster;
    p.takeDamage(4,false,false,null,null,monster);fatal(p);
    assert.equal(p.deathCauseText,unknown);
});
for(const [name,meta,expected] of [
    ['valid monster packet',{monsterId:'m1',monsterType:'slime'},'사망 원인: 슬라임의 공격'],
    ['known instance without type',{monsterId:'m1'},'사망 원인: 슬라임의 공격'],
    ['missing instance',{monsterId:'gone',monsterType:'slime'},unknown],
    ['mismatched type',{monsterId:'m1',monsterType:'king_slime'},unknown],
    ['type only',{monsterType:'slime'},unknown],
    ['empty marker',{monsterId:''},unknown],
    ['null marker',{monsterId:null},unknown],
    ['host sender only',{},unknown],
    ['unverified display name',{name:'가짜 공격원',cause:'burn'},unknown]
])test(`online listener: ${name}`,()=>{
    const {p,game,host}=fixture();let received,removed=0;
    const net=Object.create(NetworkManager.prototype);
    Object.assign(net,{playerId:p.id,currentHostId:host.id,remotePlayers:game.remotePlayers,_isPayloadForCurrentField:()=>true,
        dbRef:{child:()=>({on:(_event,fn)=>{received=fn;}})}});
    net._setupDamageListeners();
    received({val:()=>({ts:Date.now(),damage:30,attackerId:'host',meta}),ref:{remove:()=>removed++}});
    assert.equal(p.deathCauseText,expected);assert.equal(removed,1);
    assert.equal(p.hp,0);
});
test('local monster damage uses the real local adapter, without a new event or attribution packet',()=>{
    const {p,game}=fixture();const net=Object.create(LocalNetworkManager.prototype);
    Object.assign(net,{connected:true,isHost:true,zoneParticipationEnabled:true,playerId:p.id});
    assert.equal(net.sendPlayerDamage(p.id,30,null,0,0,{monsterId:'m1',monsterType:'slime'}),true);
    assert.equal(p.deathCauseText,'사망 원인: 슬라임의 공격');assert.equal(game.localPlayer,p);
});
test('known player name is snapshotted as text; transport-supplied name is ignored',()=>{
    const {p,peer}=fixture();peer.name='<img src=x onerror=alert(1)> & 상대';
    fatal(p,{id:peer.id,type:'player',name:'가짜 이름'});
    assert.equal(p.deathCauseText,'사망 원인: <img src=x onerror=alert(1)> & 상대의 공격');
    peer.name='변경됨';assert.ok(p.deathCauseText.includes('<img'));
});
test('duplicate fatal packets and direct duplicate death keep the captured cause',()=>{
    const {p,monster,peer,events}=fixture();fatal(p,monster);const before=events.length;
    assert.equal(fatal(p,peer),0);assert.equal(events.length,before);
    monster.name='사후 이름';p.die(peer);
    assert.equal(p.deathCauseText,'사망 원인: 슬라임의 공격');
});
for(const mode of ['spawn','shield','modal','rush','zero'])test(`${mode} protection never sets a death cause`,()=>{
    const {p,game,monster}=fixture();
    if(mode==='spawn')p.spawnProtectionTimer=5;
    if(mode==='shield')p.shieldTimer=3;
    if(mode==='modal')game.ui.isPaused=true;
    if(mode==='rush')p.classCombat={controller:{isShieldRushBlocking:()=>true,shieldBlockFeedback(){}}};
    if(mode==='zero')p.classCombat={controller:{},modifyIncomingDamage:()=>0};
    assert.equal(fatal(p,monster),0);assert.equal(p.hp,20);assert.equal(p.isDead,false);assert.equal(p.deathCauseText,null);
});
test('damage, defense, crit, HP/save order and RNG are unchanged',()=>{
    const {p,monster,events}=fixture(),random=Math.random;let randomCalls=0;
    Math.random=()=>{randomCalls++;return .5;};
    try{assert.equal(p.takeDamage(30,true,true,null,null,monster),27);}finally{Math.random=random;}
    assert.equal(randomCalls,0);
    assert.deepEqual(events.filter(e=>['hp','save','duels'].includes(e[0])),[
        ['hp',0,100],['save',['hp'],{debounceMs:5200,reason:'damage_hp_patch',checkpointPolicy:'transient',syncRecoveryProfile:false}],
        ['hp',0,100,{force:true}],['duels','death'],['save',['hp'],{debounceMs:0,reason:'death_hp_patch',checkpointPolicy:'transient',syncRecoveryProfile:false}]
    ]);
    assert.equal(events.find(e=>e[0]==='text')[3],'-27');
});
test('respawn clears only the transient cause and a later unknown death cannot retain it',async()=>{
    const {p,monster,game}=fixture();fatal(p,monster);
    p.initializeClassCombat=()=>{};p.saveState=()=>{};p.grantSpawnProtection=()=>{};
    p.net=null;game.ui.hideDeathModal=()=>{};game.ui.updateStatusPopup=()=>{};
    await p.respawn();assert.equal(p.deathCauseText,null);assert.equal(p.hp,p.maxHp);assert.equal(p.mp,p.maxMp);
    p.hp=1;fatal(p);assert.equal(p.deathCauseText,unknown);
});

test('fatal source is captured before HP synchronization can remove or rename it',()=>{
    const {p,monster,game}=fixture();
    p.net.sendPlayerHp=()=>{monster.name='동기화 후 이름';game.monsterManager.monsters.clear();};
    fatal(p,monster);assert.equal(p.deathCauseText,'사망 원인: 슬라임의 공격');
});

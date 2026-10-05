const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async function(p,out,orientation){
 await p.evaluate(async()=>{
  const q=qa,M=(await import('/src/js/entities/Monster.js')).default;
  q.s._clearTransientWorldEffects();game.monsterManager.monsters.clear();q.bridge.actors=[];q.mobs=[];
  const tag=(obj,key,id,role)=>{const old=obj[key];obj[key]=function(...a){const owner=q.owner,r=q.role;q.owner=id;q.role=role;try{return old.apply(this,a)}finally{q.owner=owner;q.role=r}}};
  for(const type of ['slime','king_slime','slime']){
   const m=new M(q.p.x+200,q.p.y+100,await game.monsterData.loadDefinition(type));m.id='foot-'+q.mobs.length;m.isLocalOnly=true;await m.init(m.assetPath);q.mobs.push(m);game.monsterManager.monsters.set(m.id,m);tag(m,'render',m.id,'monster');tag(m,'renderGroundGuides',m.id,'warning');
  }
  q.bridge.definitions.set('slime',await game.monsterData.loadDefinition('slime'));
  const a=q.bridge.summon('slime',1);if(!a)throw Error('No summon');await a.visual.init(a.visual.assetPath);q.footSummon=a;
  q.p.currentTargetMode='manual';
  // These are synthetic view positions only. Product camera/update rules are untouched.
  q.s.camera.x=q.p.x-200;q.s.camera.y=q.p.y-150;
 });
 const results=[];
 const scenarios=[
  {name:'single-room',count:1,room:62},
  {name:'seven-room',count:7,room:62},
  {name:'seven-wrap',count:7,room:42},
  {name:'thirteen-wrap',count:13,room:68},
  {name:'safe-bottom',count:7,room:42,inset:24},
  {name:'left-corner',count:7,room:62,side:'left',inset:24},
  {name:'right-corner',count:7,room:62,side:'right',inset:24},
  {name:'large-boss',count:7,room:42,boss:true,inset:24},
  {name:'summon-near',count:7,room:62,near:true,inset:24},
  {name:'camera-origin',count:7,room:42,boundary:'origin',inset:24},
  {name:'camera-end',count:7,room:42,boundary:'end',inset:24},
  {name:'toolbar-no-room',count:7,room:42,inset:24,screen:true},
  {name:'too-shallow',count:7,room:20,inset:24},
  {name:'target-switch',count:7,room:62,switch:true},
  {name:'death',count:7,room:62,dead:true},
  {name:'removed',count:7,room:62,remove:true},
  {name:'menu-move',count:7,room:42,inset:24,moveMenu:true},
  {name:'rotation',count:7,room:42,inset:24,rotate:true}
 ];
 for(const scenario of scenarios){
  if(scenario.rotate){await p.setViewportSize(orientation==='portrait'?{width:844,height:390}:{width:390,height:844});await p.waitForFunction(()=>Math.abs(game.canvas.getBoundingClientRect().width-window.innerWidth)<1);}
  const result=await p.evaluate(async s=>{
   const q=qa,{monsterHudBody}=await import('/src/js/ui/MonsterHudLayout.js');
   const root=document.documentElement;root.style.setProperty('--safe-area-bottom',`${s.inset||0}px`);
   if(s.side){root.style.setProperty('--safe-area-left','12px');root.style.setProperty('--safe-area-right','12px');}else{root.style.setProperty('--safe-area-left','0px');root.style.setProperty('--safe-area-right','0px');}
   game.resize();
   if(s.moveMenu)game.ui.applyUiLayoutControl('quick-menu-panel',{left:.35,top:.82,scale:.86});
   q.s.camera.x=q.p.x-200;q.s.camera.y=q.p.y-150;
   if(s.boundary){q.s.camera.x=q.s.camera.y=s.boundary==='origin'?-10000:10000;q.s.camera.clampToBounds();}
   const cam=q.s.camera.getPosition(),canvas=game.canvas.getBoundingClientRect(),pixels=canvas.width/(game.canvas.width/(game.zoom*game.dpr));
   const viewport={left:cam.x+4+(s.side?12/pixels:0),right:cam.x+canvas.width/pixels-4-(s.side?12/pixels:0),bottom:cam.y+(canvas.height-(s.inset||0))/pixels-4};
   const m=q.mobs[s.boss?1:0],other=q.mobs[s.boss?0:1];m.isDead=!!s.dead;m.deathTimer=s.dead?.1:0;m.alpha=1;m.hp=m.maxHp=1200;m.statusEffects=[];m.classStatuses={};m.electrocutedTimer=0;
   const classTypes=['poison','stun','mark','root','berserk','rage','stagger','taunt','bloodPact','empowered'];
   if(s.count===1)m.classStatuses.poison={remaining:3,stacks:12};else{
    m.statusEffects=[{type:'burn',timer:3},{type:'shield',timer:3}];m.electrocutedTimer=2;
    m.classStatuses=Object.fromEntries(classTypes.slice(0,s.count-3).map(type=>[type,{remaining:3,stacks:type==='poison'?12:0}]));
   }
   m.x=s.side==='left'?viewport.left+35:s.side==='right'?viewport.right-35:(viewport.left+viewport.right)/2;
   const menu=document.querySelector('.minimap-menu'),mr=menu?.getBoundingClientRect();
   const occlusions=mr?.width&&mr.top>canvas.top+canvas.height/2?[{left:mr.left-4*pixels,right:mr.right+4*pixels,top:mr.top-4*pixels,bottom:mr.bottom+4*pixels}]:[];
   let availableBottom=viewport.bottom;
   const centerCss=canvas.left+(m.x-cam.x)*pixels;
   if(!s.screen)for(const b of occlusions)if(centerCss+85*pixels>b.left&&centerCss-85*pixels<b.right)availableBottom=Math.min(availableBottom,cam.y+(b.top-canvas.top)/pixels);
   m.y=availableBottom-s.room-m.height/2;
   // Account for the actual sprite grounding when testing the available foot space.
   m.y-=Math.max(0,monsterHudBody(m).bottom-(m.y+m.height/2));
   other.x=cam.x+90;other.y=cam.y+70;other.statusEffects=[];other.classStatuses={};other.electrocutedTimer=0;
   const neighbor=q.mobs[2];neighbor.x=m.x+(s.near?45:190);neighbor.y=m.y+(s.near?30:-150);neighbor.statusEffects=[];neighbor.classStatuses={};
   q.footSummon.x=m.x+(s.near?-30:160);q.footSummon.y=m.y+(s.near?45:-130);
   game.monsterManager.monsters.set(m.id,m);q.p.currentTarget=s.switch?neighbor:m;
   if(s.remove){game.monsterManager.monsters.delete(m.id);q.p.currentTarget=null;}
   const before=JSON.stringify({m:{x:m.x,y:m.y,hp:m.hp,status:m.classStatuses,effects:m.statusEffects,dead:m.isDead},camera:cam,player:{hp:q.p.hp,mp:q.p.mp},target:q.p.currentTarget?.id});
   const records=q.capture();
   const after=JSON.stringify({m:{x:m.x,y:m.y,hp:m.hp,status:m.classStatuses,effects:m.statusEffects,dead:m.isDead},camera:q.s.camera.getPosition(),player:{hp:q.p.hp,mp:q.p.mp},target:q.p.currentTarget?.id});
   const css={left:canvas.left+(viewport.left-cam.x)*pixels,right:canvas.left+(viewport.right-cam.x)*pixels,bottom:canvas.top+(viewport.bottom-cam.y)*pixels};
   const body=monsterHudBody(m),footY=canvas.top+(Math.max(m.y+m.height/2,body.bottom)-cam.y)*pixels;
   const mine=records.filter(r=>r.owner===m.id),icons=mine.filter(r=>r.kind==='legacy-status'||r.kind==='status'&&!r.text),labels=mine.filter(r=>r.kind==='status'&&r.text);
   const outside=r=>r.box.left<css.left-.01||r.box.right>css.right+.01||r.box.bottom>css.bottom+.01||occlusions.some(b=>Math.min(b.right,r.box.right)>Math.max(b.left,r.box.left)+.01&&Math.min(b.bottom,r.box.bottom)>Math.max(b.top,r.box.top)+.01);
   return {scenario:s.name,input:s,unchanged:before===after,viewport:css,occlusions,availableBottom,footY,icons:icons.length,labels:labels.map(r=>r.text),clippedIcons:icons.filter(outside).length,clippedLabels:labels.filter(outside).length,below:icons.every(r=>r.box.top>=footY),records:mine,allRecords:records,body,worldViewport:viewport,m:{id:m.id,x:m.x,y:m.y},pixels,target:q.p.currentTarget?.id,camera:cam};
  },scenario);
  assert.equal(result.unchanged,true,scenario.name+' mutated game/camera');
  assert.equal(result.icons,scenario.dead||scenario.remove?0:scenario.count,scenario.name+' lost icons');
  assert.equal(result.below,true,scenario.name+' moved status above body');
  if(!scenario.dead&&!scenario.remove)assert.ok(result.labels.includes('12'),'poison stacks retained');
  if(scenario.count>1&&!scenario.dead&&!scenario.remove)assert.ok(result.labels.includes('기절'),'stun label retained');
  if(!process.env.QA_FOOT_BASELINE&&!['too-shallow','toolbar-no-room'].includes(scenario.name)){assert.equal(result.clippedIcons,0,`${orientation}/${scenario.name}: avoidable icon clipping`);assert.equal(result.clippedLabels,0,`${orientation}/${scenario.name}: avoidable label clipping`);}
  results.push(result);await p.screenshot({path:`${out}/${orientation}-foot-${scenario.name}.png`});
 }
 await p.setViewportSize(orientation==='portrait'?{width:390,height:844}:{width:844,height:390});
 const transition=await p.evaluate(async()=>{game.ui.applyActiveUiLayout();document.documentElement.style.setProperty('--safe-area-bottom','0px');document.documentElement.style.setProperty('--safe-area-left','0px');document.documentElement.style.setProperty('--safe-area-right','0px');game.resize();const ids=qa.mobs.map(m=>m.id);const changed=await qa.s.changeZone('zone_1');const records=qa.capture();return{changed,stale:records.filter(r=>ids.includes(r.owner)).length,target:qa.p.currentTarget??null};});
 assert.equal(transition.changed,true);assert.equal(transition.stale,0);assert.equal(transition.target,null);
 fs.writeFileSync(`${out}/${orientation}-foot.json`,JSON.stringify({results,transition},null,2));
 console.log(JSON.stringify({orientation,footCases:results.map(r=>({name:r.scenario,icons:r.icons,clipped:r.clippedIcons,labelClipped:r.clippedLabels})),transition}));
};

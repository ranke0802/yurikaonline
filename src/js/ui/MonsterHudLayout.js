import { monsterFootRows, footCandidateOffsets, footClippedArea } from './MonsterFootPlacement.js';
import { monsterStatusBadgeLayout } from '../combat/MonsterStatusBadges.js';

const rect = (x,y,w,h) => ({left:x,top:y,right:x+w,bottom:y+h});
const intersection = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));

// Read-only geometry: use the same atlas grounding as Monster.render.
export function monsterHudBody(m) {
    const x=Math.round(m.x),y=Math.round(m.y),w=m.renderWidth||m.width,h=m.renderHeight||m.height;
    const fh=m.atlasFrameHeight||m.spriteSheetDefinition?.frameHeight||h;
    const fw=m.spriteSheetDefinition?.frameWidth||w,b=m.spriteContentBounds;
    const top=Math.max(0,Math.min(fh,Number(b?.top)||0));
    const bottom=Math.max(top,Math.min(fh,Number(b?.bottom)||fh));
    const sy=m.usesV2Atlas?y+(m.renderOffY||0)+m.height/2-h+(m.alignSpriteContentToGround?(fh-bottom)/fh*h:0):y+(m.renderOffY||0)-h/2;
    return m.usesV2Atlas?rect(x-w/2+(b?.left||0)/fw*w,sy+top/fh*h,((b?.right||fw)-(b?.left||0))/fw*w,(bottom-top)/fh*h):rect(x-w/2,sy,w,h);
}

// Read warning geometry only; never alter its cast timing, direction or drawing.
function warningEdges(monsters) {
    const edges=[];
    const lane=(x,y,tx,ty,width)=>{
        const dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy);if(len<1)return;
        const half=Math.max(12,width)/2,nx=-dy/len*half,ny=dx/len*half;
        const points=[[x+nx,y+ny],[tx+nx,ty+ny],[tx-nx,ty-ny],[x-nx,y-ny]];
        points.forEach((p,i)=>edges.push([p,points[(i+1)%4]]));
    };
    for(const m of monsters){
        if(m.isDead)continue;
        if(m.chargeState==='casting'&&m.chargeTarget)lane(m.x,m.y,m.chargeTarget.x,m.chargeTarget.y,Math.max(m.width,Number(m.behavior?.charge?.visual?.telegraphWidth)||0));
        for(const t of m.activeBossTelegraphs||[])for(const z of t.zones||[]){
            if(z.shape==='line')lane(z.x1,z.y1,z.x2,z.y2,z.width);
            else for(const radius of z.shape==='donut'?[z.innerRadius,z.outerRadius]:[z.radius]){
                // Short segments provide a conservative visible boundary obstacle.
                for(let i=0;i<32;i++)edges.push([[z.x+radius*Math.cos(i*Math.PI/16),z.y+radius*Math.sin(i*Math.PI/16)],[z.x+radius*Math.cos((i+1)*Math.PI/16),z.y+radius*Math.sin((i+1)*Math.PI/16)]]);
            }
        }
    }
    return edges;
}
function crosses(box,[[x,y],[tx,ty]]) {
    let lo=0,hi=1;const dx=tx-x,dy=ty-y;
    for(const [p,q]of [[-dx,x-box.left],[dx,box.right-x],[-dy,y-box.top],[dy,box.bottom-y]]){
        if(Math.abs(p)<1e-9){if(q<0)return false;}
        else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);
    }
    return hi>lo;
}

// Small, deterministic displacements only. No retained monster state or global
// label lanes: dense crowds may still overlap rather than detach ownership.
export function layoutMonsterHud(ctx, monsters, {bodies=[],viewport=null,footViewport=viewport,selected=null}={}) {
    const result=new Map(),occupied=[],edges=warningEdges(monsters);
    const ordered=[...monsters].filter(m=>m.deathTimer<m.deathDuration||m.deathTimer==null)
        .sort((a,b)=>(b===selected)-(a===selected)||a.y-b.y||a.x-b.x||String(a.id).localeCompare(String(b.id)));
    const obstacles=monsters.filter(m=>!m.isDead).map(m=>({...monsterHudBody(m),weight:m===selected?16:8}));
    obstacles.push(...bodies.map(b=>({...b,weight:60})));
    function place(x,y,w,h,below=false,guarded=false) {
        let best=null;
        const bounds=guarded?footViewport:viewport;
        const offsets=guarded?footCandidateOffsets(x,y,w,h,bounds):{dx:[0,-12,12,-24,24],dy:[0,12,24]};
        for(const dy of offsets.dy)for(const dx of offsets.dx){
            const px=x+dx,py=y+(below?dy:-dy),box=rect(px-w/2,py,w,h);
            const offscreen=guarded?footClippedArea(box,bounds):bounds?Math.max(0,w*h-intersection(box,bounds)):0;
            const body=obstacles.reduce((n,b)=>n+intersection(box,b)*b.weight,0);
            const labels=occupied.reduce((n,b)=>n+intersection(box,{left:b.left-3,top:b.top-3,right:b.right+3,bottom:b.bottom+3}),0);
            const warning=edges.reduce((n,e)=>n+Number(crosses(box,e)),0);
            const score=body+labels*30+offscreen*20+warning*1500+Math.abs(dx)*2+dy*3;
            if(!best||(guarded&&offscreen<best.offscreen-.001)||((!guarded||Math.abs(offscreen-best.offscreen)<.001)&&score<best.score))best={x:px,y:py,box,score,offscreen};
        }
        occupied.push(best.box);return best;
    }
    ctx.save();
    for(const m of ordered){
        const body=monsterHudBody(m),x=Math.round(m.x),y=Math.round(m.y);
        ctx.font=`bold ${m.isBoss?16:13}px "Outfit", sans-serif`;
        const fontHeight=m.isBoss?18:15,width=ctx.measureText(m.name).width+4;
        const head=place(x,Math.min(y-m.height/2,body.top)-fontHeight-5,width,fontHeight);
        const legacy=!m.isDead&&(m.statusEffects?.some(e=>e.type==='burn')||m.electrocutedTimer>0)
            ? [...(m.statusEffects?.some(e=>e.type==='burn')?['burn']:[]),...(m.electrocutedTimer>0?['elec']:[]),...(m.hasEffect?.('shield')?['shield']:[])]:[];
        const statuses=monsterStatusBadgeLayout(m),count=legacy.length+statuses.length;
        const rows=monsterFootRows(m,body,count,footViewport);
        const foot=place(x,rows.y,rows.width,rows.height,true,rows.guarded);
        const cells=Array.from({length:count},(_,i)=>{const row=Math.floor(i/rows.columns),n=Math.min(rows.columns,count-row*rows.columns);return{x:foot.x+(i%rows.columns-(n-1)/2)*25-10,y:foot.y+rows.offset+row*25};});
        result.set(m,{nameX:head.x,nameY:head.y+fontHeight,hpX:foot.x-30,hpY:foot.y,aggroX:head.x,aggroY:head.y-5,
            legacy:legacy.map((type,i)=>({type,...cells[i]})),statuses:statuses.map((s,i)=>({...s,...cells[legacy.length+i]}))});
    }
    ctx.restore();return result;
}

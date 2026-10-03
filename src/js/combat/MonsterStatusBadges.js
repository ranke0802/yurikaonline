import { getSharedResourceManager } from '../core/ResourceManager.js';
const SLOTS={poison:0,berserk:1,rage:2,mark:3,root:4,stun:4,stagger:4,taunt:5,bloodPact:6,empowered:7};
export function monsterStatusBadgeLayout(monster) {
    if(monster.isDead)return [];
    const types=Object.keys(monster.classStatuses||{}).filter(t=>t in SLOTS&&monster.classStatuses[t].remaining>0);
    const legacy=monster.statusEffects?.some(e=>e.type==='burn')||monster.electrocutedTimer>0;
    return types.map((type,i)=>{const row=Math.floor(i/4),count=Math.min(4,types.length-row*4);return {type,index:SLOTS[type],x:monster.x+(i%4-(count-1)/2)*25-10,y:monster.y+(monster.height||64)/2+15+(legacy?25:0)+row*25,size:20,count:monster.classStatuses[type].stacks||0};});
}
export function drawMonsterStatusBadges(ctx,monster,image) {
    const layout=monsterStatusBadgeLayout(monster);if(!layout.length)return;
    if(!image){const resources=getSharedResourceManager();image=resources?.getImage?.('assets/resource/classes/status.webp');if(!image){resources?.loadImage('assets/resource/classes/status.webp').catch(()=>{});return;}}
    for(const b of layout){const w=image.width/4,h=image.height/2;ctx.drawImage(image,b.index%4*w,Math.floor(b.index/4)*h,w,h,b.x,b.y,b.size,b.size);
        const label=b.type==='stun'?'기절':b.type==='stagger'?'경직':b.count>0?String(b.count):'';
        if(label){ctx.save();ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.lineWidth=2;ctx.strokeStyle='#17212c';ctx.fillStyle='white';ctx.strokeText(label,b.x+10,b.y+20);ctx.fillText(label,b.x+10,b.y+20);ctx.restore();}
    }
}

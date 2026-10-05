const intersection=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
export function footClippedArea(box,viewport) {
    if(!viewport)return 0;
    return Math.max(0,(box.right-box.left)*(box.bottom-box.top)-intersection(box,viewport))
        +(viewport.occlusions||[]).reduce((sum,b)=>sum+intersection(box,b),0);
}

// Status cells keep their authored 20px size and 25px pitch. Only a footer
// touching the safe viewport is eligible for compact rows or bounded clamping.
export function monsterFootRows(monster, body, count, viewport) {
    const x=Math.round(monster.x),y=Math.max(Math.round(monster.y)+monster.height/2,body.bottom)+5;
    const geometry=(columns,offset,tail=0)=>({columns,offset,y,width:Math.max(60,Math.min(columns,count)*25-5),height:count?offset+Math.ceil(count/columns)*25-5+tail:6});
    const original=geometry(4,10);
    const guarded=!!count&&!!viewport&&footClippedArea({left:x-original.width/2-24,right:x+original.width/2+24,top:y,bottom:y+original.height+27},viewport)>0;
    if(!guarded)return {...original,guarded:false};
    // Reserve descenders and the 1px text outline below the last icon row.
    // At most 48px of extra width on each side of the body, capped at 7 cells.
    const maxColumns=Math.min(7,Math.max(4,Math.floor((Math.max(95,body.right-body.left+96)+5)/25)));
    let best=null;
    for(let columns=4;columns<=maxColumns;columns++)for(const offset of [10,9,8]){
        const g=geometry(columns,offset,3);
        const offsets=footCandidateOffsets(x,y,g.width,g.height,viewport);
        let clipped=Infinity;
        for(const dx of offsets.dx)for(const dy of offsets.dy)clipped=Math.min(clipped,footClippedArea({left:x+dx-g.width/2,right:x+dx+g.width/2,top:y+dy,bottom:y+dy+g.height},viewport));
        if(clipped<.001)return {...g,guarded:true};
        if(!best||clipped<best.clipped)best={...g,clipped};
    }
    // Physically insufficient space: retain every cell below its owner, with
    // the least clipping attainable inside the same 24px anchor limit.
    return {...best,guarded:true};
}

export function footCandidateOffsets(x,y,width,height,viewport) {
    const dx=[0,-12,12,-24,24],dy=[0,12,24];
    if(viewport){
        dx.push(Math.max(-24,Math.min(24,viewport.left+width/2-x)),Math.max(-24,Math.min(24,viewport.right-width/2-x)));
        dy.push(Math.max(0,Math.min(24,viewport.bottom-y-height)));
        for(const b of viewport.occlusions||[]){
            dx.push(Math.max(-24,Math.min(24,b.left-width/2-x)),Math.max(-24,Math.min(24,b.right+width/2-x)));
            dy.push(Math.max(0,Math.min(24,b.top-y-height)));
        }
    }
    return {dx:[...new Set(dx)],dy:[...new Set(dy)]};
}

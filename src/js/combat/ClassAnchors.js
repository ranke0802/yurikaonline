// Player coordinates are its collision box top-left; monsters use world centers.
// All class targeting uses this explicit conversion, never an implicit offset.
export function combatCenter(owner) {
    return {x:owner.x+(Number(owner.width)||48)/2,y:owner.y+(Number(owner.height)||48)/2};
}
export function facingDirection(owner,target) {
    const c=combatCenter(owner),dx=(target?.x??c.x)-c.x,dy=(target?.y??c.y)-c.y;
    if(Math.hypot(dx,dy)<.001)return Number.isInteger(owner.direction)?owner.direction:1;
    return Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?0:1);
}
export function attackAnchor(owner,target,kind) {
    const c=combatCenter(owner),direction=facingDirection(owner,target);
    // Authored release hands relative to the collision-box center. Up/down
    // projections retain a lateral hand offset; side release extends forwards.
    const hands=kind==='poison_potion'?[[35,-37],[-18,-15],[-33,-24],[33,-24]]
        :owner.classId==='warrior'?[[16,-37],[-12,-8],[-25,-20],[25,-20]]
        :owner.classId==='archer'?[[ -15,-32],[15,-8],[-35,-22],[35,-22]]
        :[[ -10,-31],[12,-9],[-32,-24],[32,-24]];
    const [x,y]=hands[direction]||hands[1];return {x:c.x+x,y:c.y+y};
}

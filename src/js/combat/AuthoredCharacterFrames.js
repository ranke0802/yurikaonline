// Approved full-body frames. Native pixel size and fixed foot pivot; no alpha-fit.
export const CLASS_BODY = Object.freeze({
    witch: Object.freeze({width:120,height:120,pivotX:60,pivotY:112,frames:4,frameSeconds:.140,scale:1}),
    warrior: Object.freeze({width:180,height:144,pivotX:90,pivotY:132,frames:4,frameSeconds:.150,scale:1}),
    archer: Object.freeze({width:192,height:144,pivotX:96,pivotY:132,frames:4,frameSeconds:.140,scale:1})
});
export const WITCH_AUTHORED_FRAME = CLASS_BODY.witch;
export const classRuntimePath = id => `assets/resource/classes/approved/${id}-runtime.webp`;
export const classArtPath = name => `assets/resource/classes/approved/${name}.webp`;
const phaseAt = (age, seconds) => Math.floor((age * 1000 + 1e-7) / (seconds * 1000)) % 4;
export function advanceAuthoredGait(owner, dt) {
    const spec=CLASS_BODY[owner.classId || owner.activeClassId];if(!spec)return;
    const previous=owner._classAnimationPosition;
    const distance=previous?Math.hypot(owner.x-previous.x,owner.y-previous.y):0;
    owner._classAnimationPosition={x:owner.x,y:owner.y};
    owner.classArtMoving=distance>0 && distance<80 || !previous && owner.state==='move';
    // A separate locomotion clock survives attacks and facing changes. Blocked
    // movement cannot run feet. Teleports cannot fast-forward a walking cycle.
    if(owner.classArtMoving)owner.animTimer=((owner.animTimer||0)+Math.min(.25,Math.max(0,dt))/spec.frameSeconds)%4;
    else if(owner.state!=='move')owner.animTimer=0;
    owner.animFrame=Math.floor(owner.animTimer+1e-9)%4;
}
function drawRow(image,ctx,spec,row,frame,footX,footY) {
    if(!image || image.width!==spec.width*4 || image.height%spec.height!==0
        || !Number.isInteger(row) || row<0 || (row+1)*spec.height>image.height)return false;
    const smoothing=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=false;
    ctx.drawImage(image,frame*spec.width,row*spec.height,spec.width,spec.height,
        footX-spec.pivotX,footY-spec.pivotY,spec.width,spec.height);
    ctx.imageSmoothingEnabled=smoothing;return true;
}
export function sampleAuthoredBody(owner,motion) {
    const spec=CLASS_BODY[owner.classId || owner.activeClassId];if(!spec)return null;
    const moving=owner.classArtMoving===true;
    const attacking=!!motion;
    const rawDirection=attacking?motion.direction:owner.direction;
    const direction=Number.isInteger(rawDirection)&&rawDirection>=0&&rawDirection<4?rawDirection:1;
    const state=attacking?(moving?2:1):0;
    const frame=moving?Math.floor((owner.animTimer||0)+1e-9)%4:attacking&&!motion.held?phaseAt(Math.max(0,motion.age||0),spec.frameSeconds):0;
    return {row:state*4+direction,frame,spec,moving,state};
}
export function drawAuthoredClassBody(image,owner,motion,ctx,x,y) {
    const pose=sampleAuthoredBody(owner,motion);if(!pose)return false;
    return drawRow(image,ctx,pose.spec,pose.row,pose.frame,x+60,y+112);
}
export function drawAuthoredWitchRow(image,ctx,{row,age,footX,footY}={}) {
    if(![age,footX,footY].every(Number.isFinite)||age<0)return false;
    return drawRow(image,ctx,CLASS_BODY.witch,row,phaseAt(age,.140),footX,footY);
}

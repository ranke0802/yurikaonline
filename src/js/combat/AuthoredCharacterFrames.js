// Approved full-body frames. Uniform display scale and fixed foot pivot; no per-frame alpha-fit.
const bodySpec = seconds => Object.freeze({width:256,height:256,pivotX:128,pivotY:236,frames:6,frameSeconds:seconds,scale:120/256});
export const CLASS_BODY = Object.freeze({witch:bodySpec(.140),warrior:bodySpec(.150),archer:bodySpec(.140)});
export const MAGE_STYLE_ROOT = 'assets/resource/classes/mage-style-v159';
export const wizardAttackPath = `${MAGE_STYLE_ROOT}/mage-original-style-attacks-1536x2048.webp`;
export const classFrontPath = id => `${MAGE_STYLE_ROOT}/${id}-front-256.webp`;
export const WITCH_AUTHORED_FRAME = CLASS_BODY.witch;
export const classRuntimePath = id => `${MAGE_STYLE_ROOT}/${id}-runtime.webp`;
export const classArtPath = name => `${/^(witch|warrior|archer)-body$/.test(name)?MAGE_STYLE_ROOT:"assets/resource/classes/approved"}/${name}.webp`;
const phaseAt = (age, seconds) => Math.floor((age * 1000 + 1e-7) / (seconds * 1000)) % 6;
export function advanceAuthoredGait(owner, dt) {
    const spec=CLASS_BODY[owner.classId || owner.activeClassId];if(!spec)return;
    const previous=owner._classAnimationPosition;
    const distance=previous?Math.hypot(owner.x-previous.x,owner.y-previous.y):0;
    owner._classAnimationPosition={x:owner.x,y:owner.y};
    owner.classArtMoving=distance>0 && distance<80 || !previous && owner.state==='move';
    // A separate locomotion clock survives attacks and facing changes. Blocked
    // movement cannot run feet. Teleports cannot fast-forward a walking cycle.
    if(owner.classArtMoving)owner.animTimer=((owner.animTimer||0)+Math.min(.25,Math.max(0,dt))/spec.frameSeconds)%6;
    else if(owner.state!=='move')owner.animTimer=0;
    owner.animFrame=Math.floor(owner.animTimer+1e-9)%6;
}
function drawRow(image,ctx,spec,row,frame,footX,footY) {
    if(!image || image.width!==spec.width*spec.frames || image.height%spec.height!==0
        || !Number.isInteger(row) || row<0 || (row+1)*spec.height>image.height)return false;
    const smoothing=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=false;
    ctx.drawImage(image,frame*spec.width,row*spec.height,spec.width,spec.height,
        footX-spec.pivotX*spec.scale,footY-spec.pivotY*spec.scale,spec.width*spec.scale,spec.height*spec.scale);
    ctx.imageSmoothingEnabled=smoothing;return true;
}
export function sampleAuthoredBody(owner,motion) {
    const spec=CLASS_BODY[owner.classId || owner.activeClassId];if(!spec)return null;
    const moving=owner.classArtMoving===true;
    const attacking=!!motion;
    const rawDirection=attacking?motion.direction:owner.direction;
    const direction=Number.isInteger(rawDirection)&&rawDirection>=0&&rawDirection<4?rawDirection:1;
    const state=attacking?(moving?2:1):0;
    const frame=moving?Math.floor((owner.animTimer||0)+1e-9)%6:attacking&&!motion.held?Math.min(5,2+Math.floor(Math.max(0,motion.age||0)/Math.max(.001,motion.duration||spec.frameSeconds*4)*4)):attacking&&motion.held?Math.min(1,Math.floor(Math.max(0,motion.age||0)/.1)):0;
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

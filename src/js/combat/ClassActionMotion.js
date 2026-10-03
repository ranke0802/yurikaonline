import { CLASS_BODY } from './AuthoredCharacterFrames.js';
// Authored body poses: preparation, contact/release, follow-through, recovery.
// Contact is frame 1 immediately: Witch tap must never gain an animation delay.
export function actionRow(classId, kind, data = {}) {
    if (kind === 'finale') return 1;
    if (kind === 'basic') return data.aimed ? 1 : 0;
    const rows = { witch: {1:2,2:3,3:2}, warrior:{1:2,2:3,3:2}, archer:{1:2,2:3,3:1} };
    return rows[classId]?.[data.slot] ?? 0;
}
export function createActionMotion(classId, kind, data, time, id) {
    return { id, row:actionRow(classId,kind,data), direction:data.direction??1, started:time,
        duration:CLASS_BODY[classId] ? CLASS_BODY[classId].frameSeconds*4 : Math.max(.20,Math.min(.42,Number(data.interval)||.36)), age:0, held:false };
}
export function sampleActionMotion(motion) {
    if (!motion || !Number.isInteger(motion.row) || motion.row<0 || motion.row>3) return null;
    if (motion.held) return {row:motion.row,frame:0};
    if (!Number.isFinite(motion.age)||!Number.isFinite(motion.duration)||motion.duration<=0||motion.age>=motion.duration) return null;
    return {row:motion.row,frame:Math.min(3,1+Math.floor(Math.max(0,motion.age)/motion.duration*3))};
}
export function drawActionBody(image,motion,ctx,x,y,width,height) {
    const pose=sampleActionMotion(motion);if(!image||!pose)return false;
    const directional=image.height===image.width*4;
    const direction=Number.isInteger(motion.direction)&&motion.direction>=0&&motion.direction<=3?motion.direction:1;
    const w=image.width/4,h=image.height/(directional?16:4);
    // No flipping: sword, shield, bow, satchel and brooch stay in authored hands.
    // 256px action cells use the same on-screen pixel scale as 192px walk cells.
    const drawW=width*4/3,drawH=height*4/3;
    ctx.drawImage(image,pose.frame*w,(directional?pose.row*4+direction:pose.row)*h,w,h,x-(drawW-width)/2,y-(drawH-height),drawW,drawH);return true;
}

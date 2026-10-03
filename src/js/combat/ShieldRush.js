// Stable saved skill key remains `challenge`; only its runtime action changes.
export const SHIELD_RUSH = Object.freeze({distance:192,speed:120,duration:1.6,halfWidth:36,push:40,markSeconds:4,frameSeconds:.180});
export function shieldRushDirection(owner, direction) {
    if(Math.hypot(direction.x,direction.y)>.001)return direction;
    return [{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}][owner.direction] || {x:0,y:1};
}

export function drawShieldRushBody(image,motion,ctx,x,y) {
    if(!motion?.shieldRush || !image || image.width!==720 || image.height!==576)return false;
    const row=[1,0,2,3][motion.direction],frame=Math.floor((Math.max(0,motion.age)*1000+1e-7)/180)%4;
    const smoothing=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=false;
    ctx.drawImage(image,frame*180,row*144,180,144,x+60-90,y+112-132,180,144);
    ctx.imageSmoothingEnabled=smoothing;return true;
}

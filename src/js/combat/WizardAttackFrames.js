// Approved attack pixels only; legacy Mage walking and gameplay timing stay intact.
export function advanceWizardAttack(owner,dt){
 const previous=owner._wizardArtPosition,dx=previous?owner.x-previous.x:0,dy=previous?owner.y-previous.y:0;
 owner._wizardArtPosition={x:owner.x,y:owner.y};
 owner.wizardArtMoving=!!previous&&Math.hypot(dx,dy)>.001&&Math.hypot(dx,dy)<80;
 const active=owner.isAttacking===true||owner.state==='attack';
 owner.wizardAttackAge=active?(owner._wizardAttackActive?(owner.wizardAttackAge||0)+Math.max(0,dt):0):0;
 owner._wizardAttackActive=active;
 if(owner.wizardArtMoving)owner.wizardGaitAge=(owner.wizardGaitAge||0)+Math.max(0,dt);
}
export function sampleWizardAttack(owner){
 if(!(owner.isAttacking===true||owner.state==='attack'))return null;
 const direction=Number.isInteger(owner.direction)&&owner.direction>=0&&owner.direction<4?owner.direction:1;
 const moving=owner.wizardArtMoving===true;
 // Continuous movement keeps its foot phase; immediate gameplay releases show the cast pose.
 const channeling=owner.isChanneling===true||owner.remoteChannelingLocked===true;
 const frame=moving?Math.floor((owner.wizardGaitAge||0)/.12)%6:channeling?2+Math.floor((owner.wizardAttackAge||0)/.12)%2:Math.min(5,2+Math.floor((owner.wizardAttackAge||0)/.1));
 return {row:direction+(moving?4:0),frame,moving};
}
export function drawWizardAttack(ctx,owner,x,y){
 const image=owner.wizardAttackImage,pose=sampleWizardAttack(owner);
 if(!image||image.width!==1536||image.height!==2048||!pose)return false;
 const smoothing=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=false;
 ctx.drawImage(image,pose.frame*256,pose.row*256,256,256,x,y+112-236*120/256,120,120);
 ctx.imageSmoothingEnabled=smoothing;return true;
}

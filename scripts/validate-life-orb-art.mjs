import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {LIFE_ORB_ATLAS,LIFE_ORB_METADATA,validLifeOrbMetadata} from '../src/js/combat/LifeOrbVisuals.js';

test('approved generated WebP is byte-identical and all 24 cells preserve their alpha and measured bounds',async()=>{
 const bytes=readFileSync(LIFE_ORB_ATLAS),metadata=JSON.parse(readFileSync(LIFE_ORB_METADATA));
 assert.equal(bytes.length,1654148);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'3874743e40a74fedda87bccb729bae2ec20fefc4d67f958e8c138ccad660472c');
 assert.equal(validLifeOrbMetadata(metadata),true);
 const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
 assert.deepEqual([info.width,info.height,info.channels],[1024,1536,4]);
 for(const f of metadata.frames){
  let minX=256,minY=256,maxX=-1,maxY=-1;const edge={top:0,right:0,bottom:0,left:0};
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const alpha=data[((f.sourceRect.y+y)*1024+f.sourceRect.x+x)*4+3];
   if(y===0)edge.top=Math.max(edge.top,alpha);if(y===255)edge.bottom=Math.max(edge.bottom,alpha);
   if(x===0)edge.left=Math.max(edge.left,alpha);if(x===255)edge.right=Math.max(edge.right,alpha);
   if(alpha>8){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  }
  assert.deepEqual({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},f.visibleBoundsAtAlphaAbove8,`frame ${f.index} visible bounds`);
  assert.deepEqual(edge,f.edgeAlphaMax,`frame ${f.index} alpha edges`);assert.ok(Math.max(...Object.values(edge))<=1);
 }
});

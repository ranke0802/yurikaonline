import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
const out='reports/class-qa'; await mkdir(out,{recursive:true});
const names=['witch','warrior','archer'], labels=['위치','전사','궁수'];
const width=1260,height=760;
const label=(x,y,text,size=22,color='#d8dfdf')=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Noto Sans CJK KR,sans-serif" font-size="${size}" fill="${color}">${text}</text>`;
let svg=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#18242b"/>`;
svg+=label(630,45,'YURIKA · 실제 플레이어블 스프라이트',28);
svg+=label(630,78,'게임용 WebP의 정면 첫 프레임 · 비율 유지 · 확대 2×',16,'#9eafb8');
const items=[];
for(let i=0;i<3;i++){
 const x=210+i*420;
 svg+=label(x,128,labels[i],28);
 svg+=label(x,570,'원본 셀 192 × 192 → 384 × 384',15,'#9eafb8');
 svg+=label(x,703,'작은 크기 보기 · 64 × 64',16,'#9eafb8');
 const frame=await sharp(`assets/resource/classes/${names[i]}.webp`).extract({left:0,top:0,width:192,height:192}).png().toBuffer();
 items.push({input:await sharp(frame).resize(384,384,{kernel:'nearest'}).png().toBuffer(),left:x-192,top:160});
 items.push({input:await sharp(frame).resize(64,64,{kernel:'nearest'}).png().toBuffer(),left:x-32,top:608});
}
svg+=label(630,743,'생성 및 프레임 검사 완료 · 전투 화면과 애니메이션 최종 QA 진행 중',15,'#9eafb8')+'</svg>';
await sharp(Buffer.from(svg)).composite(items).png().toFile(`${out}/playable-characters-preview.png`);

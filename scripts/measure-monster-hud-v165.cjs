const fs=require('node:fs');
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
function measureCases(cases){return cases.map(c=>({orientation:c.orientation,classId:c.setup.classId,frames:c.snapshots.map(f=>{
 const seen=new Set(),records=f.records.filter(r=>{if(r.kind!=='hp')return true;const k=r.owner+JSON.stringify(r.box);if(seen.has(k))return false;seen.add(k);return true});
 const hud=records.filter(r=>['name','hp','status'].includes(r.kind));
 const pairs=[];for(let i=0;i<hud.length;i++)for(const b of hud.slice(i+1)){const a=hud[i];if(a.owner!==b.owner&&overlap(a.box,b.box)>1)pairs.push([a.owner,a.kind,b.owner,b.kind]);}
 const covered=owner=>hud.filter(a=>records.some(b=>b.kind==='body'&&b.owner===owner&&a.order>b.order&&overlap(a.box,b.box)>1)).length;
 return {time:f.time,hudPairs:pairs.length,pairs,overPlayer:covered('player'),overTarget:covered(f.target),labels:hud.length};})}));}
const measure=path=>measureCases(JSON.parse(fs.readFileSync(path)));
if(require.main===module){const [before,after,out]=process.argv.slice(2);const r={method:'Canvas text bounds and alpha>16 sprite envelopes in CSS pixels; HP background/full foreground deduplicated; not exact opaque pixel coverage.',before:measure(before),after:measure(after)};fs.writeFileSync(out,JSON.stringify(r,null,2));for(let i=0;i<r.before.length;i++){const a=r.before[i],b=r.after[i];console.log(a.orientation,a.classId,a.frames.map((f,j)=>`${f.time}: ${f.hudPairs}->${b.frames[j].hudPairs}`).join(', '));}}
module.exports={measure,measureCases};

import sharp from 'sharp';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Input JSON maps authored names to original generated PNG paths. Originals remain intact.
const sources = JSON.parse(process.argv[2] || '{}');
const out = resolve('assets/resource/classes');
await mkdir(out, { recursive: true });
const manifest = await readFile(`${out}/manifest.json`,'utf8').then(JSON.parse).catch(()=>({ generator: 'image_gen', sprites: {}, effects: {}, statuses: {}, qa: [] }));
manifest.qa = manifest.qa.filter(frame => !sources[frame.name]);
for (const [name, source] of Object.entries(sources)) {
    const rows = name === 'status' ? 2 : name === 'life-circle' ? 1 : 4, cols = 4, cell = name === 'status' ? 96 : 192;
    const meta = await sharp(source).metadata();
    if (!meta.hasAlpha) throw Error(`${name}: missing transparency`);
    const cells = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const left = Math.round(col * meta.width / cols), top = Math.round(row * meta.height / rows);
        const width = Math.round((col + 1) * meta.width / cols) - left;
        const height = Math.round((row + 1) * meta.height / rows) - top;
        const input = await sharp(source).extract({ left, top, width, height })
            .resize(cell - 16, cell - 16, { fit: 'fill' }).extend({top:8,bottom:8,left:8,right:8,background:'#00000000'}).png().toBuffer();
        const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        let opaque = 0;
        for(let i=3;i<data.length;i+=info.channels) if(data[i]>24) opaque++;
        if (opaque < cell*cell*.025) throw Error(`${name}: blank frame ${row}:${col}`);
        manifest.qa.push({name,row,col,visiblePixels:opaque});
        cells.push({ input, left:col*cell,top:row*cell });
    }
    const packed = await sharp({create:{width:cols*cell,height:rows*cell,channels:4,background:'#00000000'}}).composite(cells).webp({quality:88,alphaQuality:100,effort:6}).toFile(`${out}/${name}.webp`);
    const category = name==='status'?'statuses':name.endsWith('-effects') || name==='life-circle'?'effects':'sprites';
    manifest[category][name] = {file:`${name}.webp`,columns:cols,rows,cell,bytes:packed.size};
    if(category==='sprites') {
        const runtime=[];
        for(let row=0;row<5;row++) for(let col=0;col<4;col++) {
            const sourceRow=[1,0,2,2,3][row];
            let frame=sharp(cells[sourceRow*4+col].input);
            if(row===2)frame=frame.flop();
            runtime.push({input:await frame.png().toBuffer(),left:col*cell,top:row*cell});
        }
        await sharp({create:{width:8*cell,height:5*cell,channels:4,background:'#00000000'}}).composite(runtime).webp({quality:88,alphaQuality:100,effort:6}).toFile(`${out}/${name}-runtime.webp`);
    }
}
await writeFile(`${out}/manifest.json`, JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files:Object.keys(sources),frames:manifest.qa.length,allFramesVisible:true}));

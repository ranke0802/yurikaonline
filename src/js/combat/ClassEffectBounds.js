// Union of alpha >16 pixels across all four frames of each approved 192px row.
// One fixed envelope per animation preserves its motion, pivots and soft glow.
// Full source cells are drawn; low-alpha pixels outside the envelope are not cut.
export const CLASS_EFFECT_BOUNDS = Object.freeze({
    witch:[[25,42,142,108],[24,41,144,127],[24,36,144,132],[24,40,144,128]],
    warrior:[[25,37,142,118],[25,31,142,130],[24,50,144,92],[25,31,142,129]],
    archer:[[24,54,144,84],[24,58,144,110],[24,35,144,121],[24,41,144,109]],
    lifeCircle:[[23,66,147,104]],potion:[[16,35,96,77]]
});
export function effectEnvelope(key,row,cellWidth,cellHeight,width,height,pivotX=.5) {
    const authoredCell=key==='potion'?128:192;
    const bounds=cellWidth===authoredCell && cellHeight===authoredCell?CLASS_EFFECT_BOUNDS[key]?.[row]:null;
    if(!bounds)return {x:-width*pivotX,y:-height/2,width,height};
    const [x,y,w,h]=bounds,sx=width/w,sy=height/h;
    // Life Drain is authored as a ground ellipse with rising flames. Anchor the
    // ring at its source ground point, scale uniformly by diameter, and retain
    // the ground projection rather than stretching flames into the hit circle.
    if(key==='lifeCircle')return {x:-96.5*sx,y:-146*sx,width:cellWidth*sx,height:cellHeight*sx};
    return {x:-width*pivotX-x*sx,y:-height/2-y*sy,width:cellWidth*sx,height:cellHeight*sy};
}

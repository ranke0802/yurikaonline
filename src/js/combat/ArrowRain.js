// Five impact deadlines shared by damage and the existing raster animation.
export const ARROW_RAIN = Object.freeze({interval:.6, waves:5, fallHeight:220, impactLife:.18});
export function arrowRainSamples(age,radius=165) {
    const samples=[];
    for(let wave=0;wave<ARROW_RAIN.waves;wave++){
        const phase=age-wave*ARROW_RAIN.interval;
        if(phase<0||phase>ARROW_RAIN.interval+ARROW_RAIN.impactLife)continue;
        const impactAge=phase-ARROW_RAIN.interval,t=Math.min(1,phase/ARROW_RAIN.interval);
        for(let i=0;i<9;i++){
            const angle=i*2.399963+wave*.63,spread=i?Math.sqrt(i/9)*radius*.82:0;
            samples.push({x:Math.cos(angle)*spread,y:Math.sin(angle)*spread,
                height:ARROW_RAIN.fallHeight*(1-t*t),impact:impactAge>=-1e-9,
                opacity:impactAge>=0?Math.max(0,1-impactAge/ARROW_RAIN.impactLife):Math.min(1,t*5),age:phase});
        }
    }
    return samples;
}
export function renderArrowRain(renderer,ctx,effect,ground) {
    for(const p of arrowRainSamples(effect.duration<ARROW_RAIN.interval?effect.age+ARROW_RAIN.interval:effect.age,effect.radius||165)){
        if(p.impact!==ground||p.opacity<=0)continue;
        renderer.drawEffect(ctx,'tracking_rain',effect.x+p.x,effect.y+p.y-p.height,ground?48:70,p.age,
            {angle:Math.PI/2,width:ground?24:70,height:ground?44:48,pivotX:ground?.5:.9,opacity:p.opacity});
    }
}

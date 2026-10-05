// Resolve env() through computed CSS on resize or an existing HUD layout change.
// This only measures presentation bounds; it never resizes or moves the camera.
export function readMonsterHudSafeViewport(canvas, view=window) {
    const document=view.document,probe=document.createElement('div');
    probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;contain:strict;padding:var(--safe-area-top,0px) var(--safe-area-right,0px) var(--safe-area-bottom,0px) var(--safe-area-left,0px)';
    document.body.append(probe);
    const style=view.getComputedStyle(probe),insets={top:parseFloat(style.paddingTop)||0,right:parseFloat(style.paddingRight)||0,bottom:parseFloat(style.paddingBottom)||0,left:parseFloat(style.paddingLeft)||0};
    probe.remove();
    const r=canvas.getBoundingClientRect(),v=view.visualViewport;
    if(!r.width||!r.height)return {left:0,top:0,right:1,bottom:1};
    const left=Math.max(r.left,(v?.offsetLeft||0)+insets.left),top=Math.max(r.top,(v?.offsetTop||0)+insets.top);
    const right=Math.min(r.right,(v?.offsetLeft||0)+(v?.width||view.innerWidth)-insets.right);
    const bottom=Math.min(r.bottom,(v?.offsetTop||0)+(v?.height||view.innerHeight)-insets.bottom);
    const clamp=n=>Math.max(0,Math.min(1,n));
    const result={left:clamp((left-r.left)/r.width),top:clamp((top-r.top)/r.height),right:clamp((right-r.left)/r.width),bottom:clamp((bottom-r.top)/r.height)};
    const menu=document.querySelector?.('.minimap-menu'),menuRect=menu?.getBoundingClientRect();
    if(menuRect?.width&&menuRect.height&&menuRect.top>r.top+r.height/2&&menu.getClientRects().length&&view.getComputedStyle(menu).visibility!=='hidden'){
        result.occlusions=[{left:(menuRect.left-r.left)/r.width,top:(menuRect.top-r.top)/r.height,right:(menuRect.right-r.left)/r.width,bottom:(menuRect.bottom-r.top)/r.height}];
    }
    return result;
}

export function monsterHudSafeWorldViewport(canvas,camera,scale,safe={left:0,top:0,right:1,bottom:1}) {
    const w=canvas.width/scale,h=canvas.height/scale;
    const result={left:camera.x+safe.left*w+4,top:camera.y+safe.top*h+4,right:camera.x+safe.right*w-4,bottom:camera.y+safe.bottom*h-4};
    if(safe.occlusions)result.occlusions=safe.occlusions.map(b=>({left:camera.x+b.left*w-4,top:camera.y+b.top*h-4,right:camera.x+b.right*w+4,bottom:camera.y+b.bottom*h+4}));
    return result;
}

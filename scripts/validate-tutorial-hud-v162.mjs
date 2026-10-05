import test from 'node:test';
import assert from 'node:assert/strict';
import { clearTutorialCandidates } from '../src/js/ui/TutorialGuidePlacement.js';
const hits = (a,b) => a.left < b.right && a.left+a.width > b.left && a.top < b.bottom && a.top+a.height > b.top;
test('clear guide placement preserves resource, quest, action and focus rectangles', () => {
    const zones = [{left:12,top:12,right:173,bottom:70},{left:12,top:124,right:216,bottom:216},
        {left:12,top:245,right:125,bottom:334},{left:18,top:510,right:188,bottom:710},
        {left:176,top:540,right:378,bottom:740}];
    const bounds={left:16,top:24,right:374,bottom:810};
    const result=clearTutorialCandidates([{left:16,top:16}],zones,320,85,bounds);
    assert.ok(result.length);for(const r of result){assert.ok(zones.every(z=>!hits(r,z)));assert.ok(r.left>=16&&r.top>=24&&r.left+r.width<=374&&r.top+r.height<=810);}
});
test('landscape safe areas and existing clear candidates are retained', () => {
    const bounds={left:44,top:16,right:800,bottom:356},zones=[{left:44,top:16,right:244,bottom:180}];
    const good={left:300,top:60};const result=clearTutorialCandidates([good],zones,240,100,bounds);
    assert.deepEqual(result[0],{...good,width:240,height:100});
    for(const r of result)assert.ok(r.left>=44&&r.left+r.width<=800&&r.top+r.height<=356);
});

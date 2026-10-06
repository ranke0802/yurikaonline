const assert = require('node:assert/strict');

function stateProblems(state) {
    if (!state || !Array.isArray(state.transform)) return ['missing-state'];
    const [a,b,c,d] = state.transform;
    const problems = [];
    if (!state.transform.every(Number.isFinite) || Math.abs(a*d-b*c)<1e-10) problems.push('invalid-transform');
    if (!Number.isFinite(state.alpha) || state.alpha<0 || state.alpha>1) problems.push('invalid-alpha');
    if (state.composite !== 'source-over') problems.push('unexpected-composite');
    if (!Number.isInteger(state.depth) || state.depth<0) problems.push('invalid-save-depth');
    return problems;
}
const sameState = (a,b) => a && b && a.alpha===b.alpha && a.composite===b.composite
    && a.depth===b.depth && a.smoothing===b.smoothing
    && a.transform.every((n,i)=>Math.abs(n-b.transform[i])<1e-7);

// Every attempted full render is a denominator, including renders that throw.
// Expectations come from a pre-render snapshot, never from recorded draw calls.
function auditFrames(run) {
    const violations=[];
    const add=(frame,kind,detail)=>violations.push({frame,kind,detail});
    if (!run.frames.length) add(null,'no-render-attempts','No frame may pass vacuously.');
    if (run.callbacks.length!==run.requestedCallbacks) add(null,'callback-count',run.callbacks.length);
    if (run.callbacks.reduce((n,c)=>n+c.renderAttempts,0)!==run.frames.length) add(null,'frame-denominator','Callback/render accounting differs.');
    for (const callback of run.callbacks) if (callback.error) add(callback.index,'callback-exception',callback.error);
    for (const f of run.frames) {
        if (!f.completed) add(f.id,'incomplete-frame',f.error);
        if (f.error) add(f.id,'frame-exception',f.error);
        // These fixtures deliberately keep both monsters and the local summon present.
        // This independent invariant also catches erroneous culling/list disappearance.
        if (f.fixture.monsters!==2 || f.fixture.summons!==1 || f.fixture.expectedMonsters!==2)
            add(f.id,'fixture-entity-loss',f.fixture);
        for (const key of f.expected.passes) {
            const passes=f.passes.filter(p=>p.key===key);
            if (passes.length!==1) add(f.id,'missing-or-duplicate-pass',{key,count:passes.length});
            for (const p of passes) {
                if (!p.completed || p.error) add(f.id,'incomplete-pass',{key,error:p.error});
                if (!sameState(p.before,p.after)) add(f.id,'pass-state-leak',key);
            }
        }
        for (const [key,count] of Object.entries(f.expected.events)) {
            if ((f.events[key]||0)!==count) add(f.id,'missing-or-duplicate-draw',{key,expected:count,actual:f.events[key]||0});
        }
        for (const state of [f.before,f.after,...f.passes.flatMap(p=>[p.before,p.after])])
            for (const issue of stateProblems(state)) add(f.id,issue,null);
        if (!sameState(f.before,f.after) || f.before?.depth!==0 || f.after?.depth!==0)
            add(f.id,'frame-state-leak',{before:f.before,after:f.after});
        for (const draw of f.drawStates) if (draw.alpha<=0 || stateProblems(draw).length)
            add(f.id,'invalid-draw-state',draw.key);
    }
    for (const error of run.pageErrors||[]) add(null,'page-error',error);
    for (const event of run.contextEvents||[]) add(null,'canvas-context-event',event);
    return {ok:violations.length===0,renderAttempts:run.frames.length,
        completedFrames:run.frames.filter(f=>f.completed).length,
        failedFrames:new Set(violations.filter(v=>v.frame!==null).map(v=>v.frame)).size,
        violationKinds:[...new Set(violations.map(v=>v.kind))],violations};
}

function assertFrameAudit(run) {
    const result=auditFrames(run);
    assert.equal(result.ok,true,`Render audit failed: ${JSON.stringify({renderAttempts:result.renderAttempts,failedFrames:result.failedFrames,kinds:result.violationKinds,first:result.violations.slice(0,5)})}`);
    return result;
}

module.exports={auditFrames,assertFrameAudit};

// CI orchestration: each child must fail through the normal validator, and name
// the injected violation. A crash, timeout, empty run, or unexpected pass fails CI.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.QA_NEGATIVE_OUTPUT||'/tmp/yurika-render-negative-controls';
fs.mkdirSync(root,{recursive:true});
for(const [fault,kind]of[['exception','incomplete-frame'],['omit','missing-or-duplicate-draw'],['state','pass-state-leak'],['summon-hp','missing-or-duplicate-draw']]){
 const out=fs.mkdtempSync(path.join(root,`${fault}-`));
 const child=spawnSync(process.execPath,['scripts/validate-render-frame-completeness-browser.cjs','--mode=fault',`--fault=${fault}`],
  {env:{...process.env,QA_OUTPUT:out},encoding:'utf8',timeout:120000,maxBuffer:2e6});
 fs.writeFileSync(path.join(out,'process.log'),child.stdout+'\n'+child.stderr);
 assert.equal(child.error,undefined);assert.equal(child.status,1,`${fault} must fail through the audit`);
 const report=JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8'));
 assert.equal(report.results.length,1);const r=report.results[0];
 assert.equal(r.renderAttempts,12);assert.equal(r.ok,false);assert.ok(r.violationKinds.includes(kind));
 if(fault==='summon-hp'){
  const audit=JSON.parse(fs.readFileSync(path.join(out,'production-844-injected-summon-hp.json'),'utf8')).audit;
  assert.equal(audit.failedFrames,6);
  assert.ok(audit.violations.every(v=>v.kind===kind&&v.detail.key.startsWith('summon:')&&v.detail.key.endsWith(':hp')),
   'The new control must fail only for the deliberately omitted summon HP bars; body and label remain drawn.');
 }
 console.log(JSON.stringify({fault,exit:child.status,attempts:r.renderAttempts,invalidFrames:r.failedFrames,kind}));
}

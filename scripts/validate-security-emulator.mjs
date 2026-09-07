import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = 'http://127.0.0.1:9000';
const namespace = 'demo-yurika-audit-default-rtdb';
async function request(path, value, token = null) {
    const url = new URL(`${base}/${path}.json`);
    url.searchParams.set('ns',namespace);
    if (token) url.searchParams.set('auth',token);
    return fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
}
async function user() {
    const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true}) });
    assert.equal(r.status,200); return r.json();
}
async function rules(file) {
    const r=await fetch(`${base}/.settings/rules.json?ns=${namespace}`, {
        method:'PUT', headers:{Authorization:'Bearer owner','Content-Type':'application/json'}, body:readFileSync(file,'utf8') });
    assert.equal(r.status,200,await r.text());
}
const a=await user(); const b=await user();
await rules('database.rules.json');
assert.equal((await request(`users/${b.localId}/profile/gold`,999999,a.idToken)).status,200);
assert.equal((await request('unauthenticated-audit',true)).status,200);
console.log('RED confirmed: existing rules allow unauthenticated and cross-user writes (local emulator only).');
await rules('database.emulator.rules.json');
for (const [path,value,token] of [
    ['unauthenticated-audit',true,null],
    [`users/${b.localId}/profile/name`,'hijack',a.idToken],
    [`users/${a.localId}/profile/gold`,999999,a.idToken],
    [`users/${a.localId}/profile/exp`,999999,a.idToken],
    [`users/${a.localId}/profile/name`,123,a.idToken],
    [`users/${a.localId}/profile/name`,'x'.repeat(41),a.idToken],
    [`users/${a.localId}/profile`,null,a.idToken],
]) assert.equal((await request(path,value,token)).status,401,path);
assert.equal((await request(`users/${a.localId}/profile/name`,'테스트',a.idToken)).status,200);
console.log('GREEN: 7 denied writes and 1 allowed own-name write. Candidate rules only; production unchanged.');

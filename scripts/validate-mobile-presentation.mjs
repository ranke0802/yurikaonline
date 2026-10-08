import test from 'node:test';
import assert from 'node:assert/strict';
import { isInstalled, installationGuide, showInstallationGuide } from '../src/js/ui/PlatformGuide.js';
import { optionChangeLines } from '../src/js/ui/ItemPresentation.js';
import AuthManager from '../src/js/core/AuthManager.js';

test('installation guidance follows platform and stays optional; installed launch has no modal', () => {
    for (const userAgent of ['iPhone Safari', 'iPad Safari', 'Macintosh']) {
        assert.match(installationGuide({userAgent,maxTouchPoints:5}), /Safari.*공유.*홈 화면/);
    }
    assert.match(installationGuide({userAgent:'Android Chrome'}), /설치 및 바로가기 만들기/);
    assert.match(installationGuide({userAgent:'Android SamsungBrowser'}), /Samsung Internet/);
    assert.doesNotMatch(installationGuide({userAgent:'Firefox Linux'}), /Chrome 메뉴/);
    assert.equal(isInstalled({navigator:{standalone:true}}),true);
    for(const mode of ['standalone','fullscreen','minimal-ui']) {
        const env={navigator:{},matchMedia:q=>({matches:q===`(display-mode: ${mode})`})};
        assert.equal(isInstalled(env),true);
        showInstallationGuide({showGenericModal(){assert.fail('installed app must not prompt')}},env);
    }
    let args; showInstallationGuide({showGenericModal(...a){args=a}}, {navigator:{userAgent:'iPhone'}});
    assert.match(args[1],/선택 사항/); assert.match(args[1],/인터넷 연결/);
    assert.equal(args[4].hideNo,true);
});

test('option results use readable names and percentage-point changes without mutating rolls', () => {
    const keys=['missileDamageBonus','missileManaCostReduction','fireballChainChance','fireballChainDamageRatio','laserDamageBonus','attackSpeedBonus'];
    const result={previousValues:Object.fromEntries(keys.map(k=>[k,.11])),rolledValues:Object.fromEntries(keys.map(k=>[k,.18]))};
    const before=structuredClone(result),text=optionChangeLines(result);
    for(const key of keys)assert.ok(!text.includes(key));
    assert.equal(text.split('\n').length,6);assert.match(text,/11% → 18% \(\+7%p\)/);
    assert.deepEqual(result,before);assert.match(optionChangeLines({rolledValues:{unknownPrivateKey:.1}}),/^무기 옵션:/);
    assert.match(optionChangeLines({previousValues:{laserDamageBonus:.1},rolledValues:{laserDamageBonus:.1}}),/유지/);
});

test('anonymous auth failures reach the retry UI without changing auth state routing', async () => {
    const old=globalThis.firebase, failure=Object.assign(new Error('isolated login failure'),{code:'auth/network-request-failed'});
    let calls=0;globalThis.firebase={auth:()=>({signInAnonymously:async()=>{calls++;throw failure}})};
    try {const auth=new AuthManager();await assert.rejects(auth.loginAnonymously(),e=>e===failure);assert.equal(calls,1);assert.equal(auth.currentUser,null);}
    finally{globalThis.firebase=old;}
});

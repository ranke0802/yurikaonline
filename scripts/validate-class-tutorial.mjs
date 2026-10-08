import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {classTutorial} from '../src/js/core/ClassTutorial.js';import {CLASS_SKILL_UI} from '../src/js/ui/ClassSkillUI.js';
const source=JSON.parse(fs.readFileSync('assets/data/tutorials/basic_training.json')),original=JSON.stringify(source);
for(const id of ['witch','warrior','archer'])test(`${id}: correct tap/hold guidance and all basic skill UI targets, immutable Mage source`,()=>{
 const result=classTutorial(source,id),basic=CLASS_SKILL_UI[id][0],find=id=>result.steps.find(s=>s.id===id);assert.equal(JSON.stringify(source),original);
 const attack=find('attack_dummy');for(const key of ['instructionDesktop','instructionMobile','instructionMobileLandscape']){assert.ok(attack[key].includes(basic.name));assert.match(attack[key],/짧게/);assert.match(attack[key],/길게/);assert.doesNotMatch(attack[key],/체인 라이트닝|연속으로 공격/);}assert.doesNotMatch(attack.instructionMobile,/J 키/);
 for(const key of ['inspect_laser_detail','close_laser_detail','upgrade_laser'])assert.equal(find(key).target,basic.id);
 assert.equal(find('inspect_laser_detail').focus.targets[0].skillId,basic.id);assert.equal(find('upgrade_laser').highlightTarget,`#skill-up-${basic.id}`);assert.doesNotMatch(JSON.stringify(result),/체인 라이트닝|#skill-item-laser|#skill-up-laser/);
 assert.deepEqual(result.steps.map(s=>[s.id,s.trigger,s.allowedActions]),source.steps.map(s=>[s.id,s.trigger,s.allowedActions]));
});
test('Mage combat teaching and unrelated tutorials remain unchanged',()=>{
 const result=classTutorial(source,'wizard');
 assert.deepEqual(result.steps.filter(s=>s.id!=='preview_status_change'),source.steps.filter(s=>s.id!=='preview_status_change'));
 assert.equal(JSON.stringify(source),original);
 const other={id:'other'};assert.equal(classTutorial(other,'witch'),other);
});

'use strict';
window.PARTY_DATA = {
  schemaVersion: 1,
  leaderId: 'mage',
  initialParty: ['mage', 'guardian', 'witch', 'archer'],
  characters: [
    {id:'mage',name:'푸른 모자의 마법사',short:'마법사',role:'주인공 · 마법 공격',color:'#547fa8',icon:'wand',level:12,hp:650,atk:108,def:42,key:'mage-key.png',idle:'idle-mage.png',quote:'이번에는 우리 넷이 함께 가는 거야!',story:'익숙한 푸른 모자 아래, 새로운 여정을 꿈꾸는 작은 마법사. 달숲의 동료들과 함께 더 넓은 세계로 향합니다.',skill:'푸른 마력',skillText:'모은 마력을 방출해 적에게 마법 피해를 주는 주인공의 기본 기술.',support:'모험의 시작',supportText:'세 동료와 함께 파티의 공격 흐름을 이끕니다.',weapon:'나선 지팡이',armor:'여행자의 망토',accessory:'작은 금빛 버클'},
    {id:'guardian',name:'달숲의 수호자',short:'전사',role:'동료 · 방어',color:'#78708b',icon:'shield',level:10,hp:980,atk:63,def:95,key:'guardian-key.png',idle:'idle-guardian.png',quote:'내 뒤에 있으면 괜찮아. 천천히 가자.',story:'방패를 든 작은 어깨에 동료를 지키겠다는 약속이 담겨 있습니다. 앞길을 먼저 살피며 파티를 든든하게 지켜줍니다.',skill:'굳건한 방패',skillText:'방패를 세워 적의 공격을 받아내는 방어 기술.',support:'함께 지키는 약속',supportText:'파티가 어려운 순간을 버틸 수 있도록 보호합니다.',weapon:'수호자의 검',armor:'은빛 갑옷',accessory:'보랏빛 망토 고리'},
    {id:'witch',name:'달숲의 위치',short:'위치',role:'동료 · 회복 지원',color:'#886b9c',icon:'book',level:10,hp:610,atk:77,def:47,key:'witch-key.png',idle:'idle-witch.png',quote:'책에 없는 이야기는, 우리 함께 써보자.',story:'책장을 넘기다 고개를 든 달숲의 이야기꾼. 호기심 많은 눈빛과 따뜻한 마법으로 동료들의 여정을 돌봅니다.',skill:'포근한 주문',skillText:'책에 담긴 주문으로 다친 동료의 생명력을 돌보는 지원 기술.',support:'작은 쉼표',supportText:'긴 여정에서 파티의 회복과 지속력을 담당합니다.',weapon:'달숲의 마법책',armor:'보랏빛 로브',accessory:'여행용 물약 가방'},
    {id:'archer',name:'달숲의 궁수',short:'궁수',role:'동료 · 원거리 공격',color:'#63958a',icon:'bow',level:9,hp:590,atk:115,def:36,key:'archer-key.png',idle:'idle-archer.png',quote:'바람이 잦아들었어. 지금이 좋은 때야.',story:'흐르는 물과 바람에서 길을 읽는 조용한 길잡이. 활시위를 살피는 익숙한 손길이 파티의 다음 발걸음을 준비합니다.',skill:'바람의 화살',skillText:'한 적에게 집중하는 정밀한 원거리 공격 기술.',support:'숲 너머의 길잡이',supportText:'파티의 원거리 화력과 탐색을 돕습니다.',weapon:'단풍나무 활',armor:'길잡이의 가죽 조끼',accessory:'토끼 화살통'}
  ],
  products: [
    {id:'books',name:'동료의 기록',description:'경험의 서 3권 · 동료 성장에 사용',price:240,icon:'book',resource:'books',quantity:3},
    {id:'stones',name:'장비 정비 꾸러미',description:'정비석 2개 · 장비 강화에 사용',price:350,icon:'gem',resource:'stones',quantity:2},
    {id:'potions',name:'여행자의 물약',description:'물약 2개 · 다음 여정을 위한 준비',price:100,icon:'potion',resource:'potions',quantity:2}
  ],
  regions: [
    {id:'wind',name:'바람 언덕',subtitle:'네 사람이 함께 내딛는 첫걸음',file:'wind.png',power:1200},
    {id:'lake',name:'안개빛 호수',subtitle:'물안개 너머에 잠든 오래된 길',file:'lake.png',power:1800},
    {id:'thunder',name:'뇌광의 숲',subtitle:'빛나는 숲에서 만나는 새로운 도전',file:'thunder.png',power:2400}
  ]
};
// Camp poses and layout metadata are derived from approved art; combat roles remain concept values.
for(const c of window.PARTY_DATA.characters){
 c.camp=`camp-${c.id}.png`;
 c.campActivity={mage:'지도 살펴보기',guardian:'장비 정비',witch:'책과 차 한 잔',archer:'활시위 점검'}[c.id];
 c.group=['mage','archer'].includes(c.id)?'attack':'support';
 c.job={mage:'마법 공격',guardian:'방어',witch:'회복 지원',archer:'원거리 공격'}[c.id];
 c.focus={mage:'36%',guardian:'35%',witch:'37%',archer:'35%'}[c.id];
}
for(const p of window.PARTY_DATA.products){p.art=`item-${p.id}.png`;p.use={books:'동료의 레벨 성장',stones:'무기 강화와 정비',potions:'다음 원정을 위한 준비'}[p.id];}

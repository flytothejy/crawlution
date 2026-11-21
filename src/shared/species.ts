// 갈래·종 데이터. 곤충 추가 = 여기에 데이터 한 덩어리. 스킬은 효과 부품의 조합이다.

export type Lineage = 'none' | 'armor' | 'hunt' | 'swarm' | 'poison' | 'spider';

/** 상성 순환 순서: 각 갈래는 바로 다음 둘을 이긴다(2승 2패) */
export const CYCLE: Lineage[] = ['armor', 'hunt', 'swarm', 'poison', 'spider'];

export function beats(a: Lineage, b: Lineage): boolean {
  const ia = CYCLE.indexOf(a), ib = CYCLE.indexOf(b);
  if (ia < 0 || ib < 0) return false;
  const d = (ib - ia + 5) % 5;
  return d === 1 || d === 2;
}

export interface LineageInfo {
  name: string;
  color: number;
  speedMul: number;
  turnMul: number;
  radiusMul: number;
  hpMul: number; // 최대 체력
  biteMul: number; // 물기 피해
  skillMul: number; // 기술 피해
  cdMul: number; // 기술 재사용 시간
  takenMul: number; // 받는 피해
  regenMul: number; // 회복 속도
  growthMul: number; // 성장 속도
  trait: string; // 한 줄 특징
}

export const LINEAGE: Record<Lineage, LineageInfo> = {
  none: { name: '애벌레', color: 0x8fd14f, speedMul: 1, turnMul: 1, radiusMul: 1, hpMul: 1, biteMul: 1, skillMul: 1, cdMul: 1, takenMul: 1, regenMul: 1, growthMul: 1, trait: '' },
  armor: { name: '갑옷', color: 0x3f7fd9, speedMul: 0.9, turnMul: 0.85, radiusMul: 1.1, hpMul: 1.3, biteMul: 0.95, skillMul: 1, cdMul: 1, takenMul: 0.85, regenMul: 1, growthMul: 1, trait: '튼튼함: 체력↑ 받는 피해 -15%' },
  hunt: { name: '사냥', color: 0xf08a24, speedMul: 1.15, turnMul: 1.2, radiusMul: 0.95, hpMul: 0.85, biteMul: 1.25, skillMul: 1.05, cdMul: 1, takenMul: 1, regenMul: 1, growthMul: 1, trait: '날쌤: 빠르고 자주·세게 문다' },
  swarm: { name: '무리', color: 0xe0559a, speedMul: 1.05, turnMul: 1.05, radiusMul: 0.95, hpMul: 1, biteMul: 0.95, skillMul: 0.95, cdMul: 1, takenMul: 1, regenMul: 2.2, growthMul: 1.2, trait: '끈질김: 빨리 회복·빨리 성장' },
  poison: { name: '독', color: 0x22a866, speedMul: 1, turnMul: 1, radiusMul: 1, hpMul: 0.95, biteMul: 1, skillMul: 1.2, cdMul: 1, takenMul: 1, regenMul: 1, growthMul: 1, trait: '맹독: 기술 피해↑ 물면 중독' },
  spider: { name: '거미', color: 0x6a5acd, speedMul: 1, turnMul: 1.05, radiusMul: 1, hpMul: 1, biteMul: 1, skillMul: 1, cdMul: 0.8, takenMul: 1, regenMul: 1, growthMul: 1, trait: '덫: 기술 자주, 물면 느려짐' },
};

/** 스킬 효과 부품 */
export type Target = 'le' | 'all'; // 체력 방식에서는 둘 다 모두에게 맞는다(피해 배수로 강약 표현). 데이터 호환용으로 남김
export type Part =
  | { k: 'dash'; mult: number; dur: number; cut?: Target; push?: boolean }
  | { k: 'fly'; dur: number; land?: Part }
  | { k: 'cone'; range: number; half: number; effect: 'cut' | 'stun'; dur?: number; target: Target; back?: boolean }
  | { k: 'aoe'; radius: number; effect: 'cut' | 'stun' | 'push'; dur?: number; target: Target }
  | { k: 'zone'; shape: 'trail' | 'front'; radius: number; life: number; effect: 'poison' | 'slow' | 'root'; trailDur?: number }
  | { k: 'proj'; count: number; speed: number; spread: number; slow: number }
  | { k: 'shield'; dur: number; mode: 'nocut' | 'retaliate' }
  | { k: 'magnet'; dur: number; radius: number }
  | { k: 'ringfast'; dur: number };

export interface Look {
  body: number;
  stripe: number;
  head: number;
  pattern?: 'spots' | 'swarm' | 'metal' | 'fuzzy';
  feats?: ('antennaLong' | 'mandibles' | 'horn' | 'sickles' | 'wings' | 'wings4' | 'legs8' | 'stinger' | 'bigEyes' | 'centipede')[];
}

export interface Species {
  id: string;
  name: string;
  stage: number;
  lineage: Lineage;
  skillName: string;
  skillDesc: string;
  cd: number;
  parts: Part[];
  look: Look;
  fact: string;
}

const S = (s: Species) => s;

export const SPECIES: Species[] = [
  S({ id: 'caterpillar', name: '애벌레', stage: 1, lineage: 'none', skillName: '', skillDesc: '스킬 없음', cd: 0, parts: [],
    look: { body: 0x8fd14f, stripe: 0x5fae2e, head: 0x74c23a }, fact: '애벌레는 자라면서 여러 번 허물을 벗는다.' }),

  // 갑옷
  S({ id: 'ladybug', name: '무당벌레', stage: 2, lineage: 'armor', skillName: '쓴맛 즙', skillDesc: '2초간 나를 문 적은 기절하고 피해를 되돌려 받음', cd: 14,
    parts: [{ k: 'shield', dur: 2, mode: 'retaliate' }],
    look: { body: 0xe8392c, stripe: 0xd02a1e, head: 0x2a2a2a, pattern: 'spots' }, fact: '위협을 받으면 다리 관절에서 쓴맛 나는 노란 액체를 낸다.' }),
  S({ id: 'longhorn', name: '하늘소', stage: 3, lineage: 'armor', skillName: '더듬이 채찍', skillDesc: '주변 먹이를 끌어오고 가까운 적을 밀침', cd: 12,
    parts: [{ k: 'magnet', dur: 3, radius: 264 }, { k: 'aoe', radius: 109, effect: 'push', target: 'le' }],
    look: { body: 0x2b2b35, stripe: 0x3b3b48, head: 0x22222a, pattern: 'spots', feats: ['antennaLong'] }, fact: '몸길이만큼 긴 더듬이로 냄새와 진동을 느낀다.' }),
  S({ id: 'stag', name: '사슴벌레', stage: 4, lineage: 'armor', skillName: '큰턱 집기', skillDesc: '큰턱으로 앞쪽 적을 집어 큰 피해', cd: 10,
    parts: [{ k: 'cone', range: 92, half: 0.55, effect: 'cut', target: 'le' }],
    look: { body: 0x6b3d1f, stripe: 0x55301a, head: 0x4a2812, pattern: 'metal', feats: ['mandibles'] }, fact: '수컷의 큰턱은 사슴뿔처럼 생겨 다른 수컷과 겨룰 때 쓴다.' }),
  S({ id: 'rhino', name: '장수풍뎅이', stage: 5, lineage: 'armor', skillName: '뿔 돌진', skillDesc: '1초 돌진, 들이받은 적마다 큰 피해', cd: 13,
    parts: [{ k: 'dash', mult: 2.6, dur: 1, cut: 'all' }],
    look: { body: 0x5a3a22, stripe: 0x48301b, head: 0x3d2513, pattern: 'metal', feats: ['horn'] }, fact: '자기 몸무게의 수십 배를 들어 올릴 만큼 힘이 세다.' }),

  // 사냥
  S({ id: 'tiger', name: '길앞잡이', stage: 2, lineage: 'hunt', skillName: '순간 질주', skillDesc: '1초간 속도 3배', cd: 8,
    parts: [{ k: 'dash', mult: 3, dur: 1 }],
    look: { body: 0x2fb36b, stripe: 0xc9773a, head: 0x1f8f55, pattern: 'metal', feats: ['bigEyes', 'mandibles'] }, fact: '가장 빨리 달리는 곤충 중 하나라 사람 길 앞을 앞질러 간다.' }),
  S({ id: 'robberfly', name: '파리매', stage: 3, lineage: 'hunt', skillName: '낚아채기', skillDesc: '앞으로 돌진하며 부딪힌 적에게 피해', cd: 9,
    parts: [{ k: 'dash', mult: 2.2, dur: 0.6, cut: 'le' }],
    look: { body: 0x8a7a5a, stripe: 0x6a5a3a, head: 0x5a4a32, pattern: 'fuzzy', feats: ['wings', 'bigEyes'] }, fact: '날아가는 다른 곤충을 공중에서 낚아채 사냥한다.' }),
  S({ id: 'mantis', name: '사마귀', stage: 4, lineage: 'hunt', skillName: '낫 베기', skillDesc: '앞쪽 넓은 범위를 베어 큰 피해', cd: 9,
    parts: [{ k: 'cone', range: 115, half: 0.9, effect: 'cut', target: 'le' }],
    look: { body: 0x7fd04a, stripe: 0x66b437, head: 0x6cc13a, feats: ['sickles', 'bigEyes'] }, fact: '머리를 180도 가까이 돌려 뒤쪽도 볼 수 있다.' }),
  S({ id: 'dragonfly', name: '장수잠자리', stage: 5, lineage: 'hunt', skillName: '공중 강하', skillDesc: '날아올랐다가 내리꽂아 주변에 큰 피해', cd: 13,
    parts: [{ k: 'fly', dur: 1.4, land: { k: 'aoe', radius: 132, effect: 'cut', target: 'all' } }],
    look: { body: 0x222222, stripe: 0xf2c230, head: 0x2f8f3a, feats: ['wings4', 'bigEyes'] }, fact: '우리나라에서 가장 큰 잠자리로, 날면서 사냥한다.' }),

  // 무리
  S({ id: 'weaver', name: '베짜기개미', stage: 2, lineage: 'swarm', skillName: '잎 방패', skillDesc: '2초간 받는 피해 없음', cd: 12,
    parts: [{ k: 'shield', dur: 2, mode: 'nocut' }],
    look: { body: 0xe08a2a, stripe: 0xc8721a, head: 0xb85e10, pattern: 'swarm' }, fact: '애벌레가 뽑는 실로 나뭇잎을 엮어 둥지를 만든다.' }),
  S({ id: 'bee', name: '꿀벌', stage: 3, lineage: 'swarm', skillName: '8자 춤', skillDesc: '3초간 넓은 범위 먹이를 끌어옴', cd: 11,
    parts: [{ k: 'magnet', dur: 3, radius: 322 }],
    look: { body: 0xf6c94a, stripe: 0x3a2a10, head: 0x3a2a10, pattern: 'swarm', feats: ['wings'] }, fact: '8자 춤으로 동료에게 꽃밭의 방향과 거리를 알려준다.' }),
  S({ id: 'soldier', name: '병정흰개미', stage: 4, lineage: 'swarm', skillName: '머리 방패 돌진', skillDesc: '돌진하며 부딪힌 적을 밀쳐냄', cd: 10,
    parts: [{ k: 'dash', mult: 2, dur: 0.8, push: true }],
    look: { body: 0xf0e2c0, stripe: 0xd8c49a, head: 0xe07a1a, pattern: 'swarm', feats: ['mandibles'] }, fact: '크고 단단한 머리로 굴 입구를 막아 집을 지킨다.' }),
  S({ id: 'heatball', name: '토종벌 군단', stage: 5, lineage: 'swarm', skillName: '열 공', skillDesc: '주변을 태워 큰 피해, 3초간 감싸기 압착이 빨라짐', cd: 14,
    parts: [{ k: 'ringfast', dur: 3 }, { k: 'aoe', radius: 121, effect: 'cut', target: 'all' }],
    look: { body: 0xf2b134, stripe: 0xc07a10, head: 0x5a3a10, pattern: 'swarm', feats: ['wings'] }, fact: '토종벌은 장수말벌을 둘러싸 체온을 올려 물리친다.' }),

  // 독
  S({ id: 'fireant', name: '불개미', stage: 2, lineage: 'poison', skillName: '개미산 장판', skillDesc: '2초간 지나간 자리에 독 장판(밟으면 계속 피해)', cd: 11,
    parts: [{ k: 'zone', shape: 'trail', radius: 30, life: 3, effect: 'poison', trailDur: 2 }],
    look: { body: 0xc8321e, stripe: 0xa02414, head: 0x8a1e10 }, fact: '꽁무니의 독침으로 쏘아 개미산을 넣는다.' }),
  S({ id: 'bombardier', name: '폭탄먼지벌레', stage: 3, lineage: 'poison', skillName: '폭발 분사', skillDesc: '뒤쪽으로 폭발, 쫓아오던 적 피해와 기절', cd: 10,
    parts: [{ k: 'cone', range: 150, half: 0.7, effect: 'stun', dur: 1.3, target: 'all', back: true }],
    look: { body: 0xf08a1c, stripe: 0x222222, head: 0x222222, pattern: 'metal', feats: ['stinger'] }, fact: '꽁무니에서 100도 가까운 뜨거운 화학 물질을 뿜는다.' }),
  S({ id: 'wasp', name: '쌍살벌', stage: 4, lineage: 'poison', skillName: '독침 발사', skillDesc: '독침 3발, 맞으면 피해와 1.5초 느려짐', cd: 9,
    parts: [{ k: 'proj', count: 3, speed: 560, spread: 0.22, slow: 1.5 }],
    look: { body: 0xf2c230, stripe: 0x2a2a2a, head: 0x2a2a2a, feats: ['wings', 'stinger'] }, fact: '날 때 긴 뒷다리를 늘어뜨려 쌍살벌이라 부른다.' }),
  S({ id: 'hornet', name: '장수말벌', stage: 5, lineage: 'poison', skillName: '비행 독침', skillDesc: '날아올랐다가 내려앉으며 주변에 피해와 1.5초 마비', cd: 13,
    parts: [{ k: 'fly', dur: 1.3, land: { k: 'aoe', radius: 144, effect: 'stun', dur: 1.5, target: 'all' } }],
    look: { body: 0xf5a623, stripe: 0x3a2a10, head: 0xff8c1a, feats: ['wings', 'stinger', 'mandibles'] }, fact: '세계에서 가장 큰 말벌 중 하나다.' }),

  // 거미
  S({ id: 'jumper', name: '깡충거미', stage: 2, lineage: 'spider', skillName: '도약 덮치기', skillDesc: '짧게 뛰어올라 착지 지점 적에게 피해와 기절', cd: 8,
    parts: [{ k: 'fly', dur: 0.45, land: { k: 'aoe', radius: 86, effect: 'stun', dur: 0.7, target: 'le' } }],
    look: { body: 0x6a6a72, stripe: 0xe8c547, head: 0x4a4a52, pattern: 'fuzzy', feats: ['legs8', 'bigEyes'] }, fact: '앞쪽의 큰 눈 두 개로 거리를 재고 뛰어서 사냥한다.' }),
  S({ id: 'orbweaver', name: '무당거미', stage: 3, lineage: 'spider', skillName: '거미줄 펼치기', skillDesc: '앞에 넓은 거미줄, 들어온 적 느려짐', cd: 11,
    parts: [{ k: 'zone', shape: 'front', radius: 138, life: 4, effect: 'slow' }],
    look: { body: 0xf2d04a, stripe: 0x2a2a2a, head: 0x2a2a2a, feats: ['legs8'] }, fact: '노랑·검정 줄무늬가 뚜렷하고 금빛 거미줄을 친다.' }),
  S({ id: 'garden', name: '왕거미', stage: 4, lineage: 'spider', skillName: '원형 덫', skillDesc: '앞에 덫, 걸린 적 2초 포박', cd: 12,
    parts: [{ k: 'zone', shape: 'front', radius: 109, life: 5, effect: 'root' }],
    look: { body: 0x9a6a3a, stripe: 0xe8d2a6, head: 0x7a4a22, pattern: 'fuzzy', feats: ['legs8'] }, fact: '동그란 그물을 치고 가운데에서 먹이를 기다린다.' }),
  S({ id: 'widow', name: '검은과부거미', stage: 5, lineage: 'spider', skillName: '맹독 물기', skillDesc: '앞쪽 적에게 피해와 3초 마비', cd: 13,
    parts: [{ k: 'cone', range: 126, half: 0.65, effect: 'stun', dur: 3, target: 'all' }],
    look: { body: 0x1e1e24, stripe: 0xd8262f, head: 0x16161a, pattern: 'metal', feats: ['legs8'] }, fact: '배에 붉은 모래시계 무늬가 있다.' }),
];

export const BOSS_LOOK: Look = { body: 0x8a2a1a, stripe: 0x5a1a10, head: 0x4a120a, pattern: 'metal', feats: ['centipede', 'mandibles'] };

export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function speciesFor(lineage: Lineage, stage: number): Species {
  if (stage <= 1) return SPECIES[0];
  return SPECIES.find((s) => s.lineage === lineage && s.stage === stage)!;
}

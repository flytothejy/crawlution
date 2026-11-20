// 모든 밸런스 값은 여기 한 곳에 모은다. 서버·클라이언트가 같은 파일을 쓴다.
// 프로토타입 C: 완성된 한 판(5단계, 5갈래, 봇 15, 보스 1, 천적 1) + 체력 싸움

export const CONFIG = {
  tickRate: 60, // 시뮬레이션 틱(초당). 멀티 서버에서는 20으로 낮춘다.
  arenaRadius: 2200,

  // 이동(조작감: 빠릿하게)
  stageSpeed: [0, 175, 183, 191, 199, 207], // 단계별 기본 속도 px/초 (인덱스 = 단계)
  boostMul: 1.9,
  sneakMul: 0.6,
  turnRate: (560 * Math.PI) / 180, // 초당 최대 회전
  sneakTurnMul: 1.3,
  sizeTurnSlow: 0.15, // 몸이 가장 길 때 회전이 이만큼 둔해짐
  boostMinSegments: 14,
  boostDropInterval: 0.45,

  // 몸: 길이 제한 없음. 길수록 먹이당 성장이 느려지고 몸이 굵어진다.
  startSegments: 20,
  stageGrowth: [0, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6], // 먹은 EP당 마디(길이 0 기준)
  growthSlowLen: 220, // 성장량 = 기본 ÷ (1 + 길이/이 값)
  stageRadius: [0, 9, 11.2, 13.6, 16.4, 19.8], // 탈피할 때마다 확 굵어짐
  thickPerSeg: 1 / 380, // 길이에 따라 더 굵어짐(시작 길이 넘는 마디당)
  thickMax: 0.7,
  spacingRatio: 0.72,
  botStartSegs: [0, 20, 35, 55, 80, 110],

  // 체력·싸움
  stageHp: [0, 50, 90, 140, 200, 270],
  hpPerSeg: 0.6,
  biteDamage: [0, 8, 13, 19, 26, 34],
  biteCooldown: 0.35,
  stageDmgStep: 0.35, // 단계 1 차이마다 피해 ±35%
  favorMul: 1.5, // 상성 유리
  unfavorMul: 0.6, // 상성 불리
  strongRatio: 1.15, // 피해 배수가 상대의 이 배 이상이면 '강함'
  recoilMul: 0.6, // 강한 몸에 박으면 상대 물기의 이만큼 내가 받음
  guardMul: 0.5, // 웅크리기(살금) 중 받는 피해
  armorTakenMul: 0.8, // 갑옷 갈래 받는 피해
  huntBiteMul: 1.2, // 사냥 갈래 물기 피해
  huntBiteCooldown: 0.27,
  poisonBiteDot: 0.5, // 독 갈래: 물기 피해의 이만큼을 2초에 걸쳐 추가
  spiderBiteSlow: 0.8, // 거미 갈래: 물린 적 느려짐(초)
  swarmRegenMul: 2,
  regenDelay: 3, // 마지막 피해 후 이 시간이 지나면 회복
  regenRate: 0.05, // 초당 최대 체력의 비율
  foodHeal: 1.5, // 먹이 EP당 회복
  tailDropPerDmg: 1 / 12, // 피해 12마다 꼬리 1마디가 떨어짐
  skillDamage: [0, 0, 30, 45, 60, 80],
  knockback: 10,
  wallDamage: 0.15, // 경계에 부딪히면 최대 체력의 이만큼
  invulnTime: 3,
  lives: 3,
  respawnDelay: 2,

  // 진화
  stageGauge: [0, 40, 90, 160, 250, Infinity], // 그 단계에서 새로 모으는 EP(누적 아님)
  moltTime: 1.5,
  moltTimeSwitch: 2.5, // 갈래를 바꾸면
  moltSpeedMul: 0.5,
  masteryMax: 3,
  masteryCdCut: 0.1,
  cardScanRadius: 1200,

  // 먹이
  foodCount: 560,
  foodEP: 1,
  foodRadius: 4.5,
  bigFoodCount: 40,
  bigFoodEP: 4,
  bigFoodRadius: 8,
  remainsRadius: 6,

  // 감싸기
  loopMinIndex: 12,
  loopMinRadiusPerR: 4, // 최소 고리 반지름 = 내 반지름 × 이 값
  crushDelay: 1.0,
  crushDelayFast: 0.4, // 토종벌 '열 공' 중
  loopCooldown: 0.6,
  comboBonus: 1.5,

  // 봇
  botCount: 15,
  botRespawnDelay: 3,
  botHunterSegments: 38,
  botGraceSeconds: 12,
  botFavorableChance: 0.6,

  // 보스(왕지네): 내가 5단계가 되면 등장
  bossSegments: 120,
  bossRadius: 30,
  bossSpeed: 150,
  bossTurn: (200 * Math.PI) / 180,
  bossHp: 1400,
  bossBite: 40,
  bossCrushFrac: 0.3, // 감싸기 압착은 보스 최대 체력의 이만큼

  // 천적: 새
  birdFirst: 60,
  birdEveryMin: 70,
  birdEveryMax: 100,
  birdWarn: 2.5,
  birdDives: 4,
  birdDiveEvery: 4,
  birdShadowTime: 1.6,
  birdRadius: 130,
  birdDamage: 0.55, // 머리가 그림자 안: 최대 체력의 이만큼(몸만 걸리면 60%)

  // 상태 이상
  poisonTick: 0.4,
  poisonZoneDps: 0.3, // 독 장판: 초당 (시전자 스킬 피해 × 이 값)

  // 점수
  scoreKill: 50,
  scoreCrush: 100,
  scoreMolt: 200,
  scoreBoss: 2000,
} as const;

export type Config = typeof CONFIG;

export function radiusFor(stage: number, lineageRadius = 1, segCount: number = CONFIG.startSegments): number {
  const thick = Math.min(CONFIG.thickMax, Math.max(0, segCount - CONFIG.startSegments) * CONFIG.thickPerSeg);
  return CONFIG.stageRadius[Math.max(1, Math.min(5, stage))] * lineageRadius * (1 + thick);
}

export function maxHpFor(stage: number, segCount: number): number {
  return Math.round(CONFIG.stageHp[Math.max(1, Math.min(5, stage))] + segCount * CONFIG.hpPerSeg);
}

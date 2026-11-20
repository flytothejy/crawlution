// 모든 밸런스 값은 여기 한 곳에 모은다. 서버·클라이언트가 같은 파일을 쓴다.
// 프로토타입 C: 완성된 한 판(5단계, 5갈래, 봇 15, 보스 1, 천적 1)

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

  // 몸
  startSegments: 20,
  stageGrowth: [0, 1 / 2, 1 / 3, 1 / 4, 1 / 6, 1 / 8], // 먹은 EP당 마디
  stageMaxSegments: [0, 40, 70, 100, 130, 160],
  stageRadius: [0, 9, 10.4, 11.7, 13.5, 16.2],
  spacingRatio: 0.72,

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
  bossRadius: 26,
  bossSpeed: 150,
  bossTurn: (200 * Math.PI) / 180,
  bossDeathSegments: 14,
  bossSkillDamage: 16, // 5단계 스킬 한 번에 깎는 마디

  // 천적: 새
  birdFirst: 60,
  birdEveryMin: 70,
  birdEveryMax: 100,
  birdWarn: 2.5,
  birdDives: 4,
  birdDiveEvery: 4,
  birdShadowTime: 1.6,
  birdRadius: 130,

  // 상태 이상
  poisonTick: 0.4,
  swarmRegrow: 0.3,
  swarmRegrowDelay: 3,

  // 점수
  scoreKill: 50,
  scoreCrush: 100,
  scoreMolt: 200,
  scoreBoss: 2000,
} as const;

export type Config = typeof CONFIG;

export function radiusFor(stage: number, lineageRadius = 1): number {
  return CONFIG.stageRadius[Math.max(1, Math.min(5, stage))] * lineageRadius;
}

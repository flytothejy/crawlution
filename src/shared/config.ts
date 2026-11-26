// 모든 밸런스 값은 여기 한 곳에 모은다. 서버·클라이언트가 같은 파일을 쓴다.
// 2판 시험판: 8분 한 판(순위), 10계열 40종, 레벨 1~16 · 진화 3단계, 봇 20, 천적 6종

export const CONFIG = {
  tickRate: 60, // 시뮬레이션 틱(초당). 멀티 서버에서는 20으로 낮춘다.
  arenaRadius: 2300, // 2판: 3300에서 줄임(넓이 49%) → 붙는 횟수 1.5배. 먹이 수도 넓이에 맞춰 줄여 밀도는 같다
  roundTime: 300,
  /** 타격 멈춤(히트스톱) 배율. 내가 때리거나 맞은 큰 타격에서 세상이 잠깐 멈춘다 */
  hitstopMul: 1, // 한 판 5분(8분에서 줄임), 끝나면 점수 순위

  // 이동(조작감: 빠릿하게). 속도 = (180 + 1.5 × (레벨−1) + 진화 보너스) × 계열 배율
  baseSpeed: 180,
  speedPerLevel: 1.5,
  evoSpeed: [0, 0, 5, 10], // 단계(1 어린 모습, 2 성충, 3 각성)
  boostMul: 1.75,
  sneakMul: 0.55,
  turnRate: (560 * Math.PI) / 180, // 초당 최대 회전
  sneakTurnMul: 1.3,
  sizeTurnSlow: 0.15, // 몸이 가장 길 때 회전이 이만큼 둔해짐
  boostMinSegments: 14,
  boostDropInterval: 0.45,

  // 몸: 길이 제한 없음. 길수록 먹이당 성장이 느려지고 몸이 굵어진다.
  startSegments: 20,
  evoGrowth: [0, 0.5, 0.36, 0.26], // 먹은 영양당 마디(길이 0 기준)
  growthSlowLen: 220,
  evoRadius: [0, 9, 13, 17],
  thickPerSeg: 1 / 380,
  thickMax: 0.7,
  spacingRatio: 0.72,

  // 레벨과 영양
  maxLevel: 16,
  evoLevels: [0, 1, 5, 10], // 이 레벨에 이 단계가 된다
  evoMul: [0, 1, 1.2, 1.45], // 진화 배율 E
  nutBase: 20, // 다음 레벨까지 = 20 + 8 × (레벨 − 1)
  nutStep: 7,
  nutMul: 1.25, // 전체 영양 배율(5분 판: 각성 2분 30초 안팎이 목표, 8분 판 때는 0.78)
  remainsFrac: 0.3, // 잔해 = 그 곤충이 모은 영양의 30%
  remainsWeakMul: 0.5, // 내 레벨이 더 높으면 절반
  firstNewCards: 3, // 처음 세 번은 새 능력이 적어도 1장
  rerolls: 1,

  // 체력·싸움 (기술 수치표 공통 공식)
  hpScale: 1.6, // 전체 체력 배율(2026-11-26: 1 → 1.6, 1:1 결판 4.4초 → 약 9초)(공격:체력 비율 손잡이). 기준은 balance/weights.ts의 TARGET
  hpBase: 60,
  hpPerLevel: 0.1,
  hpPerSeg: 0.6,
  biteBase: 8,
  bitePerLevel: 0.06,
  skillBase: 30, // 기준 피해 B
  skillPerLevel: 0.08,
  biteCooldown: 0.35,
  recoilLevelGap: 3, // 나보다 레벨이 이만큼 높은 몸에 박으면 반동
  recoilMul: 0.5,
  guardMul: 0.5, // 웅크리기 중 받는 피해
  regenDelay: 3,
  regenRate: 0.05,
  foodHeal: 1.5,
  tailDropPerDmg: 1 / 12,
  knockback: 10,
  wallDamage: 0.15,
  invulnTime: 3, // 부활 직후 무적(먼저 공격하면 풀림)
  rallyTime: 1.2, // 방어 칸 공통 '몸 추스르기': 방어 기술을 쓰면 느려짐·묶임 해제 + 이 시간 동안 이동 속도 ×rallySpeed
  rallySpeed: 1.3,
  respawnSafeDist: 900, // 부활 자리: 다른 곤충에게서 이만큼 먼 곳을 찾는다
  lives: 0, // 0 = 목숨 제한 없음(쓰러져도 판 끝까지 다시 나옴, 부활은 쓰러질수록 늦어짐)
  respawnDelay: 2,
  evolveTime: 1, // 진화 연출(무적)
  tailCritSegs: 0.12,
  tailCritFrac: 0.15,
  poisonTick: 0.4,

  // 필살기
  ultMax: 100,
  ultDealt: 7, // 준 피해 ÷ B × 7 (맵을 줄이며 12→7: 싸움이 잦아져 필살기가 판당 9.6번까지 늘었다)
  ultTaken: 50, // 받은 피해 ÷ 최대 체력 × 50 (120→50)
  ultKill: 8, // 15→8
  ultLike: 20,
  ultPassive: 0.28, // 5분 판: 0.2→0.28(판당 3번 안팎)
  ultCapFrac: 0.4, // 한 대상에게 최대 체력의 40%까지
  ultTele: 0.5, // 0.5초 전에 범위 예고

  // 먹이
  foodCount: 560,
  foodEP: 1,
  foodRadius: 9,
  bigFoodCount: 44,
  bigFoodEP: 4,
  bigFoodRadius: 15,
  remainsRadius: 11,
  goldCount: 10,
  goldEP: 12,
  goldRadius: 15,
  specialCount: 15,
  specialRadius: 17,
  specialEP: 6,
  likeEP: 30,
  likeSegs: 8,
  likeHeal: 0.3,
  feastTime: 3,
  yuckTime: 4,
  yuckMul: 0.6,
  magnetRadius: 60, // 기본 먹이 끌어당김

  // 감싸기
  loopMinIndex: 12,
  loopMinRadiusPerR: 4, // 최소 고리 반지름 = 내 반지름 × 이 값
  crushDelay: 1.0,
  loopCooldown: 0.6,
  comboBonus: 1.5,

  // 봇
  botCount: 20,
  botRespawnDelay: 3,
  botHunterSegments: 38,
  botGraceSeconds: 12,

  // 왕지네(천적): 45초 동안 1등을 쫓는다. 누구나 때릴 수 있고 잡으면 큰 점수
  bossSegments: 120,
  bossRadius: 30,
  bossSpeed: 150,
  bossTurn: (200 * Math.PI) / 180,
  bossHp: 1100,
  bossBite: 40,
  bossCrushFrac: 0.3, // 감싸기 압착은 보스 최대 체력의 이만큼

  // 천적: 판 중간중간 하나씩 나타난다(경보 3초 뒤 시작)
  enemyFirst: 45,
  enemyGapMin: 25, // 앞 천적이 끝난 뒤 다음까지
  enemyGapMax: 40,
  enemyWarn: 3,
  centipedeLife: 45,
  frogLife: 24,
  frogEvery: 2.6,
  frogAim: 1.1,
  frogRange: 1400,
  frogHead: 0.35, // 혀에 머리가 맞으면 최대 체력의 이만큼(몸은 0.2)
  rainLife: 18,
  rainEvery: 0.11,
  rainWarn: 1.0,
  rainRadius: 52,
  rainDamage: 0.08,
  anteaterLicks: 3,
  anteaterAim: 1.6,
  anteaterWidth: 160,
  anteaterLen: 1900,
  anteaterEat: 0.25, // 혀에 닿으면 몸의 이만큼을 뜯어 감
  childLife: 22,
  netRadius: 115,
  netSpeed: 245, // 곤충보다 빠르다: 피하려면 방향을 틀어야 함
  netEvery: 3.2,
  netAim: 0.7,
  netHold: 5, // 채집망에 갇혀 있는 시간
  birdDives: 4,
  birdDiveEvery: 4,
  birdShadowTime: 1.6,
  birdRadius: 130,
  birdDamage: 0.55, // 머리가 그림자 안: 최대 체력의 이만큼(몸만 걸리면 60%)


  // 점수(아레나 순위). 모두 판 전체로 쌓는다: 쓰러져도 남고, 봇도 같은 기준.
  // 먹은 영양 + 처치×scoreKill + 도움×scoreAssist + 압착×scoreCrush + (최고 레벨−1)×scoreLevel − 쓰러짐×scoreDeath
  scoreKill: 100,
  scoreAssist: 25,
  scoreCrush: 100,
  scoreLevel: 40,
  scoreDeath: 50,
  scoreBoss: 1500, // 왕지네 처치
} as const;

export type Config = typeof CONFIG;

export function radiusFor(evo: number, segCount: number = CONFIG.startSegments, mul = 1): number {
  const thick = Math.min(CONFIG.thickMax, Math.max(0, segCount - CONFIG.startSegments) * CONFIG.thickPerSeg);
  return CONFIG.evoRadius[Math.max(1, Math.min(3, evo))] * (1 + thick) * mul;
}

/** 다음 레벨까지 필요한 영양 */
export function nutNeed(level: number): number {
  return CONFIG.nutBase + CONFIG.nutStep * (level - 1);
}

/** 레벨 → 진화 단계(1~3) */
export function evoOf(level: number): number {
  return level >= CONFIG.evoLevels[3] ? 3 : level >= CONFIG.evoLevels[2] ? 2 : 1;
}

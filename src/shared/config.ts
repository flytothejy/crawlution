// 모든 밸런스 값은 여기 한 곳에 모은다. 서버·클라이언트가 같은 파일을 쓴다.
// 프로토타입 A: 애벌레 1종 + 봇 5마리 + 감싸기. 질문: "감싸기가 반복하고 싶을 만큼 재밌나?"

export const CONFIG = {
  tickRate: 60, // 시뮬레이션 틱(초당). 멀티 서버에서는 20으로 낮춘다.
  arenaRadius: 1500,

  // 이동
  baseSpeed: 170, // px/초
  boostMul: 2.0,
  sneakMul: 0.6,
  turnRate: (300 * Math.PI) / 180, // 초당 최대 회전(rad)
  sneakTurnMul: 1.35, // 살금살금 때 회전이 더 잘 됨
  boostMinSegments: 12, // 이보다 짧으면 부스트 불가
  boostDropInterval: 0.5, // 부스트 중 몇 초마다 마디 1개를 떨구나

  // 몸
  startSegments: 20,
  maxSegments: 120, // 프로토타입 A는 감싸기 시험을 위해 넉넉히(기획서 1단계 상한은 별도 조정)
  epPerSegment: 2, // EP 2마다 마디 1개
  baseRadius: 9,
  maxRadius: 14,
  radiusPerSegment: 0.045,
  spacingRatio: 0.72, // 마디 간격 = 반지름 × 이 값

  // 먹이
  foodCount: 260,
  foodEP: 1,
  foodRadius: 4.5,
  bigFoodCount: 18,
  bigFoodEP: 4,
  bigFoodRadius: 8,
  remainsEP: 1, // 죽은 곤충 마디 1개당
  remainsRadius: 6,

  // 감싸기
  loopMinIndex: 12, // 머리에서 이만큼 이상 떨어진 마디에 닿아야 고리
  loopMinRadius: 36, // 고리 안쪽 넓이를 원으로 환산한 반지름 최소값
  crushDelay: 1.0, // 고리가 닫힌 뒤 압착까지(초)
  loopCooldown: 0.6,
  comboBonus: 1.5,

  // 봇
  botCount: 5,
  botRespawnDelay: 3,
  botHunterSegments: 40, // 이 이상 길면 사냥꾼 봇이 감싸기를 시도
  botGraceSeconds: 12, // 판 시작 후 이 시간 동안은 사냥하지 않음
  botStartMin: 15,
  botStartMax: 50,

  // 점수
  scoreKill: 50,
  scoreCrush: 100,
} as const;

export type Config = typeof CONFIG;

export function radiusFor(segCount: number): number {
  return Math.min(CONFIG.maxRadius, CONFIG.baseRadius + segCount * CONFIG.radiusPerSegment);
}

export function spacingFor(segCount: number): number {
  return radiusFor(segCount) * CONFIG.spacingRatio;
}

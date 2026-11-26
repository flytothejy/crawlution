// 단계(봇 난이도 사다리): 3등 안이면 다음 판 한 단계 위, 하위 절반이면 한 단계 아래.
// 내 판의 봇 세기만 바꾼다(매칭과 무관). 순위 점수 = 판 점수 × 단계 배율(배율은 측정 체계로 맞춘다).
import type { Personality } from './sim';

export interface Tier {
  n: number;
  name: string;
  desc: string;
  react: number[]; // 봇 반응 지연(초) 후보 — 4개(난수 소비 수를 단계와 무관하게 같게)
  botLevel: number; // 판 시작 때 봇 레벨
  enemyGap: number; // 천적 사이 간격 배율(작을수록 자주)
  personas: [Personality, number][];
  scoreMul: number;
}

const P_BASE: [Personality, number][] = [['hunter', 0.25], ['gatherer', 0.3], ['brawler', 0.25], ['coward', 0.2]];
const P_HARD: [Personality, number][] = [['hunter', 0.32], ['gatherer', 0.2], ['brawler', 0.35], ['coward', 0.13]];

export const TIERS: Tier[] = [
  { n: 1, name: '풀숲', desc: '보통 봇', react: [0.2, 0.4, 0.4, 0.6], botLevel: 1, enemyGap: 1, personas: P_BASE, scoreMul: 1 },
  { n: 2, name: '덤불', desc: '봇이 빨라져요', react: [0.15, 0.3, 0.3, 0.45], botLevel: 1, enemyGap: 0.9, personas: P_BASE, scoreMul: 1.15 },
  { n: 3, name: '정글', desc: '봇이 공격적이고 레벨 3부터', react: [0.12, 0.25, 0.25, 0.35], botLevel: 3, enemyGap: 0.8, personas: P_HARD, scoreMul: 1.3 },
  { n: 4, name: '천적의 땅', desc: '천적이 자주 나와요', react: [0.1, 0.2, 0.2, 0.3], botLevel: 4, enemyGap: 0.65, personas: P_HARD, scoreMul: 1.5 },
];
export const tierOf = (n: number | undefined) => TIERS[Math.max(1, Math.min(TIERS.length, Math.round(n ?? 1))) - 1];

/** 판 결과로 다음 판 단계 */
export function nextTier(cur: number, rank: number, total: number): number {
  if (rank <= 3) return Math.min(TIERS.length, cur + 1);
  if (rank > total / 2) return Math.max(1, cur - 1);
  return cur;
}

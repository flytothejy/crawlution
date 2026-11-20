// 싸움 공식: 시뮬레이션·화면·봇이 같은 계산을 쓴다.
import { CONFIG } from './config';
import { beats, type Lineage } from './species';

export interface Fighter {
  stage: number;
  lineage: Lineage;
  isBoss: boolean;
}

/** a가 b를 칠 때 피해 배수(단계 차이 × 상성) */
export function dmgMult(a: Fighter, b: Fighter): number {
  if (b.isBoss) return 1;
  const sa = a.isBoss ? 6 : a.stage, sb = b.stage;
  let m = Math.max(0.35, Math.min(2.4, 1 + CONFIG.stageDmgStep * (sa - sb)));
  if (beats(a.lineage, b.lineage)) m *= CONFIG.favorMul;
  else if (beats(b.lineage, a.lineage)) m *= CONFIG.unfavorMul;
  return m;
}

/** 내 기준 상대와의 관계: 1 내가 강함, 0 비슷함, -1 상대가 강함 */
export function relation(me: Fighter, other: Fighter): -1 | 0 | 1 {
  if (other.isBoss) return -1;
  const mine = dmgMult(me, other), theirs = dmgMult(other, me);
  if (mine >= theirs * CONFIG.strongRatio) return 1;
  if (theirs >= mine * CONFIG.strongRatio) return -1;
  return 0;
}

export function biteOf(a: Fighter): number {
  if (a.isBoss) return CONFIG.bossBite;
  return CONFIG.biteDamage[a.stage] * (a.lineage === 'hunt' ? CONFIG.huntBiteMul : 1);
}

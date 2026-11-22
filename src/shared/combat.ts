// 싸움 공식(기술 수치표 '공통 공식'). 시뮬레이션·화면·봇이 같은 계산을 쓴다.
import { CONFIG } from './config';
import { FAMILY, type FamilyId } from './species';

export interface Fighter {
  level: number;
  stage: number; // 진화 단계 1~3
  family: FamilyId | null;
  isBoss: boolean;
}

const E = (stage: number) => CONFIG.evoMul[Math.max(1, Math.min(3, stage))];

/** 기준 피해 B: 30 × (1 + 0.08 × (L−1)) × E × 계열 공격 */
export function baseB(f: Fighter): number {
  if (f.isBoss || !f.family) return 80;
  return CONFIG.skillBase * (1 + CONFIG.skillPerLevel * (f.level - 1)) * E(f.stage) * FAMILY[f.family].atk;
}

/** 물기: 8 × (1 + 0.06 × (L−1)) × E × 계열 공격 */
export function biteOf(f: Fighter): number {
  if (f.isBoss || !f.family) return CONFIG.bossBite;
  return CONFIG.biteBase * (1 + CONFIG.bitePerLevel * (f.level - 1)) * E(f.stage) * FAMILY[f.family].atk;
}

/** 최대 체력: (60 × (1 + 0.1 × (L−1)) × E + 마디 × 0.6) × 계열 체력 */
export function maxHpOf(f: Fighter, segCount: number, extra = 1): number {
  if (f.isBoss || !f.family) return CONFIG.bossHp;
  return Math.round((CONFIG.hpBase * (1 + CONFIG.hpPerLevel * (f.level - 1)) * E(f.stage) + segCount * CONFIG.hpPerSeg) * FAMILY[f.family].hp * extra);
}

/** 내 기준 상대와의 관계: 1 내가 셈(레벨 3 이상 높음), 0 비슷, -1 상대가 셈 */
export function relation(me: Fighter, other: Fighter): -1 | 0 | 1 {
  if (other.isBoss) return -1;
  const d = me.level - other.level;
  if (d >= CONFIG.recoilLevelGap) return 1;
  if (d <= -CONFIG.recoilLevelGap) return -1;
  return 0;
}

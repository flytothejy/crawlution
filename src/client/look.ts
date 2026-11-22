import { BOSS_LOOK, lookFor, type Look } from '../shared/species';

/** 모습 열쇠: '종@단계' (보스는 'boss') */
export function lookKey(species: string, stage: number) {
  return species === 'boss' ? 'boss' : `${species}@${stage}`;
}

export function lookOf(key: string): Look {
  if (key === 'boss') return BOSS_LOOK;
  const [sp, st] = key.split('@');
  return lookFor(sp, Number(st) || 2);
}

import { BOSS_LOOK, lookFor, mixC, type Look } from '../shared/species';
import { V3_BY_ID } from '../shared/v3';

/** 모습 열쇠: '종@단계' (보스는 'boss') */
export function lookKey(species: string, stage: number) {
  return species === 'boss' ? 'boss' : `${species}@${stage}`;
}

/** 3판 종의 모습: 2판 종을 그대로 쓰거나, 새 모습(1단계는 애벌레) */
function v3Look(id: string, stage: number): Look | null {
  const s = V3_BY_ID.get(id);
  if (!s) return null;
  if (s.lookFrom) return lookFor(s.lookFrom, stage);
  const look = s.look!;
  if (stage > 1) return look;
  if (s.larva) return s.larva;
  const lt = (c: number) => mixC(c, 0xffffff, 0.2);
  return { ...look, body: lt(look.body), stripe: lt(look.stripe), head: lt(look.head), feats: (look.feats ?? []).filter((x) => x !== 'wings' && x !== 'wings4' && x !== 'bwings' && x !== 'stinger'), mandible: look.mandible ? { ...look.mandible, size: look.mandible.size * 0.6 } : undefined };
}

export function lookOf(key: string): Look {
  if (key === 'boss') return BOSS_LOOK;
  const [sp, st] = key.split('@');
  return v3Look(sp, Number(st) || 2) ?? lookFor(sp, Number(st) || 2);
}

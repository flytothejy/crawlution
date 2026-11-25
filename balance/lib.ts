// 밸런스 측정 공용 부품: 원하는 종·레벨의 곤충을 만들고, 허수아비를 세우고, 판을 돌린다.
import { Simulation, type Snake } from '../src/shared/sim';
import { CONFIG } from '../src/shared/config';
import { SPECIES_BY_ID } from '../src/shared/species';
import { kitOf, V3_ROSTER, v3FamOf, KIT_SLOTS } from '../src/shared/kit';
import { V3_BY_ID } from '../src/shared/v3';
import { emptyCommand, type Command } from '../src/shared/types';

// 실험: BAL_CONFIG='{"hpBase":90}' 처럼 설정값을 잠깐 바꿔 돌려 볼 수 있다(게임 코드는 그대로)
if (process.env.BAL_CONFIG) Object.assign(CONFIG as unknown as Record<string, unknown>, JSON.parse(process.env.BAL_CONFIG));

export { Simulation, CONFIG, V3_ROSTER, v3FamOf, kitOf, KIT_SLOTS, emptyCommand };
export type { Snake, Command };
export const SLOTS = ['atk', 'def', 'spc', 'ult'] as const;
export type Slot = (typeof SLOTS)[number];
export const nameOf = (id: string) => V3_BY_ID.get(id)?.name ?? id;

// Simulation의 내부 함수(도구 전용)
type Priv = {
  makeSnake: (id: number, name: string, isPlayer: boolean, sp: unknown, formId: string, traits: string[], kit: unknown) => Snake;
  fullHeal: (s: Snake) => void;
};
const priv = (sim: Simulation) => sim as unknown as Priv;

/** 빈 3판 판: 천적 없음, 봇 bots마리(나중에 바꿔 끼움) */
export function newSim(seed: number, sp: string, bots: number, level = 1, map: 'grass' | 'random' = 'grass') {
  const sim = new Simulation(seed, '나', { power: 1, bots, map, loadout: { species: sp, form: '', traits: [] }, v3: true, startLevel: level });
  return sim;
}

export function noEnemies(sim: Simulation) {
  sim.enemies.update = () => {};
  sim.enemies.next = 1e9;
}

/** id 자리 곤충을 sp 종·레벨로 새로 만든다(카드는 봇 규칙으로 자동 선택) */
export function replaceSnake(sim: Simulation, id: number, sp: string, level: number, isPlayer = false): Snake {
  const s = priv(sim).makeSnake(id, isPlayer ? '나' : `B${id}`, isPlayer, SPECIES_BY_ID.get(sp)!, '', [], kitOf(sp));
  sim.snakes[id] = s;
  sim.spawnAt(s, 0, 0, 0, CONFIG.startSegments);
  if (level > 1) sim.autoLevel(s, level - 1);
  priv(sim).fullHeal(s);
  return s;
}

export function fullHeal(sim: Simulation, s: Snake) {
  priv(sim).fullHeal(s);
}

/** 기술 칸을 쓰는 명령 */
export function castCmd(s: Snake, slot: Slot, angle: number): Command {
  const c = { ...emptyCommand(0), angle };
  if (slot === 'atk') c.skillSeq = s.lastSkillSeq + 1;
  if (slot === 'def') c.subSeq = s.lastSubSeq + 1;
  if (slot === 'spc') c.spcSeq = s.lastSpcSeq + 1;
  if (slot === 'ult') c.ultSeq = s.lastUltSeq + 1;
  return c;
}

/** 칸의 실제 재사용 대기(레벨·카드 반영). 필살기는 0 */
export function cdOf(sim: Simulation, s: Snake, slot: Slot): number {
  if (slot === 'ult') return 0;
  return (sim as unknown as { kitCdMax: (s: Snake, sl: string) => number }).kitCdMax(s, slot);
}

/** 간단한 결정적 의사 난수(측정 순서용) */
export function shard<T>(list: T[], i: number, n: number) {
  return list.filter((_, k) => k % n === i);
}

export const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const median = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : 0;
};

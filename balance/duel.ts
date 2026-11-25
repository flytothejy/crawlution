// 2층 · 1:1 대전표: 같은 레벨의 두 종을 봇 AI(싸움꾼 성격)로 붙인다.
// 쌍마다 시드 2개 × 자리 바꿔 2번. 60초 안에 못 끝나면 남은 체력 비율로 판정(10%p 안쪽이면 무승부).
import { CONFIG, type Snake, newSim, noEnemies, replaceSnake, fullHeal } from './lib';

export interface DuelRow {
  a: string;
  b: string;
  level: number;
  seed: number;
  win: 0 | 1 | 2; // 0 무승부, 1 a, 2 b
  t: number; // 걸린 시간
  hpA: number; // 끝났을 때 남은 체력 비율
  hpB: number;
  dmgA: Record<string, number>; // a가 준 피해(기술 칸별, bite·etc)
  dmgB: Record<string, number>;
  castA: Record<string, number>;
  castB: Record<string, number>;
}

const SLOT_OF: Record<string, string> = { main: 'atk', sub: 'def', spc: 'spc', ult: 'ult' };

export function duel(a: string, b: string, level: number, seed: number): DuelRow {
  const sim = newSim(seed, a, 1, level);
  noEnemies(sim);
  const A = sim.snakes[0];
  const B = replaceSnake(sim, 1, b, level, false);
  A.isPlayer = false;
  (A as Snake & { persona: string }).persona = 'brawler';
  (B as Snake & { persona: string }).persona = 'brawler';
  sim.tick = CONFIG.tickRate * (CONFIG.botGraceSeconds + 1); // 판 시작 '봐주기' 시간을 건너뛴다
  sim.foods = sim.foods.filter((f) => f.kind === 0);
  const ang = sim.rng.range(0, Math.PI * 2);
  const segs = Math.round(CONFIG.startSegments + (level - 1) * 6);
  sim.spawnAt(A, Math.cos(ang) * 150, Math.sin(ang) * 150, ang + Math.PI, segs);
  sim.spawnAt(B, -Math.cos(ang) * 150, -Math.sin(ang) * 150, ang, segs);
  for (const s of [A, B]) {
    fullHeal(sim, s);
    s.invulnT = 0;
    s.offer = null;
    s.pending = 0;
    s.ult = 0;
    s.respawnT = 999;
    s.skillCd = s.subCd = s.spcCd = 0;
  }
  const dmg = [{} as Record<string, number>, {} as Record<string, number>];
  const cast = [{} as Record<string, number>, {} as Record<string, number>];
  const t0 = sim.time;
  let win: 0 | 1 | 2 = 0;
  for (let t = 0; t < 60 * CONFIG.tickRate; t++) {
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'hit' && e.dmg > 0 && (e.by === 0 || e.by === 1) && e.snake !== e.by) {
        const k = e.src ?? (e.kind === 'bite' || e.kind === 'crit' ? 'bite' : 'etc');
        dmg[e.by][k] = (dmg[e.by][k] ?? 0) + e.dmg;
      }
      if (e.type === 'skill' && (e.snake === 0 || e.snake === 1)) {
        const k = SLOT_OF[e.slot] ?? e.slot;
        cast[e.snake][k] = (cast[e.snake][k] ?? 0) + 1;
      }
    }
    sim.events = [];
    if (!A.alive || !B.alive) {
      win = A.alive ? 1 : B.alive ? 2 : 0;
      break;
    }
  }
  const hpA = A.alive ? A.hp / A.maxHp : 0, hpB = B.alive ? B.hp / B.maxHp : 0;
  if (A.alive && B.alive) win = hpA > hpB + 0.1 ? 1 : hpB > hpA + 0.1 ? 2 : 0;
  const r = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  return { a, b, level, seed, win, t: Math.round((sim.time - t0) * 10) / 10, hpA: Math.round(hpA * 100) / 100, hpB: Math.round(hpB * 100) / 100, dmgA: r(dmg[0]), dmgB: r(dmg[1]), castA: cast[0], castB: cast[1] };
}

/** 모든 쌍(자기 자신 제외) × 시드 × 자리 바꿈 */
export function duelJobs(roster: string[], levels: number[], seeds: number[]) {
  const jobs: [string, string, number, number][] = [];
  for (const level of levels)
    for (let i = 0; i < roster.length; i++)
      for (let j = i + 1; j < roster.length; j++)
        for (const seed of seeds) {
          jobs.push([roster[i], roster[j], level, seed]);
          jobs.push([roster[j], roster[i], level, seed + 1000]);
        }
  return jobs;
}

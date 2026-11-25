// 3층 · 아레나 판: 21마리 모두 봇 AI로 5분 판을 돌려 종별 성적과 기술 칸별 실전 기여를 모은다.
// 플레이어 자리(0번)도 봇 규칙으로 돌린다(쓰러지면 레벨이 줄고 새로 시작) — 모두 같은 조건.
import { CONFIG, newSim, V3_ROSTER } from './lib';

export interface ArenaAgg {
  lives: number;
  secs: number; // 살아 있던 시간
  kills: number;
  deaths: number;
  dmg: Record<string, number>; // 기술 칸별 피해(atk·def·spc·ult·bite·etc)
  taken: number;
  casts: Record<string, number>;
  levelSum: number; // 생을 마칠 때 레벨 합
  rankPct: number; // 판 끝 점수 순위 백분위 합(1 = 1등)
  rankN: number;
}

const SLOT_OF: Record<string, string> = { main: 'atk', sub: 'def', spc: 'spc', ult: 'ult' };
const empty = (): ArenaAgg => ({ lives: 0, secs: 0, kills: 0, deaths: 0, dmg: {}, taken: 0, casts: {}, levelSum: 0, rankPct: 0, rankN: 0 });

export function arenaRound(seed: number): Record<string, ArenaAgg> {
  const sp0 = V3_ROSTER[seed % V3_ROSTER.length];
  const sim = newSim(90000 + seed, sp0, 20, 1, 'random');
  sim.snakes[0].isPlayer = false;
  const by: Record<string, ArenaAgg> = {};
  const row = (sp: string) => (by[sp] ??= empty());
  const lifeStart = new Map<number, number>();
  for (const s of sim.snakes) lifeStart.set(s.id, 0);
  const close = (id: number, died: boolean) => {
    const s = sim.snakes[id];
    const r = row(s.sp.id);
    r.lives++;
    r.secs += sim.time - (lifeStart.get(id) ?? 0);
    r.levelSum += s.level;
    if (died) r.deaths++;
    lifeStart.set(id, sim.time);
  };
  const N = CONFIG.tickRate * CONFIG.roundTime;
  for (let t = 0; t < N; t++) {
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'hit' && e.dmg > 0) {
        const v = sim.snakes[e.snake];
        if (v && !v.isBoss) row(v.sp.id).taken += e.dmg;
        if (e.by >= 0 && e.by !== e.snake) {
          const a = sim.snakes[e.by];
          if (!a || a.isBoss) continue;
          const k = e.src ?? (e.kind === 'bite' || e.kind === 'crit' ? 'bite' : 'etc');
          const r = row(a.sp.id);
          r.dmg[k] = (r.dmg[k] ?? 0) + e.dmg;
        }
      }
      if (e.type === 'skill') {
        const a = sim.snakes[e.snake];
        if (a && !a.isBoss) {
          const k = SLOT_OF[e.slot] ?? e.slot;
          const r = row(a.sp.id);
          r.casts[k] = (r.casts[k] ?? 0) + 1;
        }
      }
      if (e.type === 'death') {
        const v = sim.snakes[e.snake];
        if (!v || v.isBoss) continue;
        close(e.snake, true);
        if (e.by >= 0 && e.by !== e.snake && !sim.snakes[e.by].isBoss) row(sim.snakes[e.by].sp.id).kills++;
      }
    }
    sim.events = [];
  }
  const live = sim.snakes.filter((s) => !s.isBoss);
  for (const s of live) if (s.respawnT <= 0) close(s.id, false);
  // 판 끝 점수 순위(판 전체 누적 점수, 플레이어·봇 같은 기준)
  const order = [...live].sort((a, b) => b.score - a.score);
  order.forEach((s, i) => {
    const r = row(s.sp.id);
    r.rankPct += 1 - i / (order.length - 1);
    r.rankN++;
  });
  return by;
}

export function mergeArena(list: Record<string, ArenaAgg>[]) {
  const out: Record<string, ArenaAgg> = {};
  for (const by of list)
    for (const [sp, r] of Object.entries(by)) {
      const o = (out[sp] ??= empty());
      for (const k of ['lives', 'secs', 'kills', 'deaths', 'taken', 'levelSum', 'rankPct', 'rankN'] as const) o[k] += r[k];
      for (const [k, v] of Object.entries(r.dmg)) o.dmg[k] = (o.dmg[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.casts)) o.casts[k] = (o.casts[k] ?? 0) + v;
    }
  return out;
}

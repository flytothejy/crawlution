// 3층 · 아레나 판: 21마리 모두 봇 AI로 5분 판을 돌려 종별 성적과 기술 칸별 실전 기여를 모은다.
// 플레이어 자리(0번)도 봇으로 돌린다 — 부활 규칙이 같아서 모두 같은 조건.
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
  // 붙잡힘(공격받기 시작해 최대 체력 15% 넘게 잃은 교전): 살아남았나, 몇 초 만에 쓰러졌나
  eng: number;
  engDied: number;
  ttd: number[]; // 쓰러진 교전: 첫 피해부터 쓰러지기까지(초)
  engCc: number; // 쓰러진 교전에서 강한 제어(기절·매혹·공포·묶임)에 걸려 있던 시간 합
  engTime: number; // 쓰러진 교전 시간 합
  engDef: number; // 교전 중 방어 기술을 쓴 수
  engDefLived: number; // 그중 살아남은 수
}

const SLOT_OF: Record<string, string> = { main: 'atk', sub: 'def', spc: 'spc', ult: 'ult' };
const empty = (): ArenaAgg => ({ lives: 0, secs: 0, kills: 0, deaths: 0, dmg: {}, taken: 0, casts: {}, levelSum: 0, rankPct: 0, rankN: 0, eng: 0, engDied: 0, ttd: [], engCc: 0, engTime: 0, engDef: 0, engDefLived: 0 });

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
  // 교전 추적: 다른 곤충에게 맞기 시작하면 열고, 4초 동안 안 맞으면 '살아남음', 그 전에 쓰러지면 '쓰러짐'
  type Eng = { t0: number; last: number; dmg: number; cc: number; def: boolean };
  const eng = new Map<number, Eng>();
  const endEng = (id: number, died: boolean) => {
    const g = eng.get(id);
    if (!g) return;
    eng.delete(id);
    const s = sim.snakes[id];
    if (!died && g.dmg < s.maxHp * 0.15) return; // 스친 정도는 세지 않는다
    const r = row(s.sp.id);
    r.eng++;
    if (g.def) r.engDef++;
    if (died) {
      r.engDied++;
      r.ttd.push(Math.round((sim.time - g.t0) * 10) / 10);
      r.engCc += g.cc;
      r.engTime += sim.time - g.t0;
    } else if (g.def) r.engDefLived++;
  };
  const N = CONFIG.tickRate * CONFIG.roundTime;
  for (let t = 0; t < N; t++) {
    sim.step();
    for (const [id, g] of eng) {
      const s = sim.snakes[id];
      if (s.stunT > 0 || s.charmT > 0 || s.fearT > 0 || s.rootT > 0) g.cc += sim.dt;
      if (s.alive && sim.time - g.last > 4) endEng(id, false);
    }
    for (const e of sim.events) {
      if (e.type === 'hit' && e.dmg > 0) {
        const v = sim.snakes[e.snake];
        if (v && !v.isBoss) row(v.sp.id).taken += e.dmg;
        if (v && !v.isBoss && e.by >= 0 && e.by !== e.snake && !sim.snakes[e.by]?.isBoss) {
          const g = eng.get(e.snake) ?? { t0: sim.time, last: sim.time, dmg: 0, cc: 0, def: false };
          g.last = sim.time;
          g.dmg += e.dmg;
          eng.set(e.snake, g);
        }
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
        if (e.slot === 'sub' && eng.has(e.snake)) eng.get(e.snake)!.def = true;
        if (a && !a.isBoss) {
          const k = SLOT_OF[e.slot] ?? e.slot;
          const r = row(a.sp.id);
          r.casts[k] = (r.casts[k] ?? 0) + 1;
        }
      }
      if (e.type === 'death') {
        const v = sim.snakes[e.snake];
        if (!v || v.isBoss) continue;
        endEng(e.snake, true);
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
      for (const k of ['lives', 'secs', 'kills', 'deaths', 'taken', 'levelSum', 'rankPct', 'rankN', 'eng', 'engDied', 'engCc', 'engTime', 'engDef', 'engDefLived'] as const) o[k] += r[k] ?? 0;
      o.ttd.push(...(r.ttd ?? []));
      for (const [k, v] of Object.entries(r.dmg)) o.dmg[k] = (o.dmg[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.casts)) o.casts[k] = (o.casts[k] ?? 0) + v;
    }
  return out;
}

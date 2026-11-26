// 4층 · 탈출 실험: 방어 기술이 실제로 살려 주나.
// 체력 35%로 쫓기는 곤충(봇 AI: 체력이 낮으면 도망·탈출 기술) vs 같은 레벨 공격자(싸움꾼 봇).
// 방어 기술이 준비된 경우와 재사용 대기 중인 경우를 같은 시드로 비교한다 → '기술 덕분에 산 비율'.
// (아레나의 '쓴 교전 생존율'은 질 때 꺼내 쓰는 기술일수록 낮게 나와서 효과를 잴 수 없다)
import { CONFIG, type Snake, newSim, noEnemies, replaceSnake, fullHeal } from './lib';

/** 계열마다 대표 공격자 */
export const ATTACKERS = ['rhino', 'kingmantis', 'hornet', 'v3:wangjine', 'orbspider', 'v3:wangant', 'v3:swallow', 'emperor'];
export const ESCAPE_LEVEL = 10;

export interface EscapeRow {
  sp: string;
  atk: string;
  seed: number;
  ready: boolean; // 방어 기술 준비됨
  lived: boolean; // 10초 뒤 살아 있음
  t: number; // 버틴 시간
  used: boolean; // 방어 기술을 썼나
}

export function escapeRun(sp: string, atk: string, seed: number, ready: boolean): EscapeRow {
  const sim = newSim(seed, sp, 1, ESCAPE_LEVEL);
  noEnemies(sim);
  sim.foods = sim.foods.filter((f) => f.kind === 0);
  const V = sim.snakes[0];
  const A = replaceSnake(sim, 1, atk, ESCAPE_LEVEL, false);
  V.isPlayer = false;
  (V as Snake & { persona: string }).persona = 'gatherer';
  (A as Snake & { persona: string }).persona = 'brawler';
  sim.tick = CONFIG.tickRate * (CONFIG.botGraceSeconds + 1);
  const segs = Math.round(CONFIG.startSegments + (ESCAPE_LEVEL - 1) * 6);
  const ang = sim.rng.range(0, Math.PI * 2);
  // 공격자가 뒤에서 140 거리로 붙어 온다
  sim.spawnAt(V, 0, 0, ang, segs);
  sim.spawnAt(A, -Math.cos(ang) * 140, -Math.sin(ang) * 140, ang, segs);
  for (const s of [V, A]) {
    fullHeal(sim, s);
    s.invulnT = 0;
    s.spawnShield = false;
    s.offer = null;
    s.pending = 0;
    s.ult = 0;
    s.respawnT = 999;
    s.skillCd = s.subCd = s.spcCd = 0;
  }
  V.hp = V.maxHp * 0.35;
  V.hurtT = 0;
  V.skillCd = V.spcCd = 99; // 공격 기술로 맞서 이기는 경우를 빼고, 방어 기술만 본다
  if (!ready) V.subCd = 99;
  let used = false;
  const t0 = sim.time;
  for (let t = 0; t < 10 * CONFIG.tickRate && V.alive; t++) {
    sim.step();
    for (const e of sim.events) if (e.type === 'skill' && e.snake === 0 && e.slot === 'sub') used = true;
    sim.events = [];
  }
  return { sp, atk, seed, ready, lived: V.alive, t: Math.round((sim.time - t0) * 10) / 10, used };
}

export function escapeJobs(roster: string[], seeds: number[]) {
  const jobs: [string, string, number, boolean][] = [];
  for (const sp of roster) for (const atk of ATTACKERS) for (const seed of seeds) for (const ready of [true, false]) if (atk !== sp) jobs.push([sp, atk, seed, ready]);
  return jobs;
}

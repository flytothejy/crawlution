// 맵 크기 비교: 반지름마다 8분 판을 돌려 '얼마나 자주 붙는가'를 잰다.
// 먹이·꿀방울·특별 먹이·큰 먹이 수는 넓이에 맞춰 줄인다(먹이 밀도는 같게 → 성장 속도는 거의 그대로).
// 사용: npx tsx scripts/mapsize.ts [판 수=6] [반지름 목록=3300,2700,2300,2000]
import { Simulation } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';
import { FAMILIES } from '../src/shared/species';

const N = Number(process.argv[2] ?? 6);
const RADII = (process.argv[3] ?? '3300,2700,2300,2000').split(',').map(Number);
const BASE = { r: 3300, food: CONFIG.foodCount, big: CONFIG.bigFoodCount, gold: CONFIG.goldCount, special: CONFIG.specialCount };
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const mmss = (v: number) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
const rows: string[][] = [];

for (const R of RADII) {
  const k = (R / BASE.r) ** 2;
  Object.assign(CONFIG, { arenaRadius: R, foodCount: Math.round(BASE.food * k), bigFoodCount: Math.round(BASE.big * k), goldCount: Math.max(4, Math.round(BASE.gold * k)), specialCount: Math.max(10, Math.round(BASE.special * k)) });
  const M: Record<string, number[]> = {};
  const add = (key: string, v: number) => (M[key] ??= []).push(v);
  for (let g = 0; g < N; g++) {
    const fam = FAMILIES[g % FAMILIES.length];
    const sim = new Simulation(5000 + g, '나', { power: 1, bots: 20, map: 'random', loadout: { species: fam.species[0], form: fam.forms[g % 3].id, traits: ['molt', 'sprint'] } });
    const p = sim.snakes[0];
    p.lives = 99;
    const pairLast = new Map<number, number>(); // 두 곤충이 마지막으로 주고받은 때
    const lastFight = new Map<number, number>(); // 곤충마다 마지막 싸움
    const recentBy = new Map<number, Map<number, number>>(); // 맞은 곤충 → 때린 곤충별 마지막 시각
    const firstEng = new Map<number, number>();
    let engages = 0, deaths = 0, kills = 0, gang = 0, enemyD = 0, fightSamples = 0, samples = 0;
    const lv: Record<number, number[]> = { 5: [], 10: [] };
    const fights: number[] = [];
    const firstHit = new Map<number, number>();
    const born0 = new Set(sim.snakes.map((s) => s.id));
    for (let t = 0; t < CONFIG.tickRate * CONFIG.roundTime; t++) {
      sim.setCommand(0, botThink(sim, p, sim.dt));
      sim.step();
      const now = sim.time;
      for (const e of sim.events) {
        if (e.type === 'respawn' && e.snake !== p.id) (born0.delete(e.snake), firstHit.delete(e.snake));
        if (e.type === 'levelUp' && (e.level === 5 || e.level === 10) && born0.has(e.snake)) lv[e.level].push(now);
        if (e.type === 'hit' && e.dmg > 0 && e.by >= 0 && e.by !== e.snake) {
          const a = sim.snakes[e.by], b = sim.snakes[e.snake];
          if (!a || !b || a.isBoss || b.isBoss) continue;
          const key = Math.min(a.id, b.id) * 100 + Math.max(a.id, b.id);
          if ((pairLast.get(key) ?? -99) < now - 6) {
            engages++;
            for (const id of [a.id, b.id]) if (!firstEng.has(id) && born0.has(id)) firstEng.set(id, now);
          }
          pairLast.set(key, now);
          lastFight.set(a.id, now), lastFight.set(b.id, now);
          (recentBy.get(b.id) ?? recentBy.set(b.id, new Map()).get(b.id)!).set(a.id, now);
          if (!firstHit.has(b.id)) firstHit.set(b.id, now);
        }
        if (e.type === 'death') {
          const v = sim.snakes[e.snake];
          if (v.isBoss) continue;
          deaths++;
          if (e.cause === 'enemy') enemyD++;
          if (e.by >= 0 && e.by !== e.snake && !sim.snakes[e.by].isBoss) kills++;
          const rb = recentBy.get(v.id);
          if (rb && [...rb.values()].filter((x) => x > now - 5).length >= 2) gang++;
          recentBy.delete(v.id);
          const fh = firstHit.get(v.id);
          if (fh !== undefined && e.cause !== 'enemy') fights.push(now - fh);
          firstHit.delete(v.id);
        }
      }
      sim.events = [];
      if (t % 30 === 0)
        for (const s of sim.snakes) {
          if (s.isBoss || !s.alive) continue;
          samples++;
          if ((lastFight.get(s.id) ?? -99) > now - 3) fightSamples++;
        }
    }
    const n = sim.snakes.filter((s) => !s.isBoss).length;
    add('eng', (engages * 2) / n / (CONFIG.roundTime / 60));
    add('fightFrac', fightSamples / samples);
    add('first', avg([...firstEng.values()]));
    add('kills', kills / n);
    add('deaths', deaths);
    add('gang', deaths ? gang / deaths : 0);
    add('enemy', deaths ? enemyD / deaths : 0);
    add('lv5', avg(lv[5])), add('lv10', avg(lv[10]));
    add('endLv', avg(sim.snakes.filter((s) => !s.isBoss && s.alive).map((s) => s.level)));
    for (const f of fights) add('fight', f);
    process.stderr.write('.');
  }
  rows.push([String(R), `${Math.round(k * 100)}%`, avg(M.eng).toFixed(2), `${Math.round(avg(M.fightFrac) * 100)}%`, mmss(avg(M.first)), avg(M.kills).toFixed(1), `${Math.round(avg(M.gang) * 100)}%`, `${Math.round(avg(M.enemy) * 100)}%`, mmss(avg(M.lv5)), mmss(avg(M.lv10)), avg(M.endLv).toFixed(1), med(M.fight).toFixed(1)]);
  console.error(` R=${R}`);
}
console.log(['반지름', '넓이', '붙음/분', '싸우는 시간', '첫 싸움', '처치/마리', '몰매 쓰러짐', '천적 쓰러짐', 'Lv5', 'Lv10', '끝 레벨', '싸움 초'].join('\t'));
for (const r of rows) console.log(r.join('\t'));

// 2판 판 단위 측정: 플레이어 자리도 봇 AI로 8분 판을 돌려 '수치를 맞추는 방법' 표의 목표를 잰다.
// 사용: npx tsx scripts/balance.ts [판 수=20]
import { Simulation } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';
import { FAMILIES } from '../src/shared/species';

const N = Number(process.argv[2] ?? 20);
const R: Record<string, number[]> = {};
const add = (k: string, v: number) => (R[k] ??= []).push(v);
const avg = (a: number[] = []) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const med = (a: number[] = []) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? b[Math.floor(b.length / 2)] : NaN;
};

for (let g = 0; g < N; g++) {
  const fam = FAMILIES[g % FAMILIES.length];
  const sim = new Simulation(1000 + g, '나', { power: 1, bots: 20, map: 'random', loadout: { species: fam.species[0], form: fam.forms[g % 3].id, traits: ['molt', 'sprint'] } });
  const p = sim.snakes[0];
  p.lives = 99;
  // 살아 있는 동안의 기록(봇은 쓰러지면 다시 시작하므로 '한 생' 단위로 잰다)
  const born = new Map<number, number>();
  const lv10 = new Map<number, number>();
  const firstHit = new Map<number, number>();
  let foodNut = 0, remNut = 0, deaths = 0, lowWins = 0, kills = 0, enemyDeaths = 0, ultKills = 0, ults = 0, skillDmg = 0, totalDmg = 0;
  for (const s of sim.snakes) born.set(s.id, 0);
  const origFeed = sim.feed.bind(sim);
  for (let t = 0; t < CONFIG.tickRate * CONFIG.roundTime; t++) {
    sim.setCommand(0, botThink(sim, p, sim.dt));
    // 영양 출처: 먹기 직전 먹이 종류를 본다
    const before = new Map(sim.snakes.map((s) => [s.id, s.totalNut]));
    const foodKinds = new Map<number, number>();
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'respawn' && e.snake !== p.id) (born.set(e.snake, sim.time), firstHit.delete(e.snake)); // 플레이어는 쓰러져도 레벨을 지킨다
      // 처음부터 살아 있는 곤충만(중간 참여 봇은 판 평균 레벨 −2로 들어와 빨리 닿는다)
      if (e.type === 'levelUp' && (e.level === 5 || e.level === 10) && born.get(e.snake) === 0) lv10.set(e.snake * 100 + e.level, sim.time);
      if (e.type === 'hit' && e.dmg > 0) {
        if (!firstHit.has(e.snake)) firstHit.set(e.snake, sim.time);
        totalDmg += e.dmg;
        if (e.kind === 'skill' || e.kind === 'ult' || e.kind === 'minion' || e.kind === 'poison') skillDmg += e.dmg;
      }
      if (e.type === 'eat') foodKinds.set(e.snake, (foodKinds.get(e.snake) ?? 0) + (e.big ? 0 : 1));
      if (e.type === 'skill' && e.slot === 'ult') ults++;
      if (e.type === 'death') {
        const v = sim.snakes[e.snake];
        if (v.isBoss) continue;
        deaths++;
        if (e.cause === 'enemy') enemyDeaths++;
        if (e.cause === 'ult') ultKills++;
        const fh = firstHit.get(e.snake);
        if (fh !== undefined && e.cause !== 'enemy' && e.cause !== 'crush') add('fight', sim.time - fh);
        firstHit.delete(e.snake);
        if (e.by >= 0 && e.by !== e.snake && !sim.snakes[e.by].isBoss) {
          kills++;
          if (sim.snakes[e.by].level < v.level) lowWins++;
        }
      }
    }
    sim.events = [];
    void before;
    void origFeed;
  }
  // 성장 출처: 잔해는 그 곤충 영양의 30% → 대략 쓰러짐 × 평균 30%로 어림하지 않고, 먹은 잔해를 따로 센다
  void foodNut;
  void remNut;
  for (const [k, v] of lv10) add(k % 100 === 10 ? 'lv10' : 'lv5', v);
  if (lv10.has(p.id * 100 + 10)) add('pLv10', lv10.get(p.id * 100 + 10)!);
  add('endLv', avg(sim.snakes.filter((s) => !s.isBoss && s.alive).map((s) => s.level)));
  add('playerLv', p.level);
  add('deaths', deaths);
  add('lowWin', kills ? lowWins / kills : 0);
  add('enemy', deaths ? enemyDeaths / deaths : 0);
  add('ults', ults / 21);
  add('ultKill', kills ? ultKills / kills : 0);
  add('skillShare', totalDmg ? skillDmg / totalDmg : 0);
  process.stdout.write('.');
}
console.log();
const pct = (v: number) => `${Math.round(v * 100)}%`;
const mmss = (v: number) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
console.log(`판 ${N}개(계열을 돌아가며 플레이어 자리에 둠)`);
console.log(`성충(Lv5) 도달: 평균 ${mmss(avg(R.lv5))}   목표 1:20`);
console.log(`각성(Lv10) 도달: 평균 ${mmss(avg(R.lv10))}(${R.lv10?.length ?? 0}마리) · 플레이어 ${mmss(avg(R.pLv10))}   목표 3:30~4:00`);
console.log(`판 끝 평균 레벨(살아 있는 곤충): ${avg(R.endLv).toFixed(1)}  플레이어 ${avg(R.playerLv).toFixed(1)}   목표 14~15`);
console.log(`싸움 시간(맞기 시작~쓰러짐) 중간값: ${med(R.fight).toFixed(1)}초   목표 5~8초`);
console.log(`낮은 레벨이 이긴 비율: ${pct(avg(R.lowWin))}   목표 10~15%`);
console.log(`필살기: 곤충당 판마다 ${avg(R.ults).toFixed(1)}번, 필살기로 끝난 처치 ${pct(avg(R.ultKill))}   목표 3~5번, 30% 이하`);
console.log(`천적으로 쓰러진 비율: ${pct(avg(R.enemy))}   목표 8~15%`);
console.log(`기술 피해 비중: ${pct(avg(R.skillShare))}`);
console.log(`판당 쓰러짐: ${avg(R.deaths).toFixed(0)}`);

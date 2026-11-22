// 밸런스 분석: 화면 없이 여러 판을 돌려 진화 속도·단계 분포·싸움 양상을 잰다.
// 사용: npx tsx scripts/balance.ts <시작 시드> <판 수> > out.json
// 플레이어도 봇 AI로 조종하고, 8분을 끝까지 보려고 목숨은 넉넉히 준다(쓰러진 횟수는 따로 센다).
import { Simulation } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';

const seed0 = Number(process.argv[2] ?? 1);
const rounds = Number(process.argv[3] ?? 1);

interface Life {
  id: number;
  born: number; // 태어난 시각(초)
  startStage: number;
  reach: Record<number, number>; // 단계 → 태어난 뒤 걸린 시간
  player: boolean;
}

const out = {
  rounds: 0,
  lives: [] as Life[],
  // 분 단위 단계 분포(살아 있는 곤충-초)
  stageByMin: Array.from({ length: 9 }, () => [0, 0, 0, 0, 0, 0]),
  playerStageTime: [0, 0, 0, 0, 0, 0],
  kills: [] as { t: number; ks: number; vs: number; kl: number; vl: number; cause: string; dur: number; enemy?: string }[],
  dmg: {} as Record<string, number>,
  epSrc: {} as Record<string, number>,
  skillCasts: 0,
  snakeSeconds: 0,
  reevolve: 0,
  molts: 0,
  playerDeaths: 0,
  playerFinal: [] as { stage: number; len: number; rank: number; score: number; kills: number; st: number[]; reach5: number }[],
  lineage: {} as Record<string, { time: number; kills: number; deaths: number; dmg: number }>,
  top3Lineage: {} as Record<string, number>,
  fightDur: [] as number[],
};

const kindName = ['food', 'big', 'remains', 'gem', 'special'];

for (let r = 0; r < rounds; r++) {
  const sim = new Simulation(seed0 + r);
  const p = sim.snakes[0];
  p.lives = 9999;
  const dt = sim.dt;
  const lives = new Map<number, Life>();
  const prevStage = new Map<number, number>();
  const prevAlive = new Map<number, boolean>();
  const engage = new Map<number, { start: number; last: number }>(); // 맞기 시작한 시각
  const newLife = (id: number, stage: number, player: boolean) => {
    const l: Life = { id, born: sim.time, startStage: stage, reach: { [stage]: 0 }, player };
    lives.set(id, l);
    out.lives.push(l);
  };
  for (const s of sim.snakes) if (!s.isBoss) newLife(s.id, s.stage, s.isPlayer);
  let playerReach5 = -1;
  const ticks = CONFIG.tickRate * CONFIG.roundTime;
  for (let t = 0; t < ticks && sim.state === 'playing'; t++) {
    // 이번 틱에 먹힐 먹이의 종류를 알아 두려고 위치 → 종류 표를 만든다
    const fmap = new Map<string, { kind: number; ep: number }>();
    for (const f of sim.foods) fmap.set(`${f.x},${f.y}`, { kind: f.kind, ep: f.ep });
    sim.setCommand(0, botThink(sim, p, dt));
    sim.step();
    const now = sim.time;
    const evs = sim.events;
    sim.events = []; // 실제 게임에서는 snapshot()이 비운다
    for (const e of evs) {
      if (e.type === 'eat') {
        const f = fmap.get(`${e.x},${e.y}`);
        let k = f ? kindName[f.kind] : 'moved';
        let ep = f ? f.ep : 0;
        if (e.special !== undefined) (k = e.taste === 1 ? 'like' : e.taste === -1 ? 'hate' : 'special'), (ep = e.taste === 1 ? CONFIG.likeEP : e.taste === -1 ? 0 : CONFIG.specialEP);
        out.epSrc[k] = (out.epSrc[k] ?? 0) + ep;
      } else if (e.type === 'hit' && e.dmg > 0) {
        out.dmg[e.kind] = (out.dmg[e.kind] ?? 0) + e.dmg;
        const by = e.by >= 0 ? sim.snakes[e.by] : null;
        if (by && !by.isBoss && by.stage >= 2) {
          const L = (out.lineage[by.lineage] ??= { time: 0, kills: 0, deaths: 0, dmg: 0 });
          L.dmg += e.dmg;
        }
        const g = engage.get(e.snake);
        if (!g || now - g.last > 5) engage.set(e.snake, { start: now, last: now });
        else g.last = now;
      } else if (e.type === 'skill') out.skillCasts++;
      else if (e.type === 'molt') {
        out.molts++;
        const s = sim.snakes[e.snake];
        if ((prevStage.get(e.snake) ?? 0) === 5) out.reevolve++;
        void s;
      } else if (e.type === 'death') {
        const v = sim.snakes[e.snake];
        if (v.isBoss) continue;
        const k = e.by >= 0 ? sim.snakes[e.by] : null;
        const g = engage.get(e.snake);
        const dur = g && now - g.last < 5 ? now - g.start : 0;
        out.kills.push({ t: now, ks: k ? (k.isBoss ? 9 : k.stage) : 0, vs: v.stage, kl: k ? k.segCount : 0, vl: v.segCount, cause: e.cause, dur, enemy: e.enemy });
        if (k && !k.isBoss && dur > 0) out.fightDur.push(dur);
        engage.delete(e.snake);
        if (v.isPlayer) out.playerDeaths++;
        if (v.stage >= 2) (out.lineage[v.lineage] ??= { time: 0, kills: 0, deaths: 0, dmg: 0 }).deaths++;
        if (k && !k.isBoss && k.stage >= 2) (out.lineage[k.lineage] ??= { time: 0, kills: 0, deaths: 0, dmg: 0 }).kills++;
      }
    }
    // 단계 변화·새 삶 기록, 시간 집계
    const min = Math.min(8, Math.floor(now / 60));
    for (const s of sim.snakes) {
      if (s.isBoss) continue;
      const wasAlive = prevAlive.get(s.id) ?? true;
      if (s.alive && !wasAlive && !s.isPlayer) newLife(s.id, s.stage, false);
      prevAlive.set(s.id, s.alive);
      if (!s.alive) continue;
      const life = lives.get(s.id)!;
      if (life.reach[s.stage] === undefined) life.reach[s.stage] = now - life.born;
      if (s.isPlayer && s.stage === 5 && playerReach5 < 0) playerReach5 = now;
      prevStage.set(s.id, s.stage);
      out.stageByMin[min][s.stage] += dt;
      out.snakeSeconds += dt;
      if (s.isPlayer) out.playerStageTime[s.stage] += dt;
      if (s.stage >= 2) (out.lineage[s.lineage] ??= { time: 0, kills: 0, deaths: 0, dmg: 0 }).time += dt;
    }
  }
  // 판 끝
  const ranked = sim.snakes.filter((s) => !s.isBoss).sort((a, b) => b.score - a.score);
  for (const s of ranked.slice(0, 3)) out.top3Lineage[s.lineage] = (out.top3Lineage[s.lineage] ?? 0) + 1;
  out.playerFinal.push({ stage: p.stage, len: p.segCount, rank: ranked.indexOf(p) + 1, score: p.score, kills: p.kills, st: p.st.slice(), reach5: playerReach5 });
  out.rounds++;
  process.stderr.write(`round ${seed0 + r} done\n`);
}
console.log(JSON.stringify(out));

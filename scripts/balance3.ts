// 3판 밸런스 측정: 21마리(플레이어 자리도 봇 AI) 5분 판을 여러 번 돌려 계열·종별 성적을 낸다.
// 사용: npx tsx scripts/balance3.ts [판 수=8] [시작 시드=0] [출력 json]
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';
import { V3_ROSTER, v3FamOf } from '../src/shared/kit';

const N = Number(process.argv[2] ?? 8);
const SEED = Number(process.argv[3] ?? 0);
const OUT = process.argv[4];

type Row = { [k: string]: number; lives: number; dmg: number; dmgSkill: number; dmgBite: number; kills: number; deaths: number; peak: number; levelSum: number; ultUses: number; casts: number; secs: number };
const by: Record<string, Row> = {};
const row = (sp: string) => (by[sp] ??= { lives: 0, dmg: 0, dmgSkill: 0, dmgBite: 0, kills: 0, deaths: 0, peak: 0, levelSum: 0, ultUses: 0, casts: 0, secs: 0 });

const t0 = Date.now();
for (let g = SEED; g < SEED + N; g++) {
  const sp = V3_ROSTER[g % V3_ROSTER.length];
  const sim = new Simulation(5000 + g, '나', { power: 1, bots: 20, map: 'random', loadout: { species: sp, form: '', traits: ['molt', 'sprint'] }, v3: true });
  const p = sim.snakes[0];
  p.lives = 99;
  const lifeStart = new Map<number, number>();
  const closeLife = (id: number, died: boolean) => {
    const s = sim.snakes[id];
    const r = row(s.sp.id);
    r.lives++;
    r.peak += s.score;
    r.levelSum += s.level;
    r.ultUses += s.ultUses;
    r.secs += sim.time - (lifeStart.get(id) ?? 0);
    if (died) r.deaths++;
    lifeStart.set(id, sim.time);
  };
  for (const s of sim.snakes) lifeStart.set(s.id, 0);
  const steps = CONFIG.tickRate * CONFIG.roundTime;
  for (let t = 0; t < steps; t++) {
    sim.setCommand(0, botThink(sim, p, sim.dt));
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'hit' && e.dmg > 0 && e.by >= 0 && e.by !== e.snake) {
        const a = sim.snakes[e.by];
        if (!a || a.isBoss) continue;
        const r = row(a.sp.id);
        r.dmg += e.dmg;
        if (e.kind === 'bite') r.dmgBite += e.dmg;
        else r.dmgSkill += e.dmg;
        r['k_' + e.kind] = (r['k_' + e.kind] ?? 0) + e.dmg;
      }
      if (e.type === 'skill') {
        const a = sim.snakes[e.snake];
        if (a && !a.isBoss) row(a.sp.id).casts++;
      }
      if (e.type === 'death') {
        const v = sim.snakes[e.snake];
        if (!v || v.isBoss) continue;
        // 죽는 순간의 점수·레벨로 그 생을 닫는다
        closeLife(e.snake, true);
        const vr = row(v.sp.id);
        vr['d_' + e.cause] = (vr['d_' + e.cause] ?? 0) + 1;
        if (e.by >= 0 && e.by !== e.snake && !sim.snakes[e.by].isBoss) row(sim.snakes[e.by].sp.id).kills++;
      }
    }
    sim.events = [];
  }
  for (const s of sim.snakes) if (!s.isBoss && s.respawnT <= 0) closeLife(s.id, false);
  process.stderr.write(`판 ${g + 1 - SEED}/${N} (${sp}) ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}

if (OUT) writeFileSync(OUT, JSON.stringify(by));
else {
  const fam: Record<string, Row> = {};
  for (const [sp, r] of Object.entries(by)) {
    const f = (fam[v3FamOf(sp)] ??= { lives: 0, dmg: 0, dmgSkill: 0, dmgBite: 0, kills: 0, deaths: 0, peak: 0, levelSum: 0, ultUses: 0, casts: 0, secs: 0 });
    for (const k of Object.keys(r) as (keyof Row)[]) f[k] += r[k];
  }
  for (const [k, r] of Object.entries(fam)) console.log(k, (r.kills / Math.max(1, r.deaths)).toFixed(2), (r.dmg / (r.secs / 60)).toFixed(0));
}

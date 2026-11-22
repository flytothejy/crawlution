// 종·갈래·기술 세기 분석. 게임 코드는 건드리지 않고 바깥에서 기록만 한다.
//   npx tsx scripts/species.ts field <시작 시드> <판 수> > field.json   실전 통계(8분 판)
//   npx tsx scripts/species.ts duel <시작 시드> <짝당 반복> > duel.json  같은 단계 1:1 대결(무작위 출발·조준 흔들림)
//   npx tsx scripts/species.ts ablate <시작 시드> <종당 반복> > ablate.json  같은 종끼리 한쪽만 기술 금지 → 기술 자체의 가치
// 요약: node scripts/species-report.cjs field.json... duel.json...
import { Simulation, type Snake } from '../src/shared/sim';
import { botThink, wantSkill } from '../src/shared/bot';
import type { Command } from '../src/shared/types';
import { CONFIG } from '../src/shared/config';
import { CYCLE, SPECIES } from '../src/shared/species';
import type { HitKind } from '../src/shared/types';

const mode = process.argv[2] ?? 'field';
const meta = Object.fromEntries(SPECIES.map((x) => [x.id, { name: x.name, stage: x.stage, lineage: x.lineage, skill: x.skillName }]));
const seed0 = Number(process.argv[3] ?? 1);
const n = Number(process.argv[4] ?? 1);

interface Rec {
  time: number; // 살아 있던 시간(초)
  dealt: Record<string, number>; // 준 피해(종류별)
  taken: number; // 실제로 받은 피해
  raw: number; // 깎이기 전 들어온 피해
  blocked: number; // 통째로 막은 피해(무적·방패·날기)
  kills: number;
  skillKills: number;
  deaths: number;
  casts: number;
  skillHits: number; // 기술로 맞힌 횟수
}
const blank = (): Rec => ({ time: 0, dealt: {}, taken: 0, raw: 0, blocked: 0, kills: 0, skillKills: 0, deaths: 0, casts: 0, skillHits: 0 });

/** 피해 함수를 감싸서 원래 피해·실제 피해를 기록 */
function watchDamage(sim: Simulation, rec: (sp: string) => Rec) {
  const orig = sim.damage.bind(sim);
  sim.damage = ((t: Snake, amount: number, by: number, kind: HitKind, ...rest: unknown[]) => {
    const pre = t.alive && t.netT <= 0 && amount > 0;
    const blockedNow = pre && (t.invulnT > 0 || (t.shieldT > 0 && t.shieldMode === 'nocut') || t.flyT > 0);
    const act = (orig as (...a: unknown[]) => number)(t, amount, by, kind, ...rest);
    if (pre && !t.isBoss) {
      const r = rec(t.species.id);
      r.raw += amount;
      r.taken += act;
      if (blockedNow) r.blocked += amount;
    }
    const a = by >= 0 ? sim.snakes[by] : null;
    if (a && !a.isBoss && act > 0) {
      const r = rec(a.species.id);
      r.dealt[kind] = (r.dealt[kind] ?? 0) + act;
      if (kind === 'skill') r.skillHits++;
    }
    return act;
  }) as typeof sim.damage;
}

/** 대결용 AI: 상대 몸통(앞쪽 1/3)을 계속 노리고, 기술은 봇과 같은 규칙으로 쓴다 */
const aimAt = new Map<number, { frac: number; next: number; react: number }>();
function duelThink(sim: Simulation, s: Snake, o: Snake, noSkill = false): Command {
  // 사람처럼 흔들리게: 노리는 몸통 위치를 1초마다 바꾸고, 기술은 0~0.6초 늦게 반응
  let a = aimAt.get(s.id);
  if (!a || sim.time >= a.next) aimAt.set(s.id, (a = { frac: sim.rng.range(0.15, 0.6), next: sim.time + sim.rng.range(0.6, 1.4), react: a?.react ?? 0 }));
  const i = Math.max(1, Math.floor(o.segN * a.frac));
  const tx = o.segs[i * 2], ty = o.segs[i * 2 + 1];
  const angle = Math.atan2(ty - s.y, tx - s.x);
  const d = Math.hypot(tx - s.x, ty - s.y);
  const scared = s.hp < s.maxHp * 0.35;
  let skill = false;
  if (!noSkill && s.skillCd <= 0 && s.species.parts.length > 0 && s.moltT <= 0 && wantSkill(sim, s, scared, o)) {
    if (a.react <= 0) a.react = sim.time + sim.rng.range(0, 0.6);
    if (sim.time >= a.react) ((skill = true), (a.react = 0));
  } else a.react = 0;
  return { angle, boost: d > 220, sneak: false, skillSeq: s.lastSkillSeq + (skill ? 1 : 0), moltSeq: s.lastMoltSeq, moltChoice: 0 };
}

if (mode === 'field') {
  const out: Record<string, Rec> = {};
  const rec = (sp: string) => (out[sp] ??= blank());
  for (let r = 0; r < n; r++) {
    const sim = new Simulation(seed0 + r);
    const p = sim.snakes[0];
    p.lives = 9999;
    watchDamage(sim, rec);
    const ticks = CONFIG.tickRate * CONFIG.roundTime;
    for (let t = 0; t < ticks && sim.state === 'playing'; t++) {
      sim.setCommand(0, botThink(sim, p, sim.dt));
      sim.step();
      const evs = sim.events;
      sim.events = [];
      for (const e of evs) {
        if (e.type === 'skill') rec(e.species).casts++;
        else if (e.type === 'death') {
          const v = sim.snakes[e.snake];
          if (v.isBoss) continue;
          rec(v.species.id).deaths++;
          const k = e.by >= 0 ? sim.snakes[e.by] : null;
          if (k && !k.isBoss && k.id !== v.id) {
            rec(k.species.id).kills++;
            if (e.cause === 'skill') rec(k.species.id).skillKills++;
          }
        }
      }
      for (const s of sim.snakes) if (s.alive && !s.isBoss) rec(s.species.id).time += sim.dt;
    }
    process.stderr.write(`field ${seed0 + r}\n`);
  }
  console.log(JSON.stringify({ mode, rounds: n, out, meta }));
} else {
  // 같은 단계·같은 길이 두 종을 경기장 가운데에 마주 보게 두고 한쪽이 쓰러질 때까지
  const results: { stage: number; a: string; b: string; win: string | null; t: number; hpLeft: number; aRec: Rec; bRec: Rec }[] = [];
  let seed = seed0;
  // ablate: 같은 종끼리, 한쪽만 기술을 못 쓰게 → 기술 자체의 가치
  const ablate = mode === 'ablate';
  for (let stage = 2; stage <= 5; stage++) {
    for (let i = 0; i < CYCLE.length; i++)
      for (let j = ablate ? i : i + 1; j < (ablate ? i + 1 : CYCLE.length); j++)
        for (let rep = 0; rep < n; rep++) {
          const [la, lb] = rep % 2 ? [CYCLE[j], CYCLE[i]] : [CYCLE[i], CYCLE[j]]; // 자리 바꿔 가며
          const skillSide = rep % 2; // ablate에서 기술을 쓰는 쪽(0=A, 1=B)
          const sim = new Simulation(seed++, '나', 1, 'grass', { power: 1, bots: 1, map: 'grass' });
          sim.map.rocks = [];
          sim.map.puddles = [];
          sim.enemies.next = 1e9;
          sim.tick = Math.ceil((CONFIG.botGraceSeconds + 1) * CONFIG.tickRate); // 봇의 시작 유예 시간 넘기기
          const A = sim.snakes[0], B = sim.snakes[1];
          A.lives = 99;
          B.isPlayer = true; // 두 쪽 모두 대결 AI가 조종(봇 AI가 끼어들지 않게)
          B.lives = 99;
          const recs: Record<number, Rec> = { [A.id]: blank(), [B.id]: blank() };
          watchDamage(sim, (sp) => (sp === A.species.id ? recs[A.id] : recs[B.id])); // ablate(같은 종)에서는 기록이 한쪽에 몰리지만 승패만 쓴다
          const segs = CONFIG.botStartSegs[stage];
          aimAt.clear();
          const dist = sim.rng.range(200, 380), base = sim.rng.range(0, Math.PI * 2);
          for (const [s, l, side] of [[A, la, -1], [B, lb, 1]] as const) {
            (sim as unknown as { setForm: (s: Snake, st: number, l: string) => void }).setForm(s, stage, l);
            const x = Math.cos(base) * dist * side, y = Math.sin(base) * dist * side;
            const ang = Math.atan2(-y, -x) + sim.rng.range(-1.2, 1.2);
            (sim as unknown as { spawnAt: (s: Snake, x: number, y: number, a: number, n: number) => void }).spawnAt(s, x, y, ang, Math.round(segs * sim.rng.range(0.9, 1.1)));
            (sim as unknown as { fullHeal: (s: Snake) => void }).fullHeal(s);
            s.invulnT = 0;
            s.gauge = -1e9; // 대결 중 탈피 금지
            s.st = [0, 0, 0, 0];
          }
          let win: string | null = null, hpLeft = 0;
          const maxT = 60 * CONFIG.tickRate;
          let t = 0;
          for (; t < maxT; t++) {
            sim.foods = []; // 먹이로 회복하는 변수 없애기
            sim.setCommand(0, duelThink(sim, A, B, ablate && skillSide !== 0));
            sim.setCommand(1, duelThink(sim, B, A, ablate && skillSide !== 1));
            sim.step();
            const evs = sim.events;
            sim.events = [];
            for (const e of evs) if (e.type === 'skill') recs[e.snake === A.id ? A.id : B.id].casts++;
            if (!A.alive || !B.alive) {
              const w = A.alive ? A : B.alive ? B : null;
              if (w) ((win = w.lineage), (hpLeft = w.hp / w.maxHp));
              break;
            }
          }
          // 시간 안에 못 끝나면 남은 체력 비율로 판정
          if (!win && A.alive && B.alive) {
            const fa = A.hp / A.maxHp, fb = B.hp / B.maxHp;
            if (Math.abs(fa - fb) > 0.05) win = (fa > fb ? A : B).lineage + '*';
          }
          if (ablate) {
            const w = !A.alive ? 1 : !B.alive ? 0 : -1; // 이긴 자리
            results.push({ stage, a: la, b: lb, win: w < 0 ? null : w === skillSide ? 'skill' : 'noskill', t: t / CONFIG.tickRate, hpLeft, aRec: recs[A.id], bRec: recs[B.id] });
          } else results.push({ stage, a: la, b: lb, win, t: t / CONFIG.tickRate, hpLeft, aRec: recs[A.id], bRec: recs[B.id] });
        }
    process.stderr.write(`duel stage ${stage}\n`);
  }
  console.log(JSON.stringify({ mode, results, meta }));
}

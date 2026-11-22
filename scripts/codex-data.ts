// 도감에 넣을 실측값: 기술 형태·보조 기술·필살기를 허수아비(Lv16) 하나에게 써서 4초 동안 준 피해와 걸린 효과를 잰다.
// 카드(능력)는 모두 빼고 기술만 잰다. 계열 1:1 승률(같은 레벨 8)도 함께 잰다.
// 사용: npx tsx scripts/codex-data.ts [계열 쌍마다 대결 수=8] > src/codex/measured.json
import { Simulation, type Snake } from '../src/shared/sim';
import { CONFIG } from '../src/shared/config';
import { COMMON_SUBS, FAMILIES, type SubDef } from '../src/shared/species';
import { emptyCommand } from '../src/shared/types';

const DUEL_N = Number(process.argv[2] ?? 8);
type Meas = { dmg: number; fx: string[] };

function arena(species: string, form: string, level: number) {
  const sim = new Simulation(7, '나', { power: 1, bots: 1, map: 'grass', loadout: { species, form, traits: [] }, startLevel: level });
  sim.enemies.next = 1e9;
  const p = sim.snakes[0], t = sim.snakes[1];
  t.isPlayer = true;
  sim.foods = [];
  sim.spawnAt(p, 0, 0, 0, 30);
  sim.autoLevel(t, CONFIG.maxLevel - t.level);
  sim.spawnAt(t, 95, 0, Math.PI / 2, 30);
  t.cmd = emptyCommand(Math.PI / 2);
  p.cmd = emptyCommand(0);
  t.invulnT = p.invulnT = 0;
  t.hp = t.maxHp;
  t.lives = 99;
  p.abilities = [];
  p.mainLv = p.subLv = 0;
  p.offer = null;
  p.pending = 0;
  p.subPending = false;
  return { sim, p, t };
}

function measure(sim: Simulation, p: Snake, t: Snake, slot: 'main' | 'sub' | 'ult', formId = ''): Meas {
  const fx = new Set<string>();
  let dmg = 0;
  const x0 = t.x, y0 = t.y;
  if (slot === 'main') p.cmd = { ...p.cmd, skillSeq: 1 };
  if (slot === 'ult') ((p.ult = CONFIG.ultMax), (p.cmd = { ...p.cmd, skillSeq: 1 }));
  if (slot === 'sub') ((p.subCd = 0), (p.cmd = { ...p.cmd, subSeq: 1 }));
  let moved = 0;
  for (let i = 0; i < 4 * CONFIG.tickRate; i++) {
    t.kvx *= 0.5;
    t.kvy *= 0.5;
    sim.step();
    if (formId === 'dive' && i === 0) sim.shove(t, 0, 200);
    if (formId === 'ambush' && i === 30) sim.shove(t, Math.PI, 70);
    if (slot !== 'sub') p.angle = formId === 'backjet' ? Math.atan2(t.y - p.y, t.x - p.x) + Math.PI : Math.atan2(t.y - p.y, t.x - p.x);
    if (t.slowT > 0) fx.add('느려짐');
    if (t.stunT > 0) fx.add('기절');
    if (t.rootT > 0) fx.add('묶임');
    if (t.blindT > 0) fx.add('눈부심');
    if (t.markT > 0) fx.add('표시');
    if (t.poisonT > 0) fx.add('중독');
    if (t.grabbedBy >= 0) fx.add('잡힘');
    if (t.fearT > 0) fx.add('겁먹음');
    if (t.silenceT > 0) fx.add('기술 봉인');
    moved = Math.max(moved, Math.hypot(t.x - x0, t.y - y0));
    if (t.hp < t.maxHp * 0.5) t.hp = t.maxHp; // 허수아비는 쓰러지지 않게
    for (const e of sim.snapshot().events) if (e.type === 'hit' && e.snake === t.id && e.by === p.id && e.kind !== 'bite' && e.kind !== 'recoil') dmg += e.dmg;
  }
  return { dmg: Math.round(dmg), fx: [...fx] };
}

const forms: Record<string, Record<string, { lv5: Meas; lv10: Meas }>> = {};
const ults: Record<string, Meas> = {};
const subs: Record<string, Meas> = {};
for (const f of FAMILIES) {
  forms[f.id] = {};
  for (const fo of f.forms) {
    const r: Record<number, Meas> = {};
    for (const lv of [5, 10]) {
      const { sim, p, t } = arena(f.species[0], fo.id, lv);
      if (fo.id === 'backjet') sim.spawnAt(t, p.segs[(p.segN - 1) * 2] - 90, p.segs[(p.segN - 1) * 2 + 1], Math.PI / 2, 30);
      r[lv] = measure(sim, p, t, 'main', fo.id);
    }
    forms[f.id][fo.id] = { lv5: r[5], lv10: r[10] };
  }
  {
    const { sim, p, t } = arena(f.species[0], f.forms[0].id, 10);
    sim.spawnAt(t, 220, 0, Math.PI / 2, 30);
    ults[f.id] = measure(sim, p, t, 'ult');
  }
  const subList: SubDef[] = [f.sub, ...(f === FAMILIES[0] ? COMMON_SUBS : [])];
  for (const sd of subList) {
    const { sim, p, t } = arena(f.species[0], f.forms[0].id, 10);
    p.sub = sd;
    subs[sd.id] = measure(sim, p, t, 'sub');
  }
  process.stderr.write('.');
}

// 계열 1:1 (같은 레벨 8)
const win: Record<string, number> = {}, games: Record<string, number> = {};
let seed = 1;
for (let i = 0; i < FAMILIES.length; i++)
  for (let j = i + 1; j < FAMILIES.length; j++)
    for (let g = 0; g < DUEL_N; g++) {
      const A = FAMILIES[i], Bf = FAMILIES[j];
      const sim = new Simulation(seed++, 'A', { power: 1, bots: 1, map: 'grass', loadout: { species: A.species[g % 4], form: A.forms[g % 3].id, traits: [] }, startLevel: 8 });
      sim.enemies.next = 1e9;
      sim.tick = CONFIG.tickRate * (CONFIG.botGraceSeconds + 1);
      const a = sim.snakes[0], b = sim.snakes[1];
      const nb = new Simulation(seed++, 'B', { power: 1, bots: 1, map: 'grass', loadout: { species: Bf.species[g % 4], form: Bf.forms[(g + 1) % 3].id, traits: [] }, startLevel: 8 }).snakes[0];
      Object.assign(b, { sp: nb.sp, fam: nb.fam, form: nb.form, sub: nb.sub, abilities: nb.abilities, mainLv: nb.mainLv, subLv: nb.subLv, level: nb.level, evo: nb.evo, traits: new Set<string>(), persona: 'brawler' });
      a.persona = 'brawler';
      a.isPlayer = false;
      a.lives = 1;
      sim.foods = sim.foods.filter((f) => f.kind === 0);
      const ang = sim.rng.range(0, Math.PI * 2);
      sim.spawnAt(a, Math.cos(ang) * 130, Math.sin(ang) * 130, ang + Math.PI, 40);
      sim.spawnAt(b, -Math.cos(ang) * 130, -Math.sin(ang) * 130, ang, 40);
      for (const s of [a, b]) ((s.hp = s.maxHp), (s.invulnT = 0), (s.offer = null), (s.pending = 0), (s.ult = 0), (s.react = 0.3), (s.respawnT = 999));
      let w: Snake | null = null;
      for (let t = 0; t < 60 * CONFIG.tickRate; t++) {
        sim.step();
        sim.events = [];
        if (!a.alive || !b.alive) {
          w = a.alive ? a : b.alive ? b : null;
          break;
        }
      }
      if (!w && a.alive && b.alive) w = a.hp / a.maxHp > b.hp / b.maxHp + 0.1 ? a : b.hp / b.maxHp > a.hp / a.maxHp + 0.1 ? b : null;
      for (const f of [A, Bf]) games[f.id] = (games[f.id] ?? 0) + 1;
      if (w) win[w.fam.id] = (win[w.fam.id] ?? 0) + 1;
    }
const famDuel: Record<string, number> = {};
for (const f of FAMILIES) famDuel[f.id] = Math.round(((win[f.id] ?? 0) / Math.max(1, games[f.id] ?? 0)) * 100);
process.stderr.write('\n');
console.log(JSON.stringify({ date: new Date().toISOString().slice(0, 10), forms, ults, subs, famDuel, duelGames: (FAMILIES.length * (FAMILIES.length - 1) / 2) * DUEL_N }, null, 1));

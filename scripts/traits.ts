// 특성 가치: 한 판의 곤충 21마리에게 특성을 하나씩 나눠 주고(없음 포함), 판 안 점수 순위·쓰러짐을 비교한다.
// 모든 곤충을 플레이어처럼(쓰러져도 레벨 유지, 목숨 넉넉히) 두고 봇 AI로 움직인다.
// 비교용으로 '기술 형태(3가지)'와 '계열'에 따른 차이도 같은 판에서 함께 잰다.
// 사용: npx tsx scripts/traits.ts [판 수=16]
import { Simulation } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';
import { FAMILIES, SPECIES } from '../src/shared/species';
import { TRAITS } from '../src/shared/cards';

const G = Number(process.argv[2] ?? 16);
const OPTS = ['none', ...TRAITS.map((t) => t.id)];
type Rec = { pct: number; deaths: number; lv: number };
const byTrait = new Map<string, Rec[]>(), byForm = new Map<string, Rec[]>(), byFam = new Map<string, Rec[]>();
const push = (m: Map<string, Rec[]>, k: string, r: Rec) => (m.get(k) ?? m.set(k, []).get(k)!).push(r);
for (let g = 0; g < G; g++) {
  const sim = new Simulation(9000 + g, '나', { power: 1, bots: 20, map: 'random', loadout: { species: SPECIES[0].id, form: FAMILIES[0].forms[0].id, traits: [] } });
  const deaths = new Map<number, number>();
  const tr = new Map<number, string>(), fm = new Map<number, string>();
  sim.snakes.forEach((s, i) => {
    if (s.isBoss) return;
    const fam = FAMILIES[(i + g) % FAMILIES.length];
    const sp = fam.species[(i + g * 3) % fam.species.length];
    const form = fam.forms[(i + g) % 3];
    Object.assign(s, { sp: SPECIES.find((x) => x.id === sp) ?? s.sp, fam, form });
    const t = OPTS[(i + g * 5) % OPTS.length];
    s.traits = new Set(t === 'none' ? [] : [t]);
    s.autotomy = t === 'autotomy' ? 2 : 0;
    s.rerolls = CONFIG.rerolls + (t === 'reroll' ? 1 : 0);
    if (t === 'preheat') s.ult = 30;
    if (t === 'sprint') s.sprintT = 5;
    if (t === 'safe') s.safeT = 10;
    s.isPlayer = true;
    s.lives = 99;
    tr.set(s.id, t), fm.set(s.id, `${fam.id}/${form.id}`);
  });
  for (const s of sim.snakes) if (!s.isBoss) (sim as any).updateSize?.(s), (s.hp = s.maxHp);
  for (let t = 0; t < CONFIG.tickRate * CONFIG.roundTime; t++) {
    for (const s of sim.snakes) if (s.isPlayer && (t + s.id) % 3 === 0 && sim.onField(s)) sim.setCommand(s.id, botThink(sim, s, sim.dt * 3));
    sim.step();
    for (const e of sim.events) if (e.type === 'death' && !sim.snakes[e.snake].isBoss) deaths.set(e.snake, (deaths.get(e.snake) ?? 0) + 1);
    sim.events = [];
    if (sim.state === 'ended') break;
  }
  const list = sim.snakes.filter((s) => !s.isBoss).sort((a, b) => a.score - b.score);
  list.forEach((s, rank) => {
    const r: Rec = { pct: rank / (list.length - 1), deaths: deaths.get(s.id) ?? 0, lv: s.level };
    push(byTrait, tr.get(s.id)!, r);
    push(byForm, fm.get(s.id)!, r);
    push(byFam, s.fam.id, r);
  });
  process.stderr.write('.');
}
console.error();
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
const base = byTrait.get('none')!;
const baseP = avg(base.map((r) => r.pct));
console.log('특성\t표본\t순위 백분위\t기준 대비\t쓰러짐\t끝 레벨');
for (const k of OPTS) {
  const a = byTrait.get(k) ?? [];
  if (!a.length) continue;
  const p = avg(a.map((r) => r.pct));
  const name = k === 'none' ? '없음' : TRAITS.find((t) => t.id === k)!.name;
  console.log(`${name}\t${a.length}\t${Math.round(p * 100)}\t${p >= baseP ? '+' : ''}${Math.round((p - baseP) * 100)}\t${avg(a.map((r) => r.deaths)).toFixed(2)}\t${avg(a.map((r) => r.lv)).toFixed(1)}`);
}
const se = sd(base.map((r) => r.pct)) / Math.sqrt(base.length);
console.log(`(한 특성 평균의 표준오차 약 ±${Math.round(se * 100)}점)`);
// 비교: 계열 사이 차이, 같은 계열 안 기술 형태 사이 차이
const famP = [...byFam.values()].map((a) => avg(a.map((r) => r.pct)));
console.log(`\n계열 평균 순위 백분위 범위: ${Math.round(Math.min(...famP) * 100)} ~ ${Math.round(Math.max(...famP) * 100)}`);
const formGap: number[] = [];
for (const f of FAMILIES) {
  const ps = f.forms.map((fo) => byForm.get(`${f.id}/${fo.id}`)).filter((a): a is Rec[] => !!a?.length).map((a) => avg(a.map((r) => r.pct)));
  if (ps.length >= 2) formGap.push(Math.max(...ps) - Math.min(...ps));
}
console.log(`같은 계열 안 기술 형태 차이(최고−최저) 평균: ${Math.round(avg(formGap) * 100)}점`);

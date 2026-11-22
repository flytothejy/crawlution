// 특성 1:1 거울 대결: 같은 종·같은 기술 형태끼리, 한쪽만 특성을 달고 싸운다(레벨 8). 특성 단 쪽 승률을 잰다.
// 50%면 특성이 싸움에 차이를 못 냄. 공용 특성 중 성장·점수용(대식가·외톨이·끈질긴 성장)은 싸움 밖 가치라 여기선 낮게 나온다.
// 사용: npx tsx scripts/traitduel.ts [특성마다 판 수=24] [레벨=8]
import { Simulation } from '../src/shared/sim';
import { CONFIG } from '../src/shared/config';
import { FAMILIES, FAMILY } from '../src/shared/species';
import { TRAITS } from '../src/shared/cards';

const N = Number(process.argv[2] ?? 24);
const LV = Number(process.argv[3] ?? 8);
let seed = 1;
const out: [string, number, number, number][] = [];
for (const tr of TRAITS) {
  const fams = tr.family ? [FAMILY[tr.family]] : FAMILIES;
  let w = 0, l = 0, d = 0;
  for (let g = 0; g < N; g++) {
    const F = fams[g % fams.length];
    const sp = F.species[g % F.species.length], form = F.forms[(g >> 1) % 3].id;
    const sim = new Simulation(seed++, 'A', { power: 1, bots: 1, map: 'grass', loadout: { species: sp, form, traits: [tr.id] }, startLevel: LV });
    sim.enemies.next = 1e9;
    sim.tick = CONFIG.tickRate * (CONFIG.botGraceSeconds + 1);
    const a = sim.snakes[0], b = sim.snakes[1];
    const nb = new Simulation(seed++, 'B', { power: 1, bots: 1, map: 'grass', loadout: { species: sp, form, traits: [] }, startLevel: LV }).snakes[0];
    Object.assign(b, { sp: nb.sp, fam: nb.fam, form: nb.form, sub: nb.sub, abilities: nb.abilities, mainLv: nb.mainLv, subLv: nb.subLv, level: nb.level, evo: nb.evo, traits: new Set<string>(), persona: 'brawler' });
    a.persona = 'brawler';
    a.isPlayer = false;
    a.lives = 1;
    sim.foods = sim.foods.filter((f) => f.kind === 0);
    const ang = sim.rng.range(0, Math.PI * 2);
    const [p, q] = g % 2 ? [a, b] : [b, a]; // 자리 바꿔 가며
    sim.spawnAt(p, Math.cos(ang) * 130, Math.sin(ang) * 130, ang + Math.PI, 40);
    sim.spawnAt(q, -Math.cos(ang) * 130, -Math.sin(ang) * 130, ang, 40);
    for (const s of [a, b]) ((s.hp = s.maxHp), (s.invulnT = 0), (s.offer = null), (s.pending = 0), (s.ult = 0), (s.react = 0.3), (s.respawnT = 999));
    let winner: typeof a | null = null;
    for (let t = 0; t < 60 * CONFIG.tickRate; t++) {
      sim.step();
      sim.events = [];
      if (!a.alive || !b.alive) {
        winner = a.alive ? a : b.alive ? b : null;
        break;
      }
    }
    if (!winner && a.alive && b.alive) winner = a.hp / a.maxHp > b.hp / b.maxHp + 0.1 ? a : b.hp / b.maxHp > a.hp / a.maxHp + 0.1 ? b : null;
    if (winner === a) w++;
    else if (winner === b) l++;
    else d++;
  }
  out.push([tr.id, w, l, d]);
  process.stderr.write('.');
}
console.error();
console.log('특성\t계열\t특성 쪽 승률\t(승-패-무)');
for (const [id, w, l, d] of out) {
  const t = TRAITS.find((x) => x.id === id)!;
  console.log(`${t.icon} ${t.name}\t${t.family ? FAMILY[t.family].name : '공용'}\t${Math.round((w / Math.max(1, w + l)) * 100)}%\t${w}-${l}-${d}`);
}

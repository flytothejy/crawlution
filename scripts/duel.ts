// 2판 1:1 대결: 같은 레벨(기본 8, 성충)의 두 계열을 봇 AI로 싸움 붙여 계열별 승률을 잰다.
// 사용: npx tsx scripts/duel.ts [쌍마다 판 수=12] [레벨=8]
import { Simulation } from '../src/shared/sim';
import { CONFIG } from '../src/shared/config';
import { FAMILIES, ROLES } from '../src/shared/species';

const N = Number(process.argv[2] ?? 12);
const LV = Number(process.argv[3] ?? 8);
const win = new Map<string, number>(), games = new Map<string, number>();
const roleWin = new Map<string, number>(), roleGames = new Map<string, number>();
let draws = 0, total = 0, seed = 1;
const durs: number[] = [];
for (let i = 0; i < FAMILIES.length; i++)
  for (let j = i + 1; j < FAMILIES.length; j++)
    for (let g = 0; g < N; g++) {
      const A = FAMILIES[i], B = FAMILIES[j];
      const sim = new Simulation(seed++, 'A', { power: 1, bots: 1, map: 'grass', loadout: { species: A.species[g % A.species.length], form: A.forms[g % 3].id, traits: ['molt', 'sprint'] }, startLevel: LV });
      sim.enemies.next = 1e9;
      sim.tick = CONFIG.tickRate * (CONFIG.botGraceSeconds + 1); // 판 시작 직후의 '봐주기' 시간을 건너뛴다
      const a = sim.snakes[0], b = sim.snakes[1];
      // B 자리: 계열을 바꿔 새로 만든다
      const simB = new Simulation(seed++, 'B', { power: 1, bots: 1, map: 'grass', loadout: { species: B.species[g % B.species.length], form: B.forms[(g + 1) % 3].id, traits: ['molt', 'sprint'] }, startLevel: LV });
      const nb = simB.snakes[0];
      Object.assign(b, { sp: nb.sp, fam: nb.fam, form: nb.form, sub: nb.sub, abilities: nb.abilities, mainLv: nb.mainLv, subLv: nb.subLv, level: nb.level, evo: nb.evo, traits: nb.traits, persona: 'brawler' });
      a.persona = 'brawler';
      a.isPlayer = false;
      a.lives = 1;
      sim.foods = sim.foods.filter((f) => f.kind === 0);
      const ang = sim.rng.range(0, Math.PI * 2);
      sim.spawnAt(a, Math.cos(ang) * 130, Math.sin(ang) * 130, ang + Math.PI, 40);
      sim.spawnAt(b, -Math.cos(ang) * 130, -Math.sin(ang) * 130, ang, 40);
      for (const s of [a, b]) ((s.hp = s.maxHp), (s.invulnT = 0), (s.offer = null), (s.pending = 0), (s.ult = 0), (s.react = 0.3), (s.respawnT = 999));
      let winner: typeof a | null = null;
      const t0 = sim.time;
      for (let t = 0; t < 60 * CONFIG.tickRate; t++) {
        sim.step();
        sim.events = [];
        if (!a.alive || !b.alive) {
          winner = a.alive ? a : b.alive ? b : null;
          break;
        }
      }
      // 시간이 끝나면 체력 비율로
      if (!winner && a.alive && b.alive) winner = a.hp / a.maxHp > b.hp / b.maxHp + 0.1 ? a : b.hp / b.maxHp > a.hp / a.maxHp + 0.1 ? b : null;
      durs.push(sim.time - t0);
      total++;
      for (const f of [A, B]) {
        games.set(f.id, (games.get(f.id) ?? 0) + 1);
        roleGames.set(f.role, (roleGames.get(f.role) ?? 0) + 1);
      }
      if (!winner) draws++;
      else {
        win.set(winner.fam.id, (win.get(winner.fam.id) ?? 0) + 1);
        roleWin.set(winner.fam.role, (roleWin.get(winner.fam.role) ?? 0) + 1);
      }
    }
const pct = (a: number, b: number) => `${Math.round((a / Math.max(1, b)) * 100)}%`;
durs.sort((x, y) => x - y);
console.log(`1:1 대결 ${total}판 (Lv${LV}, 무승부 ${draws}), 대결 시간 중간값 ${durs[durs.length >> 1].toFixed(1)}초`);
for (const f of [...FAMILIES].sort((x, y) => (win.get(y.id) ?? 0) / (games.get(y.id) ?? 1) - (win.get(x.id) ?? 0) / (games.get(x.id) ?? 1)))
  console.log(`  ${ROLES[f.role].icon} ${f.name.padEnd(6, '　')} ${pct(win.get(f.id) ?? 0, games.get(f.id) ?? 0)}`);
console.log('역할별:', [...roleGames.keys()].map((r) => `${ROLES[r as keyof typeof ROLES].name} ${pct(roleWin.get(r) ?? 0, roleGames.get(r) ?? 0)}`).join(' · '));

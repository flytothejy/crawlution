// 3판 자동 점검: 8계열 40종, 4칸 기술 64개가 실제 시뮬레이션에서 나가고 맞는지.
import { Simulation, type Snake } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';
import { V3_FAMILIES, V3_SPECIES, v3Kit } from '../src/shared/v3';
import { KIT_SLOTS, kitOf, V3_ROSTER } from '../src/shared/kit';
import { STATUSES } from '../src/shared/status';
import { emptyCommand, type GameOpts } from '../src/shared/types';

let failed = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
}
const opts = (species: string, extra: Partial<GameOpts> = {}): GameOpts => ({ power: 1, bots: 1, map: 'grass', loadout: { species, form: '', traits: [] }, v3: true, ...extra });

// 0) 데이터
{
  check('3판: 8계열 × 5종 = 40종', V3_FAMILIES.length === 8 && V3_SPECIES.length === 40 && V3_ROSTER.length === 40);
  check('40종 모두 4칸 기술이 실제 구현에 연결됨', V3_ROSTER.every((id) => !!kitOf(id)));
  const names = new Set<string>();
  for (const sp of V3_SPECIES) for (const sl of ['atk', 'def', 'spc', 'ult'] as const) names.add(v3Kit(sp)[sl].name);
  check('서로 다른 기술 64개', names.size === 64, `${names.size}개`);
}

// 1) 한 판 끝까지(3판): 봇 20마리
const casts = new Map<string, number>();
const hits = new Map<string, number>();
{
  const sim = new Simulation(4242, '나', opts('rhino', { bots: 20 }));
  const p = sim.snakes[0];
  p.lives = 9999;
  let nan = false, ended = false;
  const ticks = CONFIG.tickRate * (CONFIG.roundTime + 2);
  const t0 = performance.now();
  const lastCast = new Map<number, string>();
  for (let t = 0; t < ticks; t++) {
    sim.setCommand(0, botThink(sim, p, sim.dt));
    sim.step();
    const snap = sim.snapshot();
    for (const e of snap.events) {
      if (e.type === 'skill') {
        casts.set(e.name, (casts.get(e.name) ?? 0) + 1);
        lastCast.set(e.snake, e.name);
      }
      if (e.type === 'hit' && e.dmg > 0 && (e.kind === 'skill' || e.kind === 'ult' || e.kind === 'minion') && e.by >= 0) {
        const n = lastCast.get(e.by);
        if (n) hits.set(n, (hits.get(n) ?? 0) + 1);
      }
      if (e.type === 'end') ended = true;
    }
    for (const s of sim.snakes) if (s.alive && !(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.hp))) nan = true;
  }
  const ms = (performance.now() - t0) / ticks;
  check('3판 한 판이 끝까지 돎', ended);
  check('3판: 좌표·체력이 NaN이 되지 않음', !nan);
  check('3판: 틱당 3ms 이하', ms < 3, `${ms.toFixed(2)}ms`);
  check('3판: 봇이 8계열 모두에서 나옴', new Set(sim.snakes.filter((s) => !s.isBoss).map((s) => s.v3fam)).size === 8);
}

// 2) 기술 64개를 하나씩: 앞에 허수아비 셋을 두고 칸을 직접 써서 맞는지
const unhit: string[] = [];
const statusSeen = new Set<string>();
{
  for (const sp of V3_SPECIES) {
    const kit = kitOf(sp.id)!;
    for (const sl of [...KIT_SLOTS, 'ult'] as const) {
      const sk = kit[sl];
      if (sl !== 'atk' && sp.swap !== sl && !sp.base) continue; // 계열 기본 칸은 대표 종에서만
      const sim = new Simulation(7 + sp.id.length, '나', opts(sp.id, { bots: 3, startLevel: 10 }));
      sim.enemies.update = () => {};
      const me = sim.snakes[0];
      me.angle = 0;
      const dummies = sim.snakes.slice(1, 4) as Snake[];
      const spots: [number, number][] = [[110, 0], [300, 10], [160, -60]];
      dummies.forEach((d, i) => {
        d.isPlayer = true; // 봇 생각 끄기
        sim.spawnAt(d, me.x + spots[i][0], me.y + spots[i][1], Math.PI / 2, 26);
        d.invulnT = 0;
        d.biteCd = 99;
      });
      me.invulnT = 0;
      me.skillCd = me.subCd = me.spcCd = 0;
      me.ult = CONFIG.ultMax;
      const cmd = { ...emptyCommand(0) };
      if (sl === 'atk') cmd.skillSeq = me.lastSkillSeq + 1;
      if (sl === 'def') cmd.subSeq = me.lastSubSeq + 1;
      if (sl === 'spc') cmd.spcSeq = me.lastSpcSeq + 1;
      if (sl === 'ult') cmd.ultSeq = me.lastUltSeq + 1;
      sim.setCommand(0, cmd);
      let hit = false, cast = false;
      for (let t = 0; t < CONFIG.tickRate * 4; t++) {
        for (const d of dummies) d.biteCd = 99;
        sim.step();
        sim.setCommand(0, { ...cmd, angle: 0 });
        const snap = sim.snapshot();
        for (const e of snap.events) {
          if (e.type === 'skill' && e.snake === 0) cast = true;
          if (e.type === 'hit' && e.by === 0 && e.dmg > 0) hit = true;
        }
        for (const s of snap.snakes) for (let q = 0; q < s.st.length; q += 2) statusSeen.add(STATUSES[s.st[q]].id);
        if (sl === 'def' && (me.coilT > 0 || me.leafT > 0 || me.flutterT > 0 || me.bitterT > 0 || me.reduceT > 0 || me.invulnT > 0 || me.curlT > 0 || me.deadT > 0 || me.ghostT > 0 || me.flyT > 0 || me.hiddenT > 0 || me.trailT > 0 || me.backT > 0 || me.decoyT > 0)) hit = true;
        if (sl === 'spc' && (me.hiddenT > 0 || me.compoundT > 0 || sim.zones.some((z) => z.owner === 0) || sim.minions.some((m) => m.owner === 0 && m.kind !== 'worker'))) hit = true;
      }
      if (!cast || !hit) unhit.push(`${sp.name}:${sk.name}${cast ? '' : '(안 나감)'}`);
    }
  }
  check('3판 기술: 칸마다 써서 나가고 효과가 들어감', unhit.length === 0, unhit.join(', '));
  const need = ['stun', 'root', 'slow', 'silence', 'fear', 'blind', 'confuse', 'charm', 'mark', 'poison', 'itch', 'invuln', 'shield', 'bitter', 'hidden', 'fly', 'ghost'];
  const miss = need.filter((x) => !statusSeen.has(x));
  check('기술로 상태 17종이 실제로 걸림', miss.length === 0, miss.length ? `안 걸림: ${miss.join(',')}` : `${statusSeen.size}종`);
}

// 3) 한 판 통계
{
  const allNames = new Set<string>();
  for (const sp of V3_SPECIES) for (const sl of ['atk', 'def', 'spc', 'ult'] as const) allNames.add(v3Kit(sp)[sl].name);
  const never = [...allNames].filter((n) => !casts.has(n));
  console.log(`  (한 판에서 나온 기술 ${allNames.size - never.length}/${allNames.size}${never.length ? ' · 안 나옴: ' + never.join(', ') : ''})`);
}

console.log(failed ? `\n${failed}개 실패` : '\n3판 모두 통과');
process.exit(failed ? 1 : 0);

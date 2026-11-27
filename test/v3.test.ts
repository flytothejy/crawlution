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
  const uniqUlt = V3_SPECIES.filter((sp) => sp.ult).length;
  check('서로 다른 기술 64개 + 종 고유 필살기', names.size === 64 + uniqUlt, `${names.size}개(고유 필살기 ${uniqUlt})`);
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
const noSrc: string[] = [];
const statusSeen = new Set<string>();
{
  for (const sp of V3_SPECIES) {
    const kit = kitOf(sp.id)!;
    for (const sl of [...KIT_SLOTS, 'ult'] as const) {
      const sk = kit[sl];
      if (sl !== 'atk' && sp.swap !== sl && !sp.base && !(sl === 'ult' && sp.ult)) continue; // 계열 기본 칸은 대표 종에서만(종 고유 필살기는 그 종에서)
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
      let hit = false, cast = false, dmgHit = false, srcHit = false;
      for (let t = 0; t < CONFIG.tickRate * 4; t++) {
        for (const d of dummies) d.biteCd = 99;
        sim.step();
        sim.setCommand(0, { ...cmd, angle: 0 });
        const snap = sim.snapshot();
        for (const e of snap.events) {
          if (e.type === 'skill' && e.snake === 0) cast = true;
          if (e.type === 'hit' && e.by === 0 && e.dmg > 0) {
            hit = true;
            if (e.kind === 'skill' || e.kind === 'ult') dmgHit = true; // 물기·일개미·특성 독은 칸이 없다
            if (e.src === sl) srcHit = true;
          }
        }
        for (const s of snap.snakes) for (let q = 0; q < s.st.length; q += 2) statusSeen.add(STATUSES[s.st[q]].id);
        if (sl === 'def' && (me.coilT > 0 || me.leafT > 0 || me.flutterT > 0 || me.bitterT > 0 || me.reduceT > 0 || me.invulnT > 0 || me.curlT > 0 || me.deadT > 0 || me.ghostT > 0 || me.flyT > 0 || me.hiddenT > 0 || me.trailT > 0 || me.backT > 0 || me.decoyT > 0)) hit = true;
        if (sl === 'spc' && (me.hiddenT > 0 || me.compoundT > 0 || sim.zones.some((z) => z.owner === 0) || sim.minions.some((m) => m.owner === 0 && m.kind !== 'worker'))) hit = true;
      }
      if (!cast || !hit) unhit.push(`${sp.name}:${sk.name}${cast ? '' : '(안 나감)'}`);
      if (dmgHit && !srcHit) noSrc.push(`${sp.name}:${sk.name}`);
    }
  }
  check('3판 기술: 칸마다 써서 나가고 효과가 들어감', unhit.length === 0, unhit.join(', '));
  check('기술 피해에 어느 칸인지(src) 표시됨(밸런스 측정용)', noSrc.length === 0, noSrc.join(', '));
  const need = ['stun', 'root', 'slow', 'silence', 'fear', 'blind', 'confuse', 'charm', 'mark', 'poison', 'itch', 'invuln', 'shield', 'bitter', 'hidden', 'fly', 'ghost'];
  const miss = need.filter((x) => !statusSeen.has(x));
  check('기술로 상태 17종이 실제로 걸림', miss.length === 0, miss.length ? `안 걸림: ${miss.join(',')}` : `${statusSeen.size}종`);
}

// 2b) 계열 특성·본능
{
  const pair = (a: string, b: string) => {
    const sim = new Simulation(99, '나', opts(a, { bots: 1, startLevel: 5 }));
    sim.enemies.update = () => {};
    const me = sim.snakes[0];
    const o = sim.snakes[1];
    o.isPlayer = true;
    // 상대를 원하는 종으로 바꿔 끼운다
    const other = new Simulation(5, 'x', opts(b, { bots: 0, startLevel: 5 })).snakes[0];
    Object.assign(o, { sp: other.sp, fam: other.fam, kit: other.kit, v3fam: other.v3fam });
    me.invulnT = o.invulnT = 0;
    return { sim, me, o };
  };
  const bite = (sim: Simulation, a: Snake, b: Snake) => (sim as unknown as { bite: (a: Snake, b: Snake, x: number, y: number, i: number) => void }).bite(a, b, b.x, b.y, 3);
  {
    const { sim, me, o } = pair('v3:wangjine', 'rhino');
    bite(sim, me, o);
    check('지네 특성 독턱: 물면 중독', o.poisonT > 0);
  }
  {
    const { sim, me, o } = pair('orbspider', 'rhino');
    bite(sim, me, o);
    check('거미 특성 독니: 물면 0.5초 마비', o.stunT > 0.3);
  }
  {
    const { sim, me, o } = pair('rhino', 'v3:swallow');
    bite(sim, me, o);
    check('나비 특성 인분 날개: 나비를 물면 혼란', me.confuseT > 1);
  }
  {
    const { sim, me, o } = pair('rhino', 'v3:tussock');
    bite(sim, me, o);
    check('독나방 본능 독털 몸: 문 적이 가려움', me.itchT > 1);
  }
  {
    const { sim, me, o } = pair('rhino', 'mantis' as never);
    void o;
    me.kvx = me.kvy = 0;
    sim.knock(me, 0, 100);
    const beetle = Math.hypot(me.kvx, me.kvy);
    const { sim: s2, me: m2 } = pair('kingmantis', 'rhino');
    m2.kvx = m2.kvy = 0;
    s2.knock(m2, 0, 100);
    check('딱정벌레 특성 무거운 껍질: 밀려나는 거리 절반', beetle > 0 && beetle <= Math.hypot(m2.kvx, m2.kvy) * 0.55, `${beetle.toFixed(0)} vs ${Math.hypot(m2.kvx, m2.kvy).toFixed(0)}`);
  }
  {
    const { sim, me } = pair('v3:wangant', 'rhino');
    for (let t = 0; t < 60; t++) sim.step();
    const n = sim.minions.filter((m) => m.owner === me.id && m.kind === 'worker').length;
    check('개미 특성 일개미 행렬: 일본왕개미는 일개미 3마리가 따라다님', n === 3, `${n}마리`);
  }
  {
    const { sim, me, o } = pair('v3:grima', 'rhino');
    void o;
    const { me: m2 } = pair('v3:wangjine', 'rhino');
    check('그리마 본능 아주 빠른 발: 속도 +8%', sim.speedOf(me) > sim.speedOf(m2) * 1.05);
  }
}

// 2c) 부활 규칙: 플레이어·봇 모두 레벨 유지, 적에게서 먼 곳, 부활 무적은 공격하면 풀림
{
  const sim = new Simulation(31, '나', opts('rhino', { bots: 6, startLevel: 1 }));
  sim.enemies.update = () => {};
  const b = sim.snakes[1];
  sim.autoLevel(b, 7);
  const lv = b.level, ab = b.abilities.length;
  sim.kill(b, 2, 'skill');
  for (let t = 0; t < 60 * 5 && !b.alive; t++) sim.step();
  check('봇 부활: 레벨·카드 유지', b.alive && b.level === lv && b.abilities.length === ab, `Lv${b.level}/${lv}`);
  const near = Math.min(...sim.snakes.filter((o) => o !== b && o.alive).map((o) => Math.hypot(o.x - b.x, o.y - b.y)));
  check('봇 부활: 다른 곤충에게서 떨어진 곳', near > 300, `${near.toFixed(0)}`);
  check('부활 직후 무적', b.invulnT > 0 && b.spawnShield);
  b.isPlayer = true;
  b.skillCd = 0;
  sim.setCommand(b.id, { ...emptyCommand(0), angle: b.angle, skillSeq: b.lastSkillSeq + 1 });
  sim.step();
  check('부활 무적은 기술을 쓰면 풀림', b.invulnT <= 0 && !b.spawnShield);
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

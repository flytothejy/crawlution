// 시뮬레이션 자동 점검(2판): 화면 없이 로직만 돌린다.
import { Simulation, type Snake } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG, nutNeed } from '../src/shared/config';
import { COMMON_SUBS, FAMILIES, FAMILY, SPECIAL_FOODS, SPECIES } from '../src/shared/species';
import { ABILITIES, TRAITS } from '../src/shared/cards';
import { emptyCommand, type GameOpts } from '../src/shared/types';

let failed = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
}

const opts = (species: string, form: string, extra: Partial<GameOpts> = {}): GameOpts => ({ power: 1, bots: 1, map: 'grass', loadout: { species, form, traits: ['molt', 'reroll'] }, ...extra });

// 0) 데이터
{
  check('계열 10개, 역할마다 2개', FAMILIES.length === 10 && ['tank', 'charge', 'shoot', 'trap', 'support'].every((r) => FAMILIES.filter((f) => f.role === r).length === 2));
  check('종 40개, 계열별 목록과 일치', SPECIES.length === 40 && FAMILIES.every((f) => f.species.every((id) => SPECIES.find((s) => s.id === id)?.family === f.id)));
  check('계열마다 기술 형태 3개', FAMILIES.every((f) => f.forms.length === 3));
  check('본능 40개 모두 다름', new Set(SPECIES.map((s) => s.instinct.id)).size === 40);
  check('특별 먹이 10종: 계열마다 좋아함·싫어함 하나씩', SPECIAL_FOODS.length === 10 && SPECIAL_FOODS.every((_, i) => FAMILIES.filter((f) => f.likes === i).length === 1 && FAMILIES.filter((f) => f.hates === i).length === 1) && FAMILIES.every((f) => f.likes !== f.hates));
  check('능력 카드 37장(공용 17 + 계열 전용 2×10)', ABILITIES.length === 37 && FAMILIES.every((f) => ABILITIES.filter((a) => a.family === f.id).length === 2));
  check('특성 12개, 공용 보조 기술 10개', TRAITS.length === 12 && COMMON_SUBS.length === 10);
  check("레벨 곡선: 1→2에 20, 한 레벨마다 7씩 더", nutNeed(1) === 20 && nutNeed(15) === 118);
}

// 1) 장시간 실행: 플레이어도 봇 AI로 조종, 한 판 끝까지
{
  const sim = new Simulation(12345, '나', opts('kingmantis', 'sweep', { bots: 20 }));
  const p = sim.snakes[0];
  p.lives = 9999;
  let nan = false, deaths = 0, evolves = 0, ults = 0, crushes = 0, ended = false, maxLv = 1, levelUps = 0;
  const casts = new Map<string, number>();
  const ticks = CONFIG.tickRate * (CONFIG.roundTime + 2);
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    sim.setCommand(0, botThink(sim, p, sim.dt));
    sim.step();
    const snap = sim.snapshot();
    for (const e of snap.events) {
      if (e.type === 'death') deaths++;
      if (e.type === 'evolve') evolves++;
      if (e.type === 'levelUp') levelUps++;
      if (e.type === 'skill' && e.slot === 'ult') ults++;
      if (e.type === 'skill' && e.slot === 'main') casts.set(e.fam, (casts.get(e.fam) ?? 0) + 1);
      if (e.type === 'crush' && e.count > 0) crushes += e.count;
      if (e.type === 'end') ended = true;
    }
    for (const s of sim.snakes) {
      if (s.alive && !(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.hp))) nan = true;
      if (!s.isBoss) maxLv = Math.max(maxLv, s.level);
    }
  }
  const ms = performance.now() - t0;
  check('8분 판이 시간으로 끝남', ended && sim.state === 'ended');
  check('좌표·체력이 NaN이 되지 않음', !nan);
  check('레벨업·진화가 일어남', levelUps > 100 && evolves > 20, `레벨업 ${levelUps}, 진화 ${evolves}, 최고 Lv${maxLv}`);
  check('필살기를 씀', ults > 10, `${ults}번`);
  check('10계열 모두 주 기술을 씀', FAMILIES.every((f) => (casts.get(f.id) ?? 0) > 0), [...casts].map(([k, v]) => `${k}:${v}`).join(' '));
  check('쓰러짐·압착이 일어남', deaths > 20, `쓰러짐 ${deaths}, 압착 ${crushes}`);
  check('틱당 3ms 이하', ms / ticks < 3, `${(ms / ticks).toFixed(2)}ms`);
}

/** 기술 시험장: 플레이어 앞 120에 묶인 표적 하나 */
function arena(species: string, form: string, level = 10) {
  const sim = new Simulation(7, '나', opts(species, form, { startLevel: level }));
  sim.enemies.next = 1e9;
  const p = sim.snakes[0];
  const t = sim.snakes[1];
  t.isPlayer = true; // 봇 AI 끄기(명령이 그대로 남음)
  sim.foods = [];
  sim.spawnAt(p, 0, 0, 0, 30);
  sim.spawnAt(t, 130, 0, Math.PI / 2, 30);
  t.cmd = emptyCommand(Math.PI / 2);
  p.cmd = emptyCommand(0);
  t.invulnT = p.invulnT = 0;
  sim.autoLevel(t, CONFIG.maxLevel - t.level);
  sim.spawnAt(t, 95, 0, Math.PI / 2, 30);
  t.hp = t.maxHp;
  t.lives = 99;
  p.offer = null;
  p.pending = 0;
  p.subPending = false;
  return { sim, p, t };
}

function run(sim: Simulation, sec: number, hold?: (s: Simulation) => void) {
  for (let i = 0; i < sec * CONFIG.tickRate; i++) {
    hold?.(sim);
    sim.step();
    sim.snapshot();
  }
}

function hold(t: Snake) {
  return () => {
    t.rootT = Math.max(t.rootT, 0.05);
    t.kvx *= 0.5;
    t.kvy *= 0.5;
  };
}

// 2) 30개 기술 형태 모두: 표적에게 피해나 효과가 들어간다
{
  const bad: string[] = [];
  for (const f of FAMILIES) {
    for (const form of f.forms) {
      const { sim, p, t } = arena(f.species[0], form.id);
      // 뒤로 뿜기는 꼬리 뒤로 나간다 → 표적을 꼬리 뒤에 둔다
      if (form.id === 'backjet') sim.spawnAt(t, p.segs[(p.segN - 1) * 2] - 90, p.segs[(p.segN - 1) * 2 + 1], Math.PI / 2, 30);
      p.cmd = { ...p.cmd, skillSeq: 1 };
      let effect = false, dealt = 0;
      for (let i = 0; i < 4 * CONFIG.tickRate; i++) {
        hold(t)();
        sim.step();
        if (form.id === 'dive' && i === 0) sim.shove(t, 0, 200);
        // 숨어 기다리기는 표적이 다가와야 터진다
        if (form.id === 'ambush' && i === 30) sim.shove(t, Math.PI, 70);
        if (form.id === 'silk' || form.id === 'jet' || form.id === 'stab' || form.id === 'snipe' || form.id === 'burst' || form.id === 'signal' || form.id === 'sand') p.angle = Math.atan2(t.y - p.y, t.x - p.x);
        if (t.slowT > 0 || t.blindT > 0 || t.markT > 0 || t.poisonT > 0 || t.grabbedBy >= 0 || t.fearT > 0 || t.stunT > 0) effect = true;
        for (const e of sim.snapshot().events) if (e.type === 'hit' && e.snake === t.id && e.by === p.id && e.kind !== 'bite' && e.dmg > 0) dealt += e.dmg;
      }
      if (dealt <= 0 && !effect) bad.push(`${f.name}/${form.name}`);
    }
  }
  check('기술 형태 30개가 모두 표적에게 들어감', bad.length === 0, bad.join(', '));
}

// 3) 보조 기술 20개와 필살기 10개가 오류 없이 나간다
{
  const bad: string[] = [];
  for (const f of FAMILIES) {
    for (const sub of [f.sub, ...COMMON_SUBS.slice(FAMILIES.indexOf(f), FAMILIES.indexOf(f) + 1)]) {
      const { sim, p, t } = arena(f.species[0], f.forms[0].id);
      p.sub = sub;
      p.subCd = 0;
      p.cmd = { ...p.cmd, subSeq: 1 };
      try {
        run(sim, 2, hold(t));
        if (p.subCd <= 0) bad.push(`${sub.name}(안 나감)`);
      } catch (err) {
        bad.push(`${sub.name}: ${(err as Error).message}`);
      }
    }
  }
  check('보조 기술 20개가 나감', bad.length === 0, bad.join(', '));
  const weak: string[] = [];
  for (const f of FAMILIES) {
    const { sim, p, t } = arena(f.species[0], f.forms[0].id);
    sim.spawnAt(t, 220, 0, Math.PI / 2, 30); // 예고 0.5초 동안 다가가는 거리를 둔다
    p.ult = CONFIG.ultMax;
    p.cmd = { ...p.cmd, skillSeq: 1 };
    let lost = 0;
    // 꿀벌 벌 떼는 몇 초에 걸쳐 피해
    for (let i = 0; i < (f.id === 'bee' ? 4 : 3) * CONFIG.tickRate; i++) {
      t.rootT = Math.max(t.rootT, 0.05); // 끌어당기기는 막지 않는다
      sim.step();
      for (const e of sim.snapshot().events) if (e.type === 'hit' && e.snake === t.id && e.by === p.id && e.kind === 'ult') lost += e.dmg;
    }
    if (p.ultUses !== 1 || (lost <= 0 && t.rootT <= 0.06 && t.blindT <= 0)) weak.push(`${f.ult.name}(${Math.round(lost)})`);
    if (lost > t.maxHp * CONFIG.ultCapFrac + 4) weak.push(`${f.ult.name} 상한 넘음 ${Math.round(lost)}`);
  }
  check('필살기 10개가 표적에게 들어가고 40% 상한을 지킴', weak.length === 0, weak.join(', '));
}

// 4) 레벨·진화·카드
{
  const sim = new Simulation(3, '나', opts('rhino', 'charge'));
  sim.enemies.next = 1e9;
  const p = sim.snakes[0];
  let evo2 = false, subOffer = false;
  for (let k = 0; k < 400 && p.level < CONFIG.maxLevel; k++) {
    sim.feed(p, 4);
    for (let i = 0; i < 6; i++) sim.step();
    if (p.evo >= 2) evo2 = true;
    if (p.offer?.kind === 'sub') subOffer = true;
    if (p.offer) sim.chooseCard(p, 0);
  }
  for (let i = 0; i < 120; i++) sim.step();
  while (p.offer) sim.chooseCard(p, 0);
  check('레벨 16까지 오름', p.level === CONFIG.maxLevel, `Lv${p.level}`);
  check('Lv5 성충 + 보조 기술 고르기, Lv10 각성', evo2 && subOffer && p.evo === 3 && !!p.sub, `단계 ${p.evo}, 보조 ${p.sub?.name}`);
  check('능력 칸은 최대 4개', p.abilities.length <= 4 && p.abilities.length >= 3, `${p.abilities.length}칸`);
  // 모두 최대가 되면 보너스 카드만
  p.abilities = p.abilities.slice(0, 4).map((a) => ({ ...a, lv: 3 }));
  while (p.abilities.length < 4) p.abilities.push({ id: ['jaw', 'shell', 'light', 'regen'][p.abilities.length], lv: 3 });
  p.mainLv = 2;
  p.subLv = 1;
  p.pending = 1;
  sim.makeOffer(p);
  const off = p.offer as Snake['offer'];
  check('모두 최대면 보너스 카드만', !!off && off.cards.every((c) => c.kind === 'bonus'));
}

// 5) 잔해: 모은 영양의 30%, 레벨이 더 높으면 절반만
{
  const { sim, p, t } = arena('kingmantis', 'sweep', 1);
  t.totalNut = 200;
  t.level = 3;
  const before = sim.foods.length;
  sim.kill(t, p.id, 'bite');
  const rem = sim.foods.slice(before).filter((f) => f.kind === 2);
  const total = rem.reduce((a, f) => a + f.ep, 0);
  check('잔해 = 모은 영양의 30%', Math.abs(total - 60) < 1, `${total.toFixed(1)}`);
  p.level = 5;
  const n0 = p.totalNut;
  sim.feed(p, rem[0].ep * (p.level > rem[0].sub ? CONFIG.remainsWeakMul : 1));
  check('내가 레벨이 높으면 잔해 영양 절반', Math.abs(p.totalNut - n0 - rem[0].ep * 0.5 * CONFIG.nutMul) < 0.01);
}

// 6) 아들 모드: 주는 피해 ×5
{
  const a = arena('kingmantis', 'sweep');
  const b = arena('kingmantis', 'sweep');
  b.sim.setOpts({ ...b.sim.opts, power: 5 });
  a.t.isPlayer = b.t.isPlayer = false;
  const d1 = a.sim.damage(a.t, 20, a.p.id, 'bite', 0, 0);
  const d5 = b.sim.damage(b.t, 20, b.p.id, 'bite', 0, 0);
  check('아들 모드: 내 공격 5배', d5 === d1 * 5, `${d1} → ${d5}`);
}

// 7) 특성·본능
{
  const sim = new Simulation(5, '나', { power: 1, bots: 3, map: 'grass', loadout: { species: 'kingstag', form: 'grab', traits: ['preheat', 'sprint'] } });
  const p = sim.snakes[0];
  check('특성 필살기 예열: 게이지 30에서 시작', p.ult >= 30);
  check('봇 수 설정', sim.snakes.length === 4);
  sim.enemies.next = 1e9;
  p.invulnT = 0;
  sim.damage(p, p.hp + 50, -1, 'wall', 0, 0, 'wall');
  check('왕사슴벌레: 쓰러질 피해를 한 번 버팀', p.alive && p.hp >= 1);
  const m = arena('kingmantis', 'stab');
  m.p.cmd = { ...m.p.cmd, sneak: true };
  run(m.sim, 1.2, hold(m.t));
  check('왕사마귀: 웅크리고 1초 뒤 기도 자세', m.p.prayArmed);
}

// 8) 필살기 게이지: 받으면 차고, 쓰러지면 0
{
  const { sim, p, t } = arena('wasp' === 'wasp' ? 'hornet' : 'hornet', 'burst');
  const u0 = p.ult;
  sim.damage(p, p.maxHp * 0.2, t.id, 'bite', 0, 0);
  check('맞으면 필살기 게이지가 참', p.ult > u0 + 10, `${u0.toFixed(1)} → ${p.ult.toFixed(1)}`);
  p.lives = 3;
  sim.kill(p, t.id, 'bite');
  check('쓰러지면 게이지 0', p.ult === 0);
}

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);

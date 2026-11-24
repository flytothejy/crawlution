// 크롤러 도감: 게임 데이터(species·cards·config)를 그대로 읽어 보여 주고,
// 실제 시뮬레이션 + 게임 렌더러로 물기·기술·보조 기술·필살기 모션을 재생한다.
import '../client/fonts.css';
import { CONFIG, evoOf, radiusFor } from '../shared/config';
import { COMMON_SUBS, FAMILIES, FAMILY, ROLE_LIST, ROLES, SPECIAL_FOODS, SPECIES_BY_ID, formsOf, type Family, type FamilyId, type SubDef } from '../shared/species';
import { ABILITIES, COMMON_TRAITS, familyTraits, type TraitDef } from '../shared/cards';
import { baseB, biteOf, maxHpOf } from '../shared/combat';
import { Simulation, type Snake } from '../shared/sim';
import type { Snapshot, SnakeView } from '../shared/types';
import { GameRenderer, type Frame, type FrameSnake } from '../client/renderer';
import measured from './measured.json';
import { themeOf } from '../client/fxtheme';

type Meas = { dmg: number; fx: string[] };
const M = measured as unknown as {
  date: string;
  forms: Record<string, Record<string, { lv5: Meas; lv10: Meas }>>;
  ults: Record<string, Meas>;
  subs: Record<string, Meas>;
  famDuel: Record<string, number>;
  duelGames: number;
  traitDuel?: Record<string, number>;
  traitField?: Record<string, number>;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const r0 = (v: number) => Math.round(v);
const LV = [1, 5, 10] as const;

// ---------- 상태 ----------
let fam: Family = FAMILY.mantis;
let species = fam.species[0];
let stage: 1 | 2 | 3 = 3;
let roleFilter: string = 'all';
type Action = { kind: 'bite' } | { kind: 'main'; form: string } | { kind: 'sub'; sub: SubDef } | { kind: 'ult' };
let action: Action = { kind: 'main', form: fam.forms[0].id };
let loop = true;
let tab = 'crawler';

const renderer = new GameRenderer();
let sim: Simulation | null = null;
let me: Snake;
let dummies: Snake[] = [];
const homes: [number, number][] = [
  [160, 0],
  [250, 150],
  [250, -150],
];
let sceneT = 0;
let cast = false;
let acc = 0;
let snap: Snapshot | null = null;

// ---------- 수치 ----------
function statsAt(f: Family, level: number) {
  const st = evoOf(level);
  const fi = { level, stage: st, family: f.id, isBoss: false };
  return {
    hp: maxHpOf(fi, CONFIG.startSegments),
    bite: biteOf(fi),
    B: baseB(fi),
    spd: (CONFIG.baseSpeed + CONFIG.speedPerLevel * (level - 1) + CONFIG.evoSpeed[st]) * f.spd,
    r: radiusFor(st),
  };
}
function bar(v: number, lo = 0.7, hi = 1.35) {
  const k = Math.max(0.08, Math.min(1, (v - lo) / (hi - lo)));
  return `<i class="bar"><b style="width:${k * 100}%"></b></i>`;
}
const pctTag = (v: number | undefined) => (v === undefined ? '' : `<span class="wr ${v >= 56 ? 'hi' : v <= 44 ? 'lo' : ''}">${v}%</span>`);

// ---------- 모션 재생 ----------
function actionName(a: Action) {
  if (a.kind === 'bite') return { icon: '🦷', name: '물기', desc: '머리로 상대 몸을 물면 피해. 꼬리 끝은 급소' };
  if (a.kind === 'ult') return { icon: fam.ult.icon, name: fam.ult.name, desc: fam.ult.desc };
  if (a.kind === 'sub') return { icon: a.sub.icon, name: a.sub.name, desc: a.sub.desc };
  const fo = fam.forms.find((f) => f.id === a.form)!;
  const lip = fam.id === 'dragonfly' && stage === 1;
  return lip ? { icon: '👄', name: '아랫입술 발사', desc: '수채(어린 모습)일 때 주 기술: 아랫입술을 쏘아 낚아챔' } : { icon: fo.icon, name: fo.name, desc: fo.desc };
}

function setupScene() {
  if (action.kind === 'main' && !formsOf(species).some((f) => f.id === (action as { form: string }).form)) action = { kind: 'main', form: formsOf(species)[0].id };
  const form = action.kind === 'main' ? action.form : fam.forms[0].id;
  const level = LV[stage - 1];
  sim = new Simulation(11, '나', { power: 1, bots: 3, map: 'grass', loadout: { species, form, traits: [] }, startLevel: level });
  sim.enemies.next = 1e9;
  me = sim.snakes[0];
  me.abilities = [];
  me.mainLv = me.subLv = 0;
  me.offer = null;
  me.pending = 0;
  me.subPending = false;
  me.lives = 99;
  me.sub = action.kind === 'sub' ? action.sub : stage >= 2 ? fam.sub : null;
  sim.spawnAt(me, -40, 0, 0, 26);
  dummies = sim.snakes.slice(1, 4);
  dummies.forEach((d, i) => {
    d.isPlayer = true; // 봇 생각 끄기(그릴 때는 남으로 보이게 되돌린다)
    d.name = '허수아비';
    d.sp = { ...d.sp, instinct: { ...d.sp.instinct, id: 'none' as never } }; // 허수아비는 본능 없음(글씨가 화면을 가리지 않게)
    d.lives = 99;
    d.traits = new Set();
    d.abilities = [];
    if (d.level < level) sim!.autoLevel(d, level - d.level);
    d.offer = null;
    d.pending = 0;
    sim!.spawnAt(d, homes[i][0], homes[i][1], Math.PI / 2, 26);
    d.hp = d.maxHp;
    d.invulnT = 0;
  });
  me.invulnT = 0;
  me.hp = me.maxHp;
  sceneT = 0;
  cast = false;
  snap = null;
}

function stepScene() {
  if (!sim) return;
  const tgt = dummies[0];
  // 허수아비: 제자리 근처를 천천히 맴돈다(웅크린 속도)
  dummies.forEach((d, i) => {
    if (!d.alive) return;
    const [hx, hy] = homes[i];
    const dx = hx - d.x, dy = hy - d.y;
    const far = Math.hypot(dx, dy) > 34;
    const a = far ? Math.atan2(dy, dx) : Math.atan2(d.y - hy, d.x - hx) + Math.PI / 2;
    d.cmd = { ...d.cmd, angle: a, sneak: true, boost: false };
    if (d.hp < d.maxHp * 0.35) d.hp = d.maxHp;
    d.ult = 0;
  });
  if (me.hp < me.maxHp * 0.35) me.hp = me.maxHp;
  // 내 곤충: 표적을 바라보며 다가간다. 가까우면 웅크려 속도를 줄인다
  const ta = Math.atan2(tgt.y - me.y, tgt.x - me.x);
  const d0 = Math.hypot(tgt.x - me.x, tgt.y - me.y);
  const back = action.kind === 'main' && action.form === 'backjet';
  const cmd = { ...me.cmd, angle: back && sceneT > 0.15 ? ta + Math.PI : ta, sneak: false, boost: false };
  if (!cast && sceneT > 0.35) {
    cast = true;
    if (action.kind === 'main') ((me.skillCd = 0), (me.ult = 0), (cmd.skillSeq = me.lastSkillSeq + 1));
    if (action.kind === 'ult') ((me.ult = CONFIG.ultMax), (cmd.skillSeq = me.lastSkillSeq + 1));
    if (action.kind === 'sub') ((me.subCd = 0), (cmd.subSeq = me.lastSubSeq + 1));
    if (action.kind === 'main' && action.form === 'ambush') sim.later(0.8, () => sim?.shove(tgt, Math.PI, 70));
  }
  if (action.kind !== 'ult' && me.ult >= CONFIG.ultMax) me.ult = 0;
  sim.setCommand(me.id, cmd);
  sim.step();
  sceneT += sim.dt;
  snap = sim.snapshot();
  const byId = new Map<number, SnakeView>(snap.snakes.map((s) => [s.id, s]));
  renderer.handleEvents(snap.events, byId, snap.playerId);
  const len = action.kind === 'ult' || fam.id === 'bee' ? 6 : 4.2;
  if (!me.alive || (loop && sceneT > len)) setupScene();
}

async function initStage() {
  const box = $('stage');
  await renderer.init(box, box);
  renderer.opts.numbers = false; // 도감은 모션을 보려는 곳이라 피해 숫자는 끔(반복 칩 옆 '숫자'로 켬)
  renderer.opts.zoomMul = 0.72; // 기술 범위가 다 보이게 조금 멀리서
  renderer.app.ticker.add((tk) => {
    if (tab !== 'crawler') return;
    acc += Math.min(0.1, tk.deltaMS / 1000);
    if (!sim) setupScene();
    while (sim && acc >= sim.dt) {
      acc -= sim.dt;
      stepScene();
    }
    if (!snap) return;
    renderer.reveal = snap.player.reveal;
    const snakes = snap.snakes.map((s) => (s.id === snap!.playerId ? s : { ...s, isPlayer: false })) as FrameSnake[];
    const frame: Frame = { snakes, foods: snap.foods, rings: snap.rings, zones: snap.zones, projs: snap.projs, minions: snap.minions, teles: snap.teles, enemy: null, map: snap.map, playerId: snap.playerId };
    renderer.render(frame, Math.min(0.05, tk.deltaMS / 1000));
  });
}

function play(a: Action) {
  action = a;
  setupScene();
  drawControls();
}

// ---------- 크롤러 탭 ----------
function drawRoles() {
  $('roles').innerHTML = [['all', '전체', '🐞'], ...ROLE_LIST.map((r) => [r, ROLES[r].name, ROLES[r].icon])]
    .map(([id, n, ic]) => `<button class="chip${roleFilter === id ? ' on' : ''}" data-r="${id}">${ic} ${n}</button>`)
    .join('');
  $('roles').querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => ((roleFilter = b.dataset.r!), drawRoles(), drawFams())));
}

function drawFams() {
  $('fams').innerHTML = FAMILIES.filter((f) => roleFilter === 'all' || f.role === roleFilter)
    .map((f) => `<button class="fc${f.id === fam.id ? ' on' : ''}" data-f="${f.id}" style="--c:${hex(f.color)}"><img src="${renderer.portrait(f.species[0] + '@3')}" alt=""><b>${f.name}</b><small>${ROLES[f.role].icon} ${ROLES[f.role].name}</small></button>`)
    .join('');
  $('fams').querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => pickFam(b.dataset.f as FamilyId)));
  $('fams').querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function pickFam(id: FamilyId, act?: Action) {
  fam = FAMILY[id];
  species = fam.species[0];
  action = act ?? { kind: 'main', form: fam.forms[0].id };
  drawFams();
  drawInfo();
  setupScene();
  drawControls();
}

function drawControls() {
  const an = actionName(action);
  $('now').innerHTML = `<b>${an.icon} ${an.name}</b><small>${an.desc}</small>`;
  $('stages').innerHTML = fam.stages
    .map((n, i) => `<button class="chip${stage === i + 1 ? ' on' : ''}" data-st="${i + 1}">Lv${LV[i]} ${n}</button>`)
    .join('') + `<button class="chip tog${loop ? ' on' : ''}" id="loopBtn">🔁 반복</button><button class="chip tog${renderer.opts.numbers ? ' on' : ''}" id="numBtn">🔢 숫자</button>`;
  $('stages').querySelectorAll<HTMLButtonElement>('[data-st]').forEach((b) => (b.onclick = () => ((stage = Number(b.dataset.st) as 1 | 2 | 3), setupScene(), drawControls(), drawInfo())));
  $('loopBtn').onclick = () => ((loop = !loop), drawControls(), loop || setupScene());
  $('numBtn').onclick = () => ((renderer.opts.numbers = !renderer.opts.numbers), drawControls());
  $('sps').innerHTML = fam.species
    .map((id) => `<button class="chip sp${id === species ? ' on' : ''}" data-s="${id}"><img src="${renderer.portrait(id + '@' + stage)}" alt="">${SPECIES_BY_ID.get(id)!.name}</button>`)
    .join('');
  $('sps').querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => ((species = b.dataset.s!), setupScene(), drawControls(), drawInfo())));
  const on = (a: Action) => JSON.stringify(a) === JSON.stringify(action);
  const btn = (a: Action, icon: string, name: string, cls = '') => `<button class="act ${cls}${on(a) ? ' on' : ''}" data-a='${JSON.stringify(a.kind === 'sub' ? { kind: 'sub', id: a.sub.id } : a)}'>${icon}<small>${name}</small></button>`;
  $('acts').innerHTML =
    btn({ kind: 'bite' }, '🦷', '물기') +
    formsOf(species).map((fo) => btn({ kind: 'main', form: fo.id }, fo.icon, fo.name)).join('') +
    btn({ kind: 'sub', sub: fam.sub }, fam.sub.icon, fam.sub.name, 'sub') +
    btn({ kind: 'ult' }, fam.ult.icon, '필살기', 'ult') +
    `<select id="commonSub"><option value="">공용 보조 기술 ▾</option>${COMMON_SUBS.filter((c) => c.families?.includes(fam.id)).map((s) => `<option value="${s.id}"${action.kind === 'sub' && action.sub.id === s.id ? ' selected' : ''}>${s.icon} ${s.name}</option>`).join('')}</select>`;
  $('acts').querySelectorAll<HTMLButtonElement>('.act').forEach((b) => {
    b.onclick = () => {
      const a = JSON.parse(b.dataset.a!);
      play(a.kind === 'sub' ? { kind: 'sub', sub: a.id === fam.sub.id ? fam.sub : COMMON_SUBS.find((s) => s.id === a.id)! } : a);
    };
  });
  $<HTMLSelectElement>('commonSub').onchange = (e) => {
    const id = (e.target as HTMLSelectElement).value;
    const sd = COMMON_SUBS.find((s) => s.id === id);
    if (sd) play({ kind: 'sub', sub: sd });
  };
}

function fxTags(m?: Meas) {
  return m ? m.fx.map((x) => `<span class="tag">${x}</span>`).join('') : '';
}

function traitCard(t: TraitDef) {
  const wr = M.traitDuel?.[t.id];
  const fld = M.traitField?.[t.id];
  return `<div class="tr"><b>${t.icon} ${t.name}</b>${pctTag(wr)}<small class="up">▲ ${t.up}</small><small class="dn">▼ ${t.down}</small>${fld !== undefined ? `<small class="ms">판 순위 ${fld >= 0 ? '+' : ''}${fld}점</small>` : ''}</div>`;
}

function drawInfo() {
  const F = fam;
  const sp = SPECIES_BY_ID.get(species)!;
  const like = SPECIAL_FOODS[F.likes], hate = SPECIAL_FOODS[F.hates];
  $('hero').innerHTML = `<div class="pic" style="--c:${hex(F.color)}"><img src="${renderer.portrait(species + '@' + stage)}" alt=""></div>
    <div><div class="nm">${sp.name} <small>${F.name}</small></div>
    <div class="rl">${ROLES[F.role].icon} ${ROLES[F.role].name} · ${F.stages.join(' → ')}</div>
    <div class="inst">🧬 <b>${sp.instinct.name}</b> ${sp.instinct.desc}</div>
    <div class="fxt">✨ 연출: ${themeOf(species)?.tag ?? ''}</div>
    <div class="fact">${sp.fact}</div></div>`;
  const rows = [1, 5, 10, 16].map((l) => [l, statsAt(F, l)] as const);
  const fd = M.forms[F.id] ?? {};
  $('info').innerHTML = `
  <section><h3>기본 능력치 <small>계열 배율 · 1:1 승률 ${pctTag(M.famDuel[F.id])}</small></h3>
    <div class="mults">
      <div><em>❤ 체력</em>${bar(F.hp)}<span>×${F.hp}</span></div>
      <div><em>🦷 공격</em>${bar(F.atk)}<span>×${F.atk}</span></div>
      <div><em>⚡ 속도</em>${bar(F.spd, 0.8, 1.2)}<span>×${F.spd}</span></div>
      <div><em>⏱ 재사용</em>${bar(2 - F.cdMul, 0.7, 1.1)}<span>×${F.cdMul}</span></div>
      <div><em>💥 밀림</em>${bar(2 - F.knockTaken, 0.9, 1.6)}<span>×${F.knockTaken}</span></div>
    </div>
    <table class="lv"><tr><th>레벨</th><th>체력</th><th>물기</th><th>기술 기준 B</th><th>속도</th></tr>
    ${rows.map(([l, s]) => `<tr><td>Lv${l}</td><td>${r0(s.hp)}</td><td>${r0(s.bite)}</td><td>${r0(s.B)}</td><td>${r0(s.spd)}</td></tr>`).join('')}</table>
    <p class="note">체력은 몸 길이 ${CONFIG.startSegments}마디 기준(길수록 늘어남). 기술 피해는 B의 배수로 정해져 있다.</p>
  </section>
  <section><h3>🎯 주 기술 · ${F.skill}</h3>
    ${F.forms.map((fo) => {
      const m = fd[fo.id];
      const cant = F.species.filter((id) => !formsOf(id).some((x) => x.id === fo.id)).map((id) => SPECIES_BY_ID.get(id)!.name);
      return `<div class="sk${formsOf(species).some((x) => x.id === fo.id) ? '' : ' off'}" style="--c:${hex(F.color)}"><div class="hd"><b>${fo.icon} ${fo.name}</b>${cant.length ? `<span class="badge g">${cant.join('·')} 못 씀</span>` : ''}<button class="pl" data-play='${JSON.stringify({ kind: 'main', form: fo.id })}'>▶ 보기</button></div>
      <p>${fo.desc}</p><p class="aw">각성: ${fo.awake}</p>
      <div class="kv"><span>재사용 ${fo.cd}초</span><span>거리 ${fo.range}</span>${m ? `<span>실측 피해 Lv5 ${m.lv5.dmg} · Lv10 ${m.lv10.dmg}</span>` : ''}</div><div class="tags">${fxTags(m?.lv10)}</div></div>`;
    }).join('')}
  </section>
  <section><h3>🧩 보조 기술 <small>Lv5 성충에서 전용 1 + 공용 2 중 고름</small></h3>
    <div class="sk" style="--c:${hex(F.color)}"><div class="hd"><b>${F.sub.icon} ${F.sub.name}</b><span class="badge">전용</span><button class="pl" data-play='${JSON.stringify({ kind: 'sub', id: F.sub.id })}'>▶ 보기</button></div>
    <p>${F.sub.desc}</p><div class="kv"><span>재사용 ${F.sub.cd}초</span>${M.subs[F.sub.id]?.dmg ? `<span>실측 피해 ${M.subs[F.sub.id].dmg}</span>` : ''}</div><div class="tags">${fxTags(M.subs[F.sub.id])}</div></div>
  </section>
  <section><h3>⚡ 필살기</h3>
    <div class="sk ult" style="--c:${hex(F.color)}"><div class="hd"><b>${F.ult.icon} ${F.ult.name}</b><button class="pl" data-play='${JSON.stringify({ kind: 'ult' })}'>▶ 보기</button></div>
    <p>${F.ult.desc}</p><p class="aw">각성: ${F.ult.awake}</p>
    <div class="kv"><span>0.5초 예고 · 한 대상에 최대 체력 40%까지</span>${M.ults[F.id] ? `<span>실측 피해 Lv10 ${M.ults[F.id].dmg}</span>` : ''}</div><div class="tags">${fxTags(M.ults[F.id])}</div></div>
  </section>
  <section><h3>🧬 종 4가지 · 본능</h3>
    <div class="spgrid">${F.species.map((id) => {
      const s = SPECIES_BY_ID.get(id)!;
      return `<div class="spc${id === species ? ' on' : ''}" data-s="${id}"><img src="${renderer.portrait(id + '@3')}" alt=""><div><b>${s.name}</b><small><em>${s.instinct.name}</em> ${s.instinct.desc}</small><small class="fxs">✨ ${themeOf(id)?.tag ?? ''}</small></div></div>`;
    }).join('')}</div>
  </section>
  <section><h3>🎒 ${F.name} 전용 특성 <small>%는 1:1 거울 대결에서 특성 단 쪽 승률</small></h3><div class="trgrid">${familyTraits(F.id).map(traitCard).join('')}</div></section>
  <section><h3>🍽 입맛 · 상성</h3><div class="kv"><span class="lk">좋아함 ${like.icon} ${like.name}</span><span class="ht">싫어함 ${hate.icon} ${hate.name}</span></div><p class="note">강함: ${F.strong}<br>약함: ${F.weak}</p></section>`;
  $('info').querySelectorAll<HTMLButtonElement>('.pl').forEach((b) =>
    (b.onclick = () => {
      const a = JSON.parse(b.dataset.play!);
      play(a.kind === 'sub' ? { kind: 'sub', sub: fam.sub } : a);
      $('stageWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
  $('info').querySelectorAll<HTMLElement>('.spc').forEach((el) => (el.onclick = () => ((species = el.dataset.s!), setupScene(), drawControls(), drawInfo())));
}

// ---------- 비교 탭 ----------
let sortKey = 'duel', sortDir = -1;
function drawCompare() {
  const cols: [string, string, (f: Family) => number, (v: number) => string][] = [
    ['hp', '체력×', (f) => f.hp, (v) => `×${v}`],
    ['atk', '공격×', (f) => f.atk, (v) => `×${v}`],
    ['spd', '속도×', (f) => f.spd, (v) => `×${v}`],
    ['cd', '재사용×', (f) => f.cdMul, (v) => `×${v}`],
    ['kn', '밀림×', (f) => f.knockTaken, (v) => `×${v}`],
    ['hp10', 'Lv10 체력', (f) => statsAt(f, 10).hp, (v) => String(r0(v))],
    ['bite10', 'Lv10 물기', (f) => statsAt(f, 10).bite, (v) => String(r0(v))],
    ['b10', 'Lv10 B', (f) => statsAt(f, 10).B, (v) => String(r0(v))],
    ['spd10', 'Lv10 속도', (f) => statsAt(f, 10).spd, (v) => String(r0(v))],
    ['duel', '1:1 승률', (f) => M.famDuel[f.id] ?? 0, (v) => `${v}%`],
  ];
  const col = cols.find((c) => c[0] === sortKey) ?? cols[cols.length - 1];
  const list = [...FAMILIES].sort((a, b) => (col[2](a) - col[2](b)) * sortDir);
  const ext = cols.map((c) => {
    const vs = FAMILIES.map(c[2]);
    return [Math.min(...vs), Math.max(...vs)];
  });
  $('cmp').innerHTML = `<table class="cmp"><tr><th>계열</th>${cols.map((c) => `<th data-k="${c[0]}" class="${c[0] === sortKey ? 'on' : ''}">${c[1]}${c[0] === sortKey ? (sortDir < 0 ? '▼' : '▲') : ''}</th>`).join('')}</tr>
    ${list.map((f) => `<tr data-f="${f.id}"><td class="nm"><img src="${renderer.portrait(f.species[0] + '@3')}" alt="">${f.name}<small>${ROLES[f.role].icon}</small></td>${cols.map((c, i) => {
      const v = c[2](f);
      const [lo, hi] = ext[i];
      const cls = hi > lo ? (v === hi ? 'mx' : v === lo ? 'mn' : '') : '';
      return `<td class="${cls}">${c[3](v)}</td>`;
    }).join('')}</tr>`).join('')}</table>`;
  $('cmp').querySelectorAll<HTMLElement>('th[data-k]').forEach((th) => (th.onclick = () => ((sortDir = th.dataset.k === sortKey ? -sortDir : -1), (sortKey = th.dataset.k!), drawCompare())));
  $('cmp').querySelectorAll<HTMLElement>('tr[data-f]').forEach((tr) => (tr.onclick = () => (showTab('crawler'), pickFam(tr.dataset.f as FamilyId))));
  // 기술 형태 실측 피해 한눈에
  $('cmpForms').innerHTML = `<table class="cmp"><tr><th>계열</th><th colspan="3">기술 형태 · Lv10 실측 피해(허수아비 1마리, 4초)</th><th>필살기</th></tr>${FAMILIES.map((f) => `<tr data-f="${f.id}"><td class="nm"><img src="${renderer.portrait(f.species[0] + '@3')}" alt="">${f.name}</td>${f.forms.map((fo) => `<td class="fm">${fo.icon} ${fo.name}<b>${M.forms[f.id]?.[fo.id]?.lv10.dmg ?? '-'}</b></td>`).join('')}<td class="fm">${f.ult.icon} ${f.ult.name}<b>${M.ults[f.id]?.dmg ?? '-'}</b></td></tr>`).join('')}</table>`;
  $('cmpForms').querySelectorAll<HTMLElement>('tr[data-f]').forEach((tr) => (tr.onclick = () => (showTab('crawler'), pickFam(tr.dataset.f as FamilyId))));
}

// ---------- 특성·카드·보조 기술 탭 ----------
function drawTraits() {
  $('traitsBox').innerHTML = `<section><h3>공용 특성 10 <small>1칸 · %는 1:1 거울 대결 승률, '판 순위'는 8분 판 안 순위 백분위 변화</small></h3><div class="trgrid">${COMMON_TRAITS.map(traitCard).join('')}</div></section>` +
    FAMILIES.map((f) => `<section><h3 style="color:${hex(f.color)}">${f.name} 전용 <small>${ROLES[f.role].icon} ${ROLES[f.role].name}</small></h3><div class="trgrid">${familyTraits(f.id).map(traitCard).join('')}</div></section>`).join('');
}
function drawCards() {
  const fams = new Map(FAMILIES.map((f) => [f.id, f]));
  const one = (a: (typeof ABILITIES)[number]) => `<div class="ab"><div class="hd"><b>${a.icon} ${a.name}</b>${a.family ? `<span class="badge" style="background:${hex(fams.get(a.family)!.color)}">${fams.get(a.family)!.name}</span>` : ''}${a.roles ? a.roles.map((r) => `<span class="badge g">${ROLES[r].icon}</span>`).join('') : ''}${a.auto ? '<span class="badge g">자동</span>' : ''}</div><ol>${[1, 2, 3].map((l) => `<li>${a.desc(l)}</li>`).join('')}</ol></div>`;
  $('cardsBox').innerHTML = `<p class="note">레벨업마다 3장 중 1장. 능력 칸 4개 × 3레벨. 계열 전용 카드는 2배, 역할에 맞는 카드는 1.5배 잘 나온다.</p><section><h3>공용 카드</h3><div class="abgrid">${ABILITIES.filter((a) => !a.family).map(one).join('')}</div></section><section><h3>계열 전용 카드</h3><div class="abgrid">${ABILITIES.filter((a) => a.family).map(one).join('')}</div></section>`;
}
function drawSubs() {
  $('subsBox').innerHTML = `<p class="note">Lv5 성충이 될 때 계열 전용 1개 + 공용 2개 중에서 고른다. 공용은 아래 표시된 계열(생태에 맞는 계열)에게만 나온다. ▶를 누르면 지금 고른 계열로 모션을 본다.</p><div class="abgrid">${COMMON_SUBS.map((s) => `<div class="ab"><div class="hd"><b>${s.icon} ${s.name}</b><button class="pl" data-sub="${s.id}">▶</button></div><p>${s.desc}</p><p class="fams">${(s.families ?? []).map((f) => `<span class="badge" style="background:${hex(FAMILY[f].color)}">${FAMILY[f].name}</span>`).join(' ')}</p><div class="kv"><span>재사용 ${s.cd}초</span>${M.subs[s.id]?.dmg ? `<span>실측 피해 ${M.subs[s.id].dmg}</span>` : ''}</div><div class="tags">${fxTags(M.subs[s.id])}</div></div>`).join('')}</div>`;
  $('subsBox').querySelectorAll<HTMLButtonElement>('.pl').forEach((b) => (b.onclick = () => (showTab('crawler'), play({ kind: 'sub', sub: COMMON_SUBS.find((s) => s.id === b.dataset.sub)! }))));
}

function showTab(t: string) {
  tab = t;
  document.querySelectorAll<HTMLElement>('nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll<HTMLElement>('.tab').forEach((el) => el.classList.toggle('hidden', el.id !== 't-' + t));
  if (t === 'crawler') requestAnimationFrame(() => renderer.app.resize());
  window.scrollTo({ top: 0 });
}

async function boot() {
  await document.fonts?.ready;
  await initStage();
  $('date').textContent = `실측 ${M.date} · 1:1 대결 ${M.duelGames}판(Lv8)`;
  document.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => (b.onclick = () => showTab(b.dataset.t!)));
  drawRoles();
  drawFams();
  drawInfo();
  drawControls();
  drawCompare();
  drawTraits();
  drawCards();
  drawSubs();
  setupScene();
  (globalThis as { __codex?: unknown }).__codex = { pickFam, play, get sim() { return sim; } };
}
void boot();

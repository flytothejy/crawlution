// 크롤러 도감: 게임 데이터(species·cards·config)를 그대로 읽어 보여 주고,
// 실제 시뮬레이션 + 게임 렌더러로 물기·기술·보조 기술·필살기 모션을 재생한다.
import { STATUSES } from '../shared/status';
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
import { startDash } from '../shared/skills';
import { fxSound, MOTION_FX, Sfx } from '../client/sfx';
import { SLOT_LV, SLOT_NAME, V3_BY_ID, V3_FAMILIES, V3_FAMILY, V3_SPECIES, v3Kit, type V3FamId, type V3Family, type V3Play, type V3React, type V3Skill, type V3Slot, type V3Species } from '../shared/v3';
import type { FxKind } from '../shared/types';

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
let tab = 'v3';
// 3판 탭 상태
let mode: 'old' | 'v3' = 'v3';
let v3f: V3Family = V3_FAMILIES[0];
let v3s: V3Species = V3_BY_ID.get(v3f.species[0])!;
let v3slot: V3Slot = 'atk';
let v3stage: 1 | 3 = 3;
/** 새 기술은 몸이 비슷한 2판 종으로 장면을 돌리고 이펙트만 연출한다 */
const PROXY: Record<V3FamId, string> = { beetle: 'rhino', centipede: 'widow', mantis: 'kingmantis', dragonfly: 'giantdf', bee: 'hornet', ant: 'brownbug', spider: 'orbspider', butterfly: 'genji' };
let script: V3Play | null = null;
let curAct: Action = { kind: 'bite' };
let curLen = 4.2;
const charmed = new Map<Snake, number>();
const confused = new Map<Snake, number>();
const itchy = new Map<Snake, number>();
let circleT = 0;
const MELEE = ['lift', 'grab', 'throw', 'scissor', 'sweep', 'combo', 'push', 'stab'];
/** 재생 빠르기(느리게 보기): 1 → 0.5 → 0.25 */
let speed = 1;
const sfx = new Sfx();
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
const SPEEDS = [1, 0.5, 0.25];
const speedChip = () => `<button class="chip tog${speed < 1 ? ' on' : ''}" data-speed="1">🐢 ${speed === 1 ? '보통' : speed + '배'}</button>`;
function bindSpeed(root: HTMLElement, redraw: () => void) {
  root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => (b.onclick = () => ((speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]), redraw())));
}
let puffT = 0;
function findSub(id: string): SubDef {
  return FAMILIES.find((f) => f.sub.id === id)?.sub ?? COMMON_SUBS.find((c) => c.id === id)!;
}

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

function sceneParams(): { sp: string; act: Action; level: number } {
  script = null;
  if (mode === 'old') {
    if (action.kind === 'main' && !formsOf(species).some((f) => f.id === (action as { form: string }).form)) action = { kind: 'main', form: formsOf(species)[0].id };
    return { sp: species, act: action, level: LV[stage - 1] };
  }
  const sk = v3Kit(v3s)[v3slot];
  const real = sk.play.real;
  if (!real) {
    script = sk.play;
    return { sp: PROXY[v3f.id], act: { kind: 'bite' }, level: 10 };
  }
  const act: Action = real.kind === 'main' ? { kind: 'main', form: real.form! } : real.kind === 'ult' ? { kind: 'ult' } : { kind: 'sub', sub: findSub(real.sub!) };
  return { sp: real.sp, act, level: 10 };
}

function setupScene() {
  const P = sceneParams();
  curAct = P.act;
  const spId = P.sp;
  const form = curAct.kind === 'main' ? curAct.form : formsOf(spId)[0].id;
  const level = P.level;
  const spFam = SPECIES_BY_ID.get(spId)!.family;
  curLen = script ? 4.6 : curAct.kind === 'ult' || spFam === 'bee' ? 6 : 4.2;
  charmed.clear();
  confused.clear();
  itchy.clear();
  circleT = 0;
  sim = new Simulation(11, '나', { power: 1, bots: 3, map: 'grass', loadout: { species: spId, form, traits: [] }, startLevel: level });
  sim.enemies.next = 1e9;
  me = sim.snakes[0];
  me.abilities = [];
  me.mainLv = me.subLv = 0;
  me.offer = null;
  me.pending = 0;
  me.subPending = false;
  me.lives = 99;
  me.sub = curAct.kind === 'sub' ? curAct.sub : mode === 'old' && stage >= 2 ? fam.sub : null;
  const melee = curAct.kind === 'main' && MELEE.includes(curAct.form);
  sim.spawnAt(me, mode === 'v3' && !melee ? -130 : -40, 0, 0, 26); // 3판 탭: 돌진·도약 거리가 보이게 조금 멀리서
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
    let a = far ? Math.atan2(dy, dx) : Math.atan2(d.y - hy, d.x - hx) + Math.PI / 2;
    // 3판 연출: 매혹된 적은 나에게 천천히 걸어오고, 혼란된 적은 갈지자로 흔들린다
    if ((charmed.get(d) ?? 0) > sceneT) a = Math.atan2(me.y - d.y, me.x - d.x);
    if ((confused.get(d) ?? 0) > sceneT) a += Math.sin(sceneT * 11 + i) * 1.3;
    d.cmd = { ...d.cmd, angle: a, sneak: true, boost: false };
    if (d.hp < d.maxHp * 0.35) d.hp = d.maxHp;
    d.ult = 0;
    d.biteCd = 99; // 허수아비는 물지 않는다(기술과 상관없는 독·상태 아이콘이 섞이지 않게)
  });
  if (me.hp < me.maxHp * 0.35) me.hp = me.maxHp;
  // 내 곤충: 표적을 바라보며 다가간다. 가까우면 웅크려 속도를 줄인다
  const ta = Math.atan2(tgt.y - me.y, tgt.x - me.x);
  const d0 = Math.hypot(tgt.x - me.x, tgt.y - me.y);
  const act = curAct;
  const back = act.kind === 'main' && act.form === 'backjet';
  const cmd = { ...me.cmd, angle: back && sceneT > 0.15 ? ta + Math.PI : ta, sneak: false, boost: false };
  if (circleT > sceneT) cmd.angle = me.angle + 0.16;
  if (cast && sceneT < 1.6 && d0 < 150) cmd.sneak = true; // 기술을 쓴 뒤에는 천천히: 물기가 섞여 모션이 안 보이지 않게
  // 근접 기술은 닿는 거리까지 다가간 뒤에 쓴다(헛손질 방지)
  const near = act.kind === 'main' && MELEE.includes(act.form) ? 115 : act.kind === 'main' && act.form === 'heatball' ? 170 : 1e9;
  if (!cast && sceneT > 0.35 && (d0 < near || sceneT > 1.6)) {
    cast = true;
    if (act.kind === 'main') ((me.skillCd = 0), (me.ult = 0), (cmd.skillSeq = me.lastSkillSeq + 1));
    if (act.kind === 'ult') ((me.ult = CONFIG.ultMax), (cmd.skillSeq = me.lastSkillSeq + 1));
    if (act.kind === 'sub') ((me.subCd = 0), (cmd.subSeq = me.lastSubSeq + 1));
    if (act.kind === 'main' && act.form === 'ambush') sim.later(0.8, () => sim?.shove(tgt, Math.PI, 70));
    if (script) runScript(script, tgt);
  }
  if (act.kind !== 'ult' && me.ult >= CONFIG.ultMax) me.ult = 0;
  sim.setCommand(me.id, cmd);
  sim.step();
  sceneT += sim.dt;
  // 상태 표시 입자(혼란·매혹·가려움)
  puffT -= sim.dt;
  if (puffT <= 0) {
    puffT = 0.28;
    for (const [m, kind] of [[confused, 'confuse'], [charmed, 'charm'], [itchy, 'itch']] as const)
      for (const [d, t] of m) if (t > sceneT && d.alive) sim.events.push({ type: 'skillHit', x: d.x, y: d.y, kind });
  }
  snap = sim.snapshot();
  if (mode === 'v3') for (const e of snap.events) if (e.type === 'fx' && e.snake === me.id) e.sp = v3s.id;
  const byId = new Map<number, SnakeView>(snap.snakes.map((s) => [s.id, s]));
  renderer.handleEvents(snap.events, byId, snap.playerId);
  // 소리: 내 기술의 모션 소리(예고·발동·착지)와 타격음
  const quiet = new Set<number>();
  for (const e of snap.events) if (e.type === 'fx' && MOTION_FX.has(e.kind)) quiet.add(e.snake);
  for (const e of snap.events) {
    if (e.type === 'fx' && e.snake === me.id) {
      const nm = fxSound(e.kind, e.wk);
      if (nm) sfx.play(nm);
    } else if (e.type === 'skill' && e.snake === me.id && !quiet.has(e.snake)) sfx.play(e.slot === 'ult' ? 'molt' : 'skill', 0.8);
    else if (e.type === 'hit' && e.by === me.id && e.dmg > 0) sfx.play(e.dmg > 60 ? 'hitBig' : 'hit', 0.8);
  }
  if (!me.alive || (loop && sceneT > curLen)) setupScene();
}

async function initStage() {
  const box = $('stage');
  await renderer.init(box, box);
  renderer.opts.numbers = false; // 도감은 모션을 보려는 곳이라 피해 숫자는 끔(반복 칩 옆 '숫자'로 켬)
  renderer.opts.zoomMul = 0.72; // 기술 범위가 다 보이게 조금 멀리서
  renderer.app.ticker.add((tk) => {
    if (tab !== 'crawler' && tab !== 'v3') return;
    if (manual) return;
    frameOut(Math.min(0.1, tk.deltaMS / 1000) * speed);
  });
}

/** 한 장씩 넘기기(필름 띠 만들기용): 시뮬레이션을 sec만큼 돌리고 한 장 그린다 */
let manual = false;
function advance(sec: number) {
  manual = true;
  frameOut(sec);
  renderer.app.render();
}

function frameOut(dtIn: number) {
  {
    acc += dtIn;
    if (!sim) setupScene();
    while (sim && acc >= sim.dt) {
      acc -= sim.dt;
      stepScene();
    }
    if (!snap) return;
    renderer.reveal = snap.player.reveal;
    const snakes = snap.snakes.map((s) => (s.id === snap!.playerId ? (mode === 'v3' ? { ...s, species: v3s.id, stage: v3stage } : s) : { ...s, isPlayer: false })) as FrameSnake[];
    const frame: Frame = { snakes, foods: snap.foods, rings: snap.rings, zones: snap.zones, projs: snap.projs, minions: snap.minions, teles: snap.teles, enemy: null, map: snap.map, playerId: snap.playerId };
    renderer.render(frame, dtIn);
  }
}

function play(a: Action) {
  action = a;
  setupScene();
  drawControls();
}

// ---------- 3판: 새 기술 연출 ----------
function runScript(p: V3Play, tgt: Snake) {
  const S = sim!;
  const T = p.reactT ?? 1;
  const dist = p.dist ?? 120;
  // 내 몸 움직임(예고 동작이 있으면 그 뒤에)
  if (p.moveDelay) S.later(p.moveDelay, () => moveScript(p, dist));
  else moveScript(p, dist);
  runScriptRest(p, tgt, T);
}

function moveScript(p: V3Play, dist: number) {
  const S = sim!;
  if (p.move === 'dash') startDash(S, me, '', dist, 3.2);
  if (p.move === 'hop') startDash(S, me, '', dist, 3, true);
  if (p.move === 'back') {
    me.dashAngle = me.angle + Math.PI;
    startDash(S, me, '', dist, 3);
    S.later(0.4, () => (me.dashAngle = NaN));
  }
  if (p.move === 'zig')
    for (let k = 0; k < 4; k++)
      S.later(k * 0.32, () => {
        me.dashAngle = me.angle + (k % 2 ? -0.9 : 0.9);
        startDash(S, me, '', dist / 4, 2.6, true);
      });
  if (p.move === 'zig') S.later(1.35, () => (me.dashAngle = NaN));
  if (p.move === 'skip') for (let k = 0; k < 3; k++) S.later(k * 0.25, () => startDash(S, me, '', dist / 3, 3, true));
  if (p.move === 'tri') {
    // 삼각형 세 꼭짓점: 뒤왼쪽 → 뒤오른쪽 → 앞
    const a = me.angle, cx = me.x + Math.cos(a) * 135, cy = me.y + Math.sin(a) * 135;
    const pts = [a - (2 * Math.PI) / 3, a + (2 * Math.PI) / 3, a].map((t) => [cx + Math.cos(t) * 85, cy + Math.sin(t) * 85]);
    pts.forEach(([px, py], k) =>
      S.later(k * 0.25, () => {
        me.dashAngle = Math.atan2(py - me.y, px - me.x);
        startDash(S, me, '', Math.hypot(px - me.x, py - me.y), 4, true);
      }),
    );
    S.later(0.78, () => (me.dashAngle = NaN));
  }
  if (p.move === 'circle') {
    circleT = sceneT + 1.1;
    startDash(S, me, '', 300, 2.2);
  }
}

function runScriptRest(p: V3Play, tgt: Snake, T: number) {
  const S = sim!;
  if (p.minions) {
    const mi = p.minions;
    S.later(mi.delay ?? 0.1, () => {
      for (let k = 0; k < mi.n; k++) S.addMinion(me, mi.kind, mi.life, S.B(me) * 1.2, false, k);
    });
  }
  // 내 몸 상태
  const st = p.selfT ?? 1;
  for (const k of p.self ?? []) {
    if (k === 'fly') me.flyT = st;
    if (k === 'ghost') me.ghostT = st;
    if (k === 'hide') me.hiddenT = st;
    if (k === 'shield') me.reduceT = st;
    if (k === 'curl') me.curlT = st;
    if (k === 'bitter') me.bitterT = st;
  }
  // 이펙트(터지는 순간의 내 위치, 방향은 쓴 순간 기준)
  const a0 = me.angle, x0 = me.x, y0 = me.y;
  for (const f of p.fx ?? []) {
    S.later(f.delay ?? 0.02, () => {
      const a = a0 + (f.aoff ?? 0);
      let x = me.x, y = me.y;
      if (f.at === 'front') ((x = x0 + Math.cos(a) * (f.d ?? 100)), (y = y0 + Math.sin(a) * (f.d ?? 100))); // 쓴 자리 기준(도약 착지점 등)
      if (f.at === 'tgt') ((x = tgt.x), (y = tgt.y));
      if (f.at === undefined || f.at === 'head') ((x += Math.cos(a) * 14), (y += Math.sin(a) * 14));
      S.fx(f.kind as FxKind, f.on === 'tgt' ? tgt : me, x, y, { r: f.r, len: f.len, half: f.half, angle: a, x1: me.x, y1: me.y, wk: f.wk, dur: f.dur });
    });
  }
  // 맞은 쪽 반응
  const hitAt = p.reactAt ?? (p.fx ?? []).reduce((m, f) => Math.max(m, f.delay ?? 0), 0) * 0.5 + 0.12;
  S.later(hitAt, () => {
    const list = p.all ? dummies.filter((d) => d.alive && Math.hypot(d.x - me.x, d.y - me.y) < 360) : [tgt];
    for (const d of list) for (const r of p.react ?? []) react(d, r, T);
  });
}

function react(d: Snake, r: V3React, T: number) {
  const S = sim!;
  const away = Math.atan2(d.y - me.y, d.x - me.x);
  const hitFx = (kind: 'cut' | 'stun' | 'push' | 'slow' | 'root' | 'blind' | 'mark' | 'fear' | 'silence' | 'grab' | 'poison') => S.events.push({ type: 'skillHit', x: d.x, y: d.y, kind });
  switch (r) {
    case 'stun': d.stunT = T; hitFx('stun'); break;
    case 'lift': d.stunT = Math.max(d.stunT, T); S.shove(d, away, 30); hitFx('grab'); break;
    case 'root': d.rootT = T; hitFx('root'); break;
    case 'slow': d.slowT = T; d.slowMul = 0.5; hitFx('slow'); break;
    case 'fear': d.fearT = T; hitFx('fear'); break;
    case 'blind': d.blindT = T; hitFx('blind'); break;
    case 'silence': d.silenceT = T; hitFx('silence'); break;
    case 'mark': d.markT = 3; hitFx('mark'); break;
    case 'poison': d.poisonT = 3; d.poisonDps = 1; d.poisonBy = me.id; hitFx('poison'); break;
    case 'push': for (let k = 0; k < 6; k++) S.later(k * 0.03, () => S.shove(d, away, 14)); hitFx('push'); break;
    case 'pull': for (let k = 0; k < 10; k++) S.later(k * 0.05, () => S.shove(d, Math.atan2(me.y - d.y, me.x - d.x), 9)); hitFx('grab'); break;
    case 'cut': hitFx('cut'); break;
    case 'confuse': confused.set(d, sceneT + T); d.confuseT = T; break;
    case 'charm': charmed.set(d, sceneT + T); d.charmT = T; break;
    case 'itch': itchy.set(d, sceneT + T); d.itchT = T; hitFx('poison'); break;
  }
}

// ---------- 3판 탭 ----------
const SLOT_CLS: Record<V3Slot, string> = { atk: 'atk', def: 'def', spc: 'spc', ult: 'ult' };
function playV3(slot: V3Slot) {
  v3slot = slot;
  setupScene();
  drawV3Controls();
}
function pickV3Fam(id: V3FamId) {
  v3f = V3_FAMILY[id];
  v3s = V3_BY_ID.get(v3f.species[0])!;
  v3slot = 'atk';
  drawV3();
  setupScene();
}
function pickV3Sp(id: string) {
  v3s = V3_BY_ID.get(id)!;
  v3f = V3_FAMILY[v3s.fam];
  if (v3s.swap && v3s.swap !== v3slot) v3slot = v3s.swap; // 종 기술부터 보여 준다
  drawV3();
  setupScene();
}

function skillCard(slot: V3Slot, k: V3Skill & { mine?: boolean }, c: number) {
  return `<div class="sk v3 ${SLOT_CLS[slot]}${slot === 'ult' ? ' ult' : ''}" style="--c:${hex(c)}">
    <div class="hd"><span class="slot ${SLOT_CLS[slot]}">${SLOT_NAME[slot]} <small>${SLOT_LV[slot]}</small></span><b>${k.icon} ${k.name}</b>${k.mine ? '<span class="badge mine">종 기술</span>' : ''}<button class="pl" data-slot="${slot}">▶ 보기</button></div>
    <div class="kv"><span>${k.type}</span>${k.cd ? `<span>재사용 ${k.cd}초</span>` : slot === 'ult' ? '<span>게이지가 차면</span>' : ''}${k.from ? `<span class="g">2판 ${k.from}</span>` : '<span class="nw">새 기술</span>'}</div>
    <p>${k.desc}</p>${k.awake ? `<p class="aw">각성: ${k.awake}</p>` : ''}
    <p class="fxd">✨ ${k.fx}</p><p class="ref">🎮 ${k.ref}</p></div>`;
}

function drawV3Controls() {
  const kit = v3Kit(v3s);
  const k = kit[v3slot];
  $('now').innerHTML = mode === 'v3' ? `<b>${k.icon} ${k.name}</b><small>${k.desc}</small>` : $('now').innerHTML;
  $('v3acts').innerHTML = (['atk', 'def', 'spc', 'ult'] as V3Slot[])
    .map((sl) => `<button class="act ${sl}${sl === v3slot ? ' on' : ''}${kit[sl].mine ? ' mine' : ''}" data-slot="${sl}">${kit[sl].icon}<small>${SLOT_NAME[sl]}<br>${kit[sl].name}</small></button>`)
    .join('');
  $('v3acts').querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) => (b.onclick = () => playV3(b.dataset.slot as V3Slot)));
  $('v3stages').innerHTML =
    [1, 3].map((st) => `<button class="chip${v3stage === st ? ' on' : ''}" data-st="${st}">${st === 1 ? v3f.stages[0] : v3f.stages[1]} 모습</button>`).join('') +
    `<button class="chip tog${loop ? ' on' : ''}" id="v3loop">🔁 반복</button><button class="chip tog${renderer.opts.numbers ? ' on' : ''}" id="v3num">🔢 숫자</button>${speedChip()}`;
  $('v3stages').querySelectorAll<HTMLButtonElement>('[data-st]').forEach((b) => (b.onclick = () => ((v3stage = Number(b.dataset.st) as 1 | 3), drawV3())));
  $('v3loop').onclick = () => ((loop = !loop), drawV3Controls(), loop || setupScene());
  $('v3num').onclick = () => ((renderer.opts.numbers = !renderer.opts.numbers), drawV3Controls());
  bindSpeed($('v3stages'), drawV3Controls);
}

function drawV3() {
  const F = v3f, sp = v3s;
  $('v3fams').innerHTML = V3_FAMILIES.map((f) => `<button class="fc${f.id === F.id ? ' on' : ''}" data-f="${f.id}" style="--c:${hex(f.color)}"><img src="${renderer.portrait(f.species[0] + '@3')}" alt=""><b>${f.name}</b><small>${f.cc}</small></button>`).join('');
  $('v3fams').querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => pickV3Fam(b.dataset.f as V3FamId)));
  $('v3fams').querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  $('v3famBox').innerHTML = `<div class="fh" style="--c:${hex(F.color)}"><div class="nm">${F.icon} ${F.name} <small>${F.seat}</small></div>
    <div class="kv"><span>제어: ${F.cc}</span><span>${F.stages.join(' → ')}</span>${F.merged ? `<span class="g">${F.merged}</span>` : ''}</div>
    <div class="tr2"><b>${F.trait.icon} 계열 특성 · ${F.trait.name}</b><p>${F.trait.desc}</p><p class="fxd">✨ ${F.trait.fx}</p><p class="ref">🎮 ${F.trait.ref}</p></div>
    <p class="note">🎨 모습: ${F.look}<br>🎆 공통 연출: ${F.motion}<br>💪 강함: ${F.strong}<br>⚠️ 약함: ${F.weak}</p></div>`;
  $('v3sps').innerHTML = F.species
    .map((id) => {
      const s = V3_BY_ID.get(id)!;
      return `<button class="chip sp${id === sp.id ? ' on' : ''}" data-s="${id}"><img src="${renderer.portrait(id + '@' + v3stage)}" alt="">${s.name}${s.base ? ' ⭐' : s.isNew ? ' 🆕' : ''}</button>`;
    })
    .join('');
  $('v3sps').querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => pickV3Sp(b.dataset.s!)));
  const swapTxt = sp.base ? '대표 종 · 계열 기술 그대로' : `${SLOT_NAME[sp.swap!]} 칸 → <b>${sp.skill!.icon} ${sp.skill!.name}</b>`;
  $('v3hero').innerHTML = `<div class="pic" style="--c:${hex(F.color)}"><img src="${renderer.portrait(sp.id + '@' + v3stage)}" alt=""></div>
    <div><div class="nm">${sp.name} <small>${F.name}${sp.isNew ? ' · 3판 새 종' : ''}</small></div>
    <div class="rl">${swapTxt}</div>
    <div class="inst">🧬 본능 <b>${sp.instinct.name}</b> ${sp.instinct.desc}</div>
    <div class="fxt">✨ 연출: ${sp.theme.tag} <i class="pal">${sp.theme.pal.map((c) => `<em style="background:${hex(c)}"></em>`).join('')}</i></div>
    <div class="fact">🎨 ${sp.gfx}</div><div class="fact">📖 ${sp.fact}</div></div>`;
  const kit = v3Kit(sp);
  $('v3skills').innerHTML = `<section><h3>${sp.name}의 기술 4칸 <small>▶를 누르면 위 무대에서 재생</small></h3>${(['atk', 'def', 'spc', 'ult'] as V3Slot[]).map((sl) => skillCard(sl, kit[sl], F.color)).join('')}
    <p class="note">'2판 …' 표시는 이미 있는 기술을 옮겨 온 것으로 실제 시뮬레이션이 돈다. '새 기술'은 이펙트와 맞은 쪽 반응(기절·밀림·혼란·매혹 등)만 연출로 보여 주고 피해 계산은 아직 없다.</p></section>`;
  $('v3skills').querySelectorAll<HTMLButtonElement>('.pl').forEach((b) => (b.onclick = () => (playV3(b.dataset.slot as V3Slot), $('v3stageHost').scrollIntoView({ behavior: 'smooth', block: 'start' }))));
  drawV3Controls();
}

function drawV3Tables() {
  $('v3famTable').innerHTML = `<table class="cmp v3t"><tr><th>계열</th><th>자리 · 제어</th><th>계열 특성</th><th>공격</th><th>방어</th><th>특수</th><th>필살기</th></tr>${V3_FAMILIES.map(
    (f) => `<tr data-f="${f.id}"><td class="nm"><img src="${renderer.portrait(f.species[0] + '@3')}" alt="">${f.name}</td><td class="fm">${f.seat.split(' · ')[0]}<br><small>${f.cc}</small></td><td class="fm">${f.trait.icon} ${f.trait.name}</td>${(['atk', 'def', 'spc', 'ult'] as V3Slot[]).map((sl) => `<td class="fm">${f[sl].icon} ${f[sl].name}<br><small>${f[sl].type}</small></td>`).join('')}</tr>`,
  ).join('')}</table>`;
  $('v3famTable').querySelectorAll<HTMLElement>('tr[data-f]').forEach((tr) => (tr.onclick = () => (pickV3Fam(tr.dataset.f as V3FamId), window.scrollTo({ top: 0, behavior: 'smooth' }))));
  $('v3spTable').innerHTML = `<table class="cmp v3t"><tr><th>종</th><th>바뀐 칸 → 종 기술</th><th>본능</th></tr>${V3_FAMILIES.map(
    (f) => `<tr class="grp"><td colspan="3" style="color:${hex(f.color)}">${f.icon} ${f.name}</td></tr>` + f.species.map((id) => {
      const s = V3_BY_ID.get(id)!;
      return `<tr data-s="${id}"><td class="nm"><img src="${renderer.portrait(id + '@3')}" alt="">${s.name}${s.isNew ? ' 🆕' : ''}</td><td class="fm">${s.base ? '⭐ 대표 · 그대로' : `${SLOT_NAME[s.swap!]} → ${s.skill!.icon} ${s.skill!.name}`}</td><td class="fm"><b class="in">${s.instinct.name}</b> ${s.instinct.desc}</td></tr>`;
    }).join(''),
  ).join('')}</table>`;
  $('v3spTable').querySelectorAll<HTMLElement>('tr[data-s]').forEach((tr) => (tr.onclick = () => (pickV3Sp(tr.dataset.s!), window.scrollTo({ top: 0, behavior: 'smooth' }))));
  drawStatusTable();
}

/** 상태 정리 표: 각 상태를 주는 기술을 40종의 기술 설명·반응에서 찾아 모은다 */
function drawStatusTable() {
  const srcOf = (d: (typeof STATUSES)[number]) => {
    const hits = new Map<string, string>();
    for (const sp of V3_SPECIES) {
      const kit = v3Kit(sp);
      for (const sl of ['atk', 'def', 'spc', 'ult'] as V3Slot[]) {
        const k = kit[sl];
        const text = k.name + ' ' + k.desc + ' ' + (k.awake ?? '') + ' ' + (k.play?.react ?? []).join(' ') + ' ' + (k.play?.self ?? []).join(' ');
        if (!d.keys.some((w) => text.includes(w))) continue;
        const fam = V3_FAMILY[sp.fam];
        hits.set(fam.icon + ' ' + k.name, fam.name);
      }
      const ins = sp.instinct.desc;
      if (d.keys.some((w) => ins.includes(w))) hits.set('🧬 ' + sp.instinct.name, sp.name);
    }
    for (const f of V3_FAMILIES) if (d.keys.some((w) => f.trait.desc.includes(w))) hits.set(f.icon + ' ' + f.trait.name + '(특성)', f.name);
    return [...hits.keys()];
  };
  const row = (d: (typeof STATUSES)[number]) => {
    const src = srcOf(d);
    return `<tr><td class="nm"><img src="${renderer.statusIcon(d.id)}" alt="" style="width:26px;height:26px">${d.name}</td><td class="fm">${d.desc}</td><td class="fm"><small>${src.length ? src.slice(0, 14).join(' · ') + (src.length > 14 ? ` 외 ${src.length - 14}` : '') : '—'}</small></td></tr>`;
  };
  $('v3stTable').innerHTML = `<table class="cmp v3t"><tr><th>상태</th><th>효과</th><th>주는 기술 · 본능</th></tr>
    <tr class="grp"><td colspan="3" style="color:#ff8a7a">⬇️ 상태 이상 (${STATUSES.filter((d) => d.kind === 'debuff').length})</td></tr>${STATUSES.filter((d) => d.kind === 'debuff').map(row).join('')}
    <tr class="grp"><td colspan="3" style="color:#8ae87a">⬆️ 상태 강화 (${STATUSES.filter((d) => d.kind === 'buff').length})</td></tr>${STATUSES.filter((d) => d.kind === 'buff').map(row).join('')}</table>`;
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
    .join('') + `<button class="chip tog${loop ? ' on' : ''}" id="loopBtn">🔁 반복</button><button class="chip tog${renderer.opts.numbers ? ' on' : ''}" id="numBtn">🔢 숫자</button>${speedChip()}`;
  $('stages').querySelectorAll<HTMLButtonElement>('[data-st]').forEach((b) => (b.onclick = () => ((stage = Number(b.dataset.st) as 1 | 2 | 3), setupScene(), drawControls(), drawInfo())));
  $('loopBtn').onclick = () => ((loop = !loop), drawControls(), loop || setupScene());
  $('numBtn').onclick = () => ((renderer.opts.numbers = !renderer.opts.numbers), drawControls());
  bindSpeed($('stages'), drawControls);
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
  const prev = mode;
  tab = t;
  if (t === 'v3') ((mode = 'v3'), $('v3stageHost').appendChild($('stage')));
  if (t === 'crawler') ((mode = 'old'), $('stageWrap').prepend($('stage')));
  if (mode !== prev) {
    setupScene();
    if (mode === 'old') drawControls();
    else drawV3Controls();
  }
  document.querySelectorAll<HTMLElement>('nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll<HTMLElement>('.tab').forEach((el) => el.classList.toggle('hidden', el.id !== 't-' + t));
  if (t === 'crawler' || t === 'v3') requestAnimationFrame(() => renderer.app.resize());
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
  drawV3();
  drawV3Tables();
  showTab('v3');
  setupScene();
  (globalThis as { __codex?: unknown }).__codex = { pickFam, play, pickV3Fam, pickV3Sp, playV3, showTab, setSpeed: (v: number) => (speed = v), advance, setManual: (v: boolean) => (manual = v), renderer, get sim() { return sim; }, get sceneT() { return sceneT; } };
}
void boot();

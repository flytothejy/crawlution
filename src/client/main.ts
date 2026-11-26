// 시작점: 화면·조작·시뮬레이션 호스트를 연결하고, 받은 상태를 보간해서 그린다.
import './fonts.css';
import { CONFIG } from '../shared/config';
import { FAMILIES, FAMILY, ROLE_LIST, ROLES, SPECIAL_FOODS, SPECIES_BY_ID, SUBS_BY_ID, formsOf, type Family, type FamilyId, type Role } from '../shared/species';
import { ABILITY_BY_ID, BONUS_CARDS, MAIN_UPS, SUB_UP } from '../shared/cards';
import { relation } from '../shared/combat';
import type { CardView, EnemyKind, EnemyView, GameOpts, Loadout, Snapshot, SnakeView } from '../shared/types';
import { createHost, type SimHost } from './host';
import { kitOf, V3_ROSTER } from '../shared/kit';
import { SLOT_NAME, V3_BY_ID, V3_FAMILIES, V3_FAMILY, type V3FamId } from '../shared/v3';
import { Input } from './input';
import { famColor, GameRenderer, lookKey, type Frame, type FrameSnake } from './renderer';
import { fxSound, MOTION_FX, Sfx } from './sfx';
import { loadSettings, saveSettings, SECTIONS, SON_POWER, type Settings } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** 천적 정보 */
const ENEMY: Record<EnemyKind, { name: string; icon: string; tip: string; c1: string; c2: string }> = {
  bird: { name: '새', icon: '🐦', tip: '그림자를 피해!', c1: '#5ab4ff', c2: '#2a6fd0' },
  frog: { name: '개구리', icon: '🐸', tip: '빨간 선에서 비켜!', c1: '#7ad84a', c2: '#3a9a2a' },
  rain: { name: '소나기', icon: '🌧️', tip: '물방울 표시를 피해! 몸이 길수록 많이 맞아요', c1: '#7ab0ff', c2: '#3a5ab8' },
  centipede: { name: '왕지네', icon: '👑', tip: '1등을 쫓아요! 잡으면 +1500', c1: '#ff6b5a', c2: '#c93a2a' },
  anteater: { name: '개미핥기', icon: '👅', tip: '빨간 띠에서 벗어나!', c1: '#d8966a', c2: '#9a5a2a' },
  child: { name: '채집망 든 아이', icon: '🧒', tip: '그물이 빨개지면 피해!', c1: '#ffb84a', c2: '#e0702a' },
};

const renderer = new GameRenderer();
if (location.search.includes('local')) (globalThis as { __renderer?: GameRenderer }).__renderer = renderer; // 시험용
const sfx = new Sfx();
let S: Settings = loadSettings();
let settingsOpen = false;
let tagTimer: ReturnType<typeof setInterval> | undefined;
let host: SimHost | null = null;
let input: Input;

// ---------- 들어가기 전에 고른 것 ----------
const LO_KEY = 'crawlution.loadout2';
function loadLoadout(): Loadout {
  try {
    const raw = localStorage.getItem(LO_KEY);
    if (raw) {
      const l = JSON.parse(raw) as Loadout;
      if (SPECIES_BY_ID.has(l.species) && kitOf(l.species)) return l;
    }
  } catch {
    /* 저장 불가 환경 */
  }
  return { species: 'rhino', form: 'charge', traits: [] };
}
/** 3판: 출전 전 특성 칸은 없다(예전 저장값의 특성은 지운다) */
function normTraits() {
  LO.traits = [];
}
function saveLoadout() {
  try {
    localStorage.setItem(LO_KEY, JSON.stringify(LO));
  } catch {
    /* 저장 불가 환경 */
  }
}
let LO: Loadout = loadLoadout();

// 받은 상태(스냅샷) 버퍼와 시간 맞추기
const snaps: Snapshot[] = [];
let offset: number | null = null;
const DELAY = 1 / CONFIG.tickRate + 0.005;

let playing = false;
let endAt = 0;
let maxLen = 0;
let startedAt = 0;
let lastCmdAt = 0;
let lastCmd = { angle: 0, boost: false, sneak: false, skillSeq: 0, subSeq: 0, spcSeq: 0, ultSeq: 0, cardSeq: 0, cardChoice: 0, rerollSeq: 0 };
let hudAt = 0;
let cardsKey = '';
let bannerT = 0;
let hudKey = '';
let skillKey = '';
let subKey = '';
let abilKey = '';
let skillReady = false;
let ultWas = false;
const segBuf = new Map<number, Float32Array>();

function bestScore(): number {
  try {
    return Number(localStorage.getItem('crawlution.best') || 0);
  } catch {
    return 0;
  }
}
function saveBest(v: number) {
  try {
    localStorage.setItem('crawlution.best', String(v));
  } catch {
    /* 저장 불가 환경 */
  }
}

function banner(text: string, c1 = '#ffb52e', c2 = '#f27b1c', ms = 2600) {
  const b = $('banner');
  b.textContent = text;
  b.style.setProperty('--bc', c1);
  b.style.setProperty('--bc2', c2);
  b.classList.remove('hidden');
  b.classList.remove('pop');
  void b.offsetWidth;
  b.classList.add('pop');
  bannerT = performance.now() + ms;
}

function flash(color = '#fff') {
  const f = $('flash');
  f.style.background = color;
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

function hurt(k: number) {
  const h = $('hurt');
  h.style.opacity = String(0.35 + 0.5 * k);
  h.classList.remove('go');
  void h.offsetWidth;
  h.classList.add('go');
}

// ---------- 처치 소식 ----------
function feed(html: string, mine: boolean) {
  const box = $('feed');
  const d = document.createElement('div');
  d.className = mine ? 'me ol-thin' : 'ol-thin';
  d.innerHTML = html;
  box.prepend(d);
  while (box.children.length > 4) box.lastElementChild?.remove();
  setTimeout(() => (d.style.opacity = '0'), mine ? 4200 : 3000);
  setTimeout(() => d.remove(), mine ? 4800 : 3600);
}

function who(s: SnakeView | undefined) {
  if (!s) return '?';
  const c = s.isBoss ? '#ffa08a' : hex(mixHex(famColor(s.family), 0xffffff, 0.35));
  return `<span style="color:${s.isPlayer ? '#ffe066' : c}">${s.isPlayer ? '나' : s.name}</span>`;
}

function onSnap(s: Snapshot) {
  snaps.push(s);
  if (snaps.length > 8) snaps.shift();
  const off = performance.now() / 1000 - s.time;
  if (offset === null || off < offset || off - offset > 0.25) offset = off;
  else offset += (off - offset) * 0.01;
  const byId = new Map<number, SnakeView>();
  for (const sn of s.snakes) byId.set(sn.id, sn);
  renderer.handleEvents(s.events, byId, s.playerId);
  if (!playing) return;
  playSounds(s, byId);
  const me = byId.get(s.playerId);
  for (const e of s.events) {
    if (e.type === 'enemyWarn') {
      const E = ENEMY[e.kind];
      banner(`⚠ 천적 경보: ${E.icon} ${E.name}!`, E.c1, E.c2, 2900);
      alarm(E.tip);
    }
    if (e.type === 'enemySoon') banner('🔔 천적이 곧 나타나요!', '#ffd23f', '#e0902a', 1600);
    if (e.type === 'enemyEnd' && e.kind === 'centipede' && e.killed) banner('👑 왕지네 처치!', '#ffd23f', '#f08a12', 2400);
    if (e.type === 'captured' && e.snake === s.playerId) {
      banner('🧒 채집망에 잡혔다!', '#ffb84a', '#e0702a', 2200);
      flash();
    }
    if (e.type === 'released' && e.snake === s.playerId) banner('풀려났다! 몸이 반쪽이 됐어요', '#7ad84a', '#3a9a2a', 2000);
    if (e.type === 'skill' && e.snake === s.playerId && e.slot === 'ult' && me) cutIn(me, e.name, e.icon);
    if (e.type === 'evolve' && e.snake === s.playerId && me?.family) {
      const F = FAMILY[me.family];
      const c = F.color;
      banner(e.stage >= 3 ? `✨ 각성! ${SPECIES_BY_ID.get(me.species)?.name}` : `🦋 ${F.stages[e.stage - 1]} 진화!`, hex(mixHex(c, 0xffffff, 0.25)), hex(c), 2200);
      flash(hex(mixHex(c, 0xffffff, 0.6)));
    }
    if (e.type === 'ultReady' && e.snake === s.playerId) banner('⚡ 필살기 준비!', '#ffe36b', '#f08a12', 1300);
    if (e.type === 'crush' && e.count > 0 && e.snake === s.playerId) flash();
    if (e.type === 'death') {
      const victim = byId.get(e.snake);
      const killer = e.by >= 0 ? byId.get(e.by) : undefined;
      const mine = e.snake === s.playerId || e.by === s.playerId || !!victim?.isBoss;
      const ic = { crush: '🌀', bite: '🦷', enemy: '⚠', poison: '☠️', skill: '⚔️', ult: '💥', wall: '🧱' }[e.cause];
      if (e.cause === 'enemy' && e.enemy) feed(`${ENEMY[e.enemy].icon} ${ENEMY[e.enemy].name}에게 ${who(victim)} 당함`, mine);
      else if (e.cause === 'wall') {
        if (mine) feed(`${ic} ${who(victim)} 벽에 부딪힘`, mine);
      } else if (killer) feed(`${who(killer)} ${ic} ${who(victim)}${e.cause === 'crush' ? ' 압착!' : ''}`, mine);
    }
    if (e.type === 'lifeLost') {
      banner(e.lives < 0 ? `쓰러졌다! ${Math.ceil(e.respawn ?? 2)}초 뒤 다시 나와요` : `쓰러졌다! 남은 목숨 ${'❤️'.repeat(e.lives)}`, '#ff6b5a', '#c93a2a', 1900);
      flash();
    }
    if (e.type === 'hit' && e.snake === s.playerId && e.dmg > 0) hurt(Math.min(1, e.dmg / 40));
    if (e.type === 'end') {
      endAt = performance.now() + (e.timeUp ? 1500 : 1300);
      if (e.timeUp) banner(`⏱ 시간 끝! ${e.rank}등`, '#ffd23f', '#f08a12', 1800);
    }
  }
}

/** 사건 → 효과음·진동. 나와 관련된 것은 크게, 근처의 다른 곤충 기술은 작게 */
function playSounds(s: Snapshot, byId: Map<number, SnakeView>) {
  const me = s.playerId;
  const cam = renderer.camera;
  const W = renderer.app.screen.width / cam.zoom, H = renderer.app.screen.height / cam.zoom;
  const near = (x: number, y: number) => Math.abs(x - cam.x) < W * 0.6 && Math.abs(y - cam.y) < H * 0.6;
  const motionIds = new Set<number>();
  for (const e of s.events) if (e.type === 'fx' && MOTION_FX.has(e.kind)) motionIds.add(e.snake);
  for (const e of s.events) {
    switch (e.type) {
      case 'eat':
        if (e.snake !== me) break;
        if (e.gold) (sfx.play('gem'), sfx.buzz(15));
        else if (e.special !== undefined) {
          if (e.taste === 1) (sfx.play('like'), sfx.buzz([25, 30, 25, 30, 60]));
          else if (e.taste === -1) (sfx.play('yuck'), sfx.buzz(140));
          else sfx.play('eatBig');
        } else sfx.play(e.big ? 'eatBig' : 'eat');
        break;
      case 'hit': {
        if (e.by === me && e.snake !== me) {
          if (e.blocked) sfx.play('block', 0.6);
          else if (e.kind === 'crit' || e.kind === 'ult') (sfx.play('crit'), sfx.buzz(45));
          else if (e.dmg >= 25) (sfx.play('hitBig'), sfx.buzz(14));
          else if (e.dmg > 0 && e.kind !== 'poison') sfx.play('hit', e.kind === 'minion' ? 0.4 : 1);
        } else if (e.snake === me) {
          if (e.blocked) sfx.play('block');
          else if (e.dmg > 0 && e.kind !== 'poison') {
            const mh = byId.get(me)?.maxHp ?? 100;
            if (e.dmg >= mh * 0.12 || e.kind === 'crit' || e.kind === 'ult') (sfx.play('hurtBig'), sfx.buzz(80));
            else (sfx.play('hurt'), sfx.buzz(25));
          }
        }
        break;
      }
      case 'skill': {
        const quiet = motionIds.has(e.snake); // 예고 동작이 있는 기술은 모션 소리가 대신한다
        if (e.snake === me) {
          if (e.slot === 'ult') (sfx.play('molt'), sfx.buzz([40, 30, 120]));
          else (quiet || sfx.play('skill'), sfx.buzz(30));
        } else if (near(e.x, e.y) && !quiet) sfx.play('skill', e.slot === 'ult' ? 0.6 : 0.25);
        break;
      }
      case 'fx': {
        const nm = fxSound(e.kind, e.wk);
        if (!nm) break;
        if (e.snake === me) sfx.play(nm);
        else if (near(e.x, e.y)) sfx.play(nm, 0.35);
        if (e.snake === me && (nm === 'slam' || nm === 'land')) sfx.buzz(45);
        break;
      }
      case 'levelUp':
        if (e.snake === me) (sfx.play('ready'), sfx.buzz(20));
        break;
      case 'evolve':
        if (e.snake === me) (sfx.play('molt'), sfx.buzz([30, 40, 90]));
        break;
      case 'ultReady':
        if (e.snake === me) (sfx.play('win', 0.5), sfx.buzz([20, 30, 20]));
        break;
      case 'ring':
        if (e.snake === me) sfx.play('ring');
        break;
      case 'death':
        if (e.by === me && e.snake !== me) {
          if (e.cause === 'crush') (sfx.play('crush'), sfx.buzz([60, 30, 140]));
          else (sfx.play('kill'), sfx.buzz(45));
        }
        break;
      case 'enemyWarn':
        sfx.play('warn');
        sfx.buzz([90, 60, 90, 60, 90]);
        break;
      case 'lifeLost':
        sfx.play('lifeLost');
        sfx.buzz([160, 80, 160]);
        break;
      case 'respawn':
        if (e.snake === me) sfx.play('respawn');
        break;
      case 'captured':
        if (e.snake === me) (sfx.play('captured'), sfx.buzz(260));
        break;
      case 'end':
        sfx.play(e.rank <= 3 ? 'win' : 'lose');
        sfx.buzz(e.rank === 1 ? [80, 60, 80, 60, 200] : 120);
        break;
    }
  }
}

/** 천적 경보: 화면 가장자리가 노랑·빨강으로 깜빡인다 */
function alarm(tip: string) {
  const a = $('alarm');
  a.querySelector<HTMLElement>('.tip')!.textContent = tip;
  a.classList.remove('hidden');
  a.classList.remove('go');
  void a.offsetWidth;
  a.classList.add('go');
  setTimeout(() => a.classList.add('hidden'), 3000);
}

/** 필살기 컷인: 초상화 + 이름이 화면 옆을 0.6초 지나간다(게임은 멈추지 않음) */
function cutIn(me: SnakeView, name: string, icon: string) {
  const c = $('cutin');
  c.style.setProperty('--c', hex(famColor(me.family)));
  c.innerHTML = `<img src="${renderer.portrait(lookKey(me.species, me.stage))}" alt=""><div><small class="ol-thin">필살기</small><b class="ol">${icon} ${name}!</b></div>`;
  c.classList.remove('hidden');
  c.getAnimations().forEach((a) => a.cancel());
  c.animate(
    [
      { transform: 'translateX(-100%) skewX(-12deg)', opacity: 0, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      { transform: 'translateX(0) skewX(-12deg)', opacity: 1, offset: 0.18 },
      { transform: 'translateX(4%) skewX(-12deg)', opacity: 1, offset: 0.78, easing: 'ease-in' },
      { transform: 'translateX(110%) skewX(-12deg)', opacity: 0 },
    ],
    { duration: 900, easing: 'linear', fill: 'forwards' },
  );
  flash(hex(famColor(me.family)));
}

/** 화면 밖 천적 방향 표시 */
function updateEnemyArrow(en: EnemyView | null) {
  const el = $('enemyArrow');
  if (!playing || !en) return el.classList.add('hidden');
  let x: number | null = null, y: number | null = null;
  if (en.kind === 'frog' || en.kind === 'anteater' || en.kind === 'child' || en.kind === 'centipede') ((x = en.x), (y = en.y));
  if (x === null || y === null) return el.classList.add('hidden');
  const cam = renderer.camera;
  const W = renderer.app.screen.width, H = renderer.app.screen.height;
  const sx = W / 2 + (x - cam.x) * cam.zoom, sy = H / 2 + (y - cam.y) * cam.zoom;
  const m = 46;
  if (sx > m && sx < W - m && sy > m && sy < H - m) return el.classList.add('hidden');
  const a = Math.atan2(sy - H / 2, sx - W / 2);
  const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
  el.classList.remove('hidden');
  el.style.left = `${W / 2 + Math.cos(a) * k}px`;
  el.style.top = `${H / 2 + Math.sin(a) * k}px`;
  el.querySelector<HTMLElement>('.ar')!.style.transform = `rotate(${a}rad)`;
  el.querySelector<HTMLElement>('.ic')!.textContent = ENEMY[en.kind].icon;
}

function mixHex(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

function buildFrame(): Frame | null {
  if (snaps.length === 0 || offset === null) return null;
  const rt = performance.now() / 1000 - offset - DELAY;
  let a = snaps[0], b = snaps[snaps.length - 1];
  for (let i = 0; i < snaps.length - 1; i++) {
    if (snaps[i].time <= rt && snaps[i + 1].time >= rt) {
      a = snaps[i];
      b = snaps[i + 1];
      break;
    }
  }
  const span = b.time - a.time;
  const t = span > 0 ? Math.max(0, Math.min(1, (rt - a.time) / span)) : 1;
  const aById = new Map(a.snakes.map((s) => [s.id, s]));
  const snakes: FrameSnake[] = b.snakes.map((sb) => {
    const sa = aById.get(sb.id);
    if (!sa || !sa.alive || !sb.alive) return sb as FrameSnake;
    const nb = sb.segs.length;
    let buf = segBuf.get(sb.id);
    if (!buf || buf.length !== nb) segBuf.set(sb.id, (buf = new Float32Array(nb)));
    const na = sa.segs.length;
    for (let i = 0; i < nb; i++) buf[i] = i < na ? sa.segs[i] + (sb.segs[i] - sa.segs[i]) * t : sb.segs[i];
    return { ...sb, segs: buf, angle: lerpAngle(sa.angle, sb.angle, t) };
  });
  return { snakes, foods: b.foods, rings: b.rings, zones: b.zones, projs: b.projs, minions: b.minions, teles: b.teles, enemy: b.enemy, map: b.map, playerId: b.playerId };
}

/** 강한 적 머리가 가깝거나 천적·남의 필살기 예고 안이면 화면 가장자리를 붉게 */
function updateDanger(frame: Frame) {
  const me = frame.snakes.find((s) => s.id === frame.playerId);
  let danger = false;
  if (playing && me && me.alive && me.segs.length >= 2) {
    const hx = me.segs[0], hy = me.segs[1];
    for (const s of frame.snakes) {
      if (s.id === me.id || !s.alive || s.segs.length < 2 || s.hidden > 0) continue;
      if (relation(me, s) >= 0) continue;
      if (Math.hypot(s.segs[0] - hx, s.segs[1] - hy) < 170) {
        danger = true;
        break;
      }
    }
    for (const te of frame.teles) if (te.owner !== me.id && te.shape === 'circle' && Math.hypot(te.x - hx, te.y - hy) < te.r + 20) danger = true;
    const en = frame.enemy;
    if (en && en.warn <= 0) {
      if (en.kind === 'bird') for (const sh of en.shadows) if (Math.hypot(sh.x - hx, sh.y - hy) < sh.r + 10) danger = true;
      if (en.kind === 'rain') for (const d of en.drops) if (Math.hypot(d.x - hx, d.y - hy) < d.r + 10) danger = true;
      if (en.kind === 'child' && Math.hypot(en.x - hx, en.y - hy) < en.r + 30) danger = true;
      if (en.kind === 'frog' && en.aim && Math.hypot(en.aim.x - hx, en.aim.y - hy) < 120) danger = true;
      if (en.kind === 'anteater' && en.strip && en.strip.t > 0) {
        const { x1, y1, w } = en.strip;
        const dx = x1 - en.x, dy = y1 - en.y, L2 = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((hx - en.x) * dx + (hy - en.y) * dy) / L2));
        if (Math.hypot(hx - en.x - dx * t, hy - en.y - dy * t) < w / 2 + 20) danger = true;
      }
    }
  }
  $('danger').classList.toggle('on', danger);
}

// ---------- 레벨업 카드 ----------
const BAND: Record<string, string> = { new: '#4ac84a', up: '#3a8ad8', main: '#f0903a', sub: '#f0903a', bonus: '#9a9a9a', pick: '#3a8ad8' };
const BAND_T: Record<string, string> = { new: '새 능력', up: '능력 강화', main: '기술 강화', sub: '기술 강화', bonus: '보너스', pick: '보조 기술' };

function dots(lv: number, max: number) {
  return `<span class="dots">${Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>`;
}

function cardInfo(c: CardView): { icon: string; name: string; desc: string; dots: string } {
  if (c.kind === 'new' || c.kind === 'up') {
    const a = ABILITY_BY_ID.get(c.id)!;
    const cur = c.lv - 1;
    const desc = cur > 0 ? `${a.desc(cur)} → <b>${a.desc(c.lv).replace(/^[^+−\d]*/, '')}</b>` : a.desc(c.lv);
    return { icon: a.icon, name: a.name + (a.auto ? ' <em>자동</em>' : ''), desc, dots: dots(c.lv, 3) };
  }
  if (c.kind === 'main') {
    const m = MAIN_UPS[c.lv - 1] ?? MAIN_UPS[0];
    return { icon: m.icon, name: m.name, desc: m.desc, dots: dots(c.lv, 2) };
  }
  if (c.kind === 'sub') return { icon: SUB_UP.icon, name: SUB_UP.name, desc: SUB_UP.desc, dots: dots(1, 1) };
  if (c.kind === 'pick') {
    const d = SUBS_BY_ID.get(c.id)!;
    return { icon: d.icon, name: d.name, desc: `${d.desc} <small>(${d.cd}초)</small>`, dots: '' };
  }
  const b = BONUS_CARDS.find((x) => x.id === c.id)!;
  return { icon: b.icon, name: b.name, desc: b.desc, dots: '' };
}

function updateCards(latest: Snapshot) {
  const p = latest.player;
  const off = p.offer;
  const key = off ? `${off.kind}:${off.cards.map((c) => c.kind + c.id + c.lv).join('|')}:${p.pending}:${p.rerolls}` : '';
  if (key === cardsKey) return;
  const same = off && cardsKey.split(':')[1] === key.split(':')[1];
  cardsKey = key;
  const box = $('cards');
  if (!off || !playing) {
    box.classList.add('hidden');
    return;
  }
  const title = off.kind === 'sub' ? `🦋 성충! 보조 기술을 골라요` : `✨ 레벨 ${p.level - p.pending + 1}! 골라요${p.pending > 1 ? ` <b>+${p.pending - 1}</b>` : ''}`;
  box.innerHTML = `<div class="ctop"><div class="ctitle ol">${title}</div>${p.rerolls > 0 ? `<button class="rr ol-thin" id="rerollBtn">🎲 다시 뽑기 ×${p.rerolls}${input.touch ? '' : ' <span class="badge">R</span>'}</button>` : ''}</div>
    <div class="crow">${off.cards.map((c, i) => {
      const inf = cardInfo(c);
      const k = input.touch ? '' : `<span class="key badge">${i + 1}</span>`;
      return `<button class="mcard${c.exclusive ? ' gold' : ''}" data-i="${i}" style="--c:${BAND[c.kind]}">${k}<div class="band">${c.exclusive ? '★ 전용 ' : ''}${BAND_T[c.kind]}</div><div class="ic">${inf.icon}</div><div class="nm">${inf.name}</div>${inf.dots}<div class="ds">${inf.desc}</div></button>`;
    }).join('')}</div>`;
  if (same) box.querySelectorAll<HTMLElement>('.mcard').forEach((el) => (el.style.animation = 'none'));
  box.classList.remove('hidden');
  box.querySelectorAll<HTMLButtonElement>('.mcard').forEach((el) =>
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sfx.play('click');
      input.card(Number(el.dataset.i));
    }),
  );
  $('rerollBtn')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.play('gem');
    input.reroll();
  });
}

// ---------- HUD ----------
/** 3판 기술 버튼: 공격(E) · 방어(Q) · 특수(W) · 필살기(F) */
const kitKeys: Record<string, string> = {};
let kitReady: Record<string, boolean> = {};
function updateKit(p: NonNullable<Snapshot['player']>, famCol: number) {
  const els: Record<string, HTMLElement> = { atk: $('skillBtn'), def: $('subBtn'), spc: $('spcBtn') };
  const KEY: Record<string, string> = { atk: 'E', def: 'Q', spc: 'W' };
  const COL: Record<string, number> = { atk: famCol, def: 0x5a9ad8, spc: 0x9a6ad8 };
  for (const k of p.kit!) {
    const el = els[k.slot];
    el.classList.remove('none');
    const locked = p.level < k.unlock;
    const key = `${k.name}:${locked}`;
    if (kitKeys[k.slot] !== key) {
      kitKeys[k.slot] = key;
      el.style.setProperty('--c', hex(locked ? 0x666666 : COL[k.slot]));
      el.style.setProperty('--ult', '0deg');
      el.innerHTML = locked
        ? `<span class="ic">🔒</span><span class="sn ol-thin">Lv${k.unlock} ${k.name}</span>`
        : `<span class="ic">${k.icon}</span><span class="sn ol-thin">${k.name}</span><span class="cd ol"></span>${input.touch ? '' : `<span class="key badge">${KEY[k.slot]}</span>`}`;
    }
    el.classList.toggle('locked', locked);
    el.classList.remove('ult');
    if (locked) continue;
    const cdK = k.cdMax > 0 ? Math.min(1, k.cd / k.cdMax) : 0;
    el.style.setProperty('--cd', `${cdK * 360}deg`);
    const ready = k.cd <= 0;
    el.classList.toggle('ready', ready && k.slot === 'atk');
    el.classList.toggle('cooling', !ready);
    if (ready && kitReady[k.slot] === false && playing) el.animate([{ transform: 'scale(0.8)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    kitReady[k.slot] = ready;
    el.querySelector<HTMLElement>('.cd')!.textContent = ready ? '' : String(Math.ceil(k.cd));
  }
  // 필살기: 게이지가 차면 빛난다
  const ub = $('ultBtn');
  const ultReady = p.ult >= CONFIG.ultMax;
  const uk = `${p.ultName}:${ultReady}`;
  if (kitKeys.ult !== uk) {
    kitKeys.ult = uk;
    ub.style.setProperty('--c', hex(ultReady ? 0xffb52e : 0x8a7a4a));
    ub.innerHTML = `<span class="ic">${p.ultIcon ?? '⚡'}</span><span class="sn ol-thin">${p.ultName ?? '필살기'}</span>${input.touch ? '' : '<span class="key badge">F</span>'}`;
    if (ultReady) ub.animate([{ transform: 'scale(0.75)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
  }
  ub.style.setProperty('--ult', `${(p.ult / CONFIG.ultMax) * 360}deg`);
  ub.classList.toggle('ult', ultReady);
  ub.classList.toggle('locked', !ultReady);
}

function updateHud(latest: Snapshot) {
  const me = latest.snakes.find((s) => s.id === latest.playerId);
  if (!me || !me.family) return;
  const F = FAMILY[me.family];
  const sp = SPECIES_BY_ID.get(me.species)!;
  const p = latest.player;
  const stats = $('stats');
  const hk = `${me.species}@${me.stage}:${me.level}:${S.son}`;
  if (hudKey !== hk) {
    hudKey = hk;
    stats.innerHTML = `<div class="pfw"><div class="pf" style="--c:${hex(F.color)}"><img src="${renderer.portrait(lookKey(me.species, me.stage))}" alt=""></div><span class="lv badge">Lv${me.level}</span></div>
      <div><div class="nm ol-thin">${V3_BY_ID.get(me.species)?.fam ? V3_FAMILY[V3_BY_ID.get(me.species)!.fam].icon : ROLES[F.role].icon} ${sp.name}${S.son ? `<span class="son">🦸×${SON_POWER}</span>` : ''}</div>
      <div class="st ol-thin">${F.stages[me.stage - 1]}${me.stage >= 3 ? ' ✨' : ''} · <span id="hLen"></span></div></div>`;
  }
  const hpk = Math.max(0, Math.min(1, me.hp / Math.max(1, me.maxHp)));
  const hb = $('hpbar');
  hb.querySelector<HTMLElement>('i')!.style.width = `${hpk * 100}%`;
  hb.querySelector<HTMLElement>('span')!.textContent = `${me.hp} / ${me.maxHp}`;
  hb.classList.toggle('low', hpk < 0.3);
  hb.classList.toggle('guard', me.sneaking);
  $('lives').innerHTML = CONFIG.lives > 0 ? Array.from({ length: CONFIG.lives }, (_, i) => `<b class="${i < p.lives ? '' : 'lost'}">❤</b>`).join('') : '';
  const left = Math.ceil(latest.timeLeft);
  const tm = $('timer');
  tm.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  tm.classList.toggle('low', left <= 30);
  const cp = $('captured');
  if (p.captured > 0 && playing) {
    cp.classList.remove('hidden');
    cp.innerHTML = `<div class="ol">🧒 채집망에 갇혔다!</div><b class="ol">${Math.ceil(p.captured)}</b><div class="ol-thin">풀려나면 몸이 반쪽이 돼요</div>`;
  } else cp.classList.add('hidden');
  const rs = $('respawn');
  if (p.respawnIn > 0 && (CONFIG.lives <= 0 || p.lives > 0) && playing) {
    rs.classList.remove('hidden');
    rs.innerHTML = `<div class="ol">부활까지</div><b class="ol">${Math.ceil(p.respawnIn)}</b><div class="ol-thin">${CONFIG.lives > 0 ? `남은 목숨 ${'❤️'.repeat(p.lives)}` : `쓰러짐 ${me.deaths}번 · 레벨과 카드는 그대로`}</div>`;
  } else rs.classList.add('hidden');
  const hl = $('hLen');
  if (hl) hl.textContent = `${me.length}마디 · 점수 ${me.score}`;

  // 영양 게이지(다음 레벨까지)
  const g = $('gauge');
  {
    const max = p.level >= CONFIG.maxLevel;
    const k = max ? 1 : Math.min(1, p.nut / p.need);
    g.classList.toggle('full', max);
    if (!g.querySelector('.gb')) g.innerHTML = `<div class="gb"><i></i><span class="ol-thin"></span></div>`;
    g.querySelector<HTMLElement>('.gb span')!.textContent = max ? '최대 레벨!' : `영양 ${Math.floor(p.nut)} / ${p.need}`;
    g.querySelector<HTMLElement>('.gb i')!.style.width = `${k * 100}%`;
  }

  // 능력 4칸 + 본능
  const ak = p.abilities.map((a) => a.id + a.lv).join(',') + ':' + me.species + ':' + p.mainLv + p.subLv;
  if (ak !== abilKey) {
    const old = new Map(abilKey ? (abilKey.split(':')[0] || '').split(',').filter(Boolean).map((x) => [x.slice(0, -1), Number(x.slice(-1))]) : []);
    abilKey = ak;
    const slots = Array.from({ length: 4 }, (_, i) => {
      const a = p.abilities[i];
      if (!a) return `<span class="ab empty"></span>`;
      const d = ABILITY_BY_ID.get(a.id)!;
      const up = (old.get(a.id) ?? 0) < a.lv ? ' up' : '';
      return `<span class="ab${d.family ? ' ex' : ''}${up}" title="${d.name}">${d.icon}${dots(a.lv, 3)}</span>`;
    }).join('');
    $('abil').innerHTML = `${slots}<span class="ab inst" title="${sp.instinct.name}">🧬</span>`;
  }

  if (p.kit) {
    updateKit(p, F.color);
  } else {
  // 주 기술 버튼(게이지가 차면 필살기)
  const btn = $('skillBtn');
  const ultReady = p.ult >= CONFIG.ultMax;
  const lip = p.form === 'lip';
  const form = F.forms.find((f) => f.id === p.form);
  const sk = `${me.family}:${p.form}:${ultReady}`;
  btn.classList.remove('none');
  if (skillKey !== sk) {
    skillKey = sk;
    btn.style.setProperty('--c', hex(ultReady ? 0xffb52e : F.color));
    const icon = ultReady ? F.ult.icon : lip ? '👄' : form?.icon ?? '✨';
    const name = ultReady ? F.ult.name : lip ? '아랫입술 발사' : form?.name ?? F.skill;
    btn.innerHTML = `<span class="ic">${icon}</span><span class="sn ol-thin">${name}</span><span class="cd ol"></span>${input.touch ? '' : '<span class="key badge">E</span>'}`;
  }
  btn.style.setProperty('--ult', `${(p.ult / CONFIG.ultMax) * 360}deg`);
  btn.classList.toggle('ult', ultReady);
  const cdK = !ultReady && p.skillCdMax > 0 ? p.skillCd / p.skillCdMax : 0;
  btn.style.setProperty('--cd', `${cdK * 360}deg`);
  const ready = ultReady || p.skillCd <= 0;
  btn.classList.toggle('ready', ready);
  btn.classList.toggle('cooling', !ready);
  if (ready && !skillReady && playing && me.alive) sfx.play('ready', 0.6);
  if ((ready && !skillReady) || (ultReady && !ultWas)) btn.animate([{ transform: 'scale(0.75)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'ease-out' });
  skillReady = ready;
  ultWas = ultReady;
  btn.querySelector<HTMLElement>('.cd')!.textContent = ready ? '' : String(Math.ceil(p.skillCd));

  // 보조 기술 버튼
  const sb = $('subBtn');
  const sd = p.subId ? SUBS_BY_ID.get(p.subId) : null;
  const sbk = `${p.subId}:${me.level >= 5}`;
  if (subKey !== sbk) {
    subKey = sbk;
    sb.style.setProperty('--c', hex(sd ? (sd.id === F.sub.id ? F.color : 0x6a9ad8) : 0x666666));
    sb.innerHTML = sd ? `<span class="ic">${sd.icon}</span><span class="sn ol-thin">${sd.name}</span><span class="cd ol"></span>${input.touch ? '' : '<span class="key badge">Q</span>'}` : `<span class="ic">🔒</span><span class="sn ol-thin">Lv5 성충</span>`;
  }
  sb.classList.toggle('locked', !sd);
  if (sd) {
    const k2 = p.subCdMax > 0 ? p.subCd / p.subCdMax : 0;
    sb.style.setProperty('--cd', `${k2 * 360}deg`);
    sb.classList.toggle('cooling', p.subCd > 0);
    sb.querySelector<HTMLElement>('.cd')!.textContent = p.subCd > 0 ? String(Math.ceil(p.subCd)) : '';
  }
  }

  // 순위
  const all = latest.snakes.filter((s) => !s.isBoss).sort((x, y) => y.score - x.score);
  const row = (s: SnakeView, i: number) => {
    const vf = V3_BY_ID.get(s.species)?.fam;
    const icon = vf ? V3_FAMILY[vf].icon : s.family ? ROLES[FAMILY[s.family].role].icon : '';
    return `<div class="row ${s.isPlayer ? 'me' : ''} ol-thin"><span class="rk">${i + 1}</span><span class="li" style="--c:${hex(famColor(s.family))}">${icon}</span><span class="n">${s.isPlayer ? '나' : s.name}</span><span class="k">${s.level}</span><span class="kd">${s.killsAll}/${s.deaths}</span><span class="v">${s.score}</span></div>`;
  };
  const myI = all.findIndex((s) => s.isPlayer);
  $('board').innerHTML = '<div class="hd">🏆 순위 <span>Lv · 처치/쓰러짐 · 점수</span></div>' + all.slice(0, 5).map(row).join('') + (myI >= 5 ? `<div class="sep">⋯</div>${row(all[myI], myI)}` : '');
  updateCards(latest);
  drawMinimap(latest);
}

function drawMinimap(s: Snapshot) {
  const c = $('minimap') as unknown as HTMLCanvasElement;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const W = c.width, R = CONFIG.arenaRadius, k = (W / 2 - 8) / R;
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = 'rgba(40,30,20,.55)';
  for (const rk of s.map.rocks) {
    ctx.beginPath();
    ctx.arc(W / 2 + rk.x * k, W / 2 + rk.y * k, Math.max(2, rk.r * k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(90,170,255,.55)';
  for (const pd of s.map.puddles) {
    ctx.beginPath();
    ctx.arc(W / 2 + pd.x * k, W / 2 + pd.y * k, Math.max(3, pd.r * k), 0, Math.PI * 2);
    ctx.fill();
  }
  // 지도 읽기·8자 춤: 귀한 먹이 표시
  ctx.fillStyle = '#ffd23f';
  for (const m of s.player.marks) {
    ctx.beginPath();
    ctx.arc(W / 2 + m.x * k, W / 2 + m.y * k, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const en = s.enemy;
  if (en && en.warn <= 0 && (en.kind === 'frog' || en.kind === 'anteater' || en.kind === 'child' || en.kind === 'centipede')) {
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ENEMY[en.kind].icon, W / 2 + en.x * k, W / 2 + en.y * k);
  }
  if (en && en.kind === 'bird')
    for (const sh of en.shadows) {
      ctx.beginPath();
      ctx.arc(W / 2 + sh.x * k, W / 2 + sh.y * k, Math.max(8, sh.r * k), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,60,40,.45)';
      ctx.fill();
    }
  for (const r of s.rings) {
    ctx.beginPath();
    ctx.arc(W / 2 + r.cx * k, W / 2 + r.cy * k, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  for (const sn of s.snakes) {
    if (!sn.alive || sn.segs.length < 2) continue;
    const me = sn.id === s.playerId;
    if (!me && sn.hidden > 0) continue;
    const x = W / 2 + sn.segs[0] * k, y = W / 2 + sn.segs[1] * k;
    ctx.beginPath();
    ctx.arc(x, y, me ? 8 : sn.isBoss ? 11 : 3 + sn.stage * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = me ? '#ffffff' : sn.isBoss ? '#ff4a3a' : hex(famColor(sn.family));
    ctx.fill();
    if (me || sn.isBoss || (s.player.reveal && !me)) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = s.player.reveal && !me ? '#ff6a4a' : '#1b2a12';
      ctx.stroke();
    }
  }
}

// ---------- 결과 ----------
function countUp(el: HTMLElement, to: number, ms = 900) {
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}

function showResult(latest: Snapshot) {
  const me = latest.snakes.find((s) => s.id === latest.playerId);
  if (!me || !me.family) return;
  playing = false;
  document.body.classList.remove('playing');
  input.resetHolds();
  $('danger').classList.remove('on');
  const p = latest.player;
  const F = FAMILY[me.family];
  const sp = SPECIES_BY_ID.get(me.species)!;
  const rank = p.rank, total = p.total;
  const won = rank === 1;
  const timeUp = latest.timeLeft <= 0.5;
  const prevBest = bestScore();
  const isNew = me.score > prevBest;
  saveBest(Math.max(prevBest, me.score));
  const over = $('over');
  over.classList.toggle('win', won);
  over.classList.toggle('mid', !won && rank <= 3);
  $('overTitle').textContent = won ? '🏆 1등! 숲의 왕' : rank <= 3 ? `${rank === 2 ? '🥈' : '🥉'} ${rank}등!` : timeUp ? `${rank}등` : '목숨을 다 썼어요';
  $('overSub').textContent = `${total}마리 중 ${rank}등 · ${timeUp ? `${Math.round(CONFIG.roundTime / 60)}분 완주` : '중간 탈락'} · Lv${me.level}`;
  countUp($('oScore'), me.score);
  $('oStage').textContent = `Lv${me.level}`;
  countUp($('oKills'), me.killsAll, 600);
  countUp($('oDeaths'), me.deaths, 600);
  countUp($('oCrush'), me.crushes, 600);
  // 최종 순위(위 5 + 나)
  const all = latest.snakes.filter((s) => !s.isBoss).sort((x, y) => y.score - x.score);
  const myI = all.findIndex((s) => s.isPlayer);
  const rr = (s: SnakeView, i: number) => `<tr class="${s.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td class="n">${s.isPlayer ? '나' : s.name}</td><td>${s.level}</td><td>${s.killsAll}/${s.deaths}</td><td>${s.score}</td></tr>`;
  $('oRank').innerHTML = `<table><tr><th>순위</th><th class="n">이름</th><th>Lv</th><th>처치/쓰러짐</th><th>점수</th></tr>${all.slice(0, 5).map(rr).join('')}${myI >= 5 ? rr(all[myI], myI) : ''}</table><p class="scorehow">점수 = 먹은 영양 + 처치 ${CONFIG.scoreKill} + 도움 ${CONFIG.scoreAssist} + 최고 레벨 ${CONFIG.scoreLevel} − 쓰러짐 ${CONFIG.scoreDeath} (판 전체 누적)</p>`;
  const sec = Math.floor((performance.now() - startedAt) / 1000);
  $('oTime').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  // 빌드 요약
  const form = F.forms.find((f) => f.id === LO.form);
  const sd = p.subId ? SUBS_BY_ID.get(p.subId) : null;
  $('oBuild').innerHTML = `<div class="who" style="--c:${hex(F.color)}"><div class="pc"><img src="${renderer.portrait(lookKey(me.species, me.stage))}" alt=""></div><div><b>${sp.name}</b><small>${F.stages[me.stage - 1]} · ${p.kit ? p.kit.map((k) => k.icon).join('') + (p.ultIcon ?? '') : `${form?.icon ?? ''} ${form?.name ?? ''}${sd ? ` · ${sd.icon} ${sd.name}` : ''}`}</small></div></div>
    <div class="abl">${p.abilities.map((a) => {
      const d = ABILITY_BY_ID.get(a.id)!;
      return `<span>${d.icon} ${d.name} ${dots(a.lv, 3)}</span>`;
    }).join('') || '<span>능력 카드 없음</span>'}</div>
    <div class="ex">⚡ 필살기 ${p.ultUses}번 · 기술 강화 ${p.mainLv + p.subLv}단계</div>`;
  drawStats(latest, me);
  $('oFact').textContent = `🔎 ${sp.name}: ${sp.fact}`;
  const ob = $('oBest');
  ob.className = isNew ? 'new' : '';
  ob.textContent = isNew ? '🎉 최고 점수 갱신!' : `최고 점수 ${Math.max(prevBest, me.score)}`;
  over.classList.remove('hidden');
  $('cards').classList.add('hidden');
  for (const id of ['stats', 'board', 'minimap', 'gauge', 'hpbar', 'lives', 'abil', 'timer', 'setBtnG', 'respawn', 'captured']) $(id).classList.add('hidden');
}

// ---------- 판 통계 ----------
type StatDef = { k: string; icon: string; name: string; val: (s: SnakeView, t: number) => number | null; fmt: (v: number) => string; title?: string; low?: boolean };
const n0 = (v: number) => Math.round(v).toLocaleString('ko-KR');
const pct = (v: number) => `${Math.round(v * 100)}%`;
const mmss = (v: number) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
const STAT_DEFS: StatDef[] = [
  { k: 'dmg', icon: '🗡️', name: '준 피해', val: (s) => s.stats!.dmgDealt, fmt: n0, title: '파괴왕' },
  { k: 'dps', icon: '⚡', name: '평균 DPS', val: (s, t) => s.stats!.dmgDealt / Math.max(1, t), fmt: (v) => v.toFixed(1), title: '꾸준한 딜러' },
  { k: 'peak', icon: '💥', name: '최고 DPS(5초)', val: (s) => s.stats!.peakDps, fmt: (v) => v.toFixed(1), title: '한방꾼' },
  { k: 'skill', icon: '🎇', name: '기술 피해 비율', val: (s) => (s.stats!.dmgDealt > 0 ? s.stats!.skillDmg / s.stats!.dmgDealt : null), fmt: pct },
  { k: 'acc', icon: '🎯', name: '기술 명중률', val: (s) => (s.stats!.casts >= 3 ? s.stats!.castsHit / s.stats!.casts : null), fmt: pct, title: '명사수' },
  { k: 'crit', icon: '🔥', name: '급소율(물기)', val: (s) => (s.stats!.bites >= 5 ? s.stats!.crits / s.stats!.bites : null), fmt: pct, title: '급소 사냥꾼' },
  { k: 'kill', icon: '🏹', name: '처치', val: (s) => s.killsAll, fmt: n0, title: '사냥왕' },
  { k: 'assist', icon: '🤝', name: '도움', val: (s) => s.stats!.assists, fmt: n0, title: '도우미' },
  { k: 'death', icon: '💀', name: '쓰러짐', val: (s) => s.deaths, fmt: n0, low: true, title: '불사신' },
  { k: 'taken', icon: '🩹', name: '받은 피해', val: (s) => s.stats!.dmgTaken, fmt: n0, title: '샌드백' },
  { k: 'block', icon: '🛡️', name: '막은 피해', val: (s) => s.stats!.dmgBlocked, fmt: n0, title: '철벽' },
  { k: 'heal', icon: '💚', name: '회복량', val: (s) => s.stats!.healed, fmt: n0, title: '회복왕' },
  { k: 'dist', icon: '🏃', name: '이동 거리', val: (s) => s.stats!.distance / 100, fmt: (v) => `${n0(v)}m`, title: '마라토너' },
  { k: 'food', icon: '🍖', name: '먹은 먹이', val: (s) => s.stats!.food, fmt: (v) => `${n0(v)}개`, title: '대식가' },
  { k: 'life', icon: '⏳', name: '가장 오래 버팀', val: (s) => s.stats!.bestLife, fmt: mmss, title: '생존왕' },
  { k: 'len', icon: '📏', name: '최대 길이', val: (s) => s.stats!.maxLen, fmt: (v) => `${n0(v)}마디`, title: '왕꼬리' },
  { k: 'ult', icon: '🌟', name: '필살기', val: (s) => s.stats!.ultCasts, fmt: (v) => `${n0(v)}번` },
];
const BEST_KEY = 'crawlution.records';

function drawStats(latest: Snapshot, me: SnakeView) {
  const t = Math.max(1, CONFIG.roundTime - latest.timeLeft);
  const all = latest.snakes.filter((s) => !s.isBoss && s.stats);
  let rec: Record<string, number> = {};
  try {
    rec = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
  } catch {
    rec = {};
  }
  const titles: string[] = [];
  const tiles = STAT_DEFS.map((d) => {
    const v = d.val(me, t);
    if (v === null) return `<div class="st na"><em>${d.icon} ${d.name}</em><b>-</b><small>표본 부족</small></div>`;
    const vals = all.map((s) => d.val(s, t)).filter((x): x is number => x !== null);
    const rank = 1 + vals.filter((x) => (d.low ? x < v : x > v)).length;
    if (rank === 1 && d.title && v > 0) titles.push(`${d.icon} ${d.title}`);
    const prev = rec[d.k];
    const isRec = !d.low && v > 0 && prev !== undefined && v > prev;
    if (!d.low && v > (prev ?? -1)) rec[d.k] = v;
    const meaningful = d.low || v > 0; // 0은 순위를 매기지 않음(모두 같으면 1위가 되므로)
    return `<div class="st${meaningful && rank <= 3 ? ' top' : ''}"><em>${d.icon} ${d.name}</em><b>${d.fmt(v)}</b><small>${meaningful ? `${rank}위/${vals.length}` : '—'}${isRec ? ' · <i>내 신기록</i>' : ''}</small></div>`;
  });
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(rec));
  } catch {
    /* 저장 안 돼도 괜찮음 */
  }
  $('oTitles').innerHTML = titles.length ? titles.map((x) => `<span>${x}</span>`).join('') : '';
  $('oStats').innerHTML = `<div class="sts">${tiles.join('')}</div><p class="sn">순위는 이번 판 곤충 ${all.length}마리 중. DPS = 준 피해 ÷ 시간(초). 명중률 = 기술을 써서 누군가 맞힌 비율.</p>`;
  showOTab('stats');
}
function showOTab(t: 'rank' | 'stats') {
  document.querySelectorAll<HTMLButtonElement>('.otabs button').forEach((b) => b.classList.toggle('on', b.dataset.ot === t));
  $('oRank').classList.toggle('hidden', t !== 'rank');
  $('oStats').classList.toggle('hidden', t !== 'stats');
}

// ---------- 크롤러 고르기 ----------
function famOf(id: string): Family {
  return FAMILY[SPECIES_BY_ID.get(id)!.family];
}

function statBar(label: string, v: number) {
  const k = Math.max(0.15, Math.min(1, (v - 0.7) / 0.6));
  return `<div class="sbar"><em>${label}</em><i><b style="width:${k * 100}%"></b></i></div>`;
}

// 단계별 크롤러 고르기(3판): 계열 → 종 → 기술(4칸 보기) → 확인
const STEPS = ['계열', '종', '기술', '확인'] as const;
const STEP_TITLE = ['계열 고르기', '종 고르기', '기술 보기', '이대로 시작할까요?'];
const LAST = STEPS.length - 1;
let step = 0;

function v3Of(id: string) {
  return V3_BY_ID.get(id) ?? V3_BY_ID.get(V3_ROSTER[0])!;
}
function setV3Family(fid: V3FamId) {
  if (v3Of(LO.species).fam === fid) return;
  LO.species = V3_FAMILY[fid].species[0];
  LO.form = formsOf(LO.species)[0].id;
  normTraits();
}
const SLOT_COL: Record<string, string> = { atk: '#f0703a', def: '#5a9ad8', spc: '#9a6ad8', ult: '#e8b830' };
function kitRows(id: string) {
  const kit = kitOf(id)!;
  const v = v3Of(id);
  return (['atk', 'def', 'spc', 'ult'] as const)
    .map((sl) => {
      const k = kit[sl];
      const mine = v.swap === sl;
      return `<div class="kitrow" style="--k:${SLOT_COL[sl]}"><span class="ki">${k.icon}</span><span class="kt"><b>${k.name}${mine ? ' <em>종 기술</em>' : ''}</b><small class="ks">${SLOT_NAME[sl]} · ${sl === 'atk' ? 'Lv1' : sl === 'def' ? 'Lv3' : sl === 'spc' ? 'Lv5' : '게이지'}${k.cd ? ` · ${k.cd}초` : ''}</small><small>${k.desc}</small>${sl === 'def' ? '<small class="aw">공통: 쓰면 느려짐·묶임이 풀리고 1.2초 동안 이동 속도 +30%</small>' : ''}${k.awake ? `<small class="aw">각성: ${k.awake}</small>` : ''}</span></div>`;
    })
    .join('');
}

function buildSelect() {
  if (!kitOf(LO.species)) LO.species = V3_ROSTER[0];
  const F = famOf(LO.species);
  const v = v3Of(LO.species);
  const VF = V3_FAMILY[v.fam];
  const sp = SPECIES_BY_ID.get(LO.species)!;
  normTraits();
  $('selTitle').textContent = STEP_TITLE[step];
  $('stepDots').innerHTML = STEPS.map((n, i) => `<button class="sd${i === step ? ' on' : i < step ? ' done' : ''}" data-st="${i}">${i + 1}. ${n}</button>`).join('');
  $('selCur').innerHTML = step === LAST ? '' : `<img src="${renderer.portrait(LO.species + '@3')}" alt=""><span>${VF.icon} ${VF.name} · ${sp.name}</span>`;
  const like = SPECIAL_FOODS[F.likes], hate = SPECIAL_FOODS[F.hates];
  let body = '';
  if (step === 0) {
    body = `<div class="list">${V3_FAMILIES.map((f) => {
      const eng = famOf(f.species[0]);
      return `<button class="opt big${f.id === v.fam ? ' on' : ''}" data-vf="${f.id}" style="--c:${hex(f.color)}"><span class="pic"><img src="${renderer.portrait(f.species[0] + '@3')}" alt=""></span><span class="ot"><b>${f.icon} ${f.name}</b><small>${f.seat} · 제어 ${f.cc}</small><small class="inst">✨ <em>${f.trait.name}</em> ${f.trait.desc}</small>${statBar('❤ 체력', eng.hp)}${statBar('🦷 공격', eng.atk)}${statBar('⚡ 속도', eng.spd)}<small class="mt">강함 ${f.strong.split('.')[0]}</small></span></button>`;
    }).join('')}</div>`;
  } else if (step === 1) {
    body = `<div class="list">${VF.species.map((id) => {
      const s2 = v3Of(id);
      const kit = kitOf(id)!;
      return `<button class="opt big${id === LO.species ? ' on' : ''}" data-s="${id}" style="--c:${hex(VF.color)}"><span class="pic"><img src="${renderer.portrait(id + '@3')}" alt=""></span><span class="ot"><b>${s2.name}${s2.base ? ' <em>대표</em>' : ''}${s2.isNew ? ' 🆕' : ''}</b><small class="inst">🧬 <em>${s2.instinct.name}</em> ${s2.instinct.desc}</small>${s2.swap ? `<small class="mt">${SLOT_NAME[s2.swap]} → ${kit[s2.swap].icon} ${kit[s2.swap].name}</small>` : '<small class="mt">계열 기본 기술 그대로</small>'}<small class="fact">${s2.fact}</small></span></button>`;
    }).join('')}</div>`;
  } else if (step === 2) {
    body = `<p class="hint">기술은 종마다 정해져 있어요. 방어는 Lv3, 특수는 Lv5에 열리고, 필살기는 게이지가 차면 써요.</p><div class="kitlist">${kitRows(LO.species)}</div>
      <div class="ultline">✨ 계열 특성 <b>${VF.trait.icon} ${VF.trait.name}</b> — ${VF.trait.desc}<br>🧬 본능 <b>${sp.instinct.name}</b> — ${sp.instinct.desc}</div>`;
  } else {
    const row = (st: number, label: string, val: string) => `<button class="sumrow" data-st="${st}"><em>${label}</em><span>${val}</span><i>바꾸기 ›</i></button>`;
    const kit = kitOf(LO.species)!;
    body = `<div class="selinfo"><div class="big" style="--c:${hex(VF.color)}"><img src="${renderer.portrait(LO.species + '@3')}" alt=""></div>
      <div class="tx"><div class="nm ol">${sp.name}</div><div class="rl">${VF.icon} ${VF.name} · ${VF.stages.join(' → ')}</div>
      <div class="inst"><b>🧬 ${sp.instinct.name}</b> ${sp.instinct.desc}</div>
      <div class="tst"><span class="lk">♥ ${like.icon} ${like.name}</span> <span class="ht">✖ ${hate.icon} ${hate.name}</span></div></div></div>
      <div class="sum">${row(0, '계열', `${VF.icon} ${VF.name}`)}${row(1, '종', sp.name)}${row(2, '기술', `${kit.atk.icon}${kit.def.icon}${kit.spc.icon}${kit.ult.icon}`)}</div>`;
  }
  $('stepBody').innerHTML = body;
  $('goBtn').textContent = step === LAST ? '시작!' : '다음 ▶';
  $('goBtn').classList.toggle('pulse', step === LAST);
  const pick = (fn: () => void) => () => (fn(), sfx.play('click'), saveLoadout(), buildSelect());
  $('stepDots').querySelectorAll<HTMLButtonElement>('.sd').forEach((el) => (el.onclick = () => ((step = Number(el.dataset.st)), sfx.play('click'), buildSelect())));
  $('stepBody').querySelectorAll<HTMLButtonElement>('[data-st]').forEach((el) => (el.onclick = () => ((step = Number(el.dataset.st)), sfx.play('click'), buildSelect())));
  $('stepBody').querySelectorAll<HTMLButtonElement>('[data-vf]').forEach((el) => (el.onclick = pick(() => setV3Family(el.dataset.vf as V3FamId))));
  $('stepBody').querySelectorAll<HTMLButtonElement>('[data-s]').forEach((el) => (el.onclick = pick(() => (LO.species = el.dataset.s!))));
  $('stepBody').scrollTop = 0;
}

function selNext() {
  sfx.play('click');
  if (step >= LAST) return startGame();
  step++;
  buildSelect();
}
function selBack() {
  sfx.play('click');
  if (step > 0) {
    step--;
    buildSelect();
    return;
  }
  $('select').classList.add('hidden');
  $(selFrom).classList.remove('hidden');
}
let selFrom = 'start';

function openSelect(from: 'start' | 'over' = 'start') {
  sfx.unlock();
  selFrom = from;
  // 처음이면 1단계부터, 전에 고른 적이 있으면 확인 단계에서(단계를 눌러 바꿀 수 있음)
  step = localStorage.getItem(LO_KEY) && kitOf(LO.species) ? LAST : 0;
  $('start').classList.add('hidden');
  $('over').classList.add('hidden');
  $('select').classList.remove('hidden');
  buildSelect();
}

function startGame() {
  normTraits();
  saveLoadout();
  $('start').classList.add('hidden');
  $('select').classList.add('hidden');
  $('over').classList.add('hidden');
  for (const id of ['stats', 'board', 'minimap', 'gauge', 'hpbar', 'lives', 'abil', 'timer', 'setBtnG']) $(id).classList.remove('hidden');
  sfx.unlock();
  $('feed').innerHTML = '';
  snaps.length = 0;
  offset = null;
  maxLen = 0;
  endAt = 0;
  cardsKey = hudKey = skillKey = subKey = abilKey = '';
  ultWas = false;
  startedAt = performance.now();
  input.resetSeq();
  lastCmd = { ...lastCmd, skillSeq: 0, subSeq: 0, spcSeq: 0, ultSeq: 0, cardSeq: 0, rerollSeq: 0 };
  kitReady = {};
  for (const k of Object.keys(kitKeys)) delete kitKeys[k];
  const seed = (Math.random() * 2 ** 31) | 0;
  const opts = gameOpts();
  try {
    const lv = Number(new URLSearchParams(location.search).get('level'));
    if (lv > 1) opts.startLevel = lv;
  } catch {
    /* 주소를 못 읽는 환경 */
  }
  if (!host) host = createHost(seed, '나', onSnap, opts);
  else host.start(seed, '나', opts);
  applySettings();
  playing = true;
  document.body.classList.add('playing');
  const tag = () => ($('hostTag').textContent = `sim: ${host?.kind} · 화질 ${renderer.qualityLabel}`);
  setTimeout(tag, 1500);
  clearInterval(tagTimer);
  tagTimer = setInterval(tag, 3000);
}

// ---------- 설정 ----------
function gameOpts(): GameOpts {
  return { power: S.son ? SON_POWER : 1, bots: S.bots, map: S.map, loadout: { ...LO, traits: [] }, v3: true };
}

function applySettings() {
  const b = document.body;
  b.classList.toggle('lefty', S.hand === 'left');
  b.style.setProperty('--bz', String({ s: 0.82, m: 1, l: 1.2 }[S.btnSize]));
  sfx.setSound(S.sound);
  sfx.setVolume(S.volume);
  sfx.setVibe(S.vibe);
  renderer.opts.shake = S.shake;
  renderer.opts.labels = S.labels;
  renderer.opts.numbers = S.numbers;
  renderer.setQuality(S.quality);
  host?.setOpts(gameOpts());
  hudKey = '';
}

function buildSettings() {
  const box = $('setBody');
  box.innerHTML = SECTIONS.map(
    (sec) =>
      `<div class="sh">${sec.title}</div>` +
      sec.rows
        .map((r) => {
          let ctl = '';
          if (r.kind === 'toggle') ctl = `<button class="tg" data-k="${r.key}"><i></i></button>`;
          else if (r.kind === 'seg') ctl = `<div class="seg">${r.options.map(([v, t]) => `<button data-k="${r.key}" data-v="${v}">${t}</button>`).join('')}</div>`;
          else ctl = `<input type="range" min="0" max="100" step="5" data-k="${r.key}">`;
          const vib = r.key === 'vibe' && !sfx.canVibrate ? '<small>이 기기는 진동을 지원하지 않아요</small>' : '';
          return `<div class="srow${'special' in r && r.special ? ' sp' : ''}${r.kind === 'seg' && r.options.length > 3 ? ' wide' : ''}"><span class="si">${r.icon}</span><div class="sl">${r.label}${r.desc ? `<small>${r.desc}</small>` : ''}${vib}</div>${ctl}</div>`;
        })
        .join(''),
  ).join('');
  const set = (k: keyof Settings, v: unknown) => {
    (S as unknown as Record<string, unknown>)[k] = v;
    saveSettings(S);
    applySettings();
    paintSettings();
  };
  box.querySelectorAll<HTMLButtonElement>('.tg').forEach((el) =>
    (el.onclick = () => {
      const k = el.dataset.k as keyof Settings;
      set(k, !S[k]);
      if (k === 'vibe' && S.vibe) sfx.buzz(60);
      sfx.play('click');
    }),
  );
  box.querySelectorAll<HTMLButtonElement>('.seg button').forEach((el) =>
    (el.onclick = () => {
      const k = el.dataset.k as keyof Settings;
      const v = typeof S[k] === 'number' ? Number(el.dataset.v) : el.dataset.v;
      set(k, v);
      sfx.play('click');
    }),
  );
  box.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((el) => {
    el.oninput = () => set(el.dataset.k as keyof Settings, Number(el.value) / 100);
    el.onchange = () => sfx.play('gem');
  });
  paintSettings();
}

function paintSettings() {
  const box = $('setBody');
  box.querySelectorAll<HTMLElement>('.tg').forEach((el) => el.classList.toggle('on', !!S[el.dataset.k as keyof Settings]));
  box.querySelectorAll<HTMLElement>('.seg button').forEach((el) => el.classList.toggle('on', String(S[el.dataset.k as keyof Settings]) === el.dataset.v));
  box.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((el) => (el.value = String(Math.round(Number(S[el.dataset.k as keyof Settings]) * 100))));
}

function openSettings() {
  sfx.unlock();
  settingsOpen = true;
  paintSettings();
  $('settings').classList.remove('hidden');
  $('setNote').textContent = playing ? '⏸ 게임이 멈춰 있어요' : '';
  input.resetHolds();
  if (playing) host?.pause(true);
}

function closeSettings() {
  settingsOpen = false;
  $('settings').classList.add('hidden');
  if (playing) host?.pause(document.hidden);
  sfx.play('click');
}

async function boot() {
  try {
    await Promise.race([Promise.all([document.fonts.load('20px Jua'), document.fonts.load('20px BlackHan')]), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* 글꼴을 못 읽어도 진행 */
  }
  await renderer.init($('game'));
  input = new Input(renderer.app.canvas, $('boostBtn'), $('sneakBtn'), $('joy'), $('knob'), $('skillBtn'), $('subBtn'), $('spcBtn'), $('ultBtn'));
  input.onCardKey = (i) => {
    if (latestSnap()?.player.offer) input.card(i);
  };
  if (input.touch) document.body.classList.add('touch');
  const how = input.touch
    ? [['👆', '화면을 끌어서 방향 · ⚡ <b>질주</b>'], ['🦷', '머리로 상대 몸을 <b>물어</b> 체력을 깎아요'], ['🛡️', '<b>웅크리기</b>: 느려지지만 피해 절반'], ['🎯', '<b>공격</b> · <b>방어</b>(Lv3) · <b>특수</b>(Lv5) 버튼 · 게이지가 차면 <b>필살기</b>']]
    : [['🖱️', '마우스로 방향 · <b>클릭/스페이스</b> 질주'], ['🦷', '머리로 상대 몸을 <b>물어</b> 체력을 깎아요'], ['🛡️', '<b>Shift</b> 웅크리기: 느려지지만 피해 절반'], ['🎯', '<b>E</b> 공격 · <b>Q</b> 방어(Lv3) · <b>W</b> 특수(Lv5) · 게이지가 차면 <b>F</b> 필살기']];
  how.push(['✨', '먹이로 <b>레벨업</b> → 카드 골라 능력 4칸 · Lv5 성충 · Lv10 각성']);
  how.push(['🎯', '강한 상대는 <b>꼬리 끝</b>을 물면 급소! 한 바퀴 감싸면 <b>압착</b>']);
  how.push(['🍯', '좋아하는 먹이 <b>♥ 폭풍 성장</b> · 황금 꿀방울은 <b>다시 뽑기</b>']);
  $('howto').innerHTML = how.map(([i, t]) => `<div><span class="i">${i}</span><span>${t}</span></div>`).join('');
  $('lineup').innerHTML = ['rhino', 'kingmantis', 'hornet', 'orbspider', 'honeybee'].map((id) => `<img src="${renderer.portrait(id + '@2')}" alt="">`).join('');
  const best = bestScore();
  $('startBest').textContent = best > 0 ? `🏆 최고 점수 ${best}` : '';
  $('arenaBtn').onclick = () => openSelect('start');
  $('advBtn').onclick = () => {
    sfx.play('click');
    const n = $('advNote');
    n.classList.remove('hidden');
    n.textContent = '🗺️ 모험은 기획 중이에요. 지역을 넘으며 보스를 잡고 크롤러를 모으는 모드로 만들 거예요.';
  };
  $('goBtn').onclick = selNext;
  $('selBack').onclick = selBack;
  buildSettings();
  applySettings();
  for (const id of ['setBtn', 'setBtnO']) $(id).onclick = () => openSettings();
  $('setBtnG').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSettings();
  });
  $('setClose').onclick = () => closeSettings();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') (settingsOpen ? closeSettings() : playing && openSettings());
  });
  const unlock = () => sfx.unlock();
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  $('againBtn').onclick = startGame;
  $('pickBtn').onclick = () => openSelect('over');
  document.querySelectorAll<HTMLButtonElement>('.otabs button').forEach((b) => (b.onclick = () => showOTab(b.dataset.ot as 'rank' | 'stats')));
  document.addEventListener('visibilitychange', () => host?.pause(document.hidden || settingsOpen));

  renderer.app.ticker.add((tk) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    if (playing) renderer.tickQuality(tk.deltaMS);
    const frame = buildFrame();
    if (!frame) return;
    const latest = snaps[snaps.length - 1];
    renderer.reveal = latest.player.reveal;
    renderer.render(frame, dt);
    updateDanger(frame);
    updateEnemyArrow(frame.enemy);
    const me = latest.snakes.find((s) => s.id === latest.playerId);
    if (!me) return;

    if (playing && host) {
      const fm = frame.snakes.find((s) => s.id === frame.playerId);
      const cam = renderer.camera;
      const W = renderer.app.screen.width, H = renderer.app.screen.height;
      const hx = fm && fm.segs.length >= 2 ? W / 2 + (fm.segs[0] - cam.x) * cam.zoom : W / 2;
      const hy = fm && fm.segs.length >= 2 ? H / 2 + (fm.segs[1] - cam.y) * cam.zoom : H / 2;
      const cmd = input.update(hx, hy);
      const now = performance.now();
      if (
        cmd.boost !== lastCmd.boost || cmd.sneak !== lastCmd.sneak || cmd.skillSeq !== lastCmd.skillSeq || cmd.subSeq !== lastCmd.subSeq || cmd.cardSeq !== lastCmd.cardSeq || cmd.rerollSeq !== lastCmd.rerollSeq ||
        Math.abs(cmd.angle - lastCmd.angle) > 0.005 || now - lastCmdAt > 100
      ) {
        host.send(cmd);
        lastCmd = cmd;
        lastCmdAt = now;
      }
    }

    if (me.alive) maxLen = Math.max(maxLen, me.length);
    if (playing && endAt && performance.now() > endAt) showResult(latest);
    if (bannerT && performance.now() > bannerT) {
      $('banner').classList.add('hidden');
      bannerT = 0;
    }
    if (performance.now() - hudAt > 100) {
      hudAt = performance.now();
      updateHud(latest);
    }
  });
}

function latestSnap() {
  return snaps[snaps.length - 1];
}

boot();

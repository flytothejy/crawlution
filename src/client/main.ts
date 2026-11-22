// 시작점: 화면·조작·시뮬레이션 호스트를 연결하고, 받은 상태를 보간해서 그린다.
import './fonts.css';
import { CONFIG } from '../shared/config';
import { CYCLE, LINEAGE, SPECIAL_FOODS, SPECIES_BY_ID, STATS, type Lineage, type Species } from '../shared/species';
import { relation } from '../shared/combat';
import type { Card, EnemyKind, EnemyView, Snapshot, SnakeView } from '../shared/types';
import { createHost, type SimHost } from './host';
import { Input } from './input';
import { GameRenderer, type Frame, type FrameSnake } from './renderer';
import { Sfx } from './sfx';
import { loadSettings, saveSettings, SECTIONS, SON_POWER, type Settings } from './settings';
import type { GameOpts } from '../shared/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** 갈래 아이콘 */
const LIN_ICON: Record<Lineage, string> = { none: '🌱', armor: '🛡️', hunt: '🗡️', swarm: '🐜', poison: '☠️', spider: '🕸️' };

/** 스킬 아이콘: 첫 효과 부품으로 고른다 */
function skillIcon(sp: Species): string {
  const p = sp.parts[0];
  if (!p) return '';
  switch (p.k) {
    case 'dash': return p.cut ? '⚔️' : p.push ? '💢' : '💨';
    case 'fly': return '🪽';
    case 'cone': return p.effect === 'cut' ? '✂️' : '💫';
    case 'aoe': return p.effect === 'push' ? '💢' : '💥';
    case 'zone': return p.effect === 'poison' ? '🧪' : '🕸️';
    case 'proj': return '🎯';
    case 'shield': return '🛡️';
    case 'magnet': return '🧲';
    case 'ringfast': return '🔥';
  }
}

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
if (location.search.includes("local")) (globalThis as { __renderer?: GameRenderer }).__renderer = renderer; // 시험용
const sfx = new Sfx();
let S: Settings = loadSettings();
let settingsOpen = false;
let prevStats = '';
let host: SimHost | null = null;
let input: Input;

// 받은 상태(스냅샷) 버퍼와 시간 맞추기. 지연을 1틱 남짓으로 줄여 조작 반응을 빠르게 했다.
const snaps: Snapshot[] = [];
let offset: number | null = null;
const DELAY = 1 / CONFIG.tickRate + 0.005;

let playing = false;
let endAt = 0;
let maxLen = 0;
let maxStage = 1;
let startedAt = 0;
let lastCmdAt = 0;
let lastCmd = { angle: 0, boost: false, sneak: false, skillSeq: 0, moltSeq: 0, moltChoice: 0 };
let hudAt = 0;
let cardsKey = '';
let bannerT = 0;
let hudSpecies = '';
let skillSpecies = '';
let skillReady = false;
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

function flash() {
  const f = $('flash');
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
  const c = s.isBoss ? '#ffa08a' : hex(mixHex(LINEAGE[s.lineage].color, 0xffffff, 0.35));
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
  for (const e of s.events) {
    if (e.type === 'enemyWarn') {
      const E = ENEMY[e.kind];
      banner(`⚠ 천적 경보: ${E.icon} ${E.name}!`, E.c1, E.c2, 2900);
      alarm(E.tip);
    }
    if (e.type === 'enemyEnd' && e.kind === 'centipede' && e.killed) banner('👑 왕지네 처치!', '#ffd23f', '#f08a12', 2400);
    if (e.type === 'captured' && e.snake === s.playerId) {
      banner('🧒 채집망에 잡혔다!', '#ffb84a', '#e0702a', 2200);
      flash();
    }
    if (e.type === 'released' && e.snake === s.playerId) banner('풀려났다! 몸이 반쪽이 됐어요', '#7ad84a', '#3a9a2a', 2000);
    if (e.type === 'skill' && e.snake === s.playerId) cutIn(e.species);
    if (e.type === 'molt' && e.snake === s.playerId) {
      const sp = SPECIES_BY_ID.get(e.species);
      if (sp) {
        const c = LINEAGE[sp.lineage].color;
        banner(`${sp.name}${ro(sp.name)} 진화!`, hex(mixHex(c, 0xffffff, 0.25)), hex(c), 2200);
      }
      flash();
    }
    if (e.type === 'crush' && e.count > 0 && e.snake === s.playerId) flash();
    if (e.type === 'death') {
      const victim = byId.get(e.snake);
      const killer = e.by >= 0 ? byId.get(e.by) : undefined;
      const mine = e.snake === s.playerId || e.by === s.playerId || !!victim?.isBoss;
      const ic = { crush: '🌀', bite: '🦷', enemy: '⚠', poison: '☠️', skill: '⚔️', wall: '🧱' }[e.cause];
      if (e.cause === 'enemy' && e.enemy) feed(`${ENEMY[e.enemy].icon} ${ENEMY[e.enemy].name}에게 ${who(victim)} 당함`, mine);
      else if (e.cause === 'wall') {
        if (mine) feed(`${ic} ${who(victim)} 벽에 부딪힘`, mine);
      } else if (killer) feed(`${who(killer)} ${ic} ${who(victim)}${e.cause === 'crush' ? ' 압착!' : ''}`, mine);
    }
    if (e.type === 'lifeLost') {
      banner(`쓰러졌다! 남은 목숨 ${'❤️'.repeat(e.lives)}`, '#ff6b5a', '#c93a2a', 1900);
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
  for (const e of s.events) {
    switch (e.type) {
      case 'eat':
        if (e.snake !== me) break;
        if (e.gem !== undefined) (sfx.play('gem'), sfx.buzz(15));
        else if (e.special !== undefined) {
          if (e.taste === 1) (sfx.play('like'), sfx.buzz([25, 30, 25, 30, 60]));
          else if (e.taste === -1) (sfx.play('yuck'), sfx.buzz(140));
          else sfx.play('eatBig');
        } else sfx.play(e.big ? 'eatBig' : 'eat');
        break;
      case 'hit': {
        if (e.by === me && e.snake !== me) {
          if (e.blocked) sfx.play('block', 0.6);
          else if (e.kind === 'crit' || e.kind === 'rage') (sfx.play('crit'), sfx.buzz(45));
          else if (e.dmg >= 25) (sfx.play('hitBig'), sfx.buzz(14));
          else if (e.dmg > 0) sfx.play('hit');
        } else if (e.snake === me) {
          if (e.blocked) sfx.play('block');
          else if (e.dmg > 0) {
            const mh = byId.get(me)?.maxHp ?? 100;
            if (e.dmg >= mh * 0.12 || e.kind === 'crit' || e.kind === 'rage') (sfx.play('hurtBig'), sfx.buzz(80));
            else (sfx.play('hurt'), sfx.buzz(25));
          }
        }
        break;
      }
      case 'skill':
        if (e.snake === me) (sfx.play('skill'), sfx.buzz(30));
        else if (near(e.x, e.y)) sfx.play('skill', 0.25);
        break;
      case 'molt':
        if (e.snake === me) (sfx.play('molt'), sfx.buzz([30, 40, 90]));
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

/** 기술 컷인: 곤충 그림 + 기술 이름이 화면 위쪽을 지나간다 */
function cutIn(speciesId: string) {
  const sp = SPECIES_BY_ID.get(speciesId);
  if (!sp) return;
  const c = $('cutin');
  c.style.setProperty('--c', hex(LINEAGE[sp.lineage].color));
  c.innerHTML = `<img src="${renderer.portrait(sp.id)}" alt=""><div><small class="ol-thin">${sp.name}</small><b class="ol">${skillIcon(sp)} ${sp.skillName}!</b></div>`;
  c.classList.remove('hidden');
  c.getAnimations().forEach((a) => a.cancel());
  c.animate(
    [
      { transform: 'translateX(-100%) skewX(-12deg)', opacity: 0, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      { transform: 'translateX(0) skewX(-12deg)', opacity: 1, offset: 0.15 },
      { transform: 'translateX(4%) skewX(-12deg)', opacity: 1, offset: 0.8, easing: 'ease-in' },
      { transform: 'translateX(110%) skewX(-12deg)', opacity: 0 },
    ],
    { duration: 1200, easing: 'linear', fill: 'forwards' },
  );
  const f = $('flash');
  f.style.background = hex(LINEAGE[sp.lineage].color);
  flash();
  setTimeout(() => (f.style.background = '#fff'), 500);
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

/** 받침에 따라 '로'/'으로' (ㄹ 받침은 '로') */
function ro(word: string) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return '로';
  const jong = c % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
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
  return { snakes, foods: b.foods, rings: b.rings, zones: b.zones, projs: b.projs, enemy: b.enemy, map: b.map, playerId: b.playerId };
}

/** 강한 적 머리가 가깝거나 새 그림자 안이면 화면 가장자리를 붉게 */
function updateDanger(frame: Frame) {
  const me = frame.snakes.find((s) => s.id === frame.playerId);
  let danger = false;
  if (playing && me && me.alive && me.segs.length >= 2) {
    const hx = me.segs[0], hy = me.segs[1];
    for (const s of frame.snakes) {
      if (s.id === me.id || !s.alive || s.segs.length < 2) continue;
      if (relation(me, s) >= 0) continue;
      if (Math.hypot(s.segs[0] - hx, s.segs[1] - hy) < 170) {
        danger = true;
        break;
      }
    }
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

// ---------- 진화 카드 ----------
/** 갈래 능력치 막대: 체력·공격·속도·기술 */
function statBars(l: Lineage) {
  const L = LINEAGE[l];
  const v = [
    ['❤', L.hpMul],
    ['🦷', L.biteMul],
    ['⚡', L.speedMul],
    ['✨', L.skillMul / L.cdMul],
  ] as const;
  const bar = ([ic, x]: readonly [string, number]) => `<span><em>${ic}</em><i><b style="width:${Math.max(15, Math.min(100, ((x - 0.7) / 0.6) * 100))}%"></b></i></span>`;
  const lk = SPECIAL_FOODS.find((f) => f.like === l), ht = SPECIAL_FOODS.find((f) => f.hate === l);
  const tst = lk && ht ? `<div class="tst"><span class="lk">♥${lk.icon}</span><span class="ht">✖${ht.icon}</span></div>` : '';
  return `<div class="stats">${v.map(bar).join('')}</div><div class="trait">${L.trait}</div>${tst}`;
}

function cardHtml(c: Card, i: number, best: boolean) {
  const sp = SPECIES_BY_ID.get(c.species)!;
  const L = LINEAGE[c.lineage];
  const key = input.touch ? '' : `<span class="key badge">${i + 1}</span>`;
  const odds = c.upgrade
    ? '<span class="up">★ 강화: 체력·기술 UP</span>'
    : c.good || c.bad
      ? `<span class="g">▲${c.good}</span><span class="b">▼${c.bad}</span>`
      : '';
  return `<button class="mcard${best ? ' best' : ''}${c.upgrade ? ' upg' : ''}" data-i="${i}" style="--c:${hex(L.color)}">${key}
    <div class="pic"><img src="${renderer.portrait(sp.id)}" alt=""></div>
    <div class="tx"><div class="nm">${LIN_ICON[c.lineage]} ${sp.name}</div><div class="sk">${skillIcon(sp)} ${sp.skillName}</div>${statBars(c.lineage)}<div class="odds">${odds}</div></div></button>`;
}

function updateCards(latest: Snapshot) {
  const p = latest.player;
  const cards = p.cards;
  const key = cards ? cards.map((c) => `${c.species}:${c.good}:${c.bad}`).join('|') : '';
  if (key === cardsKey) return;
  const sameSet = cards && cardsKey !== '' && cardsKey.split('|').map((k) => k.split(':')[0]).join() === cards.map((c) => c.species).join();
  cardsKey = key;
  const box = $('cards');
  if (!cards) {
    box.classList.add('hidden');
    return;
  }
  let bestI = -1, bestV = 0;
  cards.forEach((c, i) => {
    if (c.good - c.bad > bestV) ((bestV = c.good - c.bad), (bestI = i));
  });
  const final = cards.some((c) => c.upgrade);
  box.innerHTML = `<div class="ctitle ol">${final ? '✨ 변신 또는 강화!' : '✨ 탈피! 골라요'}</div><div class="crow">${cards.map((c, i) => cardHtml(c, i, i === bestI)).join('')}</div>`;
  // 같은 카드에서 숫자만 바뀐 경우 등장 애니메이션을 다시 하지 않는다
  if (sameSet) box.querySelectorAll<HTMLElement>('.mcard').forEach((el) => (el.style.animation = 'none'));
  box.classList.remove('hidden');
  box.querySelectorAll<HTMLButtonElement>('.mcard').forEach((el) =>
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sfx.play('click');
      input.molt(Number(el.dataset.i));
    }),
  );
}

// ---------- HUD ----------
function updateHud(latest: Snapshot) {
  const me = latest.snakes.find((s) => s.id === latest.playerId);
  if (!me) return;
  const sp = SPECIES_BY_ID.get(me.species)!;
  const L = LINEAGE[me.lineage];
  const p = latest.player;
  const stats = $('stats');
  if (hudSpecies !== me.species) {
    hudSpecies = me.species;
    stats.innerHTML = `<div class="pfw"><div class="pf" style="--c:${hex(L.color)}"><img src="${renderer.portrait(sp.id)}" alt=""></div><span class="lv badge">${me.stage}</span></div>
      <div><div class="nm ol-thin">${LIN_ICON[me.lineage]} ${sp.name} <span class="stars" id="hStars"></span>${S.son ? `<span class="son">🦸×${SON_POWER}</span>` : ''}</div>
      <div class="len ol" id="hLen"></div><div class="sc ol-thin" id="hSc"></div></div>`;
  }
  const hpk = Math.max(0, Math.min(1, me.hp / Math.max(1, me.maxHp)));
  const hb = $('hpbar');
  hb.querySelector<HTMLElement>('i')!.style.width = `${hpk * 100}%`;
  hb.querySelector<HTMLElement>('span')!.textContent = `${me.hp} / ${me.maxHp}`;
  hb.classList.toggle('low', hpk < 0.3);
  hb.classList.toggle('guard', me.sneaking);
  $('lives').innerHTML = Array.from({ length: CONFIG.lives }, (_, i) => `<b class="${i < p.lives ? '' : 'lost'}">❤</b>`).join('');
  const rg = $('rage');
  rg.querySelector<HTMLElement>('i')!.style.width = `${p.rage * 100}%`;
  rg.classList.toggle('full', p.rage >= 1);
  rg.querySelector<HTMLElement>('span')!.textContent = p.rage >= 1 ? '🔥 역습 준비! 다음 공격 대박' : '역습';
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
  if (p.respawnIn > 0 && p.lives > 0 && playing) {
    rs.classList.remove('hidden');
    rs.innerHTML = `<div class="ol">부활까지</div><b class="ol">${Math.ceil(p.respawnIn)}</b><div class="ol-thin">남은 목숨 ${'❤️'.repeat(p.lives)}</div>`;
  } else rs.classList.add('hidden');
  $('hStars').textContent = p.mastery ? '★'.repeat(p.mastery) : '';
  $('hLen').innerHTML = `${me.length}<small> 마디</small>`;
  const stKey = p.stats.join();
  const sc = $('hSc');
  let fresh = false;
  if (!sc.querySelector('.gm')) {
    sc.innerHTML = `<span class="pt"></span>${STATS.map((st, i) => `<span class="gm" data-i="${i}" style="--c:${hex(st.color)}"></span>`).join('')}`;
    fresh = true;
  }
  sc.querySelector<HTMLElement>('.pt')!.textContent = `점수 ${me.score}`;
  if (stKey !== prevStats || fresh) {
    const old = prevStats && !fresh ? prevStats.split(',').map(Number) : [];
    sc.querySelectorAll<HTMLElement>('.gm').forEach((el, i) => {
      const lv = p.stats[i] ?? 0;
      el.textContent = `${STATS[i].icon}${lv}`;
      el.classList.toggle('z', lv === 0);
      el.classList.toggle('max', lv >= CONFIG.statMax);
      if (old.length && lv > (old[i] ?? 0)) el.animate([{ transform: 'scale(1.9)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(0.2, 1.6, 0.4, 1)' });
    });
    prevStats = stKey;
  }

  // 진화 게이지
  const g = $('gauge');
  {
    const k = Math.min(1, p.gauge / p.need);
    const full = k >= 1;
    g.classList.toggle('full', full && !p.molting);
    const what = me.stage >= 5 ? '변신·강화' : '탈피';
    const label = p.molting ? `🦋 ${what} 중…` : full ? `✨ ${what} 준비 완료!` : `다음 ${what}까지 ${Math.ceil(p.need - p.gauge)}`;
    if (!g.querySelector('.gb')) g.innerHTML = `<div class="gl ol-thin"></div><div class="gb"><i></i></div>`;
    g.querySelector<HTMLElement>('.gl')!.textContent = label;
    g.querySelector<HTMLElement>('.gb i')!.style.width = `${k * 100}%`;
  }

  // 스킬 버튼
  const btn = $('skillBtn');
  if (sp.parts.length) {
    btn.classList.remove('none');
    if (skillSpecies !== sp.id) {
      skillSpecies = sp.id;
      btn.style.setProperty('--c', hex(L.color));
      btn.innerHTML = `<span class="ic">${skillIcon(sp)}</span><span class="sn ol-thin">${sp.skillName}</span><span class="cd ol"></span>${input.touch ? '' : '<span class="key badge">E</span>'}`;
    }
    const cdK = p.skillCdMax > 0 ? p.skillCd / p.skillCdMax : 0;
    btn.style.setProperty('--cd', `${cdK * 360}deg`);
    const ready = p.skillCd <= 0;
    btn.classList.toggle('ready', ready);
    btn.classList.toggle('cooling', !ready);
    if (ready && !skillReady && playing && me.alive) sfx.play('ready');
    if (ready && !skillReady) btn.animate([{ transform: 'scale(0.75)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'ease-out' });
    skillReady = ready;
    btn.querySelector<HTMLElement>('.cd')!.textContent = ready ? '' : String(Math.ceil(p.skillCd));
  } else btn.classList.add('none');

  // 순위
  const all = latest.snakes.filter((s) => !s.isBoss).sort((x, y) => y.score - x.score);
  const row = (s: SnakeView, i: number) => {
    const icon = LIN_ICON[s.lineage];
    return `<div class="row ${s.isPlayer ? 'me' : ''} ol-thin"><span class="rk">${i + 1}</span><span class="li" style="--c:${hex(LINEAGE[s.lineage].color)}">${icon}</span><span class="n">${s.isPlayer ? '나' : s.name}</span><span class="k">${s.kills}</span><span class="v">${s.score}</span></div>`;
  };
  const myI = all.findIndex((s) => s.isPlayer);
  $('board').innerHTML =
    '<div class="hd">🏆 순위 <span>처치 · 점수</span></div>' +
    all.slice(0, 5).map(row).join('') +
    (myI >= 5 ? `<div class="sep">⋯</div>${row(all[myI], myI)}` : '');
  // 갈래 분포
  $('dist').innerHTML =
    '<div class="db">' +
    CYCLE.map((l) => `<i style="flex:${latest.lineageCount[l] ?? 0};background:${hex(LINEAGE[l].color)}"></i>`).join('') +
    '</div><div class="dl ol-thin">' +
    CYCLE.map((l) => `<span><span class="li" style="--c:${hex(LINEAGE[l].color)}">${LIN_ICON[l]}</span>${LINEAGE[l].name} ${latest.lineageCount[l] ?? 0}</span>`).join('') +
    '</div>';
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
    const x = W / 2 + sn.segs[0] * k, y = W / 2 + sn.segs[1] * k;
    ctx.beginPath();
    ctx.arc(x, y, me ? 8 : sn.isBoss ? 11 : 3.5 + sn.stage, 0, Math.PI * 2);
    ctx.fillStyle = me ? '#ffffff' : sn.isBoss ? '#ff4a3a' : hex(LINEAGE[sn.lineage].color);
    ctx.fill();
    if (me || sn.isBoss) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1b2a12';
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
  if (!me) return;
  playing = false;
  input.resetHolds();
  $('danger').classList.remove('on');
  const rank = latest.player.rank, total = latest.player.total;
  const won = rank === 1;
  const timeUp = latest.timeLeft <= 0.5;
  const prevBest = bestScore();
  const isNew = me.score > prevBest;
  saveBest(Math.max(prevBest, me.score));
  const over = $('over');
  over.classList.toggle('win', won);
  over.classList.toggle('mid', !won && rank <= 3);
  $('overTitle').textContent = won ? '🏆 1등! 숲의 왕' : rank <= 3 ? `${rank === 2 ? '🥈' : '🥉'} ${rank}등!` : timeUp ? `${rank}등` : '목숨을 다 썼어요';
  $('overSub').textContent = `${total}마리 중 ${rank}등 · ${timeUp ? '8분 완주' : '중간 탈락'} · 최고 ${maxStage}단계`;
  countUp($('oScore'), me.score);
  $('oStage').textContent = `${maxStage}단계`;
  countUp($('oKills'), me.kills, 600);
  countUp($('oCrush'), me.crushes, 600);
  countUp($('oLen'), maxLen, 700);
  const sec = Math.floor((performance.now() - startedAt) / 1000);
  $('oTime').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('oPath').innerHTML = latest.player.path
    .map((id, i) => {
      const sp = SPECIES_BY_ID.get(id);
      if (!sp) return '';
      return `<div class="st" style="animation-delay:${0.15 + i * 0.12}s;--c:${hex(LINEAGE[sp.lineage].color)}"><div class="pc"><img src="${renderer.portrait(id)}" alt=""></div>${sp.name}</div>`;
    })
    .join('<em>▶</em>');
  const last = SPECIES_BY_ID.get(me.species);
  $('oFact').textContent = last ? `🔎 ${last.name}: ${last.fact}` : '';
  const ob = $('oBest');
  ob.className = isNew ? 'new' : '';
  ob.textContent = isNew ? '🎉 최고 점수 갱신!' : `최고 점수 ${Math.max(prevBest, me.score)}`;
  over.classList.remove('hidden');
  $('cards').classList.add('hidden');
}

function startGame() {
  $('start').classList.add('hidden');
  $('over').classList.add('hidden');
  for (const id of ['stats', 'board', 'minimap', 'gauge', 'dist', 'hpbar', 'lives', 'rage', 'timer', 'setBtnG']) $(id).classList.remove('hidden');
  sfx.unlock();
  prevStats = '';
  $('feed').innerHTML = '';
  snaps.length = 0;
  offset = null;
  maxLen = 0;
  maxStage = 1;
  endAt = 0;
  cardsKey = '';
  hudSpecies = '';
  skillSpecies = '';
  startedAt = performance.now();
  input.resetSeq();
  lastCmd = { ...lastCmd, skillSeq: 0, moltSeq: 0 };
  const seed = (Math.random() * 2 ** 31) | 0;
  let stage = 1;
  try {
    stage = Number(new URLSearchParams(location.search).get('stage')) || 1;
  } catch {
    /* 주소를 못 읽는 환경 */
  }
  if (!host) host = createHost(seed, '나', stage, onSnap, gameOpts());
  else host.start(seed, '나', stage, gameOpts());
  applySettings();
  playing = true;
  setTimeout(() => ($('hostTag').textContent = `sim: ${host?.kind}`), 1500);
}

// ---------- 설정 ----------
function gameOpts(): GameOpts {
  return { power: S.son ? SON_POWER : 1, bots: S.bots, map: S.map };
}

/** 설정을 화면·소리·시뮬레이션에 반영 */
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
  renderer.setQuality(S.quality === 'high');
  if (playing) $('dist').classList.toggle('hidden', !S.dist);
  host?.setOpts(gameOpts());
  hudSpecies = ''; // 이름 옆 🦸 표시 갱신
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
  input = new Input(renderer.app.canvas, $('boostBtn'), $('sneakBtn'), $('joy'), $('knob'), $('skillBtn'));
  if (input.touch) document.body.classList.add('touch');
  const how = input.touch
    ? [['👆', '화면을 끌어서 방향 · ⚡ <b>부스트</b>'], ['🦷', '머리로 상대 몸을 <b>물어</b> 체력을 깎아요'], ['🛡️', '<b>웅크리기</b>: 느려지지만 피해 절반'], ['✨', '<b>스킬</b> 버튼: 곤충마다 다른 기술'], ['🦋', '게이지가 차면 카드를 눌러 <b>탈피</b>']]
    : [['🖱️', '마우스로 방향 · <b>클릭/스페이스</b> 부스트'], ['🦷', '머리로 상대 몸을 <b>물어</b> 체력을 깎아요'], ['🛡️', '<b>Shift</b> 웅크리기: 느려지지만 피해 절반'], ['✨', '<b>E</b>/<b>오른쪽 클릭</b> 스킬 · <b>1·2·3</b> 탈피']];
  how.push(['🎯', '강한 상대는 <b>꼬리 끝</b>을 물면 급소! 맞으면 <b>역습</b> 게이지']);
  how.push(['🌀', '한 바퀴 감싸면 <b>압착!</b> 한 방에 끝 · 목숨 ❤️❤️❤️']);
  how.push(['💎', '<b>보석</b>을 먹으면 체력·공격·속도·기술 레벨 UP']);
  how.push(['🍯', '좋아하는 먹이 <b>♥ 폭풍 성장</b> · 싫어하는 먹이 ✖ 느려짐']);
  $('howto').innerHTML = how.map(([i, t]) => `<div><span class="i">${i}</span><span>${t}</span></div>`).join('');
  $('lineup').innerHTML = ['caterpillar', 'ladybug', 'mantis', 'bee', 'widow'].map((id) => `<img src="${renderer.portrait(id)}" alt="">`).join('');
  const best = bestScore();
  $('startBest').textContent = best > 0 ? `🏆 최고 점수 ${best}` : '';
  $('startBtn').onclick = startGame;
  // 설정
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
  // 모바일은 사용자가 화면을 눌러야 소리를 낼 수 있다
  const unlock = () => sfx.unlock();
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  $('againBtn').onclick = startGame;
  document.addEventListener('visibilitychange', () => host?.pause(document.hidden || settingsOpen));

  renderer.app.ticker.add((tk) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    const frame = buildFrame();
    if (!frame) return;
    renderer.render(frame, dt);
    updateDanger(frame);
    updateEnemyArrow(frame.enemy);
    const latest = snaps[snaps.length - 1];
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
        cmd.boost !== lastCmd.boost || cmd.sneak !== lastCmd.sneak || cmd.skillSeq !== lastCmd.skillSeq || cmd.moltSeq !== lastCmd.moltSeq ||
        Math.abs(cmd.angle - lastCmd.angle) > 0.005 || now - lastCmdAt > 100
      ) {
        host.send(cmd);
        lastCmd = cmd;
        lastCmdAt = now;
      }
    }

    if (me.alive) {
      maxLen = Math.max(maxLen, me.length);
      maxStage = Math.max(maxStage, me.stage);
    }
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

boot();

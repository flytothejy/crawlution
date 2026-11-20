// 시작점: 화면·조작·시뮬레이션 호스트를 연결하고, 받은 상태를 보간해서 그린다.
import './fonts.css';
import { CONFIG } from '../shared/config';
import { CYCLE, LINEAGE, SPECIES_BY_ID, type Lineage, type Species } from '../shared/species';
import { relation } from '../shared/combat';
import type { Card, Snapshot, SnakeView } from '../shared/types';
import { createHost, type SimHost } from './host';
import { Input } from './input';
import { GameRenderer, type Frame, type FrameSnake } from './renderer';

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

const renderer = new GameRenderer();
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
  for (const e of s.events) {
    if (e.type === 'boss') {
      banner('👑 왕지네 등장!', '#ff6b5a', '#c93a2a', 3200);
      flash();
    }
    if (e.type === 'birdWarn') banner('🐦 새가 온다! 그림자를 피해!', '#5ab4ff', '#2a6fd0', 2600);
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
      const ic = { crush: '🌀', bite: '🦷', bird: '🐦', poison: '☠️', skill: '⚔️', wall: '🧱' }[e.cause];
      if (e.cause === 'bird') feed(`${ic} 새가 ${who(victim)}를 낚아챘다`, mine);
      else if (e.cause === 'wall') {
        if (mine) feed(`${ic} ${who(victim)} 벽에 부딪힘`, mine);
      } else if (killer) feed(`${who(killer)} ${ic} ${who(victim)}${e.cause === 'crush' ? ' 압착!' : ''}`, mine);
    }
    if (e.type === 'lifeLost') {
      banner(`쓰러졌다! 남은 목숨 ${'❤️'.repeat(e.lives)}`, '#ff6b5a', '#c93a2a', 1900);
      flash();
    }
    if (e.type === 'hit' && e.snake === s.playerId && e.dmg > 0) hurt(Math.min(1, e.dmg / 40));
    if (e.type === 'end') endAt = performance.now() + (e.won ? 1800 : 1300);
  }
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
  return { snakes, foods: b.foods, rings: b.rings, zones: b.zones, projs: b.projs, bird: b.bird, playerId: b.playerId };
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
    for (const sh of frame.bird.shadows) if (Math.hypot(sh.x - hx, sh.y - hy) < sh.r + 10) danger = true;
  }
  $('danger').classList.toggle('on', danger);
}

// ---------- 진화 카드 ----------
function cardHtml(c: Card, i: number, best: boolean) {
  const sp = SPECIES_BY_ID.get(c.species)!;
  const L = LINEAGE[c.lineage];
  const key = input.touch ? '' : `<span class="key badge">${i + 1}</span>`;
  const odds = c.good || c.bad
    ? `<div class="odds"><span class="g">▲ 유리 ${c.good}</span><span class="b">▼ 불리 ${c.bad}</span></div>`
    : '<div class="odds"><span class="z">주변에 비교 대상 없음</span></div>';
  return `<button class="mcard${best ? ' best' : ''}" data-i="${i}" style="--c:${hex(L.color)}">
    <div class="top ol-thin">${LIN_ICON[c.lineage]} ${L.name}</div>${key}
    <div class="pic"><img src="${renderer.portrait(sp.id)}" alt=""></div>
    <div class="nm">${sp.name}</div>
    <div class="sk">${skillIcon(sp)} ${sp.skillName}</div>
    <div class="ds">${sp.skillDesc}</div>${odds}</button>`;
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
  box.innerHTML = `<div class="ctitle ol">✨ 탈피 준비! <b>다음 모습</b>을 고르세요</div><div class="crow">${cards.map((c, i) => cardHtml(c, i, i === bestI)).join('')}</div>`;
  // 같은 카드에서 숫자만 바뀐 경우 등장 애니메이션을 다시 하지 않는다
  if (sameSet) box.querySelectorAll<HTMLElement>('.mcard').forEach((el) => (el.style.animation = 'none'));
  box.classList.remove('hidden');
  box.querySelectorAll<HTMLButtonElement>('.mcard').forEach((el) =>
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
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
      <div><div class="nm ol-thin">${LIN_ICON[me.lineage]} ${sp.name} <span class="stars" id="hStars"></span></div>
      <div class="len ol" id="hLen"></div><div class="sc ol-thin" id="hSc"></div></div>`;
  }
  const hpk = Math.max(0, Math.min(1, me.hp / Math.max(1, me.maxHp)));
  const hb = $('hpbar');
  hb.querySelector<HTMLElement>('i')!.style.width = `${hpk * 100}%`;
  hb.querySelector<HTMLElement>('span')!.textContent = `${me.hp} / ${me.maxHp}`;
  hb.classList.toggle('low', hpk < 0.3);
  hb.classList.toggle('guard', me.sneaking);
  $('lives').innerHTML = Array.from({ length: CONFIG.lives }, (_, i) => `<b class="${i < p.lives ? '' : 'lost'}">❤</b>`).join('');
  const rs = $('respawn');
  if (p.respawnIn > 0 && p.lives > 0 && playing) {
    rs.classList.remove('hidden');
    rs.innerHTML = `<div class="ol">부활까지</div><b class="ol">${Math.ceil(p.respawnIn)}</b><div class="ol-thin">남은 목숨 ${'❤️'.repeat(p.lives)}</div>`;
  } else rs.classList.add('hidden');
  $('hStars').textContent = p.mastery ? '★'.repeat(p.mastery) : '';
  $('hLen').innerHTML = `${me.length}<small> 마디</small>`;
  $('hSc').textContent = `점수 ${me.score} · 처치 ${me.kills} · 압착 ${me.crushes}`;

  // 진화 게이지
  const g = $('gauge');
  if (me.stage >= 5) {
    g.classList.remove('full');
    g.innerHTML = `<div class="gl ol-thin">👑 최종 단계! 왕지네를 쓰러뜨려라</div>`;
  } else {
    const k = Math.min(1, p.gauge / p.need);
    const full = k >= 1;
    g.classList.toggle('full', full && !p.molting);
    const label = p.molting ? '🦋 탈피 중…' : full ? '✨ 탈피 준비 완료!' : `다음 탈피까지 ${Math.ceil(p.need - p.gauge)}`;
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
    if (ready && !skillReady) btn.animate([{ transform: 'scale(0.75)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'ease-out' });
    skillReady = ready;
    btn.querySelector<HTMLElement>('.cd')!.textContent = ready ? '' : String(Math.ceil(p.skillCd));
  } else btn.classList.add('none');

  // 순위
  const ranked = latest.snakes.filter((s) => s.alive).sort((x, y) => y.length - x.length).slice(0, 5);
  $('board').innerHTML =
    '<div class="hd">🏆 길이 순위</div>' +
    ranked
      .map((s, i) => {
        const c = s.isBoss ? 0xff4a3a : LINEAGE[s.lineage].color;
        const icon = s.isBoss ? '👑' : LIN_ICON[s.lineage];
        return `<div class="row ${s.isPlayer ? 'me' : s.isBoss ? 'boss' : ''} ol-thin"><span class="rk">${i + 1}</span><span class="li" style="--c:${hex(c)}">${icon}</span><span class="n">${s.isPlayer ? '나' : s.name}</span><span class="v">${s.length}</span></div>`;
      })
      .join('');
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
  for (const sh of s.bird.shadows) {
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
  const won = latest.state === 'won';
  const prevBest = bestScore();
  const isNew = me.score > prevBest;
  saveBest(Math.max(prevBest, me.score));
  const over = $('over');
  over.classList.toggle('win', won);
  $('overTitle').textContent = won ? '🏆 숲의 왕!' : '잡혔다!';
  $('overSub').textContent = won
    ? '왕지네를 쓰러뜨렸어요!'
    : maxStage >= 5 ? '거의 다 왔어요! 왕지네만 남았어요' : maxStage <= 1 ? '애벌레 때 잡혔어요. 먹이를 먹고 탈피해 보세요' : `${maxStage}단계까지 진화했어요`;
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
  for (const id of ['stats', 'board', 'minimap', 'gauge', 'dist', 'hpbar', 'lives']) $(id).classList.remove('hidden');
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
  if (!host) host = createHost(seed, '나', stage, onSnap);
  else host.start(seed, '나', stage);
  playing = true;
  setTimeout(() => ($('hostTag').textContent = `sim: ${host?.kind}`), 1500);
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
  how.push(['🌀', '한 바퀴 감싸면 <b>압착!</b> 한 방에 끝 · 목숨 ❤️❤️❤️']);
  $('howto').innerHTML = how.map(([i, t]) => `<div><span class="i">${i}</span><span>${t}</span></div>`).join('');
  $('lineup').innerHTML = ['caterpillar', 'ladybug', 'mantis', 'bee', 'widow'].map((id) => `<img src="${renderer.portrait(id)}" alt="">`).join('');
  const best = bestScore();
  $('startBest').textContent = best > 0 ? `🏆 최고 점수 ${best}` : '';
  $('startBtn').onclick = startGame;
  $('againBtn').onclick = startGame;
  document.addEventListener('visibilitychange', () => host?.pause(document.hidden));

  renderer.app.ticker.add((tk) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    const frame = buildFrame();
    if (!frame) return;
    renderer.render(frame, dt);
    updateDanger(frame);
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

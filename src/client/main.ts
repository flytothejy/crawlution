// 시작점: 화면·조작·시뮬레이션 호스트를 연결하고, 받은 상태를 보간해서 그린다.
import { CONFIG } from '../shared/config';
import { CYCLE, LINEAGE, SPECIES_BY_ID } from '../shared/species';
import type { Card, Snapshot, SnakeView } from '../shared/types';
import { createHost, type SimHost } from './host';
import { Input } from './input';
import { GameRenderer, type Frame, type FrameSnake } from './renderer';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

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

function banner(text: string, color = '#fff', ms = 2600) {
  const b = $('banner');
  b.textContent = text;
  b.style.color = color;
  b.classList.remove('hidden');
  b.classList.remove('pop');
  void b.offsetWidth;
  b.classList.add('pop');
  bannerT = performance.now() + ms;
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
    if (e.type === 'boss') banner('👑 왕지네가 나타났다! 쓰러뜨리면 승리', '#ffb0a0', 3500);
    if (e.type === 'birdWarn') banner('🐦 새가 온다! 그림자를 피하세요', '#ffe066', 2600);
    if (e.type === 'molt' && e.snake === s.playerId) {
      const sp = SPECIES_BY_ID.get(e.species);
      if (sp) banner(`${sp.name} · ${sp.skillName}`, hex(LINEAGE[sp.lineage].color), 2200);
    }
    if (e.type === 'end') endAt = performance.now() + (e.won ? 1800 : 1300);
  }
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

function cardHtml(c: Card, i: number) {
  const sp = SPECIES_BY_ID.get(c.species)!;
  const L = LINEAGE[c.lineage];
  const key = input.touch ? '' : `<span class="key">${i + 1}</span>`;
  const odds = c.good || c.bad ? `<div class="odds"><span class="g">유리 ${c.good}</span><span class="b">불리 ${c.bad}</span></div>` : '<div class="odds"><span>주변에 비교 대상 없음</span></div>';
  return `<button class="mcard" data-i="${i}" style="--c:${hex(L.color)}">${key}<div class="lin">${L.name}</div><div class="nm">${sp.name}</div><div class="sk">${sp.skillName}</div><div class="ds">${sp.skillDesc}</div>${odds}</button>`;
}

function updateCards(latest: Snapshot) {
  const p = latest.player;
  const cards = p.cards;
  const key = cards ? cards.map((c) => `${c.species}:${c.good}:${c.bad}`).join('|') : '';
  if (key === cardsKey) return;
  cardsKey = key;
  const box = $('cards');
  if (!cards) {
    box.classList.add('hidden');
    return;
  }
  box.innerHTML = `<div class="ctitle">탈피 준비! 다음 모습을 고르세요</div><div class="crow">${cards.map(cardHtml).join('')}</div>`;
  box.classList.remove('hidden');
  box.querySelectorAll<HTMLButtonElement>('.mcard').forEach((el) =>
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.molt(Number(el.dataset.i));
    }),
  );
}

function updateHud(latest: Snapshot) {
  const me = latest.snakes.find((s) => s.id === latest.playerId);
  if (!me) return;
  const sp = SPECIES_BY_ID.get(me.species)!;
  const L = LINEAGE[me.lineage];
  const p = latest.player;
  $('stats').innerHTML =
    `<div class="sp" style="color:${hex(L.color === 0x8fd14f ? 0xd6ff8a : L.color)}">${me.stage}단계 · ${sp.name}${p.mastery ? ` <small>숙련 ${'★'.repeat(p.mastery)}</small>` : ''}</div>` +
    `<b>${me.length}</b> 마디 · 점수 ${me.score}<br>처치 ${me.kills} · 압착 ${me.crushes}`;
  // 진화 게이지
  const g = $('gauge');
  if (me.stage >= 5) {
    g.innerHTML = `<div class="gl">최종 단계 · 왕지네를 쓰러뜨리세요</div>`;
  } else {
    const k = Math.min(1, p.gauge / p.need);
    const label = p.molting ? '탈피 중…' : k >= 1 ? '탈피 준비 완료!' : `다음 탈피까지 ${Math.ceil(p.need - p.gauge)}`;
    g.innerHTML = `<div class="gl">${label}</div><div class="gb"><i style="width:${k * 100}%"></i></div>`;
  }
  // 스킬 버튼
  const btn = $('skillBtn');
  if (sp.parts.length) {
    btn.classList.remove('none');
    const cdK = p.skillCdMax > 0 ? p.skillCd / p.skillCdMax : 0;
    btn.style.setProperty('--cd', `${cdK * 360}deg`);
    btn.style.setProperty('--c', hex(L.color));
    btn.classList.toggle('ready', p.skillCd <= 0);
    btn.innerHTML = `<span class="sn">${sp.skillName}</span>${p.skillCd > 0 ? `<span class="cd">${Math.ceil(p.skillCd)}</span>` : input.touch ? '' : '<span class="cd">E</span>'}`;
  } else btn.classList.add('none');
  // 순위
  const ranked = latest.snakes.filter((s) => s.alive).sort((x, y) => y.length - x.length).slice(0, 5);
  $('board').innerHTML =
    '<div style="opacity:.75;margin-bottom:2px">길이 순위</div>' +
    ranked
      .map((s, i) => `<div class="row ${s.id === latest.playerId ? 'me' : ''}"><span><i class="dot" style="background:${hex(s.isBoss ? 0xff4a3a : LINEAGE[s.lineage].color)}"></i>${i + 1}. ${s.isPlayer ? '나' : s.name}</span><span>${s.length}</span></div>`)
      .join('');
  // 갈래 분포
  $('dist').innerHTML =
    '<div class="dt">경기장 갈래 분포</div><div class="db">' +
    CYCLE.map((l) => `<i style="flex:${latest.lineageCount[l] ?? 0};background:${hex(LINEAGE[l].color)}" title="${LINEAGE[l].name}"></i>`).join('') +
    '</div><div class="dl">' +
    CYCLE.map((l) => `<span><i style="background:${hex(LINEAGE[l].color)}"></i>${LINEAGE[l].name} ${latest.lineageCount[l] ?? 0}</span>`).join('') +
    '</div>';
  updateCards(latest);
  drawMinimap(latest);
}

function drawMinimap(s: Snapshot) {
  const c = $('minimap') as unknown as HTMLCanvasElement;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const W = c.width, R = CONFIG.arenaRadius, k = (W / 2 - 6) / R;
  ctx.clearRect(0, 0, W, W);
  ctx.beginPath();
  ctx.arc(W / 2, W / 2, W / 2 - 4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 3;
  ctx.stroke();
  for (const sh of s.bird.shadows) {
    ctx.beginPath();
    ctx.arc(W / 2 + sh.x * k, W / 2 + sh.y * k, Math.max(6, sh.r * k), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fill();
  }
  for (const r of s.rings) {
    ctx.beginPath();
    ctx.arc(W / 2 + r.cx * k, W / 2 + r.cy * k, 9, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffe066';
    ctx.stroke();
  }
  for (const sn of s.snakes) {
    if (!sn.alive || sn.segs.length < 2) continue;
    const me = sn.id === s.playerId;
    ctx.beginPath();
    ctx.arc(W / 2 + sn.segs[0] * k, W / 2 + sn.segs[1] * k, me ? 7 : sn.isBoss ? 10 : 3 + sn.stage, 0, Math.PI * 2);
    ctx.fillStyle = me ? '#ffffff' : sn.isBoss ? '#ff4a3a' : hex(LINEAGE[sn.lineage].color);
    ctx.fill();
  }
}

function showResult(latest: Snapshot) {
  const me = latest.snakes.find((s) => s.id === latest.playerId);
  if (!me) return;
  playing = false;
  input.resetHolds();
  const won = latest.state === 'won';
  const best = Math.max(bestScore(), me.score);
  const isNew = me.score >= best && me.score > 0;
  saveBest(best);
  $('overTitle').textContent = won ? '🏆 숲의 왕 등극!' : '잡혔다!';
  $('overSub').textContent = won ? '왕지네를 쓰러뜨렸어요' : maxStage >= 5 ? '거의 다 왔어요! 왕지네만 남았어요' : maxStage <= 1 ? '애벌레 때 잡혔어요. 먹이를 먹고 탈피해 보세요' : `${maxStage}단계까지 진화했어요`;
  $('oScore').textContent = String(me.score);
  $('oStage').textContent = `${maxStage}단계`;
  $('oKills').textContent = String(me.kills);
  $('oCrush').textContent = String(me.crushes);
  $('oLen').textContent = String(maxLen);
  const sec = Math.floor((performance.now() - startedAt) / 1000);
  $('oTime').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('oPath').innerHTML = latest.player.path
    .map((id) => {
      const sp = SPECIES_BY_ID.get(id);
      return sp ? `<span style="background:${hex(LINEAGE[sp.lineage].color)}">${sp.name}</span>` : '';
    })
    .join('<em>→</em>');
  const last = SPECIES_BY_ID.get(me.species);
  $('oFact').textContent = last ? `🔎 ${last.name}: ${last.fact}` : '';
  $('oBest').textContent = isNew ? '🎉 최고 점수!' : `최고 점수 ${best}`;
  $('over').classList.remove('hidden');
  $('cards').classList.add('hidden');
}

function startGame() {
  $('start').classList.add('hidden');
  $('over').classList.add('hidden');
  for (const id of ['stats', 'board', 'minimap', 'gauge', 'dist']) $(id).classList.remove('hidden');
  snaps.length = 0;
  offset = null;
  maxLen = 0;
  maxStage = 1;
  endAt = 0;
  cardsKey = '';
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
  await renderer.init($('game'));
  input = new Input(renderer.app.canvas, $('boostBtn'), $('sneakBtn'), $('joy'), $('knob'), $('skillBtn'));
  if (input.touch) document.body.classList.add('touch');
  $('howto').innerHTML = input.touch
    ? '<li>화면을 끌어서 방향 조절 · <b>부스트</b>/<b>살금</b> 버튼</li><li><b>스킬</b> 버튼: 곤충마다 다른 기술</li><li>게이지가 차면 카드를 눌러 <b>탈피(진화)</b></li>'
    : '<li>마우스로 방향 · <b>클릭/스페이스</b> 부스트 · <b>Shift</b> 살금</li><li><b>E / 오른쪽 클릭</b>: 곤충마다 다른 스킬</li><li>게이지가 차면 <b>1·2·3</b>으로 카드를 골라 <b>탈피</b></li>';
  $('startBtn').onclick = startGame;
  $('againBtn').onclick = startGame;
  document.addEventListener('visibilitychange', () => host?.pause(document.hidden));

  renderer.app.ticker.add((tk) => {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    const frame = buildFrame();
    if (!frame) return;
    renderer.render(frame, dt);
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

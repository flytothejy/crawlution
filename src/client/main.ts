// 시작점: 화면·조작·시뮬레이션 호스트를 연결하고, 받은 상태를 보간해서 그린다.
import { CONFIG } from '../shared/config';
import type { Snapshot } from '../shared/types';
import { createHost, type SimHost } from './host';
import { Input } from './input';
import { GameRenderer, PALETTES, type Frame, type FrameSnake } from './renderer';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const renderer = new GameRenderer();
let host: SimHost | null = null;
let input: Input;

// 받은 상태(스냅샷) 버퍼와 시간 맞추기
const snaps: Snapshot[] = [];
let offset: number | null = null;
const DELAY = 1.5 / CONFIG.tickRate + 0.01;

let playing = false;
let wasAlive = false;
let deadAt = 0;
let maxLen = 0;
let lastCmdAt = 0;
let lastCmd = { angle: 0, boost: false, sneak: false };
let hudAt = 0;
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

function onSnap(s: Snapshot) {
  snaps.push(s);
  if (snaps.length > 8) snaps.shift();
  const off = performance.now() / 1000 - s.time;
  if (offset === null || off < offset || off - offset > 0.25) offset = off;
  else offset += (off - offset) * 0.01;
  // 사건(이펙트)은 도착하는 즉시 처리
  const byId = new Map<number, FrameSnake>();
  for (const sn of s.snakes) byId.set(sn.id, sn as FrameSnake);
  renderer.handleEvents(s.events, byId, s.playerId);
}

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

/** 두 스냅샷 사이를 보간한 화면용 상태 */
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
  return { snakes, foods: b.foods, rings: b.rings, playerId: b.playerId };
}

function updateHud(latest: Snapshot) {
  const me = latest.snakes.find((s) => s.id === latest.playerId);
  if (!me) return;
  $('stats').innerHTML = `<b>${me.length}</b> 마디 · 점수 ${me.score}<br>처치 ${me.kills} · 압착 ${me.crushes}`;
  const ranked = latest.snakes.filter((s) => s.alive).sort((x, y) => y.length - x.length).slice(0, 5);
  $('board').innerHTML =
    '<div style="opacity:.75;margin-bottom:2px">길이 순위</div>' +
    ranked.map((s, i) => `<div class="row ${s.id === latest.playerId ? 'me' : ''}"><span>${i + 1}. ${s.isPlayer ? '나' : s.name}</span><span>${s.length}</span></div>`).join('');
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
    ctx.arc(W / 2 + sn.segs[0] * k, W / 2 + sn.segs[1] * k, me ? 7 : 4 + Math.min(5, sn.length / 25), 0, Math.PI * 2);
    ctx.fillStyle = me ? '#ffffff' : '#' + PALETTES[sn.palette][0].toString(16).padStart(6, '0');
    ctx.fill();
  }
}

function showGameOver(latest: Snapshot) {
  const me = latest.snakes.find((s) => s.id === latest.playerId);
  if (!me) return;
  playing = false;
  input.resetHolds();
  const best = Math.max(bestScore(), me.score);
  const isNew = me.score >= best && me.score > 0;
  saveBest(best);
  $('overTitle').textContent = me.crushes > 0 ? '잘 감쌌어요!' : '잡혔다!';
  $('overSub').textContent = me.crushes > 0 ? `압착 ${me.crushes}번 성공` : '다음엔 몸으로 한 바퀴 감싸 보세요';
  $('oScore').textContent = String(me.score);
  $('oLen').textContent = String(maxLen);
  $('oKills').textContent = String(me.kills);
  $('oCrush').textContent = String(me.crushes);
  $('oBest').textContent = isNew ? '🎉 최고 점수!' : `최고 점수 ${best}`;
  $('over').classList.remove('hidden');
}

function startGame() {
  $('start').classList.add('hidden');
  $('over').classList.add('hidden');
  for (const id of ['stats', 'board', 'minimap']) $(id).classList.remove('hidden');
  snaps.length = 0;
  offset = null;
  maxLen = 0;
  wasAlive = false;
  deadAt = 0;
  const seed = (Math.random() * 2 ** 31) | 0;
  if (!host) host = createHost(seed, '나', onSnap);
  else host.start(seed, '나');
  playing = true;
  setTimeout(() => ($('hostTag').textContent = `sim: ${host?.kind}`), 1500);
}

async function boot() {
  await renderer.init($('game'));
  input = new Input(renderer.app.canvas, $('boostBtn'), $('sneakBtn'), $('joy'), $('knob'));
  if (input.touch) document.body.classList.add('touch');
  $('howto').innerHTML = input.touch
    ? '<li>화면 아무 곳이나 끌어서 방향 조절</li><li><b>부스트</b>: 빨라지지만 꼬리가 줄어요</li><li><b>살금</b>: 느리지만 잘 꺾여요</li><li>다른 곤충 몸에 머리를 부딪히면 끝</li>'
    : '<li>마우스로 방향 조절</li><li><b>왼쪽 클릭 / 스페이스</b>: 부스트(꼬리가 줄어요)</li><li><b>Shift</b>: 살금살금(느리지만 잘 꺾여요)</li><li>다른 곤충 몸에 머리를 부딪히면 끝</li>';
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
      // 내 머리의 화면 위치 기준으로 방향 계산
      const fm = frame.snakes.find((s) => s.id === frame.playerId);
      const cam = renderer.camera;
      const W = renderer.app.screen.width, H = renderer.app.screen.height;
      const hx = fm && fm.segs.length >= 2 ? W / 2 + (fm.segs[0] - cam.x) * cam.zoom : W / 2;
      const hy = fm && fm.segs.length >= 2 ? H / 2 + (fm.segs[1] - cam.y) * cam.zoom : H / 2;
      const cmd = input.update(hx, hy);
      const now = performance.now();
      if (cmd.boost !== lastCmd.boost || cmd.sneak !== lastCmd.sneak || Math.abs(cmd.angle - lastCmd.angle) > 0.01 || now - lastCmdAt > 100) {
        host.send(cmd);
        lastCmd = cmd;
        lastCmdAt = now;
      }
    }

    if (me.alive) {
      wasAlive = true;
      maxLen = Math.max(maxLen, me.length);
    } else if (wasAlive && playing) {
      if (!deadAt) deadAt = performance.now();
      if (performance.now() - deadAt > 1300) showGameOver(latest);
    }

    if (performance.now() - hudAt > 120) {
      hudAt = performance.now();
      updateHud(latest);
    }
  });
}

boot();

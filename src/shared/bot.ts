// 봇 AI. 봇도 플레이어와 똑같이 '명령'만 만든다 → 나중에 멀티에서 빈자리를 그대로 채운다.
import { CONFIG, spacingFor } from './config';
import type { Command } from './types';
import type { Simulation, Snake } from './sim';

const OFFSETS = [0, -0.35, 0.35, -0.7, 0.7, -1.1, 1.1, -1.6, 1.6, -2.2, 2.2];
const PROBES = [22, 45, 75, 110];

export function botThink(sim: Simulation, s: Snake, dt: number): Command {
  s.modeT -= dt;
  let desired = s.angle;
  let boost = false;

  // 사냥꾼 봇: 충분히 길면 가까운 곤충 주위를 돌며 감싸기를 시도
  let target: Snake | null = null;
  // 판 시작 직후에는 사냥하지 않는다(적응 시간)
  const grace = sim.tick * sim.dt < CONFIG.botGraceSeconds;
  if (s.hunter && !grace && s.segCount >= CONFIG.botHunterSegments) {
    if (s.modeT <= 0) {
      s.hunting = !s.hunting;
      s.modeT = s.hunting ? 7 + sim.rng.next() * 4 : 4 + sim.rng.next() * 4;
    }
    if (s.hunting) {
      let best = 420;
      for (const o of sim.snakes) {
        if (!o.alive || o.id === s.id) continue;
        if (o.segCount >= s.segCount) continue; // 자기보다 짧은 곤충만 노린다
        const d = Math.hypot(o.x - s.x, o.y - s.y);
        if (d < best) {
          best = d;
          target = o;
        }
      }
    }
  }

  if (target) {
    const R = Math.max(55, Math.min(220, (s.segCount * spacingFor(s.segCount)) / (2 * Math.PI) * 0.75));
    const dx = target.x - s.x, dy = target.y - s.y;
    const d = Math.hypot(dx, dy);
    const toT = Math.atan2(dy, dx);
    const bend = Math.max(-0.9, Math.min(0.9, (d - R) / R)) * (Math.PI / 3);
    desired = toT + s.side * (Math.PI / 2 - bend);
    boost = d > R * 1.8 && s.segCount > 30 && sim.rng.next() < 0.6;
  } else {
    // 먹이 찾기: EP/거리가 가장 좋은 먹이
    let bestScore = 0;
    let fx = 0, fy = 0;
    for (const f of sim.foods) {
      const dx = f.x - s.x, dy = f.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 450 * 450) continue;
      // 정면에 가까운 먹이를 선호(뒤로 크게 돌지 않게)
      const a = Math.atan2(dy, dx) - s.angle;
      const front = 0.6 + 0.4 * Math.cos(a);
      const score = (f.ep * front) / (Math.sqrt(d2) + 40);
      if (score > bestScore) {
        bestScore = score;
        fx = f.x;
        fy = f.y;
      }
    }
    if (bestScore > 0) {
      desired = Math.atan2(fy - s.y, fx - s.x);
    } else {
      if (s.modeT <= 0 || Math.hypot(s.wanderX - s.x, s.wanderY - s.y) < 60) {
        const a = sim.rng.range(0, Math.PI * 2);
        const r = sim.rng.range(0, CONFIG.arenaRadius * 0.7);
        s.wanderX = Math.cos(a) * r;
        s.wanderY = Math.sin(a) * r;
        s.modeT = 5;
      }
      desired = Math.atan2(s.wanderY - s.y, s.wanderX - s.x);
    }
  }

  // 위험 회피: 원하는 방향 주변 여러 각도를 탐색해 가장 안전한 쪽을 고른다
  let bestA = desired;
  let bestCost = Infinity;
  for (const off of OFFSETS) {
    const a = desired + off;
    const cost = danger(sim, s, a) * 10 + Math.abs(off) * 0.4;
    if (cost < bestCost) {
      bestCost = cost;
      bestA = a;
    }
    if (cost < 0.01) break;
  }
  const scared = danger(sim, s, s.angle) > 0.6;
  if (scared && s.segCount > 20 && sim.rng.next() < 0.3) boost = true;

  return { angle: bestA, boost, sneak: false };
}

function danger(sim: Simulation, s: Snake, a: number): number {
  const ca = Math.cos(a), sa = Math.sin(a);
  let worst = 0;
  for (let k = 0; k < PROBES.length; k++) {
    const dist = PROBES[k];
    const px = s.x + ca * dist, py = s.y + sa * dist;
    const weight = 1 - k / (PROBES.length + 1);
    if (Math.hypot(px, py) > CONFIG.arenaRadius - 40) worst = Math.max(worst, weight);
    sim.forSegsNear(px, py, s.r + CONFIG.maxRadius + 8, (o, _i, sx, sy) => {
      if (o.id === s.id) return;
      const rr = s.r + o.r + 8;
      const dx = sx - px, dy = sy - py;
      if (dx * dx + dy * dy < rr * rr) {
        worst = Math.max(worst, weight);
        return true;
      }
    });
    // 고리 벽도 위험
    for (const ring of sim.rings) {
      if (ring.owner === s.id) continue;
      const d = Math.hypot(px - ring.cx, py - ring.cy);
      const approx = Math.sqrt(Math.abs(polyAreaFast(ring.poly)) / Math.PI);
      if (Math.abs(d - approx) < 25) worst = Math.max(worst, weight * 0.7);
    }
    if (worst >= weight) break;
  }
  return worst;
}

function polyAreaFast(p: Float32Array): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return a / 2;
}

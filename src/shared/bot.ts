// 봇 AI. 봇도 플레이어와 똑같이 '명령'만 만든다 → 나중에 멀티에서 빈자리를 그대로 채운다.
import { CONFIG } from './config';
import { taste, type Part } from './species';
import type { Command } from './types';
import type { Simulation, Snake } from './sim';

const OFFSETS = [0, -0.35, 0.35, -0.7, 0.7, -1.1, 1.1, -1.6, 1.6, -2.2, 2.2];
const PROBES = [22, 45, 75, 110];

/** o의 몸이 s에게 위험한가(o가 더 강하면 박을 때 반동 피해) */
function deadly(sim: Simulation, s: Snake, o: Snake) {
  if (o.isBoss) return true;
  return sim.stronger(o, s) || s.hp < s.maxHp * 0.3;
}

export function botThink(sim: Simulation, s: Snake, dt: number): Command {
  s.modeT -= dt;
  let desired = s.angle;
  let boost = false;
  let skill = false;

  // 사냥꾼 봇: 충분히 길면 가까운 곤충 주위를 돌며 감싸기를 시도
  let target: Snake | null = null;
  const grace = sim.time < CONFIG.botGraceSeconds;
  if (s.hunter && !grace && s.segCount >= CONFIG.botHunterSegments && s.moltT <= 0) {
    if (s.modeT <= 0) {
      s.hunting = !s.hunting;
      s.modeT = s.hunting ? 7 + sim.rng.next() * 4 : 4 + sim.rng.next() * 4;
    }
    if (s.hunting) {
      let best = 420;
      for (const o of sim.snakes) {
        if (!o.alive || o.id === s.id || o.isBoss) continue;
        if (o.segCount >= s.segCount) continue;
        const d = Math.hypot(o.x - s.x, o.y - s.y);
        if (d < best) ((best = d), (target = o));
      }
    }
  }

  // 물기 공격: 가까운 약한 곤충의 몸통을 노린다(체력이 넉넉할 때)
  let prey: Snake | null = null;
  if (!target && !grace && s.moltT <= 0 && s.hp > s.maxHp * 0.5) {
    let best = s.hunter ? 380 : 220;
    for (const o of sim.snakes) {
      if (!sim.onField(o) || o.id === s.id || o.isBoss || o.invulnT > 0) continue;
      if (!sim.stronger(s, o)) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d < best) ((best = d), (prey = o));
    }
  }

  // 약자의 한 방: 강한 곤충의 꼬리 끝이 가깝고 머리는 멀면 꼬리 급소를 노린다
  let tailT: [number, number] | null = null;
  if (!target && !prey && !grace && s.hp > s.maxHp * 0.5) {
    for (const o of sim.snakes) {
      if (!sim.onField(o) || o.id === s.id || o.isBoss || o.segN < 14 || !sim.stronger(o, s)) continue;
      const ti = o.segN - 2;
      const tx = o.segs[ti * 2], ty = o.segs[ti * 2 + 1];
      if (Math.hypot(tx - s.x, ty - s.y) < 260 && Math.hypot(o.x - s.x, o.y - s.y) > 320) {
        tailT = [tx, ty];
        break;
      }
    }
  }

  if (target) {
    const R = Math.max(55, Math.min(220, (s.segCount * s.r * CONFIG.spacingRatio) / (2 * Math.PI) * 0.75));
    const dx = target.x - s.x, dy = target.y - s.y;
    const d = Math.hypot(dx, dy);
    const toT = Math.atan2(dy, dx);
    const bend = Math.max(-0.9, Math.min(0.9, (d - R) / R)) * (Math.PI / 3);
    desired = toT + s.side * (Math.PI / 2 - bend);
    boost = d > R * 1.8 && s.segCount > 30 && sim.rng.next() < 0.6;
  } else if (tailT) {
    desired = Math.atan2(tailT[1] - s.y, tailT[0] - s.x);
  } else if (prey) {
    // 몸통 1/3 지점을 문다
    const i = Math.min(prey.segN - 1, Math.max(2, Math.floor(prey.segN / 3)));
    const tx = prey.segs[i * 2], ty = prey.segs[i * 2 + 1];
    desired = Math.atan2(ty - s.y, tx - s.x);
    boost = Math.hypot(tx - s.x, ty - s.y) > 160 && s.segCount > 30 && sim.rng.next() < 0.3;
  } else {
    let bestScore = 0;
    let fx = 0, fy = 0;
    for (const f of sim.foods) {
      const dx = f.x - s.x, dy = f.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 450 * 450) continue;
      const a = Math.atan2(dy, dx) - s.angle;
      const front = 0.6 + 0.4 * Math.cos(a);
      // 보석은 귀하고, 좋아하는 특별 먹이는 아주 귀하다. 싫어하는 먹이는 피한다
      let v = f.ep;
      if (f.kind === 3) v = s.st[f.sub] < CONFIG.statMax ? 10 : 2;
      else if (f.kind === 4) {
        const t = taste(s.lineage, f.sub);
        if (t < 0) continue;
        v = t > 0 ? 45 : f.ep;
      }
      const score = (v * front) / (Math.sqrt(d2) + 40);
      if (score > bestScore) ((bestScore = score), (fx = f.x), (fy = f.y));
    }
    if (bestScore > 0) desired = Math.atan2(fy - s.y, fx - s.x);
    else {
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

  // 위험 회피
  let bestA = desired;
  let bestCost = Infinity;
  for (const off of OFFSETS) {
    const a = desired + off;
    const cost = danger(sim, s, a) * 10 + Math.abs(off) * 0.4;
    if (cost < bestCost) ((bestCost = cost), (bestA = a));
    if (cost < 0.01) break;
  }
  const scared = danger(sim, s, s.angle) > 0.6;
  if (scared && s.segCount > 20 && sim.rng.next() < 0.3) boost = true;
  // 체력이 낮고 위험하면 웅크려 방어
  const guard = scared && s.hp < s.maxHp * 0.4;
  if (guard) boost = false;

  // 스킬
  if (s.skillCd <= 0 && s.species.parts.length && s.moltT <= 0 && !grace) skill = wantSkill(sim, s, scared, target);

  // 진화: 카드가 나오면 잠시 뒤 고른다(60%는 유리한 카드)
  let moltSeq = s.lastMoltSeq, moltChoice = 0;
  if (s.cards) {
    s.moltDelay -= dt;
    if (s.moltDelay <= 0 && !scared) {
      if (sim.rng.next() < CONFIG.botFavorableChance) {
        let best = -Infinity;
        s.cards.forEach((c, i) => {
          const v = c.good - c.bad;
          if (v > best) ((best = v), (moltChoice = i));
        });
      } else moltChoice = Math.floor(sim.rng.next() * s.cards.length);
      moltSeq = s.lastMoltSeq + 1;
    }
  }

  return { angle: bestA, boost, sneak: guard, skillSeq: s.lastSkillSeq + (skill ? 1 : 0), moltSeq, moltChoice };
}

function enemiesWithin(sim: Simulation, s: Snake, r: number, filter?: (o: Snake, x: number, y: number) => boolean) {
  let n = 0;
  for (const o of sim.snakes) {
    if (!o.alive || o.id === s.id) continue;
    for (let i = 0; i < o.segN; i += 3) {
      const x = o.segs[i * 2], y = o.segs[i * 2 + 1];
      if (Math.hypot(x - s.x, y - s.y) <= r && (!filter || filter(o, x, y))) {
        n++;
        break;
      }
    }
  }
  return n;
}

function inFront(s: Snake, x: number, y: number, half: number, back = false) {
  let da = Math.atan2(y - s.y, x - s.x) - (s.angle + (back ? Math.PI : 0));
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return Math.abs(da) <= half;
}

export function wantSkill(sim: Simulation, s: Snake, scared: boolean, target: Snake | null): boolean {
  const parts = s.species.parts;
  const p: Part = parts[parts.length - 1];
  const main = parts[0];
  switch (main.k) {
    case 'cone':
      return enemiesWithin(sim, s, main.range, (o, x, y) => inFront(s, x, y, main.half, main.back)) > 0;
    case 'aoe':
      return enemiesWithin(sim, s, main.radius * 0.9) > 0;
    case 'fly':
      return enemiesWithin(sim, s, 150) > 0 || scared;
    case 'dash':
      if (main.cut) return enemiesWithin(sim, s, 150, (o, x, y) => inFront(s, x, y, 0.4)) > 0;
      if (main.push) return scared;
      return scared || !!target;
    case 'zone':
      if (main.shape === 'trail') return enemiesWithin(sim, s, 220, (o, x, y) => inFront(s, x, y, 1.2, true)) > 0;
      return enemiesWithin(sim, s, 260, (o, x, y) => inFront(s, x, y, 0.5)) > 0;
    case 'proj':
      return enemiesWithin(sim, s, 450, (o, x, y) => inFront(s, x, y, 0.3)) > 0;
    case 'shield':
      return scared || s.hurtT < 0.5;
    case 'magnet': {
      let n = 0;
      for (const f of sim.foods) if (Math.hypot(f.x - s.x, f.y - s.y) < main.radius) n++;
      return n > 10 || (p.k === 'aoe' && enemiesWithin(sim, s, 95) > 0);
    }
    case 'ringfast':
      return sim.rings.some((r) => r.owner === s.id) || enemiesWithin(sim, s, 110) > 0;
  }
  return false;
}

function danger(sim: Simulation, s: Snake, a: number): number {
  const ca = Math.cos(a), sa = Math.sin(a);
  let worst = 0;
  for (let k = 0; k < PROBES.length; k++) {
    const dist = PROBES[k];
    const px = s.x + ca * dist, py = s.y + sa * dist;
    const weight = 1 - k / (PROBES.length + 1);
    if (Math.hypot(px, py) > CONFIG.arenaRadius - 40) worst = Math.max(worst, weight);
    sim.forSegsNear(px, py, s.r + 40, (o, _i, sx, sy) => {
      if (o.id === s.id || !deadly(sim, s, o)) return;
      const rr = s.r + o.r + 8;
      const dx = sx - px, dy = sy - py;
      if (dx * dx + dy * dy < rr * rr) {
        worst = Math.max(worst, weight);
        return true;
      }
    });
    for (const ring of sim.rings) {
      if (ring.owner === s.id) continue;
      const d = Math.hypot(px - ring.cx, py - ring.cy);
      const approx = Math.sqrt(Math.abs(polyAreaFast(ring.poly)) / Math.PI);
      if (Math.abs(d - approx) < 25) worst = Math.max(worst, weight * 0.7);
    }
    for (const z of sim.zones) {
      if (z.owner === s.id) continue;
      if (Math.hypot(px - z.x, py - z.y) < z.r) worst = Math.max(worst, weight * (z.kind === 'slow' ? 0.3 : 0.6));
    }
    for (const rk of sim.map.rocks) if (Math.hypot(px - rk.x, py - rk.y) < rk.r + s.r + 10) worst = Math.max(worst, weight * 0.8);
    const hz = sim.enemies.hazard(px, py);
    if (hz > 0) worst = Math.max(worst, weight * hz);
    if (worst >= weight) break;
  }
  return worst;
}

/** 왕지네(천적): 점수 1등을 쫓아 물다가, 가끔 주위를 돌며 감싸려 한다 */
export function bossThink(sim: Simulation, s: Snake, dt: number): Command {
  const p = sim.bossTarget() ?? sim.snakes[sim.playerId];
  s.modeT -= dt;
  if (s.modeT <= 0) {
    s.hunting = !s.hunting;
    s.modeT = s.hunting ? 5 : 7;
  }
  let desired = s.angle;
  if (p.alive) {
    const lead = 90;
    const tx = p.x + Math.cos(p.angle) * lead, ty = p.y + Math.sin(p.angle) * lead;
    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    const toT = Math.atan2(dy, dx);
    if (s.hunting && d < 380) {
      const R = 160;
      const bend = Math.max(-0.9, Math.min(0.9, (d - R) / R)) * (Math.PI / 3);
      desired = toT + s.side * (Math.PI / 2 - bend);
    } else desired = toT;
  }
  const dc = Math.hypot(s.x, s.y);
  if (dc > CONFIG.arenaRadius - 260) desired = Math.atan2(-s.y, -s.x);
  return { angle: desired, boost: false, sneak: false, skillSeq: s.lastSkillSeq, moltSeq: s.lastMoltSeq, moltChoice: 0 };
}

function polyAreaFast(p: Float32Array): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return a / 2;
}

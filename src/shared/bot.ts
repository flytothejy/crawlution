// 봇 AI. 봇도 플레이어와 똑같이 '명령'만 만든다 → 멀티에서 빈자리를 그대로 채운다.
// 기획서 '화면 · 연출 · 봇' 탭의 봇 규칙: 성격 4가지, 카드 점수, 기술 형태별 쓰는 조건, 필살기 조건, 반응 지연.
import { CONFIG } from './config';
import { ABILITY_BY_ID } from './cards';
import { SUBS_BY_ID, taste, type AiKind } from './species';
import type { Command } from './types';
import type { Simulation, Snake } from './sim';

const OFFSETS = [0, -0.35, 0.35, -0.7, 0.7, -1.1, 1.1, -1.6, 1.6, -2.2, 2.2];
const PROBES = [22, 45, 75, 110];

/** 봇이 보기에 이 곤충은 없는 셈인가(숨음·죽은 척·꽃 흉내) */
function invisible(sim: Simulation, o: Snake) {
  return o.hiddenT > 0 || o.ambushT > 0 || o.deadT > 0 || (sim.inst(o, 'flower') && o.crouchT >= 1);
}

/** 상대의 겉보기 위치(허물을 나로 본다) */
function seenAt(o: Snake): [number, number] {
  return o.decoyT > 0 ? [o.decoyX, o.decoyY] : [o.x, o.y];
}

function deadly(sim: Simulation, s: Snake, o: Snake) {
  if (o.isBoss) return true;
  return sim.stronger(o, s) || s.hp < s.maxHp * 0.3;
}

export function botThink(sim: Simulation, s: Snake, dt: number): Command {
  s.modeT -= dt;
  let desired = s.angle;
  let boost = false;
  const grace = sim.time < CONFIG.botGraceSeconds;
  const hpK = s.hp / Math.max(1, s.maxHp);
  const persona = s.persona === 'gatherer' && s.level >= 8 ? 'hunter' : s.persona;

  // 사냥 대상
  let target: Snake | null = null;
  let coil = false;
  if (!grace && s.evolveT <= 0 && hpK > 0.4) {
    const range = persona === 'hunter' ? 460 : persona === 'brawler' ? 380 : persona === 'gatherer' ? 200 : 160;
    let best = range;
    for (const o of sim.snakes) {
      if (!sim.onField(o) || o.id === s.id || o.isBoss || o.invulnT > 0 || invisible(sim, o)) continue;
      const tooStrong = persona === 'brawler' ? o.level > s.level + 2 : persona === 'hunter' ? o.level > s.level + 1 : o.level > s.level - 2;
      if (tooStrong) continue;
      const [ox, oy] = seenAt(o);
      const d = Math.hypot(ox - s.x, oy - s.y);
      if (d < best) ((best = d), (target = o));
    }
    // 사냥꾼은 몸이 길면 감싸기를 시도
    if (target && persona === 'hunter' && s.segCount >= CONFIG.botHunterSegments && target.segCount < s.segCount) {
      if (s.modeT <= 0) {
        s.hunting = !s.hunting;
        s.modeT = s.hunting ? 6 + sim.rng.next() * 4 : 4 + sim.rng.next() * 3;
      }
      coil = s.hunting;
    }
  }

  // 겁쟁이·체력 낮음: 강한 상대에게서 도망
  let flee: Snake | null = null;
  if (persona === 'coward' || hpK < 0.35) {
    let best = persona === 'coward' ? 380 : 280;
    for (const o of sim.snakes) {
      if (!sim.onField(o) || o.id === s.id || invisible(sim, o)) continue;
      if (!o.isBoss && o.level <= s.level && hpK > 0.35) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d < best) ((best = d), (flee = o));
    }
  }

  // 꼬리 급소: 강한 곤충의 꼬리 끝이 가깝고 머리는 멀면
  let tailT: [number, number] | null = null;
  if (!target && !flee && !grace && hpK > 0.5) {
    for (const o of sim.snakes) {
      if (!sim.onField(o) || o.id === s.id || o.isBoss || o.segN < 14 || !sim.stronger(o, s) || invisible(sim, o)) continue;
      const ti = o.segN - 2;
      const tx = o.segs[ti * 2], ty = o.segs[ti * 2 + 1];
      if (Math.hypot(tx - s.x, ty - s.y) < 260 && Math.hypot(o.x - s.x, o.y - s.y) > 320) {
        tailT = [tx, ty];
        break;
      }
    }
  }

  if (flee) {
    desired = Math.atan2(s.y - flee.y, s.x - flee.x);
    boost = s.segCount > 24 && Math.hypot(flee.x - s.x, flee.y - s.y) < 220;
  } else if (target && coil) {
    const R = Math.max(55, Math.min(220, (s.segCount * s.r * CONFIG.spacingRatio) / (2 * Math.PI) * 0.75));
    const [ox, oy] = seenAt(target);
    const dx = ox - s.x, dy = oy - s.y;
    const d = Math.hypot(dx, dy);
    const toT = Math.atan2(dy, dx);
    const bend = Math.max(-0.9, Math.min(0.9, (d - R) / R)) * (Math.PI / 3);
    desired = toT + s.side * (Math.PI / 2 - bend);
    boost = d > R * 1.8 && s.segCount > 30 && sim.rng.next() < 0.6;
  } else if (tailT) {
    desired = Math.atan2(tailT[1] - s.y, tailT[0] - s.x);
  } else if (target) {
    const i = Math.min(target.segN - 1, Math.max(2, Math.floor(target.segN / 3)));
    const [tx, ty] = target.decoyT > 0 ? seenAt(target) : [target.segs[i * 2], target.segs[i * 2 + 1]];
    desired = Math.atan2(ty - s.y, tx - s.x);
    boost = Math.hypot(tx - s.x, ty - s.y) > 160 && s.segCount > 30 && sim.rng.next() < 0.3;
  } else {
    // 먹이: 황금 꿀방울·좋아하는 특별 먹이는 귀하다. 싫어하는 먹이는 피한다. 가짜 먹이에도 속는다
    let bestScore = 0, fx = 0, fy = 0;
    for (const f of sim.foods) {
      const dx = f.x - s.x, dy = f.y - s.y;
      if (dx > 450 || dx < -450 || dy > 450 || dy < -450) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 > 450 * 450) continue;
      const a = Math.atan2(dy, dx) - s.angle;
      const front = 0.6 + 0.4 * Math.cos(a);
      let v = f.ep;
      if (f.kind === 3) v = 15;
      else if (f.kind === 4) {
        const t = taste(s.fam.id, f.sub);
        if (t < 0) continue;
        v = t > 0 ? 45 : f.ep;
      }
      const score = (v * front) / (Math.sqrt(d2) + 40);
      if (score > bestScore) ((bestScore = score), (fx = f.x), (fy = f.y));
    }
    for (const z of sim.zones) {
      if (z.kind !== 'bait' || z.owner === s.id) continue;
      const d = Math.hypot(z.x - s.x, z.y - s.y);
      if (d < 400 && 8 / (d + 40) > bestScore) ((bestScore = 8 / (d + 40)), (fx = z.x), (fy = z.y));
    }
    // 꽃 흉내: 먹이인 줄 알고 다가간다
    for (const o of sim.snakes) {
      if (o.id === s.id || !sim.onField(o) || !(sim.inst(o, 'flower') && o.crouchT >= 1)) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d < 400 && 10 / (d + 40) > bestScore) ((bestScore = 10 / (d + 40)), (fx = o.x), (fy = o.y));
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
  const scared = danger(sim, s, s.angle) > 0.6 || !!flee;
  if (scared && s.segCount > 20 && sim.rng.next() < 0.3) boost = true;
  let guard = scared && hpK < 0.4;
  if (guard) boost = false;
  // 웅크리면 좋아지는 본능은 가끔 일부러 웅크린다
  if (!target && !scared && (sim.inst(s, 'pray') || sim.inst(s, 'flower') || sim.inst(s, 'jaws') || sim.inst(s, 'nest') || sim.inst(s, 'leaf') || sim.tsp(s, 'poise') || sim.tsp(s, 'dark'))) {
    if ((sim.time + s.id * 7) % 14 < 2.2) guard = true;
  }

  if (target && !scared && sim.tsp(s, 'poise') && !s.poised && s.skillCd <= 0 && Math.hypot(target.x - s.x, target.y - s.y) > 260) guard = true;
  // 기술: 조건이 반응 지연만큼 이어지면 쓴다
  let skill = false, sub = false, spc = false, ult = false;
  if (s.kit) {
    // 3판: 공격·방어·특수·필살기 칸을 저마다 판단
    const k = s.kit;
    if (!grace && sim.canAct(s) && s.chanT <= 0) {
      const wantAtk = s.skillCd <= 0 && wantAi(sim, s, k.atk.ai, k.atk.range * sim.rangeMul(s), scared, target);
      s.thinkAcc = wantAtk ? s.thinkAcc + dt : 0;
      if (wantAtk && s.thinkAcc >= s.react) ((skill = true), (s.thinkAcc = 0));
      if (s.level >= 3 && s.subCd <= 0 && wantAi(sim, s, k.def.ai, k.def.range * sim.rangeMul(s, true), scared, target) && sim.rng.next() < 0.5) sub = true;
      // 위기(쫓기며 체력 40% 아래)에는 방어 기술 종류와 상관없이 꺼낸다 — 방어 칸 공통 '몸 추스르기'로 빠져나갈 틈이 생긴다
      if (s.level >= 3 && s.subCd <= 0 && scared && s.hp < s.maxHp * 0.4) sub = true;
      if (s.level >= 5 && s.spcCd <= 0 && wantAi(sim, s, k.spc.ai, k.spc.range * sim.rangeMul(s, true), scared, target) && sim.rng.next() < 0.5) spc = true;
      if (s.ult >= CONFIG.ultMax && wantUlt(sim, s)) ult = true;
    } else if (s.level >= 3 && s.subCd <= 0 && k.def.ai === 'escape' && (s.rootT > 0 || s.grabbedBy >= 0 || s.slowT > 0.5 || s.charmT > 0)) sub = true;
  } else if (!grace && sim.canAct(s)) {
    const ultReady = s.ult >= CONFIG.ultMax;
    const wantMain = ultReady ? wantUlt(sim, s) : s.skillCd <= 0 && wantAi(sim, s, s.form.ai, s.form.range * sim.rangeMul(s), scared, target);
    s.thinkAcc = wantMain ? s.thinkAcc + dt : 0;
    if (wantMain && s.thinkAcc >= s.react) {
      skill = true;
      s.thinkAcc = 0;
    }
    if (s.sub && s.subCd <= 0) {
      const sd = SUBS_BY_ID.get(s.sub.id)!;
      if (wantAi(sim, s, sd.ai, sd.range * sim.rangeMul(s, true), scared, target) && sim.rng.next() < 0.5) sub = true;
    }
  } else if (!s.kit && s.sub && s.subCd <= 0 && (s.sub.id === 'escape' || s.sub.id === 'molt') && (s.rootT > 0 || s.grabbedBy >= 0 || s.slowT > 0.5)) sub = true;
  if (s.ambushT > 0) skill = false;

  // 카드: 나오면 잠시 뒤 고른다(가끔 다시 뽑기)
  let cardSeq = s.lastCardSeq, cardChoice = 0, rerollSeq = s.lastRerollSeq;
  if (s.offer) {
    s.cardDelay -= dt;
    if (s.cardDelay <= 0 && !scared) {
      if (s.rerolls > 0 && sim.rng.next() < 0.15) {
        rerollSeq++;
        s.cardDelay = 0.6;
      } else {
        cardChoice = botPickCard(sim, s);
        cardSeq++;
      }
    }
  }

  return { angle: bestA, boost, sneak: guard, skillSeq: s.lastSkillSeq + (skill ? 1 : 0), subSeq: s.lastSubSeq + (sub ? 1 : 0), spcSeq: s.lastSpcSeq + (spc ? 1 : 0), ultSeq: s.lastUltSeq + (ult ? 1 : 0), cardSeq, cardChoice, rerollSeq };
}

/** 카드 점수: 역할 추천 ×1.5, 계열 전용 ×2, 칸이 절반 넘게 차면 강화 우선, ±20% 흔들기 */
export function botPickCard(sim: Simulation, s: Snake): number {
  const off = s.offer;
  if (!off) return 0;
  let best = 0, bv = -Infinity;
  off.cards.forEach((c, i) => {
    let v = 1;
    if (off.kind === 'sub') {
      const d = SUBS_BY_ID.get(c.id);
      v = c.id === s.fam.sub.id ? 2 : 1.3;
    } else if (c.kind === 'new') {
      const a = ABILITY_BY_ID.get(c.id)!;
      v = a.family ? 2 : a.roles?.includes(s.fam.role) ? 1.5 : 1;
      if (s.abilities.length >= 2) v *= 0.8;
    } else if (c.kind === 'up') {
      const a = ABILITY_BY_ID.get(c.id)!;
      v = (a.family ? 1.6 : a.roles?.includes(s.fam.role) ? 1.3 : 1) * (s.abilities.length >= 2 ? 1.4 : 1);
    } else if (c.kind === 'main') v = 1.5;
    else if (c.kind === 'sub') v = 1.1;
    else v = c.id === 'heal' && s.hp < s.maxHp * 0.6 ? 2 : c.id === 'ult' ? 1.2 : 1;
    v *= sim.rng.range(0.8, 1.2);
    if (v > bv) ((bv = v), (best = i));
  });
  return best;
}

function enemiesWithin(sim: Simulation, s: Snake, r: number, filter?: (o: Snake, x: number, y: number) => boolean) {
  let n = 0;
  for (const o of sim.snakes) {
    if (!o.alive || o.id === s.id || !sim.hittable(o) || invisible(sim, o)) continue;
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

/** 쫓기는 중인가(뒤쪽 가까이에 적 머리) */
function chased(sim: Simulation, s: Snake) {
  for (const o of sim.snakes) {
    if (!o.alive || o.id === s.id || !sim.hittable(o)) continue;
    const ti = Math.max(0, s.segN - 1);
    if (Math.hypot(o.x - s.segs[ti * 2], o.y - s.segs[ti * 2 + 1]) < 200 && Math.hypot(o.x - s.x, o.y - s.y) > 80) return true;
  }
  return false;
}

/** 기술 형태별로 쓰는 조건 */
export function wantAi(sim: Simulation, s: Snake, ai: AiKind, range: number, scared: boolean, target: Snake | null): boolean {
  const R = range;
  switch (ai) {
    case 'dash':
      return enemiesWithin(sim, s, R * 0.8, (o, x, y) => inFront(s, x, y, 0.35)) > 0;
    case 'melee':
      return enemiesWithin(sim, s, R + s.r + 20, (o, x, y) => inFront(s, x, y, 0.7)) > 0;
    case 'cone':
      return enemiesWithin(sim, s, R, (o, x, y) => inFront(s, x, y, 0.85)) > 0;
    case 'line':
    case 'proj':
      return enemiesWithin(sim, s, R, (o, x, y) => inFront(s, x, y, 0.16)) > 0;
    case 'place':
      return enemiesWithin(sim, s, R * 1.2, (o, x, y) => inFront(s, x, y, 0.5)) > 0 || chased(sim, s);
    case 'pit':
      return enemiesWithin(sim, s, 170) > 0 || chased(sim, s);
    case 'trail':
      return chased(sim, s) || enemiesWithin(sim, s, 250) > 0;
    case 'back':
      return enemiesWithin(sim, s, R, (o, x, y) => inFront(s, x, y, 0.9, true)) > 0;
    case 'ambush':
      return !scared && enemiesWithin(sim, s, 340) > 0 && enemiesWithin(sim, s, 120) === 0 && sim.rng.next() < 0.3;
    case 'summon':
      return enemiesWithin(sim, s, 300) > 0;
    case 'heal':
      return s.hp < s.maxHp * 0.6 && (s.hurtT < 2 || enemiesWithin(sim, s, 300) > 0);
    case 'target':
      return enemiesWithin(sim, s, R) > 0;
    case 'aoe':
      return enemiesWithin(sim, s, R * 0.9) > 0;
    case 'self': {
      let n = 0;
      for (const f of sim.foods) if (Math.abs(f.x - s.x) < R && Math.abs(f.y - s.y) < R) n++;
      return n > 14 || enemiesWithin(sim, s, R * 0.7) > 0;
    }
    case 'buff':
      return enemiesWithin(sim, s, R) > 0 || !!target;
    case 'move':
      return (scared && s.hp < s.maxHp * 0.5) || (!!target && Math.hypot(target.x - s.x, target.y - s.y) > 200);
    case 'defense':
      return (scared && s.hp < s.maxHp * 0.5) || (s.hurtT < 0.4 && s.hp < s.maxHp * 0.6);
    case 'escape':
      return s.rootT > 0 || s.grabbedBy >= 0 || s.slowT > 0.5 || (scared && s.hp < s.maxHp * 0.4);
  }
  return false;
}

/** 필살기: 범위 안 적 2마리 이상, 또는 체력 40% 이하 적 1마리 */
function wantUlt(sim: Simulation, s: Snake): boolean {
  const R = s.kit ? s.kit.ult.range : s.fam.ult.range;
  let n = 0, weak = false;
  for (const o of sim.snakes) {
    if (!o.alive || o.id === s.id || !sim.hittable(o) || invisible(sim, o)) continue;
    if (Math.hypot(o.x - s.x, o.y - s.y) > R + o.r) continue;
    if (s.kit ? s.kit.ult.impl.k === 'ult' && (s.kit.ult.impl.fam === 'rhino' || s.kit.ult.impl.fam === 'stag') : s.fam.id === 'rhino' || s.fam.id === 'stag') if (!inFront(s, o.x, o.y, 0.5)) continue;
    n++;
    if (o.hp < o.maxHp * 0.4) weak = true;
  }
  return n >= 2 || weak;
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
      if (z.owner === s.id || z.kind === 'bait' || z.kind === 'decoy' || z.kind === 'nest' || z.kind === 'honey' && !z.awake) continue;
      if (Math.hypot(px - z.x, py - z.y) < z.r) worst = Math.max(worst, weight * (z.kind === 'lantern' ? 0.2 : z.kind === 'silk' ? 0.3 : 0.65));
    }
    for (const te of sim.teles) {
      if (te.owner === s.id) continue;
      if (te.shape === 'circle' && Math.hypot(px - te.x, py - te.y) < te.r) worst = Math.max(worst, weight * 0.9);
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
  return { angle: desired, boost: false, sneak: false, skillSeq: s.lastSkillSeq, subSeq: s.lastSubSeq, spcSeq: s.lastSpcSeq, ultSeq: s.lastUltSeq, cardSeq: s.lastCardSeq, cardChoice: 0, rerollSeq: s.lastRerollSeq };
}

function polyAreaFast(p: Float32Array): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return a / 2;
}

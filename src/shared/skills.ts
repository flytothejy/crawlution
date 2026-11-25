// 기술 구현: 계열별 주 기술(형태 3가지) · 보조 기술 · 필살기 · 장판 · 부른 벌 · 본능 일부.
// 수치는 기획서 '기술 수치표' 탭. B = 기준 피해, R = 범위 배율.
import { CONFIG } from './config';
import type { Simulation, Snake, Zone } from './sim';

const PI = Math.PI;

function head(s: Snake, d = 0): [number, number] {
  return [s.x + Math.cos(s.angle) * d, s.y + Math.sin(s.angle) * d];
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

/** 가장 가까운 적(머리·몸 중 가까운 마디 기준) */
export function nearestEnemy(sim: Simulation, s: Snake, range: number, x = s.x, y = s.y): Snake | null {
  let best: Snake | null = null, bd = range;
  for (const o of sim.snakes) {
    if (o.id === s.id || !sim.hittable(o) || o.deadT > 0) continue;
    for (let i = 0; i < o.segN; i += 3) {
      const d = dist(o.segs[i * 2], o.segs[i * 2 + 1], x, y);
      if (d < bd) ((bd = d), (best = o));
    }
  }
  return best;
}

/** 예고 동작 뒤에 발동: 힘을 모으는 모습(windup)을 보여 준 뒤 t초 후 실제 기술 */
function windup(sim: Simulation, s: Snake, t: number, kind: string, fn: () => void) {
  sim.fx('windup', s, s.x, s.y, { angle: s.angle, wk: kind, dur: t });
  sim.later(t, () => {
    if (s.alive && s.stunT <= 0 && s.grabbedBy < 0 && s.netT <= 0) fn();
  });
}

export function startDash(sim: Simulation, s: Snake, kind: string, len: number, mul: number, fly = false, dmg = 0) {
  const sp = Math.max(60, sim.speedOf(s) * mul);
  s.dashT = len / sp;
  s.dashMul = mul;
  s.dashKind = kind;
  s.dashHits.clear();
  s.dashDmg = dmg;
  if (fly) s.flyT = Math.max(s.flyT, s.dashT);
}

// ---------- 주 기술 ----------

export function castMain(sim: Simulation, s: Snake) {
  const B = sim.B(s) * sim.mainMul(s) * (s.prayArmed ? 1.5 : 1);
  const R = sim.rangeMul(s);
  const aw = s.evo >= 3;
  const fam = s.fam.id;
  const form = s.form.id;
  const [hx, hy] = [s.x, s.y];
  if (sim.larvaLip(s)) {
    // 잠자리 수채: 아랫입술 발사
    sim.fx('lip', s, hx, hy, { angle: s.angle, len: 90 * R });
    sim.line(s, hx, hy, s.angle, 90 * R, 50, 1, (o, x, y) => {
      sim.deal(s, o, B * 0.6, 'skill', x, y);
      sim.pullTo(o, s.x, s.y, 40);
    });
    return;
  }
  switch (fam) {
    case 'rhino': {
      const heavy = 1 + sim.ab(s, 'heavy');
      if (form === 'charge') {
        // 뒷발로 땅을 긁으며 몸을 낮췄다가 튀어 나간다
        windup(sim, s, 0.16, 'charge', () => {
          startDash(sim, s, 'charge', 260 * R * heavy, 3, false, B * 0.85);
          sim.fx('charge', s, s.x, s.y, { angle: s.angle, len: 260 * R * heavy, dur: s.dashT });
        });
      } else if (form === 'lift') {
        // 뿔을 땅에 박듯 머리를 숙였다가 위로 퍼 올린다
        windup(sim, s, 0.2, 'lift', () => {
        const [hx, hy] = [s.x, s.y];
        sim.fx('lift', s, hx, hy, { angle: s.angle, r: 90 * R });
        let n = 0;
        sim.cone(s, hx, hy, s.angle, 90 * R, 0.8, (o, x, y) => {
          if (n++ >= 2) return;
          sim.deal(s, o, B * 0.7, 'skill', x, y);
          sim.stun(o, 0.5 + (sim.inst(s, 'pincer') ? 0.6 : 0));
          const bx = s.x - Math.cos(s.angle) * 150 * heavy, by = s.y - Math.sin(s.angle) * 150 * heavy;
          const fly = Math.hypot(bx - o.x, by - o.y) / (320 * heavy);
          sim.pullTo(o, bx, by, 320 * heavy);
          sim.fx('lifted', o, o.x, o.y, { angle: s.angle + Math.PI, dur: Math.max(0.35, fly), x1: bx, y1: by });
          sim.hitstop(s, o, 0.07);
          sim.events.push({ type: 'skillHit', x, y, kind: 'push' });
          if (aw) sim.later(0.35, () => {
            if (!o.alive) return;
            sim.fx('shock', s, o.x, o.y, { r: 70 });
            sim.circle(s, o.x, o.y, 70, (p, px, py) => sim.deal(s, p, B * 0.5, 'skill', px, py));
          });
        });
        });
      } else {
        // 버티고 밀기: 2초 채널
        s.chanT = 2;
        s.chanKind = 'push';
        s.chanAcc = 0.25;
        s.chanDmg = B;
        s.chanHits.clear();
        s.reduceT = 2;
        s.reduceMul = 0.7;
        sim.fx('push', s, hx, hy, { angle: s.angle, r: 100 * R, dur: 2 });
      }
      return;
    }
    case 'stag': {
      const reach = 70 * R * (sim.inst(s, 'sawjaw') ? 1.4 : sim.inst(s, 'longjaw') ? 1.8 : 1);
      if (form === 'scissor') {
        const cut = (mul: number) => {
          sim.fx('scissor', s, s.x, s.y, { angle: s.angle, r: 110 * R, half: 1.05, dur: 0.3 });
          sim.cone(s, s.x, s.y, s.angle, 110 * R, 1.05, (o, x, y) => {
            sim.deal(s, o, B * mul * jawNear(sim, s, x, y), 'skill', x, y);
            sim.events.push({ type: 'skillHit', x, y, kind: 'cut' });
          });
        };
        // 큰턱을 활짝 벌렸다가(예고) 양쪽에서 휘둘러 닫는다
        windup(sim, s, 0.14, 'scissor', () => {
          cut(1);
          if (aw) sim.later(0.28, () => s.alive && cut(0.8));
        });
        return;
      }
      sim.fx('grab', s, hx, hy, { angle: s.angle, r: reach });
      const t = pickFront(sim, s, reach + s.r, 0.7);
      if (!t) return;
      const [tx, ty] = t.pos;
      const mul = jawNear(sim, s, tx, ty);
      if (form === 'grab') {
        if (sim.grab(s, t.o, 1.5 + sim.ab(s, 'steel'), 'squeeze')) {
          s.grabDmg = B * mul;
          s.grabAcc = 0;
        }
      } else if (sim.grab(s, t.o, 0.3, 'throw')) {
        s.grabDmg = B * mul;
        // 큰턱으로 물어 낮게 들어 올린다(퍼 올리기보다 낮게) → 끝나면 머리 위로 뒤로 던진다
        sim.fx('lifted', t.o, t.o.x, t.o.y, { angle: s.angle, wk: 'held', dur: 0.32 });
        sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'heft', dur: 0.32 });
      }
      return;
    }
    case 'mantis': {
      if (form === 'sweep') {
        // 두 낫을 바깥 높이 치켜들었다가(예고) 앞쪽을 크게 휩쓴다
        windup(sim, s, 0.12, 'sweep', () => {
          const [hx2, hy2] = head(s, 0);
          sim.fx('sweep', s, hx2, hy2, { angle: s.angle, r: 120 * R, half: 1.05, awake: aw });
          sim.cone(s, hx2, hy2, s.angle, 120 * R, 1.05, (o, x, y) => {
            sim.deal(s, o, B, 'skill', x, y);
            sim.events.push({ type: 'skillHit', x, y, kind: 'cut' });
          });
          if (aw) {
            const [zx, zy] = head(s, 70 * R);
            sim.addZone({ x: zx, y: zy, r: 85 * R, kind: 'blade', life: 2, owner: s.id, dps: B * 0.35 });
          }
        });
      } else if (form === 'stab') {
        sim.fx('stab', s, hx, hy, { angle: s.angle, len: 220 * R });
        sim.line(s, hx, hy, s.angle, 220 * R, 30, aw ? 2 : 1, (o, x, y) => {
          sim.deal(s, o, B * 1.5, 'skill', x, y);
          sim.events.push({ type: 'skillHit', x, y, kind: 'cut' });
        });
      } else {
        s.chanT = 0.31;
        s.chanKind = 'combo';
        s.chanAcc = 0.15;
        s.chanN = 0;
        s.chanDmg = B;
        comboHit(sim, s);
      }
      return;
    }
    case 'dragonfly': {
      if (form === 'dive') {
        // 날개를 세차게 치며 떠올랐다가 내리꽂는다
        s.flyT = Math.max(s.flyT, 0.24);
        windup(sim, s, 0.24, 'dive', () => {
          startDash(sim, s, 'dive', 300 * R, 3.2, true, B);
          sim.fx('dive', s, s.x, s.y, { angle: s.angle, len: 300 * R, dur: s.dashT });
        });
      } else if (form === 'snatch') {
        // 앞으로 곧은 줄을 그어 보여 주고, 곧 그 줄 위의 적과 먹이를 내 앞으로 끌어온다(나는 제자리)
        const a0 = s.angle, L = 280 * R;
        sim.fx('aimline', s, s.x, s.y, { angle: a0, len: L, wk: 'snatch', dur: 0.3 });
        windup(sim, s, 0.3, 'snatch', () => snatchPull(sim, s, a0, L, B));
      } else {
        s.chanT = 1.5;
        s.chanKind = 'circle';
        s.chanAcc = 0.3;
        s.chanDmg = B;
        sim.fx('circle', s, hx, hy, { r: 110 * R, dur: 1.5, angle: s.angle, half: s.side });
      }
      return;
    }
    case 'wasp': {
      if (form === 'burst') {
        s.chanT = (aw ? 5 : 3) * 0.15 - 0.01;
        s.chanKind = 'burst';
        s.chanAcc = 0;
        s.chanN = 0;
        s.chanDmg = B;
        sting(sim, s, s.angle, B * 0.35, 380 * R, 'sting');
        sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'shot', dur: 0.13 });
        sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'hover', dur: s.chanT + 0.2 });
        s.chanN = 1;
      } else if (form === 'snipe') {
        // 제자리에 떠서 조준(조준선) → 굵은 독침 한 발, 크게 반동
        sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'hover', dur: 0.75 });
        sim.fx('aimline', s, s.x, s.y, { angle: s.angle, len: 600 * R, wk: 'aim', dur: 0.35 });
        windup(sim, s, 0.35, 'snipe', () => {
          sting(sim, s, s.angle, B * 1.4, 600 * R, 'bigsting', 900, aw);
          sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'bigshot', dur: 0.3 });
          sim.fx('sting', s, s.x, s.y, { angle: s.angle });
        });
        return;
      } else {
        for (let k = 0; k < 5; k++) {
          const a = s.angle + (k - 2) * 0.26;
          sting(sim, s, a, B * 0.3, 220 * R, 'sting', 700, false, aw);
        }
      }
      sim.fx('sting', s, hx, hy, { angle: s.angle });
      return;
    }
    case 'stinkbug': {
      const thick = 1 + sim.ab(s, 'thick');
      if (form === 'cloud') {
        const life = (4 + sim.ab(s, 'linger')) * (sim.inst(s, 'stench') ? 2 : 1);
        const r = 110 * R * thick;
        const [zx, zy] = head(s, 80 + s.r);
        sim.addZone({ x: zx, y: zy, r, r1: aw ? r * 1.45 : r, kind: 'gas', life, owner: s.id, dps: B * 0.25, mul: 0.7, awake: aw });
        sim.fx('cloud', s, zx, zy, { r });
      } else if (form === 'jet') {
        sim.fx('jet', s, hx, hy, { angle: s.angle, len: 260 * R * thick });
        sim.line(s, hx, hy, s.angle, 260 * R * thick, 40, 99, (o, x, y) => {
          sim.deal(s, o, B, 'skill', x, y);
          if (aw) (sim.silence(o, 1), sim.events.push({ type: 'skillHit', x, y, kind: 'silence' }));
        });
      } else backJet(sim, s, B * 0.9, 140 * R * thick, 1.5);
      return;
    }
    case 'spider': {
      if (form === 'orb') {
        const golden = sim.inst(s, 'golden');
        const max = golden ? 1 : 2;
        const mine = sim.zones.filter((z) => z.kind === 'web' && z.owner === s.id);
        while (mine.length >= max) {
          const old = mine.shift()!;
          sim.zones.splice(sim.zones.indexOf(old), 1);
        }
        const [zx, zy] = head(s, 100 + s.r);
        const r = 90 * R * (golden ? 1.5 : 1);
        sim.addZone({ x: zx, y: zy, r, kind: 'web', life: 12, owner: s.id, dps: B * (aw ? 1.0 : 0.5), awake: aw });
        sim.fx('web', s, zx, zy, { r });
      } else if (form === 'silk') {
        silk(sim, s, B);
        if (aw) sim.later(0.25, () => s.alive && silk(sim, s, B));
      } else {
        s.trailT = 3;
        s.trailAwake = aw;
        s.chanAcc = 0;
        s.trailHits = new Set();
      }
      return;
    }
    case 'antlion': {
      if (form === 'pit') {
        const deep = sim.inst(s, 'deep');
        const r = 120 * R * (deep ? 1.3 : 1);
        sim.addZone({ x: s.x, y: s.y, r, kind: 'pit', life: 8 * (deep ? 1.5 : 1), owner: s.id, dps: B * 0.8, mul: 60 * (1 + sim.ab(s, 'fine')), awake: aw });
        sim.fx('pit', s, s.x, s.y, { r });
      } else if (form === 'sand') {
        const dirs = aw ? [-0.35, 0, 0.35] : [0];
        const hit = new Set<number>();
        for (const d of dirs) {
          sim.fx('sand', s, hx, hy, { angle: s.angle + d, len: 260 * R, half: 0.26 });
          sim.cone(s, hx, hy, s.angle + d, 260 * R, 0.26, (o, x, y) => {
            if (hit.has(o.id)) return;
            hit.add(o.id);
            sim.deal(s, o, B * 0.9, 'skill', x, y);
            sim.slow(o, 1.5, 0.6);
            sim.pullTo(o, s.x, s.y, 60);
            sim.events.push({ type: 'skillHit', x, y, kind: 'slow' });
          });
        }
      } else {
        s.ambushT = 6;
        s.ghostT = 6;
        s.hiddenT = 6;
        s.chanDmg = B;
        sim.fx('ambush', s, s.x, s.y, { r: 100 * R });
      }
      return;
    }
    case 'bee': {
      const raw = (B / s.fam.atk) * (1 + sim.ab(s, 'busy'));
      if (form === 'workers') {
        const n = (aw ? 5 : 3) + sim.tm(s, 'minion');
        for (let k = 0; k < n; k++) sim.addMinion(s, 'bee', 5 + sim.ab(s, 'swarm'), raw * 0.25);
        sim.fx('summon', s, s.x, s.y, { r: 60 });
      } else if (form === 'honey') {
        sim.addZone({ x: s.x, y: s.y, r: 100 * R, kind: 'honey', life: 5, owner: s.id, mul: 0.7, awake: aw });
        sim.fx('honey', s, s.x, s.y, { r: 100 * R });
        sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'drip', dur: 0.9 });
      } else {
        const t = nearestEnemy(sim, s, 200 * R);
        sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'heat', dur: 0.6 });
        if (t) heatBall(sim, s, t, raw * 0.4, 3 * (sim.inst(s, 'heat') ? 2 : 1), aw);
        else sim.fx('heat', s, ...head(s, 120), { r: 50 });
      }
      return;
    }
    case 'firefly': {
      const bright = sim.ab(s, 'bright');
      if (form === 'flash') {
        const r = 160 * R * (aw ? 1.375 : 1) * forestMul(sim, s);
        sim.fx('flash', s, s.x, s.y, { r, awake: aw });
        sim.circle(s, s.x, s.y, r, (o, x, y) => {
          sim.deal(s, o, B * 0.6, 'skill', x, y);
          sim.blind(o, 1.5 + bright);
          if (sim.inst(s, 'fakesignal')) sim.pullTo(o, s.x, s.y, 100);
          sim.events.push({ type: 'skillHit', x, y, kind: 'blind' });
        });
      } else if (form === 'signal') {
        const shot = (a: number) =>
          sim.addProj({
            x: s.x, y: s.y, vx: Math.cos(a) * 650, vy: Math.sin(a) * 650, life: (400 * R) / 650, owner: s.id, kind: 'orb',
            onHit: (o, x, y) => {
              sim.deal(s, o, B * 0.7, 'skill', x, y);
              sim.markOn(o, 5 + bright);
              sim.events.push({ type: 'skillHit', x, y, kind: 'mark' });
            },
          });
        if (aw) (shot(s.angle - 0.12), shot(s.angle + 0.12));
        else shot(s.angle);
        sim.fx('signal', s, s.x, s.y, { angle: s.angle });
      } else {
        sim.addZone({ x: s.x, y: s.y, r: 260 * R, kind: 'lantern', life: 4, owner: s.id, follow: true, awake: aw, acc: 0.5 });
        sim.fx('lantern', s, s.x, s.y, { r: 260 * R });
      }
      return;
    }
  }
}

/** 기라파톱사슴벌레: 바로 앞의 적에게는 피해 −40% */
function jawNear(sim: Simulation, s: Snake, x: number, y: number) {
  if (!sim.inst(s, 'longjaw')) return 1;
  return dist(s.x, s.y, x, y) < s.r * 2.5 + 30 ? 0.6 : 1;
}

/** 앞쪽 가장 가까운 적 하나 */
function pickFront(sim: Simulation, s: Snake, range: number, half: number): { o: Snake; pos: [number, number] } | null {
  let best: { o: Snake; pos: [number, number]; d: number } | null = null;
  sim.cone(s, s.x, s.y, s.angle, range, half, (o, x, y) => {
    const d = dist(x, y, s.x, s.y);
    if (!best || d < best.d) best = { o, pos: [x, y], d };
  });
  return best;
}

function comboHit(sim: Simulation, s: Snake) {
  const R = sim.rangeMul(s);
  const n = s.chanN++;
  const last = n === 2;
  sim.fx('combo', s, s.x, s.y, { angle: s.angle + (n - 1) * 0.5, r: 80 * R, half: 0.8, awake: last, wk: last ? 'X' : n === 0 ? 'L' : 'R' });
  sim.cone(s, s.x, s.y, s.angle, 80 * R, 0.8, (o, x, y) => {
    const dmg = s.chanDmg * 0.45 * (last ? 1.6 * (1 + sim.ab(s, 'tail')) : 1);
    sim.deal(s, o, dmg, last ? 'crit' : 'skill', x, y);
    sim.events.push({ type: 'skillHit', x, y, kind: 'cut' });
    if (last && s.evo >= 3) (sim.stun(o, 0.5), sim.events.push({ type: 'skillHit', x, y, kind: 'stun' }));
  });
}

function sting(sim: Simulation, s: Snake, a: number, dmg: number, range: number, kind: 'sting' | 'bigsting', speed = 700, spreadPoison = false, leaveSpike = false) {
  const v = speed * (1 + sim.ab(s, 'reload'));
  const hover = sim.inst(s, 'hover') && s.notBoostT >= 2 ? 1.35 : 1;
  const B = sim.B(s);
  sim.addProj({
    x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: (range * hover) / v, owner: s.id, kind, dmg,
    onHit: (o, x, y) => {
      sim.deal(s, o, dmg, 'skill', x, y);
      sim.poison(s, o, 3, B * 0.08);
      if (sim.inst(s, 'paralyze')) sim.slow(o, 1, 0.7);
      sim.events.push({ type: 'skillHit', x, y, kind: 'poison' });
      if (spreadPoison) {
        sim.fx('cloud', s, x, y, { r: 140 });
        sim.circle(s, x, y, 140, (p) => p.id !== o.id && sim.poison(s, p, 3, B * 0.1));
      }
    },
    onEnd: leaveSpike ? (x, y) => void sim.addZone({ x, y, r: 28, kind: 'stingers', life: 4, owner: s.id }) : undefined,
  });
}

function silk(sim: Simulation, s: Snake, B: number) {
  const R = sim.rangeMul(s);
  sim.fx('silk', s, s.x, s.y, { angle: s.angle });
  sim.addProj({
    x: s.x, y: s.y, vx: Math.cos(s.angle) * 800, vy: Math.sin(s.angle) * 800, life: (340 * R) / 800, owner: s.id, kind: 'silk',
    onHit: (o, x, y) => {
      sim.deal(s, o, B * 0.75, 'skill', x, y);
      sim.pullTo(o, s.x, s.y, 160);
      sim.events.push({ type: 'skillHit', x, y, kind: 'grab' });
      if (sim.inst(s, 'pounce')) pounce(sim, s, o);
    },
  });
}

function backJet(sim: Simulation, s: Snake, dmg: number, range: number, slowT: number) {
  const back = s.angle + PI;
  const tail = s.segN > 3 ? [s.segs[(s.segN - 1) * 2], s.segs[(s.segN - 1) * 2 + 1]] : [s.x, s.y];
  sim.fx('backjet', s, tail[0], tail[1], { angle: back, len: range, half: 0.87 });
  sim.cone(s, tail[0], tail[1], back, range, 0.87, (o, x, y) => {
    sim.deal(s, o, dmg, 'skill', x, y);
    sim.slow(o, slowT, 0.6);
    sim.events.push({ type: 'skillHit', x, y, kind: 'slow' });
  });
}

function heatBall(sim: Simulation, s: Snake, t: Snake, dps: number, dur: number, root: boolean, ult: Map<number, number> | null = null) {
  sim.addZone({ x: t.x, y: t.y, r: 60, kind: 'heat', life: dur, owner: s.id, dps, target: t.id, awake: root, ult });
  sim.fx('heat', s, t.x, t.y, { r: 60 });
}

function forestMul(sim: Simulation, s: Snake) {
  if (!sim.inst(s, 'forestlight')) return 1;
  return sim.map.theme === 'forest' ? 1.4 : 1.1;
}

// ---------- 보조 기술 ----------

export function castSub(sim: Simulation, s: Snake) {
  const sub = s.sub!;
  const B = sim.B(s);
  const R = sim.rangeMul(s, true);
  const D = sim.subDur(s);
  switch (sub.id) {
    // 계열 전용
    case 'thud':
      // 몸을 웅크렸다가 높이 날아올라 0.45초 떠 있다가 내리찍는다
      windup(sim, s, 0.12, 'thud', () => {
        startDash(sim, s, 'thud', sim.speedOf(s) * 0.7 * 0.45, 0.7, true);
        s.flyT = Math.max(s.flyT, s.dashT + 0.02);
        sim.fx('hop', s, s.x, s.y, { angle: s.angle, wk: 'jump', dur: s.dashT });
      });
      return;
    case 'playdead':
      s.deadT = 2 * D;
      sim.releaseGrab(s);
      sim.fx('playdead', s, s.x, s.y, { dur: s.deadT });
      return;
    case 'threat':
      sim.fx('threat', s, s.x, s.y, { r: 160 * R, dur: 0.9 });
      sim.circle(s, s.x, s.y, 160 * R, (o, x, y) => {
        sim.fear(o, 1 * D);
        sim.events.push({ type: 'skillHit', x, y, kind: 'fear' });
      });
      return;
    case 'compound':
      s.compoundT = 3 * D;
      sim.fx('compound', s, s.x, s.y, { r: 400 });
      return;
    case 'alarm':
      for (let k = 0; k < 2 + sim.tm(s, 'minion'); k++) sim.addMinion(s, 'wasp', 5 * D, B * 0.15);
      sim.fx('alarm', s, s.x, s.y, { r: 60 });
      sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'alarm', dur: 0.8 });
      return;
    case 'backplate':
      s.backT = 2 * D;
      sim.fx('backplate', s, s.x, s.y);
      return;
    case 'venomfang':
      s.fangT = 5 * D;
      sim.fx('fang', s, s.x, s.y);
      return;
    case 'backstep':
      s.dashAngle = s.angle + PI;
      startDash(sim, s, 'backstep', 200 * R, Math.max(1.2, 200 / Math.max(80, sim.speedOf(s))), false);
      s.ghostT = Math.max(s.ghostT, s.dashT);
      sim.fx('backstep', s, s.x, s.y, { angle: s.angle });
      return;
    case 'waggle': {
      const r = 300 * R;
      for (const f of sim.foods) {
        const d = dist(f.x, f.y, s.x, s.y);
        if (d < r && d > 1) ((f.x += (s.x - f.x) * 0.65), (f.y += (s.y - f.y) * 0.65));
      }
      sim.fx('waggle', s, s.x, s.y, { r });
      return;
    }
    case 'bitter':
      s.bitterT = 2 * D;
      sim.fx('bitter', s, s.x, s.y);
      return;
    // 공용
    case 'camo':
      s.hiddenT = 2 * D;
      s.nextMul = 1.5;
      sim.fx('camo', s, s.x, s.y, { dur: s.hiddenT });
      return;
    case 'hop': {
      // 날아올라 옆으로 급선회: 가까운 적의 반대쪽으로 꺾어 빠진다
      const foe = nearestEnemy(sim, s, 320);
      let side = Math.random() < 0.5 ? 1 : -1;
      if (foe) side = Math.sin(Math.atan2(foe.y - s.y, foe.x - s.x) - s.angle) > 0 ? -1 : 1;
      // 거의 직각으로 확 꺾어 멀리 빠진다
      s.dashAngle = s.angle + side * 0.5;
      startDash(sim, s, 'hop', 290 * R, 3.4, true);
      const turn = s.angle + side * 1.7;
      sim.later(s.dashT * 0.22, () => { if (s.dashT > 0) s.dashAngle = turn; });
      sim.later(s.dashT, () => { s.dashAngle = NaN; s.angle = turn; });
      sim.fx('hop', s, s.x, s.y, { angle: s.angle, wk: 'flit', dur: s.dashT, half: side });
      return;
    }
      return;
    case 'escape':
      sim.cleanse(s);
      s.escapeT = 1 * D;
      sim.fx('escape', s, s.x, s.y, { angle: s.angle });
      return;
    case 'curl':
      s.curlT = 1.5 * D;
      sim.fx('curl', s, s.x, s.y);
      return;
    case 'reserve':
      sim.heal(s, s.maxHp * 0.25 * D);
      sim.fx('heal', s, s.x, s.y);
      return;
    case 'spit':
      sim.addProj({
        x: s.x, y: s.y, vx: Math.cos(s.angle) * 700, vy: Math.sin(s.angle) * 700, life: (300 * R) / 700, owner: s.id, kind: 'spit',
        onHit: (o, x, y) => {
          sim.deal(s, o, B * 0.2, 'skill', x, y);
          sim.slow(o, 1.5 * D, 0.5);
          sim.events.push({ type: 'skillHit', x, y, kind: 'slow' });
        },
      });
      return;
    case 'bait': {
      // 앞쪽 양 대각선에 꽃 두 송이(내 몸에 가리지 않게)
      for (const sd of [-1, 1]) {
        const a = s.angle + sd * 0.75, d = 80 + s.r;
        const zx = s.x + Math.cos(a) * d, zy = s.y + Math.sin(a) * d;
        sim.addZone({ x: zx, y: zy, r: 30, kind: 'bait', life: 8, owner: s.id, dps: B * 0.2, mul: 1 * D });
        sim.fx('baitset', s, s.x, s.y, { x1: zx, y1: zy });
      }
      return;
    }
    case 'roll': {
      // 옆으로 데굴 구른다: 가까운 적의 반대쪽 옆으로
      const foe = nearestEnemy(sim, s, 320);
      let side = Math.random() < 0.5 ? 1 : -1;
      if (foe) side = Math.sin(Math.atan2(foe.y - s.y, foe.x - s.x) - s.angle) > 0 ? -1 : 1;
      // 머리만이 아니라 몸 전체(꼬리까지)가 옆으로 데굴 비켜난다. 구르는 동안 맞지 않는다
      const T = 0.32, dist = 150;
      const sa = s.angle + side * (Math.PI / 2);
      s.slideT = T;
      s.slideVx = (Math.cos(sa) * dist) / T;
      s.slideVy = (Math.sin(sa) * dist) / T;
      s.ghostT = Math.max(s.ghostT, T + 0.05);
      s.invulnT = Math.max(s.invulnT, T);
      s.nextBite = 1.5;
      s.nextBiteT = 3;
      sim.fx('roll', s, s.x, s.y, { angle: s.angle, wk: 'roll', dur: T, half: side });
      return;
    }
    case 'chirp':
      sim.fx('chirp', s, s.x, s.y, { r: 150 * R });
      sim.circle(s, s.x, s.y, 150 * R, (o, x, y) => {
        sim.stun(o, 0.5 * D);
        sim.events.push({ type: 'skillHit', x, y, kind: 'stun' });
      });
      return;
    case 'molt':
      s.decoyT = 2 * D;
      s.decoyX = s.x;
      s.decoyY = s.y;
      sim.addZone({ x: s.x, y: s.y, r: s.r * 2, kind: 'decoy', life: 2 * D, owner: s.id });
      sim.cleanse(s);
      sim.shove(s, s.angle, 180);
      s.ghostT = Math.max(s.ghostT, 0.25);
      sim.fx('decoy', s, s.x, s.y, { x1: s.decoyX, y1: s.decoyY });
      return;
  }
}

// ---------- 필살기 ----------

export function castUlt(sim: Simulation, s: Snake) {
  const B = sim.B(s);
  const aw = s.evo >= 3;
  const cap = new Map<number, number>();
  s.ultMap = cap;
  const fam = s.fam.id;
  const at = (d: number) => head(s, d);
  switch (fam) {
    case 'rhino': {
      const len = 520 * (1 + sim.ab(s, 'heavy'));
      sim.telegraph(s, { shape: 'line', x: s.x, y: s.y, r: 0, angle: s.angle, len, w: s.r * 4 }, () => {
        startDash(sim, s, 'ultcharge', len, 3.4, false, B * 2.5);
        sim.fx('charge', s, s.x, s.y, { angle: s.angle, len, awake: true, dur: s.dashT });
      });
      return;
    }
    case 'stag': {
      const [tx, ty] = at(90);
      sim.telegraph(s, { shape: 'circle', x: tx, y: ty, r: 70, angle: 0, len: 0, w: 0 }, () => {
        const t = pickFront(sim, s, 130, 0.8);
        sim.fx('grab', s, s.x, s.y, { angle: s.angle, r: 130 });
        if (t && sim.grab(s, t.o, 0.8, 'slam')) {
          s.grabDmg = B * 2.8;
          sim.stun(t.o, 0.8);
        }
      });
      return;
    }
    case 'mantis':
      sim.telegraph(s, { shape: 'circle', x: s.x, y: s.y, r: 140, angle: 0, len: 0, w: 0 }, () => {
        s.whirlT = 2;
        s.chanAcc = 0;
        s.reduceT = Math.max(s.reduceT, 2);
        s.reduceMul = 0.7;
        sim.fx('whirl', s, s.x, s.y, { r: 140, awake: aw });
      });
      return;
    case 'dragonfly': {
      const n = aw ? 5 : 3;
      const gap = aw ? 0.55 : 0.9;
      s.skyT = gap * n + 0.3;
      s.flyT = Math.max(s.flyT, s.skyT);
      s.invulnT = Math.max(s.invulnT, s.skyT);
      sim.fx('dive', s, s.x, s.y, { angle: s.angle, awake: true, wk: 'sky', dur: s.skyT });
      for (let k = 0; k < n; k++) {
        sim.later(gap * k, () => {
          if (!s.alive) return;
          const t = nearestEnemy(sim, s, 340);
          const [tx, ty] = t ? [t.x, t.y] : at(200);
          sim.telegraph(s, { shape: 'circle', x: tx, y: ty, r: 90, angle: 0, len: 0, w: 0 }, () => {
            const a = Math.atan2(ty - s.y, tx - s.x);
            const d = dist(tx, ty, s.x, s.y);
            s.angle = a;
            sim.shove(s, a, d);
            sim.fx('land', s, tx, ty, { r: 90, awake: true, wk: 'skydrop' });
            sim.circle(s, tx, ty, 90, (o, x, y) => (sim.deal(s, o, B * 0.9, 'ult', x, y, 'ult', cap), sim.hitstop(s, o, 0.07)));
          }, 0.45);
        });
      }
      return;
    }
    case 'wasp': {
      const [cx, cy] = at(160);
      sim.telegraph(s, { shape: 'circle', x: cx, y: cy, r: 200, angle: 0, len: 0, w: 0 }, () => {
        sim.addZone({ x: cx, y: cy, r: 200, kind: 'rain', life: 3, owner: s.id, dps: B * 0.22, awake: aw, ult: cap });
        sim.fx('rain', s, cx, cy, { r: 200, awake: aw });
      });
      return;
    }
    case 'stinkbug':
      sim.telegraph(s, { shape: 'circle', x: s.x, y: s.y, r: 220, angle: 0, len: 0, w: 0 }, () => {
        sim.fx('gasburst', s, s.x, s.y, { r: 220, awake: aw });
        sim.circle(s, s.x, s.y, 220, (o, x, y) => {
          sim.deal(s, o, B * 1.6, 'ult', x, y, 'ult', cap);
          sim.silence(o, 3);
          sim.events.push({ type: 'skillHit', x, y, kind: 'silence' });
        });
        sim.addZone({ x: s.x, y: s.y, r: aw ? 180 : 220, kind: 'gas', life: aw ? 4 : 3, owner: s.id, dps: B * 0.25, mul: 0.7, follow: aw });
      });
      return;
    case 'spider':
      sim.telegraph(s, { shape: 'circle', x: s.x, y: s.y, r: 200, angle: 0, len: 0, w: 0 }, () => {
        sim.fx('prison', s, s.x, s.y, { r: 200, awake: aw });
        sim.addZone({ x: s.x, y: s.y, r: 200, kind: 'prison', life: 2, owner: s.id });
        sim.circle(s, s.x, s.y, 200, (o, x, y) => {
          sim.deal(s, o, B * 0.8, 'ult', x, y, 'ult', cap);
          sim.root(o, 2 + sim.ab(s, 'tough'), s);
          if (aw || sim.inst(s, 'venom')) sim.poison(s, o, 2, B * 0.3);
          sim.events.push({ type: 'skillHit', x, y, kind: 'root' });
        });
      });
      return;
    case 'antlion':
      sim.telegraph(s, { shape: 'circle', x: s.x, y: s.y, r: 260, angle: 0, len: 0, w: 0 }, () => {
        sim.addZone({ x: s.x, y: s.y, r: 260, kind: 'pit', life: 4, owner: s.id, dps: B * 0.6, mul: 100 * (1 + sim.ab(s, 'fine')), awake: aw, ult: cap });
        sim.fx('hell', s, s.x, s.y, { r: 260, awake: aw });
      });
      return;
    case 'bee':
      sim.telegraph(s, { shape: 'circle', x: s.x, y: s.y, r: 320, angle: 0, len: 0, w: 0 }, () => {
        const raw = (B / s.fam.atk) * (1 + sim.ab(s, 'busy'));
        for (let k = 0; k < 10 + sim.tm(s, 'minion'); k++) {
          sim.addMinion(s, 'bee', 5 + sim.ab(s, 'swarm'), raw * 0.2, aw);
          sim.minions[sim.minions.length - 1].ult = cap;
        }
        sim.fx('summon', s, s.x, s.y, { r: 120, awake: true });
      });
      return;
    case 'firefly':
      sim.telegraph(s, { shape: 'circle', x: s.x, y: s.y, r: 300 * forestMul(sim, s), angle: 0, len: 0, w: 0 }, () => {
        const r = 300 * forestMul(sim, s);
        sim.fx('aurora', s, s.x, s.y, { r, awake: aw });
        sim.circle(s, s.x, s.y, r, (o, x, y) => {
          sim.deal(s, o, B * 0.8, 'ult', x, y, 'ult', cap);
          sim.blind(o, 2 + sim.ab(s, 'bright'));
          sim.markOn(o, 5 + sim.ab(s, 'bright'));
          if (aw || sim.inst(s, 'fakesignal')) sim.pullTo(o, s.x, s.y, 120);
          sim.events.push({ type: 'skillHit', x, y, kind: 'blind' });
        });
      });
      return;
  }
}

// ---------- 돌진·잡기 ----------

export function onDashHit(sim: Simulation, a: Snake, b: Snake, x: number, y: number) {
  const heavy = 1 + sim.ab(a, 'heavy');
  const pincer = sim.inst(a, 'pincer') ? 0.6 : 0;
  switch (a.dashKind) {
    case 'charge': {
      sim.deal(a, b, a.dashDmg, 'skill', x, y);
      const side = Math.atan2(b.y - a.y, b.x - a.x);
      sim.knock(b, side * 0.5 + a.angle * 0.5, 120 * heavy);
      if (pincer) sim.stun(b, pincer);
      sim.hitstop(a, b, 0.06);
      sim.events.push({ type: 'skillHit', x, y, kind: 'push' });
      break;
    }
    case 'ultcharge': {
      sim.deal(a, b, a.dashDmg, 'ult', x, y, 'ult', a.ultMap);
      sim.stun(b, 1 + pincer);
      const side = Math.atan2(b.y - a.y, b.x - a.x);
      sim.knock(b, side, 160 * heavy);
      sim.hitstop(a, b, 0.08);
      sim.events.push({ type: 'skillHit', x, y, kind: 'stun' });
      break;
    }
    case 'counter':
    case 'pounce':
      sim.deal(a, b, a.dashDmg, 'skill', x, y);
      sim.events.push({ type: 'skillHit', x, y, kind: 'cut' });
      a.dashT = 0.01;
      break;
    default:
      break;
  }
}

function onDashEnd(sim: Simulation, s: Snake, kind: string) {
  const B = sim.B(s);
  const aw = s.evo >= 3;
  switch (kind) {
    case 'charge':
      if (aw) {
        sim.fx('shock', s, s.x, s.y, { r: 110 });
        sim.circle(s, s.x, s.y, 110, (o, x, y) => sim.deal(s, o, B * 0.6 * sim.mainMul(s), 'skill', x, y));
      }
      break;
    case 'ultcharge':
      if (aw) {
        sim.fx('shock', s, s.x, s.y, { r: 180, awake: true });
        sim.circle(s, s.x, s.y, 180, (o, x, y) => sim.deal(s, o, B, 'ult', x, y, 'ult', s.ultMap));
      }
      break;
    case 'thud': {
      const R = sim.rangeMul(s, true);
      sim.fx('thud', s, s.x, s.y, { r: 140 * R });
      sim.circle(s, s.x, s.y, 140 * R, (o, x, y) => {
        sim.hitstop(s, o, 0.08);
        sim.deal(s, o, B * 0.5, 'skill', x, y);
        sim.stun(o, 0.5 * sim.subDur(s));
        sim.knock(o, Math.atan2(o.y - s.y, o.x - s.x), 80);
        sim.events.push({ type: 'skillHit', x, y, kind: 'stun' });
      });
      break;
    }
    case 'dive':
    case 'dive2': {
      const R = sim.rangeMul(s);
      const mul = kind === 'dive' ? 1 : 0.6;
      let hit = false;
      sim.fx('land', s, s.x, s.y, { r: 90 * R });
      sim.circle(s, s.x, s.y, 90 * R, (o, x, y) => {
        sim.deal(s, o, s.dashDmg * mul, 'skill', x, y);
        sim.hitstop(s, o, 0.06);
        hit = true;
      });
      s.acroT = 1;
      if (hit && sim.ab(s, 'ace') > 0) s.skillCd *= 1 - sim.ab(s, 'ace');
      if (kind === 'dive' && aw) {
        const d = s.dashDmg;
        sim.later(0.12, () => {
          if (!s.alive) return;
          startDash(sim, s, 'dive2', 150 * R, 3.2, true, d);
        });
      }
      break;
    }
    case 'backstep':
      s.dashAngle = NaN;
      break;
  }
}

export function counterDash(sim: Simulation, b: Snake, a: Snake) {
  const ang = Math.atan2(a.y - b.y, a.x - b.x);
  b.angle = ang;
  startDash(sim, b, 'counter', Math.min(160, dist(a.x, a.y, b.x, b.y) + 20), 2.6, false, sim.B(b) * 0.5);
  sim.events.push({ type: 'pop', snake: b.id, x: b.x, y: b.y - 30, text: '반격!', color: 0xff9a3a });
}

/** 깡충거미: 줄·그물에 걸린 적에게 뛰어 붙는다 */
export function pounce(sim: Simulation, s: Snake, o: Snake) {
  if (!s.alive || s.dashT > 0 || !sim.canAct(s)) return;
  const d = dist(o.x, o.y, s.x, s.y);
  if (d > 340) return;
  s.angle = Math.atan2(o.y - s.y, o.x - s.x);
  startDash(sim, s, 'pounce', Math.max(40, d - 10), 3, false, sim.B(s) * 0.5);
  sim.fx('hop', s, s.x, s.y, { angle: s.angle });
}

/** 늑대거미: 쓰러질 때 새끼거미가 흩어져 주변 적을 느리게 */
export function babies(sim: Simulation, s: Snake) {
  sim.fx('web', s, s.x, s.y, { r: 220 });
  sim.circle(s, s.x, s.y, 220, (o) => sim.slow(o, 2, 0.5));
}

/** 바위·벽에 부딪힘: 버티고 밀기(각성)에 밀려났으면 추가 피해 */
export function onRock(sim: Simulation, a: Snake) {
  if (a.pushedT <= 0 || a.pushedBy < 0) return;
  const by = sim.snakes[a.pushedBy];
  a.pushedT = 0;
  if (!by || by.evo < 3) return;
  sim.fx('shock', by, a.x, a.y, { r: 50 });
  sim.deal(by, a, by.chanDmg * 0.5, 'skill', a.x, a.y);
}

export function ambushStrike(sim: Simulation, s: Snake) {
  if (s.ambushT <= 0) return;
  s.ambushT = 0;
  s.ghostT = 0;
  s.hiddenT = 0;
  const R = sim.rangeMul(s);
  const aw = s.evo >= 3;
  sim.fx('ambush', s, s.x, s.y, { r: 100 * R, awake: true });
  sim.circle(s, s.x, s.y, 100 * R, (o, x, y) => {
    sim.deal(s, o, s.chanDmg * 1.8, 'skill', x, y);
    if (aw) (sim.stun(o, 1), sim.events.push({ type: 'skillHit', x, y, kind: 'stun' }));
  });
}

// ---------- 매 틱 ----------

export function tickSkills(sim: Simulation, s: Snake, dt: number) {
  s.pushedT = Math.max(0, s.pushedT - dt);
  // 돌진
  if (s.dashT > 0) {
    s.dashT -= dt;
    if (s.dashKind === 'snatch') snatchTick(sim, s);
    if (s.dashT <= 0) {
      const k = s.dashKind;
      s.dashKind = '';
      s.dashMul = 1;
      if (k !== 'backstep') s.dashAngle = NaN;
      onDashEnd(sim, s, k);
    }
  }
  if (s.flyT > 0 && s.skyT <= 0) s.flyT = Math.max(0, s.flyT - dt);
  if (s.skyT > 0) {
    s.skyT -= dt;
    if (s.skyT <= 0) s.flyT = 0;
  }
  // 잡기
  if (s.grabTarget >= 0) grabTick(sim, s, dt);
  // 채널 기술
  if (s.chanT > 0) {
    s.chanT -= dt;
    s.chanAcc -= dt;
    const R = sim.rangeMul(s);
    if (s.stunT > 0 || s.grabbedBy >= 0) s.chanT = 0;
    else if (s.chanAcc <= 0) {
      switch (s.chanKind) {
        case 'push': {
          s.chanAcc = 0.25;
          const heavy = 1 + sim.ab(s, 'heavy');
          sim.cone(s, s.x, s.y, s.angle, 100 * R, 0.7, (o, x, y) => {
            sim.deal(s, o, s.chanDmg * 0.1, 'skill', x, y);
            sim.knock(o, s.angle, 40 * heavy);
            o.pushedBy = s.id;
            o.pushedT = 0.5;
          });
          break;
        }
        case 'combo':
          s.chanAcc = 0.15;
          if (s.chanN < 3) comboHit(sim, s);
          break;
        case 'circle': {
          s.chanAcc = 0.3;
          sim.circle(s, s.x, s.y, 110 * R, (o, x, y) => {
            sim.deal(s, o, s.chanDmg * 0.25, 'skill', x, y);
            if (s.evo >= 3) sim.slow(o, 0.5, 0.7);
            sim.events.push({ type: 'skillHit', x, y, kind: 'cut' });
          });
          break;
        }
        case 'burst':
          s.chanAcc = 0.15;
          sting(sim, s, s.angle, s.chanDmg * 0.35, 380 * R, 'sting');
          sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'shot', dur: 0.13 });
          s.chanN++;
          break;
      }
    }
    if (s.chanT <= 0) s.chanKind = '';
  }
  // 덫줄
  if (s.trailT > 0) {
    s.trailT -= dt;
    s.chanAcc2 -= dt;
    if (s.chanAcc2 <= 0) {
      s.chanAcc2 = 0.08;
      const ti = Math.min(s.segN - 1, 3);
      sim.addZone({ x: s.segs[ti * 2], y: s.segs[ti * 2 + 1], r: 26, kind: 'silk', life: 3, owner: s.id, dps: sim.B(s) * 0.35, mul: 0.5, awake: s.trailAwake, hits: s.trailHits });
    }
  }
  // 천 개의 낫
  if (s.whirlT > 0) {
    s.whirlT -= dt;
    s.chanAcc -= dt;
    if (s.chanAcc <= 0) {
      s.chanAcc = 0.25;
      const B = sim.B(s);
      sim.circle(s, s.x, s.y, 140, (o, x, y) => {
        sim.deal(s, o, B * 0.3, 'ult', x, y, 'ult', s.ultMap);
        sim.events.push({ type: 'skillHit', x, y, kind: 'cut' });
      });
    }
    if (s.whirlT <= 0 && s.evo >= 3) s.skillCd = 0;
  }
  // 숨어 기다리기
  if (s.ambushT > 0) {
    s.ambushT -= dt;
    const R = sim.rangeMul(s);
    let near = false;
    for (const o of sim.snakes) {
      if (o.id === s.id || !sim.hittable(o)) continue;
      if (dist(o.x, o.y, s.x, s.y) < 100 * R + o.r) {
        near = true;
        break;
      }
    }
    if (near || s.ambushT <= 0) {
      s.ambushT = 0.001;
      ambushStrike(sim, s);
    }
  }
  if (s.isBoss) return;
  // 본능: 수액 자리싸움(다가온 적 밀어냄), 붕붕 진동
  if (sim.inst(s, 'sap') && s.sapCd <= 0 && sim.nearBigFood(s)) {
    s.sapCd = 1;
    pushHeads(sim, s, s.r + 70, 60);
  }
  if (sim.inst(s, 'buzz') && s.boosting && s.buzzCd <= 0) {
    s.buzzCd = 0.5;
    pushHeads(sim, s, s.r + 55, 45);
  }
  // 뒤로 뿜기(각성): 질주하는 동안 자동으로 뿜는다
  if (s.fam.id === 'stinkbug' && s.form.id === 'backjet' && s.evo >= 3 && s.boosting) {
    s.autoCd -= dt;
    if (s.autoCd <= 0) {
      s.autoCd = 1.2;
      backJet(sim, s, sim.B(s) * 0.4, 120 * sim.rangeMul(s), 1);
    }
  }
}

function pushHeads(sim: Simulation, s: Snake, r: number, d: number) {
  for (const o of sim.snakes) {
    if (o.id === s.id || !sim.hittable(o)) continue;
    if (dist(o.x, o.y, s.x, s.y) < r + o.r) sim.knock(o, Math.atan2(o.y - s.y, o.x - s.x), d);
  }
}

/** 낚아채기: 줄 위의 적은 내 앞으로 끌려와 잠깐 기절, 먹이는 내 입으로 빨려 온다 */
function snatchPull(sim: Simulation, s: Snake, a: number, L: number, B: number) {
  const fx0 = s.x + Math.cos(a) * (s.r * 2 + 26), fy0 = s.y + Math.sin(a) * (s.r * 2 + 26);
  let n = 0;
  sim.line(s, s.x, s.y, a, L, 46, 3, (o, x, y) => {
    sim.deal(s, o, B * 0.8, 'skill', x, y);
    sim.events.push({ type: 'skillHit', x, y, kind: 'grab' });
    sim.pullTo(o, fx0, fy0, Math.hypot(fx0 - o.x, fy0 - o.y) + 40);
    sim.stun(o, s.evo >= 3 ? 0.6 : 0.3);
    sim.fx('lifted', o, o.x, o.y, { angle: a + PI, wk: 'yank', dur: 0.35, x1: s.x, y1: s.y });
    if (n++ === 0) sim.hitstop(s, o, 0.06);
  });
  const ux = Math.cos(a), uy = Math.sin(a);
  for (const f of sim.foods) {
    const dx = f.x - s.x, dy = f.y - s.y;
    const t = dx * ux + dy * uy;
    if (t < 0 || t > L || Math.abs(-dx * uy + dy * ux) > 46) continue;
    f.x = s.x + ux * 4;
    f.y = s.y + uy * 4;
  }
  sim.fx('snatch', s, s.x, s.y, { angle: a, len: L, wk: 'pull', dur: 0.35 });
}

function snatchTick(sim: Simulation, s: Snake) {
  // 지나가는 길의 적을 낚고, 작은 먹이는 바로 먹는다
  for (const o of sim.snakes) {
    if (o.id === s.id || s.dashHits.has(o.id) || !sim.hittable(o)) continue;
    for (let i = 0; i < o.segN; i += 2) {
      if (dist(o.segs[i * 2], o.segs[i * 2 + 1], s.x, s.y) < 30 + o.r + s.r) {
        s.dashHits.add(o.id);
        sim.deal(s, o, s.dashDmg * 0.8, 'skill', o.segs[i * 2], o.segs[i * 2 + 1]);
        sim.events.push({ type: 'skillHit', x: o.segs[i * 2], y: o.segs[i * 2 + 1], kind: 'grab' });
        // 첫 표적을 다리로 낚아 내 앞으로 끌어온다(내가 딸려가지 않게 돌진은 멈춘다)
        if (s.dashHits.size === 1) {
          s.dashT = 0.01;
          s.flyT = Math.max(s.flyT, 0.3);
          const fx = s.x + Math.cos(s.angle) * (s.r * 2 + 24), fy = s.y + Math.sin(s.angle) * (s.r * 2 + 24);
          const far = Math.hypot(fx - o.x, fy - o.y);
          sim.pullTo(o, fx, fy, far + 40);
          sim.stun(o, s.evo >= 3 ? 0.6 : 0.25);
          sim.fx('lifted', o, o.x, o.y, { angle: s.angle, wk: 'yank', dur: 0.35, x1: s.x, y1: s.y });
          sim.fx('snatch', s, s.x, s.y, { angle: s.angle, wk: 'grab', x1: o.x, y1: o.y, dur: 0.35 });
          sim.hitstop(s, o, 0.06);
        }
        if (sim.ab(s, 'ace') > 0) s.skillCd *= 1 - sim.ab(s, 'ace');
        break;
      }
    }
  }
  for (let k = sim.foods.length - 1; k >= 0; k--) {
    const f = sim.foods[k];
    if ((f.kind === 0 || f.kind === 2) && dist(f.x, f.y, s.x, s.y) < 60) {
      sim.feed(s, f.kind === 2 && s.level > f.sub ? f.ep * CONFIG.remainsWeakMul : f.ep);
      sim.foods[k] = sim.foods[sim.foods.length - 1];
      sim.foods.pop();
    }
  }
  if (s.dashT <= 0) s.acroT = 1;
}

function grabTick(sim: Simulation, s: Snake, dt: number) {
  const o = sim.snakes[s.grabTarget];
  if (!o || !o.alive || o.grabbedBy !== s.id || s.stunT > 0 || !s.alive) {
    sim.releaseGrab(s);
    return;
  }
  s.grabT -= dt;
  if (s.grabKind === 'squeeze') {
    s.grabAcc -= dt;
    if (s.grabAcc <= 0) {
      s.grabAcc = 0.25;
      sim.deal(s, o, s.grabDmg * 0.6 * 0.25, 'skill', o.x, o.y);
    }
  }
  if (s.grabT > 0) return;
  const kind = s.grabKind;
  sim.releaseGrab(s);
  const aw = s.evo >= 3;
  if (kind === 'squeeze') {
    sim.deal(s, o, s.grabDmg * (aw ? 1.2 : 0.5), 'skill', o.x, o.y);
    sim.fx('scissor', s, o.x, o.y, { angle: s.angle, r: 40 });
  } else if (kind === 'throw') {
    const B = s.grabDmg;
    // 머리 위로 넘겨 뒤로 던진다: 날아가는 동안은 몸에 부딪히지 않는다
    sim.deal(s, o, B * 0.8, 'skill', o.x, o.y);
    sim.stun(o, 0.4);
    sim.knock(o, s.angle + PI, 260);
    o.flyT = Math.max(o.flyT, 0.5);
    sim.fx('throw', s, o.x, o.y, { angle: s.angle + PI, len: 260 });
    sim.fx('lifted', o, o.x, o.y, { angle: s.angle + PI, wk: 'tossed', dur: 0.5 });
    sim.fx('lifted', s, s.x, s.y, { angle: s.angle, wk: 'fling', dur: 0.4 });
    sim.hitstop(s, o, 0.05);
    if (aw)
      sim.later(0.4, () => {
        if (!o.alive) return;
        let bumped = false;
        sim.circle(s, o.x, o.y, 70, (p, x, y) => {
          if (p.id === o.id) return;
          bumped = true;
          sim.deal(s, p, B * 0.5, 'skill', x, y);
        });
        if (bumped) (sim.deal(s, o, B * 0.5, 'skill', o.x, o.y), sim.fx('shock', s, o.x, o.y, { r: 70 }));
      });
  } else if (kind === 'slam') {
    sim.fx('slam', s, o.x, o.y, { r: aw ? 120 : 60, awake: aw });
    sim.deal(s, o, s.grabDmg, 'ult', o.x, o.y, 'ult', s.ultMap);
    sim.stun(o, 0.5);
    if (aw) sim.circle(s, o.x, o.y, 120, (p, x, y) => p.id !== o.id && sim.deal(s, p, sim.B(s) * 0.8, 'ult', x, y, 'ult', s.ultMap));
  }
}

// ---------- 장판 ----------

export function updateZones(sim: Simulation, dt: number) {
  for (let k = sim.zones.length - 1; k >= 0; k--) {
    const z = sim.zones[k];
    if (!z) continue;
    z.life -= dt;
    const owner = sim.snakes[z.owner];
    if (z.follow) {
      if (!owner.alive) z.life = 0;
      else ((z.x = owner.x), (z.y = owner.y));
    }
    if (z.target >= 0) {
      const t = sim.snakes[z.target];
      if (!t || !t.alive) z.life = 0;
      else ((z.x = t.x), (z.y = t.y));
    }
    if (z.r1 !== z.r && z.max > 0) z.r = z.r + (z.r1 - z.r) * Math.min(1, dt / Math.max(0.1, z.life));
    let consumed = false;
    z.acc -= dt;
    const tick = z.acc <= 0;
    switch (z.kind) {
      case 'gas':
      case 'blade':
      case 'rain':
        if (!tick) break;
        z.acc = z.kind === 'rain' ? 0.3 : 0.25;
        sim.forEachHit(owner, (o, _i, x, y) => dist(x, y, z.x, z.y) < z.r + o.r * 0.5, (o, x, y) => {
          if (z.kind === 'rain') {
            sim.deal(owner, o, z.dps, 'ult', x, y, 'ult', z.ult);
            sim.poison(owner, o, 3, sim.B(owner) * 0.1 * (z.awake ? 2 : 1));
          } else {
            sim.deal(owner, o, z.dps * z.acc, z.kind === 'gas' ? 'poison' : 'skill', x, y, 'skill', z.ult, false);
            if (z.kind === 'gas') sim.slow(o, 0.5, z.mul);
          }
        });
        break;
      case 'web':
        for (const o of sim.snakes) {
          if (o.id === z.owner || !sim.hittable(o)) continue;
          if (dist(o.x, o.y, z.x, z.y) < z.r) {
            sim.root(o, 1.5 + sim.ab(owner, 'tough'), owner);
            sim.deal(owner, o, z.dps, 'skill', o.x, o.y);
            if (sim.inst(owner, 'venom')) sim.poison(owner, o, 1.2 + sim.ab(owner, 'tough'), sim.B(owner) * 0.25);
            if (sim.inst(owner, 'rebuild')) owner.skillCd *= 0.5;
            if (sim.ab(owner, 'sense') > 0) owner.senseT = 2;
            sim.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: 'root' });
            consumed = true;
            break;
          }
        }
        break;
      case 'silk':
        for (const o of sim.snakes) {
          if (o.id === z.owner || z.hits.has(o.id) || !sim.hittable(o)) continue;
          if (dist(o.x, o.y, z.x, z.y) < z.r + o.r) {
            z.hits.add(o.id);
            sim.deal(owner, o, z.dps, 'skill', o.x, o.y);
            if (z.awake) sim.root(o, 1 + sim.ab(owner, 'tough'), owner);
            else sim.slow(o, 1.5, z.mul);
            if (sim.inst(owner, 'venom') && z.awake) sim.poison(owner, o, 1, sim.B(owner) * 0.25);
            sim.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: z.awake ? 'root' : 'slow' });
          }
        }
        break;
      case 'pit': {
        for (const o of sim.snakes) {
          if (o.id === z.owner || !sim.hittable(o)) continue;
          const d = dist(o.x, o.y, z.x, z.y);
          if (d > z.r) continue;
          sim.knock(o, Math.atan2(z.y - o.y, z.x - o.x), z.mul * dt * (o.isBoss ? 1 : 1.2));
          sim.slow(o, 0.2, 0.7); // 모래에 발이 빠진다
          if (d < 45) {
            if (tick) sim.deal(owner, o, z.dps * 0.25, z.ult ? 'ult' : 'skill', o.x, o.y, 'skill', z.ult);
            if (z.awake && !z.hits.has(o.id)) {
              z.hits.add(o.id);
              if (z.ult) sim.stun(o, 1);
              else sim.deal(owner, o, sim.B(owner), 'skill', o.x, o.y);
              sim.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: z.ult ? 'stun' : 'cut' });
            }
          }
        }
        if (tick) z.acc = 0.25;
        break;
      }
      case 'honey':
        if (owner.alive && dist(owner.x, owner.y, z.x, z.y) < z.r) sim.heal(owner, owner.maxHp * 0.04 * dt * sim.tm(owner, 'heal'));
        if (z.awake) for (const o of sim.snakes) if (o.id !== z.owner && sim.hittable(o) && dist(o.x, o.y, z.x, z.y) < z.r) sim.slow(o, 0.3, z.mul);
        break;
      case 'stingers':
        for (const o of sim.snakes) {
          if (o.id === z.owner || z.hits.has(o.id) || !sim.hittable(o)) continue;
          if (dist(o.x, o.y, z.x, z.y) < z.r + o.r) {
            z.hits.add(o.id);
            sim.poison(owner, o, 3, sim.B(owner) * 0.1);
            sim.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: 'poison' });
          }
        }
        break;
      case 'bait':
        for (const o of sim.snakes) {
          if (o.id === z.owner || !sim.hittable(o)) continue;
          if (dist(o.x, o.y, z.x, z.y) < z.r + o.r) {
            sim.root(o, z.mul, owner);
            sim.deal(owner, o, z.dps, 'skill', o.x, o.y);
            sim.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: 'root' });
            consumed = true;
            break;
          }
        }
        break;
      case 'lantern':
        if (!tick) break;
        z.acc = 0.5;
        for (const f of sim.foods) {
          const d = dist(f.x, f.y, z.x, z.y);
          if (d < z.r && d > 1) ((f.x += (z.x - f.x) * 0.45), (f.y += (z.y - f.y) * 0.45));
        }
        for (const o of sim.snakes) {
          if (o.id === z.owner || !sim.hittable(o)) continue;
          if (dist(o.x, o.y, z.x, z.y) < z.r) {
            sim.slow(o, 0.5, 0.6);
            if (z.awake) sim.pullTo(o, z.x, z.y, 25);
          }
        }
        break;
      case 'heat': {
        const t = sim.snakes[z.target];
        if (!tick || !t) break;
        z.acc = 0.3;
        sim.deal(owner, t, z.dps * 0.3, z.ult ? 'ult' : 'minion', t.x, t.y, 'skill', z.ult, false);
        if (z.awake) sim.root(t, 0.35);
        else sim.slow(t, 0.4, 0.7);
        break;
      }
    }
    if (consumed || z.life <= 0) {
      const idx = sim.zones.indexOf(z);
      if (idx >= 0) sim.zones.splice(idx, 1);
    }
  }
}

// ---------- 부른 벌 ----------

export function updateMinions(sim: Simulation, dt: number) {
  for (let k = sim.minions.length - 1; k >= 0; k--) {
    const m = sim.minions[k];
    if (!m) continue;
    m.life -= dt;
    const owner = sim.snakes[m.owner];
    if (!owner.alive || m.life <= 0 || m.hp <= 0) {
      const idx = sim.minions.indexOf(m);
      if (idx >= 0) sim.minions.splice(idx, 1);
      continue;
    }
    // 표적: 0.5초마다 주인 근처의 가까운 적. 벌 떼는 여러 적을 나눠 쫓는다
    m.acc -= dt;
    let t = m.target >= 0 ? sim.snakes[m.target] : null;
    if (!t || !sim.hittable(t) || t.hiddenT > 0 || m.acc <= -0.5) {
      m.acc = Math.max(m.acc, 0);
      const taken = new Map<number, number>();
      for (const o of sim.minions) if (o !== m && o.owner === m.owner && o.target >= 0) taken.set(o.target, (taken.get(o.target) ?? 0) + 1);
      let best: Snake | null = null, bv = Infinity;
      for (const o of sim.snakes) {
        if (o.id === m.owner || !sim.hittable(o) || o.hiddenT > 0) continue;
        const d = dist(o.x, o.y, owner.x, owner.y);
        if (d > 420) continue;
        const v = d + (taken.get(o.id) ?? 0) * 140;
        if (v < bv) ((bv = v), (best = o));
      }
      t = best;
      m.target = best ? best.id : -1;
    }
    let tx = owner.x + Math.cos(sim.time * 3 + k) * 60, ty = owner.y + Math.sin(sim.time * 3 + k) * 60;
    if (t) ((tx = t.x + Math.cos(sim.time * 5 + k * 2) * (t.r + 12)), (ty = t.y + Math.sin(sim.time * 5 + k * 2) * (t.r + 12)));
    const a = Math.atan2(ty - m.y, tx - m.x);
    const d = dist(tx, ty, m.x, m.y);
    const v = Math.min(d, m.speed * dt);
    m.x += Math.cos(a) * v;
    m.y += Math.sin(a) * v;
    m.angle = a;
    if (t && dist(m.x, m.y, t.x, t.y) < t.r + 30) {
      if (m.acc <= 0) {
        m.acc = 0.25;
        sim.deal(owner, t, m.dps * 0.25, m.ult ? 'ult' : 'minion', m.x, m.y, 'skill', m.ult, false);
        if (m.heat) sim.slow(t, 0.3, 0.7);
      }
      // 적이 머리로 벌을 물면 벌이 다친다
      m.hp -= dt * 4;
    }
  }
}

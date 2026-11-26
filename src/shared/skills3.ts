// 3판에서 새로 만든 기술 29개 + 개미 계열 특성 '일개미 행렬'.
// 화면 연출(fx)은 도감 3판 연출과 같은 이름·값으로 보내 몸 동작이 그대로 이어진다.
import { CONFIG } from './config';
import type { Minion, Simulation, Snake, Zone } from './sim';
import { dist, head, nearestEnemy, pickFront, startDash, windup } from './skills';
import { datan2, dcos, dsin } from './dmath';

const PI = Math.PI;
const hitFx = (sim: Simulation, x: number, y: number, kind: 'cut' | 'stun' | 'push' | 'slow' | 'root' | 'blind' | 'mark' | 'fear' | 'silence' | 'grab' | 'poison' | 'confuse' | 'charm' | 'itch') =>
  sim.events.push({ type: 'skillHit', x, y, kind });

/** 몸 동작 신호(렌더러 motion) */
const pose = (sim: Simulation, s: Snake, wk: string, dur: number, x = s.x, y = s.y) => sim.fx('lifted', s, x, y, { angle: s.angle, wk, dur });

export function castNew(sim: Simulation, s: Snake, id: string) {
  const B = sim.B(s) * sim.mainMul(s) * (s.prayArmed ? 1.5 : 1);
  const R = sim.rangeMul(s);
  const D = sim.subDur(s);
  const aw = s.evo >= 3;
  switch (id) {
    // ================= 지네 =================
    case 'fangstab': {
      // 앞몸을 움츠렸다가 머리를 화살처럼 튕겨 독턱으로 찌른다
      const stab = () => {
        pose(sim, s, 'fang', 0.3);
        startDash(sim, s, 'fangstab', 70 * R, 3.2);
        const [hx, hy] = head(s, 14);
        sim.fx('fangstab', s, hx, hy, { angle: s.angle, len: 150 * R });
        let first = true;
        sim.line(s, s.x, s.y, s.angle, 150 * R, 40, 2, (o, x, y) => {
          sim.deal(s, o, B, 'skill', x, y);
          sim.poison(s, o, 3, B * 0.12 * (1 + sim.ab(s, 'venomjaw')));
          hitFx(sim, x, y, 'poison');
          if (first) ((first = false), sim.hitstop(s, o, 0.05));
        });
      };
      windup(sim, s, 0.18, 'fang', () => {
        stab();
        if (aw) sim.later(0.3, () => s.alive && stab());
      });
      return;
    }
    case 'coil': {
      // 1.5초 똬리: 받는 피해 −70%, 나를 문 적은 중독. 풀릴 때 주변을 밀어낸다(각성: 더 멀리 + 0.6초 기절)
      const T = 1.5 * D;
      s.coilT = T;
      s.coilPoison = true;
      pose(sim, s, 'curl', T);
      sim.later(0.2, () => sim.fx('coil', s, s.x, s.y, { r: 70 }));
      sim.later(T, () => {
        if (!s.alive) return;
        sim.fx('shock', s, s.x, s.y, { r: 120 });
        sim.circle(s, s.x, s.y, 120, (o, x, y) => (sim.knock(o, datan2(o.y - s.y, o.x - s.x), aw ? 180 : 130), aw && sim.stun(o, 0.6), hitFx(sim, x, y, 'push')));
        s.rallyT = Math.max(s.rallyT, CONFIG.rallyTime); // 풀리자마자 빠져나간다
      });
      return;
    }
    case 'wrap': {
      // 가까운 적 하나를 긴 몸으로 감아 2초 묶고 압착. 감는 동안 나도 느려진다
      const t = pickFront(sim, s, 130 * R + s.r, 1.2)?.o ?? nearestEnemy(sim, s, 120 * R);
      if (!t) {
        sim.fx('coil', s, ...head(s, 50), { r: 40 });
        return;
      }
      const T = 2 + sim.ab(s, 'longbody');
      s.angle = datan2(t.y - s.y, t.x - s.x);
      startDash(sim, s, 'wrap', Math.max(10, Math.min(40, dist(t.x, t.y, s.x, s.y) - s.r * 2)), 3);
      sim.root(t, T, s);
      sim.slow(s, T, 0.6);
      sim.fx('lifted', s, t.x, t.y, { angle: s.angle, wk: 'wrap', dur: T + 0.1 });
      hitFx(sim, t.x, t.y, 'root');
      for (let k = 0; k < 3; k++)
        sim.later(0.25 + k * 0.7 * (T / 2), () => {
          if (!s.alive || !t.alive) return;
          sim.fx('coil', s, t.x, t.y, { r: 55 - k * 7 });
          sim.deal(s, t, B * 0.35, 'skill', t.x, t.y);
          hitFx(sim, t.x, t.y, 'cut');
          if (aw && k === 0) sim.circle(s, t.x, t.y, 110, (o) => o.id !== t.id && sim.knock(o, datan2(o.y - t.y, o.x - t.x), 110));
        });
      return;
    }
    case 'legwhip': {
      // 긴 다리들로 앞쪽을 빠르게 두세 번 후려친다
      pose(sim, s, 'whip', 0.5);
      const n = aw ? 3 : 2;
      for (let k = 0; k < n; k++)
        sim.later(0.05 + k * 0.23, () => {
          if (!s.alive) return;
          const a = s.angle + (k % 2 ? 0.2 : -0.2);
          const [hx, hy] = head(s, 10);
          sim.fx('legwhip', s, hx, hy, { angle: a, r: 150 * R, half: 0.9 });
          sim.cone(s, hx, hy, a, 150 * R, 0.9, (o, x, y) => (sim.deal(s, o, B * 0.42, 'skill', x, y), hitFx(sim, x, y, 'cut')));
        });
      return;
    }
    case 'rear': {
      // 머리를 높이 치켜들었다가 앞으로 덮쳐 적을 잡아 1초 들어 올린다
      windup(sim, s, 0.38, 'rear', () => {
        pose(sim, s, 'pounce', 0.32);
        startDash(sim, s, 'rear', 100 * R, 3.2);
        sim.later(0.22, () => {
          if (!s.alive) return;
          const [lx, ly] = head(s, 20);
          sim.fx('land', s, lx, ly, { angle: s.angle, r: 80 });
          let best: Snake | null = null, bd = Infinity; // 범위 판정(반지름+몸 두께) 안이면 가장 가까운 적
          sim.circle(s, lx, ly, 90 * R, (o, x, y) => {
            const d = dist(x, y, lx, ly);
            if (d < bd) ((bd = d), (best = o));
          });
          const t = best as Snake | null;
          if (!t) return;
          sim.deal(s, t, B * 1.2, 'skill', t.x, t.y);
          sim.stun(t, 1);
          sim.fx('lifted', t, t.x, t.y, { angle: s.angle, wk: 'held', dur: 1 });
          hitFx(sim, t.x, t.y, 'stun');
          sim.hitstop(s, t, 0.07);
          if (aw)
            sim.later(1, () => {
              if (!t.alive) return;
              sim.fx('slam', s, t.x, t.y, { r: 100, awake: true });
              sim.circle(s, t.x, t.y, 100, (o, x, y) => sim.deal(s, o, B * 0.6, 'skill', x, y));
            });
        });
      });
      return;
    }
    case 'spray': {
      // 몸을 말며 옆구리에서 독한 액체를 뿜는다: 주변 2초 느려짐 + 중독
      s.coilT = Math.max(s.coilT, 1);
      pose(sim, s, 'spray', 1.1);
      sim.later(0.25, () => {
        if (!s.alive) return;
        const r = 130 * R;
        sim.fx('stain', s, s.x, s.y, { r });
        sim.circle(s, s.x, s.y, r, (o, x, y) => {
          sim.deal(s, o, B * 0.3, 'skill', x, y);
          sim.slow(o, 2, 0.55);
          sim.poison(s, o, 3, B * 0.1);
          hitFx(sim, x, y, 'slow');
        });
        if (aw) sim.addZone({ x: s.x, y: s.y, r, kind: 'gas', life: 3, owner: s.id, dps: B * 0.2, mul: 0.6 });
      });
      return;
    }
    case 'glowspit': {
      // 빛나는 점액 덩이를 뱉는다: 맞은 적 2초 느려짐 + 빛나서 숨지 못함
      pose(sim, s, 'spit', 0.45);
      sim.later(0.18, () => {
        if (!s.alive) return;
        const v = 620;
        sim.addProj({
          x: s.x, y: s.y, vx: dcos(s.angle) * v, vy: dsin(s.angle) * v, life: (280 * R) / v, owner: s.id, kind: 'glob',
          onHit: (o, x, y) => {
            sim.deal(s, o, B * 0.9, 'skill', x, y);
            sim.slow(o, 2, 0.55);
            sim.markOn(o, 2);
            o.glowT = Math.max(o.glowT, 2);
            o.hiddenT = 0;
            sim.fx('mudpot', s, x, y, { r: 50, x1: x, y1: y });
            hitFx(sim, x, y, 'slow');
            if (aw) sim.addZone({ x, y, r: 60, kind: 'silk', life: 3, owner: s.id, dps: B * 0.15, mul: 0.6 });
          },
        });
      });
      return;
    }
    // ================= 잠자리 =================
    case 'skip': {
      // 앞쪽 삼각형의 세 꼭짓점에 차례로 내려앉고, 세 번째 착지에서 삼각형 안 전체를 친다
      const a = s.angle, k = aw ? 1.4 : 1;
      const cx = s.x + dcos(a) * 135 * k * R, cy = s.y + dsin(a) * 135 * k * R;
      const rr = 85 * k * R;
      const pts = [a - (2 * PI) / 3, a + (2 * PI) / 3, a].map((t) => [cx + dcos(t) * rr, cy + dsin(t) * rr] as [number, number]);
      pts.forEach(([px, py], i) =>
        sim.later(i * 0.25, () => {
          if (!s.alive) return;
          s.dashAngle = datan2(py - s.y, px - s.x);
          startDash(sim, s, 'skip', Math.max(20, dist(px, py, s.x, s.y)), 4, true);
          sim.fx('hop', s, s.x, s.y, { angle: s.dashAngle, wk: 'jump', dur: s.dashT });
          sim.later(s.dashT, () => {
            if (!s.alive) return;
            sim.fx('land', s, px, py, { angle: a, r: 50 });
            sim.circle(s, px, py, 50, (o, x, y) => (sim.deal(s, o, B * 0.3, 'skill', x, y), hitFx(sim, x, y, 'cut')));
          });
        }),
      );
      sim.later(0.72, () => {
        s.dashAngle = NaN;
        if (!s.alive) return;
        sim.fx('trizone', s, cx, cy, { angle: a, r: rr });
        sim.forEachHit(s, (o, _i, x, y) => inTri(x, y, pts), (o, x, y) => {
          sim.deal(s, o, B * 0.9, 'skill', x, y);
          sim.stun(o, 0.3);
          hitFx(sim, x, y, 'stun');
        });
      });
      return;
    }
    // ================= 벌 =================
    case 'buzz': {
      // 1.5초 몸을 떨어 받는 피해 −25%, 주변 적을 계속 살짝 밀어낸다
      const T = 1.5 * D;
      s.reduceT = Math.max(s.reduceT, T);
      s.reduceMul = Math.min(s.reduceMul, 0.75);
      pose(sim, s, 'buzz', T);
      sim.fx('buzz', s, s.x, s.y, { r: 110 * R });
      for (let k = 0; k < 5; k++)
        sim.later(k * 0.3, () => {
          if (!s.alive) return;
          sim.circle(s, s.x, s.y, 110 * R, (o, x, y) => {
            sim.knock(o, datan2(o.y - s.y, o.x - s.x), 45);
            if (aw && k === 0) (sim.stun(o, 0.3), hitFx(sim, x, y, 'stun'));
            else hitFx(sim, x, y, 'push');
          });
        });
      return;
    }
    case 'mudpot': {
      // 진흙 덩이를 던져 맞은 적 1.5초 침묵 + 느려짐
      const t = nearestEnemy(sim, s, 320 * R) ?? null;
      pose(sim, s, 'lob', 0.4);
      const tx = t ? t.x : head(s, 200)[0], ty = t ? t.y : head(s, 200)[1];
      if (t) s.angle = datan2(t.y - s.y, t.x - s.x);
      sim.fx('mudpot', s, tx, ty, { r: 60, x1: s.x, y1: s.y });
      sim.later(0.36, () => {
        if (!s.alive) return;
        const x = t && t.alive ? t.x : tx, y = t && t.alive ? t.y : ty;
        sim.circle(s, x, y, 60, (o, hx, hy) => {
          sim.deal(s, o, B * 0.6, 'skill', hx, hy);
          sim.silence(o, 1.5);
          sim.slow(o, 1.5, 0.6);
          hitFx(sim, hx, hy, 'silence');
        });
        if (aw) sim.circle(s, x, y, 120, (o) => sim.slow(o, 1.5, 0.7));
      });
      return;
    }
    // ================= 개미 =================
    case 'acid': {
      // 배 끝에서 개미산 줄기: 맞은 적 3초 받는 피해 증가(표식)
      windup(sim, s, 0.16, 'acid', () => {
        pose(sim, s, 'acidshot', 0.3);
        const L = 260 * R;
        sim.fx('acid', s, ...head(s, 14), { angle: s.angle, len: L });
        sim.line(s, s.x, s.y, s.angle, L, 36, 3, (o, x, y) => {
          sim.deal(s, o, B * 0.9, 'skill', x, y);
          sim.markOn(o, 3);
          hitFx(sim, x, y, 'mark');
        });
        if (aw) {
          const [ex, ey] = head(s, L);
          sim.addZone({ x: ex, y: ey, r: 60, kind: 'gas', life: 2, owner: s.id, dps: B * 0.2, mul: 0.8 });
        }
      });
      return;
    }
    case 'burrow': {
      // 땅속으로 파고들어 0.75초 무적, 앞으로 160 가서 튀어나온다
      const T = 0.75;
      s.invulnT = Math.max(s.invulnT, T);
      s.ghostT = Math.max(s.ghostT, T);
      s.hiddenT = Math.max(s.hiddenT, T);
      sim.cleanse(s);
      pose(sim, s, 'dig', T);
      sim.fx('burrow', s, s.x, s.y, { r: 60 });
      const sp = Math.max(60, sim.speedOf(s));
      startDash(sim, s, 'burrow', 160, 160 / T / sp);
      sim.later(T, () => {
        if (!s.alive) return;
        pose(sim, s, 'emerge', 0.35);
        sim.fx('burrow', s, s.x, s.y, { r: 70 });
        if (aw) sim.circle(s, s.x, s.y, 100, (o, x, y) => (sim.knock(o, datan2(o.y - s.y, o.x - s.x), 120), hitFx(sim, x, y, 'push')));
      });
      return;
    }
    case 'antcall': {
      // 일개미 4마리(각성 6)가 3.5초 동안 가까운 적을 쫓아 문다
      pose(sim, s, 'call', 0.5);
      sim.fx('antcall', s, s.x, s.y, { r: 50 });
      const n = (aw ? 6 : 4) + sim.tm(s, 'minion');
      const life = 3.5 + sim.ab(s, 'colony');
      for (let k = 0; k < n; k++) sim.addMinion(s, 'ant', life, B * 0.1 * (1 + sim.ab(s, 'formic')), false, k);
      return;
    }
    case 'leafshield': {
      // 3초 동안 큰 잎을 들어 앞쪽 피해를 막는다
      const T = 3 * D;
      s.leafT = T;
      s.leafHeal = aw;
      pose(sim, s, 'leafshield', T);
      return;
    }
    case 'leapsting': {
      // 껑충 뛰어 앞의 적을 침으로 찔러 피해 + 4초 강한 중독
      const leap = (again: boolean) =>
        windup(sim, s, 0.16, 'thud', () => {
          startDash(sim, s, 'leap', 120 * R, 3, true);
          s.flyT = Math.max(s.flyT, s.dashT);
          sim.fx('hop', s, s.x, s.y, { angle: s.angle, wk: 'jump', dur: s.dashT });
          sim.later(s.dashT, () => {
            if (!s.alive) return;
            const [lx, ly] = head(s, 16);
            sim.fx('land', s, lx, ly, { angle: s.angle, r: 50 });
            sim.fx('fangstab', s, lx, ly, { angle: s.angle, len: 60 });
            let hit = false;
            sim.circle(s, lx, ly, 70 * R, (o, x, y) => {
              if (hit) return;
              hit = true;
              sim.deal(s, o, B * 1.1, 'skill', x, y);
              sim.poison(s, o, 4, B * 0.18);
              hitFx(sim, x, y, 'poison');
              sim.hitstop(s, o, 0.05);
            });
            if (hit && again) sim.later(0.25, () => s.alive && leap(false));
          });
        });
      leap(aw);
      return;
    }
    case 'firenest': {
      // 앞에 흙더미 둥지: 4초 동안 밟은 적은 매초 따끔 + 느려짐
      pose(sim, s, 'digpile', 0.5);
      const put = (a: number) => {
        const x = s.x + dcos(a) * 110 * R, y = s.y + dsin(a) * 110 * R;
        sim.later(0.25, () => {
          sim.fx('nest', s, x, y, { r: 100 * R });
          sim.addZone({ x, y, r: 100 * R, kind: 'firenest', life: 4, owner: s.id, dps: B * 0.3, mul: 0.65 });
        });
      };
      if (aw) (put(s.angle - 0.6), put(s.angle + 0.6));
      else put(s.angle);
      return;
    }
    // ================= 거미 =================
    case 'pounce': {
      // 큰 앞눈이 번쩍 → 앞의 적에게 뛰어 덮쳐 피해 + 0.8초 기절
      const leap = (again: boolean) =>
        windup(sim, s, 0.2, 'thud', () => {
          const t = pickFront(sim, s, 200 * R, 0.6)?.o;
          if (t) s.angle = datan2(t.y - s.y, t.x - s.x);
          const L = t ? Math.max(40, Math.min(200 * R, dist(t.x, t.y, s.x, s.y) - s.r)) : 130 * R;
          startDash(sim, s, 'leap', L, 3.2, true);
          s.flyT = Math.max(s.flyT, s.dashT);
          sim.fx('hop', s, s.x, s.y, { angle: s.angle, wk: 'jump', dur: s.dashT });
          sim.later(s.dashT, () => {
            if (!s.alive) return;
            const [lx, ly] = head(s, 16);
            sim.fx('land', s, lx, ly, { angle: s.angle, r: 60 });
            let hit = false;
            sim.circle(s, lx, ly, 70 * R, (o, x, y) => {
              if (hit) return;
              hit = true;
              sim.deal(s, o, B * 0.65, 'skill', x, y);
              sim.stun(o, 0.6);
              hitFx(sim, x, y, 'stun');
              sim.hitstop(s, o, 0.06);
            });
            if (hit && again) sim.later(0.3, () => s.alive && leap(false));
          });
        });
      leap(aw);
      return;
    }
    case 'babies': {
      // 등의 새끼거미를 흩뿌려 2초 동안 주변 적을 느리게 하고, 봇의 표적을 흐린다
      pose(sim, s, 'shake', 0.5);
      sim.later(0.1, () => {
        if (!s.alive) return;
        sim.fx('spiderlings', s, s.x, s.y, { r: 130 * R });
        sim.circle(s, s.x, s.y, 140 * R, (o, x, y) => (sim.deal(s, o, B * 0.4, 'skill', x, y), sim.slow(o, 2.5, 0.5), hitFx(sim, x, y, 'slow'))); // 밸런스: 새끼거미가 물어 피해 + 느려짐 2.5초
        s.decoyT = 2;
        s.decoyX = s.x;
        s.decoyY = s.y;
        s.hiddenT = Math.max(s.hiddenT, 1); // 새끼들 틈에 1초 숨는다
      });
      return;
    }
    // ================= 나비 =================
    case 'powder': {
      // 날개를 접었다 펴며 앞쪽에 반짝이 가루 구름 3초: 안의 적 지속 피해 + 혼란
      pose(sim, s, 'flapbig', 0.6);
      sim.later(0.18, () => {
        if (!s.alive) return;
        const k = aw ? 1.5 : 1;
        sim.fx('powder', s, ...head(s, 10), { angle: s.angle, r: 200 * R * k, half: 0.75 });
        const [zx, zy] = head(s, 110 * R * k);
        sim.addZone({ x: zx, y: zy, r: 105 * R * k, kind: 'powder', life: 3, owner: s.id, dps: B * 0.45, mul: 1.5 + sim.ab(s, 'scales') });
      });
      return;
    }
    case 'flutter': {
      // 1.5초 지그재그로 날며 몸 충돌 무시, 기술 피해 절반
      const T = 1.5 * D;
      s.flutterT = T;
      s.ghostT = Math.max(s.ghostT, T);
      sim.cleanse(s);
      pose(sim, s, 'flutter', T - 0.1);
      sim.fx('flutter', s, s.x, s.y, {});
      for (let k = 0; k < 4; k++)
        sim.later(k * 0.32, () => {
          if (!s.alive) return;
          s.dashAngle = s.angle + (k % 2 ? -0.9 : 0.9);
          startDash(sim, s, 'flutter', 45, 2.6);
        });
      sim.later(1.35, () => {
        s.dashAngle = NaN;
        if (aw && s.alive) {
          sim.fx('powder', s, s.x, s.y, { angle: s.angle, r: 90, half: 3.1 });
          sim.addZone({ x: s.x, y: s.y, r: 90, kind: 'powder', life: 3, owner: s.id, dps: B * 0.2, mul: 1.5 });
        }
      });
      return;
    }
    case 'charm': {
      // 앞의 적을 1.5초 동안 나비 쪽으로 천천히 걸어오게
      pose(sim, s, 'charmpose', 0.9);
      const T = 1.5 + sim.ab(s, 'scales');
      const list: Snake[] = [];
      const f = pickFront(sim, s, 300 * R, 0.7)?.o ?? nearestEnemy(sim, s, 260 * R);
      if (f) list.push(f);
      if (aw && f) {
        // 각성: 두 번째로 가까운 적도
        let best: Snake | null = null, bd = 300 * R;
        for (const o of sim.snakes)
          if (o.id !== s.id && o.id !== f.id && !o.isBoss && sim.hittable(o)) {
            const d = dist(o.x, o.y, s.x, s.y);
            if (d < bd) ((bd = d), (best = o));
          }
        if (best) list.push(best);
      }
      for (const t of list) {
        sim.charm(t, T, s);
        sim.fx('charm', s, t.x, t.y, { x1: s.x, y1: s.y });
        hitFx(sim, t.x, t.y, 'charm');
      }
      return;
    }
    case 'bitter': {
      // 3초 동안 나를 문 적이 피해의 50%(각성 75%)를 돌려받고 중독
      s.bitterT = 3 * D;
      s.bitterPoison = true;
      s.bitterMul = aw ? 0.75 : 0.5;
      pose(sim, s, 'bitterglow', 3 * D);
      sim.fx('bitter', s, s.x, s.y, { r: 70 });
      sim.later(0.3, () => s.alive && sim.fx('powder', s, s.x, s.y, { angle: s.angle, r: 90, half: 3.1 }));
      return;
    }
    case 'eyespot': {
      // 날개를 확 펼쳐 큰 눈알 무늬로 앞의 적들을 멈칫(기절) + 밀어내기
      pose(sim, s, 'eyeflash', 0.8);
      sim.later(0.1, () => {
        if (!s.alive) return;
        const [hx, hy] = head(s, 10);
        sim.fx('eyespot', s, hx, hy, { angle: s.angle, r: 170 * R });
        sim.cone(s, hx, hy, s.angle, 170 * R, 0.8, (o, x, y) => {
          sim.deal(s, o, B * 0.4, 'skill', x, y);
          sim.stun(o, aw ? 1 : 0.6);
          sim.knock(o, datan2(o.y - s.y, o.x - s.x), 130);
          hitFx(sim, x, y, 'stun');
        });
      });
      return;
    }
    case 'morpho': {
      // 날개로 빛을 반사해 앞쪽 부채꼴에 피해 + 눈부심
      pose(sim, s, 'flashwing', 0.45);
      sim.later(0.1, () => {
        if (!s.alive) return;
        const [hx, hy] = head(s, 10);
        sim.fx('morpho', s, hx, hy, { angle: s.angle, r: 200 * R, half: 0.7 });
        sim.cone(s, hx, hy, s.angle, 200 * R, 0.7, (o, x, y) => {
          sim.deal(s, o, B, 'skill', x, y);
          sim.blind(o, aw ? 1.5 : 1);
          hitFx(sim, x, y, 'blind');
        });
      });
      return;
    }
    case 'hairs': {
      // 앞쪽으로 독털을 흩뿌려 맞은 적 4초 가려움(지속 피해)
      pose(sim, s, 'shake', 0.45);
      sim.later(0.08, () => {
        if (!s.alive) return;
        const [hx, hy] = head(s, 10);
        sim.fx('hairs', s, hx, hy, { angle: s.angle, r: 190 * R, half: 0.6 });
        sim.cone(s, hx, hy, s.angle, 190 * R, 0.6, (o, x, y) => {
          sim.deal(s, o, B * 0.7, 'skill', x, y);
          sim.itch(o, 4, B * 0.18, s);
          hitFx(sim, x, y, 'itch');
        });
      });
      return;
    }
  }
}

export function castNewUlt(sim: Simulation, s: Snake, id: string) {
  const B = sim.B(s);
  const aw = s.evo >= 3;
  const cap = new Map<number, number>();
  s.ultMap = cap;
  switch (id) {
    // ---------- 사마귀 계열: 종마다 다른 필살기 ----------
    case 'riposte': {
      // 넓적배사마귀 '반격 자세': 2.5초 동안 받는 피해 −50%, 맞을 때마다 그 적을 바로 되벤다.
      // 끝나면 되벤 횟수만큼 커지는 큰 베기(각성: 기절 0.6초). 손맛: 맞아 주며 버티다 한 번에 터뜨림
      const T = 2.5;
      s.counterT = T;
      s.counterN = 0;
      s.counterCd = 0;
      s.reduceT = Math.max(s.reduceT, T);
      s.reduceMul = Math.min(s.reduceMul, 0.5);
      pose(sim, s, 'brace', T);
      sim.fx('riposte', s, s.x, s.y, { r: 120, dur: T, awake: aw });
      // 도발: 주변 적을 0.8초 홀려 나에게 덤비게 한다(덤비는 적을 되벤다)
      sim.circle(s, s.x, s.y, 220, (o, x, y) => (sim.charm(o, 0.8, s), hitFx(sim, x, y, 'charm')));
      sim.later(T, () => {
        if (!s.alive) return;
        const n = Math.min(4, s.counterN);
        const R = 150 + n * 15;
        sim.fx('reapslash', s, s.x, s.y, { r: R, awake: aw || n >= 3, n });
        sim.circle(s, s.x, s.y, R, (o, x, y) => {
          sim.deal(s, o, B * (0.9 + 0.3 * n), 'ult', x, y, 'ult', cap);
          sim.hitstop(s, o, 0.06 + n * 0.02);
          if (aw) (sim.stun(o, 0.6), hitFx(sim, x, y, 'stun'));
          else hitFx(sim, x, y, 'cut');
        });
        s.counterT = 0;
      });
      return;
    }
    case 'blinkstab': {
      // 좀사마귀 '번개 찌르기': 날아오른 채(맞지 않음) 0.3초마다 주변 적 뒤로 번개처럼 옮겨 다니며 찌른다.
      // 5번(각성 7번), 같은 적은 되도록 피해 여러 마리를 돈다. 손맛: 화면을 가로지르는 연속 찌르기
      const n = aw ? 7 : 5, gap = 0.3;
      const T = n * gap + 0.2;
      s.flyT = Math.max(s.flyT, T);
      s.skyT = Math.max(s.skyT, T);
      const hitN = new Map<number, number>();
      for (let k = 0; k < n; k++)
        sim.later(0.1 + k * gap, () => {
          if (!s.alive) return;
          let best: Snake | null = null, bs = Infinity;
          for (const o of sim.snakes) {
            if (o.id === s.id || !sim.hittable(o) || o.deadT > 0 || !o.alive) continue;
            const d = dist(o.x, o.y, s.x, s.y);
            if (d > 380) continue;
            const sc = d + (hitN.get(o.id) ?? 0) * 260; // 이미 찌른 적은 뒤로
            if (sc < bs) ((bs = sc), (best = o));
          }
          const x0 = s.x, y0 = s.y;
          if (!best) {
            sim.shove(s, s.angle, 140);
            sim.fx('blink', s, s.x, s.y, { x1: x0, y1: y0, angle: s.angle });
            return;
          }
          const o = best;
          hitN.set(o.id, (hitN.get(o.id) ?? 0) + 1);
          const a = datan2(o.y - s.y, o.x - s.x);
          const d = dist(o.x, o.y, s.x, s.y) + o.r + s.r + 18;
          s.angle = a;
          sim.shove(s, a, d);
          sim.fx('blink', s, s.x, s.y, { x1: x0, y1: y0, angle: a });
          sim.deal(s, o, B * 0.75, 'ult', o.x, o.y, 'ult', cap);
          sim.hitstop(s, o, 0.05);
          hitFx(sim, o.x, o.y, 'cut');
        });
      return;
    }
    case 'bloom': {
      // 난초사마귀 '꽃밭 유혹': 내 둘레에 꽃밭을 피워 2.5초 동안 안의 적을 홀려 나에게 끌어오고,
      // 끝날 때 가운데에서 꽃잎이 터지며 큰 피해 + 1초 묶기(각성: 터질 때 체력 회복).
      const R = 240, T = 2.5;
      sim.telegraph(s, { shape: 'circle', x: s.x, y: s.y, r: R, angle: 0, len: 0, w: 0 }, () => {
        sim.fx('bloom', s, s.x, s.y, { r: R, dur: T });
        for (let k = 0; k < 10; k++)
          sim.later(k * 0.25, () => {
            if (!s.alive) return;
            sim.circle(s, s.x, s.y, R, (o, x, y) => {
              sim.charm(o, 0.4, s);
              sim.deal(s, o, B * 0.08, 'ult', x, y, 'ult', cap); // 꽃잎에 베이는 작은 피해
              if (k % 3 === 0) hitFx(sim, x, y, 'charm');
            });
          });
        sim.later(T, () => {
          if (!s.alive) return;
          sim.fx('bloomburst', s, s.x, s.y, { r: 175, awake: aw });
          let hitN = 0;
          sim.circle(s, s.x, s.y, 175, (o, x, y) => {
            sim.deal(s, o, B * 1.9, 'ult', x, y, 'ult', cap);
            sim.root(o, 1, s);
            sim.hitstop(s, o, 0.08);
            hitFx(sim, x, y, 'root');
            hitN++;
          });
          if (aw && hitN) sim.heal(s, s.maxHp * 0.06 * Math.min(4, hitN));
        });
      });
      return;
    }
    case 'reap': {
      // 유령사마귀 '유령 처형': 마른 잎처럼 사라졌다가(1초, 맞지 않음) 가장 많이 다친 적 뒤에 나타나 벤다.
      // 적의 남은 체력이 적을수록 피해가 크고, 쓰러뜨리면 필살기 게이지 절반을 돌려받는다(각성: 전부).
      const T = 1;
      sim.fx('playdead', s, s.x, s.y, {});
      s.hiddenT = Math.max(s.hiddenT, T);
      s.flyT = Math.max(s.flyT, T);
      s.skyT = Math.max(s.skyT, T);
      sim.later(T, () => {
        if (!s.alive) return;
        let best: Snake | null = null, br = Infinity;
        for (const o of sim.snakes) {
          if (o.id === s.id || !sim.hittable(o) || o.deadT > 0 || !o.alive) continue;
          if (dist(o.x, o.y, s.x, s.y) > 480) continue;
          const r = o.hp / o.maxHp;
          if (r < br) ((br = r), (best = o));
        }
        if (!best) {
          sim.fx('reapslash', s, s.x, s.y, { r: 90, n: 0 });
          return;
        }
        const o = best;
        const x0 = s.x, y0 = s.y;
        const a = datan2(o.y - s.y, o.x - s.x);
        sim.shove(s, a, dist(o.x, o.y, s.x, s.y) + o.r + s.r + 14);
        s.angle = a + PI; // 돌아서서 벤다
        sim.fx('blink', s, s.x, s.y, { x1: x0, y1: y0, angle: a, wk: 'ghost' });
        const miss = 1 - o.hp / o.maxHp;
        sim.fx('reapslash', s, o.x, o.y, { r: 110, awake: true, n: 4, wk: 'ghost' });
        const before = o.alive;
        sim.deal(s, o, B * (1.3 + 2.4 * miss), 'ult', o.x, o.y, 'ult', cap);
        sim.hitstop(s, o, 0.12);
        hitFx(sim, o.x, o.y, 'cut');
        if (before && !o.alive) sim.addUlt(s, CONFIG.ultMax * (aw ? 0.6 : 0.3));
      });
      return;
    }
    case 'vortex': {
      // 큰 원을 그리며 질주해 안쪽 적들을 가운데로 끌어 모으고 3초 동안 조여 지속 피해
      const [cx, cy] = head(s, 150);
      const r = 210;
      sim.telegraph(s, { shape: 'circle', x: cx, y: cy, r, angle: 0, len: 0, w: 0 }, () => {
        pose(sim, s, 'stampede', 1.5);
        sim.fx('vortex', s, cx, cy, { r });
        sim.later(0.9, () => sim.fx('vortex', s, cx, cy, { r: r * 0.7 }));
        s.chanT = 1.5;
        s.chanKind = 'orbit';
        for (let k = 0; k < 12; k++)
          sim.later(k * 0.25, () => {
            if (!s.alive) return;
            sim.circle(s, cx, cy, r, (o, x, y) => {
              sim.pullTo(o, cx, cy, 45);
              sim.root(o, 0.3, s);
              sim.deal(s, o, B * 0.16, 'ult', x, y, 'ult', cap);
              if (k % 4 === 0) hitFx(sim, x, y, 'root');
            });
          });
        if (aw)
          sim.later(3, () => {
            if (!s.alive) return;
            sim.fx('gasburst', s, cx, cy, { r: 150 });
            sim.circle(s, cx, cy, 150, (o, x, y) => (sim.deal(s, o, B * 0.8, 'ult', x, y, 'ult', cap), sim.poison(s, o, 3, B * 0.15)));
          });
      });
      return;
    }
    case 'antriver': {
      // 앞쪽 넓은 띠로 개미 강물 3초: 맞은 적 밀어내기 + 지속 피해(각성: 두 줄)
      const a = s.angle, L = 420, w = 110;
      const x0 = s.x, y0 = s.y;
      sim.telegraph(s, { shape: 'line', x: x0, y: y0, r: 0, angle: a, len: L, w }, () => {
        const offs = aw ? [-70, 70] : [0];
        for (const off of offs) {
          const ox = x0 - dsin(a) * off, oy = y0 + dcos(a) * off;
          sim.fx('antriver', s, ox, oy, { angle: a, len: L, half: 0.45 });
          sim.later(0.8, () => sim.fx('antriver', s, ox, oy, { angle: a, len: L, half: 0.45 }));
          for (let k = 0; k < 12; k++)
            sim.later(k * 0.25, () => {
              if (!s.alive) return;
              sim.line(s, ox, oy, a, L, w, 99, (o, x, y) => {
                sim.knock(o, a, 40);
                sim.deal(s, o, B * 0.14, 'ult', x, y, 'ult', cap);
                if (k % 4 === 0) hitFx(sim, x, y, 'push');
              });
            });
        }
      });
      return;
    }
    case 'armymarch': {
      // 병정개미 12마리(각성 18)가 6초 동안 내 옆을 줄지어 행진하며 닿는 적을 문다
      pose(sim, s, 'call', 0.6);
      sim.fx('warhorn', s, s.x, s.y, { r: 130 });
      const n = (aw ? 18 : 12) + sim.tm(s, 'minion');
      for (let k = 0; k < n; k++) {
        sim.addMinion(s, 'soldier', 6 + sim.ab(s, 'colony'), B * 0.11 * (1 + sim.ab(s, 'formic')), false, k);
        sim.minions[sim.minions.length - 1].ult = cap;
      }
      return;
    }
    case 'bstorm': {
      // 넓은 범위에 나비 떼가 휘몰아쳐 4초 지속 피해 + 혼란(각성: 나를 따라다님)
      const [cx, cy] = head(s, 140);
      const r = 220;
      sim.telegraph(s, { shape: 'circle', x: cx, y: cy, r, angle: 0, len: 0, w: 0 }, () => {
        sim.fx('bstorm', s, cx, cy, { r });
        const z = sim.addZone({ x: cx, y: cy, r, kind: 'bstorm', life: 4, owner: s.id, dps: B * 0.45, mul: 1.5 + sim.ab(s, 'scales'), follow: aw });
        z.ult = cap;
      });
      return;
    }
  }
}

/** 새 장판(가루 구름·불개미 둥지·나비 떼 폭풍): 0.5초마다 */
export function zoneTick(sim: Simulation, z: Zone, owner: Snake, tick: boolean) {
  if (!tick || !owner) return;
  z.acc = 0.5;
  for (const o of sim.snakes) {
    if (o.id === z.owner || !sim.zoneHit(o)) continue;
    let inside = false;
    for (let i = 0; i < o.segN && !inside; i += 2) if (dist(o.segs[i * 2], o.segs[i * 2 + 1], z.x, z.y) < z.r + o.r) inside = true;
    if (!inside) continue;
    if (z.kind === 'powder') {
      sim.deal(owner, o, z.dps * 0.5, 'skill', o.x, o.y, 'skill', null, false);
      sim.confuse(o, z.mul, owner);
      hitFx(sim, o.x, o.y, 'confuse');
    } else if (z.kind === 'firenest') {
      sim.deal(owner, o, z.dps * 0.5, 'skill', o.x, o.y, 'skill', null, false);
      sim.slow(o, 1, z.mul);
      hitFx(sim, o.x, o.y, 'slow');
    } else if (z.kind === 'bstorm') {
      sim.deal(owner, o, z.dps * 0.5, 'ult', o.x, o.y, 'ult', z.ult, false);
      sim.confuse(o, z.mul, owner);
      hitFx(sim, o.x, o.y, 'confuse');
    }
  }
}

function inTri(x: number, y: number, p: [number, number][]) {
  const s = (a: [number, number], b: [number, number]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d1 = s(p[0], p[1]), d2 = s(p[1], p[2]), d3 = s(p[2], p[0]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// ---------- 개미 계열 특성: 일개미 행렬 ----------

/** 늘 따라다니는 일개미 수(일본왕개미 3, 군대개미는 먹을 때마다 잠깐 더) */
function workerWant(sim: Simulation, s: Snake) {
  return (sim.inst(s, 'bigworker') ? 3 : 2) + (s.raidT > 0 ? s.raidN : 0);
}

export function workerTick(sim: Simulation, s: Snake, dt: number) {
  void dt;
  if (!s.alive) return;
  let have = 0;
  for (const m of sim.minions) if (m.owner === s.id && m.kind === 'worker') have++;
  const want = workerWant(sim, s);
  // 모자라면 하나씩(쓰러진 일개미는 8초 뒤)
  if (have < want && s.workerCd <= 0) {
    sim.addMinion(s, 'worker', 9999, 0, false, have);
    s.workerCd = 0.3;
  }
  // 덤 일개미(사냥 행렬)가 끝나면 남는 것을 돌려보낸다
  if (have > want) {
    for (let k = sim.minions.length - 1; k >= 0 && have > want; k--) {
      const m = sim.minions[k];
      if (m.owner === s.id && m.kind === 'worker') ((m.life = 0), have--);
    }
  }
}

/** 일개미 자리: 몸 뒤쪽을 줄지어 따라 걷다가, 주인이 문 적에게 달려가 함께 문다 */
export function workerMove(sim: Simulation, m: Minion, owner: Snake, dt: number) {
  if (!owner || !owner.alive || m.life <= 0 || m.hp <= 0) {
    const idx = sim.minions.indexOf(m);
    if (idx >= 0) sim.minions.splice(idx, 1);
    if (owner && owner.alive && m.hp <= 0) owner.workerCd = 8;
    return;
  }
  m.bite += dt;
  m.acc -= dt;
  let tx: number, ty: number;
  const t = m.target >= 0 ? sim.snakes[m.target] : null;
  if (t && t.alive && m.acc > -0.6) {
    tx = t.x;
    ty = t.y;
  } else {
    m.target = -1;
    const i = Math.min(owner.segN - 1, Math.max(2, owner.segN - 2 - m.slot * 2));
    tx = owner.segs[i * 2];
    ty = owner.segs[i * 2 + 1];
    const j = Math.max(0, i - 1);
    const dir = datan2(owner.segs[j * 2 + 1] - ty, owner.segs[j * 2] - tx);
    const side = m.slot % 2 ? 1 : -1;
    tx -= dsin(dir) * owner.r * 1.6 * side;
    ty += dcos(dir) * owner.r * 1.6 * side;
  }
  const a = datan2(ty - m.y, tx - m.x);
  const d = dist(tx, ty, m.x, m.y);
  const v = Math.min(d, Math.max(m.speed, sim.speedOf(owner) * 1.4) * dt);
  m.x += dcos(a) * v;
  m.y += dsin(a) * v;
  m.angle = a;
  if (t && t.alive && m.target >= 0) {
    // 적이 일개미를 물면 다친다
    if (dist(m.x, m.y, t.x, t.y) < t.r + 14) m.hp -= dt * 6;
  }
}

/** 주인이 물면 일개미들이 함께 문다(한 마리당 물기의 10%) */
export function workersBite(sim: Simulation, a: Snake, b: Snake, dealt: number) {
  if (dealt <= 0) return;
  let n = 0;
  for (const m of sim.minions) {
    if (m.owner !== a.id || m.kind !== 'worker') continue;
    n++;
    m.target = b.id;
    m.acc = 0;
    m.bite = 0;
  }
  if (n > 0) sim.deal(a, b, dealt * 0.1 * n * (1 + sim.ab(a, 'formic')) * sim.tm(a, 'minionDmg'), 'minion', b.x, b.y, 'bite', null, false);
}

/** 반격 자세: 맞으면 그 적을 바로 되벤다(0.25초에 한 번) */
export function riposteHit(sim: Simulation, s: Snake, a: Snake) {
  if (s.counterCd > 0 || !a.alive || a.deadT > 0 || dist(a.x, a.y, s.x, s.y) > 260) return;
  s.counterCd = 0.25;
  // 맞는 순간은 때린 쪽 기술로 돌고 있으므로, 되베기는 내 필살기로 따로 돌린다
  sim.as(s, () => sim.later(0.06, () => {
    if (!s.alive || s.counterT <= 0 || !a.alive) return;
    const ang = datan2(a.y - s.y, a.x - s.x);
    s.angle = ang;
    s.counterN++;
    sim.fx('combo', s, s.x, s.y, { angle: ang, r: 150, half: 0.5, awake: true });
    sim.deal(s, a, sim.B(s) * 0.6, 'ult', a.x, a.y, 'ult', s.ultMap);
    sim.hitstop(s, a, 0.04);
    hitFx(sim, a.x, a.y, 'cut');
  }), 'ult');
}

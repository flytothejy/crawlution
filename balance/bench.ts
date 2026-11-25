// 1층 · 기술 실측: 종마다 4칸 기술을 고정된 장면에서 한 번 써서, 그 기술 하나가 내는 효과를 잰다.
//
// 장면 셋(같은 장면을 '안 쓰고'도 돌려 차이를 본다):
//   공격 장면  앞쪽에 허수아비 3마리(무당거미, 같은 레벨, 제자리 맴돌기). 기술 칸에서 나온 피해·제어 시간·밀어낸 거리·회복.
//   방어 장면  주변 세 방향에서 정해진 공격(0.5초마다 한 방향당 최대 체력 4%)이 들어온다. 3초 동안 지킨 체력(막기·숨기·무적·회복).
//   이동 장면  혼자 직진. 쓰고 1.5초 동안 더 간 거리(돌진·도약·질주 강화).
import { Simulation, CONFIG, type Snake, type Slot, SLOTS, newSim, noEnemies, replaceSnake, castCmd, cdOf, kitOf, emptyCommand } from './lib';

export const DUMMY = 'orbspider'; // 받는 피해·밀려남 보정이 없는 종

export interface BenchRow {
  sp: string;
  slot: Slot;
  level: number;
  seed: number;
  name: string;
  cd: number;
  cast: boolean; // 실제로 나갔나
  dmg: number; // 기술 칸에서 나온 피해 합(허수아비 3마리)
  dmg1: number; // 그중 한 마리가 받은 최대 피해(1:1 몰아치기 세기)
  targets: number; // 피해를 받은 허수아비 수
  cc: Record<string, number>; // 상태별 걸린 시간 합(초, 허수아비 3마리)
  knock: number; // 밀어낸·끌어온 거리 합
  refHp: number; // 허수아비 한 마리 최대 체력(같은 레벨). dmg를 이것으로 나누면 '상대 체력의 몇 배'
  heal: number; // 공격 장면에서 회복한 체력(최대 체력 비율, 안 쓴 경우 대비)
  guard: number; // 방어 장면에서 지킨 체력(최대 체력 비율, 안 쓴 경우 대비). 안 쓰면 3초에 72%를 잃는다
  move: number; // 이동 장면에서 더 간 거리
  hide: number; // 공격 장면에서 내가 숨어 있던 시간(초)
  safe: number; // 공격 장면에서 내가 무적·비행이던 시간(초)
}

const CC_KEYS = ['stun', 'root', 'slow', 'charm', 'confuse', 'fear', 'silence', 'blind', 'mark', 'poison', 'itch'] as const;

function ccOf(o: Snake): Record<string, number> {
  return {
    stun: o.stunT > 0 ? 1 : 0,
    root: o.rootT > 0 ? 1 : 0,
    slow: o.slowT > 0 ? 1 - o.slowMul : 0, // 느려진 정도를 곱해 센다(50% 느려짐 1초 = 0.5)
    charm: o.charmT > 0 ? 1 : 0,
    confuse: o.confuseT > 0 ? 1 : 0,
    fear: o.fearT > 0 ? 1 : 0,
    silence: o.silenceT > 0 ? 1 : 0,
    blind: o.blindT > 0 ? 1 : 0,
    mark: o.markT > 0 ? 1 : 0,
    poison: o.poisonT > 0 ? 1 : 0,
    itch: o.itchT > 0 ? 1 : 0,
  };
}

const WINDOW: Record<Slot, number> = { atk: 6, def: 6, spc: 6, ult: 8 };

/** 허수아비: 제자리에서 작은 원을 그리며 돈다(밀려나면 그 자리에서 다시 맴돈다) */
function circleCmd(t: number, phase: number) {
  return { ...emptyCommand(0), angle: phase + t * 3.2 };
}

function prep(sim: Simulation, me: Snake, slot: Slot) {
  me.invulnT = 0;
  me.skillCd = me.subCd = me.spcCd = 0;
  me.ult = slot === 'ult' ? CONFIG.ultMax : 0;
  me.isPlayer = true;
}

/** 공격 장면 */
function offense(sp: string, slot: Slot, level: number, seed: number, cast: boolean) {
  const sim = newSim(seed, sp, 3, level);
  noEnemies(sim);
  sim.foods = [];
  const me = sim.snakes[0];
  sim.spawnAt(me, 0, 0, 0, 26);
  const range = slot === 'ult' ? 260 : kitOf(sp)![slot].range || 200;
  const d0 = Math.max(110, Math.min(280, range * 0.55));
  const spots: [number, number][] = [[d0, 0], [d0 + 130, 22], [d0 + 30, -85]];
  const dums = spots.map((p, i) => {
    const d = replaceSnake(sim, i + 1, DUMMY, level, true);
    sim.spawnAt(d, p[0], p[1], Math.PI / 2, 26);
    d.invulnT = 0;
    d.biteCd = 99;
    return d;
  });
  prep(sim, me, slot);
  me.hp = me.maxHp * 0.5;
  const hp0 = me.hp;
  const startKnock = dums.map(() => 0);
  const cc: Record<string, number> = Object.fromEntries(CC_KEYS.map((k) => [k, 0]));
  let dmg = 0, didCast = false, hide = 0, safe = 0;
  const hitSet = new Set<number>();
  const per = new Map<number, number>();
  const cx = spots.reduce((a, p) => a + p[0], 0) / 3, cy = spots.reduce((a, p) => a + p[1], 0) / 3;
  const N = Math.round(WINDOW[slot] * CONFIG.tickRate);
  for (let t = 0; t < N; t++) {
    const aim = Math.atan2(cy - me.y, cx - me.x);
    sim.setCommand(0, t === 0 && cast ? castCmd(me, slot, aim) : { ...emptyCommand(0), angle: aim });
    dums.forEach((d, i) => {
      sim.setCommand(d.id, circleCmd(sim.time, i * 2));
      d.biteCd = 99;
    });
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'skill' && e.snake === 0) didCast = true;
      if (e.type === 'hit' && e.by === 0 && e.dmg > 0 && e.src === slot) {
        dmg += e.dmg;
        hitSet.add(e.snake);
        per.set(e.snake, (per.get(e.snake) ?? 0) + e.dmg);
      }
    }
    sim.events = [];
    const dt = sim.dt;
    if (me.hiddenT > 0) hide += dt;
    if (me.invulnT > 0 || me.flyT > 0) safe += dt;
    dums.forEach((d, i) => {
      const c = ccOf(d);
      for (const k of CC_KEYS) cc[k] += c[k] * dt;
      startKnock[i] += Math.hypot(d.kvx, d.kvy) * dt;
      // 허수아비는 쓰러지지 않는다(피해는 위에서 셌다)
      if (d.hp < d.maxHp * 0.5) d.hp = d.maxHp;
      if (!d.alive) sim.spawnAt(d, spots[i][0], spots[i][1], Math.PI / 2, 26);
    });
  }
  return { dmg1: Math.max(0, ...per.values()), hide, safe, refHp: dums[0].maxHp, dmg, targets: hitSet.size, cc, knock: startKnock.reduce((a, b) => a + b, 0), heal: (me.hp - hp0) / me.maxHp, didCast, cd: cdOf(sim, me, slot), name: slot === 'ult' ? me.kit!.ult.name : me.kit![slot].name };
}

/** 방어 장면: 3초 동안 지킨 체력(안 쓴 판과의 차이) */
export function defense(sp: string, slot: Slot, level: number, seed: number, cast: boolean) {
  const sim = newSim(seed, sp, 3, level);
  noEnemies(sim);
  sim.foods = [];
  const me = sim.snakes[0];
  sim.spawnAt(me, 0, 0, 0, 26);
  const threats = [0, 2.1, 4.2].map((a, i) => {
    const d = replaceSnake(sim, i + 1, DUMMY, level, true);
    sim.spawnAt(d, Math.cos(a) * 170, Math.sin(a) * 170, a + Math.PI, 14);
    d.rootT = 999;
    d.biteCd = 99;
    return d;
  });
  prep(sim, me, slot);
  const hp0 = me.hp;
  const N = Math.round(3 * CONFIG.tickRate);
  const every = Math.round(0.5 * CONFIG.tickRate);
  for (let t = 0; t < N; t++) {
    sim.setCommand(0, t === 0 && cast ? castCmd(me, slot, me.angle) : circleCmd(sim.time, 0));
    for (const d of threats) sim.setCommand(d.id, { ...emptyCommand(0), angle: d.angle });
    sim.step();
    sim.events = [];
    if (t % every === 0 && me.alive) {
      for (const d of threats) {
        d.biteCd = 99;
        d.rootT = 999;
        // 멀리 달아나는 것은 '이동'으로 따로 센다: 여기서는 거리와 상관없이 맞는다(숨기·무적·막기·회복만 지킨 것으로)
        if (!sim.hittable(me)) continue; // 숨기는 맞으면 풀린다(숨어 있던 시간은 공격 장면의 hide로 센다)
        sim.as(d, () => sim.deal(d, me, me.maxHp * 0.04, 'skill', me.x, me.y, 'skill', null, false), null);
      }
    }
  }
  return me.alive ? (me.hp - hp0) / me.maxHp : -1;
}

/** 이동 장면: 쓰고 1.5초 동안 간 거리 */
function mobility(sp: string, slot: Slot, level: number, seed: number, cast: boolean) {
  const sim = newSim(seed, sp, 1, level);
  noEnemies(sim);
  sim.foods = [];
  const me = sim.snakes[0];
  sim.spawnAt(me, 0, 0, 0, 26);
  const far = replaceSnake(sim, 1, DUMMY, level, true);
  sim.spawnAt(far, 2500, 0, Math.PI / 2, 10);
  prep(sim, me, slot);
  const N = Math.round(1.5 * CONFIG.tickRate);
  for (let t = 0; t < N; t++) {
    sim.setCommand(0, t === 0 && cast ? castCmd(me, slot, 0) : { ...emptyCommand(0), angle: 0 });
    sim.setCommand(1, { ...emptyCommand(0), angle: Math.PI / 2 });
    sim.step();
    sim.events = [];
  }
  return Math.hypot(me.x, me.y);
}

const baseCache = new Map<string, { guard: number; move: number; heal: number }>();
function base(sp: string, level: number, seed: number) {
  const k = `${sp}|${level}|${seed}`;
  if (!baseCache.has(k)) baseCache.set(k, { guard: defense(sp, 'atk', level, seed, false), move: mobility(sp, 'atk', level, seed, false), heal: offense(sp, 'atk', level, seed, false).heal });
  return baseCache.get(k)!;
}

export function benchOne(sp: string, slot: Slot, level: number, seed: number): BenchRow {
  const o = offense(sp, slot, level, seed, true);
  const b = base(sp, level, seed);
  const g = defense(sp, slot, level, seed, true);
  const m = mobility(sp, slot, level, seed, true);
  return {
    sp, slot, level, seed, name: o.name, cd: o.cd, cast: o.didCast,
    dmg: Math.round(o.dmg), dmg1: Math.round(o.dmg1), targets: o.targets,
    cc: Object.fromEntries(Object.entries(o.cc).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    refHp: Math.round(o.refHp), knock: Math.round(o.knock), heal: Math.round((o.heal - b.heal) * 1000) / 1000,
    guard: Math.round((g - b.guard) * 1000) / 1000,
    move: Math.round(m - b.move),
    hide: Math.round(o.hide * 100) / 100,
    safe: Math.round(o.safe * 100) / 100,
  };
}

export function benchSpecies(sp: string, levels: number[], seeds: number[]): BenchRow[] {
  const out: BenchRow[] = [];
  for (const level of levels) for (const seed of seeds) for (const slot of SLOTS) out.push(benchOne(sp, slot, level, seed));
  return out;
}

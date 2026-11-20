// 게임 로직(시뮬레이션). DOM·화면을 전혀 모른다 → Web Worker, 서버(Node), 테스트에서 그대로 돈다.
import { CONFIG, radiusFor, spacingFor } from './config';
import { Rng } from './rng';
import { botThink } from './bot';
import type { Command, GameEvent, RingView, SnakeView, Snapshot } from './types';

export interface Snake {
  id: number;
  name: string;
  palette: number;
  isPlayer: boolean;
  alive: boolean;
  x: number;
  y: number;
  px: number; // 이전 틱 위치(튕겨내기용)
  py: number;
  angle: number;
  path: number[]; // 머리가 지나온 길(x,y 순서, 최신이 끝)
  segCount: number;
  growth: number;
  segs: Float32Array;
  segN: number;
  r: number;
  cmd: Command;
  boosting: boolean;
  sneaking: boolean;
  boostAcc: number;
  totalEP: number;
  kills: number;
  crushes: number;
  score: number;
  respawnT: number;
  loopCd: number;
  // 봇 전용
  hunter: boolean;
  side: number;
  modeT: number;
  hunting: boolean;
  wanderX: number;
  wanderY: number;
}

export interface Food {
  x: number;
  y: number;
  r: number;
  ep: number;
  kind: 0 | 1 | 2; // 0 보통, 1 큰 먹이, 2 잔해
  life: number; // 잔해만 사라짐
}

interface Ring {
  owner: number;
  poly: Float32Array;
  cx: number;
  cy: number;
  t: number;
  total: number;
  inside: Map<number, boolean>;
}

const CELL = 64;
const BOT_NAMES = ['꼬물이', '초록띠', '방울이', '줄무늬', '노랑이', '솜털이', '먹보', '느림보'];

export class Simulation {
  readonly dt = 1 / CONFIG.tickRate;
  tick = 0;
  rng: Rng;
  snakes: Snake[] = [];
  foods: Food[] = [];
  rings: Ring[] = [];
  events: GameEvent[] = [];
  playerId = 0;
  private grid = new Map<number, number[]>();

  constructor(seed: number, playerName = '나') {
    this.rng = new Rng(seed);
    this.reset(playerName);
  }

  reset(playerName: string) {
    this.tick = 0;
    this.snakes = [];
    this.foods = [];
    this.rings = [];
    this.events = [];
    const p = this.makeSnake(0, playerName, 0, true);
    this.spawnAt(p, 0, 0, this.rng.range(0, Math.PI * 2), CONFIG.startSegments);
    this.snakes.push(p);
    for (let i = 0; i < CONFIG.botCount; i++) {
      const b = this.makeSnake(i + 1, BOT_NAMES[i % BOT_NAMES.length], (i % 5) + 1, false);
      b.hunter = i % 2 === 0;
      this.snakes.push(b);
      this.respawnBot(b, this.rng.int(CONFIG.botStartMin, CONFIG.botStartMax));
    }
    for (let i = 0; i < CONFIG.foodCount; i++) this.foods.push(this.newFood(0));
    for (let i = 0; i < CONFIG.bigFoodCount; i++) this.foods.push(this.newFood(1));
    this.buildGrid();
  }

  private makeSnake(id: number, name: string, palette: number, isPlayer: boolean): Snake {
    return {
      id, name, palette, isPlayer, alive: true,
      x: 0, y: 0, px: 0, py: 0, angle: 0, path: [], segCount: CONFIG.startSegments, growth: 0,
      segs: new Float32Array(0), segN: 0, r: CONFIG.baseRadius,
      cmd: { angle: 0, boost: false, sneak: false },
      boosting: false, sneaking: false, boostAcc: 0,
      totalEP: 0, kills: 0, crushes: 0, score: 0, respawnT: 0, loopCd: 0,
      hunter: false, side: this.rng.next() < 0.5 ? -1 : 1, modeT: 0, hunting: false, wanderX: 0, wanderY: 0,
    };
  }

  /** 머리를 (x,y)에 두고 몸을 반대 방향으로 곧게 펼친다 */
  private spawnAt(s: Snake, x: number, y: number, angle: number, segCount: number) {
    s.alive = true;
    s.x = s.px = x;
    s.y = s.py = y;
    s.angle = angle;
    s.cmd = { angle, boost: false, sneak: false };
    s.segCount = segCount;
    s.growth = 0;
    s.boostAcc = 0;
    s.loopCd = 0;
    s.r = radiusFor(segCount);
    const sp = spacingFor(segCount);
    const len = segCount * sp + 40;
    s.path = [];
    const steps = Math.ceil(len / 3);
    for (let i = steps; i >= 0; i--) {
      s.path.push(x - Math.cos(angle) * i * 3, y - Math.sin(angle) * i * 3);
    }
    this.rebuildSegs(s);
  }

  private respawnBot(b: Snake, segCount: number) {
    const player = this.snakes[0];
    const R = CONFIG.arenaRadius * 0.85;
    let x = 0, y = 0;
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = Math.sqrt(this.rng.next()) * R;
      x = Math.cos(a) * d;
      y = Math.sin(a) * d;
      if (!player.alive || Math.hypot(x - player.x, y - player.y) > 500) break;
    }
    b.totalEP = 0;
    b.kills = 0;
    b.crushes = 0;
    b.score = 0;
    b.modeT = 0;
    b.hunting = false;
    this.spawnAt(b, x, y, this.rng.range(0, Math.PI * 2), segCount);
    this.events.push({ type: 'respawn', snake: b.id });
  }

  private newFood(kind: 0 | 1): Food {
    const R = CONFIG.arenaRadius - 30;
    const a = this.rng.range(0, Math.PI * 2);
    const d = Math.sqrt(this.rng.next()) * R;
    return {
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      r: kind === 1 ? CONFIG.bigFoodRadius : CONFIG.foodRadius,
      ep: kind === 1 ? CONFIG.bigFoodEP : CONFIG.foodEP,
      kind,
      life: Infinity,
    };
  }

  setCommand(id: number, cmd: Command) {
    const s = this.snakes[id];
    if (s) s.cmd = cmd;
  }

  /** 몸 마디 위치를 머리가 지나온 길에서 일정 간격으로 뽑는다 */
  rebuildSegs(s: Snake) {
    const sp = spacingFor(s.segCount);
    s.r = radiusFor(s.segCount);
    const need = s.segCount;
    if (s.segs.length < need * 2) s.segs = new Float32Array(need * 2 + 32);
    const p = s.path;
    let n = 0;
    let lastX = p[p.length - 2];
    let lastY = p[p.length - 1];
    s.segs[0] = lastX;
    s.segs[1] = lastY;
    n = 1;
    let carry = 0; // 마지막 마디 이후 걸어온 거리
    let cutIndex = 0;
    for (let i = p.length - 4; i >= 0 && n < need; i -= 2) {
      const x = p[i], y = p[i + 1];
      let dx = x - lastX, dy = y - lastY;
      let d = Math.hypot(dx, dy);
      let ox = lastX, oy = lastY;
      while (d > 0 && carry + d >= sp && n < need) {
        const t = (sp - carry) / d;
        const nx = ox + dx * t, ny = oy + dy * t;
        s.segs[n * 2] = nx;
        s.segs[n * 2 + 1] = ny;
        n++;
        ox = nx; oy = ny;
        dx = x - ox; dy = y - oy;
        d = Math.hypot(dx, dy);
        carry = 0;
      }
      carry += d;
      lastX = x;
      lastY = y;
      cutIndex = i;
    }
    // 길이 남는 경우(막 자란 직후) 꼬리를 마지막 점에 겹쳐 둔다
    while (n < need) {
      s.segs[n * 2] = s.segs[(n - 1) * 2];
      s.segs[n * 2 + 1] = s.segs[(n - 1) * 2 + 1];
      n++;
    }
    s.segN = n;
    // 필요 없는 오래된 길은 잘라낸다(가끔만)
    const keepFrom = Math.max(0, cutIndex - 20);
    if (keepFrom > 400) s.path.splice(0, keepFrom);
  }

  step() {
    const dt = this.dt;
    // 1) 봇 생각 → 명령
    for (const s of this.snakes) {
      if (!s.isPlayer && s.alive) s.cmd = botThink(this, s, dt);
    }
    // 2) 이동
    for (const s of this.snakes) {
      if (!s.alive) continue;
      this.moveSnake(s, dt);
    }
    // 3) 먹기
    this.eatFoods();
    // 4) 공간 격자 → 충돌(같은 틱 기준으로 모은 뒤 한꺼번에 적용)
    this.buildGrid();
    const deaths = new Map<number, { by: number; cause: 'head' | 'wall' }>();
    this.checkCollisions(deaths);
    // 5) 고리(감싸기)
    for (const s of this.snakes) {
      if (!s.alive) continue;
      s.loopCd -= dt;
      if (s.loopCd <= 0 && !deaths.has(s.id)) this.detectLoop(s);
    }
    this.updateRings(dt, deaths);
    // 6) 죽음 적용
    for (const [id, d] of deaths) this.kill(this.snakes[id], d.by, d.cause);
    // 7) 봇 부활, 먹이 보충
    for (const s of this.snakes) {
      if (s.alive || s.isPlayer) continue;
      s.respawnT -= dt;
      if (s.respawnT <= 0) this.respawnBot(s, this.rng.int(12, 40));
    }
    this.refillFoods(dt);
    for (const s of this.snakes) s.score = Math.floor(s.totalEP + s.kills * CONFIG.scoreKill + s.crushes * CONFIG.scoreCrush);
    this.tick++;
  }

  private moveSnake(s: Snake, dt: number) {
    const c = s.cmd;
    s.sneaking = c.sneak;
    s.boosting = c.boost && !c.sneak && s.segCount > CONFIG.boostMinSegments;
    // 회전(몸이 길수록 조금 둔해짐)
    const sizeSlow = 1 - 0.3 * Math.min(1, Math.max(0, s.segCount - CONFIG.startSegments) / 100);
    const maxTurn = CONFIG.turnRate * dt * sizeSlow * (s.sneaking ? CONFIG.sneakTurnMul : 1);
    let diff = c.angle - s.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    const speed = CONFIG.baseSpeed * (s.boosting ? CONFIG.boostMul : s.sneaking ? CONFIG.sneakMul : 1);
    // 부스트하면 꼬리 마디가 먹이로 떨어진다
    if (s.boosting) {
      s.boostAcc += dt;
      if (s.boostAcc >= CONFIG.boostDropInterval) {
        s.boostAcc -= CONFIG.boostDropInterval;
        const tx = s.segs[(s.segN - 1) * 2], ty = s.segs[(s.segN - 1) * 2 + 1];
        s.segCount--;
        this.foods.push({ x: tx, y: ty, r: CONFIG.remainsRadius, ep: CONFIG.remainsEP, kind: 2, life: 30 });
      }
    } else {
      s.boostAcc = 0;
    }
    s.px = s.x;
    s.py = s.y;
    s.x += Math.cos(s.angle) * speed * dt;
    s.y += Math.sin(s.angle) * speed * dt;
    s.path.push(s.x, s.y);
    this.rebuildSegs(s);
  }

  private eatFoods() {
    const foods = this.foods;
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const reach = s.r + 6;
      for (let i = foods.length - 1; i >= 0; i--) {
        const f = foods[i];
        const dx = f.x - s.x, dy = f.y - s.y;
        const rr = reach + f.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        this.feed(s, f.ep);
        this.events.push({ type: 'eat', snake: s.id, x: f.x, y: f.y, big: f.kind !== 0 });
        foods[i] = foods[foods.length - 1];
        foods.pop();
      }
    }
  }

  feed(s: Snake, ep: number) {
    s.totalEP += ep;
    s.growth += ep;
    while (s.growth >= CONFIG.epPerSegment) {
      s.growth -= CONFIG.epPerSegment;
      if (s.segCount < CONFIG.maxSegments) s.segCount++;
    }
  }

  private refillFoods(dt: number) {
    let normal = 0, big = 0;
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if (f.kind === 0) normal++;
      else if (f.kind === 1) big++;
      else {
        f.life -= dt;
        if (f.life <= 0) {
          this.foods[i] = this.foods[this.foods.length - 1];
          this.foods.pop();
        }
      }
    }
    // 한 틱에 몇 개씩만 채워 갑자기 쏟아지지 않게
    for (let k = 0; k < 2 && normal < CONFIG.foodCount; k++, normal++) this.foods.push(this.newFood(0));
    if (big < CONFIG.bigFoodCount && this.rng.next() < 0.02) this.foods.push(this.newFood(1));
  }

  private buildGrid() {
    this.grid.clear();
    for (let si = 0; si < this.snakes.length; si++) {
      const s = this.snakes[si];
      if (!s.alive) continue;
      for (let i = 0; i < s.segN; i++) {
        const key = cellKey(s.segs[i * 2], s.segs[i * 2 + 1]);
        let arr = this.grid.get(key);
        if (!arr) this.grid.set(key, (arr = []));
        arr.push((si << 16) | i);
      }
    }
  }

  /** (x,y) 주변 반경 rad 안의 마디를 콜백으로 돌려준다. 콜백이 true를 돌려주면 중단 */
  forSegsNear(x: number, y: number, rad: number, cb: (s: Snake, i: number, sx: number, sy: number) => boolean | void) {
    const c0x = Math.floor((x - rad) / CELL), c1x = Math.floor((x + rad) / CELL);
    const c0y = Math.floor((y - rad) / CELL), c1y = Math.floor((y + rad) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        const arr = this.grid.get(cx * 73856093 + cy);
        if (!arr) continue;
        for (const packed of arr) {
          const s = this.snakes[packed >> 16];
          const i = packed & 0xffff;
          if (cb(s, i, s.segs[i * 2], s.segs[i * 2 + 1]) === true) return;
        }
      }
    }
  }

  private checkCollisions(deaths: Map<number, { by: number; cause: 'head' | 'wall' }>) {
    const ringOwners = new Set(this.rings.map((r) => r.owner));
    const ringOf = new Map(this.rings.map((r) => [r.owner, r]));
    const bounces: [Snake, number, number][] = [];
    for (const a of this.snakes) {
      if (!a.alive) continue;
      if (Math.hypot(a.x, a.y) > CONFIG.arenaRadius) {
        deaths.set(a.id, { by: -1, cause: 'wall' });
        continue;
      }
      this.forSegsNear(a.x, a.y, a.r + CONFIG.maxRadius, (b, i, sx, sy) => {
        if (b.id === a.id) return; // 자기 몸에는 죽지 않는다(감싸기를 위해)
        const rr = (a.r + b.r) * 0.8;
        const dx = sx - a.x, dy = sy - a.y;
        if (dx * dx + dy * dy > rr * rr) return;
        // 고리에 갇힌 곤충은 이미 잡힌 상태 → 고리 주인이 부딪혀도 해가 없다
        const myRing = ringOf.get(a.id);
        if (myRing && myRing.inside.get(b.id)) return;
        // 고리를 닫은 곤충의 몸은 압착 전까지 단단한 벽 → 부딪히면 튕겨 나간다
        if (i !== 0 && ringOwners.has(b.id)) {
          bounces.push([a, sx, sy]);
          return true;
        }
        // 프로토타입 A는 모두 같은 단계 → 머리끼리면 둘 다, 머리→몸이면 들이받은 쪽이 죽는다
        if (i === 0) {
          deaths.set(a.id, { by: b.id, cause: 'head' });
          deaths.set(b.id, { by: a.id, cause: 'head' });
        } else {
          deaths.set(a.id, { by: b.id, cause: 'head' });
        }
        return true;
      });
    }
    for (const [a, sx, sy] of bounces) {
      if (deaths.has(a.id)) continue;
      a.x = a.px;
      a.y = a.py;
      a.angle = Math.atan2(a.y - sy, a.x - sx);
      a.path[a.path.length - 2] = a.x;
      a.path[a.path.length - 1] = a.y;
      this.rebuildSegs(a);
      this.events.push({ type: 'bounce', snake: a.id, x: a.x, y: a.y });
    }
  }

  private detectLoop(s: Snake) {
    if (this.rings.some((r) => r.owner === s.id)) return;
    const hit = s.r * 1.1;
    for (let i = CONFIG.loopMinIndex; i < s.segN; i++) {
      const dx = s.segs[i * 2] - s.x, dy = s.segs[i * 2 + 1] - s.y;
      if (dx * dx + dy * dy > hit * hit) continue;
      const poly = s.segs.slice(0, (i + 1) * 2);
      const area = Math.abs(polyArea(poly));
      if (Math.sqrt(area / Math.PI) < CONFIG.loopMinRadius) return;
      const [cx, cy] = polyCentroid(poly);
      const inside = new Map<number, boolean>();
      let trapped = 0;
      for (const o of this.snakes) {
        if (o.id === s.id || !o.alive) continue;
        const inn = pointInPoly(o.x, o.y, poly);
        inside.set(o.id, inn);
        if (inn) trapped++;
      }
      this.rings.push({ owner: s.id, poly, cx, cy, t: CONFIG.crushDelay, total: CONFIG.crushDelay, inside });
      this.events.push({ type: 'ring', snake: s.id, cx, cy, trapped });
      s.loopCd = CONFIG.loopCooldown;
      return;
    }
  }

  private updateRings(dt: number, deaths: Map<number, { by: number; cause: 'head' | 'wall' }>) {
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const ring = this.rings[k];
      const owner = this.snakes[ring.owner];
      if (!owner.alive || deaths.has(owner.id)) {
        this.rings.splice(k, 1);
        continue;
      }
      // 고리가 단단해진 동안: 안팎을 넘나들 수 없다(부딪히면 튕겨 나감)
      for (const o of this.snakes) {
        if (o.id === ring.owner || !o.alive || deaths.has(o.id)) continue;
        if (!ring.inside.has(o.id)) ring.inside.set(o.id, pointInPoly(o.x, o.y, ring.poly));
        const was = ring.inside.get(o.id)!;
        const now = pointInPoly(o.x, o.y, ring.poly);
        if (now !== was) {
          o.x = o.px;
          o.y = o.py;
          const toC = Math.atan2(ring.cy - o.y, ring.cx - o.x);
          o.angle = was ? toC : toC + Math.PI;
          o.path[o.path.length - 2] = o.x;
          o.path[o.path.length - 1] = o.y;
          this.rebuildSegs(o);
          this.events.push({ type: 'bounce', snake: o.id, x: o.x, y: o.y });
        }
      }
      ring.t -= dt;
      if (ring.t <= 0) {
        let count = 0;
        for (const o of this.snakes) {
          if (o.id === ring.owner || !o.alive || deaths.has(o.id)) continue;
          if (pointInPoly(o.x, o.y, ring.poly)) {
            this.kill(o, ring.owner, 'crush');
            count++;
          }
        }
        if (count > 0) {
          owner.crushes += count;
          if (count >= 2) owner.totalEP += Math.floor(CONFIG.scoreCrush * (CONFIG.comboBonus - 1) * count);
        }
        this.events.push({ type: 'crush', snake: ring.owner, cx: ring.cx, cy: ring.cy, count });
        this.rings.splice(k, 1);
      }
    }
  }

  private kill(s: Snake, by: number, cause: 'head' | 'wall' | 'crush') {
    if (!s.alive) return;
    s.alive = false;
    // 몸 전체가 먹이 알갱이로 흩어진다
    for (let i = 0; i < s.segN; i += 1) {
      const jitter = 6;
      this.foods.push({
        x: s.segs[i * 2] + this.rng.range(-jitter, jitter),
        y: s.segs[i * 2 + 1] + this.rng.range(-jitter, jitter),
        r: CONFIG.remainsRadius,
        ep: CONFIG.remainsEP,
        kind: 2,
        life: 40,
      });
    }
    if (by >= 0 && by !== s.id && this.snakes[by].alive && cause !== 'crush') this.snakes[by].kills++;
    if (cause === 'crush' && by >= 0) this.snakes[by].kills++;
    this.events.push({ type: 'death', snake: s.id, x: s.x, y: s.y, by, cause });
    s.respawnT = CONFIG.botRespawnDelay;
    // 링 소유자가 죽으면 그 링도 사라진다
    this.rings = this.rings.filter((r) => r.owner !== s.id);
  }

  snapshot(): Snapshot {
    const snakes: SnakeView[] = this.snakes.map((s) => ({
      id: s.id,
      name: s.name,
      palette: s.palette,
      alive: s.alive,
      isPlayer: s.isPlayer,
      r: s.r,
      angle: s.angle,
      boosting: s.boosting,
      sneaking: s.sneaking,
      segs: s.alive ? s.segs.slice(0, s.segN * 2) : new Float32Array(0),
      score: s.score,
      kills: s.kills,
      crushes: s.crushes,
      length: s.segCount,
    }));
    const foods = new Float32Array(this.foods.length * 4);
    for (let i = 0; i < this.foods.length; i++) {
      const f = this.foods[i];
      foods[i * 4] = f.x;
      foods[i * 4 + 1] = f.y;
      foods[i * 4 + 2] = f.r;
      foods[i * 4 + 3] = f.kind;
    }
    const rings: RingView[] = this.rings.map((r) => ({ owner: r.owner, poly: r.poly, cx: r.cx, cy: r.cy, t: r.t, total: r.total }));
    const events = this.events;
    this.events = [];
    return { tick: this.tick, time: this.tick * this.dt, snakes, foods, rings, events, playerId: this.playerId };
  }
}

function cellKey(x: number, y: number) {
  return Math.floor(x / CELL) * 73856093 + Math.floor(y / CELL);
}

export function polyArea(p: Float32Array): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return a / 2;
}

export function polyCentroid(p: Float32Array): [number, number] {
  const n = p.length / 2;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    x += p[i * 2];
    y += p[i * 2 + 1];
  }
  return [x / n, y / n];
}

export function pointInPoly(x: number, y: number, p: Float32Array): boolean {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

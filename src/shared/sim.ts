// 게임 로직(시뮬레이션). DOM·화면을 전혀 모른다 → Web Worker, 서버(Node), 테스트에서 그대로 돈다.
// 싸움은 체력 방식: 머리로 상대 몸을 물면 피해, 강한 몸에 박으면 튕겨 나며 반동 피해.
// 감싸기 압착만 한 방(필살기)으로 남는다.
import { CONFIG, maxHpFor, radiusFor } from './config';
import { Rng } from './rng';
import { botThink, bossThink } from './bot';
import { biteOf, dmgMult, relation } from './combat';
import { beats, CYCLE, LINEAGE, SPECIES_BY_ID, speciesFor, type Lineage, type Part, type Species } from './species';
import { emptyCommand, type Card, type Command, type DeathCause, type GameEvent, type HitKind, type RingView, type SnakeView, type Snapshot } from './types';

export interface Snake {
  id: number;
  name: string;
  isPlayer: boolean;
  isBoss: boolean;
  alive: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  angle: number;
  path: number[];
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
  // 체력
  hp: number;
  maxHp: number;
  hurtT: number;
  biteCd: number;
  invulnT: number;
  wallCd: number;
  dropAcc: number;
  poisonT: number;
  poisonDps: number;
  poisonBy: number;
  lives: number;
  // 진화
  stage: number;
  lineage: Lineage;
  species: Species;
  gauge: number;
  cards: Card[] | null;
  cardsRefresh: number;
  moltT: number;
  moltTotal: number;
  moltTarget: Card | null;
  mastery: number;
  history: string[];
  lastSkillSeq: number;
  lastMoltSeq: number;
  skillCd: number;
  // 상태
  stunT: number;
  slowT: number;
  rootT: number;
  flyT: number;
  flyLand: Part | null;
  dashT: number;
  dashMul: number;
  dashCut: boolean;
  dashPush: boolean;
  dashHits: Set<number>;
  shieldT: number;
  shieldMode: 'nocut' | 'retaliate';
  magnetT: number;
  magnetR: number;
  ringFastT: number;
  trailT: number;
  trailPart: Part | null;
  trailAcc: number;
  poisonAcc: number;
  matchupT: number;
  // 봇
  hunter: boolean;
  side: number;
  modeT: number;
  hunting: boolean;
  wanderX: number;
  wanderY: number;
  moltDelay: number;
}

export interface Food {
  x: number;
  y: number;
  r: number;
  ep: number;
  kind: 0 | 1 | 2;
  life: number;
}

export interface Ring {
  owner: number;
  poly: Float32Array;
  cx: number;
  cy: number;
  t: number;
  total: number;
  inside: Map<number, boolean>;
}

export interface Zone {
  x: number;
  y: number;
  r: number;
  kind: 'poison' | 'slow' | 'root';
  life: number;
  max: number;
  owner: number;
  dps: number;
}

interface Proj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  owner: number;
  slow: number;
  dmg: number;
}

interface Shadow {
  x: number;
  y: number;
  r: number;
  t: number;
  total: number;
}

interface Bite {
  a: Snake; // 무는 쪽
  b: Snake; // 물리는 쪽
  x: number;
  y: number;
}

const CELL = 64;
const BOT_NAMES = ['꼬물이', '초록띠', '방울이', '줄무늬', '노랑이', '솜털이', '먹보', '느림보', '반짝이', '뿔뿔이', '콩콩이', '바스락', '꿈틀이', '쪼꼬미', '대장벌레', '깡총이'];
const WIN_TEXT: Record<Lineage, string> = {
  none: '',
  armor: '단단한 껍질!',
  hunt: '빠른 사냥!',
  swarm: '수로 밀어붙였다!',
  poison: '독이 스며든다!',
  spider: '거미줄에 걸렸다!',
};

export class Simulation {
  readonly dt = 1 / CONFIG.tickRate;
  tick = 0;
  rng: Rng;
  snakes: Snake[] = [];
  foods: Food[] = [];
  rings: Ring[] = [];
  zones: Zone[] = [];
  projs: Proj[] = [];
  shadows: Shadow[] = [];
  events: GameEvent[] = [];
  playerId = 0;
  bossId = -1;
  state: 'playing' | 'won' | 'lost' = 'playing';
  private grid = new Map<number, number[]>();
  private birdPhase: 'idle' | 'warn' | 'dive' = 'idle';
  private birdNext: number = CONFIG.birdFirst;
  private birdT = 0;
  private divesLeft = 0;

  constructor(seed: number, playerName = '나', startStage = 1) {
    this.rng = new Rng(seed);
    this.reset(playerName, startStage);
  }

  get time() {
    return this.tick * this.dt;
  }

  reset(playerName: string, startStage = 1) {
    this.tick = 0;
    this.snakes = [];
    this.foods = [];
    this.rings = [];
    this.zones = [];
    this.projs = [];
    this.shadows = [];
    this.events = [];
    this.bossId = -1;
    this.state = 'playing';
    this.birdPhase = 'idle';
    this.birdNext = CONFIG.birdFirst;
    const p = this.makeSnake(0, playerName, true);
    p.lives = CONFIG.lives;
    // 시험용: ?stage=N 으로 N단계에서 시작
    const st = Math.max(1, Math.min(5, Math.floor(startStage)));
    if (st > 1) {
      this.setForm(p, st, this.rng.pick(CYCLE));
      p.history = ['caterpillar', p.species.id];
    }
    this.spawnAt(p, 0, 0, this.rng.range(0, Math.PI * 2), CONFIG.botStartSegs[st]);
    this.fullHeal(p);
    this.snakes.push(p);
    for (let i = 0; i < CONFIG.botCount; i++) {
      const b = this.makeSnake(i + 1, BOT_NAMES[i % BOT_NAMES.length], false);
      b.hunter = i % 2 === 0;
      this.snakes.push(b);
      const roll = this.rng.next();
      this.respawnBot(b, roll < 0.5 ? 1 : roll < 0.85 ? 2 : 3);
    }
    for (let i = 0; i < CONFIG.foodCount; i++) this.foods.push(this.newFood(0));
    for (let i = 0; i < CONFIG.bigFoodCount; i++) this.foods.push(this.newFood(1));
    this.buildGrid();
    if (st >= 5) this.spawnBoss();
  }

  private makeSnake(id: number, name: string, isPlayer: boolean): Snake {
    return {
      id, name, isPlayer, isBoss: false, alive: true,
      x: 0, y: 0, px: 0, py: 0, angle: 0, path: [], segCount: CONFIG.startSegments, growth: 0,
      segs: new Float32Array(0), segN: 0, r: CONFIG.stageRadius[1],
      cmd: emptyCommand(),
      boosting: false, sneaking: false, boostAcc: 0,
      totalEP: 0, kills: 0, crushes: 0, score: 0, respawnT: 0, loopCd: 0,
      hp: 1, maxHp: 1, hurtT: 99, biteCd: 0, invulnT: 0, wallCd: 0, dropAcc: 0, poisonT: 0, poisonDps: 0, poisonBy: -1, lives: 1,
      stage: 1, lineage: 'none', species: SPECIES_BY_ID.get('caterpillar')!, gauge: 0, cards: null, cardsRefresh: 0,
      moltT: 0, moltTotal: 0, moltTarget: null, mastery: 0, history: ['caterpillar'], lastSkillSeq: 0, lastMoltSeq: 0, skillCd: 0,
      stunT: 0, slowT: 0, rootT: 0, flyT: 0, flyLand: null, dashT: 0, dashMul: 1, dashCut: false, dashPush: false, dashHits: new Set(),
      shieldT: 0, shieldMode: 'nocut', magnetT: 0, magnetR: 0, ringFastT: 0, trailT: 0, trailPart: null, trailAcc: 0, poisonAcc: 0, matchupT: 0,
      hunter: false, side: this.rng.next() < 0.5 ? -1 : 1, modeT: 0, hunting: false, wanderX: 0, wanderY: 0, moltDelay: 0,
    };
  }

  private setForm(s: Snake, stage: number, lineage: Lineage) {
    s.stage = stage;
    s.lineage = stage <= 1 ? 'none' : lineage;
    s.species = speciesFor(s.lineage, stage);
    this.updateSize(s);
  }

  /** 굵기·최대 체력을 단계와 길이에 맞춘다 */
  private updateSize(s: Snake) {
    if (s.isBoss) {
      s.r = CONFIG.bossRadius;
      s.maxHp = CONFIG.bossHp;
      return;
    }
    s.r = radiusFor(s.stage, LINEAGE[s.lineage].radiusMul, s.segCount);
    s.maxHp = maxHpFor(s.stage, s.segCount);
    if (s.hp > s.maxHp) s.hp = s.maxHp;
  }

  private fullHeal(s: Snake) {
    this.updateSize(s);
    s.hp = s.maxHp;
    s.hurtT = 99;
    s.poisonT = 0;
  }

  private clearStatus(s: Snake) {
    s.stunT = s.slowT = s.rootT = s.flyT = s.dashT = s.shieldT = s.magnetT = s.ringFastT = s.trailT = 0;
    s.flyLand = s.trailPart = null;
    s.dashCut = s.dashPush = false;
    s.dashHits.clear();
    s.moltT = 0;
    s.moltTarget = null;
    s.cards = null;
    s.skillCd = 0;
    s.poisonT = 0;
    s.biteCd = 0;
  }

  /** 머리를 (x,y)에 두고 몸을 반대 방향으로 곧게 펼친다 */
  spawnAt(s: Snake, x: number, y: number, angle: number, segCount: number) {
    s.alive = true;
    s.x = s.px = x;
    s.y = s.py = y;
    s.angle = angle;
    s.cmd = { ...s.cmd, angle, boost: false, sneak: false };
    s.segCount = segCount;
    s.growth = 0;
    s.boostAcc = 0;
    s.loopCd = 0;
    this.updateSize(s);
    const sp = s.r * CONFIG.spacingRatio;
    const len = segCount * sp + 40;
    s.path = [];
    const steps = Math.ceil(len / 3);
    for (let i = steps; i >= 0; i--) s.path.push(x - Math.cos(angle) * i * 3, y - Math.sin(angle) * i * 3);
    this.rebuildSegs(s);
  }

  /** 다른 곤충과 떨어진 빈자리 */
  private safeSpot(avoid: Snake | null, minDist = 600): [number, number] {
    const R = CONFIG.arenaRadius * 0.85;
    let bx = 0, by = 0, best = -1;
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = Math.sqrt(this.rng.next()) * R;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      let near = Infinity;
      for (const o of this.snakes) {
        if (!o.alive || o === avoid) continue;
        near = Math.min(near, Math.hypot(x - o.x, y - o.y));
      }
      if (near > best) ((best = near), (bx = x), (by = y));
      if (near > minDist) break;
    }
    return [bx, by];
  }

  private respawnBot(b: Snake, stage: number) {
    const [x, y] = this.safeSpot(b, 600);
    b.totalEP = b.kills = b.crushes = b.score = 0;
    b.modeT = 0;
    b.hunting = false;
    b.mastery = 0;
    b.gauge = 0;
    this.clearStatus(b);
    const lin = stage > 1 ? this.rng.pick(CYCLE) : 'none';
    this.setForm(b, stage, lin);
    b.history = stage > 1 ? ['caterpillar', b.species.id] : ['caterpillar'];
    const segs = Math.max(CONFIG.startSegments, Math.round(this.rng.range(0.7, 1.3) * CONFIG.botStartSegs[stage]));
    this.spawnAt(b, x, y, this.rng.range(0, Math.PI * 2), segs);
    this.fullHeal(b);
    this.events.push({ type: 'respawn', snake: b.id });
  }

  /** 플레이어 부활: 단계는 그대로, 길이 절반, 잠시 무적 */
  private respawnPlayer(p: Snake, deathLen: number) {
    const [x, y] = this.safeSpot(p, 700);
    this.clearStatus(p);
    const segs = Math.max(CONFIG.startSegments, Math.floor(deathLen / 2));
    this.spawnAt(p, x, y, this.rng.range(0, Math.PI * 2), segs);
    this.fullHeal(p);
    p.invulnT = CONFIG.invulnTime;
    this.events.push({ type: 'respawn', snake: p.id });
  }

  private newFood(kind: 0 | 1): Food {
    const R = CONFIG.arenaRadius - 30;
    const a = this.rng.range(0, Math.PI * 2);
    const d = Math.sqrt(this.rng.next()) * R;
    return {
      x: Math.cos(a) * d, y: Math.sin(a) * d,
      r: kind === 1 ? CONFIG.bigFoodRadius : CONFIG.foodRadius,
      ep: kind === 1 ? CONFIG.bigFoodEP : CONFIG.foodEP,
      kind, life: Infinity,
    };
  }

  private dropFood(x: number, y: number, ep: number, life = 40) {
    this.foods.push({ x: x + this.rng.range(-5, 5), y: y + this.rng.range(-5, 5), r: CONFIG.remainsRadius, ep, kind: 2, life });
  }

  setCommand(id: number, cmd: Command) {
    const s = this.snakes[id];
    if (s) s.cmd = cmd;
  }

  /** 유효 단계(카드·봇 판단용) = 단계 + (상성이 유리하면 1) */
  eff(a: Snake, b: Snake): number {
    return (a.isBoss ? 6 : a.stage) + (beats(a.lineage, b.lineage) ? 1 : 0);
  }

  mult(a: Snake, b: Snake): number {
    return dmgMult(a, b);
  }

  /** o가 s보다 강한가 */
  stronger(o: Snake, s: Snake): boolean {
    return relation(s, o) < 0;
  }

  /** 몸 마디 위치를 머리가 지나온 길에서 일정 간격으로 뽑는다 */
  rebuildSegs(s: Snake) {
    const sp = s.r * CONFIG.spacingRatio;
    const need = Math.max(1, s.segCount);
    if (s.segs.length < need * 2) s.segs = new Float32Array(need * 2 + 64);
    const p = s.path;
    let lastX = p[p.length - 2];
    let lastY = p[p.length - 1];
    s.segs[0] = lastX;
    s.segs[1] = lastY;
    let n = 1;
    let carry = 0;
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
        ox = nx;
        oy = ny;
        dx = x - ox;
        dy = y - oy;
        d = Math.hypot(dx, dy);
        carry = 0;
      }
      carry += d;
      lastX = x;
      lastY = y;
      cutIndex = i;
    }
    while (n < need) {
      s.segs[n * 2] = s.segs[(n - 1) * 2];
      s.segs[n * 2 + 1] = s.segs[(n - 1) * 2 + 1];
      n++;
    }
    s.segN = n;
    const keepFrom = Math.max(0, cutIndex - 20);
    if (keepFrom > 400) s.path.splice(0, keepFrom);
  }

  step() {
    const dt = this.dt;
    // 1) 봇·보스 생각 → 명령
    for (const s of this.snakes) {
      if (!s.alive || s.isPlayer) continue;
      s.cmd = s.isBoss ? bossThink(this, s, dt) : botThink(this, s, dt);
    }
    // 2) 명령 처리(스킬·탈피) + 상태 시간 + 이동
    for (const s of this.snakes) {
      if (!s.alive) continue;
      this.handleActions(s, dt);
      this.tickStatus(s, dt);
      if (s.alive) this.moveSnake(s, dt);
    }
    // 3) 먹기, 장판, 투사체
    this.eatFoods();
    this.updateZones(dt);
    this.updateProjs(dt);
    // 4) 충돌: 같은 틱 기준으로 모은 뒤 한꺼번에 적용
    this.buildGrid();
    this.checkCollisions();
    // 5) 고리
    for (const s of this.snakes) {
      if (!s.alive) continue;
      s.loopCd -= dt;
      if (s.loopCd <= 0) this.detectLoop(s);
    }
    this.updateRings(dt);
    // 6) 천적, 부활, 먹이 보충
    this.updateBird(dt);
    for (const s of this.snakes) {
      if (s.alive || s.isBoss) continue;
      s.respawnT -= dt;
      if (s.respawnT > 0) continue;
      if (s.isPlayer) {
        if (s.lives > 0 && this.state === 'playing') this.respawnPlayer(s, s.segCount);
      } else this.respawnBot(s, this.rng.next() < 0.7 ? 1 : 2);
    }
    this.refillFoods(dt);
    for (const s of this.snakes) s.score = Math.floor(s.totalEP + s.kills * CONFIG.scoreKill + s.crushes * CONFIG.scoreCrush + (s.stage - 1) * CONFIG.scoreMolt);
    this.tick++;
  }

  // ---------- 진화 ----------

  private handleActions(s: Snake, dt: number) {
    const c = s.cmd;
    // 스킬
    if (c.skillSeq !== s.lastSkillSeq) {
      s.lastSkillSeq = c.skillSeq;
      if (s.skillCd <= 0 && s.species.parts.length && s.moltT <= 0 && s.stunT <= 0 && !s.isBoss) this.castSkill(s);
    }
    s.skillCd = Math.max(0, s.skillCd - dt);
    // 진화 카드
    const need = CONFIG.stageGauge[s.stage];
    if (!s.isBoss && s.stage < 5 && s.moltT <= 0 && s.gauge >= need) {
      if (!s.cards) this.makeCards(s);
      s.cardsRefresh -= dt;
      if (s.cardsRefresh <= 0) this.refreshCardCounts(s);
    }
    if (c.moltSeq !== s.lastMoltSeq) {
      s.lastMoltSeq = c.moltSeq;
      if (s.cards && s.moltT <= 0) {
        const card = s.cards[Math.max(0, Math.min(s.cards.length - 1, c.moltChoice))];
        const switching = s.stage >= 2 && card.lineage !== s.lineage;
        s.moltTarget = card;
        s.moltT = s.moltTotal = switching ? CONFIG.moltTimeSwitch : CONFIG.moltTime;
        s.cards = null;
        this.events.push({ type: 'moltStart', snake: s.id, species: card.species });
      }
    }
    if (s.moltT > 0) {
      s.moltT -= dt;
      if (s.moltT <= 0) this.finishMolt(s);
    }
  }

  private finishMolt(s: Snake) {
    const t = s.moltTarget!;
    const same = s.stage >= 2 && t.lineage === s.lineage;
    s.mastery = same ? Math.min(CONFIG.masteryMax, s.mastery + 1) : 0;
    s.gauge = Math.max(0, s.gauge - CONFIG.stageGauge[s.stage]);
    this.setForm(s, s.stage + 1, t.lineage);
    s.moltT = 0;
    s.moltTarget = null;
    s.skillCd = 0;
    s.history.push(s.species.id);
    this.fullHeal(s); // 탈피하면 체력이 가득 찬다
    this.rebuildSegs(s);
    this.events.push({ type: 'molt', snake: s.id, species: s.species.id, x: s.x, y: s.y });
    if (s.isPlayer && s.stage >= 5 && this.bossId < 0) this.spawnBoss();
  }

  private nearbyThreats(s: Snake) {
    const next = s.stage + 1;
    const counts: Record<string, number> = {};
    for (const o of this.snakes) {
      if (!o.alive || o.id === s.id || o.isBoss || o.lineage === 'none') continue;
      if (Math.abs(o.stage - next) > 1) continue;
      if (Math.hypot(o.x - s.x, o.y - s.y) > CONFIG.cardScanRadius) continue;
      counts[o.lineage] = (counts[o.lineage] ?? 0) + 1;
    }
    return counts;
  }

  private cardFor(lineage: Lineage, stage: number, counts: Record<string, number>): Card {
    let good = 0, bad = 0;
    for (const [l, n] of Object.entries(counts)) {
      if (beats(lineage, l as Lineage)) good += n;
      if (beats(l as Lineage, lineage)) bad += n;
    }
    return { lineage, species: speciesFor(lineage, stage).id, good, bad };
  }

  makeCards(s: Snake) {
    const counts = this.nearbyThreats(s);
    const next = s.stage + 1;
    // 주변에 가장 많은 갈래를 이기는 갈래 1장은 보장
    let common: Lineage | null = null, best = 0;
    for (const [l, n] of Object.entries(counts)) if (n > best) ((best = n), (common = l as Lineage));
    const picked: Lineage[] = [];
    if (common) {
      const winners = CYCLE.filter((l) => beats(l, common!));
      picked.push(this.rng.pick(winners));
    }
    while (picked.length < 3) {
      const l = this.rng.pick(CYCLE);
      if (!picked.includes(l)) picked.push(l);
    }
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    s.cards = picked.map((l) => this.cardFor(l, next, counts));
    s.cardsRefresh = 1;
    s.moltDelay = this.rng.range(0.3, 3);
  }

  private refreshCardCounts(s: Snake) {
    if (!s.cards) return;
    const counts = this.nearbyThreats(s);
    s.cards = s.cards.map((c) => this.cardFor(c.lineage, s.stage + 1, counts));
    s.cardsRefresh = 1;
  }

  /** 먹이: 진화 게이지 + 성장(길수록 느림) + 체력 회복 */
  feed(s: Snake, ep: number) {
    s.totalEP += ep;
    if (s.stage < 5) s.gauge += ep;
    if (!s.isBoss) {
      s.growth += (ep * CONFIG.stageGrowth[s.stage]) / (1 + s.segCount / CONFIG.growthSlowLen);
      while (s.growth >= 1) {
        s.growth -= 1;
        s.segCount++;
      }
      this.updateSize(s);
    }
    s.hp = Math.min(s.maxHp, s.hp + ep * CONFIG.foodHeal);
  }

  // ---------- 피해 ----------

  /** t에게 피해. 실제로 들어간 피해를 돌려준다 */
  damage(t: Snake, amount: number, by: number, kind: HitKind, x: number, y: number, cause: DeathCause = 'bite'): number {
    if (!t.alive || amount <= 0) return 0;
    const atk = by >= 0 ? this.snakes[by] : null;
    const good = !!atk && !atk.isBoss && !t.isBoss && beats(atk.lineage, t.lineage);
    if (t.invulnT > 0 || (t.shieldT > 0 && t.shieldMode === 'nocut') || t.flyT > 0) {
      this.events.push({ type: 'hit', snake: t.id, by, dmg: 0, x, y, kind, good, blocked: true });
      return 0;
    }
    let d = amount;
    if (t.lineage === 'armor') d *= CONFIG.armorTakenMul;
    if (t.sneaking && !t.isBoss) d *= CONFIG.guardMul;
    d = Math.max(1, Math.round(d));
    t.hp -= d;
    t.hurtT = 0;
    // 피해에 비례해 꼬리 마디가 떨어진다(먹이가 됨)
    if (!t.isBoss) {
      t.dropAcc += d * CONFIG.tailDropPerDmg;
      const n = Math.min(Math.floor(t.dropAcc), Math.max(0, t.segCount - CONFIG.startSegments));
      t.dropAcc -= Math.floor(t.dropAcc);
      if (n > 0) this.dropTail(t, n);
    }
    this.events.push({ type: 'hit', snake: t.id, by, dmg: d, x, y, kind, good });
    if (atk && good && (atk.isPlayer || t.isPlayer) && atk.matchupT <= 0) {
      atk.matchupT = 2;
      this.events.push({ type: 'matchup', x, y, text: WIN_TEXT[atk.lineage], good: atk.isPlayer });
    }
    if (t.hp <= 0) this.kill(t, by, cause);
    return d;
  }

  private dropTail(t: Snake, n: number) {
    for (let k = 0; k < n && t.segCount > CONFIG.startSegments; k++) {
      const ti = Math.min(t.segN, t.segCount) - 1;
      this.dropFood(t.segs[ti * 2], t.segs[ti * 2 + 1], Math.max(1, t.stage));
      t.segCount--;
    }
    this.updateSize(t);
  }

  // ---------- 스킬 ----------

  private castSkill(s: Snake) {
    const sp = s.species;
    s.skillCd = sp.cd * (1 - CONFIG.masteryCdCut * s.mastery);
    this.events.push({ type: 'skill', snake: s.id, species: sp.id, x: s.x, y: s.y, angle: s.angle });
    for (const part of sp.parts) this.applyPart(s, part, s.x, s.y);
  }

  private skillDmg(s: Snake) {
    return CONFIG.skillDamage[s.stage] * (1 + 0.1 * s.mastery);
  }

  private applyPart(s: Snake, p: Part, cx: number, cy: number) {
    switch (p.k) {
      case 'dash':
        s.dashT = p.dur;
        s.dashMul = p.mult;
        s.dashCut = !!p.cut;
        s.dashPush = !!p.push;
        s.dashHits.clear();
        break;
      case 'fly':
        s.flyT = p.dur;
        s.flyLand = p.land ?? null;
        break;
      case 'shield':
        s.shieldT = p.dur;
        s.shieldMode = p.mode;
        break;
      case 'magnet':
        s.magnetT = p.dur;
        s.magnetR = p.radius;
        break;
      case 'ringfast':
        s.ringFastT = p.dur;
        break;
      case 'zone':
        if (p.shape === 'trail') {
          s.trailT = p.trailDur ?? 2;
          s.trailPart = p;
          s.trailAcc = 0;
        } else {
          const d = p.radius + s.r + 10;
          this.zones.push({ x: cx + Math.cos(s.angle) * d, y: cy + Math.sin(s.angle) * d, r: p.radius, kind: p.effect, life: p.life, max: p.life, owner: s.id, dps: 0 });
        }
        break;
      case 'proj':
        for (let i = 0; i < p.count; i++) {
          const a = s.angle + (i - (p.count - 1) / 2) * p.spread;
          this.projs.push({ x: cx, y: cy, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, life: 1.1, owner: s.id, slow: p.slow, dmg: this.skillDmg(s) * 0.4 });
        }
        break;
      case 'cone': {
        const dir = s.angle + (p.back ? Math.PI : 0);
        this.events.push({ type: 'cone', x: cx, y: cy, angle: dir, range: p.range, half: p.half, kind: p.effect });
        this.forEachHit(s, (o, i, x, y) => {
          const dx = x - cx, dy = y - cy;
          const d = Math.hypot(dx, dy);
          if (d > p.range + o.r) return false;
          let da = Math.atan2(dy, dx) - dir;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          return Math.abs(da) <= p.half || d < s.r + o.r;
        }, (o, x, y) => this.skillEffect(s, o, p.effect, p.dur ?? 0, x, y));
        break;
      }
      case 'aoe': {
        this.events.push({ type: 'aoe', x: cx, y: cy, r: p.radius, kind: p.effect });
        this.forEachHit(s, (o, i, x, y) => Math.hypot(x - cx, y - cy) <= p.radius + o.r, (o, x, y) => {
          if (p.effect === 'push') {
            const a = Math.atan2(o.y - cy, o.x - cx);
            o.angle = a;
            this.shove(o, a, 40);
            this.damage(o, this.skillDmg(s) * 0.25 * this.mult(s, o), s.id, 'skill', x, y, 'skill');
            this.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: 'push' });
          } else this.skillEffect(s, o, p.effect, p.dur ?? 0, x, y);
        });
        break;
      }
    }
  }

  /** 범위 안 상대마다 '처음 닿은 마디'로 한 번씩 효과를 준다 */
  private forEachHit(s: Snake, inRange: (o: Snake, i: number, x: number, y: number) => boolean, apply: (o: Snake, x: number, y: number) => void) {
    for (const o of this.snakes) {
      if (!o.alive || o.id === s.id || o.flyT > 0) continue;
      for (let i = 0; i < o.segN; i++) {
        const x = o.segs[i * 2], y = o.segs[i * 2 + 1];
        if (inRange(o, i, x, y)) {
          apply(o, x, y);
          break;
        }
      }
    }
  }

  private skillEffect(s: Snake, o: Snake, effect: 'cut' | 'stun', dur: number, x: number, y: number) {
    const base = this.skillDmg(s) * this.mult(s, o);
    if (effect === 'cut') {
      this.damage(o, base, s.id, 'skill', x, y, 'skill');
      this.events.push({ type: 'skillHit', x, y, kind: 'cut' });
    } else {
      if (!o.isBoss && o.invulnT <= 0) o.stunT = Math.max(o.stunT, dur);
      this.damage(o, base * 0.45, s.id, 'skill', x, y, 'skill');
      this.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: 'stun' });
    }
  }

  private shove(o: Snake, a: number, dist: number) {
    o.px = o.x;
    o.py = o.y;
    o.x += Math.cos(a) * dist;
    o.y += Math.sin(a) * dist;
    o.path.push(o.x, o.y);
    this.rebuildSegs(o);
  }

  private tickStatus(s: Snake, dt: number) {
    s.stunT = Math.max(0, s.stunT - dt);
    s.slowT = Math.max(0, s.slowT - dt);
    s.rootT = Math.max(0, s.rootT - dt);
    s.shieldT = Math.max(0, s.shieldT - dt);
    s.ringFastT = Math.max(0, s.ringFastT - dt);
    s.invulnT = Math.max(0, s.invulnT - dt);
    s.biteCd = Math.max(0, s.biteCd - dt);
    s.wallCd = Math.max(0, s.wallCd - dt);
    s.matchupT = Math.max(0, s.matchupT - dt);
    s.hurtT += dt;
    // 회복
    if (s.hurtT > CONFIG.regenDelay && s.hp < s.maxHp) {
      const mul = s.lineage === 'swarm' ? CONFIG.swarmRegenMul : 1;
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * CONFIG.regenRate * mul * dt);
    }
    // 물기 독
    if (s.poisonT > 0) {
      s.poisonT -= dt;
      s.poisonAcc += dt;
      if (s.poisonAcc >= CONFIG.poisonTick) {
        s.poisonAcc = 0;
        this.damage(s, s.poisonDps * CONFIG.poisonTick, s.poisonBy, 'poison', s.x, s.y, 'poison');
        if (!s.alive) return;
      }
    }
    if (s.dashT > 0) {
      s.dashT -= dt;
      if (s.dashT <= 0) s.dashCut = s.dashPush = false;
    }
    if (s.flyT > 0) {
      s.flyT -= dt;
      if (s.flyT <= 0 && s.flyLand) {
        const land = s.flyLand;
        s.flyLand = null;
        this.applyPart(s, land, s.x, s.y);
      }
    }
    if (s.magnetT > 0) {
      s.magnetT -= dt;
      const R = s.magnetR;
      for (const f of this.foods) {
        const dx = s.x - f.x, dy = s.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 1) {
          const v = Math.min(d, 420 * dt);
          f.x += (dx / d) * v;
          f.y += (dy / d) * v;
        }
      }
    }
    if (s.trailT > 0 && s.trailPart && s.trailPart.k === 'zone') {
      s.trailT -= dt;
      s.trailAcc += dt;
      if (s.trailAcc >= 0.08) {
        s.trailAcc = 0;
        const tp = s.trailPart;
        const ti = Math.min(s.segN - 1, 2);
        this.zones.push({ x: s.segs[ti * 2], y: s.segs[ti * 2 + 1], r: tp.radius, kind: tp.effect, life: tp.life, max: tp.life, owner: s.id, dps: this.skillDmg(s) * CONFIG.poisonZoneDps });
      }
    }
  }

  // ---------- 이동 ----------

  private moveSnake(s: Snake, dt: number) {
    const c = s.cmd;
    const lin = LINEAGE[s.lineage];
    const busy = s.moltT > 0 || s.stunT > 0 || s.rootT > 0;
    s.sneaking = c.sneak && !s.isBoss;
    s.boosting = c.boost && !c.sneak && !busy && s.segCount > CONFIG.boostMinSegments && s.dashT <= 0;
    const sizeSlow = 1 - CONFIG.sizeTurnSlow * Math.min(1, Math.max(0, s.segCount - CONFIG.startSegments) / 200);
    let maxTurn = s.isBoss ? CONFIG.bossTurn * dt : CONFIG.turnRate * lin.turnMul * dt * sizeSlow * (s.sneaking ? CONFIG.sneakTurnMul : 1);
    if (s.stunT > 0) maxTurn = 0;
    let diff = c.angle - s.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    let speed = s.isBoss ? CONFIG.bossSpeed : CONFIG.stageSpeed[s.stage] * lin.speedMul;
    if (s.boosting) speed *= CONFIG.boostMul;
    else if (s.sneaking) speed *= CONFIG.sneakMul;
    if (s.dashT > 0) speed *= s.dashMul;
    if (s.moltT > 0) speed *= CONFIG.moltSpeedMul;
    if (s.slowT > 0) speed *= 0.5;
    if (s.stunT > 0) speed *= 0.25;
    if (s.rootT > 0) speed = 0;
    if (s.boosting) {
      s.boostAcc += dt;
      if (s.boostAcc >= CONFIG.boostDropInterval) {
        s.boostAcc -= CONFIG.boostDropInterval;
        const tx = s.segs[(s.segN - 1) * 2], ty = s.segs[(s.segN - 1) * 2 + 1];
        s.segCount--;
        this.updateSize(s);
        this.dropFood(tx, ty, 1, 30);
      }
    } else s.boostAcc = 0;
    s.px = s.x;
    s.py = s.y;
    if (speed > 0) {
      s.x += Math.cos(s.angle) * speed * dt;
      s.y += Math.sin(s.angle) * speed * dt;
      s.path.push(s.x, s.y);
    }
    this.rebuildSegs(s);
  }

  private eatFoods() {
    const foods = this.foods;
    for (const s of this.snakes) {
      if (!s.alive || s.isBoss) continue;
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
    for (let k = 0; k < 3 && normal < CONFIG.foodCount; k++, normal++) this.foods.push(this.newFood(0));
    if (big < CONFIG.bigFoodCount && this.rng.next() < 0.03) this.foods.push(this.newFood(1));
  }

  private updateZones(dt: number) {
    for (let k = this.zones.length - 1; k >= 0; k--) {
      const z = this.zones[k];
      z.life -= dt;
      let consumed = false;
      for (const o of this.snakes) {
        if (!o.alive || o.id === z.owner || o.flyT > 0) continue;
        const d = Math.hypot(o.x - z.x, o.y - z.y);
        if (d > z.r + o.r * 0.5) continue;
        if (z.kind === 'slow') {
          if (!o.isBoss) o.slowT = Math.max(o.slowT, 0.3);
        } else if (z.kind === 'root') {
          if (!o.isBoss) o.rootT = 2;
          this.damage(o, this.skillDmg(this.snakes[z.owner]) * 0.3, z.owner, 'skill', o.x, o.y, 'skill');
          this.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: 'root' });
          consumed = true;
          break;
        } else {
          o.poisonAcc += dt;
          if (o.poisonAcc >= CONFIG.poisonTick) {
            o.poisonAcc = 0;
            this.damage(o, z.dps * CONFIG.poisonTick, z.owner, 'poison', o.x, o.y, 'poison');
          }
        }
      }
      if (consumed || z.life <= 0) this.zones.splice(k, 1);
    }
  }

  private updateProjs(dt: number) {
    for (let k = this.projs.length - 1; k >= 0; k--) {
      const p = this.projs[k];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      let hit = false;
      for (const o of this.snakes) {
        if (!o.alive || o.id === p.owner || o.flyT > 0) continue;
        for (let i = 0; i < o.segN; i += 2) {
          const dx = o.segs[i * 2] - p.x, dy = o.segs[i * 2 + 1] - p.y;
          const rr = o.r + 6;
          if (dx * dx + dy * dy < rr * rr) {
            if (!o.isBoss) o.slowT = Math.max(o.slowT, p.slow);
            const owner = this.snakes[p.owner];
            this.damage(o, p.dmg * this.mult(owner, o), p.owner, 'skill', p.x, p.y, 'skill');
            this.events.push({ type: 'skillHit', x: p.x, y: p.y, kind: 'slow' });
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit || p.life <= 0) this.projs.splice(k, 1);
    }
  }

  // ---------- 충돌 ----------

  private buildGrid() {
    this.grid.clear();
    for (let si = 0; si < this.snakes.length; si++) {
      const s = this.snakes[si];
      if (!s.alive) continue;
      for (let i = 0; i < s.segN; i++) {
        const key = Math.floor(s.segs[i * 2] / CELL) * 73856093 + Math.floor(s.segs[i * 2 + 1] / CELL);
        let arr = this.grid.get(key);
        if (!arr) this.grid.set(key, (arr = []));
        arr.push((si << 16) | i);
      }
    }
  }

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

  /** 닿은 지점 반대쪽으로 튕겨 낸다(밀려나는 거리 = 넉백) */
  private bounce(a: Snake, sx: number, sy: number, push: number = CONFIG.knockback) {
    a.x = a.px;
    a.y = a.py;
    const away = Math.atan2(a.y - sy, a.x - sx);
    a.angle = away;
    a.x += Math.cos(away) * push;
    a.y += Math.sin(away) * push;
    a.path[a.path.length - 2] = a.x;
    a.path[a.path.length - 1] = a.y;
    this.rebuildSegs(a);
    this.events.push({ type: 'bounce', snake: a.id, x: a.x, y: a.y });
  }

  private checkCollisions() {
    const ringOwners = new Set(this.rings.map((r) => r.owner));
    const ringOf = new Map(this.rings.map((r) => [r.owner, r]));
    const bounces: [Snake, number, number][] = [];
    const bites: Bite[] = [];
    const dashHits: [Snake, Snake, number, number][] = [];
    for (const a of this.snakes) {
      if (!a.alive) continue;
      // 경기장 경계: 튕겨 나며 피해
      if (Math.hypot(a.x, a.y) > CONFIG.arenaRadius) {
        a.angle = Math.atan2(-a.y, -a.x);
        a.x = a.px;
        a.y = a.py;
        if (!a.isBoss && a.wallCd <= 0) {
          a.wallCd = 0.6;
          this.damage(a, a.maxHp * CONFIG.wallDamage, -1, 'wall', a.x, a.y, 'wall');
        }
        continue;
      }
      if (a.flyT > 0) continue;
      this.forSegsNear(a.x, a.y, a.r + 40, (b, i, sx, sy) => {
        if (b.id === a.id || b.flyT > 0 || !b.alive) return;
        const rr = (a.r + b.r) * 0.8;
        const dx = sx - a.x, dy = sy - a.y;
        if (dx * dx + dy * dy > rr * rr) return;
        const myRing = ringOf.get(a.id);
        if (myRing && myRing.inside.get(b.id)) return; // 내 고리 안 사냥감과는 부딪히지 않음
        if (i !== 0 && ringOwners.has(b.id)) {
          bounces.push([a, sx, sy]); // 고리는 벽
          return true;
        }
        // 돌진 스킬
        if (a.dashT > 0 && a.dashPush) {
          bounces.push([a, sx, sy]);
          return true;
        }
        if (a.dashT > 0 && a.dashCut) {
          if (!a.dashHits.has(b.id)) dashHits.push([a, b, sx, sy]);
          return true;
        }
        // 물기: 머리로 상대(머리든 몸이든)를 문다. 머리끼리면 서로 문다(상대 차례에 처리됨)
        bites.push({ a, b, x: sx, y: sy });
        bounces.push([a, sx, sy]);
        return true;
      });
    }
    for (const [a, sx, sy] of bounces) if (a.alive) this.bounce(a, sx, sy);
    for (const [a, b, x, y] of dashHits) {
      if (!a.alive || !b.alive || a.dashHits.has(b.id)) continue;
      a.dashHits.add(b.id);
      this.damage(b, this.skillDmg(a) * this.mult(a, b), a.id, 'skill', x, y, 'skill');
      this.events.push({ type: 'skillHit', x, y, kind: 'cut' });
    }
    for (const { a, b, x, y } of bites) {
      if (!a.alive || !b.alive || a.biteCd > 0) continue;
      a.biteCd = a.lineage === 'hunt' ? CONFIG.huntBiteCooldown : CONFIG.biteCooldown;
      // 무당벌레 '쓴맛 즙': 물면 내가 기절하고 피해를 되돌려 받음
      if (b.shieldT > 0 && b.shieldMode === 'retaliate') {
        a.stunT = Math.max(a.stunT, 1);
        this.events.push({ type: 'skillHit', x: a.x, y: a.y, kind: 'stun' });
        this.damage(a, biteOf(a) * this.mult(a, b), b.id, 'recoil', a.x, a.y, 'bite');
        continue;
      }
      const dmg = biteOf(a) * this.mult(a, b);
      this.damage(b, dmg, a.id, 'bite', x, y, 'bite');
      // 독 갈래: 독이 남는다 / 거미 갈래: 느려짐
      if (b.alive && a.lineage === 'poison') {
        b.poisonT = 2;
        b.poisonDps = (dmg * CONFIG.poisonBiteDot) / 2;
        b.poisonBy = a.id;
      }
      if (b.alive && a.lineage === 'spider' && !b.isBoss) b.slowT = Math.max(b.slowT, CONFIG.spiderBiteSlow);
      // 강한 몸에 박았으면 반동 피해
      if (a.alive && this.stronger(b, a)) {
        this.damage(a, biteOf(b) * this.mult(b, a) * CONFIG.recoilMul, b.id, 'recoil', a.x, a.y, 'bite');
      }
    }
  }

  // ---------- 감싸기 ----------

  private detectLoop(s: Snake) {
    if (this.rings.some((r) => r.owner === s.id)) return;
    const hit = s.r * 1.1;
    for (let i = CONFIG.loopMinIndex; i < s.segN; i++) {
      const dx = s.segs[i * 2] - s.x, dy = s.segs[i * 2 + 1] - s.y;
      if (dx * dx + dy * dy > hit * hit) continue;
      const poly = s.segs.slice(0, (i + 1) * 2);
      const area = Math.abs(polyArea(poly));
      if (Math.sqrt(area / Math.PI) < s.r * CONFIG.loopMinRadiusPerR) return;
      const [cx, cy] = polyCentroid(poly);
      const inside = new Map<number, boolean>();
      let trapped = 0;
      for (const o of this.snakes) {
        if (o.id === s.id || !o.alive) continue;
        const inn = pointInPoly(o.x, o.y, poly);
        inside.set(o.id, inn);
        if (inn) trapped++;
      }
      const delay = s.ringFastT > 0 ? CONFIG.crushDelayFast : CONFIG.crushDelay;
      this.rings.push({ owner: s.id, poly, cx, cy, t: delay, total: delay, inside });
      this.events.push({ type: 'ring', snake: s.id, cx, cy, trapped });
      s.loopCd = CONFIG.loopCooldown;
      return;
    }
  }

  private updateRings(dt: number) {
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const ring = this.rings[k];
      const owner = this.snakes[ring.owner];
      if (!owner.alive) {
        this.rings.splice(k, 1);
        continue;
      }
      for (const o of this.snakes) {
        if (o.id === ring.owner || !o.alive || o.flyT > 0) continue;
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
          if (o.id === ring.owner || !o.alive || o.flyT > 0) continue;
          if (!pointInPoly(o.x, o.y, ring.poly)) continue;
          if (o.isBoss) {
            // 보스는 한 방에 안 죽고 큰 피해
            this.damage(o, o.maxHp * CONFIG.bossCrushFrac, ring.owner, 'crush', o.x, o.y, 'crush');
            count++;
          } else if (o.invulnT <= 0) {
            this.events.push({ type: 'hit', snake: o.id, by: ring.owner, dmg: Math.ceil(o.hp), x: o.x, y: o.y, kind: 'crush', good: true });
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

  // ---------- 보스 ----------

  private spawnBoss() {
    const p = this.snakes[this.playerId];
    const b = this.makeSnake(this.snakes.length, '왕지네', false);
    b.isBoss = true;
    b.stage = 6;
    b.lineage = 'none';
    b.species = { ...SPECIES_BY_ID.get('caterpillar')!, id: 'boss', name: '왕지네', parts: [] };
    b.history = ['boss'];
    const toCenter = Math.atan2(-p.y, -p.x);
    let x = p.x + Math.cos(toCenter) * 900, y = p.y + Math.sin(toCenter) * 900;
    const d = Math.hypot(x, y);
    if (d > CONFIG.arenaRadius * 0.8) ((x *= (CONFIG.arenaRadius * 0.8) / d), (y *= (CONFIG.arenaRadius * 0.8) / d));
    this.snakes.push(b);
    this.spawnAt(b, x, y, Math.atan2(p.y - y, p.x - x), CONFIG.bossSegments);
    this.fullHeal(b);
    this.bossId = b.id;
    this.events.push({ type: 'boss', snake: b.id });
  }

  // ---------- 천적: 새 ----------

  private updateBird(dt: number) {
    if (this.state !== 'playing') return;
    if (this.birdPhase === 'idle') {
      if (this.time >= this.birdNext) {
        this.birdPhase = 'warn';
        this.birdT = CONFIG.birdWarn;
        this.events.push({ type: 'birdWarn' });
      }
    } else if (this.birdPhase === 'warn') {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdPhase = 'dive';
        this.divesLeft = CONFIG.birdDives;
        this.birdT = 0;
      }
    } else {
      this.birdT -= dt;
      if (this.birdT <= 0 && this.divesLeft > 0) {
        // 몸이 긴 곤충 상위 4마리 중 하나를 노린다(길수록, 웅크리지 않을수록 잘 걸림)
        const cands = this.snakes
          .filter((s) => s.alive && !s.isBoss)
          .map((s) => ({ s, v: s.segCount * (s.sneaking ? 0.4 : 1) }))
          .sort((a, b) => b.v - a.v)
          .slice(0, 4);
        let target: Snake | null = null;
        const sum = cands.reduce((n, c) => n + c.v, 0);
        let roll = this.rng.next() * sum;
        for (const c of cands) {
          roll -= c.v;
          if (roll <= 0) {
            target = c.s;
            break;
          }
        }
        if (!target && cands.length) target = cands[0].s;
        if (target) {
          const lead = CONFIG.birdShadowTime * 0.6;
          const sp = CONFIG.stageSpeed[target.stage];
          this.shadows.push({
            x: target.x + Math.cos(target.angle) * sp * lead,
            y: target.y + Math.sin(target.angle) * sp * lead,
            r: CONFIG.birdRadius, t: CONFIG.birdShadowTime, total: CONFIG.birdShadowTime,
          });
        }
        this.divesLeft--;
        this.birdT = CONFIG.birdDiveEvery;
      }
      if (this.divesLeft <= 0 && this.shadows.length === 0) {
        this.birdPhase = 'idle';
        this.birdNext = this.time + this.rng.range(CONFIG.birdEveryMin, CONFIG.birdEveryMax);
      }
    }
    for (let k = this.shadows.length - 1; k >= 0; k--) {
      const sh = this.shadows[k];
      sh.t -= dt;
      if (sh.t > 0) continue;
      this.events.push({ type: 'birdDive', x: sh.x, y: sh.y, r: sh.r });
      for (const s of this.snakes) {
        if (!s.alive || s.isBoss || s.flyT > 0) continue;
        const headIn = Math.hypot(s.x - sh.x, s.y - sh.y) < sh.r;
        let bodyIn = headIn;
        for (let i = 0; i < s.segN && !bodyIn; i += 2) if (Math.hypot(s.segs[i * 2] - sh.x, s.segs[i * 2 + 1] - sh.y) < sh.r) bodyIn = true;
        if (bodyIn) this.damage(s, s.maxHp * CONFIG.birdDamage * (headIn ? 1 : 0.6), -1, 'bird', s.x, s.y, 'bird');
      }
      this.shadows.splice(k, 1);
    }
  }

  // ---------- 죽음 ----------

  kill(s: Snake, by: number, cause: DeathCause) {
    if (!s.alive) return;
    s.alive = false;
    s.hp = 0;
    const ep = s.isBoss ? 3 : Math.max(1, s.stage);
    for (let i = 0; i < s.segN; i += s.segN > 150 ? 2 : 1) this.dropFood(s.segs[i * 2], s.segs[i * 2 + 1], ep);
    if (by >= 0 && by !== s.id) this.snakes[by].kills++;
    this.events.push({ type: 'death', snake: s.id, x: s.x, y: s.y, by, cause });
    this.rings = this.rings.filter((r) => r.owner !== s.id);
    if (s.isPlayer) {
      s.lives--;
      s.respawnT = CONFIG.respawnDelay;
      if (this.state === 'playing') {
        if (s.lives > 0) this.events.push({ type: 'lifeLost', lives: s.lives });
        else {
          this.state = 'lost';
          this.events.push({ type: 'end', won: false });
        }
      }
      return;
    }
    s.respawnT = CONFIG.botRespawnDelay;
    if (s.isBoss && this.state === 'playing') {
      if (by >= 0) this.snakes[by].totalEP += CONFIG.scoreBoss;
      this.state = 'won';
      this.events.push({ type: 'end', won: true });
    }
  }

  // ---------- 상태 보내기 ----------

  snapshot(): Snapshot {
    const snakes: SnakeView[] = this.snakes.map((s) => ({
      id: s.id, name: s.name, species: s.species.id, stage: s.stage, lineage: s.lineage,
      alive: s.alive, isPlayer: s.isPlayer, isBoss: s.isBoss, r: s.r, angle: s.angle,
      boosting: s.boosting, sneaking: s.sneaking,
      segs: s.alive ? s.segs.slice(0, s.segN * 2) : new Float32Array(0),
      score: s.score, kills: s.kills, crushes: s.crushes, length: s.segCount,
      hp: Math.max(0, Math.ceil(s.hp)), maxHp: s.maxHp,
      invuln: s.invulnT > 0, poisoned: s.poisonT > 0,
      molt: s.moltT > 0 ? 1 - s.moltT / s.moltTotal : 0,
      fly: s.flyT > 0, shield: s.shieldT > 0, stun: s.stunT > 0 || s.rootT > 0, slow: s.slowT > 0,
      dash: s.dashT > 0, magnet: s.magnetT > 0, ringFast: s.ringFastT > 0,
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
    const p = this.snakes[this.playerId];
    const lineageCount: Record<string, number> = {};
    for (const s of this.snakes) if (s.alive && !s.isBoss && s.lineage !== 'none') lineageCount[s.lineage] = (lineageCount[s.lineage] ?? 0) + 1;
    const events = this.events;
    this.events = [];
    return {
      tick: this.tick, time: this.time, snakes, foods, rings,
      zones: this.zones.map((z) => ({ x: z.x, y: z.y, r: z.r, kind: z.kind, life: z.life, max: z.max })),
      projs: this.projs.map((q) => ({ x: q.x, y: q.y, angle: Math.atan2(q.vy, q.vx) })),
      bird: { active: this.birdPhase !== 'idle', shadows: this.shadows.map((s) => ({ ...s })) },
      events, playerId: this.playerId,
      player: {
        gauge: p.gauge, need: CONFIG.stageGauge[p.stage], cards: p.cards, skillCd: p.skillCd,
        skillCdMax: p.species.cd * (1 - CONFIG.masteryCdCut * p.mastery), mastery: p.mastery, path: p.history, molting: p.moltT > 0,
        lives: p.lives, respawnIn: p.alive ? 0 : Math.max(0, p.respawnT),
      },
      bossId: this.bossId, state: this.state, lineageCount,
    };
  }
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

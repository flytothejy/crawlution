// 게임 로직(시뮬레이션). DOM·화면을 전혀 모른다 → Web Worker, 서버(Node), 테스트에서 그대로 돈다.
// 2판: 크롤러 하나를 골라 판 안에서 레벨(1~16)·진화(3단계)·능력 카드(4칸)로 키운다.
// 싸움은 체력 방식: 머리로 상대 몸을 물면 피해. 기술 2개(주·보조) + 본능 + 필살기.
import { CONFIG, evoOf, nutNeed, radiusFor } from './config';
import { Rng } from './rng';
import { botThink, bossThink, botPickCard } from './bot';
import { baseB, biteOf, maxHpOf } from './combat';
import { Enemies } from './enemies';
import { ABILITIES, ABILITY_BY_ID, BONUS_CARDS, type LevelCard, traitMod, hasSpecial, COMMON_TRAITS, familyTraits } from './cards';
import { COMMON_SUBS, FAMILIES, FAMILY, SPECIAL_FOODS, SPECIES, SPECIES_BY_ID, formsOf, taste, type Family, type FormDef, type Species, type SubDef } from './species';
import * as SK from './skills';
import {
  defaultOpts, emptyCommand, emptyStats,
  type CardView, type Command, type DeathCause, type EnemyKind, type FxKind, type GameEvent, type GameOpts, type HitKind, type MapTheme, type MapView,
  type MinionView, type ProjKind, type RingView, type SnakeView, type Snapshot, type Stats, type TeleView, type ZoneKind,
} from './types';

export type Personality = 'hunter' | 'gatherer' | 'brawler' | 'coward';

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
  // 크롤러
  sp: Species;
  fam: Family;
  form: FormDef;
  sub: SubDef | null;
  traits: Set<string>;
  // 성장
  level: number;
  evo: number; // 진화 단계 1~3
  nut: number; // 이번 레벨에서 모은 영양
  totalNut: number;
  abilities: { id: string; lv: number }[];
  mainLv: number; // 0~2
  subLv: number; // 0~1
  offer: { kind: 'level' | 'sub'; cards: LevelCard[] } | null;
  pending: number;
  subPending: boolean;
  newGiven: number; // 처음 세 번 새 능력 보장
  rerolls: number;
  evolveT: number;
  // 기록
  kills: number;
  /** 판 전체 처치·쓰러짐(봇이 새로 태어나도 이어 셈, 순위표 K/D) */
  killsAll: number;
  deaths: number;
  st: Stats;
  /** 통계용: 초마다 준 피해(최고 DPS), 마지막 기술 시각, 이번 목숨 시작, 나를 때린 곤충 */
  dmgBins: number[];
  castT: number;
  castOpen: boolean;
  lifeStart: number;
  hitBy: Map<number, number>;
  crushes: number;
  score: number;
  ultUses: number;
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
  poisonAcc: number;
  lives: number;
  ult: number;
  netT: number;
  feastT: number;
  yuckT: number;
  // 입력 순번
  lastSkillSeq: number;
  lastSubSeq: number;
  lastCardSeq: number;
  lastRerollSeq: number;
  skillCd: number;
  subCd: number;
  // 상태 이상
  stunT: number;
  slowT: number;
  slowMul: number;
  rootT: number;
  silenceT: number;
  blindT: number;
  markT: number;
  fearT: number;
  hiddenT: number; // 위장·숨기
  ghostT: number; // 몸 충돌 없음(땅속·뒷걸음)
  flyT: number;
  dashT: number;
  dashMul: number;
  dashKind: string;
  dashHits: Set<number>;
  dashDmg: number;
  dashAngle: number; // 뒷걸음질처럼 머리 방향과 다른 이동
  reduceT: number;
  reduceMul: number;
  backT: number; // 딱딱한 등판
  bitterT: number; // 쓴맛 몸
  curlT: number; // 껍질 웅크림·버티기(못 움직임)
  deadT: number; // 죽은 척
  escapeT: number; // 탈출 질주
  grabT: number;
  grabTarget: number;
  grabKind: string;
  grabbedBy: number;
  kvx: number;
  slideT: number; // 몸 전체가 옆으로 미끄러짐(구르기)
  slideVx: number;
  slideVy: number;
  kvy: number;
  // 다음 공격 강화
  nextMul: number;
  nextBite: number;
  nextBiteT: number;
  fangT: number; // 독니: 다음 물기 마비
  critNext: number; // 치명타(배율) 준비: 꽃 흉내·큰턱 벌리기
  // 채널 기술
  chanT: number; // 진행 중인 기술 남은 시간
  chanKind: string;
  chanAcc: number;
  chanN: number;
  chanHits: Map<number, number>;
  chanDmg: number;
  chanAcc2: number;
  grabDmg: number;
  grabAcc: number;
  ultMap: Map<number, number> | null;
  trailHits: Set<number>;
  pushedBy: number;
  pushedT: number;
  autoCd: number;
  whirlT: number;
  skyT: number;
  ambushT: number;
  trailT: number;
  trailAwake: boolean;
  lanternT: number;
  compoundT: number;
  decoyT: number;
  decoyX: number;
  decoyY: number;
  // 본능·카드 상태
  crouchT: number; // 웅크린 시간
  notBoostT: number;
  prayArmed: boolean;
  braceCd: number;
  fierceCd: number;
  thinCd: number;
  sapCd: number;
  buzzCd: number;
  longLifeUsed: boolean;
  store: number; // 양봉꿀벌 꿀 저장
  pack: number; // 풀잠자리 등짐
  patrolX: number;
  patrolY: number;
  patrolT: number;
  nestCd: number;
  crisisCd: number;
  crisisT: number;
  alertT: number;
  acroT: number;
  senseT: number;
  sapT: number; // 수액 사랑
  autotomy: number;
  safeT: number; // 안전한 출발
  sprintT: number; // 질주 출발
  poiseAcc: number; // 매복 자세·빛 끄기: 웅크린 시간
  poised: boolean; // 매복 자세: 다음 주 기술 +50%
  chaseT: number; // 끈질긴 추격: 빨라진 시간
  crowd: number; // 가까운 다른 곤충 수(외톨이·싸움꾼 기질)
  // 봇
  persona: Personality;
  hunter: boolean;
  side: number;
  modeT: number;
  hunting: boolean;
  wanderX: number;
  wanderY: number;
  cardDelay: number;
  react: number; // 반응 지연(초)
  thinkAcc: number;
  lastAct: string;
  lastActT: number;
}

export interface Food {
  x: number;
  y: number;
  r: number;
  ep: number;
  kind: 0 | 1 | 2 | 3 | 4; // 보통·큰것·잔해·황금 꿀방울·특별
  sub: number; // 특별: 먹이 번호, 잔해: 쓰러진 곤충의 레벨
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
  r1: number; // 커지는 구름: 끝 반지름
  kind: ZoneKind;
  life: number;
  max: number;
  owner: number;
  dps: number;
  mul: number; // 느려짐 배율·끌어당김 세기 등
  acc: number;
  awake: boolean;
  follow: boolean;
  hits: Set<number>;
  ult: Map<number, number> | null; // 필살기 피해 상한 계산
  target: number; // 따라다니는 대상(열 공)
}

export interface Proj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  owner: number;
  kind: ProjKind;
  dmg: number;
  pierce: number;
  hits: Set<number>;
  onHit: (o: Snake, x: number, y: number) => void;
  onEnd?: (x: number, y: number) => void;
}

export interface Minion {
  x: number;
  y: number;
  angle: number;
  owner: number;
  life: number;
  hp: number;
  dps: number;
  speed: number;
  target: number;
  kind: 'bee' | 'wasp';
  acc: number;
  heat: boolean;
  ult: Map<number, number> | null;
}

interface Tele extends TeleView {
  fn: () => void;
}

interface Bite {
  a: Snake;
  b: Snake;
  x: number;
  y: number;
  i: number;
}

const CELL = 64;
const BOT_NAMES = ['꼬물이', '초록띠', '방울이', '줄무늬', '노랑이', '솜털이', '먹보', '느림보', '반짝이', '뿔뿔이', '콩콩이', '바스락', '꿈틀이', '쪼꼬미', '대장벌레', '깡총이', '번개날개', '낫잡이', '독침왕', '모래도사'];
const PERSONAS: [Personality, number][] = [['hunter', 0.25], ['gatherer', 0.3], ['brawler', 0.25], ['coward', 0.2]];

export class Simulation {
  readonly dt = 1 / CONFIG.tickRate;
  tick = 0;
  rng: Rng;
  snakes: Snake[] = [];
  foods: Food[] = [];
  rings: Ring[] = [];
  zones: Zone[] = [];
  projs: Proj[] = [];
  minions: Minion[] = [];
  teles: Tele[] = [];
  timers: { t: number; fn: () => void }[] = [];
  events: GameEvent[] = [];
  playerId = 0;
  bossId = -1;
  state: 'playing' | 'ended' = 'playing';
  map: MapView = { theme: 'grass', rocks: [], puddles: [] };
  enemies: Enemies;
  opts: GameOpts = defaultOpts();
  private grid = new Map<number, number[]>();
  private playerName: string;

  constructor(seed: number, playerName = '나', opts?: GameOpts, theme?: MapTheme) {
    this.rng = new Rng(seed);
    this.enemies = new Enemies(this);
    this.playerName = playerName;
    if (opts) this.opts = { ...defaultOpts(), ...opts, loadout: { ...defaultOpts().loadout, ...(opts.loadout ?? {}) } };
    if (!theme && this.opts.map !== 'random') theme = this.opts.map;
    this.reset(theme);
  }

  /** 판 도중 바꿀 수 있는 설정(세기) */
  setOpts(opts: GameOpts) {
    this.opts = { ...this.opts, power: opts.power };
  }

  get time() {
    return this.tick * this.dt;
  }

  reset(theme?: MapTheme) {
    this.tick = 0;
    this.snakes = [];
    this.foods = [];
    this.rings = [];
    this.zones = [];
    this.projs = [];
    this.minions = [];
    this.teles = [];
    this.timers = [];
    this.events = [];
    this.bossId = -1;
    this.state = 'playing';
    this.enemies.reset();
    this.makeMap(theme ?? this.rng.pick(['grass', 'sand', 'forest'] as MapTheme[]));
    const lo = this.opts.loadout;
    const sp = SPECIES_BY_ID.get(lo.species) ?? SPECIES[0];
    const p = this.makeSnake(0, this.playerName, true, sp, lo.form, lo.traits);
    p.lives = CONFIG.lives;
    this.snakes.push(p);
    this.spawnAt(p, 0, 0, this.rng.range(0, Math.PI * 2), CONFIG.startSegments);
    const startLv = Math.max(1, Math.min(CONFIG.maxLevel, Math.floor(this.opts.startLevel ?? 1)));
    if (startLv > 1) this.autoLevel(p, startLv - 1);
    this.startBonus(p);
    this.fullHeal(p);
    // 봇: 계열을 고르게(같은 계열 최대 2마리)
    const n = Math.max(1, Math.min(40, Math.round(this.opts.bots)));
    const famCount = new Map<string, number>([[p.fam.id, 1]]);
    for (let i = 0; i < n; i++) {
      const fam = this.pickBotFamily(famCount);
      famCount.set(fam.id, (famCount.get(fam.id) ?? 0) + 1);
      const bsp = SPECIES_BY_ID.get(this.rng.pick(fam.species))!;
      const b = this.makeSnake(i + 1, BOT_NAMES[i % BOT_NAMES.length], false, bsp, this.rng.pick(formsOf(bsp.id)).id, this.botTraits(fam));
      this.snakes.push(b);
      this.respawnBot(b, 1);
    }
    for (let i = 0; i < CONFIG.foodCount; i++) this.foods.push(this.newFood(0));
    for (let i = 0; i < CONFIG.bigFoodCount; i++) this.foods.push(this.newFood(1));
    for (let i = 0; i < CONFIG.goldCount; i++) this.foods.push(this.newFood(3));
    for (let i = 0; i < CONFIG.specialCount; i++) this.foods.push(this.newFood(4, i % SPECIAL_FOODS.length));
    this.buildGrid();
  }

  private pickBotFamily(count: Map<string, number>): Family {
    const ok = FAMILIES.filter((f) => (count.get(f.id) ?? 0) < 2);
    const pool = ok.length ? ok : FAMILIES;
    // 덜 나온 계열부터
    const min = Math.min(...pool.map((f) => count.get(f.id) ?? 0));
    return this.rng.pick(pool.filter((f) => (count.get(f.id) ?? 0) === min));
  }

  /** 봇 특성: 공용 1 + 계열 전용 1 */
  botTraits(fam: Family): string[] {
    return [this.rng.pick(COMMON_TRAITS).id, this.rng.pick(familyTraits(fam.id)).id];
  }

  /** 지형: 바위(부딪히면 튕김)와 웅덩이(느려짐) */
  private makeMap(theme: MapTheme) {
    const R = CONFIG.arenaRadius;
    const rocks: { x: number; y: number; r: number }[] = [];
    const puddles: { x: number; y: number; r: number }[] = [];
    const area = (R / 3300) ** 2; // 바위·웅덩이 수는 맵 넓이에 맞춘다(3300 기준)
    const nRock = Math.round((theme === 'sand' ? 20 : theme === 'forest' ? 16 : 13) * area);
    const nPud = Math.round((theme === 'sand' ? 5 : theme === 'forest' ? 11 : 9) * area);
    const free = (x: number, y: number, r: number) =>
      Math.hypot(x, y) > 380 && Math.hypot(x, y) + r < R - 120 && rocks.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + 160) && puddles.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + 60);
    for (let k = 0, tries = 0; k < nRock && tries < 500; tries++) {
      const a = this.rng.range(0, Math.PI * 2), d = Math.sqrt(this.rng.next()) * R;
      const x = Math.cos(a) * d, y = Math.sin(a) * d, r = this.rng.range(55, theme === 'sand' ? 140 : 115);
      if (free(x, y, r)) (rocks.push({ x, y, r }), k++);
    }
    for (let k = 0, tries = 0; k < nPud && tries < 500; tries++) {
      const a = this.rng.range(0, Math.PI * 2), d = Math.sqrt(this.rng.next()) * R;
      const x = Math.cos(a) * d, y = Math.sin(a) * d, r = this.rng.range(90, 190);
      if (free(x, y, r)) (puddles.push({ x, y, r }), k++);
    }
    this.map = { theme, rocks, puddles };
  }

  onField(s: Snake) {
    return s.alive && s.netT <= 0;
  }

  /** 기술로 맞힐 수 있는가(날아오른 곤충은 못 맞힌다) */
  hittable(o: Snake) {
    return this.onField(o) && o.flyT <= 0 && o.evolveT <= 0;
  }

  rankOf(id: number): [number, number] {
    const list = this.snakes.filter((s) => !s.isBoss).sort((a, b) => b.score - a.score);
    return [list.findIndex((s) => s.id === id) + 1, list.length];
  }

  private makeSnake(id: number, name: string, isPlayer: boolean, sp: Species, formId: string, traits: string[]): Snake {
    const fam = FAMILY[sp.family];
    const okForms = formsOf(sp.id);
    const form = okForms.find((f) => f.id === formId) ?? okForms[0];
    let acc = this.rng.next(), persona: Personality = 'gatherer';
    for (const [p, w] of PERSONAS) {
      if (acc < w) {
        persona = p;
        break;
      }
      acc -= w;
    }
    return {
      id, name, isPlayer, isBoss: false, alive: true,
      x: 0, y: 0, px: 0, py: 0, angle: 0, path: [], segCount: CONFIG.startSegments, growth: 0,
      segs: new Float32Array(0), segN: 0, r: CONFIG.evoRadius[1],
      cmd: emptyCommand(), boosting: false, sneaking: false, boostAcc: 0,
      sp, fam, form, sub: null, traits: new Set(traits.slice(0, 2)),
      level: 1, evo: 1, nut: 0, totalNut: 0, abilities: [], mainLv: 0, subLv: 0, offer: null, pending: 0, subPending: false, newGiven: 0, rerolls: CONFIG.rerolls, evolveT: 0,
      kills: 0, killsAll: 0, deaths: 0, st: emptyStats(), dmgBins: [], castT: -99, castOpen: false, lifeStart: 0, hitBy: new Map(), crushes: 0, score: 0, ultUses: 0, respawnT: 0, loopCd: 0,
      hp: 1, maxHp: 1, hurtT: 99, biteCd: 0, invulnT: 0, wallCd: 0, dropAcc: 0, poisonT: 0, poisonDps: 0, poisonBy: -1, poisonAcc: 0, lives: 1, ult: 0, netT: 0, feastT: 0, yuckT: 0,
      lastSkillSeq: 0, lastSubSeq: 0, lastCardSeq: 0, lastRerollSeq: 0, skillCd: 0, subCd: 0,
      stunT: 0, slowT: 0, slowMul: 1, rootT: 0, silenceT: 0, blindT: 0, markT: 0, fearT: 0, hiddenT: 0, ghostT: 0, flyT: 0,
      dashT: 0, dashMul: 1, dashKind: '', dashHits: new Set(), dashDmg: 0, dashAngle: NaN,
      reduceT: 0, reduceMul: 1, backT: 0, bitterT: 0, curlT: 0, deadT: 0, escapeT: 0,
      grabT: 0, grabTarget: -1, grabKind: '', grabbedBy: -1, kvx: 0, kvy: 0, slideT: 0, slideVx: 0, slideVy: 0,
      nextMul: 1, nextBite: 1, nextBiteT: 0, fangT: 0, critNext: 0,
      chanT: 0, chanKind: '', chanAcc: 0, chanN: 0, chanHits: new Map(), chanDmg: 0, chanAcc2: 0, grabDmg: 0, grabAcc: 0, ultMap: null, trailHits: new Set(), pushedBy: -1, pushedT: 0, autoCd: 0, whirlT: 0, skyT: 0, ambushT: 0, trailT: 0, trailAwake: false, lanternT: 0, compoundT: 0,
      decoyT: 0, decoyX: 0, decoyY: 0,
      crouchT: 0, notBoostT: 0, prayArmed: false, braceCd: 0, fierceCd: 0, thinCd: 0, sapCd: 0, buzzCd: 0, longLifeUsed: false, store: 0, pack: 0,
      patrolX: 0, patrolY: 0, patrolT: 0, nestCd: 0, crisisCd: 0, crisisT: 0, alertT: 0, acroT: 0, senseT: 0, sapT: 0,
      autotomy: 0, safeT: 0, sprintT: 0, poiseAcc: 0, poised: false, chaseT: 0, crowd: 0,
      persona, hunter: persona === 'hunter', side: this.rng.next() < 0.5 ? -1 : 1, modeT: 0, hunting: false, wanderX: 0, wanderY: 0, cardDelay: 0,
      react: 0.4, thinkAcc: 0, lastAct: '', lastActT: 0,
    };
  }

  // ---------- 능력치 ----------

  /** 능력 카드 값(없으면 0) */
  ab(s: Snake, id: string): number {
    for (const a of s.abilities) if (a.id === id) return ABILITY_BY_ID.get(id)!.vals[a.lv - 1];
    return 0;
  }

  inst(s: Snake, id: string) {
    return !s.isBoss && s.sp.instinct.id === id;
  }

  /** 회복: 실제로 오른 체력만큼 통계에 쌓는다 */
  heal(s: Snake, amount: number) {
    if (!s.alive || amount <= 0) return;
    const before = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + amount);
    s.st.healed += s.hp - before;
  }

  /** 특성 배율(곱하는 값, minion·respawn은 더하는 값) */
  tm(s: Snake, k: Parameters<typeof traitMod>[1]) {
    return s.isBoss ? (k === 'minion' || k === 'respawn' ? 0 : 1) : traitMod(s.traits, k);
  }
  tsp(s: Snake, sp: Parameters<typeof hasSpecial>[1]) {
    return !s.isBoss && hasSpecial(s.traits, sp);
  }

  fighter(s: Snake) {
    return { level: s.level, stage: s.evo, family: s.isBoss ? null : s.fam.id, isBoss: s.isBoss };
  }

  /** 기준 피해 B */
  B(s: Snake) {
    return baseB(this.fighter(s));
  }

  speedOf(s: Snake) {
    if (s.isBoss) return CONFIG.bossSpeed;
    let v = (CONFIG.baseSpeed + CONFIG.speedPerLevel * (s.level - 1) + CONFIG.evoSpeed[s.evo]) * s.fam.spd * (1 + this.ab(s, 'light'));
    if (this.inst(s, 'slim')) v *= 1.06;
    v *= this.tm(s, 'spd');
    if (s.chaseT > 0) v *= 1.2;
    return v;
  }

  /** 주 기술 재사용 시간 */
  skillCdMax(s: Snake) {
    if (s.isBoss) return 99;
    let cd = this.larvaLip(s) ? 6 : s.form.cd;
    cd *= 1 - this.ab(s, 'focus');
    if (s.mainLv >= 2) cd *= 0.85;
    if (s.fam.id === 'firefly') cd *= 1 - this.ab(s, 'blink');
    return cd * this.tm(s, 'cd');
  }

  subCdMax(s: Snake) {
    if (!s.sub) return 0;
    let cd = s.sub.cd;
    if (s.fam.id === 'firefly' && s.sub.id === s.fam.sub.id) cd *= 1 - this.ab(s, 'blink');
    return cd * this.tm(s, 'subCd');
  }

  /** 잠자리 수채 단계: 주 기술이 '아랫입술 발사' */
  larvaLip(s: Snake) {
    return s.fam.id === 'dragonfly' && s.evo === 1;
  }

  /** 주 기술 피해 배율 */
  mainMul(s: Snake) {
    let m = 1;
    if (s.mainLv >= 1) m *= 1.15;
    m *= 1 + this.ab(s, 'hone');
    m *= this.tm(s, 'main');
    if (s.poised) m *= 1.5;
    return m;
  }

  /** 주·보조 기술 범위 배율 */
  rangeMul(s: Snake, sub = false) {
    let m = 1 + this.ab(s, 'wide');
    if (sub && s.subLv >= 1) m *= 1.3;
    if (!sub) m *= this.tm(s, 'range');
    return m;
  }

  /** 보조 기술 지속 배율 */
  subDur(s: Snake) {
    return s.subLv >= 1 ? 1.3 : 1;
  }

  private updateSize(s: Snake) {
    if (s.isBoss) {
      s.r = CONFIG.bossRadius;
      s.maxHp = CONFIG.bossHp;
      return;
    }
    s.r = radiusFor(s.evo, s.segCount, this.inst(s, 'slim') ? 0.82 : 1);
    s.maxHp = maxHpOf(this.fighter(s), s.segCount, (this.inst(s, 'slim') ? 0.9 : 1) * this.tm(s, 'hp'));
    if (s.hp > s.maxHp) s.hp = s.maxHp;
  }

  private fullHeal(s: Snake) {
    this.updateSize(s);
    s.hp = s.maxHp;
    s.hurtT = 99;
    s.poisonT = 0;
  }

  private clearStatus(s: Snake) {
    s.stunT = s.slowT = s.rootT = s.silenceT = s.blindT = s.markT = s.fearT = s.hiddenT = s.ghostT = s.flyT = s.dashT = 0;
    s.reduceT = s.backT = s.bitterT = s.curlT = s.deadT = s.escapeT = s.feastT = s.yuckT = 0;
    s.chanT = s.whirlT = s.skyT = s.ambushT = s.trailT = s.lanternT = s.compoundT = s.decoyT = 0;
    s.slowMul = s.reduceMul = 1;
    s.dashKind = '';
    s.dashHits.clear();
    s.dashAngle = NaN;
    this.releaseGrab(s);
    s.kvx = s.kvy = 0;
    s.slideT = 0;
    s.skillCd = s.subCd = 0;
    s.poisonT = 0;
    s.biteCd = 0;
    s.netT = 0;
    s.evolveT = 0;
    s.nextMul = s.nextBite = 1;
    s.fangT = s.critNext = 0;
    s.crouchT = 0;
    s.prayArmed = false;
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

  /** 판 시작·부활 때 특성 효과 */
  private startBonus(s: Snake) {
    s.poiseAcc = 0;
    s.poised = false;
    s.chaseT = 0;
  }

  /** 봇 등장: 판 진행에 맞는 레벨로(중간에 들어오면 판 평균 레벨 − 2) */
  private respawnBot(b: Snake, level: number) {
    b.lifeStart = this.time;
    const [x, y] = this.safeSpot(b, 600);
    b.totalNut = b.kills = b.crushes = b.score = b.ultUses = 0;
    b.modeT = 0;
    b.hunting = false;
    b.level = 1;
    b.evo = 1;
    b.nut = 0;
    b.abilities = [];
    b.mainLv = b.subLv = 0;
    b.sub = null;
    b.offer = null;
    b.pending = 0;
    b.subPending = false;
    b.newGiven = 0;
    b.rerolls = CONFIG.rerolls;
    b.ult = 0;
    b.store = b.pack = 0;
    b.longLifeUsed = false;
    // 난이도: 반응 지연 0.2 / 0.4 / 0.6초
    b.react = this.rng.pick([0.2, 0.4, 0.4, 0.6]);
    this.clearStatus(b);
    if (level > 1) this.autoLevel(b, level - 1);
    const segs = Math.max(CONFIG.startSegments, Math.round(this.rng.range(0.7, 1.3) * (CONFIG.startSegments + (level - 1) * 6)));
    this.spawnAt(b, x, y, this.rng.range(0, Math.PI * 2), segs);
    this.startBonus(b);
    this.fullHeal(b);
    this.events.push({ type: 'respawn', snake: b.id });
  }

  /** 레벨 n번을 한꺼번에 올리고 카드를 규칙대로 자동으로 고른다(봇 중간 참여·시험용) */
  autoLevel(s: Snake, n: number) {
    for (let k = 0; k < n && s.level < CONFIG.maxLevel; k++) {
      s.level++;
      s.pending++;
      if (s.level === CONFIG.evoLevels[2] || s.level === CONFIG.evoLevels[3]) {
        s.evo = evoOf(s.level);
        if (s.evo === 2) s.subPending = true;
      }
      while (s.subPending || s.pending > 0) {
        this.makeOffer(s);
        if (!s.offer) break;
        this.chooseCard(s, botPickCard(this, s), true);
      }
    }
    this.updateSize(s);
  }

  /** 플레이어 부활: 레벨·카드·진화 단계는 그대로, 길이 절반, 모으던 영양·필살기 게이지·목숨 1개를 잃는다 */
  private respawnPlayer(p: Snake, deathLen: number) {
    p.lifeStart = this.time;
    const [x, y] = this.safeSpot(p, 700);
    this.clearStatus(p);
    const segs = Math.max(CONFIG.startSegments, Math.floor(deathLen / 2));
    this.spawnAt(p, x, y, this.rng.range(0, Math.PI * 2), segs);
    this.fullHeal(p);
    p.invulnT = CONFIG.invulnTime;
    this.startBonus(p);
    this.events.push({ type: 'respawn', snake: p.id });
  }

  private newFood(kind: 0 | 1 | 3 | 4, sub = -1): Food {
    const R = CONFIG.arenaRadius - 30;
    let x = 0, y = 0;
    for (let k = 0; k < 6; k++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = Math.sqrt(this.rng.next()) * R;
      x = Math.cos(a) * d;
      y = Math.sin(a) * d;
      if (this.map.rocks.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + 12)) break;
    }
    if (kind === 3) return { x, y, r: CONFIG.goldRadius, ep: CONFIG.goldEP, kind, sub: 0, life: Infinity };
    if (kind === 4) return { x, y, r: CONFIG.specialRadius, ep: CONFIG.specialEP, kind, sub: sub >= 0 ? sub : this.rng.int(0, SPECIAL_FOODS.length - 1), life: Infinity };
    return { x, y, r: kind === 1 ? CONFIG.bigFoodRadius : CONFIG.foodRadius, ep: kind === 1 ? CONFIG.bigFoodEP : CONFIG.foodEP, kind, sub: 0, life: Infinity };
  }

  dropFood(x: number, y: number, ep: number, life = 40, level = 1) {
    this.foods.push({ x: x + this.rng.range(-5, 5), y: y + this.rng.range(-5, 5), r: CONFIG.remainsRadius, ep, kind: 2, sub: level, life });
  }

  private dropGold(x: number, y: number) {
    const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(10, 60);
    this.foods.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: CONFIG.goldRadius, ep: CONFIG.goldEP, kind: 3, sub: 0, life: 45 });
  }

  setCommand(id: number, cmd: Command) {
    const s = this.snakes[id];
    if (s) s.cmd = cmd;
  }

  /** o가 s보다 강한가(레벨 3 이상 높음 또는 천적) */
  stronger(o: Snake, s: Snake): boolean {
    if (o.isBoss) return true;
    if (s.isBoss) return false;
    return o.level - s.level >= CONFIG.recoilLevelGap;
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
    if (this.state === 'ended') {
      this.tick++;
      return;
    }
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      this.tick++;
      return;
    }
    // 0) 외톨이·싸움꾼 기질: 가까운(450) 다른 곤충 수를 0.25초마다 센다
    if (this.tick % 15 === 0)
      for (const s of this.snakes) {
        if (!this.onField(s) || !(this.tsp(s, 'loner') || this.tsp(s, 'duelist'))) continue;
        let n = 0;
        for (const o of this.snakes) if (o !== s && !o.isBoss && this.onField(o) && Math.hypot(o.x - s.x, o.y - s.y) < 450) n++;
        s.crowd = n;
      }
    // 1) 봇·왕지네 생각 → 명령(봇은 3틱마다, 서로 엇갈려)
    for (const s of this.snakes) {
      if (!this.onField(s) || s.isPlayer) continue;
      if (s.isBoss) s.cmd = bossThink(this, s, dt);
      else if ((this.tick + s.id) % 3 === 0) s.cmd = botThink(this, s, dt * 3);
    }
    // 2) 명령 처리 + 상태 시간 + 이동
    for (const s of this.snakes) {
      if (!s.alive) continue;
      if (s.netT > 0) {
        s.netT -= dt;
        if (s.netT <= 0) this.release(s);
        continue;
      }
      this.handleActions(s, dt);
      if (!s.alive) continue;
      this.tickStatus(s, dt);
      if (s.alive) SK.tickSkills(this, s, dt);
      if (s.alive) {
        const x0 = s.x, y0 = s.y;
        this.moveSnake(s, dt);
        const mv = Math.hypot(s.x - x0, s.y - y0);
        if (mv < 60) s.st.distance += mv; // 순간이동(부활 등)은 빼고
        if (s.segCount > s.st.maxLen) s.st.maxLen = s.segCount;
      }
    }
    // 3) 먹기, 장판, 투사체, 부른 벌, 예고
    this.eatFoods(dt);
    SK.updateZones(this, dt);
    this.updateProjs(dt);
    SK.updateMinions(this, dt);
    this.updateTeles(dt);
    // 4) 충돌
    this.buildGrid();
    this.checkCollisions();
    // 5) 고리
    for (const s of this.snakes) {
      if (!this.onField(s)) continue;
      s.loopCd -= dt;
      if (s.loopCd <= 0) this.detectLoop(s);
    }
    this.updateRings(dt);
    // 6) 천적, 부활, 먹이 보충
    this.enemies.update(dt);
    this.senseWarn();
    for (const s of this.snakes) {
      if (s.alive || s.isBoss) continue;
      s.respawnT -= dt;
      if (s.respawnT > 0) continue;
      if (s.isPlayer) {
        if ((CONFIG.lives <= 0 || s.lives > 0) && this.state === 'playing') this.respawnPlayer(s, s.segCount);
      } else {
        const lv = this.joinLevel();
        this.respawnBot(s, lv);
      }
    }
    this.refillFoods(dt);
    for (const s of this.snakes) if (!s.isBoss) s.score = Math.floor(s.totalNut + s.kills * CONFIG.scoreKill + s.crushes * CONFIG.scoreCrush + (s.level - 1) * CONFIG.scoreLevel);
    this.tick++;
    if (this.time >= CONFIG.roundTime) this.endRound(true);
  }

  /** 중간에 들어오는 봇의 레벨: 판 평균 레벨 − 2 */
  private joinLevel() {
    let sum = 0, n = 0;
    for (const s of this.snakes) if (s.alive && !s.isBoss) ((sum += s.level), n++);
    const avg = n ? sum / n : 1;
    return Math.max(1, Math.min(CONFIG.maxLevel - 2, Math.round(avg - 2 + this.rng.range(-1, 1))));
  }

  /** 특성 '천적 감지': 경보 2초 전에 미리 알림 */
  private lastPhase = 'idle';
  private senseWarn() {
    const e0 = this.enemies;
    if (e0.phase === 'warn' && this.lastPhase !== 'warn') for (const s of this.snakes) if (s.alive && !s.isBoss && this.ab(s, 'alert') > 0) s.alertT = this.ab(s, 'alert');
    this.lastPhase = e0.phase;
  }

  private endRound(timeUp: boolean) {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    const [rank, total] = this.rankOf(this.playerId);
    this.events.push({ type: 'end', rank, total, timeUp });
  }

  // ---------- 성장 ----------

  /** 먹이: 영양 + 성장(길수록 느림) + 체력 회복 */
  feed(s: Snake, ep: number, heal = true) {
    if (s.isBoss) return;
    const nut = ep * CONFIG.nutMul * (1 + this.ab(s, 'glutton')) * this.tm(s, 'nut') * (this.tsp(s, 'loner') && s.crowd === 0 ? 1.12 : 1);
    s.totalNut += nut;
    s.growth += (ep * CONFIG.evoGrowth[s.evo]) / (1 + s.segCount / CONFIG.growthSlowLen);
    while (s.growth >= 1) {
      s.growth -= 1;
      s.segCount++;
    }
    this.updateSize(s);
    if (heal) this.heal(s, ep * CONFIG.foodHeal * this.tm(s, 'heal') * (this.tsp(s, 'berserk') ? 0.5 : 1));
    // 양봉꿀벌: 먹이의 일부를 꿀로 저장(최대 체력의 30%까지)
    if (this.inst(s, 'store')) s.store = Math.min(s.maxHp * 0.3, s.store + ep * 0.6);
    if (this.inst(s, 'trash')) s.pack = Math.min(1, s.pack + ep / 60);
    if (s.level >= CONFIG.maxLevel) return;
    s.nut += nut;
    while (s.level < CONFIG.maxLevel && s.nut >= nutNeed(s.level)) {
      s.nut -= nutNeed(s.level);
      this.levelUp(s);
    }
    if (s.level >= CONFIG.maxLevel) s.nut = 0;
  }

  private levelUp(s: Snake) {
    s.level++;
    s.pending++;
    const hpK = s.hp / Math.max(1, s.maxHp);
    this.updateSize(s);
    s.hp = Math.max(s.hp, s.maxHp * hpK);
    this.events.push({ type: 'levelUp', snake: s.id, level: s.level, x: s.x, y: s.y });
    if (evoOf(s.level) > s.evo && s.evolveT <= 0) {
      s.evolveT = CONFIG.evolveTime;
      this.events.push({ type: 'evolveStart', snake: s.id });
    }
  }

  private finishEvolve(s: Snake) {
    s.evo = evoOf(s.level);
    if (s.evo >= 2 && !s.sub) s.subPending = true;
    this.fullHeal(s);
    this.rebuildSegs(s);
    s.offer = null; // 보조 기술 고르기가 먼저
    this.events.push({ type: 'evolve', snake: s.id, stage: s.evo, x: s.x, y: s.y });
  }

  /** 카드 3장(특성 '첫 카드 4장': 레벨 2·3에서 4장) */
  makeOffer(s: Snake, reroll = false) {
    if (s.subPending && s.evo >= 2) {
      const n = 3;
      // 공용 보조 기술은 그 계열 생태에 맞는 것만 나온다
      const ok = COMMON_SUBS.filter((c) => c.families?.includes(s.fam.id));
      const picked: string[] = [s.fam.sub.id];
      let guard = 0;
      while (picked.length < n && guard++ < 50) {
        const c = this.rng.pick(ok);
        if (!picked.includes(c.id)) picked.push(c.id);
      }
      // 계열 전용을 가운데 자리에 섞어 둔다
      const [ex, ...rest] = picked;
      rest.splice(Math.min(1, rest.length), 0, ex);
      s.offer = { kind: 'sub', cards: rest.map((id) => ({ kind: 'sub', id })) };
      void reroll;
      return;
    }
    if (s.pending <= 0) {
      s.offer = null;
      return;
    }
    const cardLv = s.level - s.pending + 1; // 이 카드가 몇 레벨의 카드인지
    const four = false;
    const n = four ? 4 : 3;
    // 후보 모으기: 가중치(계열 전용 2배, 역할 추천 1.5배)
    const cands: { c: LevelCard; w: number }[] = [];
    const owned = new Map(s.abilities.map((a) => [a.id, a.lv]));
    if (s.abilities.length < 4) {
      for (const a of ABILITIES) {
        if (owned.has(a.id)) continue;
        if (a.family && a.family !== s.fam.id) continue;
        const w = a.family ? 2 : a.roles?.includes(s.fam.role) ? 1.5 : 1;
        cands.push({ c: { kind: 'new', id: a.id }, w });
      }
    }
    for (const a of s.abilities) if (a.lv < 3) cands.push({ c: { kind: 'up', id: a.id }, w: 1.6 });
    if (s.mainLv < 2) cands.push({ c: { kind: 'main', id: s.mainLv === 0 ? 'main1' : 'main2' }, w: 1.4 });
    if (s.sub && s.subLv < 1) cands.push({ c: { kind: 'sub', id: 'sub' }, w: 1.2 });
    const out: LevelCard[] = [];
    // 처음 세 번은 새 능력이 적어도 1장
    if (s.newGiven < CONFIG.firstNewCards) {
      const news = cands.filter((x) => x.c.kind === 'new');
      if (news.length) {
        const pick = this.weighted(news);
        out.push(pick.c);
        cands.splice(cands.indexOf(pick), 1);
      }
    }
    while (out.length < n && cands.length) {
      const pick = this.weighted(cands);
      out.push(pick.c);
      cands.splice(cands.indexOf(pick), 1);
    }
    if (out.length === 0) for (const b of BONUS_CARDS) out.push({ kind: 'bonus', id: b.id });
    // 섞기
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    s.offer = { kind: 'level', cards: out };
  }

  private weighted<T extends { w: number }>(list: T[]): T {
    let sum = 0;
    for (const x of list) sum += x.w;
    let r = this.rng.next() * sum;
    for (const x of list) {
      r -= x.w;
      if (r <= 0) return x;
    }
    return list[list.length - 1];
  }

  chooseCard(s: Snake, i: number, silent = false) {
    const off = s.offer;
    if (!off) return;
    const c = off.cards[Math.max(0, Math.min(off.cards.length - 1, i))];
    s.offer = null;
    if (off.kind === 'sub') {
      s.sub = COMMON_SUBS.find((x) => x.id === c.id) ?? (c.id === s.fam.sub.id ? s.fam.sub : s.fam.sub);
      s.subPending = false;
      s.subCd = 0;
      return;
    }
    s.pending--;
    if (c.kind === 'new') {
      s.abilities.push({ id: c.id, lv: 1 });
      s.newGiven++;
    } else if (c.kind === 'up') {
      const a = s.abilities.find((x) => x.id === c.id);
      if (a) a.lv = Math.min(3, a.lv + 1);
    } else if (c.kind === 'main') s.mainLv = Math.min(2, s.mainLv + 1);
    else if (c.kind === 'sub') s.subLv = 1;
    else if (c.kind === 'bonus') {
      if (c.id === 'heal') this.heal(s, s.maxHp * 0.3);
      else if (c.id === 'ult') this.addUlt(s, 40);
      else s.totalNut += 20;
    }
    this.updateSize(s);
    if (!silent && s.isPlayer) this.events.push({ type: 'pop', snake: s.id, x: s.x, y: s.y - 30, text: '✨', color: 0xffe066 });
  }

  // ---------- 행동 ----------

  canAct(s: Snake) {
    return s.stunT <= 0 && s.silenceT <= 0 && s.fearT <= 0 && s.blindT <= 0 && s.evolveT <= 0 && s.deadT <= 0 && s.grabbedBy < 0 && s.skyT <= 0 && s.whirlT <= 0;
  }

  private handleActions(s: Snake, dt: number) {
    const c = s.cmd;
    if (s.isBoss) return;
    // 주 기술(게이지가 차 있으면 필살기)
    if (c.skillSeq !== s.lastSkillSeq) {
      s.lastSkillSeq = c.skillSeq;
      if (s.ambushT > 0) SK.ambushStrike(this, s);
      else if (this.canAct(s)) {
        if (s.ult >= CONFIG.ultMax && s.chanT <= 0) this.castUlt(s);
        else if (s.skillCd <= 0 && s.chanT <= 0) this.castMain(s);
      }
    }
    if (c.subSeq !== s.lastSubSeq) {
      s.lastSubSeq = c.subSeq;
      // 탈출 질주·다리 자르기 같은 탈출 기술은 묶여 있어도 쓸 수 있다
      const escape = s.sub && (s.sub.id === 'escape' || s.sub.id === 'molt' || s.sub.id === 'backstep');
      if (s.sub && s.subCd <= 0 && (this.canAct(s) || (escape && s.evolveT <= 0 && s.deadT <= 0 && s.stunT <= 0))) this.castSub(s);
    }
    const tick = this.inst(s, 'perch') && s.sneaking ? 2 : 1; // 고추잠자리: 앉아서 쉬기
    s.skillCd = Math.max(0, s.skillCd - dt * tick);
    s.subCd = Math.max(0, s.subCd - dt * tick);
    // 카드
    if (!s.offer && s.evolveT <= 0 && (s.pending > 0 || s.subPending)) {
      this.makeOffer(s);
      s.cardDelay = this.rng.range(0.5, 2);
    }
    if (c.rerollSeq !== s.lastRerollSeq) {
      s.lastRerollSeq = c.rerollSeq;
      if (s.offer && s.rerolls > 0) {
        s.rerolls--;
        if (s.offer.kind === 'sub') {
          // 공용 후보만 새로(전용은 고정)
          const keep = s.fam.sub.id;
          s.subPending = true;
          this.makeOffer(s, true);
          if (s.offer && !s.offer.cards.some((x) => x.id === keep)) s.offer.cards[0] = { kind: 'sub', id: keep };
        } else this.makeOffer(s, true);
      }
    }
    if (c.cardSeq !== s.lastCardSeq) {
      s.lastCardSeq = c.cardSeq;
      if (s.offer) this.chooseCard(s, c.cardChoice);
    }
    // 진화 연출
    if (s.evolveT > 0) {
      s.evolveT -= dt;
      if (s.evolveT <= 0) this.finishEvolve(s);
    }
    // 필살기 게이지: 저절로 초당 +0.3
    this.addUlt(s, CONFIG.ultPassive * dt);
  }

  addUlt(s: Snake, v: number) {
    if (s.isBoss || v <= 0) return;
    v *= this.tm(s, 'gauge');
    const was = s.ult;
    s.ult = Math.min(CONFIG.ultMax, s.ult + v);
    if (was < CONFIG.ultMax && s.ult >= CONFIG.ultMax) this.events.push({ type: 'ultReady', snake: s.id });
  }

  private castMain(s: Snake) {
    s.skillCd = this.skillCdMax(s);
    const lip = this.larvaLip(s);
    const name = lip ? '아랫입술 발사' : s.form.name;
    this.events.push({ type: 'skill', snake: s.id, fam: s.fam.id, name, icon: lip ? '👄' : s.form.icon, x: s.x, y: s.y, angle: s.angle, slot: 'main' });
    this.mark(s, 'main');
    SK.castMain(this, s);
    s.st.casts++;
    s.castT = this.time;
    s.castOpen = true;
    s.prayArmed = false;
    s.poised = false;
    s.poiseAcc = 0;
  }

  private castSub(s: Snake) {
    const sub = s.sub!;
    s.subCd = this.subCdMax(s);
    this.events.push({ type: 'skill', snake: s.id, fam: s.fam.id, name: sub.name, icon: sub.icon, x: s.x, y: s.y, angle: s.angle, slot: 'sub' });
    this.mark(s, 'sub');
    SK.castSub(this, s);
    s.st.casts++;
    s.castT = this.time;
    s.castOpen = true;
  }

  private castUlt(s: Snake) {
    s.ult = 0;
    s.ultUses++;
    this.events.push({ type: 'skill', snake: s.id, fam: s.fam.id, name: s.fam.ult.name, icon: s.fam.ult.icon, x: s.x, y: s.y, angle: s.angle, slot: 'ult' });
    this.mark(s, 'ult');
    SK.castUlt(this, s);
    s.st.ultCasts++;
  }

  private mark(s: Snake, act: string) {
    s.lastAct = act;
    s.lastActT = this.time;
    // 기술을 쓰면 위장이 풀린다
    if (s.hiddenT > 0 && act !== 'sub') s.hiddenT = 0;
  }

  // ---------- 효과 부품(skills.ts가 쓴다) ----------

  fx(kind: FxKind, s: Snake | null, x: number, y: number, extra: Partial<Extract<GameEvent, { type: 'fx' }>> = {}) {
    this.events.push({ type: 'fx', kind, snake: s ? s.id : -1, fam: s && !s.isBoss ? s.fam.id : null, sp: s && !s.isBoss ? s.sp.id : undefined, x, y, ...extra });
  }

  /** 히트스톱: 플레이어가 낀 큰 타격에서 세상을 아주 잠깐 멈춘다(손맛) */
  freezeT = 0;
  hitstop(a: Snake | null, b: Snake | null, t: number) {
    if ((a && a.isPlayer) || (b && b.isPlayer)) this.freezeT = Math.max(this.freezeT, t * CONFIG.hitstopMul);
  }

  later(t: number, fn: () => void) {
    this.timers.push({ t, fn });
  }

  /** 바닥 예고 후 실행(필살기) */
  telegraph(owner: Snake, tv: Omit<TeleView, 't' | 'total' | 'owner'>, fn: () => void, t: number = CONFIG.ultTele) {
    this.teles.push({ ...tv, t, total: t, owner: owner.id, fn });
  }

  private updateTeles(dt: number) {
    for (let k = this.teles.length - 1; k >= 0; k--) {
      const te = this.teles[k];
      te.t -= dt;
      if (te.t <= 0) {
        this.teles.splice(k, 1);
        const o = this.snakes[te.owner];
        if (o && o.alive) te.fn();
      }
    }
    for (let k = this.timers.length - 1; k >= 0; k--) {
      const tm = this.timers[k];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(k, 1);
        tm.fn();
      }
    }
  }

  addZone(z: Partial<Zone> & { x: number; y: number; r: number; kind: ZoneKind; life: number; owner: number }): Zone {
    const zone: Zone = { r1: z.r, dps: 0, mul: 1, acc: 0, awake: false, follow: false, hits: new Set(), ult: null, target: -1, max: z.life, ...z };
    this.zones.push(zone);
    return zone;
  }

  addProj(p: Partial<Proj> & { x: number; y: number; vx: number; vy: number; life: number; owner: number; kind: ProjKind; onHit: Proj['onHit'] }) {
    this.projs.push({ dmg: 0, pierce: 1, hits: new Set(), ...p });
  }

  addMinion(owner: Snake, kind: 'bee' | 'wasp', life: number, dps: number, heat = false) {
    dps *= this.tm(owner, 'minionDmg');
    const a = this.rng.range(0, Math.PI * 2);
    this.minions.push({ x: owner.x + Math.cos(a) * 30, y: owner.y + Math.sin(a) * 30, angle: a, owner: owner.id, life, hp: owner.maxHp * 0.08, dps, speed: 330, target: -1, kind, acc: 0, heat, ult: null });
  }

  /** 범위 안 상대마다 '처음 닿은 마디'로 한 번씩 */
  forEachHit(s: Snake, inRange: (o: Snake, i: number, x: number, y: number) => boolean, apply: (o: Snake, x: number, y: number, i: number) => void) {
    for (const o of this.snakes) {
      if (o.id === s.id || !this.hittable(o)) continue;
      for (let i = 0; i < o.segN; i++) {
        const x = o.segs[i * 2], y = o.segs[i * 2 + 1];
        if (inRange(o, i, x, y)) {
          apply(o, x, y, i);
          break;
        }
      }
    }
  }

  circle(s: Snake, cx: number, cy: number, r: number, apply: (o: Snake, x: number, y: number, i: number) => void) {
    this.forEachHit(s, (o, _i, x, y) => Math.hypot(x - cx, y - cy) <= r + o.r, apply);
  }

  cone(s: Snake, cx: number, cy: number, dir: number, range: number, half: number, apply: (o: Snake, x: number, y: number, i: number) => void) {
    this.forEachHit(s, (o, _i, x, y) => {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > range + o.r) return false;
      let da = Math.atan2(dy, dx) - dir;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) <= half || d < s.r + o.r;
    }, apply);
  }

  /** 직선(폭 w). 가까운 순으로 최대 n마리 */
  line(s: Snake, x0: number, y0: number, dir: number, len: number, w: number, n: number, apply: (o: Snake, x: number, y: number, i: number) => void) {
    const ux = Math.cos(dir), uy = Math.sin(dir);
    const hits: { o: Snake; x: number; y: number; i: number; t: number }[] = [];
    this.forEachHit(s, (o, _i, x, y) => {
      const t = (x - x0) * ux + (y - y0) * uy;
      if (t < -o.r || t > len + o.r) return false;
      const d = Math.abs((x - x0) * uy - (y - y0) * ux);
      return d <= w / 2 + o.r;
    }, (o, x, y, i) => hits.push({ o, x, y, i, t: (x - x0) * ux + (y - y0) * uy }));
    hits.sort((a, b) => a.t - b.t);
    for (const h of hits.slice(0, n)) apply(h.o, h.x, h.y, h.i);
  }

  // ---------- 상태 이상 ----------

  stun(o: Snake, t: number) {
    if (o.isBoss || o.invulnT > 0) return;
    o.stunT = Math.max(o.stunT, t);
  }
  slow(o: Snake, t: number, mul: number) {
    if (o.invulnT > 0) return;
    if (o.slowT <= 0 || mul < o.slowMul) o.slowMul = mul;
    o.slowT = Math.max(o.slowT, t * (o.isBoss ? 0.5 : 1));
  }
  root(o: Snake, t: number, by?: Snake) {
    if (o.isBoss || o.invulnT > 0) return;
    if (this.inst(o, 'thin') && o.thinCd <= 0) {
      o.thinCd = 20;
      this.events.push({ type: 'pop', snake: o.id, x: o.x, y: o.y - 30, text: '빠져나감!', color: 0x9adfff });
      return;
    }
    o.rootT = Math.max(o.rootT, t);
    if (by && this.inst(by, 'pounce')) SK.pounce(this, by, o);
  }
  silence(o: Snake, t: number) {
    if (o.isBoss || o.invulnT > 0) return;
    o.silenceT = Math.max(o.silenceT, t);
  }
  blind(o: Snake, t: number) {
    if (o.isBoss || o.invulnT > 0) return;
    o.blindT = Math.max(o.blindT, t);
  }
  markOn(o: Snake, t: number) {
    o.markT = Math.max(o.markT, t);
  }
  fear(o: Snake, t: number) {
    if (o.isBoss || o.invulnT > 0) return;
    o.fearT = Math.max(o.fearT, t);
  }
  /** 밀치기·끌어당기기: 0.3초쯤에 걸쳐 dist만큼 미끄러진다 */
  knock(o: Snake, angle: number, dist: number) {
    if (o.invulnT > 0 && dist > 0) return;
    const k = o.isBoss ? 0.25 : o.fam.knockTaken * this.tm(o, 'knock');
    const v = dist * k * 8;
    o.kvx += Math.cos(angle) * v;
    o.kvy += Math.sin(angle) * v;
  }
  pullTo(o: Snake, x: number, y: number, dist: number) {
    const d = Math.hypot(x - o.x, y - o.y);
    this.knock(o, Math.atan2(y - o.y, x - o.x), Math.min(dist, Math.max(0, d - 30)));
  }

  /** 잡기(사슴벌레) */
  grab(a: Snake, o: Snake, t: number, kind: string) {
    if (o.isBoss || o.invulnT > 0 || a.grabTarget >= 0) return false;
    if (this.inst(o, 'thin') && o.thinCd <= 0) {
      o.thinCd = 20;
      this.events.push({ type: 'pop', snake: o.id, x: o.x, y: o.y - 30, text: '빠져나감!', color: 0x9adfff });
      return false;
    }
    if (o.grabbedBy >= 0) return false;
    a.grabTarget = o.id;
    a.grabT = t;
    a.grabKind = kind;
    o.grabbedBy = a.id;
    this.events.push({ type: 'skillHit', x: o.x, y: o.y, kind: 'grab' });
    return true;
  }

  releaseGrab(s: Snake) {
    if (s.grabTarget >= 0) {
      const o = this.snakes[s.grabTarget];
      if (o && o.grabbedBy === s.id) o.grabbedBy = -1;
    }
    s.grabTarget = -1;
    s.grabT = 0;
    if (s.grabbedBy >= 0) {
      const a = this.snakes[s.grabbedBy];
      if (a && a.grabTarget === s.id) ((a.grabTarget = -1), (a.grabT = 0));
      s.grabbedBy = -1;
    }
  }

  /** 묶임·느려짐·잡힘 풀기 */
  cleanse(s: Snake) {
    s.rootT = s.slowT = s.stunT = s.fearT = s.blindT = s.silenceT = 0;
    s.slowMul = 1;
    if (s.grabbedBy >= 0) this.releaseGrab(s);
  }

  // ---------- 피해 ----------

  /**
   * a가 t에게 주는 피해(공격하는 쪽 배율 + 필살기 게이지). 실제로 들어간 피해를 돌려준다.
   * ult: 필살기 한 번이 한 대상에게 줄 수 있는 피해 상한(최대 체력의 40%)
   */
  deal(a: Snake, t: Snake, amount: number, kind: HitKind, x: number, y: number, cause: DeathCause = 'skill', ult: Map<number, number> | null = null, consume = true): number {
    if (!t.alive || amount <= 0) return 0;
    let d = amount;
    if (!a.isBoss) {
      if (consume && a.nextMul !== 1 && kind !== 'poison') {
        d *= a.nextMul;
        a.nextMul = 1;
      }
      if (consume && a.critNext > 0 && kind !== 'poison') {
        d *= a.critNext;
        a.critNext = 0;
        kind = kind === 'bite' ? 'crit' : kind;
        this.events.push({ type: 'pop', snake: a.id, x, y: y - 30, text: '치명타!', color: 0xff7a1a });
      }
      if (a.compoundT > 0) d *= 1.15;
      d *= this.tm(a, 'dmg');
      if (this.tsp(a, 'berserk') && a.hp < a.maxHp * 0.4) d *= 1.3;
      if (this.tsp(a, 'duelist')) d *= a.crowd === 1 ? 1.18 : a.crowd >= 2 ? 0.9 : 1;
      if (this.tsp(a, 'sticky') && (t.rootT > 0 || t.slowT > 0)) d *= 1.25;
      if (a.crisisT > 0) d *= 1 + this.ab(a, 'crisis');
      if (t.hp < t.maxHp * 0.3) d *= 1 + this.ab(a, 'eye');
      if (this.inst(a, 'patrol') && Math.hypot(a.x - a.patrolX, a.y - a.patrolY) < 320 && a.patrolT > 2) d *= 1.2;
      if (this.inst(a, 'snail') && (t.slowT > 0 || t.stunT > 0 || t.rootT > 0)) d *= 1.25;
      if (!t.isBoss) {
        if (this.inst(a, 'raid') && t.fam.id === 'bee') d *= 1.3;
        if (this.inst(a, 'heat') && t.fam.id === 'wasp') d *= 1.3;
      }
    }
    if (ult) {
      const used = ult.get(t.id) ?? 0;
      const cap = t.maxHp * CONFIG.ultCapFrac;
      d = Math.min(d, cap - used);
      if (d < 1) return 0;
    }
    const dealt = this.damage(t, d, a.id, kind, x, y, cause);
    if (ult) ult.set(t.id, (ult.get(t.id) ?? 0) + dealt);
    if (dealt > 0 && (kind === 'skill' || kind === 'ult') && this.tsp(a, 'chase')) a.chaseT = 2;
    if (dealt > 0 && !a.isBoss && kind !== 'ult' && !ult) this.addUlt(a, (dealt / this.B(a)) * CONFIG.ultDealt);
    return dealt;
  }

  /** t에게 피해(받는 쪽 배율). 실제로 들어간 피해를 돌려준다 */
  damage(t: Snake, amount: number, by: number, kind: HitKind, x: number, y: number, cause: DeathCause = 'bite', enemy?: EnemyKind): number {
    if (!t.alive || t.netT > 0 || amount <= 0) return 0;
    const atk = by >= 0 ? this.snakes[by] : null;
    const good = !!atk && atk.isPlayer;
    if (t.invulnT > 0 || t.flyT > 0 || t.deadT > 0 || t.evolveT > 0) {
      this.events.push({ type: 'hit', snake: t.id, by, dmg: 0, x, y, kind, good, blocked: true });
      if (!t.isBoss && kind !== 'poison') t.st.dmgBlocked += amount;
      return 0;
    }
    // 딱딱한 등판: 뒤에서 오는 피해를 막는다
    if (t.backT > 0 && atk) {
      const dir = Math.atan2(atk.y - t.y, atk.x - t.x) - t.angle;
      if (Math.cos(dir) < 0.2) {
        this.events.push({ type: 'hit', snake: t.id, by, dmg: 0, x, y, kind, good, blocked: true });
        t.st.dmgBlocked += amount;
        return 0;
      }
    }
    let d = amount;
    if (!t.isBoss) {
      d *= 1 - this.ab(t, 'shell');
      d *= this.tm(t, 'taken');
      if (this.tsp(t, 'loner') && t.crowd >= 2) d *= 1.2;
      if (this.tsp(t, 'sandbody') && t.sneaking) d *= 0.7;
      if (t.reduceT > 0) d *= t.reduceMul;
      if (t.curlT > 0) d *= 0.4;
      if (t.acroT > 0) d *= 1 - this.ab(t, 'acro');
      if (t.sapT > 0) d *= 1 - this.ab(t, 'saplove');
      if (t.grabTarget >= 0) d *= 1 - this.ab(t, 'legs');
      if (t.sneaking) {
        d *= CONFIG.guardMul;
        if (this.inst(t, 'brace')) d *= 0.7;
        if (this.inst(t, 'leafshield') && atk) {
          const dir = Math.atan2(atk.y - t.y, atk.x - t.x) - t.angle;
          if (Math.cos(dir) > 0.3) d *= 0.4;
        }
      }
      if (this.inst(t, 'flat') && this.nearRock(t, 60)) d *= 0.7;
      if (this.inst(t, 'sap') && this.nearBigFood(t)) d *= 0.75;
      if (this.inst(t, 'trash') && t.pack > 0) {
        // 몸 뒤쪽(머리에서 먼 곳)으로 오는 피해를 등짐이 막는다
        const hx = t.segs[0], hy = t.segs[1];
        if (Math.hypot(x - hx, y - hy) > t.r * 3) d *= 1 - 0.4 * t.pack;
      }
    }
    if (!t.isBoss && d < amount) t.st.dmgBlocked += amount - d;
    if (t.markT > 0) d *= 1.2;
    // 아들 모드: 내 곤충은 세게 때리고 적게 맞는다
    const pw = this.opts.power;
    if (pw !== 1) {
      if (atk?.isPlayer && !t.isPlayer) d *= pw;
      if (t.isPlayer && !atk?.isPlayer) d /= pw;
    }
    d = Math.max(1, Math.round(d));
    // 왕사슴벌레: 판마다 한 번, 쓰러질 피해를 체력 1로 버틴다
    if (d >= t.hp && this.inst(t, 'longlife') && !t.longLifeUsed) {
      t.longLifeUsed = true;
      d = Math.max(0, Math.ceil(t.hp) - 1);
      t.invulnT = Math.max(t.invulnT, 1);
      this.events.push({ type: 'pop', snake: t.id, x: t.x, y: t.y - 40, text: '버텼다!', color: 0xffe066 });
    }
    t.hp -= d;
    t.hurtT = 0;
    // 통계
    if (!t.isBoss) t.st.dmgTaken += d;
    if (atk && atk !== t && !atk.isBoss && !t.isBoss) {
      const st = atk.st;
      st.dmgDealt += d;
      const sk = kind === 'skill' || kind === 'ult' || kind === 'minion' || kind === 'poison';
      if (sk) st.skillDmg += d;
      const sec = Math.floor(this.time);
      atk.dmgBins[sec] = (atk.dmgBins[sec] ?? 0) + d;
      if (atk.castOpen && (kind === 'skill' || kind === 'minion') && this.time - atk.castT < 3) {
        st.castsHit++;
        atk.castOpen = false;
      }
      t.hitBy.set(atk.id, this.time);
    }
    // 필살기 게이지: 받으면 더 많이, 나보다 레벨이 높은 상대에게 맞으면 2배
    if (!t.isBoss && d > 0) {
      const higher = atk && (atk.isBoss || atk.level > t.level);
      this.addUlt(t, (d / t.maxHp) * CONFIG.ultTaken * (higher ? 2 : 1));
      // 위기의 힘
      if (t.hp < t.maxHp * 0.3 && t.crisisCd <= 0 && this.ab(t, 'crisis') > 0) {
        t.crisisT = 3;
        t.crisisCd = 30;
      }
    }
    // 피해에 비례해 꼬리 마디가 떨어진다(먹이가 됨)
    if (!t.isBoss) {
      t.dropAcc += d * CONFIG.tailDropPerDmg;
      const n = Math.min(Math.floor(t.dropAcc), Math.max(0, t.segCount - CONFIG.startSegments));
      t.dropAcc -= Math.floor(t.dropAcc);
      if (n > 0) this.dropTail(t, n);
    }
    // 위장·숨기는 맞으면 풀린다
    if (t.hiddenT > 0 && kind !== 'poison') t.hiddenT = 0;
    this.events.push({ type: 'hit', snake: t.id, by, dmg: d, x, y, kind, good });
    if (t.hp <= 0) this.kill(t, by, cause, enemy);
    return d;
  }

  nearRock(s: Snake, pad: number) {
    for (const rk of this.map.rocks) if (Math.hypot(s.x - rk.x, s.y - rk.y) < rk.r + s.r + pad) return true;
    return false;
  }

  nearBigFood(s: Snake) {
    for (const f of this.foods) if ((f.kind === 1 || f.kind === 4) && Math.abs(f.x - s.x) < 200 && Math.abs(f.y - s.y) < 200 && Math.hypot(f.x - s.x, f.y - s.y) < 200) return true;
    return false;
  }

  inPuddle(s: Snake) {
    for (const pd of this.map.puddles) if (Math.hypot(s.x - pd.x, s.y - pd.y) < pd.r) return true;
    return false;
  }

  eatTail(t: Snake, n: number) {
    t.segCount = Math.max(CONFIG.startSegments, t.segCount - n);
    this.updateSize(t);
    this.rebuildSegs(t);
  }

  capture(s: Snake) {
    s.netT = CONFIG.netHold;
    s.boosting = false;
    this.releaseGrab(s);
    this.rings = this.rings.filter((r) => r.owner !== s.id);
    this.events.push({ type: 'captured', snake: s.id });
  }

  private release(s: Snake) {
    s.netT = 0;
    const [x, y] = this.safeSpot(s, 500);
    const segs = Math.max(CONFIG.startSegments, Math.floor(s.segCount / 2));
    this.spawnAt(s, x, y, this.rng.range(0, Math.PI * 2), segs);
    s.hp = Math.max(1, Math.floor(s.maxHp / 2));
    s.invulnT = 1.5;
    this.events.push({ type: 'released', snake: s.id, x, y });
  }

  private dropTail(t: Snake, n: number) {
    for (let k = 0; k < n && t.segCount > CONFIG.startSegments; k++) {
      const ti = Math.min(t.segN, t.segCount) - 1;
      this.dropFood(t.segs[ti * 2], t.segs[ti * 2 + 1], 0.8, 40, t.level);
      t.segCount--;
    }
    this.updateSize(t);
  }

  shove(o: Snake, a: number, dist: number) {
    o.px = o.x;
    o.py = o.y;
    o.x += Math.cos(a) * dist;
    o.y += Math.sin(a) * dist;
    o.path.push(o.x, o.y);
    this.rebuildSegs(o);
  }

  private tickStatus(s: Snake, dt: number) {
    const dec = (v: number) => Math.max(0, v - dt);
    s.stunT = dec(s.stunT);
    s.slowT = dec(s.slowT);
    if (s.slowT <= 0) s.slowMul = 1;
    s.rootT = dec(s.rootT);
    s.silenceT = dec(s.silenceT);
    s.blindT = dec(s.blindT);
    s.markT = dec(s.markT);
    s.fearT = dec(s.fearT);
    s.hiddenT = dec(s.hiddenT);
    s.chaseT = dec(s.chaseT);
    // 매복 자세·빛 끄기: 웅크린 채 1.5초
    if (s.sneaking && (this.tsp(s, 'poise') || this.tsp(s, 'dark'))) {
      s.poiseAcc += dt;
      if (s.poiseAcc >= 1.5) {
        if (this.tsp(s, 'poise') && !s.poised) {
          s.poised = true;
          this.events.push({ type: 'pop', snake: s.id, x: s.x, y: s.y - 30, text: '매복!', color: 0x9be36a });
        }
        if (this.tsp(s, 'dark')) s.hiddenT = Math.max(s.hiddenT, 0.2);
      }
    } else s.poiseAcc = 0;
    s.ghostT = dec(s.ghostT);
    s.reduceT = dec(s.reduceT);
    if (s.reduceT <= 0) s.reduceMul = 1;
    s.backT = dec(s.backT);
    s.bitterT = dec(s.bitterT);
    s.curlT = dec(s.curlT);
    s.deadT = dec(s.deadT);
    s.escapeT = dec(s.escapeT);
    s.feastT = dec(s.feastT);
    s.yuckT = dec(s.yuckT);
    s.invulnT = dec(s.invulnT);
    s.biteCd = dec(s.biteCd);
    s.wallCd = dec(s.wallCd);
    s.compoundT = dec(s.compoundT);
    s.decoyT = dec(s.decoyT);
    s.nextBiteT = dec(s.nextBiteT);
    if (s.nextBiteT <= 0) s.nextBite = 1;
    s.fangT = dec(s.fangT);
    s.braceCd = dec(s.braceCd);
    s.fierceCd = dec(s.fierceCd);
    s.thinCd = dec(s.thinCd);
    s.sapCd = dec(s.sapCd);
    s.buzzCd = dec(s.buzzCd);
    s.nestCd = dec(s.nestCd);
    s.crisisCd = dec(s.crisisCd);
    s.crisisT = dec(s.crisisT);
    s.alertT = dec(s.alertT);
    s.acroT = dec(s.acroT);
    s.senseT = dec(s.senseT);
    s.sapT = dec(s.sapT);
    s.safeT = dec(s.safeT);
    s.sprintT = dec(s.sprintT);
    s.hurtT += dt;
    if (s.isBoss) {
      if (s.poisonT > 0) this.tickPoison(s, dt);
      return;
    }
    // 웅크린 시간(기도 자세·꽃 흉내·큰턱 벌리기·마른 잎·종이 집)
    if (s.sneaking && s.stunT <= 0) s.crouchT += dt;
    else s.crouchT = 0;
    s.notBoostT = s.boosting ? 0 : s.notBoostT + dt;
    if (this.inst(s, 'pray') && s.crouchT >= 1 && !s.prayArmed) {
      s.prayArmed = true;
      this.events.push({ type: 'pop', snake: s.id, x: s.x, y: s.y - 30, text: '🙏 기도 자세', color: 0xb8ff7a });
    }
    if ((this.inst(s, 'flower') || this.inst(s, 'jaws')) && s.crouchT >= 1 && s.critNext <= 0) {
      s.critNext = 2;
      this.events.push({ type: 'pop', snake: s.id, x: s.x, y: s.y - 30, text: this.inst(s, 'flower') ? '🌸 꽃 흉내' : '🦷 큰턱 벌림', color: 0xffc8f0 });
    }
    if (this.inst(s, 'leaf') && s.crouchT >= (this.map.theme === 'forest' ? 0.2 : 0.6)) s.hiddenT = Math.max(s.hiddenT, 0.25);
    if (this.inst(s, 'nest') && s.crouchT >= 1.5 && s.nestCd <= 0) {
      s.nestCd = 20;
      this.zones = this.zones.filter((z) => !(z.kind === 'nest' && z.owner === s.id));
      this.addZone({ x: s.x, y: s.y, r: 150, kind: 'nest', life: 20, owner: s.id });
      this.events.push({ type: 'pop', snake: s.id, x: s.x, y: s.y - 30, text: '🏠 종이 집', color: 0xf2e0b0 });
    }
    // 왕잠자리: 4초마다 순찰 기준점을 옮긴다
    if (this.inst(s, 'patrol')) {
      if (Math.hypot(s.x - s.patrolX, s.y - s.patrolY) > 320) ((s.patrolX = s.x), (s.patrolY = s.y), (s.patrolT = 0));
      else s.patrolT += dt;
    }
    // 회복
    let regen = 0;
    if (s.hurtT > CONFIG.regenDelay && s.hp < s.maxHp) regen += CONFIG.regenRate * (1 + this.ab(s, 'regen'));
    if (this.inst(s, 'waterborn') && this.inPuddle(s)) regen += 0.04;
    if (s.sneaking) regen += this.ab(s, 'patient');
    for (const z of this.zones) if (z.kind === 'nest' && z.owner === s.id && Math.hypot(s.x - z.x, s.y - z.y) < z.r) regen += 0.03;
    if (regen > 0 && s.hp < s.maxHp) this.heal(s, s.maxHp * regen * dt);
    // 양봉꿀벌: 체력이 낮으면 저장한 꿀을 먹는다
    if (this.inst(s, 'store') && s.hp < s.maxHp * 0.35 && s.store > 1) {
      const h = Math.min(s.store, s.maxHp - s.hp);
      s.hp += h;
      s.store -= h;
      this.events.push({ type: 'pop', snake: s.id, x: s.x, y: s.y - 30, text: `🍯 +${Math.round(h)}`, color: 0xffd23f });
    }
    if (s.poisonT > 0) this.tickPoison(s, dt);
  }

  private tickPoison(s: Snake, dt: number) {
    s.poisonT -= dt;
    s.poisonAcc += dt;
    if (s.poisonAcc >= CONFIG.poisonTick) {
      s.poisonAcc = 0;
      const by = s.poisonBy >= 0 ? this.snakes[s.poisonBy] : null;
      if (by && by.alive) this.deal(by, s, s.poisonDps * CONFIG.poisonTick, 'poison', s.x, s.y, 'poison', null, false);
      else this.damage(s, s.poisonDps * CONFIG.poisonTick, -1, 'poison', s.x, s.y, 'poison');
    }
  }

  /** 중독(진한 독 카드 반영) */
  poison(by: Snake, o: Snake, t: number, dps: number) {
    if (o.invulnT > 0) return;
    const mul = (1 + (by.fam.id === 'wasp' ? this.ab(by, 'toxin') : 0)) * this.tm(by, 'poison');
    o.poisonT = Math.max(o.poisonT, t);
    o.poisonDps = Math.max(o.poisonT > 0 && o.poisonBy === by.id ? o.poisonDps : 0, dps * mul);
    o.poisonBy = by.id;
  }

  // ---------- 이동 ----------

  private moveSnake(s: Snake, dt: number) {
    const c = s.cmd;
    const pinned = s.grabbedBy >= 0;
    const busy = s.stunT > 0 || s.rootT > 0 || s.curlT > 0 || s.deadT > 0 || s.ambushT > 0 || pinned;
    s.sneaking = c.sneak && !s.isBoss && s.dashT <= 0;
    s.boosting = c.boost && !c.sneak && !busy && s.segCount > CONFIG.boostMinSegments && s.dashT <= 0 && s.whirlT <= 0;
    const sizeSlow = 1 - CONFIG.sizeTurnSlow * Math.min(1, Math.max(0, s.segCount - CONFIG.startSegments) / 200);
    let maxTurn = s.isBoss ? CONFIG.bossTurn * dt : CONFIG.turnRate * dt * sizeSlow * (s.sneaking ? CONFIG.sneakTurnMul : 1);
    if (s.stunT > 0 || s.deadT > 0) maxTurn = 0;
    let want = c.angle;
    // 눈부심: 방향이 흔들린다
    if (s.blindT > 0) want += Math.sin(this.time * 11 + s.id) * 1.1;
    if (s.chanT > 0 && s.chanKind === 'circle') s.angle += 8.4 * dt * s.side * (s.chanT > 0.75 ? 1 : -1); // 맴돌기: 반은 왼쪽, 반은 오른쪽으로 돌아 8자를 그린다
    else {
      let diff = want - s.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      s.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
    let speed = this.speedOf(s);
    if (!s.isBoss) {
      if (s.yuckT > 0) speed *= CONFIG.yuckMul;
      if (s.boosting) speed *= CONFIG.boostMul * this.tm(s, 'boost');
      else if (s.sneaking) speed *= CONFIG.sneakMul;
      if (s.dashT > 0) speed *= s.dashMul;
      if (s.evolveT > 0) speed *= 0.5;
      if (s.fearT > 0) speed *= 0.5;
      if (s.escapeT > 0) speed *= 2.2;
      if (s.senseT > 0) speed *= 1 + this.ab(s, 'sense');
      if (s.alertT > 0) speed *= 1.2;
      if (s.grabTarget >= 0) speed *= 0.4;
      if (s.chanT > 0 && s.chanKind === 'push') speed *= 0.35;
      if (s.chanT > 0 && s.chanKind === 'circle') speed *= 1.4;
      if (this.inPuddle(s) && s.flyT <= 0) speed *= this.inst(s, 'water') ? 1.25 : s.fam.id === 'dragonfly' && s.evo === 1 ? 1.3 : 0.7;
    }
    if (s.slowT > 0) speed *= s.slowMul;
    if (s.stunT > 0) speed *= 0.25;
    if (busy) speed = 0;
    // 질주: 길이가 줄어든다(긴 숨·큰 날개·질주 출발)
    if (s.boosting) {
      let drain = 1 - this.ab(s, 'breath');
      if (this.inst(s, 'bigwing')) drain *= 0.5;
      if (s.sprintT > 0) drain = 0;
      s.boostAcc += dt * drain;
      const dropI = CONFIG.boostDropInterval / this.tm(s, 'boostDrop');
      if (s.boostAcc >= dropI) {
        s.boostAcc -= dropI;
        const tx = s.segs[(s.segN - 1) * 2], ty = s.segs[(s.segN - 1) * 2 + 1];
        s.segCount--;
        this.updateSize(s);
        this.dropFood(tx, ty, 0.6, 30, s.level);
      }
    } else s.boostAcc = 0;
    s.px = s.x;
    s.py = s.y;
    const mvA = Number.isNaN(s.dashAngle) ? s.angle : s.dashAngle;
    let mx = speed > 0 ? Math.cos(mvA) * speed * dt : 0;
    let my = speed > 0 ? Math.sin(mvA) * speed * dt : 0;
    // 밀치기
    if (s.kvx !== 0 || s.kvy !== 0) {
      mx += s.kvx * dt;
      my += s.kvy * dt;
      const k = Math.exp(-8 * dt);
      s.kvx *= k;
      s.kvy *= k;
      if (Math.abs(s.kvx) + Math.abs(s.kvy) < 4) s.kvx = s.kvy = 0;
    }
    // 잡힘: 잡은 쪽 큰턱 앞에 붙들린다
    if (pinned) {
      const a = this.snakes[s.grabbedBy];
      if (a && a.alive) {
        const tx = a.x + Math.cos(a.angle) * (a.r * 2.4 + s.r), ty = a.y + Math.sin(a.angle) * (a.r * 2.4 + s.r);
        mx = (tx - s.x) * Math.min(1, dt * 14);
        my = (ty - s.y) * Math.min(1, dt * 14);
      } else s.grabbedBy = -1;
    }
    if (mx !== 0 || my !== 0) {
      s.x += mx;
      s.y += my;
      s.path.push(s.x, s.y);
    }
    if (s.slideT > 0) {
      // 구르기: 머리부터 꼬리까지 몸 전체가 옆으로 함께 비켜난다
      const k = Math.min(dt, s.slideT);
      const ox = s.slideVx * k, oy = s.slideVy * k;
      const p = s.path;
      for (let i = 0; i < p.length; i += 2) ((p[i] += ox), (p[i + 1] += oy));
      s.x += ox;
      s.y += oy;
      s.slideT -= dt;
    }
    this.rebuildSegs(s);
  }

  private eatFoods(dt: number) {
    const foods = this.foods;
    for (const s of this.snakes) {
      if (!this.onField(s) || s.isBoss || s.ambushT > 0) continue;
      const reach = s.r + 10;
      const mag = CONFIG.magnetRadius * (1 + this.ab(s, 'magnet')) + s.r;
      const mag2 = mag * mag;
      for (let i = foods.length - 1; i >= 0; i--) {
        const f = foods[i];
        const dx = f.x - s.x, dy = f.y - s.y;
        if (dx > mag || dx < -mag || dy > mag || dy < -mag) continue;
        const d2 = dx * dx + dy * dy;
        const rr = reach + f.r;
        if (d2 > rr * rr) {
          // 먹이를 끌어당긴다
          if (d2 < mag2) {
            const d = Math.sqrt(d2);
            const v = Math.min(d - rr + 1, 260 * dt);
            f.x -= (dx / d) * v;
            f.y -= (dy / d) * v;
          }
          continue;
        }
        s.st.food++;
        if (f.kind === 4) this.eatSpecial(s, f);
        else if (f.kind === 3) {
          s.rerolls++;
          this.feed(s, f.ep);
          this.events.push({ type: 'eat', snake: s.id, x: f.x, y: f.y, big: true, gold: true });
        } else {
          let ep = f.ep;
          if (f.kind === 2 && s.level > f.sub) ep *= CONFIG.remainsWeakMul;
          this.feed(s, ep);
          if (f.kind === 1 && this.ab(s, 'saplove') > 0) s.sapT = 3;
          this.events.push({ type: 'eat', snake: s.id, x: f.x, y: f.y, big: f.kind !== 0 });
        }
        foods[i] = foods[foods.length - 1];
        foods.pop();
      }
    }
  }

  /** 특별 먹이: 좋아하면 폭풍 성장, 싫어하면 한동안 느려짐 */
  private eatSpecial(s: Snake, f: Food) {
    const t = taste(s.fam.id, f.sub);
    if (t > 0) {
      this.feed(s, CONFIG.likeEP);
      s.segCount += CONFIG.likeSegs;
      this.updateSize(s);
      this.heal(s, s.maxHp * CONFIG.likeHeal);
      this.addUlt(s, CONFIG.ultLike);
      s.feastT = CONFIG.feastTime;
      s.yuckT = 0;
    } else if (t < 0) {
      s.yuckT = CONFIG.yuckTime;
      s.feastT = 0;
    } else this.feed(s, f.ep);
    this.events.push({ type: 'eat', snake: s.id, x: f.x, y: f.y, big: true, special: f.sub, taste: t });
  }

  private refillFoods(dt: number) {
    let normal = 0, big = 0, gold = 0, special = 0;
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if (f.kind === 0) normal++;
      else if (f.kind === 1) big++;
      else if (f.kind === 4) special++;
      else if (f.kind === 3 && f.life === Infinity) gold++;
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
    if (gold < CONFIG.goldCount && this.rng.next() < 0.004) this.foods.push(this.newFood(3));
    if (special < CONFIG.specialCount && this.rng.next() < 0.01) this.foods.push(this.newFood(4));
  }

  private updateProjs(dt: number) {
    for (let k = this.projs.length - 1; k >= 0; k--) {
      const p = this.projs[k];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      let done = false;
      for (const o of this.snakes) {
        if (o.id === p.owner || p.hits.has(o.id) || !this.hittable(o)) continue;
        for (let i = 0; i < o.segN; i += 2) {
          const dx = o.segs[i * 2] - p.x, dy = o.segs[i * 2 + 1] - p.y;
          const rr = o.r + 8;
          if (dx * dx + dy * dy < rr * rr) {
            p.hits.add(o.id);
            p.onHit(o, p.x, p.y);
            if (p.hits.size >= p.pierce) done = true;
            break;
          }
        }
        if (done) break;
      }
      if (!done && p.life <= 0 && p.onEnd) p.onEnd(p.x, p.y);
      if (done || p.life <= 0) {
        const idx = this.projs.indexOf(p);
        if (idx >= 0) this.projs.splice(idx, 1);
      }
    }
  }

  // ---------- 충돌 ----------

  private buildGrid() {
    this.grid.clear();
    for (let si = 0; si < this.snakes.length; si++) {
      const s = this.snakes[si];
      if (!this.onField(s) || s.ghostT > 0 || s.flyT > 0) continue;
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
      if (!this.onField(a)) continue;
      if (a.flyT <= 0) {
        for (const rk of this.map.rocks) {
          const dx = a.x - rk.x, dy = a.y - rk.y;
          const d = Math.hypot(dx, dy), min = rk.r + a.r * 0.7;
          if (d < min) {
            const out = Math.atan2(dy, dx);
            a.x = rk.x + Math.cos(out) * (min + 2);
            a.y = rk.y + Math.sin(out) * (min + 2);
            let diff = a.angle - out;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            a.angle = out + Math.sign(diff || 1) * Math.PI / 2.2;
            a.path[a.path.length - 2] = a.x;
            a.path[a.path.length - 1] = a.y;
            this.rebuildSegs(a);
            SK.onRock(this, a);
          }
        }
      }
      if (Math.hypot(a.x, a.y) > CONFIG.arenaRadius) {
        a.angle = Math.atan2(-a.y, -a.x);
        a.x = a.px;
        a.y = a.py;
        a.kvx = a.kvy = 0;
        if (!a.isBoss && a.wallCd <= 0) {
          a.wallCd = 0.6;
          SK.onRock(this, a);
          this.damage(a, a.maxHp * CONFIG.wallDamage, -1, 'wall', a.x, a.y, 'wall');
        }
        continue;
      }
      if (a.flyT > 0 || a.ghostT > 0 || a.grabbedBy >= 0) continue;
      this.forSegsNear(a.x, a.y, a.r + 40, (b, i, sx, sy) => {
        if (b.id === a.id || !b.alive) return;
        if (a.grabTarget === b.id) return true;
        const rr = (a.r + b.r) * 0.8;
        const dx = sx - a.x, dy = sy - a.y;
        if (dx * dx + dy * dy > rr * rr) return;
        const myRing = ringOf.get(a.id);
        if (myRing && myRing.inside.get(b.id)) return;
        if (i !== 0 && ringOwners.has(b.id)) {
          bounces.push([a, sx, sy]);
          return true;
        }
        if (a.dashT > 0 && a.dashKind) {
          if (!a.dashHits.has(b.id)) dashHits.push([a, b, sx, sy]);
          return true;
        }
        bites.push({ a, b, x: sx, y: sy, i });
        bounces.push([a, sx, sy]);
        return true;
      });
    }
    for (const [a, sx, sy] of bounces) if (a.alive) this.bounce(a, sx, sy);
    for (const [a, b, x, y] of dashHits) {
      if (!a.alive || !b.alive || a.dashHits.has(b.id)) continue;
      a.dashHits.add(b.id);
      SK.onDashHit(this, a, b, x, y);
    }
    for (const { a, b, x, y, i } of bites) {
      if (!a.alive || !b.alive || a.biteCd > 0) continue;
      a.biteCd = CONFIG.biteCooldown;
      this.bite(a, b, x, y, i);
    }
  }

  private bite(a: Snake, b: Snake, x: number, y: number, i: number) {
    let dmg = biteOf(this.fighter(a));
    if (!a.isBoss) {
      dmg *= 1 + this.ab(a, 'jaw');
      dmg *= this.tm(a, 'bite');
      if (a.hiddenT > 0 && this.tsp(a, 'dark')) dmg *= 1.4;
      dmg *= a.nextBite;
      a.nextBite = 1;
    }
    // 꼬리 급소: 상대 최대 체력의 일정 비율
    const tailN = Math.max(4, Math.floor(b.segN * CONFIG.tailCritSegs));
    const crit = i > 0 && b.segN > 10 && i >= b.segN - tailN && !a.isBoss && !b.isBoss;
    if (crit) dmg = Math.max(dmg, b.maxHp * CONFIG.tailCritFrac * (1 + this.ab(a, 'tail')));
    // 쓴맛 몸: 나를 문 적이 느려지고 피해의 50%를 돌려받는다
    const bitterB = b.bitterT > 0;
    const dealt = this.deal(a, b, dmg, crit ? 'crit' : 'bite', x, y, 'bite');
    if (dealt > 0 && !a.isBoss) {
      a.st.bites++;
      if (crit) a.st.crits++;
    }
    if (!a.isBoss && dealt > 0) {
      if (this.tsp(a, 'hungry')) this.heal(a, dealt * 0.25);
      if (this.tsp(a, 'venombite') && b.alive) this.poison(a, b, 2, this.B(a) * 0.12);
      if (this.tsp(a, 'spark') && b.alive) this.markOn(b, 2);
      const vamp = this.ab(a, 'vamp');
      if (vamp > 0) this.heal(a, dealt * vamp);
      const ven = this.ab(a, 'venom');
      if (ven > 0 && b.alive) this.poison(a, b, ven, this.B(a) * 0.1);
      if (this.inst(a, 'beak') && b.alive) this.poison(a, b, 2, this.B(a) * 0.15);
      if (a.fangT > 0 && b.alive) {
        a.fangT = 0;
        this.stun(b, 1);
        this.root(b, 1);
        this.silence(b, 1);
        this.events.push({ type: 'skillHit', x, y, kind: 'stun' });
      }
    }
    if (!a.alive || !b.alive) return;
    if (!b.isBoss && !a.isBoss) {
      if (bitterB) {
        this.slow(a, 1, 0.6);
        this.deal(b, a, dealt * 0.5, 'reflect', a.x, a.y, 'bite', null, false);
      }
      const thorn = this.ab(b, 'thorn');
      if (thorn > 0 && dealt > 0) this.deal(b, a, dealt * thorn, 'reflect', a.x, a.y, 'bite', null, false);
      if (this.inst(b, 'warncolor')) this.slow(a, 1, 0.6);
      if (this.inst(b, 'brace') && b.sneaking && b.braceCd <= 0) {
        b.braceCd = 1;
        this.deal(b, a, this.B(b) * 0.3, 'skill', a.x, a.y, 'skill', null, false);
      }
      if (this.inst(b, 'fierce') && b.fierceCd <= 0 && b.alive && this.canAct(b)) {
        b.fierceCd = 4;
        SK.counterDash(this, b, a);
      }
    }
    // 레벨이 훨씬 높은 몸에 박았으면 반동(꼬리 급소는 반동 없음)
    if (a.alive && b.alive && !crit && this.stronger(b, a)) this.deal(b, a, biteOf(this.fighter(b)) * CONFIG.recoilMul, 'recoil', a.x, a.y, 'bite', null, false);
  }

  // ---------- 감싸기 ----------

  private detectLoop(s: Snake) {
    if (this.rings.some((r) => r.owner === s.id)) return;
    const hit = s.r * 1.1;
    const minIdx = Math.max(8, Math.round(CONFIG.loopMinIndex * (1 - this.ab(s, 'coil'))));
    for (let i = minIdx; i < s.segN; i++) {
      const dx = s.segs[i * 2] - s.x, dy = s.segs[i * 2 + 1] - s.y;
      if (dx * dx + dy * dy > hit * hit) continue;
      const poly = s.segs.slice(0, (i + 1) * 2);
      const area = Math.abs(polyArea(poly));
      if (Math.sqrt(area / Math.PI) < s.r * CONFIG.loopMinRadiusPerR * (1 - this.ab(s, 'coil'))) return;
      const [cx, cy] = polyCentroid(poly);
      const inside = new Map<number, boolean>();
      let trapped = 0;
      for (const o of this.snakes) {
        if (o.id === s.id || !this.onField(o)) continue;
        const inn = pointInPoly(o.x, o.y, poly);
        inside.set(o.id, inn);
        if (inn) trapped++;
      }
      const delay = CONFIG.crushDelay;
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
        if (o.id === ring.owner || !this.onField(o) || o.flyT > 0) continue;
        if (!ring.inside.has(o.id)) ring.inside.set(o.id, pointInPoly(o.x, o.y, ring.poly));
        const was = ring.inside.get(o.id)!;
        const now = pointInPoly(o.x, o.y, ring.poly);
        if (now !== was) {
          o.x = o.px;
          o.y = o.py;
          o.kvx = o.kvy = 0;
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
          if (o.id === ring.owner || !this.onField(o) || o.flyT > 0) continue;
          if (!pointInPoly(o.x, o.y, ring.poly)) continue;
          if (o.isBoss) {
            this.damage(o, o.maxHp * CONFIG.bossCrushFrac, ring.owner, 'crush', o.x, o.y, 'crush');
            count++;
          } else if (this.inst(o, 'thin') && o.thinCd <= 0) {
            // 실잠자리: 휘감기에서 한 번 빠져나간다
            o.thinCd = 20;
            o.invulnT = Math.max(o.invulnT, 0.6);
            this.shove(o, Math.atan2(o.y - ring.cy, o.x - ring.cx), 120);
            this.events.push({ type: 'pop', snake: o.id, x: o.x, y: o.y - 30, text: '빠져나감!', color: 0x9adfff });
          } else if (o.invulnT <= 0 && o.deadT <= 0) {
            this.events.push({ type: 'hit', snake: o.id, by: ring.owner, dmg: Math.ceil(o.hp), x: o.x, y: o.y, kind: 'crush', good: true });
            this.kill(o, ring.owner, 'crush');
            count++;
          }
        }
        if (count > 0) {
          owner.crushes += count;
          if (count >= 2) owner.totalNut += Math.floor(CONFIG.scoreCrush * (CONFIG.comboBonus - 1) * count);
        }
        this.events.push({ type: 'crush', snake: ring.owner, cx: ring.cx, cy: ring.cy, count });
        this.rings.splice(k, 1);
      }
    }
  }

  // ---------- 왕지네(천적) ----------

  spawnCentipede(x: number, y: number) {
    let b = this.snakes.find((o) => o.isBoss);
    if (!b) {
      b = this.makeSnake(this.snakes.length, '왕지네', false, SPECIES[0], 'charge', []);
      b.isBoss = true;
      this.snakes.push(b);
    }
    this.clearStatus(b);
    b.totalNut = b.kills = b.score = 0;
    this.spawnAt(b, x, y, Math.atan2(-y, -x), CONFIG.bossSegments);
    this.fullHeal(b);
    this.bossId = b.id;
  }

  despawnCentipede() {
    const b = this.bossId >= 0 ? this.snakes[this.bossId] : null;
    if (b && b.alive) {
      b.alive = false;
      this.rings = this.rings.filter((r) => r.owner !== b.id);
    }
    this.bossId = -1;
  }

  bossTarget(): Snake | null {
    let best: Snake | null = null;
    for (const s of this.snakes) if (this.onField(s) && !s.isBoss && s.safeT <= 0 && (!best || s.score > best.score)) best = s;
    return best;
  }

  // ---------- 죽음 ----------

  kill(s: Snake, by: number, cause: DeathCause, enemy?: EnemyKind) {
    if (!s.alive) return;
    s.alive = false;
    s.hp = 0;
    s.netT = 0;
    this.releaseGrab(s);
    for (const m of this.minions) if (m.owner === s.id) m.life = 0;
    if (s.isBoss) {
      for (let i = 0; i < s.segN; i += 2) this.dropFood(s.segs[i * 2], s.segs[i * 2 + 1], 3, 40, 99);
    } else {
      // 잔해: 모은 영양의 30%를 몸 위에 나눠 떨어뜨린다
      const total = Math.max(4, s.totalNut * CONFIG.remainsFrac);
      const n = Math.max(4, Math.min(48, s.segN));
      const step = s.segN / n;
      for (let k = 0; k < n; k++) {
        const i = Math.min(s.segN - 1, Math.floor(k * step));
        this.dropFood(s.segs[i * 2], s.segs[i * 2 + 1], total / n, 40, s.level);
      }
      for (let k = 0; k < Math.min(2, s.rerolls - (s.isPlayer ? 0 : 1)); k++) this.dropGold(s.x, s.y);
      if (this.inst(s, 'babies')) SK.babies(this, s);
    }
    s.deaths++;
    if (!s.isBoss) {
      s.st.bestLife = Math.max(s.st.bestLife, this.time - s.lifeStart);
      for (const [id, t0] of s.hitBy) if (id !== by && this.time - t0 < 5 && this.snakes[id]?.alive) this.snakes[id].st.assists++;
      s.hitBy.clear();
    }
    const killer = by >= 0 && by !== s.id ? this.snakes[by] : null;
    if (killer) {
      killer.kills++;
      killer.killsAll++;
      if (this.tsp(killer, 'hunter')) ((this.heal(killer, killer.maxHp * 0.4)), this.addUlt(killer, 20));
      this.addUlt(killer, CONFIG.ultKill);
      if (killer.fam.id === 'mantis' && this.ab(killer, 'hunter') > 0) killer.skillCd *= 1 - this.ab(killer, 'hunter');
    }
    this.events.push({ type: 'death', snake: s.id, x: s.x, y: s.y, by, cause, enemy });
    this.rings = this.rings.filter((r) => r.owner !== s.id);
    for (const z of this.zones) if (z.owner === s.id && (z.follow || z.kind === 'nest')) z.life = 0;
    if (s.isBoss) {
      if (killer) killer.totalNut += CONFIG.scoreBoss;
      this.bossId = -1;
      this.enemies.centipedeKilled();
      return;
    }
    // 잃는 것: 모으던 영양(영양 보관: 절반 지킴), 필살기 게이지
    s.nut = this.tsp(s, 'keepnut') ? s.nut : 0;
    s.ult = 0;
    if (s.isPlayer) {
      // 목숨 제한 없음(CONFIG.lives 0): 쓰러질수록 부활이 1초씩 늦어진다(최대 +4초). 순위는 판이 끝날 때 점수로
      s.respawnT = CONFIG.respawnDelay + Math.min(4, s.deaths - 1) + this.tm(s, 'respawn');
      if (CONFIG.lives > 0) {
        s.lives--;
        if (s.lives <= 0) return this.endRound(false);
      }
      this.events.push({ type: 'lifeLost', lives: CONFIG.lives > 0 ? s.lives : -1, respawn: s.respawnT });
      return;
    }
    s.respawnT = CONFIG.botRespawnDelay + this.tm(s, 'respawn');
  }

  // ---------- 상태 보내기 ----------

  /** 통계 마무리: 최고 DPS(5초 창), 지금 살아 있는 목숨의 길이 */
  statsOf(s: Snake): Stats {
    const st = { ...s.st };
    const b = s.dmgBins;
    let best = 0;
    for (let i = 0; i < b.length; i++) {
      let w = 0;
      for (let k = i; k < i + 5 && k < b.length; k++) w += b[k] ?? 0;
      best = Math.max(best, w);
    }
    st.peakDps = best / 5;
    if (s.alive) st.bestLife = Math.max(st.bestLife, this.time - s.lifeStart);
    return st;
  }

  snapshot(): Snapshot {
    const snakes: SnakeView[] = this.snakes.map((s) => ({
      id: s.id, name: s.name, species: s.isBoss ? 'boss' : s.sp.id, family: s.isBoss ? null : s.fam.id, stage: s.evo, level: s.level,
      alive: s.alive, isPlayer: s.isPlayer, isBoss: s.isBoss, r: s.r, angle: s.angle,
      boosting: s.boosting, sneaking: s.sneaking,
      segs: s.alive ? s.segs.slice(0, s.segN * 2) : new Float32Array(0),
      score: s.score, kills: s.kills, killsAll: s.killsAll, deaths: s.deaths, stats: s.isPlayer || this.state === 'ended' ? this.statsOf(s) : undefined, crushes: s.crushes, length: s.segCount,
      hp: Math.max(0, Math.ceil(s.hp)), maxHp: s.maxHp,
      captured: s.netT > 0, invuln: s.invulnT > 0 || s.deadT > 0, poisoned: s.poisonT > 0,
      evolving: s.evolveT > 0 ? 1 - s.evolveT / CONFIG.evolveTime : 0,
      fly: s.flyT > 0, shield: s.reduceT > 0 || s.curlT > 0 || s.backT > 0 || s.bitterT > 0, stun: s.stunT > 0, slow: s.slowT > 0, root: s.rootT > 0,
      mark: s.markT > 0, blind: s.blindT > 0, fear: s.fearT > 0, silence: s.silenceT > 0,
      hidden: s.ambushT > 0 ? 1 : s.hiddenT > 0 ? 0.8 : 0, grabbed: s.grabbedBy >= 0, dash: s.dashT > 0, whirl: s.whirlT > 0,
      feast: s.feastT > 0, yuck: s.yuckT > 0, ultReady: s.ult >= CONFIG.ultMax, buff: s.prayArmed || s.critNext > 0 || s.nextMul > 1 || s.fangT > 0,
    }));
    const foods = new Float32Array(this.foods.length * 5);
    for (let i = 0; i < this.foods.length; i++) {
      const f = this.foods[i];
      foods[i * 5] = f.x;
      foods[i * 5 + 1] = f.y;
      foods[i * 5 + 2] = f.r;
      foods[i * 5 + 3] = f.kind;
      foods[i * 5 + 4] = f.kind === 4 ? f.sub : 0;
    }
    const rings: RingView[] = this.rings.map((r) => ({ owner: r.owner, poly: r.poly, cx: r.cx, cy: r.cy, t: r.t, total: r.total }));
    const p = this.snakes[this.playerId];
    const [rank, total] = this.rankOf(this.playerId);
    const events = this.events;
    this.events = [];
    const offer = p.offer ? { kind: p.offer.kind, cards: p.offer.cards.map((c) => this.cardView(p, c)) } : null;
    const marks: { x: number; y: number }[] = [];
    if (p.lastAct === 'sub' && p.sub?.id === 'waggle' && this.time - p.lastActT < 6) {
      for (const f of this.foods) if (f.kind === 3 || (f.kind === 4 && taste(p.fam.id, f.sub) > 0)) marks.push({ x: f.x, y: f.y });
    }
    const minions: MinionView[] = this.minions.map((m) => ({ x: m.x, y: m.y, angle: m.angle, owner: m.owner, kind: m.kind }));
    return {
      tick: this.tick, time: this.time, snakes, foods, rings,
      zones: this.zones.map((z) => ({ x: z.x, y: z.y, r: z.r, kind: z.kind, life: z.life, max: z.max, owner: z.owner })),
      projs: this.projs.map((q) => ({ x: q.x, y: q.y, angle: Math.atan2(q.vy, q.vx), kind: q.kind, owner: q.owner })),
      minions,
      teles: this.teles.map((t) => ({ shape: t.shape, x: t.x, y: t.y, r: t.r, angle: t.angle, len: t.len, w: t.w, t: t.t, total: t.total, owner: t.owner })),
      enemy: this.enemies.view(), map: this.map, timeLeft: Math.max(0, CONFIG.roundTime - this.time),
      events, playerId: this.playerId,
      player: {
        level: p.level, nut: p.nut, need: nutNeed(p.level), offer, pending: p.pending, rerolls: p.rerolls,
        skillCd: p.skillCd, skillCdMax: this.skillCdMax(p), subId: p.sub?.id ?? null, subCd: p.subCd, subCdMax: this.subCdMax(p),
        ult: p.ult, ultActive: p.whirlT > 0 || p.skyT > 0, abilities: p.abilities.map((a) => ({ ...a })), mainLv: p.mainLv, subLv: p.subLv,
        form: this.larvaLip(p) ? 'lip' : p.form.id, traits: [...p.traits],
        lives: p.lives, respawnIn: p.alive ? 0 : Math.max(0, p.respawnT), captured: Math.max(0, p.netT), rank, total, ultUses: p.ultUses,
        marks, reveal: p.compoundT > 0,
      },
      bossId: this.bossId, state: this.state,
    };
  }

  private cardView(s: Snake, c: LevelCard): CardView {
    if (c.kind === 'sub') {
      if (s.offer?.kind === 'sub') return { kind: 'pick', id: c.id, lv: 1, exclusive: c.id === s.fam.sub.id };
      return { kind: 'sub', id: 'sub', lv: 1 };
    }
    if (c.kind === 'new') return { kind: 'new', id: c.id, lv: 1, exclusive: !!ABILITY_BY_ID.get(c.id)?.family };
    if (c.kind === 'up') return { kind: 'up', id: c.id, lv: (s.abilities.find((a) => a.id === c.id)?.lv ?? 0) + 1, exclusive: !!ABILITY_BY_ID.get(c.id)?.family };
    if (c.kind === 'main') return { kind: 'main', id: c.id, lv: s.mainLv + 1 };
    return { kind: 'bonus', id: c.id, lv: 1 };
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

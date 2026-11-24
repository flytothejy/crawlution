// 시뮬레이션 ↔ 화면 사이에 오가는 데이터. 화면은 이것만 보고 그린다.
import type { FamilyId } from './species';

/** 플레이어·봇·원격 플레이어가 모두 보내는 같은 형식의 명령 */
export interface Command {
  angle: number; // 가고 싶은 방향(rad)
  boost: boolean;
  sneak: boolean;
  skillSeq: number; // 주 기술(게이지가 차 있으면 필살기). 누를 때마다 1씩 증가
  subSeq: number; // 보조 기술
  cardSeq: number; // 카드 고르기
  cardChoice: number; // 카드 번호
  rerollSeq: number; // 다시 뽑기
}

export const emptyCommand = (angle = 0): Command => ({ angle, boost: false, sneak: false, skillSeq: 0, subSeq: 0, cardSeq: 0, cardChoice: 0, rerollSeq: 0 });

export type DeathCause = 'bite' | 'wall' | 'crush' | 'enemy' | 'poison' | 'skill' | 'ult';
export type HitKind = 'bite' | 'recoil' | 'skill' | 'poison' | 'enemy' | 'wall' | 'crush' | 'crit' | 'ult' | 'minion' | 'reflect';
export type EnemyKind = 'bird' | 'frog' | 'rain' | 'centipede' | 'anteater' | 'child';
export type MapTheme = 'grass' | 'sand' | 'forest';

/** 화면 효과 종류(계열별 연출) */
export type FxKind =
  | 'charge' | 'shock' | 'lift' | 'push' | 'thud'
  | 'grab' | 'throw' | 'scissor' | 'slam'
  | 'sweep' | 'stab' | 'combo' | 'threat' | 'whirl'
  | 'dive' | 'land' | 'snatch' | 'circle' | 'lip' | 'compound'
  | 'sting' | 'rain'
  | 'cloud' | 'jet' | 'backjet' | 'gasburst'
  | 'web' | 'silk' | 'prison'
  | 'pit' | 'sand' | 'ambush' | 'hell'
  | 'summon' | 'honey' | 'heat' | 'waggle'
  | 'flash' | 'signal' | 'lantern' | 'aurora'
  | 'camo' | 'hop' | 'escape' | 'curl' | 'heal' | 'chirp' | 'decoy' | 'roll' | 'backstep' | 'playdead' | 'backplate' | 'bitter' | 'fang' | 'alarm'
  // 3판 새 기술(도감 연출)
  | 'fangstab' | 'coil' | 'vortex' | 'acid' | 'burrow' | 'antcall' | 'antriver' | 'leafwall' | 'nest' | 'buzz' | 'mudpot' | 'powder' | 'flutter' | 'charm' | 'bstorm' | 'eyespot' | 'morpho' | 'hairs';

export type GameEvent =
  | { type: 'eat'; snake: number; x: number; y: number; big: boolean; gold?: boolean; special?: number; taste?: number }
  | { type: 'death'; snake: number; x: number; y: number; by: number; cause: DeathCause; enemy?: EnemyKind }
  | { type: 'ring'; snake: number; cx: number; cy: number; trapped: number }
  | { type: 'crush'; snake: number; cx: number; cy: number; count: number }
  | { type: 'bounce'; snake: number; x: number; y: number }
  | { type: 'respawn'; snake: number }
  | { type: 'hit'; snake: number; by: number; dmg: number; x: number; y: number; kind: HitKind; good: boolean; blocked?: boolean }
  | { type: 'lifeLost'; lives: number; respawn?: number }
  | { type: 'levelUp'; snake: number; level: number; x: number; y: number }
  | { type: 'evolveStart'; snake: number }
  | { type: 'evolve'; snake: number; stage: number; x: number; y: number }
  | { type: 'skill'; snake: number; fam: FamilyId; name: string; icon: string; x: number; y: number; angle: number; slot: 'main' | 'sub' | 'ult' }
  | { type: 'fx'; kind: FxKind; snake: number; fam: FamilyId | null; sp?: string; x: number; y: number; r?: number; angle?: number; len?: number; half?: number; x1?: number; y1?: number; awake?: boolean }
  | { type: 'skillHit'; x: number; y: number; kind: 'cut' | 'stun' | 'push' | 'slow' | 'root' | 'blind' | 'mark' | 'fear' | 'silence' | 'grab' | 'poison' | 'confuse' | 'charm' | 'itch' }
  | { type: 'pop'; snake: number; x: number; y: number; text: string; color: number }
  | { type: 'ultReady'; snake: number }
  | { type: 'enemyWarn'; kind: EnemyKind; x: number; y: number }
  | { type: 'enemySoon'; kind: EnemyKind }
  | { type: 'enemyStart'; kind: EnemyKind; x: number; y: number }
  | { type: 'enemyEnd'; kind: EnemyKind; killed: boolean }
  | { type: 'birdDive'; x: number; y: number; r: number }
  | { type: 'tongue'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'drop'; x: number; y: number; r: number }
  | { type: 'lick'; x0: number; y0: number; x1: number; y1: number; w: number }
  | { type: 'netSwoop'; x: number; y: number; r: number; caught: number }
  | { type: 'captured'; snake: number }
  | { type: 'released'; snake: number; x: number; y: number }
  | { type: 'end'; rank: number; total: number; timeUp: boolean };

/** 판 통계(판 전체 누적, 봇이 새로 태어나도 이어 셈) */
export interface Stats {
  dmgDealt: number; // 준 피해(곤충에게)
  skillDmg: number; // 그중 기술·필살기·부른 벌
  dmgTaken: number; // 받은 피해
  dmgBlocked: number; // 막은 피해(웅크리기·껍질·무적 등으로 줄어든 양)
  healed: number; // 회복량
  distance: number; // 이동 거리(맵 단위)
  food: number; // 먹은 먹이 수
  casts: number; // 기술 쓴 횟수(주·보조)
  castsHit: number; // 그중 누군가 맞힌 횟수
  bites: number; // 물기 성공
  crits: number; // 그중 급소(꼬리 끝)
  assists: number; // 도움(쓰러지기 5초 안에 피해를 준 다른 곤충)
  ultCasts: number;
  peakDps: number; // 5초 동안 가장 많이 준 피해 ÷ 5
  bestLife: number; // 가장 오래 산 시간(초)
  maxLen: number; // 가장 길었던 마디 수
}
export const emptyStats = (): Stats => ({ dmgDealt: 0, skillDmg: 0, dmgTaken: 0, dmgBlocked: 0, healed: 0, distance: 0, food: 0, casts: 0, castsHit: 0, bites: 0, crits: 0, assists: 0, ultCasts: 0, peakDps: 0, bestLife: 0, maxLen: 0 });

export interface SnakeView {
  id: number;
  name: string;
  species: string;
  family: FamilyId | null;
  stage: number; // 진화 단계 1~3
  level: number;
  alive: boolean;
  isPlayer: boolean;
  isBoss: boolean;
  r: number;
  angle: number;
  boosting: boolean;
  sneaking: boolean;
  segs: Float32Array; // x0,y0(머리), x1,y1, ...
  score: number;
  kills: number;
  killsAll: number;
  deaths: number;
  /** 판 통계: 내 곤충은 늘, 다른 곤충은 판이 끝났을 때만 */
  stats?: Stats;
  crushes: number;
  length: number;
  hp: number;
  maxHp: number;
  // 상태
  captured: boolean;
  invuln: boolean;
  poisoned: boolean;
  evolving: number; // 0~1 진화 진행, 0이면 아님
  fly: boolean;
  shield: boolean; // 피해 감소·막기
  stun: boolean;
  slow: boolean;
  root: boolean;
  mark: boolean;
  blind: boolean;
  fear: boolean;
  silence: boolean;
  hidden: number; // 0 보임 ~ 1 거의 안 보임
  grabbed: boolean;
  dash: boolean;
  whirl: boolean; // 사마귀 천 개의 낫
  feast: boolean;
  yuck: boolean;
  ultReady: boolean;
  buff: boolean; // 다음 공격 강화
}

/** 레벨업 카드 한 장(화면용) */
export interface CardView {
  kind: 'new' | 'up' | 'main' | 'sub' | 'bonus' | 'pick'; // pick = 보조 기술 고르기
  id: string;
  lv: number; // 이 카드를 고르면 되는 레벨
  exclusive?: boolean; // 계열 전용
}

export interface PlayerView {
  level: number;
  nut: number;
  need: number;
  offer: { kind: 'level' | 'sub'; cards: CardView[] } | null;
  pending: number; // 아직 못 고른 레벨업
  rerolls: number;
  skillCd: number;
  skillCdMax: number;
  subId: string | null;
  subCd: number;
  subCdMax: number;
  ult: number; // 0~100
  ultActive: boolean;
  abilities: { id: string; lv: number }[];
  mainLv: number;
  subLv: number;
  form: string;
  traits: string[];
  lives: number;
  respawnIn: number;
  captured: number;
  rank: number;
  total: number;
  ultUses: number;
  marks: { x: number; y: number }[]; // 8자 춤·지도 읽기: 표시할 먹이 위치
  reveal: boolean; // 겹눈
}

export interface MapView {
  theme: MapTheme;
  rocks: { x: number; y: number; r: number }[];
  puddles: { x: number; y: number; r: number }[];
}

export type EnemyView =
  | { kind: 'bird'; warn: number; shadows: { x: number; y: number; r: number; t: number; total: number }[] }
  | { kind: 'frog'; warn: number; x: number; y: number; angle: number; aim: { x: number; y: number; t: number; total: number } | null; tongue: { x: number; y: number; t: number } | null }
  | { kind: 'rain'; warn: number; drops: { x: number; y: number; r: number; t: number; total: number }[] }
  | { kind: 'centipede'; warn: number; x: number; y: number; bossId: number; life: number }
  | { kind: 'anteater'; warn: number; x: number; y: number; angle: number; strip: { x1: number; y1: number; w: number; t: number; total: number; lick: number } | null }
  | { kind: 'child'; warn: number; x: number; y: number; r: number; swoop: number; held: { x: number; y: number; t: number }[] };

export interface RingView {
  owner: number;
  poly: Float32Array;
  cx: number;
  cy: number;
  t: number;
  total: number;
}

export type ZoneKind = 'gas' | 'web' | 'silk' | 'pit' | 'honey' | 'blade' | 'stingers' | 'nest' | 'bait' | 'lantern' | 'prison' | 'rain' | 'decoy' | 'heat';

export interface ZoneView {
  x: number;
  y: number;
  r: number;
  kind: ZoneKind;
  life: number;
  max: number;
  owner: number;
}

export type ProjKind = 'sting' | 'bigsting' | 'silk' | 'orb' | 'spit';
export interface ProjView {
  x: number;
  y: number;
  angle: number;
  kind: ProjKind;
  owner: number;
}

export interface MinionView {
  x: number;
  y: number;
  angle: number;
  owner: number;
  kind: 'bee' | 'wasp';
}

/** 기술 예고(바닥 범위) */
export interface TeleView {
  shape: 'circle' | 'line' | 'cone';
  x: number;
  y: number;
  r: number;
  angle: number;
  len: number;
  w: number;
  t: number;
  total: number;
  owner: number;
}

export interface Snapshot {
  tick: number;
  time: number;
  snakes: SnakeView[];
  foods: Float32Array; // x, y, r, kind(0 보통 1 큰것 2 잔해 3 황금 꿀방울 4 특별), sub(특별 먹이 번호)
  rings: RingView[];
  zones: ZoneView[];
  projs: ProjView[];
  minions: MinionView[];
  teles: TeleView[];
  enemy: EnemyView | null;
  map: MapView;
  timeLeft: number;
  events: GameEvent[];
  playerId: number;
  player: PlayerView;
  bossId: number;
  state: 'playing' | 'ended';
}

/** 들어가기 전에 고르는 것 */
export interface Loadout {
  species: string;
  form: string;
  traits: string[];
}

/** 판 설정 */
export interface GameOpts {
  power: number; // 내 곤충 세기 배율(아들 모드 5)
  bots: number;
  map: MapTheme | 'random';
  loadout: Loadout;
  startLevel?: number; // 시험용
}
export const defaultLoadout = (): Loadout => ({ species: 'kingmantis', form: 'sweep', traits: ['sharp', 'onescythe'] });
export const defaultOpts = (): GameOpts => ({ power: 1, bots: 20, map: 'random', loadout: defaultLoadout() });

/** 화면 → 시뮬레이션 메시지 */
export type HostIn =
  | { type: 'start'; seed: number; playerName: string; opts?: GameOpts }
  | { type: 'opts'; opts: GameOpts }
  | { type: 'cmd'; cmd: Command }
  | { type: 'pause'; paused: boolean }
  | { type: 'stop' };

/** 시뮬레이션 → 화면 메시지 */
export type HostOut = { type: 'snap'; snap: Snapshot };

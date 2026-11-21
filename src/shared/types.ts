// 시뮬레이션 ↔ 화면 사이에 오가는 데이터. 화면은 이것만 보고 그린다.
import type { Lineage } from './species';

/** 플레이어·봇·원격 플레이어가 모두 보내는 같은 형식의 명령 */
export interface Command {
  angle: number; // 가고 싶은 방향(rad)
  boost: boolean;
  sneak: boolean;
  skillSeq: number; // 누를 때마다 1씩 증가(눌림을 놓치지 않게)
  moltSeq: number;
  moltChoice: number; // 카드 번호 0~2
}

export const emptyCommand = (angle = 0): Command => ({ angle, boost: false, sneak: false, skillSeq: 0, moltSeq: 0, moltChoice: 0 });

export type DeathCause = 'bite' | 'wall' | 'crush' | 'enemy' | 'poison' | 'skill';
export type HitKind = 'bite' | 'recoil' | 'skill' | 'poison' | 'enemy' | 'wall' | 'crush' | 'crit' | 'rage';
export type EnemyKind = 'bird' | 'frog' | 'rain' | 'centipede' | 'anteater' | 'child';
export type MapTheme = 'grass' | 'sand' | 'forest';

export type GameEvent =
  | { type: 'eat'; snake: number; x: number; y: number; big: boolean; gem?: number; lv?: number; special?: number; taste?: number }
  | { type: 'death'; snake: number; x: number; y: number; by: number; cause: DeathCause; enemy?: EnemyKind }
  | { type: 'ring'; snake: number; cx: number; cy: number; trapped: number }
  | { type: 'crush'; snake: number; cx: number; cy: number; count: number }
  | { type: 'bounce'; snake: number; x: number; y: number }
  | { type: 'respawn'; snake: number }
  | { type: 'hit'; snake: number; by: number; dmg: number; x: number; y: number; kind: HitKind; good: boolean; blocked?: boolean }
  | { type: 'lifeLost'; lives: number }
  | { type: 'matchup'; x: number; y: number; text: string; good: boolean }
  | { type: 'moltStart'; snake: number; species: string }
  | { type: 'molt'; snake: number; species: string; x: number; y: number }
  | { type: 'skill'; snake: number; species: string; x: number; y: number; angle: number }
  | { type: 'skillHit'; x: number; y: number; kind: 'cut' | 'stun' | 'push' | 'slow' | 'root' }
  | { type: 'aoe'; x: number; y: number; r: number; kind: 'cut' | 'stun' | 'push' }
  | { type: 'cone'; x: number; y: number; angle: number; range: number; half: number; kind: 'cut' | 'stun' }
  | { type: 'enemyWarn'; kind: EnemyKind; x: number; y: number }
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

export interface SnakeView {
  id: number;
  name: string;
  species: string;
  stage: number;
  lineage: Lineage;
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
  crushes: number;
  length: number;
  hp: number;
  maxHp: number;
  // 상태
  captured: boolean;
  invuln: boolean;
  poisoned: boolean;
  molt: number; // 0~1 탈피 진행, 0이면 아님
  fly: boolean;
  shield: boolean;
  stun: boolean;
  slow: boolean;
  dash: boolean;
  magnet: boolean;
  ringFast: boolean;
  feast: boolean; // 좋아하는 먹이로 폭풍 성장 중
  yuck: boolean; // 싫어하는 먹이로 느려짐
}

export interface Card {
  lineage: Lineage;
  species: string;
  good: number; // 주변에서 이 갈래가 이기는 곤충 수
  bad: number; // 주변에서 이 갈래를 이기는 곤충 수
  upgrade?: boolean; // 5단계: 같은 종 강화(★)
}

export interface PlayerView {
  gauge: number;
  need: number;
  cards: Card[] | null;
  skillCd: number;
  skillCdMax: number;
  mastery: number;
  path: string[]; // 거쳐 온 종
  molting: boolean;
  lives: number;
  respawnIn: number; // 0이면 살아 있음
  rage: number; // 역습 게이지 0~1
  captured: number; // 채집망에 갇혀 남은 시간(초), 0이면 아님
  rank: number;
  total: number;
  stats: number[]; // 보석 능력치 레벨: 체력·공격·속도·기술
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

export interface ZoneView {
  x: number;
  y: number;
  r: number;
  kind: 'poison' | 'slow' | 'root';
  life: number;
  max: number;
}

export interface ProjView {
  x: number;
  y: number;
  angle: number;
}


export interface Snapshot {
  tick: number;
  time: number; // 시뮬레이션 시간(초)
  snakes: SnakeView[];
  foods: Float32Array; // x, y, r, kind(0 보통 1 큰것 2 잔해 3 보석 4 특별), sub(보석 능력치 / 특별 먹이 번호)
  rings: RingView[];
  zones: ZoneView[];
  projs: ProjView[];
  enemy: EnemyView | null;
  map: MapView;
  timeLeft: number;
  events: GameEvent[];
  playerId: number;
  player: PlayerView;
  bossId: number; // 왕지네가 활동 중이면 그 id, 아니면 -1
  state: 'playing' | 'ended';
  lineageCount: Record<string, number>;
}

/** 판 설정 */
export interface GameOpts {
  power: number; // 내 곤충 세기 배율(아들 모드 5): 주는 피해 ×power, 받는 피해 ÷power
  bots: number; // 봇 수
  map: MapTheme | 'random';
}
export const defaultOpts = (): GameOpts => ({ power: 1, bots: 20, map: 'random' });

/** 화면 → 시뮬레이션 메시지 */
export type HostIn =
  | { type: 'start'; seed: number; playerName: string; startStage?: number; opts?: GameOpts }
  | { type: 'opts'; opts: GameOpts }
  | { type: 'cmd'; cmd: Command }
  | { type: 'pause'; paused: boolean }
  | { type: 'stop' };

/** 시뮬레이션 → 화면 메시지 */
export type HostOut = { type: 'snap'; snap: Snapshot };

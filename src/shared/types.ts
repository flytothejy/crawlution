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

export type DeathCause = 'bite' | 'wall' | 'crush' | 'bird' | 'poison' | 'skill';
export type HitKind = 'bite' | 'recoil' | 'skill' | 'poison' | 'bird' | 'wall' | 'crush';

export type GameEvent =
  | { type: 'eat'; snake: number; x: number; y: number; big: boolean }
  | { type: 'death'; snake: number; x: number; y: number; by: number; cause: DeathCause }
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
  | { type: 'birdWarn' }
  | { type: 'birdDive'; x: number; y: number; r: number }
  | { type: 'boss'; snake: number }
  | { type: 'end'; won: boolean };

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
}

export interface Card {
  lineage: Lineage;
  species: string;
  good: number; // 주변에서 이 갈래가 이기는 곤충 수
  bad: number; // 주변에서 이 갈래를 이기는 곤충 수
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
}

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

export interface BirdView {
  active: boolean;
  shadows: { x: number; y: number; r: number; t: number; total: number }[];
}

export interface Snapshot {
  tick: number;
  time: number; // 시뮬레이션 시간(초)
  snakes: SnakeView[];
  foods: Float32Array; // x, y, r, kind(0 보통 1 큰것 2 잔해)
  rings: RingView[];
  zones: ZoneView[];
  projs: ProjView[];
  bird: BirdView;
  events: GameEvent[];
  playerId: number;
  player: PlayerView;
  bossId: number; // -1이면 없음
  state: 'playing' | 'won' | 'lost';
  lineageCount: Record<string, number>;
}

/** 화면 → 시뮬레이션 메시지 */
export type HostIn =
  | { type: 'start'; seed: number; playerName: string; startStage?: number }
  | { type: 'cmd'; cmd: Command }
  | { type: 'pause'; paused: boolean }
  | { type: 'stop' };

/** 시뮬레이션 → 화면 메시지 */
export type HostOut = { type: 'snap'; snap: Snapshot };

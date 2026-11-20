// 시뮬레이션 ↔ 화면 사이에 오가는 데이터. 화면은 이것만 보고 그린다.

/** 플레이어·봇·원격 플레이어가 모두 보내는 같은 형식의 명령 */
export interface Command {
  angle: number; // 가고 싶은 방향(rad)
  boost: boolean;
  sneak: boolean;
}

export type GameEvent =
  | { type: 'eat'; snake: number; x: number; y: number; big: boolean }
  | { type: 'death'; snake: number; x: number; y: number; by: number; cause: 'head' | 'wall' | 'crush' }
  | { type: 'ring'; snake: number; cx: number; cy: number; trapped: number }
  | { type: 'crush'; snake: number; cx: number; cy: number; count: number }
  | { type: 'bounce'; snake: number; x: number; y: number }
  | { type: 'respawn'; snake: number };

export interface SnakeView {
  id: number;
  name: string;
  palette: number;
  alive: boolean;
  isPlayer: boolean;
  r: number;
  angle: number;
  boosting: boolean;
  sneaking: boolean;
  segs: Float32Array; // x0,y0(머리), x1,y1, ...
  score: number;
  kills: number;
  crushes: number;
  length: number;
}

export interface RingView {
  owner: number;
  poly: Float32Array;
  cx: number;
  cy: number;
  t: number; // 남은 시간
  total: number;
}

export interface Snapshot {
  tick: number;
  time: number; // 시뮬레이션 시간(초)
  snakes: SnakeView[];
  foods: Float32Array; // x, y, r, kind(0 보통 1 큰것 2 잔해)
  rings: RingView[];
  events: GameEvent[];
  playerId: number;
}

/** 화면 → 시뮬레이션 메시지 */
export type HostIn =
  | { type: 'start'; seed: number; playerName: string }
  | { type: 'cmd'; cmd: Command }
  | { type: 'pause'; paused: boolean }
  | { type: 'stop' };

/** 시뮬레이션 → 화면 메시지 */
export type HostOut = { type: 'snap'; snap: Snapshot };

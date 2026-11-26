// 판 표(MatchTicket)와 판 결과(MatchResult): 싱글·멀티 공통 구조.
// 화면은 '표를 받아 판을 돌리고, 결과를 낸다'만 안다. 표를 누가 발급하는지(기기·서버)만 다르다.
//   지금(싱글): LocalMatchService가 바로 발급 — 사람 자리 1 + 봇 20
//   나중(멀티): 서버가 방에 넣고 발급 — 사람 자리 여럿, 같은 인터페이스
//   순위 서버가 생기면: 온라인일 때는 서버가 '판 열기'로 시드·판 id를 발급(점수 검증의 출발점)
import type { GameOpts, Loadout, MapTheme } from './types';
import type { ReplayRecord } from './sim';
import type { MatchSummary } from './progress';

export interface MatchSlot {
  slot: number; // 시뮬레이션 곤충 id
  kind: 'human' | 'bot';
  name: string;
  mine?: boolean; // 이 화면의 주인
}
export interface MatchTicket {
  matchId: string;
  issuedBy: 'local' | 'server';
  mode: 'arena';
  seed: number;
  map: MapTheme;
  tier: number;
  bots: number;
  slots: MatchSlot[];
  /** 순위 등록 대상인지(표준 아레나: 봇 20, 아들 모드 아님) */
  ranked: boolean;
}
export interface MatchRequest {
  name: string;
  loadout: Loadout;
  map: MapTheme | 'random';
  tier: number;
  bots: number;
  power: number;
}
export interface MatchService {
  readonly kind: 'local' | 'online';
  find(req: MatchRequest): Promise<MatchTicket>;
}

export const MAPS: Record<MapTheme, { name: string; desc: string }> = {
  grass: { name: '풀밭', desc: '탁 트인 들판 · 웅덩이 곳곳' },
  sand: { name: '모래 언덕', desc: '큰 바위가 많고 물이 적어요' },
  forest: { name: '숲', desc: '웅덩이가 많고 웅크리면 금방 숨어요' },
};
export const MAP_IDS = Object.keys(MAPS) as MapTheme[];

/** 표 → 시뮬레이션 설정 */
export function optsFor(t: MatchTicket, req: MatchRequest): GameOpts {
  return { power: req.power, bots: t.bots, map: t.map, loadout: { ...req.loadout, traits: [] }, v3: true, tier: t.tier };
}

export class LocalMatchService implements MatchService {
  readonly kind = 'local' as const;
  async find(req: MatchRequest): Promise<MatchTicket> {
    const r = new Uint32Array(3);
    crypto.getRandomValues(r);
    const map = req.map === 'random' ? MAP_IDS[r[1] % MAP_IDS.length] : req.map;
    const slots: MatchSlot[] = [{ slot: 0, kind: 'human', name: req.name, mine: true }];
    for (let i = 1; i <= req.bots; i++) slots.push({ slot: i, kind: 'bot', name: '' });
    return { matchId: 'L-' + r[2].toString(36), issuedBy: 'local', mode: 'arena', seed: r[0] & 0x7fffffff, map, tier: req.tier, bots: req.bots, slots, ranked: req.bots === 20 && req.power === 1 };
  }
}

/** 판 결과: 화면에 보여 주고 성장에 반영하고 순위 서버에 낸다(같은 형식) */
export interface MatchResult extends MatchSummary {
  ticket: MatchTicket;
  secs: number;
  replay: ReplayRecord | null;
}

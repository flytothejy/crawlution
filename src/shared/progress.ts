// 판 밖 성장(저장 데이터 v1): 계정 레벨, 앰버, 진화 계보(해금), 종 숙련, 최고 기록, 다음 판 단계.
// 순수 함수만 둔다 — 저장은 client/platform.ts, 계산은 여기(시험·서버에서도 같은 규칙을 쓴다).
// 아레나 전투력은 이 데이터로 바뀌지 않는다(해금은 선택지만 늘림). 전투력 성장은 모험 모드에서만.
import { V3_BY_ID, V3_FAMILIES, V3_FAMILY, type V3FamId } from './v3';
import { nextTier, tierOf } from './tiers';
import type { MapTheme } from './types';

export interface Profile {
  v: 1;
  createdAt: number;
  name: string;
  lastSpecies: string;
  map: MapTheme | 'random';
  xp: number; // 누적 경험치(계정 레벨은 여기서 계산)
  amber: number;
  gems: number; // 두 번째 화폐 자리(지금은 쓰지 않음)
  unlocked: string[];
  mastery: Record<string, number>; // 종별 숙련 경험치
  tier: number; // 다음 판 단계
  games: number;
  best: { score: number; rankScore: number; bySpecies: Record<string, number> };
  records: Record<string, number>; // 판 통계 신기록(준 피해 등)
  seenIntro: boolean; // 첫 실행(바로 판)을 지났는지
}

/** 계열 대표 8종은 처음부터 열려 있다 */
export const STARTERS = V3_FAMILIES.map((f) => f.species[0]);

export function newProfile(now = 0): Profile {
  return {
    v: 1, createdAt: now, name: '나', lastSpecies: STARTERS[0], map: 'random',
    xp: 0, amber: 150, gems: 0, unlocked: [...STARTERS], mastery: {}, tier: 1, games: 0,
    best: { score: 0, rankScore: 0, bySpecies: {} }, records: {}, seenIntro: false,
  };
}

/** 저장본 읽기(모르는 칸은 기본값, 예전 저장도 받아들임) */
export function parseProfile(raw: string | null, legacy?: { best?: number; species?: string; records?: Record<string, number> }): Profile {
  const p = newProfile();
  if (raw) {
    try {
      const o = JSON.parse(raw) as Partial<Profile>;
      if (o && o.v === 1) Object.assign(p, o, { best: { ...p.best, ...(o.best ?? {}) } });
    } catch {
      /* 깨진 저장은 새로 시작 */
    }
    for (const s of STARTERS) if (!p.unlocked.includes(s)) p.unlocked.push(s);
    p.unlocked = p.unlocked.filter((s) => V3_BY_ID.has(s));
    if (!p.unlocked.includes(p.lastSpecies)) p.lastSpecies = p.unlocked[0];
    return p;
  }
  // 예전 저장(최고 점수·고른 종·신기록)을 옮긴다. 예전에 고르던 종은 열어 준다
  if (legacy) {
    if (legacy.best) p.best.score = legacy.best;
    if (legacy.records) p.records = { ...legacy.records };
    if (legacy.species && V3_BY_ID.has(legacy.species)) {
      if (!p.unlocked.includes(legacy.species)) p.unlocked.push(legacy.species);
      p.lastSpecies = legacy.species;
    }
    if (legacy.best || legacy.species) p.seenIntro = true;
  }
  return p;
}

// ---------- 계정 레벨 ----------
export const xpToNext = (level: number) => 100 + 50 * (level - 1);
export function levelInfo(xp: number) {
  let lv = 1, rest = xp;
  while (rest >= xpToNext(lv)) rest -= xpToNext(lv++);
  return { level: lv, into: rest, need: xpToNext(lv) };
}
export const levelUpAmber = (newLevel: number) => 40 + 10 * newLevel;

// ---------- 종 숙련(별 0~5) ----------
export const STAR_XP = [120, 400, 900, 1800, 3200];
export function stars(mxp: number) {
  let s = 0;
  while (s < STAR_XP.length && mxp >= STAR_XP[s]) s++;
  return { stars: s, into: s === 0 ? mxp : mxp - STAR_XP[s - 1], need: s < STAR_XP.length ? STAR_XP[s] - (s === 0 ? 0 : STAR_XP[s - 1]) : 0 };
}

// ---------- 진화 계보 ----------
// 계열마다: 대표(0) → 1·2번으로 갈라지고, 1 → 3, 2 → 4. 다음 종은 '앞 종 숙련 ★1 + 앰버'로 연다.
// 뒤쪽 종이 더 센 게 아니라 다른 방향으로 적응한 종이다(해금은 선택지만 늘림).
const PARENT = [-1, 0, 0, 1, 2];
const COST = [0, 200, 350, 700, 900];
export interface EvoNode { id: string; fam: V3FamId; idx: number; parent: string | null; cost: number; needStars: number }
export function evoNode(id: string): EvoNode | null {
  const v = V3_BY_ID.get(id);
  if (!v) return null;
  const sp = V3_FAMILY[v.fam].species;
  const idx = sp.indexOf(id);
  return { id, fam: v.fam, idx, parent: PARENT[idx] >= 0 ? sp[PARENT[idx]] : null, cost: COST[idx] ?? 900, needStars: idx === 0 ? 0 : 1 };
}
export type UnlockState = 'open' | 'ready' | 'needStars' | 'needAmber' | 'locked';
export function unlockState(p: Profile, id: string): UnlockState {
  if (p.unlocked.includes(id)) return 'open';
  const n = evoNode(id);
  if (!n || !n.parent) return 'locked';
  if (!p.unlocked.includes(n.parent)) return 'locked';
  if (stars(p.mastery[n.parent] ?? 0).stars < n.needStars) return 'needStars';
  if (p.amber < n.cost) return 'needAmber';
  return 'ready';
}
export function unlock(p: Profile, id: string): boolean {
  if (unlockState(p, id) !== 'ready') return false;
  p.amber -= evoNode(id)!.cost;
  p.unlocked.push(id);
  return true;
}

// ---------- 판 결과 → 보상 ----------
export interface MatchSummary {
  species: string;
  rank: number;
  total: number;
  score: number;
  kills: number;
  deaths: number;
  maxLevel: number;
  tier: number;
  ended: boolean; // 판을 끝까지 했나(중간에 나가면 보상 절반)
}
export interface Gains {
  xp: number;
  amber: number;
  levelBefore: number;
  levelAfter: number;
  levelAmber: number;
  starsBefore: number;
  starsAfter: number;
  tierBefore: number;
  tierAfter: number;
  rankScore: number;
  newBest: boolean;
  newSpeciesBest: boolean;
  newlyReady: string[]; // 이번 판으로 열 수 있게 된 종
}

export function rewardFor(m: MatchSummary) {
  const above = Math.max(0, m.total - m.rank); // 내 밑에 있는 곤충 수
  const k = m.ended ? 1 : 0.5;
  const mul = tierOf(m.tier).scoreMul;
  const xp = Math.round((50 + above * 4 + Math.min(20, m.kills) * 5 + m.maxLevel * 2) * k);
  const amber = Math.round((25 + above * 3 + Math.min(20, m.kills) * 2) * k * mul);
  return { xp, amber };
}

/** 판 결과를 프로필에 반영하고 늘어난 것을 돌려준다 */
export function applyMatch(p: Profile, m: MatchSummary): Gains {
  const { xp, amber } = rewardFor(m);
  const before = levelInfo(p.xp).level;
  const sb = stars(p.mastery[m.species] ?? 0).stars;
  const readyBefore = new Set(allSpecies().filter((id) => unlockState(p, id) === 'ready'));
  p.xp += xp;
  p.amber += amber;
  const after = levelInfo(p.xp).level;
  let levelAmber = 0;
  for (let l = before + 1; l <= after; l++) levelAmber += levelUpAmber(l);
  p.amber += levelAmber;
  p.mastery[m.species] = (p.mastery[m.species] ?? 0) + xp;
  const sa = stars(p.mastery[m.species]).stars;
  const tierBefore = p.tier;
  p.tier = m.ended ? nextTier(p.tier, m.rank, m.total) : p.tier;
  const rankScore = Math.round(m.score * tierOf(m.tier).scoreMul);
  const newBest = rankScore > p.best.rankScore;
  if (newBest) p.best.rankScore = rankScore;
  if (m.score > p.best.score) p.best.score = m.score;
  const newSpeciesBest = rankScore > (p.best.bySpecies[m.species] ?? 0);
  if (newSpeciesBest) p.best.bySpecies[m.species] = rankScore;
  p.games++;
  p.seenIntro = true;
  const newlyReady = allSpecies().filter((id) => unlockState(p, id) === 'ready' && !readyBefore.has(id));
  return { xp, amber, levelBefore: before, levelAfter: after, levelAmber, starsBefore: sb, starsAfter: sa, tierBefore, tierAfter: p.tier, rankScore, newBest, newSpeciesBest, newlyReady };
}

export const allSpecies = () => V3_FAMILIES.flatMap((f) => f.species);

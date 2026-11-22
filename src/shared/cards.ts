// 능력 카드(판 안 레벨업으로 고르는 4칸) · 특성(들어가기 전 2칸). 기획서 '공용 목록 · 수치' 탭.
import type { FamilyId, Role } from './species';

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  desc: (lv: number) => string; // 1~3레벨 설명
  vals: [number, number, number];
  roles?: Role[]; // 잘 맞는 역할(1.5배 잘 나옴)
  family?: FamilyId; // 계열 전용(2배 잘 나옴)
  auto?: boolean; // 자동 발동
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const A = (a: AbilityDef) => a;

export const ABILITIES: AbilityDef[] = [
  // 공용 17장
  A({ id: 'jaw', name: '날카로운 턱', icon: '🦷', vals: [0.1, 0.2, 0.3], desc: (l) => `물기 피해 +${pct([0.1, 0.2, 0.3][l - 1])}`, roles: ['charge', 'tank'] }),
  A({ id: 'shell', name: '단단한 껍질', icon: '🪨', vals: [0.06, 0.12, 0.18], desc: (l) => `받는 피해 −${pct([0.06, 0.12, 0.18][l - 1])}`, roles: ['tank', 'support'] }),
  A({ id: 'light', name: '가벼운 몸', icon: '🪶', vals: [0.05, 0.1, 0.15], desc: (l) => `이동 속도 +${pct([0.05, 0.1, 0.15][l - 1])}`, roles: ['charge', 'shoot'] }),
  A({ id: 'breath', name: '긴 숨', icon: '🫁', vals: [0.25, 0.5, 0.75], desc: (l) => `질주할 때 줄어드는 길이 −${pct([0.25, 0.5, 0.75][l - 1])}`, roles: ['charge'] }),
  A({ id: 'regen', name: '재빠른 회복', icon: '💚', vals: [0.3, 0.6, 1.0], desc: (l) => `저절로 차는 체력 회복 +${pct([0.3, 0.6, 1.0][l - 1])}`, roles: ['tank', 'support'] }),
  A({ id: 'vamp', name: '흡혈 턱', icon: '🩸', vals: [0.05, 0.08, 0.12], desc: (l) => `물기 피해의 ${pct([0.05, 0.08, 0.12][l - 1])} 회복`, roles: ['charge'] }),
  A({ id: 'focus', name: '기술 집중', icon: '⏱️', vals: [0.08, 0.16, 0.24], desc: (l) => `주 기술 재사용 시간 −${pct([0.08, 0.16, 0.24][l - 1])}`, roles: ['shoot', 'trap'] }),
  A({ id: 'wide', name: '넓은 기술', icon: '📐', vals: [0.1, 0.2, 0.3], desc: (l) => `주·보조 기술 범위 +${pct([0.1, 0.2, 0.3][l - 1])}`, roles: ['trap', 'support'] }),
  A({ id: 'glutton', name: '먹보', icon: '😋', vals: [0.1, 0.2, 0.3], desc: (l) => `먹이 영양 +${pct([0.1, 0.2, 0.3][l - 1])}` }),
  A({ id: 'magnet', name: '자석 더듬이', icon: '🧲', vals: [0.3, 0.6, 1.0], desc: (l) => `먹이를 끌어당기는 범위 +${pct([0.3, 0.6, 1.0][l - 1])}` }),
  A({ id: 'coil', name: '휘감기 달인', icon: '🌀', vals: [0.1, 0.2, 0.3], desc: (l) => `휘감기에 필요한 길이 −${pct([0.1, 0.2, 0.3][l - 1])}`, roles: ['tank', 'charge'] }),
  A({ id: 'tail', name: '꼬리 급소 강화', icon: '🎯', vals: [0.3, 0.6, 1.0], desc: (l) => `꼬리 급소 피해 +${pct([0.3, 0.6, 1.0][l - 1])}`, roles: ['charge', 'shoot'] }),
  A({ id: 'thorn', name: '가시 몸', icon: '🌵', auto: true, vals: [0.1, 0.2, 0.3], desc: (l) => `나를 문 적에게 받은 피해의 ${pct([0.1, 0.2, 0.3][l - 1])} 되돌림`, roles: ['tank'] }),
  A({ id: 'venom', name: '독 묻은 턱', icon: '🧪', auto: true, vals: [2, 3, 4], desc: (l) => `물기에 중독 ${[2, 3, 4][l - 1]}초`, roles: ['shoot', 'trap'] }),
  A({ id: 'eye', name: '날카로운 눈', icon: '👁️', auto: true, vals: [0.1, 0.15, 0.2], desc: (l) => `체력 30% 이하인 적에게 피해 +${pct([0.1, 0.15, 0.2][l - 1])}`, roles: ['charge'] }),
  A({ id: 'alert', name: '경계심', icon: '🚨', auto: true, vals: [3, 4, 5], desc: (l) => `천적 경보가 울리면 ${[3, 4, 5][l - 1]}초 동안 속도 +20%` }),
  A({ id: 'crisis', name: '위기의 힘', icon: '🔥', auto: true, vals: [0.2, 0.3, 0.4], desc: (l) => `체력 30% 이하가 되면 3초 동안 피해 +${pct([0.2, 0.3, 0.4][l - 1])}(30초에 한 번)` }),
  // 계열 전용 20장
  A({ id: 'heavy', family: 'rhino', name: '무거운 돌진', icon: '🐂', vals: [0.2, 0.4, 0.6], desc: (l) => `돌진·밀어내기 거리 +${pct([0.2, 0.4, 0.6][l - 1])}` }),
  A({ id: 'saplove', family: 'rhino', name: '수액 사랑', icon: '🍯', vals: [0.2, 0.3, 0.4], desc: (l) => `큰 먹이를 먹으면 3초 동안 받는 피해 −${pct([0.2, 0.3, 0.4][l - 1])}` }),
  A({ id: 'steel', family: 'stag', name: '강철 큰턱', icon: '🔩', vals: [0.5, 1, 1.5], desc: (l) => `잡기 지속 +${[0.5, 1, 1.5][l - 1]}초` }),
  A({ id: 'legs', family: 'stag', name: '버티는 다리', icon: '🦵', vals: [0.1, 0.2, 0.3], desc: (l) => `적을 잡고 있는 동안 받는 피해 −${pct([0.1, 0.2, 0.3][l - 1])}` }),
  A({ id: 'hone', family: 'mantis', name: '날 세우기', icon: '🔪', vals: [0.1, 0.2, 0.3], desc: (l) => `주 기술 피해 +${pct([0.1, 0.2, 0.3][l - 1])}` }),
  A({ id: 'hunter', family: 'mantis', name: '사냥 본능', icon: '🏹', vals: [0.3, 0.45, 0.6], desc: (l) => `처치하면 주 기술 재사용 시간 −${pct([0.3, 0.45, 0.6][l - 1])}` }),
  A({ id: 'acro', family: 'dragonfly', name: '공중 곡예', icon: '🤸', vals: [0.3, 0.45, 0.6], desc: (l) => `공중 강하 뒤 1초 동안 받는 피해 −${pct([0.3, 0.45, 0.6][l - 1])}` }),
  A({ id: 'ace', family: 'dragonfly', name: '높은 사냥 성공률', icon: '🎖️', vals: [0.15, 0.25, 0.35], desc: (l) => `공중 강하로 적을 맞히면 재사용 시간 −${pct([0.15, 0.25, 0.35][l - 1])}` }),
  A({ id: 'toxin', family: 'wasp', name: '진한 독', icon: '☠️', vals: [0.2, 0.4, 0.6], desc: (l) => `독 지속 피해 +${pct([0.2, 0.4, 0.6][l - 1])}` }),
  A({ id: 'reload', family: 'wasp', name: '침 재장전', icon: '🏹', vals: [0.15, 0.3, 0.45], desc: (l) => `독침 날아가는 속도 +${pct([0.15, 0.3, 0.45][l - 1])}` }),
  A({ id: 'thick', family: 'stinkbug', name: '짙은 냄새', icon: '🌫️', vals: [0.15, 0.3, 0.45], desc: (l) => `구름·분사 범위 +${pct([0.15, 0.3, 0.45][l - 1])}` }),
  A({ id: 'linger', family: 'stinkbug', name: '오래가는 냄새', icon: '⏳', vals: [1, 2, 3], desc: (l) => `가스 구름 지속 +${[1, 2, 3][l - 1]}초` }),
  A({ id: 'tough', family: 'spider', name: '질긴 실', icon: '🧶', vals: [0.3, 0.6, 0.9], desc: (l) => `묶는 시간 +${[0.3, 0.6, 0.9][l - 1]}초` }),
  A({ id: 'sense', family: 'spider', name: '거미줄 감지', icon: '📡', vals: [0.3, 0.45, 0.6], desc: (l) => `그물에 적이 걸리면 2초 동안 속도 +${pct([0.3, 0.45, 0.6][l - 1])}` }),
  A({ id: 'fine', family: 'antlion', name: '고운 모래', icon: '⏳', vals: [0.2, 0.4, 0.6], desc: (l) => `구덩이가 끌어당기는 힘 +${pct([0.2, 0.4, 0.6][l - 1])}` }),
  A({ id: 'patient', family: 'antlion', name: '기다림의 명수', icon: '🧘', vals: [0.01, 0.02, 0.03], desc: (l) => `웅크려 있으면 초당 체력 ${[1, 2, 3][l - 1]}% 회복` }),
  A({ id: 'swarm', family: 'bee', name: '큰 무리', icon: '🐝', vals: [1, 2, 3], desc: (l) => `부른 벌 지속 +${[1, 2, 3][l - 1]}초` }),
  A({ id: 'busy', family: 'bee', name: '왕성한 일벌', icon: '💪', vals: [0.15, 0.3, 0.45], desc: (l) => `부른 벌의 피해 +${pct([0.15, 0.3, 0.45][l - 1])}` }),
  A({ id: 'bright', family: 'firefly', name: '밝은 빛', icon: '💡', vals: [0.3, 0.6, 0.9], desc: (l) => `섬광·표시 지속 +${[0.3, 0.6, 0.9][l - 1]}초` }),
  A({ id: 'blink', family: 'firefly', name: '깜빡깜빡', icon: '🔁', vals: [0.1, 0.2, 0.3], desc: (l) => `빛 기술 재사용 시간 −${pct([0.1, 0.2, 0.3][l - 1])}` }),
];

export const ABILITY_BY_ID = new Map(ABILITIES.map((a) => [a.id, a]));

/** 레벨업 카드 한 장 */
export type CardKind = 'new' | 'up' | 'main' | 'sub' | 'bonus';
export interface LevelCard {
  kind: CardKind;
  id: string; // 능력 id, 'main1'/'main2', 'sub', 'heal'/'ult'/'honey'
}

export const MAIN_UPS = [
  { id: 'main1', name: '주 기술 강화', icon: '⬆️', desc: '주 기술 피해 +15%' },
  { id: 'main2', name: '주 기술 숙달', icon: '⏩', desc: '주 기술 재사용 시간 −15%' },
];
export const SUB_UP = { id: 'sub', name: '보조 기술 강화', icon: '⬆️', desc: '보조 기술 지속·범위 +30%' };
export const BONUS_CARDS = [
  { id: 'heal', name: '체력 회복', icon: '❤️', desc: '체력 30% 회복' },
  { id: 'ult', name: '필살기 충전', icon: '⚡', desc: '필살기 게이지 +40' },
  { id: 'honey', name: '꿀 한 방울', icon: '🍯', desc: '꿀 +20' },
];

// ---------- 특성 ----------
export interface TraitDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
}
export const TRAITS: TraitDef[] = [
  { id: 'molt', name: '진화 무적', icon: '🦋', desc: '진화 직후 2초 무적' },
  { id: 'sense', name: '천적 감지', icon: '🔔', desc: '천적 경보가 2초 일찍 울림' },
  { id: 'reroll', name: '다시 뽑기 +1', icon: '🎲', desc: '카드·보조 기술 다시 뽑기 1회 추가' },
  { id: 'sprint', name: '질주 출발', icon: '🏁', desc: '판 시작과 부활 직후 5초 동안 질주해도 길이가 줄지 않음' },
  { id: 'four', name: '첫 카드 4장', icon: '🃏', desc: '레벨 2와 3에서 카드를 4장 중에서 고름' },
  { id: 'subplus', name: '보조 기술 후보 +1', icon: '➕', desc: '성충이 될 때 보조 기술 후보가 4개' },
  { id: 'fastrespawn', name: '빠른 부활', icon: '⏩', desc: '부활 대기 1초 줄어듦' },
  { id: 'map', name: '지도 읽기', icon: '🗺️', desc: '미니맵에 특별 먹이와 황금 꿀방울 위치 표시' },
  { id: 'preheat', name: '필살기 예열', icon: '♨️', desc: '판 시작과 부활 때 필살기 게이지 30에서 시작' },
  { id: 'autotomy', name: '다리 자르기', icon: '🦗', desc: '묶임·잡힘에서 즉시 풀려남(판마다 2번)' },
  { id: 'keep', name: '영양 보관', icon: '🎒', desc: '쓰러져도 모으던 영양의 절반을 지킴' },
  { id: 'safe', name: '안전한 출발', icon: '🕊️', desc: '판 시작과 부활 뒤 10초 동안 천적이 나를 노리지 않음' },
];
export const TRAIT_BY_ID = new Map(TRAITS.map((t) => [t.id, t]));

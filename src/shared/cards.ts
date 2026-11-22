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
// 2칸: 공용 1칸(10개 중) + 계열 전용 1칸(3개 중). 모두 '얻는 것 / 잃는 것'이 함께 있다.
// mods는 곱하는 배율(1이 기본), minion·respawn은 더하는 값. special은 조건이 붙는 효과(sim.ts에서 처리).
export type TraitModKey = 'hp' | 'spd' | 'boost' | 'dmg' | 'main' | 'bite' | 'cd' | 'subCd' | 'range' | 'poison' | 'taken' | 'knock' | 'nut' | 'gauge' | 'boostDrop' | 'minionDmg' | 'heal';
export type TraitMods = Partial<Record<TraitModKey, number>> & { minion?: number; respawn?: number };
export interface TraitDef {
  id: string;
  name: string;
  icon: string;
  family: FamilyId | null; // null = 공용
  up: string; // 얻는 것
  down: string; // 잃는 것
  desc: string;
  mods: TraitMods;
  special?: 'hunter' | 'loner' | 'berserk' | 'keepnut' | 'duelist' | 'poise' | 'hungry' | 'chase' | 'venombite' | 'sticky' | 'sandbody' | 'dark' | 'spark';
}
const T = (id: string, icon: string, name: string, family: FamilyId | null, up: string, down: string, mods: TraitMods, special?: TraitDef['special']): TraitDef => ({ id, icon, name, family, up, down, desc: `${up} / ${down}`, mods, special });
export const TRAITS: TraitDef[] = [
  // 공용
  T('sharp', '🗡️', '날 선 턱', null, '주는 피해 +15%', '최대 체력 −15%', { dmg: 1.15, hp: 0.85 }),
  T('thickshell', '🛡️', '두꺼운 껍질', null, '최대 체력 +12%', '이동 속도 −8%', { hp: 1.12, spd: 0.92 }),
  T('feather', '🍃', '가벼운 몸', null, '이동 속도 +8%', '받는 피해 +8%, 밀려나는 거리 +40%', { spd: 1.08, taken: 1.08, knock: 1.4 }),
  T('hasty', '⏱️', '급한 성미', null, '주 기술 재사용 −25%', '주 기술 피해 −8%', { cd: 0.75, main: 0.92 }),
  T('bigeater', '🍖', '대식가', null, '먹이 영양 +10%', '이동 속도 −5%, 질주하면 길이가 2배 빨리 줄어듦', { nut: 1.1, spd: 0.95, boostDrop: 2 }),
  T('predator', '🏹', '사냥꾼', null, '처치하면 체력 40% 회복, 필살기 게이지 +20', '먹이 영양 −5%', { nut: 0.95 }, 'hunter'),
  T('loner', '🌙', '외톨이', null, '가까이 다른 곤충이 없으면 영양 +12%', '둘 이상 가까이 있으면 받는 피해 +20%', {}, 'loner'),
  T('ultfan', '💥', '필살기 중독', null, '필살기 게이지 35% 빨리 참', '주 기술 재사용 +20%', { gauge: 1.35, cd: 1.2 }),
  T('berserk', '🔥', '역습', null, '체력 40% 이하에서 주는 피해 +30%', '먹이로 회복하는 양 −50%', {}, 'berserk'),
  T('stubborn', '🌱', '끈질긴 성장', null, '쓰러져도 모으던 영양을 모두 지킴', '부활 대기 +2초', { respawn: 2 }, 'keepnut'),
  // 장수풍뎅이
  T('heavyhorn', '🦏', '무거운 뿔', 'rhino', '주 기술 피해 +25%', '주 기술 재사용 +25%', { main: 1.25, cd: 1.25 }),
  T('armor', '🪨', '통짜 갑옷', 'rhino', '받는 피해 −10%', '이동 속도 −6%', { taken: 0.9, spd: 0.94 }),
  T('flight', '🪽', '날개 펴기', 'rhino', '보조 기술 재사용 −40%', '최대 체력 −6%', { subCd: 0.6, hp: 0.94 }),
  // 사슴벌레
  T('steeljaw', '⚙️', '강철 큰턱', 'stag', '주 기술 피해 +25%', '물기 피해 −15%', { main: 1.25, bite: 0.85 }),
  T('reach', '📏', '긴 턱', 'stag', '주 기술 범위 +30%', '주 기술 재사용 +15%', { range: 1.3, cd: 1.15 }),
  T('duelist', '🤺', '싸움꾼 기질', 'stag', '가까운 적이 하나뿐이면 주는 피해 +18%', '둘 이상이면 주는 피해 −10%', {}, 'duelist'),
  // 사마귀
  T('onescythe', '🔪', '외날 낫', 'mantis', '주 기술 피해 +40%', '주 기술 범위 −25%', { main: 1.4, range: 0.75 }),
  T('poise', '🧘', '매복 자세', 'mantis', '웅크린 채 1.5초 지나면 다음 주 기술 피해 +50%', '이동 속도 −5%', { spd: 0.95 }, 'poise'),
  T('hungry', '🩸', '굶주린 사마귀', 'mantis', '물어 준 피해의 25%만큼 회복', '최대 체력 −8%', { hp: 0.92 }, 'hungry'),
  // 잠자리
  T('swift', '💨', '고속 비행', 'dragonfly', '이동 속도 +10%', '최대 체력 −4%', { spd: 1.1, hp: 0.96 }),
  T('eagle', '🔭', '사냥 시야', 'dragonfly', '주 기술 거리 +35%', '주 기술 피해 −10%', { range: 1.35, main: 0.9 }),
  T('chase', '🏃', '끈질긴 추격', 'dragonfly', '기술을 맞히면 2초 동안 이동 속도 +20%', '주는 피해 −8%', { dmg: 0.92 }, 'chase'),
  // 말벌
  T('toxic', '☠️', '맹독', 'wasp', '중독 피해 +60%', '주 기술 피해 −20%', { poison: 1.6, main: 0.8 }),
  T('longsting', '🎯', '장거리 침', 'wasp', '주 기술 거리 +35%', '주 기술 재사용 +15%', { range: 1.35, cd: 1.15 }),
  T('pack', '🐝', '집단 사냥', 'wasp', '부르는 동료 벌 +1마리, 보조 기술 재사용 −15%', '최대 체력 −12%', { minion: 1, subCd: 0.85, hp: 0.88 }),
  // 노린재
  T('reek', '🌫️', '지독한 냄새', 'stinkbug', '주 기술 범위 +35%', '주 기술 재사용 +10%', { range: 1.35, cd: 1.1 }),
  T('plate', '🛡️', '두꺼운 등판', 'stinkbug', '받는 피해 −8%', '이동 속도 −7%', { taken: 0.92, spd: 0.93 }),
  T('rapid', '🔁', '연속 분사', 'stinkbug', '주 기술 재사용 −25%', '주 기술 범위 −15%', { cd: 0.75, range: 0.85 }),
  // 거미
  T('venomspider', '🕷️', '독거미', 'spider', '물면 2초 중독', '최대 체력 −10%', { hp: 0.9 }, 'venombite'),
  T('widenet', '🕸️', '넓은 그물', 'spider', '주 기술 범위 +30%', '주 기술 재사용 +12%', { range: 1.3, cd: 1.12 }),
  T('sticky', '🧵', '질긴 줄', 'spider', '묶이거나 느려진 적에게 주는 피해 +25%', '이동 속도 −5%', { spd: 0.95 }, 'sticky'),
  // 개미귀신
  T('deeppit', '🕳️', '깊은 구덩이', 'antlion', '주 기술 범위 +25%', '주 기술 재사용 +10%', { range: 1.25, cd: 1.1 }),
  T('bigjaw', '🦷', '큰 턱 급습', 'antlion', '주 기술 피해 +22%', '이동 속도 −8%', { main: 1.22, spd: 0.92 }),
  T('sandbody', '🏜️', '모래 몸', 'antlion', '웅크린 동안 받는 피해 −30% 더', '질주 속도 −12%', { boost: 0.88 }, 'sandbody'),
  // 꿀벌
  T('queen', '👑', '여왕의 부름', 'bee', '부르는 벌 +2마리', '벌 하나의 피해 −25%', { minion: 2, minionDmg: 0.75 }),
  T('honeystore', '🍯', '꿀 저장', 'bee', '회복 효과 +50%(꿀·먹이)', '물기 피해 −15%', { heal: 1.5, bite: 0.85 }),
  T('resolve', '📍', '침 각오', 'bee', '물기 피해 +35%', '최대 체력 −8%', { bite: 1.35, hp: 0.92 }),
  // 반딧불이
  T('brightlight', '🔆', '밝은 빛', 'firefly', '주 기술 범위 +20%', '주 기술 재사용 +20%', { range: 1.2, cd: 1.2 }),
  T('dark', '🌑', '빛 끄기', 'firefly', '웅크린 채 1.5초 지나면 숨음, 숨은 채 물면 피해 +40%', '이동 속도 −5%', { spd: 0.95 }, 'dark'),
  T('spark', '✨', '반짝 독', 'firefly', '물면 적을 2초 표시(받는 피해 +20%)', '최대 체력 −8%', { hp: 0.92 }, 'spark'),
];
export const COMMON_TRAITS = TRAITS.filter((t) => !t.family);
export const familyTraits = (fam: FamilyId) => TRAITS.filter((t) => t.family === fam);
/** 특성 배율: 곱하는 값은 곱하고, minion·respawn은 더한다 */
export function traitMod(traits: Iterable<string>, key: TraitModKey | 'minion' | 'respawn'): number {
  const add = key === 'minion' || key === 'respawn';
  let v = add ? 0 : 1;
  for (const id of traits) {
    const m = TRAIT_BY_ID.get(id)?.mods[key];
    if (m !== undefined) v = add ? v + m : v * m;
  }
  return v;
}
export function hasSpecial(traits: Iterable<string>, sp: TraitDef['special']) {
  for (const id of traits) if (TRAIT_BY_ID.get(id)?.special === sp) return true;
  return false;
}
export const TRAIT_BY_ID = new Map(TRAITS.map((t) => [t.id, t]));

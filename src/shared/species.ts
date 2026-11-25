// 2판 캐릭터 데이터: 역할 5 · 계열 10 · 종 40. 기획서 '10계열 · 종 목록', '기술 수치표' 탭을 그대로 옮긴다.
// 계열 = 밸런스 단위(능력치 성격·주 기술·보조 기술·필살기), 종 = 본능 하나 + 외형.

import { V3_BY_ID } from './v3';

export type Role = 'tank' | 'charge' | 'shoot' | 'trap' | 'support';
export type FamilyId = 'rhino' | 'stag' | 'mantis' | 'dragonfly' | 'wasp' | 'stinkbug' | 'spider' | 'antlion' | 'bee' | 'firefly' | 'centipede' | 'ant' | 'butterfly';

export const ROLES: Record<Role, { name: string; icon: string; color: number }> = {
  tank: { name: '방어', icon: '🛡️', color: 0x5a8ad8 },
  charge: { name: '돌격', icon: '🗡️', color: 0xf0703a },
  shoot: { name: '사격', icon: '🎯', color: 0xe8b830 },
  trap: { name: '함정', icon: '🕸️', color: 0x9a6ad8 },
  support: { name: '지원', icon: '💗', color: 0x4ac88a },
};
export const ROLE_LIST: Role[] = ['tank', 'charge', 'shoot', 'trap', 'support'];

/** 봇이 기술을 언제 쓸지 고르는 기준 */
export type AiKind = 'dash' | 'melee' | 'cone' | 'line' | 'proj' | 'place' | 'pit' | 'trail' | 'back' | 'ambush' | 'summon' | 'heal' | 'target' | 'aoe' | 'self' | 'move' | 'defense' | 'escape' | 'buff';

export interface FormDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  awake: string; // 각성 효과
  cd: number; // 재사용(초, 계열 보정 반영)
  ai: AiKind;
  range: number;
}

export interface SubDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cd: number;
  ai: AiKind;
  range: number;
  /** 공용 보조 기술: 생태에 맞는 계열에게만 나온다 */
  families?: FamilyId[];
}

export interface UltDef {
  name: string;
  icon: string;
  desc: string;
  awake: string;
  range: number; // 봇 판단용 범위
}

export interface Look {
  body: number;
  stripe: number;
  head: number;
  shape: HeadShape;
  pattern?: 'spots' | 'swarm' | 'metal' | 'fuzzy' | 'lamp';
  feats?: ('wings' | 'wings4' | 'legs8' | 'stinger' | 'centipede' | 'longLegs' | 'lamp' | 'pack' | 'bwings')[];
  /** 나비 날개(앞·뒷날개 한 벌, 위에서 본 모습) */
  bwing?: { kind: 'swallow' | 'monarch' | 'owl' | 'morpho' | 'moth'; c1: number; c2: number; c3: number };
  /** 보통 날개 색(없으면 투명한 흰색) */
  wingTint?: number;
  antenna?: 'short' | 'long' | 'elbow' | 'club' | 'feather' | null;
  horn?: 'rhino' | 'herc' | 'cauc';
  mandible?: { size: number; teeth?: boolean; branch?: boolean; color?: number };
  sickle?: boolean;
  fang?: number;
  eye?: number; // 눈 색
}

export type HeadShape = 'cute' | 'beetle' | 'dome' | 'mantis' | 'dragon' | 'naiad' | 'wasp' | 'bee' | 'shield' | 'assassin' | 'strider' | 'spider' | 'antlion' | 'lace' | 'firefly' | 'centipede' | 'ant' | 'butterfly' | 'milli';

export interface Instinct {
  id: string;
  name: string;
  desc: string;
}

export interface Species {
  id: string;
  family: FamilyId;
  name: string;
  instinct: Instinct;
  look: Look;
  larva?: Look; // 어린 모습(없으면 계열 기본)
  fact: string;
  /** 이 종이 쓸 수 있는 기술 형태(생태에 안 맞는 형태를 뺌). 없으면 계열의 3가지 모두 */
  forms?: string[];
}

export interface Family {
  id: FamilyId;
  name: string; // '장수풍뎅이'
  role: Role;
  hp: number; // 체력 배율
  atk: number; // 공격 배율(물기·기술)
  spd: number; // 속도 배율
  cdMul: number;
  knockTaken: number; // 받는 밀치기 배율
  color: number;
  color2: number;
  stages: [string, string, string];
  skill: string; // 주 기술 이름
  forms: FormDef[];
  sub: SubDef;
  ult: UltDef;
  larva: Look | 'derive'; // 'derive' = 성충 모습에서 날개를 빼고 밝게
  likes: number; // 좋아하는 특별 먹이 번호
  hates: number;
  strong: string; // 궁합 설명
  weak: string;
  species: string[];
}

const GRUB = (head: number, body = 0xf2e6c8, stripe = 0xe2d0aa): Look => ({ body, stripe, head, shape: 'cute', antenna: 'club' });

// ---------- 계열 ----------
export const FAMILIES: Family[] = [
  {
    id: 'rhino', name: '장수풍뎅이', role: 'tank', hp: 1.3, atk: 1.0, spd: 0.9, cdMul: 1, knockTaken: 0.5,
    color: 0xc8843a, color2: 0x7a4a1e, stages: ['애벌레', '성충', '각성'], skill: '뿔 들이받기',
    forms: [
      { id: 'charge', name: '돌진', icon: '🐂', desc: '앞으로 돌진해 부딪힌 적을 밀어내며 피해', awake: '돌진이 끝난 자리에 충격파', cd: 10, ai: 'dash', range: 260 },
      { id: 'lift', name: '퍼 올리기', icon: '⤴️', desc: '앞의 적을 뿔로 들어 뒤로 넘김(0.5초 기절)', awake: '넘긴 적이 떨어진 자리에 피해', cd: 9, ai: 'melee', range: 90 },
      { id: 'push', name: '버티고 밀기', icon: '🧱', desc: '2초 동안 버티며 앞의 적을 계속 밀어냄, 받는 피해 −30%', awake: '밀려난 적이 바위·벽에 부딪히면 추가 피해', cd: 12, ai: 'melee', range: 100 },
    ],
    sub: { id: 'thud', name: '묵직한 착지', icon: '💥', desc: '날아올랐다 내려앉으며 주변 적을 밀어내고 0.5초 기절', cd: 14, ai: 'aoe', range: 140 },
    ult: { name: '대지 진동 돌진', icon: '🌋', desc: '길게 돌진해 길 위의 모든 적을 밀어내고 1초 기절', awake: '돌진이 끝난 자리에 큰 충격파', range: 420 },
    larva: GRUB(0xc8742a), likes: 0, hates: 3, strong: '돌격', weak: '함정',
    species: ['rhino', 'herc', 'cauc'],
  },
  {
    id: 'stag', name: '사슴벌레', role: 'tank', hp: 1.3, atk: 1.2, spd: 0.9, cdMul: 1.15, knockTaken: 0.8,
    color: 0xb08a4a, color2: 0x5a3a1a, stages: ['애벌레', '성충', '각성'], skill: '큰턱 집기',
    forms: [
      { id: 'grab', name: '집어 조이기', icon: '🦀', desc: '앞의 적을 잡고 1.5초 조임. 잡힌 동안 둘 다 느림', awake: '조이기가 끝날 때 큰 피해', cd: 14, ai: 'melee', range: 70 },
      { id: 'throw', name: '집어 던지기', icon: '🤾', desc: '잡아서 뒤로 던짐(떨어진 적 0.5초 기절)', awake: '던진 적이 다른 적과 부딪히면 둘 다 피해', cd: 12.5, ai: 'melee', range: 70 },
      { id: 'scissor', name: '가위 닫기', icon: '✂️', desc: '앞쪽 넓은 범위를 순간적으로 물어 피해', awake: '두 번 연속', cd: 12.5, ai: 'cone', range: 110 },
    ],
    sub: { id: 'playdead', name: '죽은 척', icon: '💤', desc: '2초 동안 멈추고 무적, 적의 표적에서 빠짐', cd: 18, ai: 'defense', range: 0 },
    ult: { name: '내리꽂기', icon: '⏬', desc: '앞의 적 하나를 잡아 들어 올렸다 내리꽂음', awake: '내리꽂은 자리 주변에도 피해', range: 90 },
    larva: GRUB(0xa8682a, 0xf4ead0, 0xe6d6b0), likes: 1, hates: 6, strong: '돌격', weak: '사격',
    species: ['flatstag', 'kingstag', 'sawstag', 'giraffe'],
  },
  {
    id: 'mantis', name: '사마귀', role: 'charge', hp: 0.8, atk: 1.2, spd: 1.0, cdMul: 1, knockTaken: 1,
    color: 0x8ad04a, color2: 0xd8e8f0, stages: ['약충', '성충', '각성'], skill: '낫 베기',
    forms: [
      { id: 'sweep', name: '넓게 베기', icon: '🌙', desc: '앞쪽 부채꼴, 피해 보통. 여럿과 싸울 때', awake: '베인 자리에 칼날 자국이 2초 남음', cd: 9, ai: 'cone', range: 120 },
      { id: 'stab', name: '찌르기', icon: '🗡️', desc: '앞으로 긴 직선, 피해 높음, 폭 좁음', awake: '2마리까지 관통', cd: 10, ai: 'line', range: 220 },
      { id: 'combo', name: '연속 베기', icon: '⚔️', desc: '짧은 범위 3연타, 3타째는 꼬리 급소 판정', awake: '마지막 타격에 0.5초 기절', cd: 9, ai: 'cone', range: 80 },
    ],
    sub: { id: 'threat', name: '날개 펼쳐 위협', icon: '🦋', desc: '주변 적을 1초 겁먹게 해 느려지고 기술을 못 씀', cd: 14, ai: 'aoe', range: 160 },
    ult: { name: '천 개의 낫', icon: '🌪️', desc: '2초 동안 주변을 난도질, 그동안 받는 피해 −30%', awake: '끝나면 주 기술 재사용 초기화', range: 140 },
    larva: 'derive', likes: 2, hates: 1, strong: '사격, 지원', weak: '방어, 함정',
    species: ['kingmantis', 'widemantis', 'smallmantis', 'orchid', 'ghost'],
  },
  {
    id: 'dragonfly', name: '잠자리', role: 'charge', hp: 0.8, atk: 1.0, spd: 1.12, cdMul: 1, knockTaken: 1,
    color: 0x4ab8f0, color2: 0xb8f0ff, stages: ['수채', '성충', '각성'], skill: '공중 강하',
    forms: [
      { id: 'dive', name: '급강하', icon: '🪂', desc: '빠르게 날아가 내려앉는 자리에 피해(날 때 몸 충돌 없음)', awake: '내려앉은 뒤 한 번 더', cd: 8, ai: 'dash', range: 300 },
      { id: 'snatch', name: '낚아채기', icon: '🪝', desc: '앞으로 줄을 그어 줄 위의 적과 먹이를 내 앞으로 끌어옴', awake: '끌려온 적 기절이 길어짐', cd: 8, ai: 'dash', range: 260 },
      { id: 'circle', name: '맴돌기', icon: '🌀', desc: '주변을 빠르게 원을 그리며 연속 타격', awake: '원 안의 적이 느려짐', cd: 10, ai: 'aoe', range: 110 },
    ],
    sub: { id: 'compound', name: '겹눈', icon: '👁️', desc: '3초 동안 주변 적의 위치와 기술 예고를 보여 주고 피해 +15%', cd: 15, ai: 'buff', range: 400 },
    ult: { name: '하늘 사냥', icon: '☄️', desc: '3초 동안 날아올라 무적, 세 번 급강하', awake: '다섯 번', range: 300 },
    larva: { body: 0x6a5a3a, stripe: 0x4e4228, head: 0x5a4a30, shape: 'naiad', antenna: 'short' }, likes: 3, hates: 9, strong: '사격', weak: '방어, 함정',
    species: ['giantdf', 'emperor', 'redDf', 'damsel'],
  },
  {
    id: 'wasp', name: '말벌', role: 'shoot', hp: 1.0, atk: 1.1, spd: 1.0, cdMul: 1.15, knockTaken: 1,
    color: 0xf2c230, color2: 0x2a2a2a, stages: ['애벌레', '성충', '각성'], skill: '독침',
    forms: [
      { id: 'burst', name: '연사', icon: '🔫', desc: '작은 독침 3발을 연이어 쏨(맞으면 3초 중독)', awake: '5발', cd: 11.5, ai: 'proj', range: 380 },
      { id: 'snipe', name: '저격', icon: '🎯', desc: '멀리 큰 독침 1발', awake: '맞은 적의 독이 주변 적에게 퍼짐', cd: 14, ai: 'proj', range: 600 },
      { id: 'spread', name: '확산', icon: '🎆', desc: '짧은 거리에 부채꼴로 5발', awake: '독침이 땅에 남아 밟으면 중독', cd: 11.5, ai: 'cone', range: 220 },
    ],
    sub: { id: 'alarm', name: '경보 페로몬', icon: '📯', desc: '작은 동료 벌 2마리가 5초 동안 함께 공격', cd: 18, ai: 'summon', range: 300 },
    ult: { name: '독침 폭우', icon: '🌧️', desc: '넓은 범위에 독침이 비처럼 쏟아짐', awake: '맞은 적의 독이 두 배', range: 260 },
    larva: GRUB(0xd8b850, 0xfaf4e6, 0xece2c8), likes: 4, hates: 5, strong: '지원', weak: '돌격',
    species: ['paperwasp', 'hornet', 'yellowleg', 'potter'],
  },
  {
    id: 'stinkbug', name: '노린재', role: 'shoot', hp: 1.0, atk: 1.0, spd: 1.0, cdMul: 1, knockTaken: 1,
    color: 0x9aa83a, color2: 0x5a6a2a, stages: ['약충', '성충', '각성'], skill: '냄새 분사',
    forms: [
      { id: 'cloud', name: '가스 구름', icon: '☁️', desc: '앞에 구름을 남겨 들어온 적이 느려지고 피해', awake: '구름이 천천히 퍼짐', cd: 9, ai: 'place', range: 190 },
      { id: 'jet', name: '분사 줄기', icon: '💨', desc: '앞으로 길게 직선 분사', awake: '맞은 적이 잠깐 기술을 못 씀', cd: 9, ai: 'line', range: 260 },
      { id: 'backjet', name: '뒤로 뿜기', icon: '🔙', desc: '꼬리 쪽으로 분사해 쫓아오는 적을 막음', awake: '질주하는 동안 자동으로 뿜음', cd: 8, ai: 'back', range: 140 },
    ],
    sub: { id: 'backplate', name: '딱딱한 등판', icon: '🛡️', desc: '2초 동안 뒤에서 오는 피해를 막음', cd: 14, ai: 'defense', range: 0 },
    ult: { name: '독가스 폭발', icon: '☣️', desc: '큰 가스 구름이 터지고, 안의 적은 3초 동안 기술을 못 씀', awake: '구름이 나를 따라다님', range: 220 },
    larva: 'derive', likes: 5, hates: 4, strong: '돌격', weak: '방어',
    species: ['brownbug', 'jewelbug', 'assassin', 'strider'],
  },
  {
    id: 'spider', name: '거미', role: 'trap', hp: 1.0, atk: 1.0, spd: 1.0, cdMul: 1, knockTaken: 1,
    color: 0xb8a8f0, color2: 0xe8e8f8, stages: ['새끼 거미', '어른 거미', '각성'], skill: '거미줄',
    forms: [
      { id: 'orb', name: '둥근 그물', icon: '🕸️', desc: '앞에 그물을 쳐 걸린 적을 묶음(최대 2개)', awake: '그물에 걸린 적에게 피해', cd: 10, ai: 'place', range: 190 },
      { id: 'silk', name: '줄 쏘기', icon: '🧵', desc: '줄을 쏘아 맞은 적을 끌어당김', awake: '두 번 연속', cd: 9, ai: 'proj', range: 340 },
      { id: 'trail', name: '덫줄', icon: '〰️', desc: '3초 동안 몸 뒤로 끈끈한 줄을 남겨 밟은 적이 느려짐', awake: '줄을 밟은 적이 묶임', cd: 11, ai: 'trail', range: 220 },
    ],
    sub: { id: 'venomfang', name: '독니', icon: '🦷', desc: '다음 물기에 맞은 적이 1초 마비 + 강한 독', cd: 14, ai: 'buff', range: 120 },
    ult: { name: '거미줄 감옥', icon: '🔒', desc: '넓은 둥근 그물을 치고 안의 적을 모두 2초 묶음', awake: '묶인 적에게 독 피해', range: 200 },
    larva: 'derive', likes: 6, hates: 8, strong: '돌격', weak: '사격',
    species: ['orbspider', 'gardenspider', 'jumper', 'wolfspider', 'widow'],
  },
  {
    id: 'antlion', name: '개미귀신', role: 'trap', hp: 1.1, atk: 1.2, spd: 0.9, cdMul: 1, knockTaken: 1,
    color: 0xd8b878, color2: 0x8a6a3a, stages: ['개미귀신', '큰 개미귀신', '각성'], skill: '모래 구덩이',
    forms: [
      { id: 'pit', name: '깔때기 구덩이', icon: '🕳️', desc: '내 자리에 구덩이를 파면 들어온 적이 가운데로 미끄러짐', awake: '가운데에 닿은 적에게 큰 피해', cd: 11, ai: 'pit', range: 120 },
      { id: 'sand', name: '모래 던지기', icon: '🏜️', desc: '모래를 튀겨 맞은 적이 느려지고 내 쪽으로 밀림', awake: '세 갈래로', cd: 9, ai: 'line', range: 260 },
      { id: 'ambush', name: '숨어 기다리기', icon: '🫣', desc: '땅속에 숨었다가 가까이 온 적을 급습(다시 누르면 바로 급습)', awake: '급습에 기절', cd: 12, ai: 'ambush', range: 100 },
    ],
    sub: { id: 'backstep', name: '뒷걸음질', icon: '⏪', desc: '뒤로 빠르게 물러남, 그동안 몸 충돌 없음', cd: 10, ai: 'escape', range: 0 },
    ult: { name: '개미지옥', icon: '🌀', desc: '거대한 구덩이가 주변 적을 가운데로 빨아들임', awake: '가운데 닿은 적 기절', range: 260 },
    larva: { body: 0x9a8a6a, stripe: 0x7a6a4a, head: 0x8a7a5a, shape: 'antlion', antenna: 'short', mandible: { size: 52, teeth: true, color: 0x5a4a2a }, pattern: 'fuzzy' },
    likes: 7, hates: 0, strong: '돌격', weak: '사격',
    species: ['myrm', 'owlfly', 'lacewing'],
  },
  {
    id: 'bee', name: '꿀벌', role: 'support', hp: 1.0, atk: 0.85, spd: 1.0, cdMul: 1, knockTaken: 1,
    color: 0xf6c94a, color2: 0x3a2a10, stages: ['애벌레', '성충', '각성'], skill: '벌 떼 부르기',
    forms: [
      { id: 'workers', name: '일벌 부르기', icon: '🐝', desc: '작은 벌 3마리가 5초 동안 함께 싸움', awake: '5마리', cd: 12, ai: 'summon', range: 300 },
      { id: 'honey', name: '꿀 나누기', icon: '🍯', desc: '주변에 꿀을 떨어뜨려 안에 있으면 회복', awake: '꿀 위에 선 적은 끈적여 느려짐', cd: 14, ai: 'heal', range: 100 },
      { id: 'heatball', name: '열 공', icon: '🔥', desc: '벌들이 적 하나를 둘러싸 열로 3초 지속 피해', awake: '둘러싸인 적이 움직이지 못함', cd: 12, ai: 'target', range: 200 },
    ],
    sub: { id: 'waggle', name: '8자 춤', icon: '💃', desc: '주변 먹이를 끌어오고, 가까운 특별 먹이·황금 꿀방울을 표시', cd: 15, ai: 'self', range: 300 },
    ult: { name: '벌 떼 습격', icon: '🐝', desc: '벌 10마리가 5초 동안 함께 싸움', awake: '벌이 적을 둘러싸 열 공', range: 320 },
    larva: GRUB(0xe0b84a, 0xfdf6e8, 0xf0e4c8), likes: 8, hates: 2, strong: '방어', weak: '사격',
    species: ['honeybee', 'nativebee', 'bumble', 'giantbee'],
  },
  {
    id: 'firefly', name: '반딧불이', role: 'support', hp: 0.9, atk: 1.0, spd: 1.0, cdMul: 1, knockTaken: 1,
    color: 0xd8ff5a, color2: 0x6aff9a, stages: ['애벌레', '성충', '각성'], skill: '빛',
    forms: [
      { id: 'flash', name: '섬광', icon: '✨', desc: '주변 적이 1.5초 눈부셔 방향이 흔들리고 기술을 못 씀', awake: '범위가 넓어짐', cd: 8, ai: 'aoe', range: 160 },
      { id: 'signal', name: '빛 신호', icon: '🔆', desc: '빛 구슬을 던져 맞은 적을 5초 표시(받는 피해 +20%)', awake: '구슬 2개', cd: 9, ai: 'proj', range: 400 },
      { id: 'lantern', name: '유인등', icon: '🏮', desc: '빛을 켜 두면 주변 먹이가 끌려오고, 다가온 적은 느려짐', awake: '봇 곤충도 끌려옴', cd: 12, ai: 'self', range: 260 },
    ],
    sub: { id: 'bitter', name: '쓴맛 몸', icon: '🤢', desc: '2초 동안 나를 문 적이 느려지고 피해의 50%를 돌려받음', cd: 14, ai: 'defense', range: 0 },
    ult: { name: '오로라', icon: '🌌', desc: '넓은 범위 섬광 + 맞은 적 모두 5초 표시', awake: '표시된 적이 내 쪽으로 끌려옴', range: 300 },
    larva: { body: 0x3a3028, stripe: 0x2a241e, head: 0x4a3a2a, shape: 'cute', antenna: 'short', pattern: 'lamp', feats: ['lamp'] },
    likes: 9, hates: 7, strong: '돌격', weak: '방어',
    species: ['genji', 'latefly', 'unmun', 'photuris'],
  },
];

/** 3판에서 새로 들어온 계열(엔진용). 기술은 4칸 기술(kit.ts)로만 쓰므로 형태·보조 기술은 자리표시 */
const kitForm = (name: string, icon: string): FormDef[] => [{ id: 'kit', name, icon, desc: '', awake: '', cd: 8, ai: 'melee', range: 100 }];
export const NEW_FAMILIES: Family[] = [
  {
    id: 'centipede', name: '지네', role: 'charge', hp: 1.15, atk: 1.1, spd: 1.0, cdMul: 1, knockTaken: 0.8,
    color: 0xc8361e, color2: 0xffd23f, stages: ['어린 지네', '지네', '각성'], skill: '독턱', forms: kitForm('독턱 찌르기', '🗡️'),
    sub: { id: 'v3def', name: '몸 말기', icon: '🌀', desc: '', cd: 12, ai: 'defense', range: 0 },
    ult: { name: '백족 소용돌이', icon: '🌪️', desc: '큰 원을 그리며 질주해 안쪽 적들을 가운데로 끌어 모으고, 3초 동안 조여 지속 피해.', awake: '다 조이면 가운데에서 독 폭발', range: 300 },
    larva: 'derive', likes: 4, hates: 8, strong: '나비·잠자리', weak: '딱정벌레·개미', species: ['v3:wangjine', 'v3:grima', 'v3:gigantea', 'v3:milli', 'v3:ttangjine'],
  },
  {
    id: 'ant', name: '개미', role: 'support', hp: 1.0, atk: 0.95, spd: 1.0, cdMul: 1, knockTaken: 1,
    color: 0x8a4a2a, color2: 0xe8a05a, stages: ['애벌레', '개미', '각성'], skill: '개미산', forms: kitForm('개미산 쏘기', '🧪'),
    sub: { id: 'v3def', name: '굴 파기', icon: '🕳️', desc: '', cd: 12, ai: 'escape', range: 0 },
    ult: { name: '개미 떼 행진', icon: '🌊', desc: '앞쪽 넓은 띠로 개미 강물이 3초 흘러가며 맞은 적을 밀어내고 지속 피해.', awake: '강물이 두 줄', range: 420 },
    larva: GRUB(0xd8c8a8, 0xfaf4e6, 0xece2c8), likes: 8, hates: 5, strong: '지네·딱정벌레', weak: '거미·벌', species: ['v3:wangant', 'v3:armyant', 'v3:leafant', 'v3:bulldog', 'v3:fireant'],
  },
  {
    id: 'butterfly', name: '나비', role: 'trap', hp: 0.85, atk: 0.9, spd: 1.08, cdMul: 1, knockTaken: 1.2,
    color: 0xe07ad8, color2: 0x7ad8ff, stages: ['애벌레', '나비', '각성'], skill: '인분', forms: kitForm('인분 흩뿌리기', '🌫️'),
    sub: { id: 'v3def', name: '팔랑 비행', icon: '🪽', desc: '', cd: 11, ai: 'move', range: 0 },
    ult: { name: '나비 떼 폭풍', icon: '🌪️', desc: '넓은 범위에 나비 떼가 휘몰아쳐 4초 동안 지속 피해 + 혼란.', awake: '폭풍이 나를 따라다님', range: 300 },
    larva: 'derive', likes: 8, hates: 4, strong: '거미·사마귀', weak: '잠자리·지네', species: ['v3:swallow', 'v3:monarch', 'v3:owlbf', 'v3:morpho', 'v3:tussock'],
  },
];
export const FAMILY = Object.fromEntries([...FAMILIES, ...NEW_FAMILIES].map((f) => [f.id, f])) as Record<FamilyId, Family>;

// ---------- 종 ----------
const sp = (s: Species) => s;
export const SPECIES: Species[] = [
  // 장수풍뎅이
  sp({ id: 'rhino', family: 'rhino', name: '장수풍뎅이', instinct: { id: 'sap', name: '수액 자리싸움', desc: '큰 먹이 근처에서는 받는 피해 −25%, 다가온 적을 밀어냄' },
    look: { body: 0x5a3a22, stripe: 0x48301b, head: 0x3d2513, shape: 'beetle', pattern: 'metal', horn: 'rhino', antenna: 'feather' }, fact: '나무 수액을 두고 뿔로 싸운다. 자기 몸무게의 수십 배를 들어 올린다.' }),
  sp({ id: 'herc', family: 'rhino', name: '헤라클레스장수풍뎅이', instinct: { id: 'pincer', name: '집게 뿔', desc: '뿔 들이받기·필살기에 맞은 적을 위아래 뿔로 잡아 0.6초 더 들어 올림' },
    look: { body: 0xc9b25a, stripe: 0xb09a44, head: 0x1e1a14, shape: 'beetle', pattern: 'metal', horn: 'herc', antenna: 'feather' }, fact: '세상에서 가장 긴 뿔을 가진 풍뎅이로, 긴 뿔 두 개로 상대를 집어 든다.' }),
  sp({ id: 'cauc', family: 'rhino', name: '코카서스장수풍뎅이', instinct: { id: 'fierce', name: '사나운 성질', desc: '물리면 짧은 반격 돌진이 자동으로 나감(4초에 한 번)' },
    look: { body: 0x2a2a30, stripe: 0x1e1e24, head: 0x18181c, shape: 'beetle', pattern: 'metal', horn: 'cauc', antenna: 'feather' }, fact: '뿔이 세 개이고 사나운 성질로 알려져 있다.' }),
  // 사슴벌레
  sp({ id: 'flatstag', family: 'stag', name: '넓적사슴벌레', instinct: { id: 'flat', name: '납작한 몸', desc: '바위 옆에 붙어 있으면 받는 피해 −30%' },
    look: { body: 0x2a2018, stripe: 0x221a14, head: 0x1e1610, shape: 'beetle', pattern: 'metal', antenna: 'feather', mandible: { size: 58, teeth: true } }, fact: '납작한 몸으로 나무 틈에 숨는다. 한국에서 가장 흔한 사슴벌레 중 하나다.' }),
  sp({ id: 'kingstag', family: 'stag', name: '왕사슴벌레', instinct: { id: 'longlife', name: '오래 사는 몸', desc: '판마다 한 번, 쓰러질 피해를 체력 1로 버팀' },
    look: { body: 0x1a1410, stripe: 0x14100c, head: 0x120e0a, shape: 'beetle', pattern: 'metal', antenna: 'feather', mandible: { size: 50, teeth: true } }, fact: '성충으로 여러 해를 산다.' }),
  sp({ id: 'sawstag', family: 'stag', name: '톱사슴벌레', instinct: { id: 'sawjaw', name: '톱니 큰턱', desc: '집기 거리 +40%, 잡은 적을 끌어당김' },
    look: { body: 0x7a3a1a, stripe: 0x6a3216, head: 0x5a2810, shape: 'beetle', pattern: 'metal', antenna: 'feather', mandible: { size: 76, teeth: true, branch: true } }, fact: '길고 휘어진 톱니 큰턱을 가졌다.' }),
  sp({ id: 'giraffe', family: 'stag', name: '기라파톱사슴벌레', instinct: { id: 'longjaw', name: '아주 긴 큰턱', desc: '집기 거리 +80%, 대신 바로 앞의 적에게는 피해 −40%' },
    look: { body: 0x3a2a1a, stripe: 0x2e2214, head: 0x2a1e12, shape: 'beetle', pattern: 'metal', antenna: 'feather', mandible: { size: 100, teeth: true } }, fact: '세계에서 가장 큰 사슴벌레로 꼽힌다.' }),
  // 사마귀
  sp({ id: 'kingmantis', family: 'mantis', name: '왕사마귀', instinct: { id: 'pray', name: '기도 자세', desc: '웅크리고 1초 뒤 다음 낫 베기 1.5배' },
    look: { body: 0x7fd04a, stripe: 0x66b437, head: 0x6cc13a, shape: 'mantis', sickle: true, antenna: 'short', feats: ['wings'] }, fact: '앞다리를 모으고 기다리는 자세가 기도하는 모습 같다.' }),
  sp({ id: 'widemantis', family: 'mantis', name: '넓적배사마귀', instinct: { id: 'brace', name: '버티기', desc: '웅크리는 동안 받는 피해가 더 줄고, 맞으면 반격' },
    look: { body: 0x5aa83a, stripe: 0x4a9030, head: 0x5ca83c, shape: 'mantis', sickle: true, antenna: 'short', feats: ['wings'] }, fact: '배가 넓고 단단한 한국 사마귀다.' }),
  sp({ id: 'smallmantis', family: 'mantis', name: '좀사마귀', instinct: { id: 'slim', name: '작은 몸', desc: '몸이 가늘어 맞히기 어렵고 빠름, 체력 −10%' },
    look: { body: 0xa88a5a, stripe: 0x927648, head: 0x9a7e50, shape: 'mantis', sickle: true, antenna: 'short', feats: ['wings'] }, fact: '한국의 작은 사마귀로, 갈색 몸으로 마른 풀에 섞인다.' }),
  sp({ id: 'orchid', family: 'mantis', name: '난초사마귀', instinct: { id: 'flower', name: '꽃 흉내', desc: '웅크려 있으면 봇 눈에 먹이처럼 보이고, 다가온 적에게 첫 공격이 치명타(2배)' },
    look: { body: 0xf6d6ee, stripe: 0xeab6dc, head: 0xfbe4f4, shape: 'mantis', sickle: true, antenna: 'short', feats: ['wings'], eye: 0xd86aa8 }, fact: '꽃인 척하며 다가온 곤충을 잡는다.' }),
  sp({ id: 'ghost', family: 'mantis', name: '유령사마귀', instinct: { id: 'leaf', name: '마른 잎', desc: '웅크리면 잘 안 보임(낙엽 숲에서는 더 빨리)' },
    look: { body: 0x7a5a3a, stripe: 0x5a4028, head: 0x6a4e32, shape: 'mantis', sickle: true, antenna: 'short', feats: ['wings'] }, fact: '마른 잎처럼 생겼다.' }),
  // 잠자리
  sp({ id: 'giantdf', family: 'dragonfly', name: '장수잠자리', instinct: { id: 'bigwing', name: '큰 날개', desc: '질주할 때 줄어드는 길이 −50%' },
    look: { body: 0x222222, stripe: 0xf2c230, head: 0x2f8f3a, shape: 'dragon', feats: ['wings4'], eye: 0x3aa84a }, fact: '한국에서 가장 큰 잠자리로, 날면서 사냥한다.' }),
  sp({ id: 'emperor', family: 'dragonfly', name: '왕잠자리', instinct: { id: 'patrol', name: '영역 순찰', desc: '한 구역에 머물면 그 안의 적에게 주는 피해 +20%' },
    look: { body: 0x3a8adf, stripe: 0x2a5a8a, head: 0x5ab83a, shape: 'dragon', feats: ['wings4'], eye: 0x3a9ad8 }, fact: '수컷이 물가 영역을 순찰한다.' }),
  sp({ id: 'redDf', family: 'dragonfly', name: '고추잠자리', instinct: { id: 'perch', name: '앉아서 쉬기', desc: '웅크려 있으면 기술 재사용 시간이 두 배로 빨리 참' },
    look: { body: 0xe8402a, stripe: 0xc83020, head: 0xd84a2a, shape: 'dragon', feats: ['wings4'], eye: 0xc83a2a }, fact: '막대 끝에 앉았다 날기를 반복한다.' }),
  sp({ id: 'damsel', family: 'dragonfly', name: '실잠자리', instinct: { id: 'thin', name: '가는 몸', desc: '휘감기·묶임에 갇혀도 한 번 빠져나감(20초에 한 번)' },
    look: { body: 0x3ab8c8, stripe: 0x1a2a3a, head: 0x2a9aa8, shape: 'dragon', feats: ['wings4'], eye: 0x2a8a9a }, fact: '실처럼 가늘고 긴 몸을 가졌다.' }),
  // 말벌
  sp({ id: 'paperwasp', family: 'wasp', name: '쌍살벌', instinct: { id: 'nest', name: '종이 집', desc: '웅크려 1.5초 있으면 작은 집을 짓고, 그 근처에서 체력 회복' },
    look: { body: 0xf2c230, stripe: 0x2a2a2a, head: 0x2a2a2a, shape: 'wasp', antenna: 'elbow', feats: ['wings', 'stinger'] }, fact: '나무를 씹어 종이 같은 집을 짓는다. 날 때 긴 뒷다리를 늘어뜨린다.' }),
  sp({ id: 'hornet', family: 'wasp', name: '장수말벌', instinct: { id: 'raid', name: '벌집 습격', desc: '꿀벌 계열에게 주는 피해 +30%' },
    look: { body: 0xf5a623, stripe: 0x3a2a10, head: 0xff8c1a, shape: 'wasp', antenna: 'elbow', feats: ['wings', 'stinger'], mandible: { size: 22 } }, fact: '세계에서 가장 큰 말벌 중 하나로, 꿀벌집을 습격한다.' }),
  sp({ id: 'yellowleg', family: 'wasp', name: '등검은말벌', instinct: { id: 'hover', name: '정지 비행', desc: '2초 동안 질주하지 않으면 독침 사거리 +35%' },
    look: { body: 0x2a2018, stripe: 0xe8a020, head: 0x3a2a14, shape: 'wasp', antenna: 'elbow', feats: ['wings', 'stinger'] }, fact: '꿀벌집 앞에서 멈춰 날며 사냥한다.' }),
  sp({ id: 'potter', family: 'wasp', name: '호리병벌', instinct: { id: 'paralyze', name: '마비 침', desc: '독침에 맞은 적이 1초 느려짐' },
    look: { body: 0x1e1e1e, stripe: 0xf2b830, head: 0x1e1e1e, shape: 'wasp', antenna: 'elbow', feats: ['wings', 'stinger'] }, fact: '애벌레를 마비시켜 진흙 항아리 집에 넣는다.' }),
  // 노린재
  sp({ id: 'brownbug', family: 'stinkbug', name: '썩덩나무노린재', instinct: { id: 'stench', name: '지독한 냄새', desc: '가스 구름이 두 배 오래 남음' },
    look: { body: 0x8a6a4a, stripe: 0x6e5238, head: 0x7a5a3c, shape: 'shield', antenna: 'elbow' }, fact: '고약한 냄새로 유명한 흔한 노린재다.' }),
  sp({ id: 'jewelbug', family: 'stinkbug', name: '큰광대노린재', instinct: { id: 'warncolor', name: '경고색', desc: '나를 문 적이 1초 느려짐' },
    look: { body: 0x2ac87a, stripe: 0xd04ac8, head: 0x2a8ad0, shape: 'shield', antenna: 'elbow', pattern: 'metal' }, fact: '무지갯빛 화려한 몸색으로 독이 있음을 알린다.' }),
  sp({ id: 'assassin', family: 'stinkbug', name: '침노린재', instinct: { id: 'beak', name: '주둥이 찌르기', desc: '물기에 2초 독 피해가 붙음' },
    look: { body: 0x2a1e1a, stripe: 0xd8402a, head: 0x2a1e1a, shape: 'assassin', antenna: 'long' }, fact: '다른 곤충을 주둥이로 찔러 잡아먹는다.' }),
  sp({ id: 'strider', family: 'stinkbug', name: '소금쟁이', instinct: { id: 'water', name: '물 위 걷기', desc: '웅덩이에서 느려지지 않고 오히려 빨라짐' },
    look: { body: 0x4a4a52, stripe: 0x3a3a40, head: 0x3a3a42, shape: 'strider', antenna: 'long', feats: ['longLegs'] }, fact: '물 위를 미끄러지듯 다닌다. 노린재와 같은 무리다.' }),
  // 거미
  sp({ id: 'orbspider', family: 'spider', name: '무당거미', instinct: { id: 'golden', name: '큰 황금 그물', desc: '그물이 1.5배 크지만 한 번에 하나만' },
    look: { body: 0xf2d04a, stripe: 0x2a2a2a, head: 0x2a2a2a, shape: 'spider', feats: ['legs8'], fang: 16 }, fact: '가을에 크고 노란빛이 도는 그물을 친다.' }),
  sp({ id: 'gardenspider', family: 'spider', name: '왕거미', instinct: { id: 'rebuild', name: '그물 다시 짓기', desc: '그물에 적이 걸리면 재사용 시간이 바로 절반' },
    look: { body: 0x9a6a3a, stripe: 0xe8d2a6, head: 0x7a4a22, shape: 'spider', pattern: 'fuzzy', feats: ['legs8'], fang: 16 }, fact: '둥근 그물을 자주 새로 친다.' }),
  sp({ id: 'jumper', family: 'spider', forms: ['silk', 'trail'], name: '깡충거미', instinct: { id: 'pounce', name: '뛰어 덮치기', desc: '줄·그물에 걸린 적에게 자동으로 뛰어 붙음' },
    look: { body: 0x6a6a72, stripe: 0xe8c547, head: 0x4a4a52, shape: 'spider', pattern: 'fuzzy', feats: ['legs8'], fang: 14, eye: 0x111111 }, fact: '그물 대신 앞쪽의 큰 눈으로 거리를 재고 뛰어서 덮친다.' }),
  sp({ id: 'wolfspider', family: 'spider', forms: ['silk', 'trail'], name: '늑대거미', instinct: { id: 'babies', name: '새끼 업기', desc: '쓰러질 때 새끼거미가 흩어져 주변 적을 느리게 함' },
    look: { body: 0x6a5a48, stripe: 0x4a3e30, head: 0x5a4a3a, shape: 'spider', pattern: 'fuzzy', feats: ['legs8'], fang: 16 }, fact: '어미가 새끼를 등에 업고 다닌다.' }),
  sp({ id: 'widow', family: 'spider', name: '검은과부거미', instinct: { id: 'venom', name: '강한 독', desc: '묶인 적에게 독 피해가 계속 들어감' },
    look: { body: 0x1e1e24, stripe: 0xd8262f, head: 0x16161a, shape: 'spider', pattern: 'metal', feats: ['legs8'], fang: 20 }, fact: '독이 강하기로 유명하다. 배에 붉은 모래시계 무늬가 있다.' }),
  // 개미귀신
  sp({ id: 'myrm', family: 'antlion', name: '명주잠자리', instinct: { id: 'deep', name: '깊은 구덩이', desc: '구덩이가 더 크고 오래 감' },
    larva: { body: 0x9a8a6a, stripe: 0x7a6a4a, head: 0x8a7a5a, shape: 'antlion', antenna: 'short', mandible: { size: 52, teeth: true, color: 0x5a4a2a }, pattern: 'fuzzy' },
    look: { body: 0x5a5040, stripe: 0x4a4234, head: 0x4a4234, shape: 'lace', antenna: 'club', feats: ['wings4'] }, fact: '애벌레(개미귀신)가 모래에 깔때기 함정을 판다.' }),
  sp({ id: 'owlfly', family: 'antlion', forms: ['ambush', 'sand'], name: '노랑뿔잠자리', instinct: { id: 'jaws', name: '큰턱 벌리고 기다리기', desc: '웅크리고 1초 뒤, 다음 물기가 치명타(2배)' },
    larva: { body: 0x8a7a58, stripe: 0x6e6046, head: 0x7a6a4a, shape: 'antlion', antenna: 'short', mandible: { size: 60, teeth: true, color: 0x4a3a20 }, pattern: 'fuzzy' },
    look: { body: 0x3a3a2a, stripe: 0xf2c230, head: 0x3a3a2a, shape: 'lace', antenna: 'long', feats: ['wings4'] }, fact: '애벌레가 땅 위에서 큰턱을 벌리고 기다린다.' }),
  sp({ id: 'lacewing', family: 'antlion', forms: ['ambush', 'sand'], name: '풀잠자리', instinct: { id: 'trash', name: '쓰레기 등짐', desc: '먹을수록 등에 찌꺼기를 얹어 몸 뒤쪽 피해를 최대 40% 막음' },
    larva: { body: 0xb8a878, stripe: 0x9a8a5a, head: 0xa89868, shape: 'antlion', antenna: 'short', mandible: { size: 44, color: 0x6a5a3a }, feats: ['pack'] },
    look: { body: 0x8ad85a, stripe: 0x6ac040, head: 0x7ac84a, shape: 'lace', antenna: 'long', feats: ['wings4'], eye: 0xe8c040 }, fact: '일부 애벌레는 먹이 찌꺼기를 등에 지고 위장한다.' }),
  // 꿀벌
  sp({ id: 'honeybee', family: 'bee', name: '양봉꿀벌', instinct: { id: 'store', name: '꿀 저장', desc: '먹이 일부를 꿀로 모아 두었다가 체력이 낮을 때 자동으로 먹음' },
    look: { body: 0xf6c94a, stripe: 0x3a2a10, head: 0x3a2a10, shape: 'bee', pattern: 'swarm', antenna: 'elbow', feats: ['wings', 'stinger'] }, fact: '꿀을 모아 저장하고, 8자 춤으로 꽃밭의 위치를 알린다.' }),
  sp({ id: 'nativebee', family: 'bee', name: '토종벌', instinct: { id: 'heat', name: '열 공 전문', desc: '열 공 지속 2배, 말벌 계열에게 주는 피해 +30%' },
    look: { body: 0xb08a3a, stripe: 0x2a1e10, head: 0x2a1e10, shape: 'bee', pattern: 'swarm', antenna: 'elbow', feats: ['wings', 'stinger'] }, fact: '말벌을 둘러싸 체온을 올려 물리친다.' }),
  sp({ id: 'bumble', family: 'bee', forms: ['workers', 'honey'], name: '뒤영벌', instinct: { id: 'buzz', name: '붕붕 진동', desc: '질주하는 동안 주변 적을 살짝 밀어냄' },
    look: { body: 0xf2d04a, stripe: 0x1e1e1e, head: 0x1e1e1e, shape: 'bee', pattern: 'fuzzy', antenna: 'elbow', feats: ['wings'] }, fact: '날개 근육을 떨어 꽃가루를 털어낸다.' }),
  sp({ id: 'giantbee', family: 'bee', forms: ['workers', 'honey'], name: '큰꿀벌', instinct: { id: 'leafshield', name: '벌 커튼', desc: '웅크리면 일벌들이 몸을 덮어 앞쪽 피해를 막음' },
    look: { body: 0xd89a2a, stripe: 0x2a1a10, head: 0x2a1a10, shape: 'bee', pattern: 'swarm', antenna: 'elbow', feats: ['wings', 'stinger'] }, fact: '나뭇가지나 절벽에 벌집 한 장을 드러내 짓고, 적이 오면 벌들이 물결치듯 몸을 뒤집어 겁을 준다.' }),
  // 반딧불이
  sp({ id: 'genji', family: 'firefly', name: '애반딧불이', instinct: { id: 'waterborn', name: '물가 태생', desc: '웅덩이 안에서 체력 회복' },
    look: { body: 0x2a2a2a, stripe: 0x1e1e1e, head: 0xe8803a, shape: 'firefly', antenna: 'club', feats: ['wings', 'lamp'] }, fact: '애벌레가 물속에서 산다.' }),
  sp({ id: 'latefly', family: 'firefly', name: '늦반딧불이', instinct: { id: 'snail', name: '달팽이 사냥꾼', desc: '느려진 적에게 주는 피해 +25%' },
    look: { body: 0x6a5a3a, stripe: 0x4e422a, head: 0xe8c86a, shape: 'firefly', antenna: 'club', feats: ['wings', 'lamp'] }, fact: '애벌레가 땅에서 달팽이를 먹는다.' }),
  sp({ id: 'unmun', family: 'firefly', name: '운문산반딧불이', instinct: { id: 'forestlight', name: '숲속 불빛', desc: '섬광·오로라 범위 +10%, 낙엽 숲에서는 +40%' },
    look: { body: 0x2a2a30, stripe: 0x202026, head: 0xd8603a, shape: 'firefly', antenna: 'club', feats: ['wings', 'lamp'] }, fact: '한국의 숲에 사는 반딧불이다.' }),
  sp({ id: 'photuris', family: 'firefly', name: '포투리스반딧불이', instinct: { id: 'fakesignal', name: '가짜 신호', desc: '섬광에 걸린 적을 내 쪽으로 끌어당김' },
    look: { body: 0x8a7a4a, stripe: 0x6a5a34, head: 0xe8d080, shape: 'firefly', antenna: 'club', feats: ['wings', 'lamp'] }, fact: '다른 종의 빛 신호를 흉내 내 다른 반딧불이를 꾀어 잡아먹는다.' }),
];

/** 3판 새 종(엔진용): 모습·사실은 3판 표(v3.ts)에서. 본능 번호는 sim.ts에서 처리 */
const NEW_INSTINCT: Record<string, string> = {
  'v3:wangjine': 'segment', 'v3:grima': 'fastfeet', 'v3:gigantea': 'giant', 'v3:milli': 'autocurl', 'v3:ttangjine': 'rockslip',
  'v3:calopteryx': 'waterdance',
  'v3:wangant': 'bigworker', 'v3:armyant': 'raidline', 'v3:leafant': 'fungus', 'v3:bulldog': 'jumphunt', 'v3:fireant': 'raft',
  'v3:swallow': 'osmeterium', 'v3:monarch': 'migrate', 'v3:owlbf': 'bigeye', 'v3:morpho': 'shimmer', 'v3:tussock': 'hairbody',
};
const NEW_FAM: Record<string, FamilyId> = { centipede: 'centipede', ant: 'ant', butterfly: 'butterfly', dragonfly: 'dragonfly' };
export const NEW_SPECIES: Species[] = Object.keys(NEW_INSTINCT).map((id) => {
  const v = V3_BY_ID.get(id)!;
  return { id, family: NEW_FAM[v.fam], name: v.name, instinct: { id: NEW_INSTINCT[id], name: v.instinct.name, desc: v.instinct.desc }, look: v.look!, larva: v.larva, fact: v.fact };
});
// 3판에서 바뀐 본능: 늑대거미는 새끼 업기 대신 땅 사냥꾼(새끼는 '새끼 흩기' 기술로 옮겨 감)
{
  const w = SPECIES.find((x) => x.id === 'wolfspider');
  if (w) w.instinct = { id: 'groundhunt', name: '땅 사냥꾼', desc: '그물 대신 질주 속도 +10%' };
}
export const SPECIES_BY_ID = new Map([...SPECIES, ...NEW_SPECIES].map((s) => [s.id, s]));

/** 판 안 모습: 단계(1 어린 모습, 2 성충, 3 각성)마다 다른 모습 */
export function lookFor(speciesId: string, stage: number): Look {
  const s = SPECIES_BY_ID.get(speciesId);
  if (!s) return BOSS_LOOK;
  const f = FAMILY[s.family];
  // 개미귀신은 두 번째 단계까지 애벌레로 싸운다
  const larvaStage = f.id === 'antlion' ? stage <= 2 : stage <= 1;
  if (!larvaStage) return s.look;
  if (s.larva) return s.larva;
  if (f.larva === 'derive') {
    const lt = (c: number) => mixC(c, 0xffffff, 0.18);
    return { ...s.look, body: lt(s.look.body), stripe: lt(s.look.stripe), head: lt(s.look.head), feats: (s.look.feats ?? []).filter((x) => x !== 'wings' && x !== 'wings4') };
  }
  // 굼벵이: 종마다 머리 색만 살짝 다르게
  return { ...f.larva, head: mixC(f.larva.head, s.look.head, 0.25) };
}

export function mixC(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export const BOSS_LOOK: Look = { body: 0x8a2a1a, stripe: 0x5a1a10, head: 0x4a120a, shape: 'centipede', pattern: 'metal', feats: ['centipede'], antenna: 'long', mandible: { size: 52, color: 0x2a0a06 } };

/** 공용 보조 기술 10개 */
export const COMMON_SUBS: SubDef[] = [
  { id: 'camo', name: '위장', icon: '🍃', desc: '2초 동안 안 보이고, 다음 공격 피해 1.5배', cd: 14, ai: 'buff', range: 200, families: ['mantis', 'stinkbug', 'spider', 'antlion'] },
  { id: 'hop', name: '짧은 비행', icon: '🪽', desc: '몸 충돌을 무시하고 앞으로 날아감', cd: 10, ai: 'move', range: 0, families: ['rhino', 'stag', 'mantis', 'dragonfly', 'wasp', 'stinkbug', 'bee', 'firefly'] },
  { id: 'escape', name: '탈출 질주', icon: '💨', desc: '1초 동안 매우 빨라지고, 묶임·느려짐·잡힘이 풀림', cd: 12, ai: 'escape', range: 0, families: ['rhino', 'stag', 'mantis', 'dragonfly', 'wasp', 'stinkbug', 'spider', 'antlion', 'bee', 'firefly'] },
  { id: 'curl', name: '껍질 웅크림', icon: '🐚', desc: '1.5초 동안 받는 피해 −60%, 대신 움직이지 못함', cd: 12, ai: 'defense', range: 0, families: ['rhino', 'stag', 'stinkbug'] },
  { id: 'reserve', name: '저장 양분', icon: '🫙', desc: '체력 25% 즉시 회복', cd: 20, ai: 'heal', range: 0, families: ['rhino', 'stag', 'antlion', 'bee'] },
  { id: 'spit', name: '끈끈이 침', icon: '💧', desc: '끈끈한 실 섞인 침을 뱉어 맞은 적이 1.5초 느려짐', cd: 8, ai: 'proj', range: 300, families: ['spider'] },
  { id: 'bait', name: '가짜 먹이', icon: '🍬', desc: '먹이처럼 보이는 미끼를 놓음. 닿은 적은 1초 묶임', cd: 12, ai: 'place', range: 150, families: ['mantis', 'spider', 'antlion', 'firefly'] },
  { id: 'roll', name: '구르기', icon: '🔄', desc: '짧게 굴러 자리를 피하고, 다음 물기 피해 +50%', cd: 8, ai: 'move', range: 0, families: ['rhino', 'stag'] },
  { id: 'chirp', name: '경고 소리', icon: '📢', desc: '몸이나 날개를 비벼 낸 경고 소리로 주변 적을 0.5초 기절', cd: 15, ai: 'aoe', range: 150, families: ['rhino', 'stag', 'wasp', 'stinkbug', 'bee'] },
  { id: 'molt', name: '허물 남기기', icon: '👻', desc: '제자리에 허물을 남기고 앞으로 순간이동. 적은 허물을 나로 봄', cd: 14, ai: 'escape', range: 0, families: ['mantis', 'dragonfly', 'stinkbug', 'spider'] },
];

export const SUBS_BY_ID = new Map<string, SubDef>([...COMMON_SUBS.map((s) => [s.id, s] as const), ...FAMILIES.map((f) => [f.sub.id, f.sub] as const)]);

/** 특별 먹이 10종: 계열마다 하나씩 좋아하고 하나씩 싫어한다 */
export interface SpecialFood {
  id: string;
  name: string;
  icon: string;
}
export const SPECIAL_FOODS: SpecialFood[] = [
  { id: 'sap', name: '나무 수액', icon: '🪵' },
  { id: 'fruit', name: '잘 익은 과일', icon: '🍑' },
  { id: 'grasshopper', name: '메뚜기', icon: '🦗' },
  { id: 'mosquito', name: '모기', icon: '🦟' },
  { id: 'meat', name: '고깃점', icon: '🍖' },
  { id: 'bean', name: '콩꼬투리', icon: '🥜' },
  { id: 'fly', name: '파리', icon: '🪰' },
  { id: 'ant', name: '개미', icon: '🐜' },
  { id: 'nectar', name: '꽃꿀', icon: '🌸' },
  { id: 'snail', name: '달팽이', icon: '🐌' },
];
/** 1 좋아함, -1 싫어함, 0 보통 */
export function taste(f: FamilyId | null | undefined, food: number): -1 | 0 | 1 {
  if (!f) return 0;
  const F = FAMILY[f];
  return F.likes === food ? 1 : F.hates === food ? -1 : 0;
}
/** 이 먹이를 좋아하는 계열 */
export function likerOf(food: number): Family | undefined {
  return FAMILIES.find((f) => f.likes === food);
}

/** 이 종이 쓸 수 있는 기술 형태 */
export function formsOf(speciesId: string): FormDef[] {
  const sp = SPECIES_BY_ID.get(speciesId)!;
  const F = FAMILY[sp.family];
  return sp.forms ? F.forms.filter((f) => sp.forms!.includes(f.id)) : F.forms;
}

// 3판 설계: 8계열 × 5종 = 40종.
// 계열 = 계열 특성(패시브) + 공격(Lv1) + 방어(Lv3) + 특수(Lv5) + 필살기(게이지). Lv10 각성.
// 종 = 계열 뼈대에서 한 칸을 종 기술로 바꿈 + 본능. 대표 종은 뼈대 그대로.
// 이 파일은 도감·기획서용 설계 데이터다. 게임 규칙(sim)은 아직 2판 그대로이며, 구현할 때 이 표를 따른다.
// play: 도감에서 기술을 재생하는 방법. real = 2판에 이미 있는 기술을 실제 시뮬레이션으로 재생,
//       나머지 = 새 기술이라 이펙트·반응만 연출로 보여 준다(피해 계산 없음).
import type { Look } from './species';

export type V3FamId = 'beetle' | 'centipede' | 'mantis' | 'dragonfly' | 'bee' | 'ant' | 'spider' | 'butterfly';
export type V3Slot = 'atk' | 'def' | 'spc' | 'ult';
export const SLOT_NAME: Record<V3Slot, string> = { atk: '공격', def: '방어', spc: '특수', ult: '필살기' };
export const SLOT_LV: Record<V3Slot, string> = { atk: 'Lv1', def: 'Lv3', spc: 'Lv5', ult: '게이지' };

/** 대상에게 보여 줄 반응 */
export type V3React = 'stun' | 'push' | 'pull' | 'root' | 'slow' | 'confuse' | 'charm' | 'poison' | 'fear' | 'blind' | 'mark' | 'silence' | 'cut' | 'lift' | 'itch';

export interface V3Fx {
  kind: string; // 렌더러 이펙트 종류(FxKind)
  at?: 'self' | 'head' | 'front' | 'tgt'; // 어디서 터지나(기본 head)
  d?: number; // front일 때 앞으로 거리
  r?: number;
  len?: number;
  half?: number;
  delay?: number; // 초
  aoff?: number; // 각도 비틀기
}

export interface V3Play {
  /** 2판에 있는 기술: 그 종·기술로 실제 시뮬레이션을 돌린다 */
  real?: { sp: string; kind: 'main' | 'sub' | 'ult'; form?: string; sub?: string; stage?: 1 | 2 | 3 };
  move?: 'dash' | 'back' | 'zig' | 'hop' | 'circle' | 'skip';
  dist?: number;
  fx?: V3Fx[];
  react?: V3React[];
  all?: boolean; // 허수아비 모두에게 반응
  reactT?: number;
  self?: ('fly' | 'ghost' | 'hide' | 'shield' | 'bitter' | 'curl')[];
  selfT?: number;
}

export interface V3Skill {
  name: string;
  icon: string;
  type: string; // 유형(돌진, 앞쪽 범위, 투사체, 제어…)
  cd?: number; // 재사용(초). 필살기는 게이지
  desc: string;
  awake?: string; // Lv10 각성
  ref: string; // 다른 게임의 비슷한 기술
  fx: string; // 이펙트·모션 설계
  play: V3Play;
  /** 2판 기술을 옮겨 온 것이면 그 이름 */
  from?: string;
}

export interface V3Trait {
  name: string;
  icon: string;
  desc: string;
  ref: string;
  fx: string;
}

export interface V3Family {
  id: V3FamId;
  name: string;
  icon: string;
  color: number;
  color2: number;
  seat: string; // 자리
  cc: string; // 맡는 제어 효과
  stages: [string, string, string];
  merged?: string; // 2판의 어느 계열에서 왔나
  trait: V3Trait;
  atk: V3Skill;
  def: V3Skill;
  spc: V3Skill;
  ult: V3Skill;
  strong: string;
  weak: string;
  look: string; // 계열 모습 설계
  motion: string; // 계열 공통 연출
  species: string[];
}

export interface V3Theme {
  pal: [number, number, number];
  bit: 'dot' | 'petal' | 'leaf' | 'shard' | 'drop' | 'mote' | 'ember' | 'sand' | 'silk' | 'star' | 'bubble' | 'paper' | 'ant' | 'scale' | 'hair';
  motion: 'heavy' | 'swift' | 'phantom' | 'spin' | 'glow' | 'zigzag' | 'drip';
  tag: string;
}

export interface V3Species {
  id: string;
  fam: V3FamId;
  name: string;
  base?: boolean;
  swap?: V3Slot;
  skill?: V3Skill;
  instinct: { name: string; desc: string };
  /** 2판 종의 모습을 그대로 쓰면 그 종 id */
  lookFrom?: string;
  look?: Look;
  larva?: Look;
  theme: V3Theme;
  gfx: string; // 모습 설계
  fact: string;
  isNew?: boolean; // 3판에 새로 들어온 종
}

// ---------- 모습(새 종) ----------
const INK = 0x1e1a14;

const L = {
  // 지네
  wangjine: { body: 0x7a2416, stripe: 0x5a160c, head: 0xc8361e, shape: 'centipede', pattern: 'metal', feats: ['centipede'], antenna: 'long', mandible: { size: 40, color: 0x2a0e06 }, eye: 0x111111 } as Look,
  grima: { body: 0xb8a888, stripe: 0x4a4038, head: 0xc8b898, shape: 'centipede', feats: ['centipede', 'longLegs'], antenna: 'long', mandible: { size: 24, color: 0x3a3028 } } as Look,
  gigantea: { body: 0x8a3a1a, stripe: 0x2a1408, head: 0xa8401c, shape: 'centipede', pattern: 'metal', feats: ['centipede'], antenna: 'long', mandible: { size: 50, color: 0x1a0a04 } } as Look,
  milli: { body: 0x2a2420, stripe: 0xe07a2a, head: 0x3a302a, shape: 'milli', pattern: 'metal', feats: ['centipede'], antenna: 'short' } as Look,
  ttangjine: { body: 0xe8c86a, stripe: 0xc8a048, head: 0xd89a3a, shape: 'centipede', feats: ['centipede', 'lamp'], antenna: 'short', mandible: { size: 22, color: 0x6a3a10 } } as Look,
  // 개미
  wangant: { body: 0x2a2624, stripe: 0x141210, head: 0x34302c, shape: 'ant', pattern: 'metal', antenna: 'elbow', mandible: { size: 26, color: INK } } as Look,
  armyant: { body: 0x8a4a22, stripe: 0x5a2a10, head: 0x9a5426, shape: 'ant', antenna: 'elbow', mandible: { size: 46, teeth: true, color: 0x3a1a08 } } as Look,
  leafant: { body: 0xc8682a, stripe: 0x9a4a1a, head: 0xd8783a, shape: 'ant', pattern: 'spots', antenna: 'elbow', mandible: { size: 30, teeth: true, color: 0x5a2a10 } } as Look,
  bulldog: { body: 0xd84a1a, stripe: 0x1a1412, head: 0x1e1814, shape: 'ant', feats: ['stinger'], antenna: 'elbow', mandible: { size: 40, color: 0xe8a020 } } as Look,
  fireant: { body: 0xd8401a, stripe: 0x8a2410, head: 0xe0582a, shape: 'ant', feats: ['stinger'], antenna: 'elbow', mandible: { size: 20, color: 0x6a1a08 } } as Look,
  // 나비 (몸통은 털 많은 짧은 몸, 날개는 bwing으로 크게)
  swallow: { body: 0x2a2620, stripe: 0xf2d24a, head: 0x2a2620, shape: 'butterfly', pattern: 'fuzzy', feats: ['bwings'], antenna: 'club', bwing: { kind: 'swallow', c1: 0xf6d84a, c2: 0x1e1a14, c3: 0x5ab8ff } } as Look,
  monarch: { body: 0x1e1a14, stripe: 0xf6f2e6, head: 0x1e1a14, shape: 'butterfly', pattern: 'spots', feats: ['bwings'], antenna: 'club', bwing: { kind: 'monarch', c1: 0xff8a1c, c2: 0x1e1a14, c3: 0xffffff } } as Look,
  owlbf: { body: 0x5a4430, stripe: 0x8a6a48, head: 0x4a3828, shape: 'butterfly', pattern: 'fuzzy', feats: ['bwings'], antenna: 'club', bwing: { kind: 'owl', c1: 0x9a7a58, c2: 0x3a2a1c, c3: 0xffd23f } } as Look,
  morpho: { body: 0x1e2a3a, stripe: 0x3a5a8a, head: 0x1e2a3a, shape: 'butterfly', pattern: 'metal', feats: ['bwings'], antenna: 'club', bwing: { kind: 'morpho', c1: 0x2a8aff, c2: 0x0e1a2a, c3: 0x9ae8ff } } as Look,
  tussock: { body: 0xf0dca0, stripe: 0xd8b870, head: 0xe8d090, shape: 'butterfly', pattern: 'fuzzy', feats: ['bwings'], antenna: 'feather', bwing: { kind: 'moth', c1: 0xf2e4b0, c2: 0xb8904a, c3: 0x8a6a3a } } as Look,
  // 물잠자리: 2판 잠자리 몸에 검은 날개
  calopteryx: { body: 0x1a8a5a, stripe: 0x0e5a3a, head: 0x1a7a50, shape: 'dragon', pattern: 'metal', feats: ['wings4'], antenna: 'short', wingTint: 0x3a2a3a, eye: 0x2a2a2a } as Look,
};

// 애벌레(나비 계열 1단계): 털 없는 통통한 몸 + 무늬
const cat = (body: number, stripe: number, head: number, pattern: Look['pattern'] = 'spots'): Look => ({ body, stripe, head, shape: 'cute', pattern, antenna: null });

// ---------- 계열 ----------
export const V3_FAMILIES: V3Family[] = [
  {
    id: 'beetle', name: '딱정벌레', icon: '🪲', color: 0xb07a3a, color2: 0xffd23f,
    seat: '근접 탱커 · 들이받기·집기·맷집', cc: '기절·밀어내기', stages: ['굼벵이', '딱정벌레', '각성'], merged: '장수풍뎅이 + 사슴벌레 (+ 반딧불이 한 종)',
    trait: { name: '무거운 껍질', icon: '🛡️', desc: '밀려나는 거리 절반, 받는 피해 −10%. 내가 건 기절·밀어내기는 0.2초 더 길다.', ref: '오버워치 탱커 공통 패시브(밀쳐내기 저항)', fx: '맞을 때 껍질에서 금빛 불꽃 2~3개가 튀고, 밀리면 발밑에 짧은 흙먼지 자국이 남는다.' },
    atk: { name: '돌진', icon: '🐂', type: '돌진', cd: 10, desc: '앞으로 돌진해 부딪힌 적에게 피해를 주고 밀어낸다.', awake: '돌진이 끝난 자리에 충격파', ref: 'WoW 전사 돌진(Charge) · 오버워치 라인하르트 돌진', fx: '뿔 끝에서 흙먼지 띠가 길게 끌리고, 부딪힌 자리에 갈색 충격 고리와 돌 조각이 튄다.', from: '장수풍뎅이 돌진', play: { real: { sp: 'rhino', kind: 'main', form: 'charge' } } },
    def: { name: '버티고 밀기', icon: '🛡️', type: '피해 감소', cd: 12, desc: '2초 동안 받는 피해 −30%, 앞의 적을 계속 밀어낸다.', awake: '밀려난 적이 바위·벽에 부딪히면 추가 피해', ref: 'WoW 전사 방패의 벽(Shield Wall)', fx: '앞쪽에 반투명 껍질 방패가 세 번 부풀며 바람 고리를 밀어 보낸다.', from: '장수풍뎅이 버티고 밀기', play: { real: { sp: 'rhino', kind: 'main', form: 'push' } } },
    spc: { name: '퍼 올리기', icon: '⤴️', type: '제어 · 기절', cd: 9, desc: '앞의 적을 뿔로 퍼 올려 뒤로 넘기고 0.5초 기절시킨다.', awake: '넘긴 적이 떨어진 자리에 피해', ref: 'LoL 알리스타 분쇄 · WoW 전사 충격파(Shockwave)', fx: '뿔이 아래에서 위로 큰 호를 그리고, 넘어간 적 머리 위로 노란 별이 돈다.', from: '장수풍뎅이 퍼 올리기', play: { real: { sp: 'rhino', kind: 'main', form: 'lift' } } },
    ult: { name: '대지 진동 돌진', icon: '🌋', type: '돌진 · 범위 기절', desc: '길게 돌진해 길 위의 모든 적을 밀어내고 1초 기절시킨다.', awake: '돌진이 끝난 자리에 큰 충격파', ref: '오버워치 라인하르트 대지 분쇄(Earthshatter)', fx: '땅이 갈라진 줄이 앞으로 뻗고 흙먼지 기둥이 연달아 솟는다. 화면이 크게 흔들린다.', from: '장수풍뎅이 필살기', play: { real: { sp: 'rhino', kind: 'ult' } } },
    strong: '지네·사마귀처럼 붙어 싸우는 계열. 맷집으로 버티며 기절로 끊는다.', weak: '벌·나비처럼 멀리서 깎는 계열. 돌진이 빠지면 쫓아갈 수단이 적다.',
    look: '단단한 광택 껍질, 뿔이나 큰턱이 머리보다 크다. 다리는 짧고 굵게, 걸을 때 몸이 무겁게 흔들린다.',
    motion: '모든 기술에 흙먼지와 땅 울림. 맞힐 때 화면이 다른 계열보다 크게 흔들린다.',
    species: ['rhino', 'herc', 'kingstag', 'sawstag', 'genji'],
  },
  {
    id: 'centipede', name: '지네', icon: '🪱', color: 0xc8361e, color2: 0xffd23f,
    seat: '근접 그래플러 · 긴 몸으로 휘감기·독턱', cc: '휘감기·압착', stages: ['어린 지네', '지네', '각성'],
    trait: { name: '독턱', icon: '🦷', desc: '물면 2초 중독. 휘감긴 적을 물면 피해 +30%.', ref: 'LoL 트위치 패시브(맹독) · WoW 도적 독 바르기', fx: '물 때 머리 앞 독턱이 붉게 번쩍이고, 맞은 자리에 보라 독방울이 튄다.' },
    atk: { name: '독턱 찌르기', icon: '🗡️', type: '짧은 돌진 · 중독', cd: 7, desc: '머리를 앞으로 튕겨 독턱으로 찔러 피해 + 3초 중독.', awake: '두 번 연속 찌름', ref: 'WoW 도적 절단(Mutilate) · LoL 렉사이 Q', fx: '머리가 화살처럼 튀어나가며 붉은 독턱 궤적 두 줄이 X자로 겹치고, 맞은 자리에 보라 방울이 터진다.', play: { move: 'dash', dist: 70, fx: [{ kind: 'fangstab', len: 150 }], react: ['poison', 'cut'] } },
    def: { name: '몸 말기', icon: '🌀', type: '피해 감소 · 반사', cd: 12, desc: '1.5초 동안 몸을 동그랗게 말아 받는 피해 −40%. 그동안 나를 문 적은 중독.', awake: '말기가 풀릴 때 주변 적을 밀어냄', ref: 'WoW 드루이드 나무껍질(Barkskin) + 가시(Thorns)', fx: '몸이 똬리를 틀고, 붉은 다리들이 바깥쪽으로 가시처럼 선다. 둘레에 붉은 고리가 맥박치듯 빛난다.', play: { fx: [{ kind: 'coil', at: 'self', r: 70 }], self: ['curl'], selfT: 1.5 } },
    spc: { name: '휘감기', icon: '➰', type: '제어 · 묶기 + 압착', cd: 12, desc: '가까운 적 하나를 긴 몸으로 감아 2초 묶고, 매초 압착 피해. 감는 동안 나도 느려진다.', awake: '감긴 적 둘레의 다른 적도 밀어냄', ref: 'LoL 스카너 꿰뚫기(궁) · WoW 죽음의 기사 질식(Strangulate)', fx: '적 둘레로 붉은 몸 고리가 나선으로 조여들고, 조일 때마다 고리가 번쩍이며 다리 자국이 찍힌다.', play: { move: 'dash', dist: 40, fx: [{ kind: 'coil', at: 'tgt', r: 55 }, { kind: 'coil', at: 'tgt', r: 45, delay: 0.7 }, { kind: 'coil', at: 'tgt', r: 40, delay: 1.4 }], react: ['root', 'cut'], reactT: 2 } },
    ult: { name: '백족 소용돌이', icon: '🌪️', type: '범위 끌어오기 · 압착', desc: '큰 원을 그리며 질주해 안쪽 적들을 가운데로 끌어 모으고, 3초 동안 조여 지속 피해.', awake: '다 조이면 가운데에서 독 폭발', ref: '오버워치 자리야 중력자탄 · WoW 죽음의 기사 고어핀드의 손아귀', fx: '붉은 다리 자국이 큰 원을 그리고, 가운데로 휘말리는 나선 바람이 적들을 빨아들인다.', play: { move: 'circle', fx: [{ kind: 'vortex', at: 'front', d: 150, r: 210 }, { kind: 'vortex', at: 'front', d: 150, r: 150, delay: 0.9 }], react: ['pull', 'root'], all: true, reactT: 3 } },
    strong: '나비·잠자리처럼 몸이 약하고 도망가는 계열. 한 번 감으면 못 빠져나간다.', weak: '딱정벌레(밀어내기·기절로 감기를 끊음), 개미(여럿이라 하나만 감아서는 부족).',
    look: '머리가 납작하고 붉으며, 마디마다 다리 한 쌍. 머리 앞에 갈고리 모양 독턱. 걸을 때 다리가 물결처럼 차례로 움직인다.',
    motion: '붉은 몸 고리와 다리 자국이 공통. 조일 때 고리가 맥박치듯 번쩍인다.',
    species: ['v3:wangjine', 'v3:grima', 'v3:gigantea', 'v3:milli', 'v3:ttangjine'],
  },
  {
    id: 'mantis', name: '사마귀', icon: '🦗', color: 0x6ac83a, color2: 0xd8ff9a,
    seat: '근접 범위 딜러 · 칼날·매복', cc: '공포', stages: ['약충', '사마귀', '각성'],
    trait: { name: '매복', icon: '🎯', desc: '웅크린 채 1.5초가 지나면 다음 공격 +50%.', ref: 'WoW 도적 은신 후 첫 공격 · 브롤스타즈 레온', fx: '웅크린 동안 낫 끝에 연두 빛이 차오르고, 다 차면 "챙" 하고 반짝인다.' },
    atk: { name: '넓게 베기', icon: '🗡️', type: '앞쪽 범위', cd: 9, desc: '앞쪽 부채꼴을 크게 베어 여럿에게 피해.', awake: '베인 자리에 칼날 자국이 2초 남음', ref: 'WoW 전사 회전베기(Cleave) · 디아블로 야만용사 회전베기', fx: '연두 칼날 호가 부채꼴로 그어지고 풀잎이 흩날린다.', from: '사마귀 넓게 베기', play: { real: { sp: 'kingmantis', kind: 'main', form: 'sweep' } } },
    def: { name: '날개 펼쳐 위협', icon: '🦋', type: '공포', cd: 14, desc: '날개를 펼쳐 주변 적을 1초 겁먹게 한다. 겁먹은 적은 느려지고 기술을 못 쓴다.', ref: 'WoW 전사 위협의 외침 · 사제 영혼의 절규(Psychic Scream)', fx: '날개가 활짝 펴지며 보랏빛 위협 고리가 퍼지고, 겁먹은 적 머리 위에 보라 물결 표시.', from: '사마귀 보조 기술', play: { real: { sp: 'kingmantis', kind: 'sub', sub: 'threat' } } },
    spc: { name: '위장', icon: '🍃', type: '숨기 · 강화', cd: 14, desc: '2초 동안 안 보이고, 다음 공격 피해 1.5배.', ref: 'WoW 도적 소멸(Vanish)', fx: '몸이 풀잎 무늬로 흐려지며 반투명해지고, 나타날 때 풀잎이 확 흩어진다.', from: '공용 위장', play: { real: { sp: 'kingmantis', kind: 'sub', sub: 'camo' } } },
    ult: { name: '천 개의 낫', icon: '🌪️', type: '주변 범위', desc: '2초 동안 주변을 난도질, 그동안 받는 피해 −30%.', awake: '끝나면 공격 기술 재사용 초기화', ref: 'WoW 전사 칼날폭풍(Bladestorm) · LoL 마스터 이 알파 스트라이크', fx: '몸 둘레로 칼날 호가 수십 번 겹쳐 그려지고, 풀잎 회오리가 함께 돈다.', from: '사마귀 필살기', play: { real: { sp: 'kingmantis', kind: 'ult' } } },
    strong: '개미처럼 여럿이 몰려오는 계열. 범위 베기로 한 번에 정리한다.', weak: '딱정벌레(맷집과 기절), 거미(묶이면 매복이 소용없음).',
    look: '세모 머리에 큰 겹눈, 앞다리는 접힌 낫. 걸을 때 낫을 가슴 앞에 모으고 머리를 좌우로 까딱인다.',
    motion: '칼날 호(슬래시)와 풀잎이 공통. 종마다 칼날 색과 잔상 길이가 다르다.',
    species: ['kingmantis', 'widemantis', 'smallmantis', 'orchid', 'ghost'],
  },
  {
    id: 'dragonfly', name: '잠자리', icon: '🛩️', color: 0x4ab8e8, color2: 0xffd23f,
    seat: '공중 돌격 · 치고 빠지기·회피', cc: '낚아채기·돌파', stages: ['수채', '잠자리', '각성'],
    trait: { name: '비행', icon: '🪽', desc: '질주 속도 +10%, 질주 중에는 장판·끈끈이를 무시한다.', ref: '오버워치 파라 비행 · LoL 날아다니는 유닛', fx: '질주하면 날개가 빠르게 떨리며 몸이 살짝 떠오르고, 그림자가 몸에서 떨어진다.' },
    atk: { name: '급강하', icon: '⬇️', type: '도약 · 범위', cd: 8, desc: '빠르게 날아가 내려앉는 자리에 피해. 나는 동안 몸 충돌이 없다.', awake: '내려앉은 뒤 한 번 더', ref: 'WoW 전사 영웅의 도약(Heroic Leap)', fx: '날개 바람 궤적이 곧게 뻗고, 내려앉는 자리에 바람 고리가 퍼진다.', from: '잠자리 급강하', play: { real: { sp: 'giantdf', kind: 'main', form: 'dive' } } },
    def: { name: '짧은 비행', icon: '💨', type: '회피 이동', cd: 10, desc: '몸 충돌을 무시하고 앞으로 날아간다.', ref: 'WoW 마법사 점멸(Blink)', fx: '날개가 한 번 크게 퍼덕이고 지나간 길에 잔상과 바람 줄이 남는다.', from: '공용 짧은 비행', play: { real: { sp: 'giantdf', kind: 'sub', sub: 'hop' } } },
    spc: { name: '낚아채기', icon: '🪝', type: '돌파 · 잡기', cd: 8, desc: '지나가며 길 위의 적을 낚아 피해, 작은 먹이는 바로 먹는다.', awake: '낚은 적을 끌고 감', ref: 'LoL 쓰레쉬 사형 선고(잡아 끌기) · 오버워치 로드호그 갈고리', fx: '빠른 직선 궤적 끝에 다리 여섯 개가 바구니처럼 모이며 번쩍인다.', from: '잠자리 낚아채기', play: { real: { sp: 'giantdf', kind: 'main', form: 'snatch' } } },
    ult: { name: '하늘 사냥', icon: '☄️', type: '무적 · 연속 도약', desc: '3초 동안 날아올라 무적, 세 번 급강하.', awake: '다섯 번', ref: 'LoL 렝가 사냥의 전율 · WoW 악마사냥꾼 지옥 강타', fx: '화면 밖으로 날아올랐다가 별똥별처럼 세 번 내리꽂힌다. 꽂힐 때마다 바람 고리와 불씨.', from: '잠자리 필살기', play: { real: { sp: 'giantdf', kind: 'ult' } } },
    strong: '벌·나비처럼 멀리서 쏘는 계열. 빠르게 파고들어 낚는다.', weak: '거미(그물), 지네(감기면 못 남).',
    look: '긴 꼬리 몸, 머리의 대부분이 겹눈. 날개 네 장이 늘 보이고, 멈춰 있을 때도 날개가 가볍게 떨린다.',
    motion: '바람 궤적과 잔상이 공통. 종마다 궤적 색이 다르다.',
    species: ['giantdf', 'emperor', 'redDf', 'damsel', 'v3:calopteryx'],
  },
  {
    id: 'bee', name: '벌', icon: '🐝', color: 0xf2a81a, color2: 0x2a2a2a,
    seat: '원거리 딜러 · 독침 연사·꿀 회복', cc: '중독', stages: ['애벌레', '벌', '각성'], merged: '말벌 + 꿀벌',
    trait: { name: '독침', icon: '☠️', desc: '기술에 맞은 적은 3초 중독. 중독된 적에게 주는 피해 +15%.', ref: 'LoL 트위치 맹독 · WoW 도적 독', fx: '중독된 적의 몸에서 초록 방울이 뚝뚝 떨어지고, 내 독침 끝이 초록으로 빛난다.' },
    atk: { name: '독침 연사', icon: '🎯', type: '투사체', cd: 11.5, desc: '작은 독침 3발을 연이어 쏜다.', awake: '5발', ref: 'WoW 사냥꾼 속사(Rapid Fire)', fx: '노란 번개 같은 독침이 세 줄로 빠르게 날아가고, 꼬리가 반짝인다.', from: '말벌 연사', play: { real: { sp: 'hornet', kind: 'main', form: 'burst' } } },
    def: { name: '꿀 나누기', icon: '🍯', type: '회복 장판', cd: 14, desc: '주변에 꿀을 떨어뜨려 안에 있으면 회복.', awake: '꿀 위에 선 적은 끈적여 느려짐', ref: 'WoW 주술사 치유의 비(Healing Rain)', fx: '황금빛 꿀 방울이 떨어져 둥근 웅덩이가 되고, 안에서 작은 빛 방울이 올라온다.', from: '꿀벌 꿀 나누기', play: { real: { sp: 'honeybee', kind: 'main', form: 'honey' } } },
    spc: { name: '경보 페로몬', icon: '📣', type: '소환', cd: 18, desc: '작은 동료 벌 2마리가 5초 동안 함께 공격한다.', ref: 'WoW 사냥꾼 야수 부르기 · 브롤스타즈 제시 포탑', fx: '머리 위로 노란 경보 고리가 두 번 퍼지고 동료 벌이 빙 돌아 날아온다.', from: '말벌 보조 기술', play: { real: { sp: 'hornet', kind: 'sub', sub: 'alarm' } } },
    ult: { name: '독침 폭우', icon: '🌧️', type: '넓은 범위', desc: '넓은 범위에 독침이 비처럼 쏟아진다.', awake: '맞은 적의 독이 두 배', ref: 'WoW 사냥꾼 일제 사격(Volley)', fx: '하늘에서 금빛 독침 수십 개가 사선으로 쏟아지고, 땅에 박힌 자리마다 초록 방울.', from: '말벌 필살기', play: { real: { sp: 'hornet', kind: 'ult' } } },
    strong: '딱정벌레·지네처럼 붙어야 하는 계열. 거리를 두고 독으로 깎는다.', weak: '잠자리(파고듦), 사마귀(매복 기습).',
    look: '노랑·검정 띠 배, 꼬리 끝 독침. 날개 두 장이 늘 빠르게 떨려 몸이 살짝 떠 보인다.',
    motion: '독침 궤적과 초록 독방울이 공통. 꿀벌 종은 황금 꿀빛, 말벌 종은 노란 번개.',
    species: ['hornet', 'honeybee', 'bumble', 'potter', 'yellowleg'],
  },
  {
    id: 'ant', name: '개미', icon: '🐜', color: 0x8a4a2a, color2: 0xe8a05a,
    seat: '무리 소환 · 협공·개미산', cc: '수로 밀어붙이기', stages: ['애벌레', '개미', '각성'],
    trait: { name: '일개미 행렬', icon: '🐜', desc: '일개미 2마리가 늘 뒤를 따라다니며, 내가 문 적을 같이 문다(한 마리당 물기의 20%). 쓰러지면 8초 뒤 다시 나온다.', ref: 'WoW 죽음의 기사 구울 · 사냥꾼 야수(늘 따라다니는 소환수)', fx: '작은 개미 두 마리가 내 몸 뒤를 줄지어 걷고, 내가 물면 함께 달려들어 문다.' },
    atk: { name: '개미산 쏘기', icon: '🧪', type: '투사체 · 약화', cd: 8, desc: '배 끝에서 개미산 줄기를 쏘아 피해. 맞은 적은 3초 동안 받는 피해 +15%(산에 녹음).', awake: '맞은 자리에 산 웅덩이가 2초 남음', ref: 'WoW 전사 방어구 가르기(Sunder Armor) · LoL 트위치 독 묻은 단검', fx: '주황빛 산 줄기가 지글거리며 뻗고, 맞은 적 몸에서 하얀 연기가 오른다.', play: { fx: [{ kind: 'acid', len: 260 }], react: ['mark', 'cut'] } },
    def: { name: '굴 파기', icon: '🕳️', type: '무적 이동', cd: 12, desc: '땅속으로 파고들어 1초 무적, 앞쪽으로 160만큼 가서 튀어나온다.', awake: '튀어나온 자리 주변 적을 밀어냄', ref: 'LoL 렉사이 땅굴 · 스타크래프트 저그 잠복', fx: '들어간 자리에 흙 고리와 구멍, 땅속으로 흙더미 줄이 움직이고, 나올 때 흙 분수가 솟는다.', play: { fx: [{ kind: 'burrow', at: 'self', r: 60 }, { kind: 'burrow', at: 'front', d: 160, r: 70, delay: 0.9 }], move: 'dash', dist: 160, self: ['hide', 'ghost'], selfT: 1 } },
    spc: { name: '개미 부르기', icon: '📯', type: '소환', cd: 16, desc: '일개미 4마리를 불러 5초 동안 가까운 적을 쫓아 물게 한다.', awake: '6마리', ref: 'WoW 흑마법사 임프 · 브롤스타즈 넬리 곰', fx: '땅에서 개미들이 원을 그리며 솟아나 더듬이를 깜빡이고, 표적에게 줄지어 달려간다.', play: { fx: [{ kind: 'antcall', at: 'self', r: 70 }], react: ['cut'], reactT: 2 } },
    ult: { name: '개미 떼 행진', icon: '🌊', type: '넓은 띠 · 밀어내기', desc: '앞쪽 넓은 띠로 개미 강물이 3초 흘러가며 맞은 적을 밀어내고 지속 피해.', awake: '강물이 두 줄', ref: 'LoL 아지르 황제의 진영(병사 벽)', fx: '수백 마리 개미가 강물처럼 흐르는 갈색 띠가 앞으로 뻗고, 끝에서 흙먼지가 인다.', play: { fx: [{ kind: 'antriver', len: 420, half: 0.45 }, { kind: 'antriver', len: 420, half: 0.45, delay: 0.8 }], react: ['push', 'cut'], all: true } },
    strong: '지네(여럿이라 하나만 감아서는 부족), 거미(그물에 일개미만 걸림).', weak: '사마귀(범위 베기에 일개미가 한꺼번에 쓸림), 나비(혼란에 행렬이 흩어짐).',
    look: '머리·가슴·배 세 덩이가 가는 허리로 이어진 몸. 꺾인 더듬이, 큰 머리와 큰턱. 걸을 때 더듬이로 땅을 두드린다.',
    motion: '작은 개미 입자(점 두 개짜리)가 공통. 소환·행진 때 개미가 줄지어 흐른다.',
    species: ['v3:wangant', 'v3:armyant', 'v3:leafant', 'v3:bulldog', 'v3:fireant'],
  },
  {
    id: 'spider', name: '거미', icon: '🕷️', color: 0x7a6ad8, color2: 0xffd23f,
    seat: '중거리 제어 · 끌어와 묶기·덫', cc: '묶기·끌어오기', stages: ['새끼 거미', '거미', '각성'],
    trait: { name: '독니', icon: '🦷', desc: '물면 0.5초 마비(같은 적은 3초에 한 번).', ref: 'LoL 엘리스 · WoW 도적 신경 마비 독', fx: '물 때 송곳니에서 보라 빛이 번쩍, 마비된 적 몸에 전기 같은 떨림.' },
    atk: { name: '줄 쏘기', icon: '🧵', type: '투사체 · 끌어오기', cd: 9, desc: '줄을 쏘아 맞은 적을 끌어당긴다.', awake: '두 번 연속', ref: 'WoW 죽음의 기사 죽음의 손아귀 · LoL 블리츠크랭크 로켓 손', fx: '반짝이는 실이 곧게 뻗었다가 팽팽하게 당겨지며, 끌려온 적 뒤로 실 가닥이 날린다.', from: '거미 줄 쏘기', play: { real: { sp: 'orbspider', kind: 'main', form: 'silk' } } },
    def: { name: '덫줄', icon: '〰️', type: '감속 덫', cd: 11, desc: '3초 동안 몸 뒤로 끈끈한 줄을 남겨 밟은 적이 느려진다.', awake: '줄을 밟은 적이 묶임', ref: 'WoW 사냥꾼 타르 덫 · LoL 싱드 독 흔적', fx: '꼬리 뒤로 은빛 실이 지그재그로 깔리고, 밟힌 곳에서 실이 들러붙는다.', from: '거미 덫줄', play: { real: { sp: 'orbspider', kind: 'main', form: 'trail' } } },
    spc: { name: '둥근 그물', icon: '🕸️', type: '지형 · 묶기', cd: 10, desc: '앞에 그물을 쳐 걸린 적을 묶는다(최대 2개).', awake: '그물에 걸린 적에게 피해', ref: 'WoW 사냥꾼 얼음 덫 · LoL 케이틀린 덫', fx: '둥근 그물이 바퀴살부터 그려지고 나선 실이 감긴다. 걸린 적 둘레에 실 고치.', from: '거미 둥근 그물', play: { real: { sp: 'orbspider', kind: 'main', form: 'orb' } } },
    ult: { name: '거미줄 감옥', icon: '🔒', type: '넓은 범위 · 묶기', desc: '넓은 둥근 그물을 치고 안의 적을 모두 2초 묶는다.', awake: '묶인 적에게 독 피해', ref: 'WoW 사냥꾼 얼음 덫 + LoL 베인 벽꿍(넓게)', fx: '하늘에서 큰 그물이 내려앉아 바닥을 덮고, 묶인 적마다 고치가 생긴다.', from: '거미 필살기', play: { real: { sp: 'orbspider', kind: 'ult' } } },
    strong: '잠자리(그물에 걸리면 날지 못함), 사마귀(묶이면 매복이 소용없음).', weak: '개미(일개미만 걸림), 벌(멀리서 쏨).',
    look: '둥근 배, 여덟 개의 다리가 몸 양옆으로 크게 뻗는다. 눈이 여러 개 반짝인다. 걸을 때 다리가 번갈아 길게 움직인다.',
    motion: '실·그물이 공통. 종마다 실 색(황금·은·흰)과 실 굵기가 다르다.',
    species: ['orbspider', 'gardenspider', 'jumper', 'wolfspider', 'widow'],
  },
  {
    id: 'butterfly', name: '나비', icon: '🦋', color: 0xe07ad8, color2: 0x7ad8ff,
    seat: '원거리 방해 · 가루 장판·홀리기·팔랑 회피', cc: '혼란·매혹', stages: ['애벌레', '나비', '각성'],
    trait: { name: '인분 날개', icon: '✨', desc: '나비의 기술에 맞거나 나비를 문 적은 1.5초 혼란(조작 방향이 조금 흔들리고 기술 조준이 빗나감). 혼란은 나비만 거는 상태다.', ref: '포켓몬 혼란 상태 · WoW 도적 실명 가루(Blind)', fx: '혼란에 걸린 적 머리 위로 반짝이 가루가 빙빙 돌고, 몸이 살짝 갈지자로 흔들린다.' },
    atk: { name: '인분 흩뿌리기', icon: '🌫️', type: '앞쪽 장판 · 지속 피해', cd: 9, desc: '앞쪽 넓은 부채꼴에 반짝이는 가루 구름을 3초 남긴다. 안의 적은 지속 피해 + 혼란.', awake: '구름 1.5배', ref: 'WoW 마법사 눈보라(Blizzard) · LoL 카시오페아 독 안개', fx: '날개를 한 번 크게 접었다 펴며 금·분홍 반짝이 가루가 부채꼴로 퍼지고, 천천히 반짝이며 가라앉는다.', play: { fx: [{ kind: 'powder', r: 200, half: 0.75 }], react: ['confuse', 'poison'], all: true, reactT: 3 } },
    def: { name: '팔랑 비행', icon: '🪽', type: '회피', cd: 11, desc: '1.5초 동안 지그재그로 날며 몸 충돌을 무시하고, 기술 피해를 절반만 받는다.', awake: '끝날 때 자리에 가루 구름', ref: 'WoW 도적 회피(Evasion)', fx: '날개 잔상이 지그재그로 남고, 꺾일 때마다 가루가 한 줌씩 흩날린다.', play: { move: 'zig', dist: 170, fx: [{ kind: 'flutter', at: 'self' }], self: ['fly', 'ghost'], selfT: 1.5 } },
    spc: { name: '꽃향기 홀리기', icon: '💗', type: '제어 · 매혹', cd: 13, desc: '앞의 적 하나를 1.5초 동안 나비 쪽으로 천천히 걸어오게 만든다. 가루 구름 안으로 끌어들이는 연계가 핵심.', awake: '두 마리', ref: 'LoL 아리 매혹(E) · 이블린 매혹', fx: '분홍 꽃가루 띠가 적에게 이어지고, 적 머리 위에 하트 꽃이 피어 천천히 끌려온다.', play: { fx: [{ kind: 'charm', at: 'tgt' }], react: ['charm'], reactT: 1.5 } },
    ult: { name: '나비 떼 폭풍', icon: '🌪️', type: '넓은 범위 · 지속 피해 + 혼란', desc: '넓은 범위에 나비 떼가 휘몰아쳐 4초 동안 지속 피해 + 혼란.', awake: '폭풍이 나를 따라다님', ref: 'WoW 드루이드 태풍(Hurricane) · LoL 피들스틱 까마귀 폭풍', fx: '수십 마리 색색 나비가 큰 원으로 회오리치고, 날갯짓마다 가루가 반짝인다.', play: { fx: [{ kind: 'bstorm', at: 'front', d: 140, r: 220 }], react: ['confuse', 'cut'], all: true, reactT: 4 } },
    strong: '딱정벌레·사마귀처럼 정면 싸움 계열. 혼란과 매혹으로 붙지 못하게 한다.', weak: '지네(감기면 회피가 소용없음), 잠자리(빠르게 파고듦). 체력이 가장 낮다.',
    look: '몸보다 훨씬 큰 날개 네 장(앞날개·뒷날개)이 위에서 보인다. 날갯짓이 느리고 크며, 날개를 접으면 폭이 좁아졌다 펴지면 넓어진다. 끝이 둥근 곤봉 더듬이(나방은 깃털 더듬이).',
    motion: '반짝이는 인분 가루가 공통. 애벌레 → 번데기 → 나비로 바뀔 때 번데기 연출을 다른 계열보다 크게 보여 준다(탈바꿈이 가장 큰 계열).',
    species: ['v3:swallow', 'v3:monarch', 'v3:owlbf', 'v3:morpho', 'v3:tussock'],
  },
];

// ---------- 종 ----------
const S = (o: V3Species) => o;

export const V3_SPECIES: V3Species[] = [
  // 딱정벌레
  S({ id: 'rhino', fam: 'beetle', name: '장수풍뎅이', base: true, instinct: { name: '수액 자리싸움', desc: '큰 먹이 근처에서는 받는 피해 −25%, 다가온 적을 밀어냄' }, lookFrom: 'rhino', theme: { pal: [0xd8b88a, 0xffe0a0, 0xffffff], bit: 'sand', motion: 'heavy', tag: '흙먼지가 일고 땅이 울린다' }, gfx: '적갈색 광택 등에 머리 위 큰 외뿔. 뿔 끝이 두 갈래.', fact: '참나무 수액을 두고 다른 수컷과 뿔로 밀어내기 싸움을 한다.' }),
  S({ id: 'herc', fam: 'beetle', name: '헤라클레스장수풍뎅이', swap: 'spc', skill: { name: '묵직한 착지', icon: '🪨', type: '범위 제어 · 기절', cd: 14, desc: '날아올랐다 내려앉으며 주변 적을 밀어내고 0.5초 기절시킨다. (퍼 올리기 대신)', ref: 'WoW 전사 영웅의 도약 · 오버워치 윈스턴 점프 팩', fx: '금빛 갑옷 조각이 원형으로 튀고, 내려앉는 순간 땅 울림 고리가 두 겹 퍼진다.', from: '장수풍뎅이 보조 기술', play: { real: { sp: 'herc', kind: 'sub', sub: 'thud' } } }, instinct: { name: '집게 뿔', desc: '뿔 들이받기·필살기에 맞은 적을 위아래 뿔로 잡아 0.6초 더 들어 올림' }, lookFrom: 'herc', theme: { pal: [0xffc83a, 0xfff0a0, 0xffffff], bit: 'shard', motion: 'heavy', tag: '황금빛 갑옷 조각이 튀고 땅이 크게 울린다' }, gfx: '노란 앞날개에 검은 점, 위아래로 긴 집게 뿔.', fact: '세계에서 가장 긴 딱정벌레 중 하나. 뿔이 몸길이의 절반을 넘는다.' }),
  S({ id: 'kingstag', fam: 'beetle', name: '왕사슴벌레', swap: 'atk', skill: { name: '가위 닫기', icon: '✂️', type: '앞쪽 범위', cd: 12.5, desc: '큰턱으로 앞쪽 넓은 범위를 순간적으로 물어 피해. (돌진 대신)', awake: '두 번 연속', ref: 'WoW 드루이드 휘둘러치기(Swipe)', fx: '큰턱이 닫히는 순간 X자 호박빛 섬광과 불꽃이 튄다.', from: '사슴벌레 가위 닫기', play: { real: { sp: 'kingstag', kind: 'main', form: 'scissor' } } }, instinct: { name: '오래 사는 몸', desc: '판마다 한 번, 쓰러질 피해를 체력 1로 버팀' }, lookFrom: 'kingstag', theme: { pal: [0xffb85a, 0xffe0b0, 0xffffff], bit: 'mote', motion: 'glow', tag: '호박빛 광택이 은은하게 번진다' }, gfx: '검은 광택 몸, 안쪽으로 둥글게 휜 굵은 큰턱.', fact: '어른벌레로 겨울을 나며 몇 해를 산다.' }),
  S({ id: 'sawstag', fam: 'beetle', name: '톱사슴벌레', swap: 'spc', skill: { name: '집어 던지기', icon: '🤾', type: '제어 · 던지기', cd: 12.5, desc: '앞의 적을 잡아 뒤로 던진다. 떨어진 적은 0.5초 기절. (퍼 올리기 대신)', awake: '던진 적이 다른 적과 부딪히면 둘 다 피해', ref: 'LoL 싱드 내던지기(Fling)', fx: '잡을 때 톱니 자국을 따라 주황 불꽃, 던진 적이 호를 그리며 날아간다.', from: '사슴벌레 집어 던지기', play: { real: { sp: 'sawstag', kind: 'main', form: 'throw' } } }, instinct: { name: '톱니 큰턱', desc: '집기 거리 +40%, 잡은 적을 끌어당김' }, lookFrom: 'sawstag', theme: { pal: [0xff8a4a, 0xffc08a, 0xffffff], bit: 'shard', motion: 'zigzag', tag: '톱니 자국을 따라 주황 불꽃이 튄다' }, gfx: '붉은 갈색 몸, 톱니가 촘촘한 활 모양 큰턱.', fact: '큰턱 안쪽에 톱니가 줄지어 있다.' }),
  S({ id: 'genji', fam: 'beetle', name: '애반딧불이', swap: 'atk', skill: { name: '빛 신호', icon: '✨', type: '투사체 · 표시', cd: 9, desc: '빛 구슬을 던져 피해, 맞은 적을 5초 표시(받는 피해 +20%). (돌진 대신) 몸이 약한 딱정벌레라 멀리서 싸운다.', awake: '구슬 2개', ref: 'WoW 사냥꾼 사냥꾼의 징표(Hunter’s Mark)', fx: '연두 빛 구슬이 꼬리를 끌며 날아가 맞은 적 머리 위에 빛 표시가 깜빡인다.', from: '반딧불이 빛 신호', play: { real: { sp: 'genji', kind: 'main', form: 'signal' } } }, instinct: { name: '물가 태생', desc: '웅덩이 안에서 체력 회복' }, lookFrom: 'genji', theme: { pal: [0xd8ff5a, 0xf6ff8a, 0xffffff], bit: 'mote', motion: 'glow', tag: '연두 빛 알갱이' }, gfx: '검은 몸에 주황 앞가슴, 배 끝 두 마디가 연두로 빛난다.', fact: '반딧불이도 딱정벌레 무리다. 애벌레는 물속에서 다슬기를 먹는다.' }),

  // 지네
  S({ id: 'v3:wangjine', fam: 'centipede', name: '왕지네', base: true, isNew: true, instinct: { name: '단단한 마디', desc: '몸 가운데를 물려도 피해 −20%' }, look: L.wangjine, theme: { pal: [0xff4a2a, 0xffd23f, 0xffffff], bit: 'drop', motion: 'zigzag', tag: '붉은 독턱 섬광과 보라 독방울' }, gfx: '검붉은 광택 등판, 붉은 머리, 마디마다 노란 다리 한 쌍. 머리 앞에 검은 갈고리 독턱.', fact: '우리나라에서 가장 큰 지네. 첫 다리 한 쌍이 독턱으로 바뀌었다.' }),
  S({ id: 'v3:grima', fam: 'centipede', name: '그리마', swap: 'atk', isNew: true, skill: { name: '긴 다리 채찍', icon: '🎐', type: '앞쪽 범위 · 빠름', cd: 5, desc: '긴 다리들로 앞쪽을 빠르게 두 번 후려친다. 피해는 작지만 재사용이 짧다. (독턱 찌르기 대신)', awake: '세 번', ref: 'WoW 수도사 연속 발차기 · LoL 리븐 부서진 날개', fx: '희끄무레한 긴 다리 잔상이 부채처럼 두 번 펼쳐지고, 끝마다 흰 줄이 튄다.', play: { fx: [{ kind: 'combo', r: 150, half: 0.9 }, { kind: 'combo', r: 150, half: 0.9, delay: 0.2, aoff: 0.25 }], react: ['cut'] } }, instinct: { name: '아주 빠른 발', desc: '기본 속도 +8%, 대신 체력 −10%' }, look: L.grima, theme: { pal: [0xe8e0d0, 0xc8c0ff, 0xffffff], bit: 'hair', motion: 'swift', tag: '긴 다리 잔상이 부채처럼 펼쳐진다' }, gfx: '잿빛 노란 몸에 검은 세로줄, 몸보다 긴 다리 15쌍이 줄무늬로 뻗는다.', fact: '집에서 바퀴벌레를 잡아먹는 익충. 다리가 길어 아주 빠르다.' }),
  S({ id: 'v3:gigantea', fam: 'centipede', name: '아마존왕지네', swap: 'spc', isNew: true, skill: { name: '치켜들어 덮치기', icon: '🦇', type: '도약 · 들어 올리기', cd: 12, desc: '머리를 높이 치켜들고 앞으로 덮쳐 적을 잡아 1초 들어 올린다(기절). (휘감기 대신)', awake: '들어 올린 적을 내리꽂아 주변 피해', ref: '오버워치 둠피스트 파멸의 일격 · WoW 드루이드 덮치기(Pounce)', fx: '머리가 위로 솟는 그림자가 커졌다가 떨어지며 붉은 착지 고리, 들린 적 둘레에 다리 자국.', play: { move: 'dash', dist: 100, fx: [{ kind: 'land', at: 'front', d: 110, r: 80, delay: 0.25 }], react: ['lift', 'stun'], reactT: 1 } }, instinct: { name: '거대한 몸', desc: '체력 +10%, 속도 −5%' }, look: L.gigantea, theme: { pal: [0xff7a2a, 0xffc08a, 0xffffff], bit: 'ember', motion: 'heavy', tag: '주황 불씨와 무거운 착지' }, gfx: '적갈색 몸에 검은 마디 테두리, 주황 다리. 다른 지네보다 몸이 한 단계 크다.', fact: '동굴 천장에 매달려 날아가는 박쥐를 잡는다고 알려졌다.' }),
  S({ id: 'v3:milli', fam: 'centipede', name: '노래기', swap: 'def', isNew: true, skill: { name: '노린내 분비', icon: '💨', type: '감속 · 중독 장판', cd: 13, desc: '몸을 말며 옆구리에서 독한 액체를 뿜어 주변 적을 2초 느리게 하고 중독시킨다. (몸 말기 대신)', awake: '액체 자국이 3초 남음', ref: 'WoW 드루이드 가시(Thorns) + 사냥꾼 폭발 덫', fx: '몸 마디마다 노란 액체가 뿜어져 둥근 얼룩이 퍼지고, 얼룩에서 김이 오른다.', play: { fx: [{ kind: 'gasburst', at: 'self', r: 130 }], react: ['slow', 'poison'], all: true, self: ['curl'], selfT: 1 } }, instinct: { name: '동그랗게 말기', desc: '체력이 30% 밑으로 떨어지면 1초 동안 저절로 몸을 말아 피해 −50%(20초에 한 번)' }, look: L.milli, theme: { pal: [0xffc83a, 0xe8f070, 0xffffff], bit: 'bubble', motion: 'drip', tag: '누런 액체 방울과 김' }, gfx: '반들반들한 검은 원통 몸에 주황 고리 무늬, 둥근 머리와 짧은 더듬이. 다리가 아주 많고 짧다.', fact: '지네와 같은 다지류지만 독턱이 없고 풀을 먹는다. 위험하면 몸을 둥글게 만다.' }),
  S({ id: 'v3:ttangjine', fam: 'centipede', name: '땅지네', swap: 'atk', isNew: true, skill: { name: '빛 점액', icon: '💧', type: '투사체 · 감속', cd: 8, desc: '빛나는 끈적한 점액을 앞으로 뱉어 피해, 맞은 적은 2초 느려지고 몸이 빛나 숨지 못한다. (독턱 찌르기 대신)', awake: '맞은 자리에 점액 웅덩이', ref: 'WoW 사냥꾼 신경독 쐐기(감속) · LoL 애쉬 일제 사격', fx: '노란빛 점액 줄기가 꼬리를 끌며 날아가고, 맞은 적 몸에 빛 얼룩이 한동안 남는다.', play: { fx: [{ kind: 'jet', len: 240 }], react: ['slow', 'mark'] } }, instinct: { name: '가는 몸', desc: '바위 옆을 스치면 0.5초 빨라짐' }, look: L.ttangjine, theme: { pal: [0xf6e86a, 0xfff8b0, 0xffffff], bit: 'mote', motion: 'glow', tag: '노란 빛 얼룩이 번진다' }, gfx: '가늘고 긴 연노랑 몸, 다리가 짧고 촘촘하다. 꼬리 쪽 마디가 약하게 빛난다.', fact: '땅속에 사는 가는 지네. 몇몇 종은 빛나는 점액을 낸다.' }),

  // 사마귀
  S({ id: 'kingmantis', fam: 'mantis', name: '왕사마귀', base: true, instinct: { name: '기도 자세', desc: '웅크리고 1초 뒤 다음 낫 베기 1.5배' }, lookFrom: 'kingmantis', theme: { pal: [0xd8ff9a, 0xb8ff7a, 0xffffff], bit: 'leaf', motion: 'swift', tag: '연두 칼날과 풀잎' }, gfx: '연두 몸, 큰 세모 머리, 가시가 줄지은 접힌 낫.', fact: '우리나라에서 가장 큰 사마귀.' }),
  S({ id: 'widemantis', fam: 'mantis', name: '넓적배사마귀', swap: 'atk', skill: { name: '연속 베기', icon: '⚔️', type: '짧은 범위 3연타', cd: 9, desc: '짧은 범위를 3번 연달아 벤다. 3타째는 꼬리 급소 판정. (넓게 베기 대신)', awake: '마지막 타격에 0.5초 기절', ref: 'LoL 리븐 부서진 날개 · WoW 수도사 연속 발차기', fx: '3연타마다 풀잎 회오리가 감기고, 마지막 타격에 흰 칼날이 크게 번쩍.', from: '사마귀 연속 베기', play: { real: { sp: 'widemantis', kind: 'main', form: 'combo' } } }, instinct: { name: '버티기', desc: '웅크리는 동안 받는 피해가 더 줄고, 맞으면 반격' }, lookFrom: 'widemantis', theme: { pal: [0x8aff6a, 0xd8ffb0, 0xffffff], bit: 'leaf', motion: 'spin', tag: '3연타마다 풀잎 회오리가 감긴다' }, gfx: '배가 넓적한 초록 몸, 앞날개에 흰 점.', fact: '배가 넓고 앞날개에 흰 무늬가 있다.' }),
  S({ id: 'smallmantis', fam: 'mantis', name: '좀사마귀', swap: 'atk', skill: { name: '찌르기', icon: '📍', type: '긴 직선', cd: 10, desc: '앞으로 긴 직선을 찔러 높은 피해. 폭은 좁다. (넓게 베기 대신)', awake: '2마리까지 관통', ref: 'LoL 야스오 강철 폭풍(Q)', fx: '마른 풀빛 직선 궤적이 번개처럼 짧게 그어지고 아주 빠른 잔상이 남는다.', from: '사마귀 찌르기', play: { real: { sp: 'smallmantis', kind: 'main', form: 'stab' } } }, instinct: { name: '작은 몸', desc: '몸이 가늘어 맞히기 어렵고 빠름, 체력 −10%' }, lookFrom: 'smallmantis', theme: { pal: [0xe8d890, 0xfff4c8, 0xffffff], bit: 'leaf', motion: 'swift', tag: '마른 풀빛, 아주 빠른 잔상' }, gfx: '갈색·잿빛 가는 몸, 낫 안쪽에 검은 무늬.', fact: '작고 날렵해 풀숲 아래쪽에서 사냥한다.' }),
  S({ id: 'orchid', fam: 'mantis', name: '난초사마귀', swap: 'spc', skill: { name: '꽃 흉내 미끼', icon: '🌸', type: '유인 · 묶기', cd: 12, desc: '꽃잎 미끼를 놓아 닿은 적을 1초 묶는다. (위장 대신)', ref: 'LoL 샤코 깜짝 상자 · WoW 사냥꾼 얼음 덫', fx: '분홍 꽃 한 송이가 피어나고, 닿은 적 둘레로 꽃잎이 감긴다.', from: '공용 가짜 먹이', play: { real: { sp: 'orchid', kind: 'sub', sub: 'bait' } } }, instinct: { name: '꽃 흉내', desc: '웅크려 있으면 봇 눈에 먹이처럼 보이고, 다가온 적에게 첫 공격이 치명타(2배)' }, lookFrom: 'orchid', theme: { pal: [0xff9ad8, 0xffe0f0, 0xffffff], bit: 'petal', motion: 'glow', tag: '분홍 꽃잎이 흩날리고 꽃향기처럼 빛난다' }, gfx: '흰 분홍 몸, 다리가 꽃잎처럼 넓적하다.', fact: '난초꽃을 닮아 꽃에 온 곤충을 잡는다.' }),
  S({ id: 'ghost', fam: 'mantis', name: '유령사마귀', swap: 'def', skill: { name: '마른 잎 죽은 척', icon: '🍂', type: '무적 · 표적 해제', cd: 18, desc: '2초 동안 멈추고 무적, 적의 표적에서 빠진다. (날개 펼쳐 위협 대신)', ref: 'WoW 사냥꾼 죽은 척하기(Feign Death)', fx: '몸이 갈색으로 바래며 마른 잎이 흩어지고, 보랏빛 잔상만 남는다.', from: '사슴벌레 죽은 척', play: { real: { sp: 'ghost', kind: 'sub', sub: 'playdead' } } }, instinct: { name: '마른 잎', desc: '웅크리면 잘 안 보임(낙엽 숲에서는 더 빨리)' }, lookFrom: 'ghost', theme: { pal: [0xc8b8ff, 0xe8e0ff, 0xffffff], bit: 'leaf', motion: 'phantom', tag: '마른 잎이 흩어지고 보랏빛 잔상이 남는다' }, gfx: '마른 잎 같은 갈색 몸, 머리에 잎 모양 돌기.', fact: '몸 전체가 마른 잎을 닮았다.' }),

  // 잠자리
  S({ id: 'giantdf', fam: 'dragonfly', name: '장수잠자리', base: true, instinct: { name: '큰 날개', desc: '질주할 때 줄어드는 길이 −50%' }, lookFrom: 'giantdf', theme: { pal: [0x7ad87a, 0xffd23f, 0xffffff], bit: 'mote', motion: 'swift', tag: '큰 날개 바람' }, gfx: '검정·노랑 띠 긴 몸, 초록 겹눈.', fact: '우리나라에서 가장 큰 잠자리.' }),
  S({ id: 'emperor', fam: 'dragonfly', name: '왕잠자리', swap: 'spc', skill: { name: '겹눈', icon: '👁️', type: '정보 · 강화', cd: 15, desc: '3초 동안 주변 적의 위치와 기술 예고를 보여 주고, 주는 피해 +15%. (낚아채기 대신)', ref: '오버워치 위도우메이커 적외선 투시', fx: '눈에서 푸른 원형 파동이 겹겹이 퍼지고, 보이는 적 둘레에 푸른 테두리.', from: '잠자리 보조 기술', play: { real: { sp: 'emperor', kind: 'sub', sub: 'compound' } } }, instinct: { name: '영역 순찰', desc: '한 구역에 머물면 그 안의 적에게 주는 피해 +20%' }, lookFrom: 'emperor', theme: { pal: [0x5ab8ff, 0xb0e8ff, 0xffffff], bit: 'shard', motion: 'spin', tag: '푸른 원형 궤적이 겹겹이' }, gfx: '연두 가슴, 하늘색 띠 배.', fact: '연못 위를 정해진 길로 순찰한다.' }),
  S({ id: 'redDf', fam: 'dragonfly', name: '고추잠자리', swap: 'atk', skill: { name: '맴돌기', icon: '🔄', type: '주변 연속 타격', cd: 10, desc: '주변을 빠르게 원을 그리며 연속으로 친다. (급강하 대신)', awake: '원 안의 적이 느려짐', ref: 'LoL 마스터 이 알파 스트라이크(작게) · WoW 전사 소용돌이(Whirlwind)', fx: '붉은 꼬리 잔상이 원을 그리고 불씨가 흩어진다.', from: '잠자리 맴돌기', play: { real: { sp: 'redDf', kind: 'main', form: 'circle' } } }, instinct: { name: '앉아서 쉬기', desc: '웅크려 있으면 기술 재사용 시간이 두 배로 빨리 참' }, lookFrom: 'redDf', theme: { pal: [0xff5a3a, 0xffa060, 0xffe0a0], bit: 'ember', motion: 'swift', tag: '붉은 꼬리 잔상과 불씨' }, gfx: '온몸이 새빨갛다.', fact: '가을 들판을 무리 지어 난다.' }),
  S({ id: 'damsel', fam: 'dragonfly', name: '실잠자리', swap: 'def', skill: { name: '살짝 비키기', icon: '🌀', type: '회피', cd: 8, desc: '옆으로 짧게 굴러 자리를 피하고, 다음 물기 피해 +50%. (짧은 비행 대신)', ref: 'WoW 수도사 구르기(Roll)', fx: '가느다란 청록 잔상이 옆으로 비껴 남는다.', from: '공용 구르기', play: { real: { sp: 'damsel', kind: 'sub', sub: 'roll' } } }, instinct: { name: '가는 몸', desc: '휘감기·묶임에 갇혀도 한 번 빠져나감(20초에 한 번)' }, lookFrom: 'damsel', theme: { pal: [0x5ae8f8, 0xc8faff, 0xffffff], bit: 'mote', motion: 'phantom', tag: '가느다란 청록 잔상' }, gfx: '실처럼 가는 청록 몸, 앉을 때 날개를 접는다.', fact: '몸이 실처럼 가늘다.' }),
  S({ id: 'v3:calopteryx', fam: 'dragonfly', name: '물잠자리', swap: 'atk', isNew: true, skill: { name: '물수제비', icon: '🪨', type: '연속 도약', cd: 9, desc: '물수제비처럼 짧게 세 번 튀어 내려앉으며 앉는 자리마다 작은 피해. 마지막 착지는 0.3초 기절. (급강하 대신)', awake: '다섯 번', ref: 'WoW 전사 영웅의 도약(짧게 세 번)', fx: '앉는 자리마다 물결 고리가 하나씩 퍼지고 검은 날개가 펄럭인다. 세 번째 고리가 가장 크다.', play: { move: 'skip', dist: 210, fx: [{ kind: 'land', at: 'front', d: 70, r: 50, delay: 0.1 }, { kind: 'land', at: 'front', d: 140, r: 55, delay: 0.35 }, { kind: 'land', at: 'front', d: 210, r: 75, delay: 0.6 }], react: ['cut', 'stun'], reactT: 0.3 } }, instinct: { name: '물가의 춤', desc: '웅덩이 근처에서 질주 속도 +15%' }, look: L.calopteryx, theme: { pal: [0x3ae8a8, 0xb0ffe0, 0xffffff], bit: 'drop', motion: 'phantom', tag: '물결 고리와 검은 날개 잔상' }, gfx: '금속빛 초록 몸에 검은 날개 네 장. 날 때 나비처럼 날개를 천천히 친다.', fact: '맑은 개울에 살며, 검은 날개를 펼쳐 춤추듯 난다.' }),

  // 벌
  S({ id: 'hornet', fam: 'bee', name: '장수말벌', base: true, instinct: { name: '벌집 습격', desc: '꿀벌 종에게 주는 피해 +30%' }, lookFrom: 'hornet', theme: { pal: [0xffb020, 0xfff0a0, 0xffffff], bit: 'shard', motion: 'zigzag', tag: '노란 번개 같은 독침' }, gfx: '주황 머리, 노랑·검정 띠 배, 굵은 독침.', fact: '세계에서 가장 큰 말벌.' }),
  S({ id: 'honeybee', fam: 'bee', name: '양봉꿀벌', swap: 'atk', skill: { name: '열 공', icon: '🔥', type: '걸어 두는 지속 피해', cd: 12, desc: '벌들이 적 하나를 둘러싸 열로 3초 지속 피해. (독침 연사 대신)', awake: '둘러싸인 적이 움직이지 못함', ref: 'WoW 흑마법사 고통(Agony)', fx: '작은 벌들이 적 둘레를 공처럼 감싸고 주황 열기가 아지랑이처럼 오른다.', from: '꿀벌 열 공', play: { real: { sp: 'honeybee', kind: 'main', form: 'heatball' } } }, instinct: { name: '꿀 저장', desc: '먹이 일부를 꿀로 모아 두었다가 체력이 낮을 때 자동으로 먹음' }, lookFrom: 'honeybee', theme: { pal: [0xffc21a, 0xfff3a0, 0xffffff], bit: 'mote', motion: 'glow', tag: '꿀빛 반짝임' }, gfx: '복슬한 갈색 가슴, 줄무늬 배.', fact: '말벌이 오면 수백 마리가 둘러싸 열로 익혀 죽인다.' }),
  S({ id: 'bumble', fam: 'bee', name: '뒤영벌', swap: 'def', skill: { name: '붕붕 진동', icon: '〰️', type: '피해 감소 · 밀어내기', cd: 12, desc: '1.5초 동안 몸을 떨어 받는 피해 −25%, 주변 적을 살짝 밀어낸다. (꿀 나누기 대신)', awake: '밀려난 적 0.3초 기절', ref: '오버워치 루시우 소리 파동 · WoW 성기사 신의 보호', fx: '노란 진동 고리가 겹겹이 퍼지고 털이 반짝이며 떨린다.', play: { fx: [{ kind: 'buzz', at: 'self', r: 110 }], react: ['push'], all: true, self: ['shield'], selfT: 1.5 } }, instinct: { name: '붕붕 진동', desc: '질주하는 동안 주변 적을 살짝 밀어냄' }, lookFrom: 'bumble', theme: { pal: [0xffe066, 0xfff8c0, 0xffffff], bit: 'mote', motion: 'spin', tag: '붕붕 떨리는 노란 털빛' }, gfx: '통통하고 털이 많은 몸, 노랑·검정 털 띠.', fact: '날개 근육을 떨어 꽃가루를 털어 낸다.' }),
  S({ id: 'potter', fam: 'bee', name: '호리병벌', swap: 'spc', skill: { name: '진흙 항아리', icon: '🏺', type: '제어 · 침묵 + 감속', cd: 14, desc: '진흙 덩이를 던져 맞은 적을 1.5초 동안 기술을 못 쓰게 하고(침묵) 느리게 한다. (경보 페로몬 대신)', awake: '맞은 적 주변에도 튐', ref: 'WoW 사제 침묵(Silence) · LoL 소라카 침묵', fx: '갈색 진흙 덩이가 호를 그리며 날아가 철퍽 터지고, 맞은 적 몸에 진흙 껍질이 씌워진다.', play: { fx: [{ kind: 'mudpot', at: 'tgt', r: 60 }], react: ['silence', 'slow'], reactT: 1.5 } }, instinct: { name: '마비 침', desc: '독침에 맞은 적이 1초 느려짐' }, lookFrom: 'potter', theme: { pal: [0xd8a868, 0x7ac8ff, 0xffffff], bit: 'drop', motion: 'drip', tag: '진흙 방울과 푸른 마비 빛' }, gfx: '가는 허리, 검은 몸에 노란 띠.', fact: '진흙으로 호리병 모양 집을 짓고 마비시킨 애벌레를 넣는다.' }),
  S({ id: 'yellowleg', fam: 'bee', name: '등검은말벌', swap: 'atk', skill: { name: '저격', icon: '🎯', type: '먼 투사체', cd: 14, desc: '멀리 큰 독침 1발. (독침 연사 대신)', awake: '맞은 적의 독이 주변 적에게 퍼짐', ref: 'WoW 사냥꾼 조준 사격(Aimed Shot)', fx: '정지 비행 조준점이 반짝인 뒤 굵은 주황 독침이 길게 날아간다.', from: '말벌 저격', play: { real: { sp: 'yellowleg', kind: 'main', form: 'snipe' } } }, instinct: { name: '정지 비행', desc: '2초 동안 질주하지 않으면 독침 사거리 +35%' }, lookFrom: 'yellowleg', theme: { pal: [0xff9a2a, 0xffe0a0, 0xffffff], bit: 'star', motion: 'glow', tag: '정지 비행 조준점이 반짝인다' }, gfx: '검은 가슴, 노란 다리, 배 끝 주황.', fact: '벌집 앞에서 정지 비행하며 꿀벌을 노린다.' }),

  // 개미
  S({ id: 'v3:wangant', fam: 'ant', name: '일본왕개미', base: true, isNew: true, instinct: { name: '큰 일개미', desc: '일개미 행렬이 3마리' }, look: L.wangant, theme: { pal: [0xe8a05a, 0xffd8a0, 0xffffff], bit: 'ant', motion: 'heavy', tag: '흙먼지와 줄지은 일개미' }, gfx: '까만 광택 몸, 큰 머리, 꺾인 더듬이. 배 마디에 잿빛 털 띠.', fact: '우리나라에서 흔히 보는 가장 큰 개미.' }),
  S({ id: 'v3:armyant', fam: 'ant', name: '군대개미', swap: 'ult', isNew: true, skill: { name: '군단 진군', icon: '🚩', type: '소환 행진', desc: '개미 12마리가 6초 동안 나를 따라 행진하며 닿는 적을 계속 문다. (개미 떼 행진 대신)', awake: '18마리', ref: 'WoW 죽음의 기사 사자의 군대(Army of the Dead)', fx: '붉은 갈색 개미 떼가 내 몸 둘레로 긴 행렬을 이루고, 지나간 자리에 개미 길이 남는다.', play: { fx: [{ kind: 'antcall', at: 'self', r: 110 }, { kind: 'antcall', at: 'self', r: 150, delay: 0.4 }], react: ['cut', 'slow'], all: true, reactT: 2 } }, instinct: { name: '사냥 행렬', desc: '먹이를 먹을 때마다 5초 동안 일개미 한 마리가 더 붙음(최대 3)' }, look: L.armyant, theme: { pal: [0xff8a3a, 0xffc08a, 0xffffff], bit: 'ant', motion: 'swift', tag: '붉은 갈색 개미 떼가 흐른다' }, gfx: '붉은 갈색 몸, 머리보다 긴 낫 모양 큰턱. 눈이 거의 없다.', fact: '집 없이 떼로 이동하며 앞길의 곤충을 모두 사냥한다.' }),
  S({ id: 'v3:leafant', fam: 'ant', name: '잎꾼개미', swap: 'def', isNew: true, skill: { name: '잎 방패', icon: '🍃', type: '정면 막기', cd: 12, desc: '3초 동안 큰 잎을 들어 앞쪽에서 오는 피해를 막는다. 옆·뒤는 못 막는다. (굴 파기 대신)', awake: '막은 피해의 30%만큼 회복', ref: '오버워치 라인하르트 방벽', fx: '머리 위로 큰 초록 잎이 부채처럼 서고, 막을 때마다 잎맥이 빛난다.', play: { fx: [{ kind: 'leafwall', at: 'head' }], self: ['shield'], selfT: 3 } }, instinct: { name: '버섯 농사', desc: '먹이를 먹으면 3초 동안 체력 회복' }, look: L.leafant, theme: { pal: [0x7ad84a, 0xd8ffa0, 0xffffff], bit: 'leaf', motion: 'glow', tag: '초록 잎 조각이 흩날린다' }, gfx: '주황 갈색 가시 돋은 몸, 톱니 큰턱으로 잎 조각을 늘 들고 다닌다.', fact: '잎을 잘라 와 버섯을 길러 먹는다.' }),
  S({ id: 'v3:bulldog', fam: 'ant', name: '불독개미', swap: 'atk', isNew: true, skill: { name: '도약 침', icon: '🦘', type: '도약 · 강한 중독', cd: 9, desc: '껑충 뛰어 앞의 적을 침으로 찔러 피해 + 4초 강한 중독. (개미산 쏘기 대신)', awake: '맞힌 뒤 한 번 더 뜀', ref: 'LoL 렝가 도약 · WoW 드루이드 야생 돌진', fx: '몸이 활처럼 튀어 오르는 잔상, 착지와 함께 침 끝에서 붉은 독이 튄다.', play: { move: 'hop', dist: 120, fx: [{ kind: 'sting', at: 'front', d: 120, delay: 0.25 }, { kind: 'land', at: 'front', d: 120, r: 50, delay: 0.25 }], react: ['poison', 'cut'] } }, instinct: { name: '점프 사냥', desc: '질주를 멈춘 뒤 1초 동안 기술 사거리 +30%' }, look: L.bulldog, theme: { pal: [0xff4a2a, 0xffb020, 0xffffff], bit: 'ember', motion: 'swift', tag: '붉은 독과 튀어 오르는 잔상' }, gfx: '검은 머리, 붉은 주황 배, 머리 앞으로 곧게 뻗은 긴 노란 큰턱. 눈이 크다.', fact: '호주의 큰 개미. 눈이 좋아 뛰어올라 침을 쏜다.' }),
  S({ id: 'v3:fireant', fam: 'ant', name: '불개미', swap: 'spc', isNew: true, skill: { name: '불개미 둥지', icon: '⛰️', type: '지형 · 장판', cd: 14, desc: '앞에 흙더미 둥지를 만든다. 4초 동안 밟은 적은 매초 따끔한 피해 + 느려짐. (개미 부르기 대신)', awake: '둥지가 둘', ref: 'WoW 죽음의 기사 죽음과 부패(Death and Decay)', fx: '흙 둔덕이 솟고 붉은 개미 점들이 들끓으며, 밟은 적 발밑에서 불씨가 튄다.', play: { fx: [{ kind: 'nest', at: 'front', d: 110, r: 100 }], react: ['slow', 'cut'], reactT: 2 } }, instinct: { name: '뗏목 뭉치기', desc: '웅덩이에서 느려지지 않음' }, look: L.fireant, theme: { pal: [0xff5a2a, 0xffa060, 0xffe0a0], bit: 'ember', motion: 'drip', tag: '붉은 개미 점이 들끓고 불씨가 튄다' }, gfx: '작고 붉은 주황 몸, 배 끝에 작은 침.', fact: '물에 잠기면 서로 엉겨 뗏목을 만든다. 쏘이면 불에 덴 듯 따갑다.' }),

  // 거미
  S({ id: 'orbspider', fam: 'spider', name: '무당거미', base: true, instinct: { name: '큰 황금 그물', desc: '그물이 1.5배 크지만 한 번에 하나만' }, lookFrom: 'orbspider', theme: { pal: [0xffd23f, 0xfff4c0, 0xffffff], bit: 'silk', motion: 'glow', tag: '황금 거미줄' }, gfx: '노랑·검정 줄무늬 긴 배, 길고 가는 다리.', fact: '노란빛이 도는 큰 그물을 친다.' }),
  S({ id: 'gardenspider', fam: 'spider', name: '왕거미', swap: 'def', skill: { name: '줄 타고 빠지기', icon: '↩️', type: '후퇴 이동', cd: 10, desc: '줄을 타듯 뒤로 빠르게 물러나며 몸 충돌이 없다. (덫줄 대신)', ref: 'WoW 사냥꾼 철수(Disengage)', fx: '은빛 실이 앞쪽에 붙어 팽팽해졌다가 몸이 뒤로 튕기듯 미끄러진다.', from: '개미귀신 뒷걸음질', play: { real: { sp: 'gardenspider', kind: 'sub', sub: 'backstep' } } }, instinct: { name: '그물 다시 짓기', desc: '그물에 적이 걸리면 재사용 시간이 바로 절반' }, lookFrom: 'gardenspider', theme: { pal: [0xf0f0ff, 0xd8c8a8, 0xffffff], bit: 'silk', motion: 'spin', tag: '은빛 실이 둥글게 감긴다' }, gfx: '둥글고 큰 갈색 배에 잎 무늬.', fact: '밤마다 그물을 새로 짓는다.' }),
  S({ id: 'jumper', fam: 'spider', name: '깡충거미', swap: 'spc', skill: { name: '껑충 덮치기', icon: '🦘', type: '도약 · 기절', cd: 10, desc: '앞의 적에게 뛰어 덮쳐 피해 + 0.8초 기절. 그물을 치지 않는 거미라 둥근 그물 대신 쓴다.', awake: '덮친 뒤 한 번 더 뜀', ref: 'LoL 렝가 도약 · 오버워치 윈스턴 점프 팩', fx: '큰 앞눈이 번쩍인 뒤 하늘색 도약 잔상, 착지 자리에 별 모양 충격.', play: { move: 'hop', dist: 130, fx: [{ kind: 'land', at: 'front', d: 130, r: 60, delay: 0.25 }], react: ['stun', 'cut'], reactT: 0.8 } }, instinct: { name: '뛰어 덮치기', desc: '줄·그물에 걸린 적에게 자동으로 뛰어 붙음' }, lookFrom: 'jumper', theme: { pal: [0x9ad8ff, 0xe0f4ff, 0xffffff], bit: 'star', motion: 'swift', tag: '큰 눈이 번쩍, 도약 잔상' }, gfx: '짧고 다부진 몸, 커다란 앞눈 두 개.', fact: '그물 없이 눈으로 보고 뛰어서 사냥한다.' }),
  S({ id: 'wolfspider', fam: 'spider', name: '늑대거미', swap: 'def', skill: { name: '새끼 흩기', icon: '🕷️', type: '분신 · 감속', cd: 13, desc: '등의 새끼거미를 흩뿌려 2초 동안 주변 적을 느리게 하고, 봇의 표적을 흐린다. (덫줄 대신)', ref: 'LoL 샤코 환각', fx: '등에서 작은 거미들이 사방으로 흩어지고 흙먼지가 원으로 인다.', play: { fx: [{ kind: 'antcall', at: 'self', r: 120 }], react: ['slow'], all: true, reactT: 2 } }, instinct: { name: '땅 사냥꾼', desc: '그물 대신 질주 속도 +10%' }, lookFrom: 'wolfspider', theme: { pal: [0xe0c898, 0xfff0d0, 0xffffff], bit: 'sand', motion: 'swift', tag: '흙먼지를 차며 달린다' }, gfx: '잿빛 갈색 털 많은 몸, 등에 줄무늬.', fact: '어미가 새끼들을 등에 업고 다닌다.' }),
  S({ id: 'widow', fam: 'spider', name: '검은과부거미', swap: 'atk', skill: { name: '독니 깨물기', icon: '🩸', type: '강한 중독', cd: 14, desc: '다음 물기에 맞은 적이 1초 마비되고 강한 독. (줄 쏘기 대신)', ref: 'WoW 도적 독살(Envenom)', fx: '송곳니에서 붉은 독이 떨어지고 검은 잔상이 남는다.', from: '거미 보조 기술', play: { real: { sp: 'widow', kind: 'sub', sub: 'venomfang' } } }, instinct: { name: '강한 독', desc: '묶인 적에게 독 피해가 계속 들어감' }, lookFrom: 'widow', theme: { pal: [0xff3a4a, 0xff9aa8, 0xffffff], bit: 'drop', motion: 'phantom', tag: '붉은 독과 검은 잔상' }, gfx: '반들반들한 검은 둥근 배에 붉은 모래시계 무늬.', fact: '아주 강한 신경독을 가진 작은 거미.' }),

  // 나비
  S({ id: 'v3:swallow', fam: 'butterfly', name: '호랑나비', base: true, isNew: true, instinct: { name: '냄새뿔', desc: '애벌레일 때 물리면 주황 냄새뿔을 내밀어 문 적을 0.5초 기절(5초에 한 번)' }, look: L.swallow, larva: cat(0x5ac83a, 0x1e1a14, 0x6ad84a), theme: { pal: [0xffe066, 0xff9ad8, 0xffffff], bit: 'scale', motion: 'glow', tag: '노랑·분홍 반짝이 가루' }, gfx: '노란 날개에 검은 줄무늬와 테두리, 뒷날개 끝에 꼬리 돌기와 푸른 점·붉은 눈무늬. 애벌레는 연두 몸에 눈알 무늬.', fact: '애벌레가 위험하면 머리에서 주황 냄새뿔을 내민다.' }),
  S({ id: 'v3:monarch', fam: 'butterfly', name: '제왕나비', swap: 'def', isNew: true, skill: { name: '쓴 독 몸', icon: '🧡', type: '반사 · 중독', cd: 13, desc: '2초 동안 나를 문 적이 피해의 40%를 돌려받고 중독된다. (팔랑 비행 대신)', awake: '돌려주는 피해 60%', ref: 'WoW 드루이드 가시(Thorns) · 전사 주문 반사', fx: '날개 테두리의 흰 점이 주황으로 빛나며 몸 둘레에 쓴 즙 방울 고리가 돈다.', play: { fx: [{ kind: 'bitter', at: 'self', r: 70 }, { kind: 'powder', at: 'self', r: 90, half: 3.1, delay: 0.3 }], self: ['bitter'], selfT: 2 } }, instinct: { name: '대이동', desc: '질주 속도 +15%, 질주 중 길이가 덜 줄어듦' }, look: L.monarch, larva: cat(0xf6f2e6, 0x1e1a14, 0xf2d24a, 'swarm'), theme: { pal: [0xff9a2a, 0xffe0a0, 0xffffff], bit: 'scale', motion: 'swift', tag: '주황 가루가 긴 꼬리를 끈다' }, gfx: '주황 날개에 굵은 검은 날개맥, 검은 테두리에 흰 점 두 줄. 애벌레는 흰·검정·노랑 띠.', fact: '애벌레 때 먹은 박주가리 독을 몸에 지녀 새가 먹지 않는다. 수천 km를 이동한다.' }),
  S({ id: 'v3:owlbf', fam: 'butterfly', name: '올빼미나비', swap: 'spc', isNew: true, skill: { name: '눈알 무늬', icon: '👀', type: '앞쪽 범위 · 움찔 + 밀어내기', cd: 12, desc: '날개를 확 펼쳐 큰 눈알 무늬로 앞의 적들을 0.6초 멈칫하게(기절) 하고 밀어낸다. 끌어오는 매혹과 반대로, 떼어 놓는 기술. (꽃향기 홀리기 대신)', awake: '멈칫 1초', ref: '오버워치 브리기테 방패 밀쳐내기 · LoL 애니 기절(짧게)', fx: '뒷날개의 커다란 노란 눈알 두 개가 화면 앞으로 확 커지며 깜빡이고, 부채꼴 바람이 적을 밀어낸다.', play: { fx: [{ kind: 'eyespot', at: 'head', r: 170 }], react: ['stun', 'push'], all: true, reactT: 0.6 } }, instinct: { name: '큰 눈', desc: '정면에서 들어온 첫 공격 피해 −50%(8초에 한 번)' }, look: L.owlbf, larva: cat(0x8a7a5a, 0x5a4a32, 0x9a8a6a, 'fuzzy'), theme: { pal: [0xffd23f, 0xd8b888, 0xffffff], bit: 'scale', motion: 'phantom', tag: '노란 눈알이 깜빡이고 갈색 잔상' }, gfx: '잿빛 갈색 날개, 뒷날개에 올빼미 눈 같은 큰 노란 눈알 무늬. 애벌레는 갈색 털 몸.', fact: '뒷날개의 눈알 무늬로 새를 놀라게 한다.' }),
  S({ id: 'v3:morpho', fam: 'butterfly', name: '모르포나비', swap: 'atk', isNew: true, skill: { name: '푸른 섬광', icon: '💠', type: '앞쪽 범위 · 눈부심', cd: 9, desc: '날개로 빛을 반사해 앞쪽 부채꼴에 피해 + 1초 눈부심(기술 조준이 흔들림). 가루 구름 대신 즉시 터지는 기술. (인분 흩뿌리기 대신)', awake: '눈부심 1.5초', ref: '오버워치 캐서디 섬광탄 · LoL 레오나 일식(작게)', fx: '금속빛 파랑 섬광이 부채꼴로 번쩍이고, 공중에 파란 별 조각이 반짝이며 흩어진다.', play: { fx: [{ kind: 'morpho', r: 200, half: 0.7 }], react: ['blind', 'cut'], all: true, reactT: 1 } }, instinct: { name: '빛 무늬', desc: '질주하면 날개 색이 바뀌어 봇이 1초 동안 놓침(10초에 한 번)' }, look: L.morpho, larva: cat(0xc83a2a, 0xf2d24a, 0xd84a2a), theme: { pal: [0x4aa8ff, 0xb0f0ff, 0xffffff], bit: 'star', motion: 'glow', tag: '금속빛 파랑 섬광과 별 조각' }, gfx: '날개 윗면이 금속처럼 빛나는 파랑, 검은 테두리에 흰 점. 날갯짓 때 파랑이 번쩍였다 어두워진다. 애벌레는 빨강·노랑.', fact: '날개 비늘의 미세 구조가 빛을 반사해 파랗게 보인다(색소가 아님).' }),
  S({ id: 'v3:tussock', fam: 'butterfly', name: '독나방', swap: 'atk', isNew: true, skill: { name: '독털 흩뿌리기', icon: '🪶', type: '앞쪽 범위 · 가려움', cd: 9, desc: '앞쪽으로 독털을 흩뿌려 맞은 적이 4초 동안 가려움(지속 피해). 혼란 대신 피해가 오래간다. (인분 흩뿌리기 대신)', awake: '가려운 적이 물면 다시 가려움', ref: 'WoW 흑마법사 부패(Corruption)', fx: '크림색 가는 털이 바늘처럼 부채꼴로 날아가고, 맞은 적 몸에 털이 박혀 떨린다.', play: { fx: [{ kind: 'hairs', r: 190, half: 0.6 }], react: ['itch', 'poison'], all: true, reactT: 4 } }, instinct: { name: '독털 몸', desc: '나를 문 적이 2초 가려움' }, look: L.tussock, larva: cat(0x3a3020, 0xff6a3a, 0xe8d090, 'fuzzy'), theme: { pal: [0xfff0b0, 0xd8b870, 0xffffff], bit: 'hair', motion: 'drip', tag: '크림색 독털이 흩날린다' }, gfx: '크림빛 복슬한 몸에 깃털 더듬이, 둥글고 작은 날개. 애벌레는 검은 몸에 주황 털 뭉치.', fact: '나방도 나비 무리다. 애벌레와 어른벌레의 털에 독이 있어 닿으면 가렵다.' }),
];

export const V3_FAMILY = Object.fromEntries(V3_FAMILIES.map((f) => [f.id, f])) as Record<V3FamId, V3Family>;
export const V3_BY_ID = new Map(V3_SPECIES.map((s) => [s.id, s]));

/** 종이 실제로 쓰는 4칸(바뀐 칸은 종 기술) */
export function v3Kit(sp: V3Species): Record<V3Slot, V3Skill & { mine?: boolean }> {
  const F = V3_FAMILY[sp.fam];
  const k = { atk: F.atk, def: F.def, spc: F.spc, ult: F.ult } as Record<V3Slot, V3Skill & { mine?: boolean }>;
  if (sp.swap && sp.skill) k[sp.swap] = { ...sp.skill, mine: true };
  return k;
}

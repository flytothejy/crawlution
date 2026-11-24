import { V3_BY_ID } from '../shared/v3';
// 종별 연출 테마: 같은 계열 기술이라도 종마다 색·입자·모션이 다르다.
// base: 계열 대표 종(지금 연출 그대로). 나머지 종은 pal 색으로 기술 색을 바꾸고, bit 입자와 motion 연출을 더한다.
// pal: [주색, 보조색(밝게), 강조색] — 빛·궤적에 쓰이므로 모두 밝은 색이어야 한다.

/** 입자 모양 */
export type FxBit = 'dot' | 'petal' | 'leaf' | 'shard' | 'drop' | 'mote' | 'ember' | 'sand' | 'silk' | 'star' | 'bubble' | 'paper' | 'ant' | 'scale' | 'hair';
/** 기술을 쓸 때 몸에 붙는 연출
 * heavy: 땅 울림·먼지 고리 / swift: 머리 잔상 + 속도선 / phantom: 흐린 잔상이 길게 남음
 * spin: 머리 주변을 도는 입자 / glow: 부드러운 빛무리 / zigzag: 번개처럼 튀는 선 / drip: 떨어지는 방울과 얼룩 */
export type FxMotion = 'heavy' | 'swift' | 'phantom' | 'spin' | 'glow' | 'zigzag' | 'drip';

export interface FxTheme {
  base?: boolean;
  pal: [number, number, number];
  bit: FxBit;
  motion: FxMotion;
  /** 한 줄 설명(도감·기획서용) */
  tag: string;
}

export const FX_THEMES: Record<string, FxTheme> = {
  // 장수풍뎅이
  rhino: { base: true, pal: [0xd8b88a, 0xffe0a0, 0xffffff], bit: 'sand', motion: 'heavy', tag: '흙먼지가 일고 땅이 울린다' },
  herc: { pal: [0xffc83a, 0xfff0a0, 0xffffff], bit: 'shard', motion: 'heavy', tag: '황금빛 갑옷 조각이 튀고 땅이 크게 울린다' },
  cauc: { pal: [0x9ad0ff, 0xe8f4ff, 0xffffff], bit: 'shard', motion: 'zigzag', tag: '강철빛 불꽃이 번개처럼 튄다' },
  // 사슴벌레
  flatstag: { base: true, pal: [0xffe8a0, 0xffd23f, 0xffffff], bit: 'shard', motion: 'heavy', tag: '큰턱이 닫히며 노란 불꽃' },
  kingstag: { pal: [0xffb85a, 0xffe0b0, 0xffffff], bit: 'mote', motion: 'glow', tag: '호박빛 광택이 은은하게 번진다' },
  sawstag: { pal: [0xff8a4a, 0xffc08a, 0xffffff], bit: 'shard', motion: 'zigzag', tag: '톱니 자국을 따라 주황 불꽃이 튄다' },
  giraffe: { pal: [0xff6a3a, 0xffd23f, 0xffffff], bit: 'ember', motion: 'swift', tag: '긴 큰턱이 붉은 궤적을 길게 그린다' },
  // 사마귀
  kingmantis: { base: true, pal: [0xd8ff9a, 0xb8ff7a, 0xffffff], bit: 'leaf', motion: 'swift', tag: '연두 칼날과 풀잎' },
  widemantis: { pal: [0x8aff6a, 0xd8ffb0, 0xffffff], bit: 'leaf', motion: 'spin', tag: '3연타마다 풀잎 회오리가 감긴다' },
  smallmantis: { pal: [0xe8d890, 0xfff4c8, 0xffffff], bit: 'leaf', motion: 'swift', tag: '마른 풀빛, 아주 빠른 잔상' },
  orchid: { pal: [0xff9ad8, 0xffe0f0, 0xffffff], bit: 'petal', motion: 'glow', tag: '분홍 꽃잎이 흩날리고 꽃향기처럼 빛난다' },
  ghost: { pal: [0xc8b8ff, 0xe8e0ff, 0xffffff], bit: 'leaf', motion: 'phantom', tag: '마른 잎이 흩어지고 보랏빛 잔상이 남는다' },
  // 잠자리
  giantdf: { base: true, pal: [0x7ad87a, 0xffd23f, 0xffffff], bit: 'mote', motion: 'swift', tag: '큰 날개 바람' },
  emperor: { pal: [0x5ab8ff, 0xb0e8ff, 0xffffff], bit: 'shard', motion: 'spin', tag: '푸른 원형 궤적이 겹겹이' },
  redDf: { pal: [0xff5a3a, 0xffa060, 0xffe0a0], bit: 'ember', motion: 'swift', tag: '붉은 꼬리 잔상과 불씨' },
  damsel: { pal: [0x5ae8f8, 0xc8faff, 0xffffff], bit: 'mote', motion: 'phantom', tag: '가느다란 청록 잔상' },
  // 말벌
  hornet: { base: true, pal: [0xffb020, 0xfff0a0, 0xffffff], bit: 'shard', motion: 'zigzag', tag: '노란 번개 같은 독침' },
  paperwasp: { pal: [0xf0d8a0, 0xfff4d8, 0xffffff], bit: 'paper', motion: 'swift', tag: '종잇조각이 흩날린다' },
  yellowleg: { pal: [0xff9a2a, 0xffe0a0, 0xffffff], bit: 'star', motion: 'glow', tag: '정지 비행 조준점이 반짝인다' },
  potter: { pal: [0x7ac8ff, 0xd8b888, 0xffffff], bit: 'drop', motion: 'drip', tag: '진흙 방울과 푸른 마비 빛' },
  // 노린재
  brownbug: { base: true, pal: [0xa8b850, 0xd8e870, 0xffffff], bit: 'bubble', motion: 'drip', tag: '누런 가스 거품' },
  jewelbug: { pal: [0xff7a3a, 0x3ad8c8, 0xffe066], bit: 'bubble', motion: 'glow', tag: '경고색 무지개 가스' },
  assassin: { pal: [0xff4a4a, 0xff9a9a, 0xffffff], bit: 'drop', motion: 'swift', tag: '붉은 독 방울이 튄다' },
  strider: { pal: [0x7ad0ff, 0xe8f8ff, 0xffffff], bit: 'drop', motion: 'swift', tag: '물보라와 물결 고리' },
  // 거미
  orbspider: { base: true, pal: [0xffd23f, 0xfff4c0, 0xffffff], bit: 'silk', motion: 'glow', tag: '황금 거미줄' },
  gardenspider: { pal: [0xf0f0ff, 0xd8c8a8, 0xffffff], bit: 'silk', motion: 'spin', tag: '은빛 실이 둥글게 감긴다' },
  jumper: { pal: [0x9ad8ff, 0xe0f4ff, 0xffffff], bit: 'star', motion: 'swift', tag: '큰 눈이 번쩍, 도약 잔상' },
  wolfspider: { pal: [0xe0c898, 0xfff0d0, 0xffffff], bit: 'sand', motion: 'swift', tag: '흙먼지를 차며 달린다' },
  widow: { pal: [0xff3a4a, 0xff9aa8, 0xffffff], bit: 'drop', motion: 'phantom', tag: '붉은 독과 검은 잔상' },
  // 개미귀신
  myrm: { base: true, pal: [0xd8b878, 0xe8d0a0, 0xffffff], bit: 'sand', motion: 'heavy', tag: '모래가 쏟아진다' },
  owlfly: { pal: [0xffd23f, 0xfff0a0, 0xffffff], bit: 'sand', motion: 'swift', tag: '노란 모래 섬광' },
  lacewing: { pal: [0x9ae86a, 0xd8f8b0, 0xffffff], bit: 'leaf', motion: 'phantom', tag: '찌꺼기가 흩어지고 초록 잔상' },
  // 꿀벌
  honeybee: { base: true, pal: [0xffc21a, 0xfff3a0, 0xffffff], bit: 'mote', motion: 'glow', tag: '꿀빛 반짝임' },
  nativebee: { pal: [0xff8a1c, 0xffd23f, 0xffffff], bit: 'ember', motion: 'spin', tag: '열 공 불씨가 맴돈다' },
  bumble: { pal: [0xffe066, 0xfff8c0, 0xffffff], bit: 'mote', motion: 'spin', tag: '붕붕 떨리는 노란 털빛' },
  giantbee: { pal: [0xffb84a, 0xffe8b0, 0xffffff], bit: 'star', motion: 'phantom', tag: '물결치듯 번지는 금빛' },
  // 반딧불이
  genji: { base: true, pal: [0xd8ff5a, 0xf6ff8a, 0xffffff], bit: 'mote', motion: 'glow', tag: '연두 빛 알갱이' },
  latefly: { pal: [0xe8ff7a, 0xd8b888, 0xffffff], bit: 'mote', motion: 'drip', tag: '달팽이 길처럼 빛 방울이 떨어진다' },
  unmun: { pal: [0x7affc8, 0xf6ff8a, 0xffffff], bit: 'star', motion: 'glow', tag: '숲속 별빛이 반짝인다' },
  photuris: { pal: [0xff9a3a, 0xd8ff5a, 0xffffff], bit: 'star', motion: 'phantom', tag: '주황·연두로 깜빡이는 가짜 빛' },
};

/** 3판 종: v3: 로 시작하는 새 종은 설계 데이터의 테마를 쓴다 */
export function themeOf(sp: string | undefined | null): FxTheme | null {
  if (!sp) return null;
  if (sp.startsWith('v3:')) return V3_BY_ID.get(sp)?.theme ?? null;
  return FX_THEMES[sp] ?? null;
}

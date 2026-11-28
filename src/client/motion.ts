// 몸 동작 층: 기술마다 곤충 몸에 '자세'를 입힌다(예고 → 발동 → 여운).
// 시뮬레이션 위치는 그대로 두고, 그릴 때만 높이·웅크림·늘어남·머리 들기 등을 더한다.
// 위에서 내려다보는 2D라 높이는 '그림자와 몸이 떨어지고 몸이 커지는 것'으로 보인다.

export interface Pose {
  z: number; // 몸 전체 높이(px)
  headZ: number; // 머리 쪽만 드는 높이(머리 → 4번째 마디로 줄어듦)
  stretch: number; // 몸 마디 간격 배율(1 = 그대로, <1 웅크림, >1 늘어남)
  width: number; // 몸 두께 배율(버티기·착지 눌림)
  lean: number; // 머리 쪽을 앞(+)/뒤(-)로 내미는 거리(px)
  headScale: number; // 머리 크기 배율(들면 커 보임)
  jitter: number; // 힘줄 때 떨림(px)
  wingRate: number; // 날갯짓 빠르기 배율(0 = 그대로)
  wingSpread: number; // 날개 펼침(0~1)
  legSpread: number; // 다리 벌림(0~1)
  ghost: number; // 잔상 세기(0~1)
  tilt: number; // 몸 비틀기(라디안)
  jaw: number; // 큰턱·뿔 벌림(+ 벌림, - 꽉 닫음)
  wingFold: number; // 날개를 뒤로 접어 붙임(0~1, 급강하)
  roll: number; // 옆구르기 위상(0~1 한 바퀴)
  horn: number; // 뿔·큰턱 크게 보이기(0~1)
  armL: number; // 왼쪽 낫(앞다리) 휘두름(+ 바깥으로 치켜듦, - 안쪽으로 벰)
  armR: number; // 오른쪽 낫
  armScale: number; // 낫 크게 보이기(0~1)
  wingBig: number; // 날개를 옆으로 활짝·크게 펼침(0~1, 위협)
  coil: number; // 몸을 똬리로 말기(0~1)
  wrap: number; // 몸 앞쪽으로 적을 휘감기(0~1)
  legWhip: number; // 다리를 길게 늘여 휘두름(0~1)
  legWave: number; // 다리 물결 위상
}

export const REST: Pose = { z: 0, headZ: 0, stretch: 1, width: 1, lean: 0, headScale: 1, jitter: 0, wingRate: 0, wingSpread: 0, legSpread: 0, ghost: 0, tilt: 0, jaw: 0, wingFold: 0, roll: 0, horn: 0, armL: 0, armR: 0, armScale: 0, wingBig: 0, coil: 0, wrap: 0, legWhip: 0, legWave: 0 };

type Prog = (k: number, t: number, d: number) => Partial<Pose>;

const outQ = (x: number) => 1 - (1 - x) * (1 - x);
const inQ = (x: number) => x * x;
const outB = (x: number) => {
  // 살짝 넘쳤다가 돌아오는(오버슈트) 곡선
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
const bump = (x: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** 동작 이름 → 시간(k = 0~1)에 따른 자세 */
export const PROGS: Record<string, Prog> = {
  // ---- 딱정벌레 ----
  // 돌진 예고: 몸을 뒤로 끌어 웅크리고 머리를 낮춘 채 부르르
  'windup:charge': (k) => ({ stretch: 1 - 0.28 * outQ(k), lean: -10 * outQ(k), headScale: 1 - 0.08 * k, width: 1 + 0.1 * k, jitter: 2.5 * k, legSpread: k, horn: outB(k) }),
  // 돌진: 앞으로 쭉 늘어나며 잔상
  charge: (k) => ({ stretch: 1 + 0.35 * bump(k * 1.3), lean: 10 * (1 - k), ghost: 1 - k * 0.6, headScale: 1.06, horn: 1 - inQ(clamp((k - 0.6) / 0.4)) }),
  // 가위 닫기 예고: 큰턱을 활짝 벌리고 머리를 뒤로 젖힌다
  'windup:scissor': (k) => ({ jaw: 1.25 * outB(k), lean: -8 * k, headScale: 1 + 0.08 * k, jitter: 1.5 * k, horn: outB(k) }),
  // 가위 닫기: 양쪽 큰턱을 휘둘러 꽉 닫는다(머리가 앞으로 튀어나감)
  scissor: (k) => ({ jaw: k < 0.3 ? 1.25 - 1.75 * outQ(k / 0.3) : -0.5 * (1 - (k - 0.3) / 0.7), lean: 16 * bump(Math.min(1, k * 1.6)), headScale: 1 + 0.12 * bump(k), horn: 1 - inQ(clamp((k - 0.4) / 0.6)) }),
  // 퍼 올리기 예고: 머리를 땅에 박듯 숙인다
  'windup:lift': (k) => ({ headZ: -6 * outQ(k), headScale: 1 - 0.14 * outQ(k), lean: -6 * k, stretch: 1 - 0.15 * k, jitter: 1.5 * k }),
  // 퍼 올리기: 머리가 크게 솟았다가 내려온다(뿔을 위로 휘두름)
  lift: (k) => ({ headZ: 52 * bump(k) * (k < 0.35 ? outB(k / 0.35) : 1), headScale: 1 + 0.35 * bump(k), lean: 14 * bump(k), stretch: 1 + 0.12 * bump(k), jaw: 0.6 * bump(k) }),
  // 들려서 날아감(맞은 쪽): 높이 포물선 + 몸 비틀림
  lifted: (k) => ({ z: 115 * (k < 0.45 ? outQ(k / 0.45) : 1 - inQ((k - 0.45) / 0.55)), tilt: 2.2 * k, stretch: 1 - 0.2 * bump(k), headScale: 1 + 0.2 * bump(k), ghost: 0.9 }),
  // 낚여 끌려옴(맞은 쪽): 살짝 들려 내 앞으로 미끄러진다
  yank: (k) => ({ z: 28 * bump(k), stretch: 1 - 0.2 * bump(k), ghost: 0.7, tilt: 0.6 * bump(k) }),
  // 땅에 떨어짐(맞은 쪽): 납작
  slammed: (k) => ({ width: 1 + 0.25 * (1 - k), stretch: 1 - 0.18 * (1 - k) }),
  // 버티고 밀기(2초): 다리를 넓게 벌리고 몸을 두껍게, 0.45초마다 앞으로 밀어붙임
  brace: (k, t) => {
    const ph = (t % 0.45) / 0.45;
    const shove = ph < 0.25 ? outQ(ph / 0.25) : 1 - inQ((ph - 0.25) / 0.75);
    const on = Math.min(1, t / 0.12) * Math.min(1, (1 - k) / 0.06);
    return { width: 1 + 0.2 * on, stretch: 1 - 0.12 * on, lean: (4 + 12 * shove) * on, legSpread: on, jitter: 1.2 * on, headScale: 1 + 0.05 * on };
  },
  // 묵직한 착지 예고: 깊게 웅크림
  'windup:thud': (k) => ({ stretch: 1 - 0.3 * outQ(k), width: 1 + 0.15 * k, headScale: 1 - 0.1 * k, jitter: 2 * k, legSpread: k, wingSpread: k }),
  // 점프: 빠르게 솟고, 잠깐 떠 있다가, 아주 빠르게 내리꽂힘
  jump: (k) => {
    const z = k < 0.45 ? outQ(k / 0.45) : k < 0.7 ? 1 : 1 - inQ((k - 0.7) / 0.3);
    return { z: 80 * z, stretch: 1 + 0.12 * (k > 0.7 ? (k - 0.7) / 0.3 : 0), wingSpread: 1, wingRate: 2.5, headScale: 1 + 0.08 * z };
  },
  // 착지 눌림
  land: (k) => ({ width: 1 + 0.35 * (1 - outQ(k)), stretch: 1 - 0.25 * (1 - outQ(k)), headScale: 1 - 0.1 * (1 - k), legSpread: 1 - k }),

  // 집어 던지기(던지는 쪽): 큰턱으로 물고 머리를 들어 버틴다 → 머리를 뒤로 크게 젖히며 던진다
  heft: (k) => ({ headZ: 22 * outQ(k), jaw: -0.45, lean: -6 * k, headScale: 1 + 0.12 * outQ(k), jitter: 1.5 * k, legSpread: 1, horn: 0.6 * k }),
  fling: (k) => ({ headZ: 22 + 26 * bump(Math.min(1, k * 1.8)) - 22 * k, jaw: k < 0.25 ? -0.45 + 1.3 * outQ(k / 0.25) : 0.85 * (1 - k), lean: -16 * bump(Math.min(1, k * 1.5)), headScale: 1 + 0.15 * bump(k), stretch: 1 - 0.12 * bump(k), horn: 0.6 * (1 - k) }),
  // 들려 있음(잡힌 쪽): 퍼 올리기보다 낮게 들린 채 버둥거림
  held: (k) => ({ z: 40 * outQ(Math.min(1, k * 2)), tilt: 0.25 * Math.sin(k * 30), stretch: 1 - 0.12 * k, headScale: 1 + 0.1 * k }),
  // 하늘 던지기(헤라클레스, 1초): 뿔로 집어 아주 높이 들어 올린 채 버티다가 수직으로 내리꽂힘
  skyhurl: (k) => {
    const H = 300;
    const z = k < 0.32 ? H * outQ(k / 0.32) : k < 0.8 ? H + 14 * Math.sin((k - 0.32) * 20) : H * (1 - inQ((k - 0.8) / 0.2));
    const hang = k > 0.32 && k < 0.8 ? 1 : 0;
    return { z, tilt: 0.45 * Math.sin(k * 42) * hang + (k >= 0.8 ? 1.6 * ((k - 0.8) / 0.2) : 0), stretch: 1 - 0.18 * hang, headScale: 1 + 0.12 * bump(k), jitter: 2.5 * hang, ghost: k >= 0.8 ? 1 : 0.4 };
  },
  // 하늘 던지기(던지는 쪽): 뿔을 치켜든 채 함께 날아올랐다가 같이 떨어진다
  skyjump: (k) => {
    const H = 110;
    const z = k < 0.3 ? H * outQ(k / 0.3) : k < 0.8 ? H + 8 * Math.sin((k - 0.3) * 14) : H * (1 - inQ((k - 0.8) / 0.2));
    return { z, headZ: 26 * bump(Math.min(1, k * 1.25)), horn: 1, lean: k < 0.8 ? -10 : 18 * (1 - (k - 0.8) / 0.2), wingSpread: k < 0.95 ? 1 : 0, wingRate: 3, headScale: 1 + 0.12 * bump(k), stretch: 1 + (k >= 0.8 ? 0.15 : 0) };
  },
  // 내던져짐(톱사슴벌레 연쇄): 낮은 포물선으로 빙글빙글 돌며 날아감
  thrown: (k) => ({ z: 85 * bump(k), tilt: 6.5 * k, stretch: 1 - 0.22 * bump(k), headScale: 1 + 0.15 * bump(k), ghost: 1 }),
  // 내던져짐(잡힌 쪽): 머리 위로 호를 그리며 뒤로 날아가 떨어짐
  tossed: (k) => ({ z: 40 + 45 * bump(k) - 40 * k, tilt: 3.2 * outQ(k), stretch: 1 - 0.15 * bump(k), headScale: 1 + 0.15 * bump(k), ghost: 0.8 }),

  // ---- 사마귀 ----
  // 넓게 베기: 두 낫을 바깥 높이 치켜들었다가(짧게) 앞쪽을 가로질러 크게 휩쓴다
  'windup:sweep': (k) => ({ armL: 1.4 * outB(k), armR: 1.4 * outB(k), armScale: outQ(k), lean: -8 * k, headZ: 10 * k, headScale: 1 + 0.08 * k, jitter: 1.5 * k }),
  sweep: (k) => {
    // 치켜든 자리(1.4)에서 안쪽 끝(-1.3)까지 한 번에 휩쓸고 천천히 제자리
    const a = k < 0.35 ? 1.4 - 2.7 * outQ(k / 0.35) : -1.3 + 1.3 * clamp((k - 0.5) / 0.5);
    return { armL: a, armR: a, armScale: 1 - inQ(clamp((k - 0.4) / 0.6)), lean: 14 * bump(Math.min(1, k * 1.6)), headScale: 1 + 0.1 * bump(k), headZ: 10 * (1 - k) };
  },
  // 연속 베기: 한 쪽 낫씩 번갈아(L·R), 마지막은 두 낫을 한꺼번에(X)
  slashL: (k) => ({ armL: k < 0.25 ? 1.3 * outQ(k / 0.25) : 1.3 - 2.4 * outQ(clamp((k - 0.25) / 0.35)) + 1.1 * clamp((k - 0.6) / 0.4), armScale: 0.8 * bump(k), lean: 6 * bump(k), tilt: -0.3 * bump(k) }),
  slashR: (k) => ({ armR: k < 0.25 ? 1.3 * outQ(k / 0.25) : 1.3 - 2.4 * outQ(clamp((k - 0.25) / 0.35)) + 1.1 * clamp((k - 0.6) / 0.4), armScale: 0.8 * bump(k), lean: 6 * bump(k), tilt: 0.3 * bump(k) }),
  slashX: (k) => {
    const a = k < 0.25 ? 1.5 * outQ(k / 0.25) : 1.5 - 2.9 * outQ(clamp((k - 0.25) / 0.3)) + 1.4 * clamp((k - 0.6) / 0.4);
    return { armL: a, armR: a, armScale: 1.2 * bump(k), lean: 14 * bump(k), headScale: 1 + 0.15 * bump(k), jitter: 2 * bump(k) };
  },
  // 찌르기: 두 낫을 모아 앞으로 쭉 내지른다
  thrust: (k) => ({ armL: -0.7 * bump(k), armR: -0.7 * bump(k), armScale: bump(k), lean: 22 * bump(Math.min(1, k * 1.5)), stretch: 1 + 0.2 * bump(k) }),
  // 날개 펼쳐 위협: 몸을 세우고 날개를 옆으로 활짝, 낫을 높이 치켜든다
  threat: (k) => {
    const on = outB(Math.min(1, k / 0.18)) * Math.min(1, (1 - k) / 0.2);
    return { wingBig: on, armL: 1.1 * on, armR: 1.1 * on, armScale: 0.6 * on, headZ: 14 * on, headScale: 1 + 0.12 * on, jitter: 1.2 * on, width: 1 + 0.1 * on };
  },
  // 위장·죽은 척: 몸은 그대로, 잎 그림은 렌더러가 덮는다
  camo: (k) => ({ stretch: 1 - 0.06 * Math.min(1, k * 8), legSpread: 0 }),
  playdead: (k) => ({ stretch: 1 - 0.1 * Math.min(1, k * 6), width: 1 + 0.08 * Math.min(1, k * 6), tilt: 0 }),

  // ---- 벌 ----
  // 떠서 버티기(연사·저격 동안): 몸이 살짝 떠 있고 날개가 아주 빠르다
  hover: (k) => ({ z: 18 * Math.min(1, k * 8) * Math.min(1, (1 - k) * 8), wingRate: 4, wingSpread: 1 }),
  // 한 발마다 반동: 머리가 뒤로 튕기고 몸이 움찔
  shot: (k) => ({ lean: -9 * bump(k), stretch: 1 - 0.06 * bump(k), headScale: 1 + 0.06 * bump(k) }),
  // 저격 조준: 꼼짝 않고 머리를 앞으로 내밀어 겨눔
  'windup:snipe': (k) => ({ lean: 6 * outQ(k), stretch: 1 - 0.1 * k, wingRate: 5, jitter: 0.6 * k, headScale: 1 + 0.06 * k }),
  bigshot: (k) => ({ lean: -24 * bump(Math.min(1, k * 1.5)), stretch: 1 - 0.15 * bump(k), headScale: 1 + 0.12 * bump(k), jitter: 2 * (1 - k) }),
  // 꿀 나누기: 떠올라 몸을 흔들며 꿀을 떨어뜨림
  drip: (k) => ({ z: 26 * bump(k), wingRate: 3, wingSpread: 1, width: 1 + 0.08 * Math.sin(k * 30), tilt: 0.15 * Math.sin(k * 18) }),
  // 열 공: 날개 근육을 떨어 열을 낸다(부르르)
  heat: (k) => ({ jitter: 2.5 * bump(k), wingRate: 5, width: 1 + 0.1 * bump(k), headScale: 1 + 0.06 * bump(k) }),
  // 경보: 머리를 치켜들고 날개를 세차게
  alarm: (k) => ({ headZ: 20 * bump(k), wingRate: 5, wingSpread: 1, wingBig: 0.35 * bump(k), jitter: 1.5 * bump(k), headScale: 1 + 0.12 * bump(k) }),
  // 붕붕 진동: 온몸이 빠르게 떨고 두께가 맥박치듯
  buzz: (k, t) => {
    const on = Math.min(1, t / 0.08) * Math.min(1, (1 - k) / 0.08);
    return { jitter: 3.5 * on, width: 1 + 0.15 * on * Math.abs(Math.sin(t * 40)), wingRate: 6, wingSpread: on, headScale: 1 + 0.05 * on };
  },
  // 진흙 던지기: 머리를 뒤로 젖혔다가 앞으로 휙
  lob: (k) => ({ headZ: 26 * bump(Math.min(1, k * 1.4)), lean: k < 0.45 ? -12 * outQ(k / 0.45) : -12 + 30 * outQ((k - 0.45) / 0.55) - 18 * clamp((k - 0.8) / 0.2), headScale: 1 + 0.1 * bump(k) }),

  // ---- 지네 ----
  // 독턱 찌르기 예고: 앞쪽 몸을 S자로 움츠리고 독턱을 활짝
  'windup:fang': (k) => ({ stretch: 1 - 0.3 * outQ(k), lean: -14 * outQ(k), jaw: 1.1 * outB(k), horn: outB(k), headZ: 10 * k, jitter: 1.5 * k, legSpread: k }),
  // 찌르기: 머리가 화살처럼 튀어나가며 독턱을 꽉
  fang: (k) => ({ stretch: 1 + 0.35 * bump(Math.min(1, k * 1.4)), lean: 30 * bump(Math.min(1, k * 1.5)), jaw: k < 0.3 ? 1.1 - 1.7 * outQ(k / 0.3) : -0.6 * (1 - k), horn: 1 - inQ(clamp((k - 0.4) / 0.6)), ghost: 0.8 * (1 - k) }),
  // 몸 말기: 똬리를 틀고 다리를 바깥으로 가시처럼 세운다
  curl: (k, t, d) => {
    const on = outQ(Math.min(1, t / 0.25)) * Math.min(1, (d - t) / 0.2);
    return { coil: on, legSpread: on, width: 1 + 0.1 * on, headScale: 1 + 0.05 * on };
  },
  // 노린내 굴리기: 몸을 공처럼 말고 굴러간다(말린 채 옆으로 계속 구름)
  ball: (k, t, d) => {
    const on = outQ(Math.min(1, t / 0.2)) * Math.min(1, (d - t) / 0.2);
    return { coil: on, roll: (t * 2.5) % 1, width: 1 + 0.15 * on, jitter: 1.5 * on, headScale: 1 - 0.1 * on };
  },
  // 천장 습격: 앞몸을 높이 치켜들며 위로 사라진다
  rearup: (k) => ({ headZ: 120 * outQ(k), z: 70 * inQ(k), headScale: 1 + 0.25 * k, jaw: k, legSpread: 1, ghost: 0.9 * k }),
  // 휘감기: 몸 앞쪽으로 적을 감아 조인다(감는 자리 = 렌더러가 기억)
  wrap: (k, t, d) => ({ wrap: outQ(Math.min(1, t / 0.3)) * Math.min(1, (d - t) / 0.2), jitter: 0.8, legSpread: 1 }),
  // 긴 다리 채찍: 다리가 길게 늘어나 물결치듯 앞쪽으로 후려침
  whip: (k) => ({ legWhip: bump(Math.min(1, k * 1.1)), legWave: k * 14, lean: 10 * bump(k), headScale: 1 + 0.05 * bump(k) }),
  // 치켜들어 덮치기 예고: 앞쪽 몸을 높이 치켜든다(코브라처럼)
  'windup:rear': (k) => ({ headZ: 78 * outB(k), headScale: 1 + 0.15 * k, horn: outQ(k), jaw: 1 * k, legSpread: 1, stretch: 1 - 0.12 * k, jitter: k }),
  // 덮치기: 높이 든 머리를 앞으로 내리꽂는다
  pounce: (k) => ({ headZ: 78 * (1 - outQ(Math.min(1, k * 1.6))), lean: 24 * bump(k), jaw: k < 0.4 ? 1 - 1.5 * outQ(k / 0.4) : -0.5, horn: 1 - k, stretch: 1 + 0.25 * bump(k), ghost: 0.8 }),
  // 노린내: 몸을 말고 마디마다 액체를 뿜는다
  spray: (k, t, d) => {
    const on = outQ(Math.min(1, t / 0.2)) * Math.min(1, (d - t) / 0.2);
    return { coil: 0.85 * on, width: 1 + 0.12 * on * (0.5 + 0.5 * Math.sin(t * 30)), jitter: 1 * on };
  },
  // 빛 점액: 머리를 들고 몸을 움츠렸다가 앞으로 뱉는다
  spit: (k) => ({ headZ: 16 * bump(k), lean: k < 0.4 ? -12 * outQ(k / 0.4) : 18 * bump((k - 0.4) / 0.6), stretch: 1 - 0.15 * bump(k), jaw: 0.8 * bump(k), headScale: 1 + 0.1 * bump(k) }),

  // 백족 소용돌이: 백 개의 다리를 길게 펴고 물결치듯 내달린다
  stampede: (k, t) => ({ legWhip: 0.75 * Math.min(1, t / 0.15) * Math.min(1, (1 - k) / 0.1), legWave: t * 40, width: 1.08, ghost: 0.5 }),

  // ---- 개미 ----
  // 개미산: 몸을 움츠려 배를 앞으로 말아 겨눴다가(예고) 칙 쏘며 반동
  'windup:acid': (k) => ({ stretch: 1 - 0.22 * outQ(k), lean: -8 * k, width: 1 + 0.1 * k, jitter: 1.2 * k, headZ: 8 * k }),
  acidshot: (k) => ({ lean: -14 * bump(k), stretch: 1 - 0.1 * bump(k), headScale: 1 + 0.08 * bump(k), jitter: 1.5 * (1 - k) }),
  // 굴 파기: 머리부터 땅속으로 파고든다(작아지고 납작) → 튀어나옴
  dig: (k, t, d) => {
    const inn = outQ(Math.min(1, t / 0.2));
    return { headScale: 1 - 0.45 * inn, width: 1 - 0.45 * inn, stretch: 1 - 0.35 * inn, headZ: -10 * inn, jitter: 1.5 * inn };
  },
  emerge: (k) => ({ headZ: 34 * bump(k), headScale: 1 + 0.25 * bump(k), stretch: 1 + 0.2 * bump(k), width: 1 + 0.1 * bump(k) }),
  // 개미 부르기: 머리를 들고 더듬이로 신호(부르르)
  call: (k) => ({ headZ: 18 * bump(k), headScale: 1 + 0.12 * bump(k), jitter: 1.2 * bump(k), legSpread: bump(k) }),
  // 잎 방패: 큰 잎을 머리 위로 들고 버틴다(잎 그림은 렌더러)
  leafshield: (k, t, d) => {
    const on = outB(Math.min(1, t / 0.2)) * Math.min(1, (d - t) / 0.15);
    return { headZ: 8 * on, lean: 4 * on, legSpread: on, width: 1 + 0.08 * on };
  },
  // 불개미 둥지: 머리를 박고 흙을 파 뒤로 튀긴다
  digpile: (k) => ({ headZ: -6 * bump(k), lean: -5 * bump(k), jitter: 2 * bump(k), legSpread: 1, headScale: 1 - 0.08 * bump(k) }),

  // ---- 거미 ----
  silkshot: (k) => ({ lean: -10 * bump(k), legSpread: 1, headScale: 1 + 0.06 * bump(k) }),
  // 실 감아 당기기: 다리로 실을 잡아 몸을 뒤로 당긴다
  reel: (k) => ({ lean: -20 * bump(k), legSpread: 1, stretch: 1 - 0.15 * bump(k), jitter: 1.2 * bump(k) }),
  // 그물 짓기: 다리를 벌리고 몸을 좌우로 돌리며 실을 뽑는다
  weave: (k) => ({ legSpread: 1, tilt: 0.3 * Math.sin(k * 18), headZ: 6 * bump(k), width: 1 + 0.06 * Math.sin(k * 30) }),
  spin: (k) => ({ legSpread: bump(k), width: 1 + 0.08 * Math.sin(k * 40) }),
  // 줄 타고 빠지기: 앞에 실을 붙이고 뒤로 튕겨 미끄러진다
  recoil: (k) => ({ lean: -22 * (1 - outQ(k)), stretch: 1 - 0.2 * bump(k), legSpread: 1, ghost: 0.6 * (1 - k) }),
  // 새끼 흩기: 몸을 부르르 털어 등의 새끼를 흩뿌린다
  shake: (k) => ({ jitter: 3 * bump(k), width: 1 + 0.15 * bump(k), headScale: 1 + 0.05 * bump(k) }),
  // 독니: 송곳니를 크게 드러낸 채 다음 물기를 기다린다
  venom: (k, t, d) => {
    const on = Math.min(1, t / 0.2) * Math.min(1, (d - t) / 0.2);
    return { horn: 0.7 * on, headScale: 1 + 0.06 * on, jaw: 0.4 * on };
  },

  // ---- 나비 ----
  // 날개를 한 번 꽉 접었다가 크게 확 펼친다
  flapbig: (k) => ({ wingFold: k < 0.3 ? outQ(k / 0.3) : 0, wingBig: k < 0.3 ? 0 : bump((k - 0.3) / 0.7), z: 16 * bump(k), headScale: 1 + 0.05 * bump(k) }),
  flutter: (k, t) => ({ z: 26 * Math.min(1, t / 0.15) * Math.min(1, (1 - k) / 0.1), tilt: 0.4 * Math.sin(t * 10), wingRate: 1.6, wingBig: 0.2, ghost: 0.7 }),
  charmpose: (k) => ({ headZ: 10 * bump(k), wingRate: 0.5, wingBig: 0.3 * bump(k), headScale: 1 + 0.06 * bump(k) }),
  bitterglow: (k, t, d) => ({ wingBig: 0.25 * Math.min(1, t / 0.2) * Math.min(1, (d - t) / 0.2), jitter: 0.4 }),
  // 눈알 무늬: 날개를 순식간에 활짝·크게(눈알을 보여 줌)
  eyeflash: (k) => ({ wingBig: outB(Math.min(1, k / 0.2)) * Math.min(1, (1 - k) / 0.25), wingRate: 0.01, headZ: 10 * bump(k), jitter: 1.5 * bump(Math.min(1, k * 3)) }),
  // 푸른 섬광: 날개를 홱 펴서 빛을 반사
  flashwing: (k) => ({ wingBig: 0.8 * bump(Math.min(1, k * 1.5)), wingRate: 0.01, z: 10 * bump(k) }),

  // ---- 잠자리 ----
  // 급강하 예고: 제자리에서 날개를 세차게 치며 떠오른다
  // 급강하 예고: 큰 날개를 활짝 펴고 한 번에 하늘 높이 솟구친다
  'windup:dive': (k) => ({ z: 150 * outB(k), wingRate: 3.5, wingSpread: 1, wingBig: 0.7 * outQ(k), stretch: 1 - 0.12 * k, headScale: 1 + 0.08 * k, ghost: 0.6 }),
  // 급강하: 조금 더 솟았다가 앞으로 내리꽂힘
  dive: (k) => {
    // 꼭대기에서 잠깐 멈칫(날개 활짝) → 날개를 바짝 접고 땅으로 내리꽂힘
    const z = k < 0.2 ? 150 + 12 * bump(k / 0.2) : 150 * (1 - inQ((k - 0.2) / 0.8));
    const fold = k < 0.18 ? 0 : clamp((k - 0.18) / 0.12);
    return { z, stretch: 1 + 0.35 * clamp(k * 2), ghost: 1, wingRate: fold > 0.5 ? 0.01 : 3, wingSpread: 1 - fold, wingBig: 0.7 * (1 - fold), wingFold: fold, lean: 8, headScale: 1 + z / 500 };
  },
  // 낚아채기 예고: 다리를 앞으로 바구니처럼 모으고 몸을 낮춤
  // 낚아채기 예고: 제자리에 떠서 몸을 뒤로 젖히고 다리를 앞으로 쭉 내민다(줄을 겨눔)
  'windup:snatch': (k) => ({ z: 16 * outQ(k), lean: -8 * k, stretch: 1 - 0.12 * k, legSpread: 1, wingRate: 2.5, wingSpread: 1, headScale: 1 + 0.08 * k, jitter: k }),
  // 끌어오기: 다리를 오므리며 몸을 확 뒤로 당긴다
  'snatch:pull': (k) => ({ z: 16 * (1 - k), lean: -22 * bump(Math.min(1, k * 1.6)), legSpread: 1 - k, wingRate: 3.5, wingSpread: 1, stretch: 1 - 0.2 * bump(k), headScale: 1 + 0.12 * bump(k) }),
  // 낚아채기: 낮게 미끄러지듯 스쳐 지나감(끝에서 다리를 오므림)
  snatch: (k) => ({ z: 14 * (1 - k * 0.6), stretch: 1 + 0.4 * bump(k * 1.2), ghost: 1, wingRate: 2.5, wingSpread: 1, legSpread: 1, lean: 10 }),
  // 낚아챈 순간: 다리를 오므리며 몸을 뒤로 당긴다(끌어오는 반동)
  'snatch:grab': (k) => ({ lean: -14 * bump(k), legSpread: 1 - k, wingRate: 3, wingSpread: 1, stretch: 1 - 0.15 * bump(k), headScale: 1 + 0.1 * bump(k) }),
  // 짧은 비행(회피): 휙 떠서 옆으로 비껴 날아감
  // 짧은 비행(회피): 휙 떠올라 옆으로 급선회. 몸이 꺾이는 쪽으로 기운다(tilt 부호는 렌더러가 방향에 맞춤)
  flit: (k) => ({ z: 60 * bump(k), stretch: 1 + 0.35 * bump(k), ghost: 1, wingRate: 4, wingSpread: 1, wingBig: 0.4 * bump(k), tilt: 1.3 * bump(Math.min(1, k * 1.6)), headScale: 1 + 0.12 * bump(k) }),
  // 맴돌기: 날개를 활짝 펴고 8자로 돈다. 돌 때마다 안쪽으로 기운다
  circle: (k) => ({ z: 18, wingSpread: 1, wingRate: 3, ghost: 0.8, stretch: 1.1, tilt: (k < 0.5 ? 1 : -1) * 0.5 }),
  // 겹눈: 머리가 부풀며 눈이 빛난다
  compound: (k) => ({ headScale: 1 + 0.18 * bump(Math.min(1, k * 4)) + 0.05 * Math.sin(k * 40), jitter: 0 }),
  // 옆구르기: 몸이 옆으로 뒤집히며(폭이 줄었다 늘었다) 한 바퀴
  roll: (k) => ({ roll: k, width: 0.45 + 0.55 * Math.abs(Math.cos(k * Math.PI * 2)), z: 10 * bump(k), stretch: 1 - 0.2 * bump(k), ghost: 0.6 }),
  // 하늘 사냥: 화면 위로 높이 떠 있음
  sky: (k, t) => ({ z: 120 * outQ(Math.min(1, t / 0.25)) * Math.min(1, (1 - k) / 0.05) + 5 * Math.sin(t * 6), wingRate: 2.5, wingSpread: 1, headScale: 1.15 }),
  // 하늘 사냥 내리꽂기: 땅에 닿은 순간부터 다시 솟음
  skydrop: (k) => ({ z: -120 * (1 - outQ(k)), width: 1 + 0.3 * (1 - k) }),
};

interface Active {
  name: string;
  t0: number;
  dur: number;
  sign: number; // 좌우 방향(기울기 부호)
}

export class Motion {
  private act = new Map<number, Active[]>();

  play(id: number, name: string, dur: number, now: number, sign = 1) {
    if (!PROGS[name]) return;
    const list = (this.act.get(id) ?? []).filter((a) => a.name !== name && !(name.startsWith('windup:') && a.name.startsWith('windup:')));
    // 본 동작이 시작되면 그 예고 동작은 끝난다
    const base = name.replace('windup:', '');
    const cleaned = list.filter((a) => a.name !== 'windup:' + base);
    cleaned.push({ name, t0: now, dur: Math.max(0.05, dur), sign });
    this.act.set(id, cleaned);
  }

  /** 그 동작이 시작된 시각(없으면 now) */
  started(id: number, name: string, now: number) {
    return this.act.get(id)?.find((a) => a.name === name)?.t0 ?? now;
  }

  has(id: number, name: string) {
    return !!this.act.get(id)?.some((a) => a.name === name);
  }

  /** 지금 자세. 여러 동작이 겹치면 높이·기울기는 더하고 배율은 곱한다 */
  sample(id: number, now: number): Pose | null {
    const list = this.act.get(id);
    if (!list || !list.length) return null;
    const p: Pose = { ...REST };
    const keep: Active[] = [];
    for (const a of list) {
      const t = now - a.t0;
      // 예고 동작은 본 동작이 이어받을 때까지 끝 자세로 잠깐 버틴다(사이에 한 프레임 빠지지 않게)
      const hold = a.name.startsWith('windup:') ? 0.12 : 0;
      if (t > a.dur + hold) continue;
      keep.push(a);
      const q = PROGS[a.name](Math.min(1, t / a.dur), Math.min(t, a.dur), a.dur);
      p.z += q.z ?? 0;
      p.headZ += q.headZ ?? 0;
      p.stretch *= q.stretch ?? 1;
      p.width *= q.width ?? 1;
      p.lean += q.lean ?? 0;
      p.headScale *= q.headScale ?? 1;
      p.jitter = Math.max(p.jitter, q.jitter ?? 0);
      p.wingRate = Math.max(p.wingRate, q.wingRate ?? 0);
      p.wingSpread = Math.max(p.wingSpread, q.wingSpread ?? 0);
      p.legSpread = Math.max(p.legSpread, q.legSpread ?? 0);
      p.ghost = Math.max(p.ghost, q.ghost ?? 0);
      p.tilt += (q.tilt ?? 0) * a.sign;
      p.jaw += q.jaw ?? 0;
      p.wingFold = Math.max(p.wingFold, q.wingFold ?? 0);
      p.roll = Math.max(p.roll, q.roll ?? 0);
      p.horn = Math.max(p.horn, q.horn ?? 0);
      p.armL += q.armL ?? 0;
      p.armR += q.armR ?? 0;
      p.armScale = Math.max(p.armScale, q.armScale ?? 0);
      p.wingBig = Math.max(p.wingBig, q.wingBig ?? 0);
      p.coil = Math.max(p.coil, q.coil ?? 0);
      p.wrap = Math.max(p.wrap, q.wrap ?? 0);
      p.legWhip = Math.max(p.legWhip, q.legWhip ?? 0);
      p.legWave += q.legWave ?? 0;
    }
    if (keep.length) this.act.set(id, keep);
    else this.act.delete(id);
    p.z = Math.max(0, p.z);
    return keep.length ? p : null;
  }

  clear(id: number) {
    this.act.delete(id);
  }
}

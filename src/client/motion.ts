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
}

export const REST: Pose = { z: 0, headZ: 0, stretch: 1, width: 1, lean: 0, headScale: 1, jitter: 0, wingRate: 0, wingSpread: 0, legSpread: 0, ghost: 0, tilt: 0 };

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
  'windup:charge': (k) => ({ stretch: 1 - 0.28 * outQ(k), lean: -10 * outQ(k), headScale: 1 - 0.08 * k, width: 1 + 0.1 * k, jitter: 2.5 * k, legSpread: k }),
  // 돌진: 앞으로 쭉 늘어나며 잔상
  charge: (k) => ({ stretch: 1 + 0.35 * bump(k * 1.3), lean: 10 * (1 - k), ghost: 1 - k * 0.6, headScale: 1.06 }),
  // 퍼 올리기 예고: 머리를 땅에 박듯 숙인다
  'windup:lift': (k) => ({ headZ: -6 * outQ(k), headScale: 1 - 0.14 * outQ(k), lean: -6 * k, stretch: 1 - 0.15 * k, jitter: 1.5 * k }),
  // 퍼 올리기: 머리가 크게 솟았다가 내려온다(뿔을 위로 휘두름)
  lift: (k) => ({ headZ: 34 * bump(k) * (k < 0.35 ? outB(k / 0.35) / 1 : 1), headScale: 1 + 0.3 * bump(k), lean: 12 * bump(k), stretch: 1 + 0.1 * bump(k) }),
  // 들려서 날아감(맞은 쪽): 높이 포물선 + 몸 비틀림
  lifted: (k) => ({ z: 75 * bump(k), tilt: 1.8 * k, stretch: 1 - 0.15 * bump(k), headScale: 1 + 0.15 * bump(k), ghost: 0.8 }),
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

  // ---- 잠자리 ----
  // 급강하 예고: 제자리에서 날개를 세차게 치며 떠오른다
  'windup:dive': (k) => ({ z: 34 * outQ(k), wingRate: 3, wingSpread: 1, stretch: 1 - 0.1 * k, headScale: 1 + 0.06 * k }),
  // 급강하: 조금 더 솟았다가 앞으로 내리꽂힘
  dive: (k) => {
    const z = k < 0.35 ? 34 + 30 * outQ(k / 0.35) : 64 * (1 - inQ((k - 0.35) / 0.65));
    return { z, stretch: 1 + 0.3 * clamp(k * 2), ghost: 1, wingRate: 2, wingSpread: 1, lean: 8, headScale: 1 + z / 400 };
  },
  // 낚아채기 예고: 다리를 앞으로 바구니처럼 모으고 몸을 낮춤
  'windup:snatch': (k) => ({ z: 8 * k, stretch: 1 - 0.15 * k, legSpread: k, wingRate: 2, headScale: 1 - 0.05 * k }),
  // 낚아채기: 낮게 미끄러지듯 스쳐 지나감(끝에서 다리를 오므림)
  snatch: (k) => ({ z: 14 * (1 - k * 0.6), stretch: 1 + 0.4 * bump(k * 1.2), ghost: 1, wingRate: 2.5, wingSpread: 1, legSpread: k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2, lean: 10 }),
  // 짧은 비행(회피): 휙 떠서 옆으로 비껴 날아감
  flit: (k) => ({ z: 48 * bump(k), stretch: 1 + 0.3 * bump(k), ghost: 1, wingRate: 3.5, wingSpread: 1, tilt: 0.45 * Math.sin(k * Math.PI * 2), headScale: 1 + 0.1 * bump(k) }),
  // 하늘 사냥: 화면 위로 높이 떠 있음
  sky: (k, t) => ({ z: 120 * outQ(Math.min(1, t / 0.25)) * Math.min(1, (1 - k) / 0.05) + 5 * Math.sin(t * 6), wingRate: 2.5, wingSpread: 1, headScale: 1.15 }),
  // 하늘 사냥 내리꽂기: 땅에 닿은 순간부터 다시 솟음
  skydrop: (k) => ({ z: -120 * (1 - outQ(k)), width: 1 + 0.3 * (1 - k) }),
};

interface Active {
  name: string;
  t0: number;
  dur: number;
}

export class Motion {
  private act = new Map<number, Active[]>();

  play(id: number, name: string, dur: number, now: number) {
    if (!PROGS[name]) return;
    const list = (this.act.get(id) ?? []).filter((a) => a.name !== name && !(name.startsWith('windup:') && a.name.startsWith('windup:')));
    // 본 동작이 시작되면 그 예고 동작은 끝난다
    const base = name.replace('windup:', '');
    const cleaned = list.filter((a) => a.name !== 'windup:' + base);
    cleaned.push({ name, t0: now, dur: Math.max(0.05, dur) });
    this.act.set(id, cleaned);
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
      if (t > a.dur) continue;
      keep.push(a);
      const q = PROGS[a.name](t / a.dur, t, a.dur);
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
      p.tilt += q.tilt ?? 0;
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

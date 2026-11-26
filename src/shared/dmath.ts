// 결정적 수학 함수: 어느 브라우저·서버에서 돌려도 비트 단위로 같은 값.
// 자바스크립트의 Math.sin·cos·atan2·hypot·exp는 규격상 근사가 허용돼 엔진(V8·사파리 등)마다 끝자리가 다를 수 있다.
// 판을 '시드 + 입력 기록'으로 서버에서 다시 돌려 점수를 확인하려면 계산이 엔진과 상관없이 같아야 한다.
// 여기서는 사칙연산과 Math.sqrt(IEEE 754에서 정확히 반올림)만 쓴다. src/shared에서는 이 함수만 쓴다(테스트가 막는다).

const PI = 3.141592653589793;
const TAU = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/** [-π, π]로 접기 */
function wrap(x: number): number {
  if (x >= -PI && x <= PI) return x;
  return x - TAU * Math.round(x / TAU);
}

/** |x| ≤ π/2 에서 sin(테일러 13차, 오차 < 1e-10) */
function sinCore(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
}

export function dsin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  let a = wrap(x);
  // sin(π − a) = sin(a): [-π/2, π/2]로
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  return sinCore(a);
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** |t| ≤ tan(π/8) 에서 atan(급수 23차, 오차 < 1e-10) */
function atanCore(t: number): number {
  const t2 = t * t;
  let s = 0;
  for (let k = 23; k >= 1; k -= 2) s = 1 / k - t2 * s;
  // s = 1 − t²/3 + t⁴/5 − …  (안에서부터 접어 계산)
  return t * s;
}

const TAN_PI_8 = 0.41421356237309503;
const QUARTER_PI = 0.7853981633974483;

function datan(t: number): number {
  const neg = t < 0;
  let a = neg ? -t : t;
  let base = 0;
  if (a > 1) {
    // atan(a) = π/2 − atan(1/a)
    const r = datanPos(1 / a);
    base = HALF_PI - r;
    return neg ? -base : base;
  }
  base = datanPos(a);
  return neg ? -base : base;
}

/** 0 ≤ a ≤ 1 */
function datanPos(a: number): number {
  if (a > TAN_PI_8) return QUARTER_PI + atanCore((a - 1) / (a + 1));
  return atanCore(a);
}

export function datan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 0) {
    if (y > 0) return HALF_PI;
    if (y < 0) return -HALF_PI;
    return 0;
  }
  const r = datan(y / x);
  if (x > 0) return r;
  return y >= 0 ? r + PI : r - PI;
}

export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** e^x (x를 ln2 단위로 나눠 2의 거듭제곱 × 급수, 오차 < 1e-12) */
export function dexp(x: number): number {
  if (x === 0) return 1;
  if (!Number.isFinite(x)) return x > 0 ? x : 0;
  const LN2 = 0.6931471805599453;
  const k = Math.round(x / LN2);
  const r = x - k * LN2; // |r| ≤ ln2/2
  let s = 1, term = 1;
  for (let n = 1; n <= 16; n++) {
    term = (term * r) / n;
    s += term;
  }
  // 2^k (정수 거듭제곱은 곱셈으로)
  let p = 1;
  const b = k >= 0 ? 2 : 0.5;
  for (let i = Math.abs(k); i > 0; i--) p *= b;
  return s * p;
}

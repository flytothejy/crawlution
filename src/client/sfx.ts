// 효과음·진동. 소리 파일 없이 WebAudio로 즉석에서 합성한다(한 파일 빌드를 가볍게).
// 진동은 navigator.vibrate가 있는 기기(안드로이드 등)에서만 동작한다.

export type SoundName =
  | 'eat' | 'eatBig' | 'gem' | 'like' | 'yuck'
  | 'hit' | 'hitBig' | 'crit' | 'hurt' | 'hurtBig' | 'block'
  | 'skill' | 'molt' | 'kill' | 'crush' | 'ring'
  | 'warn' | 'lifeLost' | 'respawn' | 'captured' | 'win' | 'lose' | 'click' | 'ready'
  // 기술 모션 소리(예고 → 발동 → 타격)
  | 'windup' | 'windupWing' | 'dash' | 'wingDash' | 'heave' | 'slam' | 'land' | 'brace' | 'flit' | 'impact';

/** 기술 이펙트 → 모션 소리. 없으면 null(일반 기술 소리) */
export function fxSound(kind: string, wk?: string): SoundName | null {
  switch (kind) {
    case 'windup':
      return wk === 'dive' || wk === 'snatch' ? 'windupWing' : 'windup';
    case 'charge':
      return 'dash';
    case 'dive':
      return wk === 'sky' ? 'wingDash' : 'wingDash';
    case 'snatch':
      return 'wingDash';
    case 'lift':
      return 'heave';
    case 'thud':
      return 'slam';
    case 'land':
      return 'land';
    case 'push':
      return 'brace';
    case 'hop':
      return wk === 'jump' ? 'wingDash' : 'flit';
    case 'lifted':
      return 'impact';
    default:
      return null;
  }
}
/** 예고가 있는 기술: 시전 순간의 일반 기술 소리를 내지 않는다 */
export const MOTION_FX = new Set(['windup', 'push', 'hop']);

const KEY_SND = 'crawlution.sound';
const KEY_VIB = 'crawlution.vibe';

function load(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}
function save(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* 저장 불가 환경 */
  }
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  sound = load(KEY_SND);
  volume = 0.8;
  vibe = load(KEY_VIB);
  readonly canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  /** 사용자가 처음 누를 때 불러야 소리가 난다(모바일 브라우저 규칙) */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7 * this.volume;
        // 너무 큰 소리가 겹쳐도 찢어지지 않게
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 6;
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setSound(on: boolean) {
    this.sound = on;
    save(KEY_SND, on);
    if (on) this.unlock();
  }
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = 0.7 * this.volume;
  }
  setVibe(on: boolean) {
    this.vibe = on;
    save(KEY_VIB, on);
  }

  buzz(pattern: number | number[]) {
    if (!this.vibe || !this.canVibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* 무시 */
    }
  }

  /** 같은 소리가 너무 자주 겹치지 않게 최소 간격(ms) */
  private gate(name: string, ms: number) {
    const now = performance.now();
    if (now - (this.last.get(name) ?? -1e9) < ms) return false;
    this.last.set(name, now);
    return true;
  }

  private tone(freq: number, dur: number, opt: { type?: OscillatorType; vol?: number; to?: number; at?: number; attack?: number } = {}) {
    const ctx = this.ctx!, t = ctx.currentTime + (opt.at ?? 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opt.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + dur);
    const v = opt.vol ?? 0.2, a = opt.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, opt: { vol?: number; freq?: number; to?: number; q?: number; type?: BiquadFilterType; at?: number } = {}) {
    const ctx = this.ctx!, t = ctx.currentTime + (opt.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opt.type ?? 'bandpass';
    f.frequency.setValueAtTime(opt.freq ?? 1200, t);
    if (opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    f.Q.value = opt.q ?? 1.2;
    const g = ctx.createGain();
    const v = opt.vol ?? 0.3;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur + 0.02);
  }

  /** 소리 재생. k: 크기 배율(멀리서 난 소리는 작게) */
  play(name: SoundName, k = 1) {
    if (!this.sound || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const v = (x: number) => x * k;
    switch (name) {
      case 'eat': {
        if (!this.gate(name, 55)) return;
        const f = 620 + Math.random() * 260;
        this.tone(f, 0.07, { type: 'triangle', vol: v(0.09), to: f * 1.5 });
        break;
      }
      case 'eatBig':
        if (!this.gate(name, 80)) return;
        this.tone(520, 0.08, { type: 'triangle', vol: v(0.13), to: 780 });
        this.tone(780, 0.1, { type: 'triangle', vol: v(0.11), to: 1170, at: 0.06 });
        break;
      case 'gem':
        [1318, 1760, 2349, 2637].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: v(0.1), at: i * 0.05 }));
        this.tone(3520, 0.3, { type: 'sine', vol: v(0.05), at: 0.2 });
        break;
      case 'like':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, { type: 'square', vol: v(0.06), at: i * 0.06 }));
        [1046, 1318, 1568].forEach((f) => this.tone(f, 0.55, { type: 'triangle', vol: v(0.08), at: 0.32 }));
        this.noise(0.5, { vol: v(0.08), freq: 6000, to: 9000, type: 'highpass', at: 0.3 });
        break;
      case 'yuck':
        this.tone(240, 0.45, { type: 'sawtooth', vol: v(0.12), to: 70 });
        this.tone(250, 0.45, { type: 'sawtooth', vol: v(0.08), to: 80 });
        break;
      case 'hit': {
        if (!this.gate(name, 45)) return;
        this.noise(0.08, { vol: v(0.35), freq: 1800, q: 0.9 });
        this.tone(210 + Math.random() * 60, 0.07, { type: 'square', vol: v(0.08), to: 120 });
        break;
      }
      case 'hitBig':
        if (!this.gate(name, 60)) return;
        this.noise(0.14, { vol: v(0.45), freq: 1300, to: 500, q: 0.8 });
        this.tone(160, 0.16, { type: 'square', vol: v(0.12), to: 60 });
        break;
      case 'crit':
        this.noise(0.22, { vol: v(0.5), freq: 2400, to: 600, q: 0.7 });
        this.tone(90, 0.3, { type: 'sine', vol: v(0.35), to: 40 });
        this.tone(1568, 0.18, { type: 'square', vol: v(0.07), at: 0.02 });
        this.tone(2093, 0.25, { type: 'square', vol: v(0.06), at: 0.08 });
        break;
      case 'hurt':
        if (!this.gate(name, 70)) return;
        this.noise(0.1, { vol: v(0.3), freq: 700, q: 1 });
        this.tone(140, 0.12, { type: 'sine', vol: v(0.22), to: 70 });
        break;
      case 'hurtBig':
        if (!this.gate(name, 90)) return;
        this.noise(0.2, { vol: v(0.45), freq: 500, to: 200, q: 0.8 });
        this.tone(110, 0.25, { type: 'sine', vol: v(0.35), to: 45 });
        break;
      case 'block':
        if (!this.gate(name, 80)) return;
        this.tone(1900, 0.09, { type: 'triangle', vol: v(0.09) });
        this.tone(2600, 0.12, { type: 'sine', vol: v(0.06), at: 0.02 });
        break;
      case 'skill':
        this.noise(0.4, { vol: v(0.35), freq: 400, to: 3200, q: 1.4 });
        this.tone(330, 0.35, { type: 'sawtooth', vol: v(0.07), to: 990 });
        this.tone(90, 0.3, { type: 'sine', vol: v(0.25), to: 45, at: 0.05 });
        break;
      case 'windup':
        // 낮게 으르렁 + 땅 긁는 소리
        this.tone(70, 0.22, { type: 'sawtooth', vol: v(0.12), to: 140, attack: 0.05 });
        this.noise(0.18, { vol: v(0.18), freq: 500, to: 1400, q: 0.8 });
        break;
      case 'windupWing':
        // 날개 붕― 하고 빨라짐
        this.tone(110, 0.2, { type: 'sawtooth', vol: v(0.08), to: 260, attack: 0.03 });
        this.noise(0.2, { vol: v(0.12), freq: 2500, to: 5000, q: 2.5 });
        break;
      case 'dash':
        this.noise(0.32, { vol: v(0.38), freq: 300, to: 2200, q: 0.9 });
        this.tone(95, 0.3, { type: 'sine', vol: v(0.28), to: 55 });
        break;
      case 'wingDash':
        this.noise(0.3, { vol: v(0.3), freq: 1800, to: 600, q: 1.6 });
        this.tone(180, 0.25, { type: 'sawtooth', vol: v(0.05), to: 90 });
        break;
      case 'heave':
        this.noise(0.22, { vol: v(0.3), freq: 400, to: 2600, q: 1.2 });
        this.tone(120, 0.2, { type: 'square', vol: v(0.1), to: 260 });
        break;
      case 'slam':
        this.tone(55, 0.55, { type: 'sine', vol: v(0.55), to: 28 });
        this.noise(0.4, { vol: v(0.55), freq: 900, to: 120, q: 0.6 });
        this.noise(0.15, { vol: v(0.25), freq: 3000, q: 0.8, at: 0.02 });
        break;
      case 'land':
        this.tone(80, 0.3, { type: 'sine', vol: v(0.35), to: 40 });
        this.noise(0.25, { vol: v(0.35), freq: 1400, to: 300, q: 0.7 });
        break;
      case 'brace':
        this.tone(65, 0.5, { type: 'sawtooth', vol: v(0.1), to: 80, attack: 0.04 });
        this.noise(0.45, { vol: v(0.2), freq: 300, to: 700, q: 0.7 });
        break;
      case 'flit':
        this.noise(0.18, { vol: v(0.22), freq: 3000, to: 1200, q: 2 });
        break;
      case 'impact':
        this.tone(70, 0.3, { type: 'sine', vol: v(0.3), to: 35, at: 0.25 });
        this.noise(0.2, { vol: v(0.3), freq: 1000, to: 250, q: 0.8, at: 0.25 });
        break;
      case 'molt':
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: v(0.1), at: i * 0.08, attack: 0.03 }));
        this.tone(196, 0.9, { type: 'sine', vol: v(0.2), to: 392, at: 0.05, attack: 0.1 });
        this.noise(0.7, { vol: v(0.07), freq: 5000, to: 10000, type: 'highpass', at: 0.2 });
        break;
      case 'kill':
        this.tone(1046, 0.12, { type: 'square', vol: v(0.08) });
        this.tone(1568, 0.25, { type: 'square', vol: v(0.08), at: 0.08 });
        this.noise(0.12, { vol: v(0.3), freq: 900 });
        break;
      case 'crush':
        this.noise(0.5, { vol: v(0.5), freq: 300, to: 80, type: 'lowpass', q: 0.5 });
        this.tone(70, 0.5, { type: 'sine', vol: v(0.45), to: 30 });
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: v(0.06), at: 0.12 + i * 0.07 }));
        break;
      case 'ring':
        this.tone(440, 0.4, { type: 'triangle', vol: v(0.1), to: 880 });
        break;
      case 'warn':
        for (let i = 0; i < 3; i++) {
          this.tone(880, 0.16, { type: 'square', vol: v(0.08), at: i * 0.36 });
          this.tone(660, 0.16, { type: 'square', vol: v(0.08), at: i * 0.36 + 0.18 });
        }
        break;
      case 'lifeLost':
        [523, 440, 349, 262].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: v(0.13), at: i * 0.13 }));
        this.tone(80, 0.6, { type: 'sine', vol: v(0.3), to: 40 });
        break;
      case 'respawn':
        [523, 784, 1046].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: v(0.09), at: i * 0.07 }));
        break;
      case 'captured':
        this.noise(0.35, { vol: v(0.3), freq: 2500, to: 500, q: 0.6 });
        this.tone(600, 0.5, { type: 'sawtooth', vol: v(0.07), to: 200 });
        break;
      case 'win':
        [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, i === 6 ? 0.8 : 0.18, { type: 'square', vol: v(0.07), at: i * 0.12 }));
        break;
      case 'lose':
        [392, 349, 330, 262].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: v(0.12), at: i * 0.2 }));
        break;
      case 'click':
        this.tone(900, 0.05, { type: 'triangle', vol: v(0.1), to: 1300 });
        break;
      case 'ready':
        if (!this.gate(name, 400)) return;
        this.tone(1318, 0.12, { type: 'triangle', vol: v(0.08) });
        this.tone(1760, 0.18, { type: 'triangle', vol: v(0.08), at: 0.07 });
        break;
    }
  }
}

// 시뮬레이션을 어디서 돌릴지 감춘다. 화면 코드는 이 인터페이스만 안다.
// WorkerHost(별도 스레드) → 안 되면 LocalHost(메인 스레드). 멀티에서는 NetworkHost를 추가한다.
import SimWorker from './sim.worker?worker&inline';
import { Simulation } from '../shared/sim';
import type { Command, HostIn, HostOut, Snapshot } from '../shared/types';

export interface SimHost {
  readonly kind: string;
  start(seed: number, playerName: string): void;
  send(cmd: Command): void;
  pause(paused: boolean): void;
  stop(): void;
  onSnap: (snap: Snapshot) => void;
}

class WorkerHost implements SimHost {
  readonly kind = 'worker';
  onSnap: (snap: Snapshot) => void = () => {};
  private w: Worker;
  constructor() {
    this.w = new SimWorker();
    this.w.onmessage = (e: MessageEvent<HostOut>) => {
      if (e.data.type === 'snap') this.onSnap(e.data.snap);
    };
  }
  private post(m: HostIn) {
    this.w.postMessage(m);
  }
  start(seed: number, playerName: string) {
    this.post({ type: 'start', seed, playerName });
  }
  send(cmd: Command) {
    this.post({ type: 'cmd', cmd });
  }
  pause(paused: boolean) {
    this.post({ type: 'pause', paused });
  }
  stop() {
    this.post({ type: 'stop' });
  }
}

class LocalHost implements SimHost {
  readonly kind = 'local';
  onSnap: (snap: Snapshot) => void = () => {};
  private sim: Simulation | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private acc = 0;
  private paused = false;
  start(seed: number, playerName: string) {
    this.sim = new Simulation(seed, playerName);
    this.last = performance.now();
    this.acc = 0;
    this.paused = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.loop(), 4);
  }
  private loop() {
    const sim = this.sim;
    if (!sim) return;
    const now = performance.now();
    if (this.paused) {
      this.last = now;
      return;
    }
    this.acc += (now - this.last) / 1000;
    this.last = now;
    let steps = 0;
    while (this.acc >= sim.dt && steps < 8) {
      sim.step();
      this.acc -= sim.dt;
      steps++;
    }
    if (this.acc > sim.dt * 8) this.acc = 0;
    if (steps > 0) this.onSnap(sim.snapshot());
  }
  send(cmd: Command) {
    this.sim?.setCommand(0, cmd);
  }
  pause(paused: boolean) {
    this.paused = paused;
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sim = null;
  }
}

/** 워커를 먼저 시도하고, 1초 안에 응답이 없거나 만들 수 없으면 메인 스레드로 돌린다 */
export function createHost(seed: number, playerName: string, onSnap: (s: Snapshot) => void): SimHost {
  let host: SimHost;
  try {
    host = new WorkerHost();
  } catch {
    host = new LocalHost();
  }
  let got = false;
  host.onSnap = (s) => {
    got = true;
    onSnap(s);
  };
  host.start(seed, playerName);
  if (host.kind === 'worker') {
    setTimeout(() => {
      if (got) return;
      host.stop();
      const local = new LocalHost();
      local.onSnap = onSnap;
      local.start(seed, playerName);
      Object.assign(proxy, { inner: local });
    }, 1000);
  }
  // 대체가 일어나도 바깥에서는 같은 객체를 쓰게 감싼다
  const proxy: { inner: SimHost } & SimHost = {
    inner: host,
    get kind() {
      return this.inner.kind;
    },
    start(s: number, n: string) {
      this.inner.start(s, n);
    },
    send(c: Command) {
      this.inner.send(c);
    },
    pause(p: boolean) {
      this.inner.pause(p);
    },
    stop() {
      this.inner.stop();
    },
    onSnap,
  };
  return proxy;
}

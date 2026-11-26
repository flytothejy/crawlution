// 싱글 플레이의 '가짜 서버'. 멀티에서는 이 자리를 Colyseus 서버가 대신한다.
import { Simulation } from '../shared/sim';
import type { HostIn, HostOut } from '../shared/types';

let sim: Simulation | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let last = 0;
let acc = 0;
let paused = false;
let sentReplay = false;

function loop() {
  if (!sim) return;
  const now = performance.now();
  if (paused) {
    last = now;
    return;
  }
  acc += (now - last) / 1000;
  last = now;
  let steps = 0;
  while (acc >= sim.dt && steps < 8) {
    sim.step();
    acc -= sim.dt;
    steps++;
  }
  if (acc > sim.dt * 8) acc = 0;
  if (steps > 0) {
    const msg: HostOut = { type: 'snap', snap: sim.snapshot() };
    (self as unknown as Worker).postMessage(msg);
    if (sim.state === 'ended' && !sentReplay) {
      sentReplay = true;
      const rep: HostOut = { type: 'replay', rec: sim.replayRecord() };
      (self as unknown as Worker).postMessage(rep);
    }
  }
}

self.onmessage = (e: MessageEvent<HostIn>) => {
  const m = e.data;
  if (m.type === 'start') {
    sim = new Simulation(m.seed, m.playerName, m.opts);
    last = performance.now();
    acc = 0;
    paused = false;
    sentReplay = false;
    if (timer) clearInterval(timer);
    timer = setInterval(loop, 4);
  } else if (m.type === 'opts') {
    sim?.setOpts(m.opts);
  } else if (m.type === 'cmd') {
    sim?.setCommand(0, m.cmd);
  } else if (m.type === 'pause') {
    paused = m.paused;
  } else if (m.type === 'stop') {
    if (timer) clearInterval(timer);
    timer = null;
    sim = null;
  }
};

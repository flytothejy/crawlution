// 판 기록으로 판을 다시 돌린다. 순위 서버(점수 검증)·밸런스 측정(실유저 층)·버그 재현이 함께 쓴다.
import { Simulation, decodeCmd, encodeCmd, type ReplayRecord } from './sim';
import { SIM_BUILD } from './build';

export interface ReplayOptions {
  /** 판을 만든 직후, 첫 틱 전에 불린다(수집기 달기) */
  onStart?: (sim: Simulation) => void;
  /** 판 한 틱이 끝날 때마다 불린다(지표 모으기) */
  onStep?: (sim: Simulation) => void;
  /** 다른 버전 도장의 기록도 돌려 본다(결과가 다를 수 있음을 알고 쓸 때만) */
  allowOtherBuild?: boolean;
}

export function replayRun(rec: ReplayRecord, o: ReplayOptions = {}): Simulation {
  if (rec.v !== 1) throw new Error(`모르는 기록 형식 v${rec.v}`);
  if (rec.build !== SIM_BUILD && !o.allowOtherBuild) throw new Error(`버전 도장이 다름: 기록 ${rec.build}, 지금 ${SIM_BUILD}`);
  const sim = new Simulation(rec.seed, rec.name, rec.opts, rec.theme);
  sim.recording = false;
  o.onStart?.(sim);
  let ci = 0, oi = 0;
  while (sim.tick < rec.ticks) {
    while (ci < rec.cmds.length && rec.cmds[ci][0] === sim.tick) {
      const row = rec.cmds[ci++];
      const id = row[1];
      // 기록 칸은 '그때 곤충이 들고 있던 명령'에서 바뀐 것만 담는다(sim.ts setCommand)
      const enc = encodeCmd(sim.snakes[id].cmd);
      for (let k = 2; k < row.length; k += 2) enc[row[k]] = row[k + 1];
      sim.setCommand(id, decodeCmd(enc));
    }
    while (oi < rec.optsLog.length && rec.optsLog[oi][0] === sim.tick) sim.setOpts({ ...sim.opts, power: rec.optsLog[oi++][1] });
    sim.step();
    o.onStep?.(sim);
  }
  return sim;
}

/** 판 상태를 짧은 지문으로(두 판이 같은지 비교) */
export function simFingerprint(sim: Simulation): string {
  let h = 2166136261;
  const mix = (v: number) => {
    // 소수는 그대로 비트로 섞는다(값이 조금이라도 다르면 지문이 달라진다)
    const f = new Float64Array([v]);
    const u = new Uint32Array(f.buffer);
    for (const x of u) {
      h ^= x;
      h = Math.imul(h, 16777619) >>> 0;
    }
  };
  mix(sim.tick);
  for (const s of sim.snakes) {
    mix(s.x);
    mix(s.y);
    mix(s.hp);
    mix(s.score);
    mix(s.level);
    mix(s.segN);
  }
  mix(sim.foods.length);
  return h.toString(16);
}

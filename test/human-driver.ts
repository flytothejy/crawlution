// 시험용 '가짜 사람': 봇 판단으로 조종하되 판 상태를 하나도 건드리지 않는다.
// botThink는 곤충에 자기 메모(카드 고르기 지연 등)를 쓰고 판 난수를 쓴다. 진짜 사람 입력은 판 밖에서 오므로,
// 그 흔적을 되돌려야 기록 → 다시 돌리기가 같은 판이 된다.
import type { Command } from '../src/shared/types';
import type { Simulation } from '../src/shared/sim';
import { Rng } from '../src/shared/rng';
import { botThink } from '../src/shared/bot';

export function humanDriver(seed = 7) {
  const side = new Rng(seed);
  const mem: Record<string, unknown> = {}; // 봇 판단의 메모는 판 밖(여기)에 따로 둔다
  return (sim: Simulation, id: number, dt: number): Command => {
    const s = sim.snakes[id] as unknown as Record<string, unknown>;
    const saved = { ...s };
    Object.assign(s, mem);
    const own = sim.rng;
    sim.rng = side;
    const c = botThink(sim, sim.snakes[id], dt);
    sim.rng = own;
    for (const k of Object.keys(s))
      if (s[k] !== saved[k]) {
        mem[k] = s[k];
        s[k] = saved[k];
      }
    return c;
  };
}

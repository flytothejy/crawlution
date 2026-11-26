// 결정성 점검: 같은 시드 + 같은 입력이면 어디서 돌려도 같은 판.
// 순위 점수 검증(서버가 다시 돌림)과 실유저 밸런스 분석(기록을 다시 돌려 지표를 뽑음)의 전제다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Simulation } from '../src/shared/sim';
import { humanDriver } from './human-driver';
import { replayRun, simFingerprint } from '../src/shared/replay';
import { dsin, dcos, datan2, dexp } from '../src/shared/dmath';
import { SIM_BUILD } from '../src/shared/build';
import { simHash } from '../scripts/stamp.mjs';

let fails = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`);
  if (!ok) fails++;
};

// 1) 결정적 수학 함수 정확도
{
  let e = 0;
  for (let i = 0; i < 50000; i++) {
    const x = (i / 50000 - 0.5) * 40;
    e = Math.max(e, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
    const y = Math.sin(i * 1.7) * 300, z = Math.cos(i * 0.37) * 400 - 50;
    e = Math.max(e, Math.abs(datan2(y, z) - Math.atan2(y, z)));
    const t = (i / 50000 - 0.9) * 10;
    e = Math.max(e, Math.abs(dexp(t) - Math.exp(t)) / Math.exp(t));
  }
  check('결정적 수학 함수 오차 < 1e-8', e < 1e-8, e.toExponential(2));
}

// 2) 공유 코드(판 로직)는 엔진마다 다를 수 있는 함수를 쓰지 않는다
{
  const dir = join(import.meta.dirname, '..', 'src', 'shared');
  const bad: string[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'dmath.ts')) {
    readFileSync(join(dir, f), 'utf8').split('\n').forEach((l, i) => {
      if (/Math\.(sin|cos|tan|asin|acos|atan|atan2|hypot|exp|expm1|log|log2|log10|log1p|pow|cbrt|sinh|cosh|tanh|random)\(|Date\.now\(|performance\.now\(/.test(l)) bad.push(`${f}:${i + 1}`);
    });
  }
  check('src/shared에 Math.sin·random·Date.now 등 직접 사용 없음', bad.length === 0, bad.slice(0, 8).join(', '));
}

// 3) 버전 도장이 지금 코드와 같다
check('시뮬레이션 버전 도장이 최신(npm run stamp)', simHash() === SIM_BUILD, `${SIM_BUILD} vs ${simHash()}`);

// 4) 입력 기록으로 판을 다시 돌리면 똑같다(게임처럼: 매 틱 명령, 가끔 스냅샷)
{
  const sim = new Simulation(4242, '나', { power: 1, bots: 20, map: 'random', loadout: { species: 'kingmantis', form: '', traits: [] }, v3: true });
  const p = sim.snakes[0];
  const T = 60 * 150; // 150초(카드 고르기·기술·부활까지 들어가게)
  // 사람 대신 봇 판단으로 조종(판 상태는 안 건드림). 봇처럼 3틱마다 생각하고 그 사이엔 같은 입력
  const think = humanDriver(7);
  let c = p.cmd;
  for (let t = 0; t < T; t++) {
    if (t % 3 === 0) c = think(sim, 0, sim.dt * 3);
    sim.setCommand(0, c);
    sim.step();
    if (t % 2 === 0) sim.snapshot();
  }
  const rec = sim.replayRecord();
  const json = JSON.stringify(rec);
  const again = replayRun(JSON.parse(json));
  const a = simFingerprint(sim), b = simFingerprint(again);
  check('기록으로 다시 돌린 판이 똑같음', a === b && sim.snakes[0].score === again.snakes[0].score, `${a} / ${b}, 점수 ${sim.snakes[0].score}/${again.snakes[0].score}, 기록 ${rec.cmds.length}줄 ${(json.length / 1024).toFixed(0)}KB(150초)`);
  check('기록에 레벨업 카드 선택이 들어 있음', rec.cmds.some((r) => r.some((v, i) => i >= 2 && i % 2 === 0 && v === 7)) && p.level > 3, `Lv${p.level}`);
}

console.log(fails ? `${fails}개 실패` : '결정성 모두 통과');
process.exit(fails ? 1 : 0);

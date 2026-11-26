// 실유저 층: 사람이 둔 판 기록(ReplayRecord)을 다시 돌려 봇 판과 같은 지표를 뽑는다.
//
//   npm run balance:ingest            balance/replays/inbox/*.json 을 다시 돌려 balance/replays/runs/ 에 지표를 쓴다
//   npm run balance -- --only=none    지표를 모아 보고서의 '실유저' 탭을 다시 만든다(측정은 안 돌림)
//
// 기록은 같은 버전 도장(SIM_BUILD)의 코드로만 똑같이 재현된다. 그래서 받은 즉시(같은 버전일 때) 한 번 돌려
// 지표를 뽑아 runs/에 남긴다 — 지표는 코드가 바뀐 뒤에도 그대로 쓸 수 있다. 원본 기록은 서버 저장소에 남기고,
// 출시한 버전마다 git 태그(sim-<도장>)를 달아 두면 옛 기록도 그 버전으로 다시 돌려 새 지표를 뽑을 수 있다.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { ReplayRecord } from '../src/shared/sim';
import { replayRun } from '../src/shared/replay';
import { SIM_BUILD } from '../src/shared/build';
import { arenaCollector, type ArenaAgg } from './arena';

export interface HumanRun {
  id: string;
  build: string;
  sp: string; // 판을 시작한 종(진화하면 바뀌므로 줄은 생마다 그 종으로 센다)
  bots: number;
  secs: number;
  ended: boolean;
  score: number;
  rank: number; // 판 끝 순위(1 = 1등)
  of: number;
  maxLevel: number;
  /** 사람이 조종한 곤충의 생마다 종별 성적(아레나 층과 같은 칸) */
  rows: Record<string, ArenaAgg>;
  /** 같은 판 봇 전체(사람 대 봇 비교용, 한 줄로 합침) */
  botsAgg: ArenaAgg;
  /** 조작 습관: 초당 방향 바꿈, 달리기 비율 */
  input: { turnsPerSec: number; boostShare: number };
  unranked: boolean; // 판 중 설정(힘)을 바꿨으면 순위·밸런스 비교에서 뺀다
}

const DIR = join(import.meta.dirname, 'replays');
const INBOX = join(DIR, 'inbox');
const RUNS = join(DIR, 'runs');

export function extractHuman(rec: ReplayRecord, allowOtherBuild = false): HumanRun {
  const id = createHash('sha256').update(JSON.stringify(rec)).digest('hex').slice(0, 12);
  let collector: ReturnType<typeof arenaCollector> | null = null;
  let botC: ReturnType<typeof arenaCollector> | null = null;
  let boostTicks = 0;
  const sim = replayRun(rec, {
    allowOtherBuild,
    onStart: (s) => {
      collector = arenaCollector(s, (x) => (x.isPlayer ? x.sp.id : null));
      botC = arenaCollector(s, (x) => (x.isPlayer ? null : 'bots'));
    },
    onStep: (s) => {
      // 두 수집기가 같은 이벤트를 읽어야 해서 비우기 전에 붙잡아 둔다
      const ev = s.events;
      collector!.step();
      s.events = ev;
      botC!.step();
      if (s.snakes[0].boosting) boostTicks++;
    },
  });
  const rows = collector ? (collector as ReturnType<typeof arenaCollector>).finish() : {};
  const b = botC ? (botC as ReturnType<typeof arenaCollector>).finish() : {};
  const p = sim.snakes[0];
  const live = sim.snakes.filter((s) => !s.isBoss);
  const order = [...live].sort((x, y) => y.score - x.score);
  let turns = 0;
  for (const r of rec.cmds) for (let k = 2; k < r.length; k += 2) if (r[k] === 0) turns++;
  return {
    id, build: rec.build, sp: rec.opts.loadout.species, bots: rec.opts.bots, secs: sim.time, ended: rec.ended,
    score: p.score, rank: order.indexOf(p) + 1, of: order.length, maxLevel: Math.max(p.level, p.maxLevel),
    rows, botsAgg: b.bots ?? (Object.values(b)[0] as ArenaAgg),
    input: { turnsPerSec: turns / Math.max(1, sim.time), boostShare: boostTicks / Math.max(1, sim.tick) },
    unranked: rec.optsLog.length > 0,
  };
}

export function loadHumanRuns(): HumanRun[] {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(RUNS, f), 'utf8')) as HumanRun);
}

// 직접 실행: 받은 기록 처리
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const other = process.argv.includes('--allow-other-build');
  mkdirSync(INBOX, { recursive: true });
  mkdirSync(RUNS, { recursive: true });
  mkdirSync(join(INBOX, 'done'), { recursive: true });
  const files = readdirSync(INBOX).filter((f) => f.endsWith('.json'));
  let ok = 0, skip = 0;
  for (const f of files) {
    const recs = [JSON.parse(readFileSync(join(INBOX, f), 'utf8'))].flat() as ReplayRecord[];
    let allDone = true;
    for (const rec of recs) {
      if (rec.build !== SIM_BUILD && !other) {
        console.log(`· ${f}: 버전 도장이 다름(${rec.build}, 지금 ${SIM_BUILD}) — git checkout sim-${rec.build} 뒤 다시 돌리거나 --allow-other-build(근사)`);
        skip++;
        allDone = false;
        continue;
      }
      const t0 = Date.now();
      const run = extractHuman(rec, other);
      writeFileSync(join(RUNS, `${run.id}.json`), JSON.stringify(run));
      console.log(`✔ ${f} → runs/${run.id}.json · ${run.sp} ${Math.round(run.secs)}초 ${run.rank}/${run.of}등 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
      ok++;
    }
    if (allDone) renameSync(join(INBOX, f), join(INBOX, 'done', f));
  }
  console.log(`끝: ${ok}개 처리, ${skip}개 보류 · 보고서: npm run balance -- --only=none`);
}

// 실행기(run.ts)가 띄우는 일꾼: 한 층의 일 중 자기 몫(shard)을 돌려 JSON으로 쓴다.
// 사용: npx tsx balance/worker.ts <bench|duel|arena> <i> <n> <설정 JSON> <출력 파일>
import { writeFileSync } from 'node:fs';
import { V3_ROSTER, shard } from './lib';
import { benchSpecies } from './bench';
import { duel, duelJobs } from './duel';
import { arenaRound } from './arena';
import { escapeRun, escapeJobs } from './escape';

const [layer, si, sn, cfgRaw, out] = process.argv.slice(2);
const i = Number(si), n = Number(sn);
const cfg = JSON.parse(cfgRaw) as { roster?: string[]; benchLevels: number[]; benchSeeds: number[]; duelLevels: number[]; duelSeeds: number[]; arenaRounds: number; arenaSeed0: number; escapeSeeds: number[] };
const roster = cfg.roster ?? V3_ROSTER;
const t0 = Date.now();
const tick = (k: number, total: number) => {
  if (k % Math.max(1, Math.floor(total / 10)) === 0) process.stderr.write(`[${layer} ${i + 1}/${n}] ${k}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
};

let result: unknown;
if (layer === 'bench') {
  const mine = shard(roster, i, n);
  result = mine.flatMap((sp, k) => (tick(k, mine.length), benchSpecies(sp, cfg.benchLevels, cfg.benchSeeds)));
} else if (layer === 'duel') {
  const mine = shard(duelJobs(roster, cfg.duelLevels, cfg.duelSeeds), i, n);
  result = mine.map((j, k) => (tick(k, mine.length), duel(...j)));
} else if (layer === 'arena') {
  const seeds = shard(Array.from({ length: cfg.arenaRounds }, (_, k) => cfg.arenaSeed0 + k), i, n);
  result = seeds.map((s, k) => (tick(k, seeds.length), arenaRound(s)));
} else if (layer === 'escape') {
  const mine = shard(escapeJobs(roster, cfg.escapeSeeds), i, n);
  result = mine.map((j, k) => (tick(k, mine.length), escapeRun(...j)));
} else throw new Error(`모르는 층: ${layer}`);
writeFileSync(out, JSON.stringify(result));

// 밸런스 측정 실행기. 세 층(기술 실측·1:1 대전표·아레나 판)을 코어 수만큼 나눠 돌리고,
// balance/out/에 결과를 모은 뒤 보고서(report.ts)를 만든다.
//
//   npm run balance                 전체(기본, 2코어 약 20분)
//   npm run balance -- --quick      빠른 점검(약 4분)
//   npm run balance -- --only=bench 한 층만(bench·duel·arena·escape, 쉼표로 여럿)
//   npm run balance -- --baseline   이번 결과를 기준선(balance/baseline.json)으로 저장
//   npm run balance -- --jobs=4     일꾼 수(기본: CPU 수)
//   npm run balance -- --only=none  측정 없이 지난 결과로 보고서만 다시 만든다
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport, analyze } from './report';
import { loadHumanRuns } from './human';

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? 'true'] as const;
}));
const quick = args.has('quick');
const jobs = Number(args.get('jobs') ?? Math.max(1, cpus().length));
const only = (args.get('only') ?? 'bench,duel,arena,escape').split(',');

export const PROFILE = quick
  ? { name: 'quick', benchLevels: [9], benchSeeds: [1], duelLevels: [10], duelSeeds: [1], arenaRounds: 8, arenaSeed0: 0, escapeSeeds: [1] }
  : { name: 'full', benchLevels: [6, 12], benchSeeds: [1, 2], duelLevels: [7, 12], duelSeeds: [1, 2], arenaRounds: 40, arenaSeed0: 0, escapeSeeds: [1, 2, 3, 4, 5, 6] };

const OUT = join(import.meta.dirname, 'out');
mkdirSync(OUT, { recursive: true });

function runLayer(layer: string): Promise<unknown[]> {
  const t0 = Date.now();
  const parts = Array.from({ length: jobs }, (_, i) => join(OUT, `_${layer}_${i}.json`));
  return Promise.all(
    parts.map(
      (file, i) =>
        new Promise<unknown[]>((res, rej) => {
          const p = spawn('npx', ['tsx', join(import.meta.dirname, 'worker.ts'), layer, String(i), String(jobs), JSON.stringify(PROFILE), file], { stdio: ['ignore', 'inherit', 'inherit'] });
          p.on('exit', (code) => (code === 0 ? res(JSON.parse(readFileSync(file, 'utf8'))) : rej(new Error(`${layer} 일꾼 ${i} 실패(${code})`))));
        }),
    ),
  ).then((all) => {
    console.log(`✔ ${layer} ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    return all.flat();
  });
}

const t0 = Date.now();
const prev = existsSync(join(OUT, 'latest.json')) ? JSON.parse(readFileSync(join(OUT, 'latest.json'), 'utf8')) : null;
const data: Record<string, unknown> = { profile: PROFILE, at: new Date().toISOString() };
for (const layer of ['bench', 'duel', 'arena', 'escape']) {
  if (only.includes(layer)) data[layer] = await runLayer(layer);
  else if (prev && prev.profile?.name === PROFILE.name) data[layer] = prev[layer]; // 안 돌린 층은 지난 결과를 쓴다
}
writeFileSync(join(OUT, 'latest.json'), JSON.stringify(data));
data.human = loadHumanRuns(); // 실유저 지표는 매번 runs/에서 새로 읽는다(측정 결과에 섞지 않음)
const basePath = join(import.meta.dirname, 'baseline.json');
const base = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : null;
buildReport(data, base && base.at !== data.at ? base : null); // 기준선이 이번 결과면 비교하지 않는다
// 기준선 저장: 보고서는 지난 기준선과 비교해 만든 뒤, 이번 결과를 다음 비교의 기준으로 남긴다
if (args.has('baseline')) writeFileSync(basePath, JSON.stringify(analyze(data as Parameters<typeof analyze>[0])));
console.log(`끝: ${((Date.now() - t0) / 1000).toFixed(0)}초 · balance/out/report.html · docs/balance.md`);

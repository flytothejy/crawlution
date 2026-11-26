// 시뮬레이션 버전 도장: src/shared의 코드 내용으로 만든 짧은 해시를 src/shared/build.ts에 쓴다.
// 판 기록(ReplayRecord)에 붙어, 같은 도장의 코드로만 판이 똑같이 재현된다는 표시가 된다.
// npm test·build·codex 전에 자동으로 돈다(package.json pre 스크립트).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared');
export function simHash() {
  const h = createHash('sha256');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'build.ts').sort()) h.update(f + '\n' + readFileSync(join(dir, f), 'utf8') + '\n');
  return h.digest('hex').slice(0, 12);
}
const out = join(dir, 'build.ts');
const text = `// 자동 생성(scripts/stamp.mjs) — 손으로 고치지 않는다\nexport const SIM_BUILD = '${simHash()}';\n`;
if (!existsSync(out) || readFileSync(out, 'utf8') !== text) writeFileSync(out, text);
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log('SIM_BUILD', simHash());

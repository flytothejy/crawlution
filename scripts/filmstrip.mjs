// 기술 모션 필름 띠: 도감을 한 장씩 넘기며 찍어 한 장의 격자 이미지로 붙인다.
// 사용: node scripts/filmstrip.mjs <종 id> <칸 atk|def|spc|ult> <출력.png> [장수=16] [간격초=0.06] [시작초=0.3]
// 미리 도감 미리보기 서버를 켠다: npx vite preview --config vite.codex.config.ts --port 4174
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const [sp, slot, out, nArg, stepArg, startArg] = process.argv.slice(2);
const N = Number(nArg ?? 16), STEP = Number(stepArg ?? 0.06), START = Number(startArg ?? 0.3);
const tmp = `/tmp/filmstrip-${process.pid}`;
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4174/codex.html');
await p.waitForTimeout(1800);
await p.evaluate(([sp, slot]) => {
  const c = globalThis.__codex;
  c.setManual(true);
  c.renderer.opts.labels = false;
  c.renderer.opts.zoomMul = Number(new URLSearchParams(location.search).get('z') ?? 1);
  c.pickV3Sp(sp);
  c.playV3(slot);
  document.querySelector('#v3stageHost').scrollIntoView();
}, [sp, slot]);
await p.waitForTimeout(200);
await p.evaluate((t) => globalThis.__codex.advance(t), START);
const stage = p.locator('#stage');
for (let k = 0; k < N; k++) {
  await p.evaluate((t) => globalThis.__codex.advance(t), STEP);
  await stage.screenshot({ path: `${tmp}/${String(k).padStart(2, '0')}.png` });
}
await browser.close();
execFileSync('python3', ['-c', `
import glob,sys
from PIL import Image, ImageDraw
fs=sorted(glob.glob('${tmp}/*.png'))
ims=[Image.open(f) for f in fs]
w,h=ims[0].size; s=0.5; w2,h2=int(w*s),int(h*s)
cols=4; rows=(len(ims)+cols-1)//cols
W=Image.new('RGB',(cols*w2,rows*h2),'black')
for i,im in enumerate(ims):
  im=im.resize((w2,h2)); d=ImageDraw.Draw(im)
  d.rectangle([0,0,90,26],fill='black'); d.text((6,6),f'{${START}+(i+1)*${STEP}:.2f}s',fill='yellow')
  W.paste(im,((i%cols)*w2,(i//cols)*h2))
W.save('${out}')
`]);
rmSync(tmp, { recursive: true, force: true });
console.log(errs.length ? errs.join('\n') : `ok ${out}`);

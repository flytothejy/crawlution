// 화면 점검: 미리보기 서버(npx vite preview --port 4173)를 켠 뒤 node scripts/shots.mjs
// 고르기 화면 → 판 시작 → 레벨업 카드 → 성충(보조 기술) → 각성·필살기 순서로 찍는다.
import { chromium } from 'playwright-core';
const out = process.env.OUT || '/tmp/shots';
const fam = process.env.FAM || '';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
await p.goto('http://localhost:4173/?local=1'); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/0-title.png` });
await p.tap('#startBtn', { force: true }); await p.waitForTimeout(700);
if (fam) { await p.tap(`.fcard[data-f="${fam}"]`, { force: true }); await p.waitForTimeout(400); }
await p.screenshot({ path: `${out}/1-select.png` });
await p.screenshot({ path: `${out}/1b-select-full.png`, fullPage: true });
await p.tap('#goBtn', { force: true }); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/2-play.png` });
// 레벨업 카드
await p.evaluate(() => { const s = globalThis.__sim; const pl = s.snakes[0]; pl.lives = 99; s.feed(pl, 25); });
await p.waitForTimeout(900);
await p.screenshot({ path: `${out}/3-cards.png` });
// 성충까지
await p.evaluate(() => { const s = globalThis.__sim; const pl = s.snakes[0]; for (let i = 0; i < 4; i++) { while (pl.offer) s.chooseCard(pl, 0); s.feed(pl, 60); } });
await p.waitForTimeout(1600);
await p.screenshot({ path: `${out}/4-sub.png` });
// 각성 + 필살기 준비, 주변에 적
await p.evaluate(() => {
  const s = globalThis.__sim; const pl = s.snakes[0];
  for (let k = 0; k < 8; k++) { while (pl.offer) s.chooseCard(pl, 0); s.feed(pl, 120); }
  while (pl.offer) s.chooseCard(pl, 0);
  pl.ult = 100;
  for (const o of s.snakes.slice(1, 4)) { s.spawnAt(o, pl.x + 160 + Math.random() * 60, pl.y + (Math.random() - 0.5) * 200, Math.random() * 6, 40); }
});
await p.waitForTimeout(1800);
await p.screenshot({ path: `${out}/5-awake.png` });
await p.evaluate(() => { const s = globalThis.__sim; const pl = s.snakes[0]; while (pl.offer) s.chooseCard(pl, 0); });
await p.tap('#skillBtn', { force: true }); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/6-ult.png` });
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/7-ult2.png` });
// 보조 기술·주 기술
await p.evaluate(() => { const s = globalThis.__sim; const pl = s.snakes[0]; pl.skillCd = 0; pl.subCd = 0; });
await p.tap('#skillBtn', { force: true }); await p.waitForTimeout(250);
await p.screenshot({ path: `${out}/8-main.png` });
await p.tap('#subBtn', { force: true }); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/9-sub.png` });
// 결과 화면
await p.evaluate(() => { const s = globalThis.__sim; s.tick = Math.ceil(480 * 60) - 5; });
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/10-result.png` });
console.log(errs.length ? errs.join('\n') : 'no errors');
await browser.close();

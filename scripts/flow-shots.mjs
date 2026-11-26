// 새 흐름 화면 점검: 미리보기 서버(npx vite preview --port 4173)를 켠 뒤 node scripts/flow-shots.mjs → /tmp/flow/*.png
// 첫 실행(바로 판) → 판 끝 → 결과 ①·② → 홈 → 진화 계보 → 진화시키기 → 다음 판
import { chromium } from 'playwright-core';
const out = '/tmp/flow'; import { mkdirSync } from 'node:fs'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errs.push('console: ' + m.text()));
await p.goto('http://localhost:4173/?local=1'); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/1-firstrun.png` });
// 판을 바로 끝내기
await p.evaluate(() => { const s = globalThis.__sim; s.feed?.(s.snakes[0], 40); });
await p.waitForTimeout(500);
await p.evaluate(() => { globalThis.__sim.tick = 60 * 300 + 5; });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/2-result1.png` });
await p.tap('#overNext', { force: true }); await p.waitForTimeout(900);
await p.screenshot({ path: `${out}/3-gain.png` });
await p.tap('#homeBtn', { force: true }); await p.waitForTimeout(900);
await p.screenshot({ path: `${out}/4-home.png` });
await p.tap('#hCrawler', { force: true }); await p.waitForTimeout(900);
await p.screenshot({ path: `${out}/5-select.png` });
await p.screenshot({ path: `${out}/5b-select-full.png`, fullPage: true });
// 진화 가능한 종 누르고 진화
const rd = await p.$('.evotree .en.rd');
if (rd) { await rd.tap({ force: true }); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/6-ready.png` }); await p.tap('#goBtn', { force: true }); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/7-evolved.png` }); }
const prof = await p.evaluate(() => localStorage.getItem('crawlution.profile'));
console.log('profile', prof?.slice(0, 300));
await p.tap('#goBtn', { force: true }); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/8-play2.png` });
console.log('errors', errs);
await browser.close();

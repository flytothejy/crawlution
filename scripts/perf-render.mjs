// 후반 그리기 부하 측정: 미리보기 서버(npx vite preview --port 4173)를 켠 뒤 node scripts/perf-render.mjs
// 6분 지점까지 시뮬레이션을 빨리 돌리고, 내 곤충을 길게 만든 뒤 그리기 JS 시간과 레이어별 물체 수를 출력한다.
// CHROME 환경 변수로 크롬 경로를 바꿀 수 있다.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
await p.goto('http://localhost:4173/?local=1'); await p.waitForTimeout(1200);
await p.tap('#startBtn', { force: true }); await p.waitForTimeout(800);
await p.evaluate(() => {
  const s = globalThis.__sim; const pl = s.snakes[0]; pl.lives = 99; s.enemies.next = 1e9;
  for (let i = 0; i < 60 * 365; i++) { pl.invulnT = 5; s.step(); s.events.length = 0; }
  s.setForm(pl, 5, 'hunt'); s.spawnAt(pl, pl.x, pl.y, 0, 260); s.fullHeal(pl); pl.invulnT = 999;
});
await p.waitForTimeout(2000);
const r = await p.evaluate(() => new Promise((res) => {
  const R = globalThis.__renderer; const app = R.app;
  const oR = R.render.bind(R), oD = app.renderer.render.bind(app.renderer);
  let tG = 0, tP = 0, n = 0;
  R.render = (f, dt) => { const t = performance.now(); oR(f, dt); tG += performance.now() - t; n++; };
  app.renderer.render = (...a) => { const t = performance.now(); const x = oD(...a); tP += performance.now() - t; return x; };
  setTimeout(() => {
    R.render = oR; app.renderer.render = oD;
    // 레이어별 자식 수(전체/보이는 것)
    const rows = [];
    const count = (o) => { let a = 1, v = o.visible ? 1 : 0; for (const c of o.children || []) { const [x, y] = count(c); a += x; v += o.visible ? y : 0; } return [a, v]; };
    const world = app.stage.children.find((c) => c.children && c.children.length > 10) || app.stage;
    for (const layer of world.children) { const [a, v] = count(layer); if (a > 50) rows.push(`${layer.label || layer.constructor.name}: 전체 ${a}, 보이는 ${v}, 자식 ${layer.children.length}`); }
    res({ frames: n, gameJs: (tG / n).toFixed(2), pixiJs: (tP / n).toFixed(2), zoom: R.camera.zoom.toFixed(2), rows });
  }, 3000);
}));
console.log(JSON.stringify(r, null, 1));
await p.screenshot({ path: '/tmp/perf-long.png' });
await browser.close();

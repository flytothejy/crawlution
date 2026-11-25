import { chromium } from 'playwright-core';
const [sp, slot] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto('http://localhost:4174/codex.html'); await p.waitForTimeout(1500);
const out = await p.evaluate(([sp, slot]) => { const c = globalThis.__codex; c.setManual(true); c.pickV3Sp(sp); c.playV3(slot); const rows=[];
  for (let i=0;i<14;i++){ c.advance(0.15); const f = c.sim.snapshot(); rows.push((0.15*(i+1)).toFixed(2)+' '+f.snakes.slice(0,4).map(s=>s.id+':'+(s.st.length? s.st.join(','):'-')).join(' | ')); } return rows; }, [sp, slot]);
console.log(out.join('\n')); await b.close();

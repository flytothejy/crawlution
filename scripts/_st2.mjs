import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto('http://localhost:4174/codex.html'); await p.waitForTimeout(1500);
const out = await p.evaluate(() => { const c = globalThis.__codex; c.setManual(true); c.pickV3Sp('rhino'); c.playV3('spc'); const S=c.sim; const log=[];
  const orig = S.poison.bind(S); S.poison = (a,o,t,d)=>{ log.push('poison by '+a.id+'('+a.species+') -> '+o.id+' '+new Error().stack.split('\n').slice(2,4).join(' / ')); return orig(a,o,t,d); };
  c.advance(1.2); return log.concat(S.snakes.slice(0,4).map(s=>s.id+' '+s.species+' poisonT '+s.poisonT.toFixed(2))); });
console.log(out.join('\n')); await b.close();

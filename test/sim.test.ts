// 시뮬레이션 자동 점검: 화면 없이 로직만 돌린다.
import { Simulation, pointInPoly } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';

let failed = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
}

// 1) 장시간 실행: 플레이어도 봇 AI로 조종, 10분
{
  const sim = new Simulation(12345);
  const p = sim.snakes[0];
  p.hunter = true;
  let nan = false, rings = 0, crushes = 0, deaths = 0, respawns = 0, playerDeaths = 0;
  const ticks = CONFIG.tickRate * 600;
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    if (!p.alive) {
      playerDeaths++;
      // 플레이어 부활(테스트용)
      (sim as any).respawnBot(p, 20);
    }
    sim.setCommand(0, botThink(sim, p, sim.dt));
    sim.step();
    const snap = sim.snapshot();
    for (const e of snap.events) {
      if (e.type === 'ring') rings++;
      if (e.type === 'crush' && e.count > 0) crushes += e.count;
      if (e.type === 'death') deaths++;
      if (e.type === 'respawn') respawns++;
    }
    for (const s of sim.snakes) if (s.alive && !(Number.isFinite(s.x) && Number.isFinite(s.y))) nan = true;
  }
  const ms = performance.now() - t0;
  check('10분 실행 중 좌표가 깨지지 않음', !nan);
  check('죽음·부활이 일어남', deaths > 0 && respawns > 0, `죽음 ${deaths}, 부활 ${respawns}`);
  check('고리가 만들어짐', rings > 0, `고리 ${rings}회, 압착 처치 ${crushes}`);
  check('먹이 수가 유지됨', sim.foods.length > CONFIG.foodCount * 0.8 && sim.foods.length < 3000, `먹이 ${sim.foods.length}`);
  check('틱당 처리 시간 < 1ms', ms / ticks < 1, `${(ms / ticks).toFixed(3)}ms/틱`);
  console.log(`      (참고: 플레이어 사망 ${playerDeaths}회)`);
}

// 2) 고리 판정 + 압착: 플레이어가 원을 그리고, 봇 하나를 원 안에 둔다
{
  const sim = new Simulation(7);
  const p = sim.snakes[0];
  // 다른 봇은 멀리 치운다
  for (const b of sim.snakes.slice(2)) b.alive = false;
  const victim = sim.snakes[1];
  (sim as any).spawnAt(p, 0, -100, 0, 70);
  (sim as any).spawnAt(victim, 0, 0, Math.PI / 2, 8);
  let ringAt = -1, crushed = false, bounced = 0;
  for (let t = 0; t < CONFIG.tickRate * 8; t++) {
    // 플레이어: 반지름 약 90짜리 원을 돈다
    const toCenter = Math.atan2(0 - p.y, 0 - p.x);
    sim.setCommand(0, { angle: toCenter - Math.PI / 2 + 0.05, boost: false, sneak: false });
    // 희생자: 원 밖으로 도망치려 한다
    sim.setCommand(1, { angle: Math.PI / 2, boost: false, sneak: false });
    victim.cmd = { angle: Math.PI / 2, boost: false, sneak: false };
    (victim as any).isPlayer = true; // 봇 AI 끄기
    sim.step();
    for (const e of sim.snapshot().events) {
      if (e.type === 'ring' && ringAt < 0) {
        ringAt = t;
        // 고리 한가운데로 희생자를 옮긴다(도망치는 중이었다고 가정)
        (sim as any).spawnAt(victim, e.cx, e.cy, Math.PI / 2, 8);
        sim.rings[0].inside.set(1, true);
      }
      if (e.type === 'bounce' && e.snake === 1) bounced++;
      if (e.type === 'death' && e.snake === 1 && e.cause === 'crush') crushed = true;
    }
    if (crushed) break;
  }
  check('원을 돌면 고리가 닫힘', ringAt >= 0, `틱 ${ringAt}`);
  check('고리 안 곤충이 압착됨', crushed, `튕겨남 ${bounced}회`);
}

// 3) 너무 작은 고리는 무시
{
  const sim = new Simulation(9);
  const p = sim.snakes[0];
  for (const b of sim.snakes.slice(1)) b.alive = false;
  (sim as any).spawnAt(p, 0, 0, 0, 20);
  let ring = false;
  for (let t = 0; t < CONFIG.tickRate * 3; t++) {
    sim.setCommand(0, { angle: p.angle + 1.5, boost: false, sneak: false }); // 최대 회전으로 작은 원
    sim.step();
    for (const e of sim.snapshot().events) if (e.type === 'ring') ring = true;
  }
  check('짧은 몸으로 만든 작은 고리는 무시', !ring);
}

// 4) 다각형 판정
{
  const sq = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
  check('점-다각형 판정', pointInPoly(5, 5, sq) && !pointInPoly(15, 5, sq));
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log('\n모두 통과');

// 시뮬레이션 자동 점검: 화면 없이 로직만 돌린다.
import { Simulation, pointInPoly } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';
import { beats, CYCLE, SPECIES } from '../src/shared/species';
import { dmgMult } from '../src/shared/combat';
import { emptyCommand } from '../src/shared/types';

let failed = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
}

// 0) 상성: 모두 2승 2패
{
  const ok = CYCLE.every((a) => CYCLE.filter((b) => beats(a, b)).length === 2 && CYCLE.filter((b) => beats(b, a)).length === 2);
  check('5갈래 모두 2승 2패', ok);
  check('갑옷 > 사냥, 사냥 > 독, 독 > 갑옷', beats('armor', 'hunt') && beats('hunt', 'poison') && beats('poison', 'armor'));
  check('종 21개(애벌레 + 5갈래×4단계)', SPECIES.length === 21);
}

// 1) 장시간 실행: 플레이어도 봇 AI로 조종, 15분
{
  const sim = new Simulation(12345);
  const p = sim.snakes[0];
  p.hunter = true;
  p.lives = 9999;
  let maxLen = 0;
  let nan = false, rings = 0, crushes = 0, deaths = 0, molts = 0, skills = 0, cuts = 0, birds = 0, playerDeaths = 0, maxStage = 1, bossSeen = false;
  const ticks = CONFIG.tickRate * 900;
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    if (!p.alive && p.respawnT > 1.9) playerDeaths++;
    sim.setCommand(0, botThink(sim, p, sim.dt));
    sim.step();
    const snap = sim.snapshot();
    for (const e of snap.events) {
      if (e.type === 'ring') rings++;
      if (e.type === 'crush' && e.count > 0) crushes += e.count;
      if (e.type === 'death') deaths++;
      if (e.type === 'molt') molts++;
      if (e.type === 'skill') skills++;
      if (e.type === 'hit' && e.dmg > 0) cuts++;
      if (e.type === 'birdDive') birds++;
      if (e.type === 'boss') bossSeen = true;
    }
    for (const s of sim.snakes) {
      if (s.alive && !(Number.isFinite(s.x) && Number.isFinite(s.y))) nan = true;
      if (s.alive && !s.isBoss) maxStage = Math.max(maxStage, s.stage);
      if (s.alive && !s.isBoss) maxLen = Math.max(maxLen, s.segCount);
    }
  }
  const ms = performance.now() - t0;
  check('15분 실행 중 좌표가 깨지지 않음', !nan);
  check('탈피(진화)가 일어남', molts > 10, `탈피 ${molts}회, 최고 단계 ${maxStage}`);
  check('스킬이 쓰임', skills > 20, `스킬 ${skills}회`);
  check('물기·스킬 피해가 오감', cuts > 50, `피해 ${cuts}회`);
  check('새가 내려옴', birds > 0, `급강하 ${birds}회`);
  check('고리가 만들어짐', rings > 0, `고리 ${rings}회, 압착 처치 ${crushes}`);
  check('먹이 수가 유지됨', sim.foods.length > CONFIG.foodCount * 0.8 && sim.foods.length < 6000, `먹이 ${sim.foods.length}`);
  check('틱당 처리 시간 < 2ms', ms / ticks < 2, `${(ms / ticks).toFixed(3)}ms/틱`);
  console.log(`      (참고: 죽음 ${deaths}, 플레이어 사망 ${playerDeaths}, 보스 등장 ${bossSeen}, 최대 길이 ${maxLen})`);
}

// 2) 싸움 공식: 상성·단계가 피해 배수로
{
  const hunt3 = { stage: 3, lineage: 'hunt' as const, isBoss: false };
  const armor3 = { stage: 3, lineage: 'armor' as const, isBoss: false };
  const swarm2 = { stage: 2, lineage: 'swarm' as const, isBoss: false };
  check('같은 단계 상성 유리 1.5배 / 불리 0.6배', Math.abs(dmgMult(armor3, hunt3) - 1.5) < 1e-9 && Math.abs(dmgMult(hunt3, armor3) - 0.6) < 1e-9);
  check('단계가 높으면 더 아프게', dmgMult({ stage: 4, lineage: 'swarm', isBoss: false }, swarm2) > dmgMult(swarm2, { stage: 4, lineage: 'swarm', isBoss: false }));
}

// 2-1) 물기: 즉사가 아니라 체력이 깎이고, 강한 몸에 박으면 반동 피해
function duel(attacker: 'hunt' | 'armor', defender: 'hunt' | 'armor', seed: number) {
  const sim = new Simulation(seed);
  for (const b of sim.snakes.slice(3)) b.alive = false;
  sim.snakes[0].alive = false;
  const a = sim.snakes[1], d = sim.snakes[2];
  for (const s of [a, d]) (s as any).isPlayer = true;
  (sim as any).setForm(a, 3, attacker);
  (sim as any).setForm(d, 3, defender);
  (sim as any).spawnAt(d, 0, 0, 0, 40);
  (sim as any).spawnAt(a, -120, -80, Math.PI / 2, 25);
  (sim as any).fullHeal(a);
  (sim as any).fullHeal(d);
  let aHp = a.hp, dHp = d.hp, bit = false;
  for (let t = 0; t < 90 && !bit; t++) {
    a.cmd = emptyCommand(Math.PI / 2);
    d.cmd = emptyCommand(0);
    sim.step();
    for (const e of sim.snapshot().events) if (e.type === 'hit' && e.kind === 'bite' && e.snake === 2) bit = true;
  }
  return { bit, aLoss: aHp - a.hp, dLoss: dHp - d.hp, aAlive: a.alive, dAlive: d.alive };
}
{
  const r1 = duel('hunt', 'armor', 3);
  check('사냥이 갑옷 몸을 물면: 둘 다 살아 있고 사냥이 더 아픔(반동)', r1.bit && r1.aAlive && r1.dAlive && r1.aLoss > r1.dLoss, `사냥 -${r1.aLoss.toFixed(0)}, 갑옷 -${r1.dLoss.toFixed(0)}`);
  const r2 = duel('armor', 'hunt', 4);
  check('갑옷이 사냥 몸을 물면: 사냥만 크게 깎임', r2.bit && r2.dAlive && r2.dLoss > 15 && r2.aLoss === 0, `갑옷 -${r2.aLoss.toFixed(0)}, 사냥 -${r2.dLoss.toFixed(0)}`);
}

// 2-2) 웅크리기: 받는 피해 절반
{
  const sim = new Simulation(8);
  const s = sim.snakes[1];
  (sim as any).setForm(s, 3, 'swarm');
  (sim as any).fullHeal(s);
  const h0 = s.hp;
  sim.damage(s, 40, -1, 'bite', 0, 0);
  const normal = h0 - s.hp;
  (sim as any).fullHeal(s);
  const h1 = s.hp;
  s.sneaking = true;
  sim.damage(s, 40, -1, 'bite', 0, 0);
  check('웅크리면 받는 피해 절반', Math.abs(h1 - s.hp - normal / 2) <= 1, `${normal} → ${h1 - s.hp}`);
}

// 2-3) 목숨 3개: 쓰러지면 부활(단계 유지·길이 절반·무적), 셋 다 잃으면 패배
{
  const sim = new Simulation(9);
  const p = sim.snakes[0];
  (sim as any).setForm(p, 3, 'poison');
  (sim as any).spawnAt(p, 0, 0, 0, 80);
  sim.kill(p, -1, 'bite');
  let lifeLost = false;
  for (const e of sim.snapshot().events) if (e.type === 'lifeLost') lifeLost = true;
  for (let t = 0; t < CONFIG.tickRate * (CONFIG.respawnDelay + 0.2); t++) sim.step();
  check('쓰러져도 부활', lifeLost && p.alive && p.lives === 2 && sim.state === 'playing');
  check('부활하면 단계 유지·길이 절반·무적', p.stage === 3 && p.segCount === 40 && p.invulnT > 0, `${p.stage}단계, ${p.segCount}마디`);
  sim.kill(p, -1, 'bite');
  for (let t = 0; t < CONFIG.tickRate * (CONFIG.respawnDelay + 0.2); t++) sim.step();
  p.invulnT = 0;
  sim.kill(p, -1, 'bite');
  check('목숨을 다 잃으면 패배', p.lives === 0 && sim.state === 'lost');
}

// 2-4) 길이 제한 없음(길수록 느리게 자라고 굵어짐)
{
  const sim = new Simulation(10);
  const p = sim.snakes[0];
  const r0 = p.r;
  for (let k = 0; k < 400; k++) sim.feed(p, 1);
  check('1단계도 40마디를 넘어 계속 자람', p.segCount > 60, `${p.segCount}마디`);
  check('길어지면 굵어짐', p.r > r0 * 1.05, `${r0.toFixed(1)} → ${p.r.toFixed(1)}`);
}

// 3) 탈피: 카드가 나오고, 고르면 단계가 오른다
{
  const sim = new Simulation(5);
  const p = sim.snakes[0];
  for (const b of sim.snakes.slice(1)) b.alive = false;
  sim.feed(p, CONFIG.stageGauge[1]);
  sim.step();
  const hasCards = !!p.cards && p.cards.length === 3;
  const choice = p.cards ? p.cards[1] : null;
  p.cmd = { ...emptyCommand(p.angle), moltSeq: 1, moltChoice: 1 };
  for (let t = 0; t < CONFIG.tickRate * 3; t++) sim.step();
  check('게이지가 차면 카드 3장', hasCards);
  check('카드를 고르면 2단계로 탈피', p.stage === 2 && p.lineage === choice?.lineage, `${p.species.name}`);
}

// 4) 보스: 플레이어가 5단계가 되면 등장, 스킬로 깎으면 죽고 승리
{
  const sim = new Simulation(6);
  const p = sim.snakes[0];
  for (const b of sim.snakes.slice(1)) b.alive = false;
  (sim as any).setForm(p, 4, 'armor');
  p.gauge = CONFIG.stageGauge[4];
  sim.step();
  p.cmd = { ...emptyCommand(p.angle), moltSeq: 1, moltChoice: p.cards!.findIndex((c) => c.lineage === 'armor') >= 0 ? p.cards!.findIndex((c) => c.lineage === 'armor') : 0 };
  let boss = false;
  for (let t = 0; t < CONFIG.tickRate * 3; t++) {
    sim.step();
    for (const e of sim.snapshot().events) if (e.type === 'boss') boss = true;
  }
  check('5단계가 되면 보스 등장', boss && sim.bossId > 0, `${p.species.name}`);
  const b = sim.snakes[sim.bossId];
  for (let k = 0; k < 40 && b.alive; k++) sim.damage(b, 100, 0, 'skill', b.x, b.y, 'skill');
  sim.step();
  check('보스 체력을 다 깎으면 승리', !b.alive && sim.state === 'won');
}

// 5) 고리 판정 + 압착 (3단계, 60마디로 반지름 60짜리 원을 돈다)
{
  const sim = new Simulation(7);
  const p = sim.snakes[0];
  for (const b of sim.snakes.slice(2)) b.alive = false;
  const victim = sim.snakes[1];
  (victim as any).isPlayer = true;
  (sim as any).setForm(p, 3, 'hunt');
  (sim as any).setForm(victim, 1, 'none');
  (sim as any).spawnAt(p, 0, -60, 0, 60);
  (sim as any).spawnAt(victim, 0, 0, Math.PI / 2, 8);
  victim.rootT = 1e9; // 가운데에 묶어 둔다
  let ringAt = -1, crushed = false;
  for (let t = 0; t < CONFIG.tickRate * 8; t++) {
    const d = Math.hypot(p.x, p.y);
    const toCenter = Math.atan2(-p.y, -p.x);
    p.cmd = emptyCommand(toCenter - Math.PI / 2 + (d - 60) / 60);
    victim.cmd = emptyCommand(Math.PI / 2);
    sim.step();
    for (const e of sim.snapshot().events) {
      if (e.type === 'ring' && ringAt < 0) ringAt = t;
      if (e.type === 'death' && e.snake === 1 && e.cause === 'crush') crushed = true;
    }
    if (crushed) break;
  }
  check('원을 돌면 고리가 닫힘', ringAt >= 0, `틱 ${ringAt}`);
  check('고리 안 곤충이 압착됨', crushed);
}

// 5-1) 고리 최소 길이: 어느 단계든 약 35마디
{
  const segs = (2 * Math.PI * CONFIG.loopMinRadiusPerR) / CONFIG.spacingRatio;
  check('최소 고리 길이 ≈ 35마디', segs > 30 && segs < 40, `${segs.toFixed(1)}마디`);
}

// 6) 다각형 판정
{
  const sq = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
  check('점-다각형 판정', pointInPoly(5, 5, sq) && !pointInPoly(15, 5, sq));
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log('\n모두 통과');

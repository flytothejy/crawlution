// 시뮬레이션 자동 점검: 화면 없이 로직만 돌린다.
import { Simulation, pointInPoly } from '../src/shared/sim';
import { botThink } from '../src/shared/bot';
import { CONFIG } from '../src/shared/config';
import { beats, CYCLE, SPECIES } from '../src/shared/species';
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
  let nan = false, rings = 0, crushes = 0, deaths = 0, molts = 0, skills = 0, cuts = 0, birds = 0, playerDeaths = 0, maxStage = 1, bossSeen = false;
  const ticks = CONFIG.tickRate * 900;
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    if (!p.alive) {
      playerDeaths++;
      (sim as any).respawnBot(p, 3);
      sim.state = 'playing';
    }
    sim.setCommand(0, botThink(sim, p, sim.dt));
    sim.step();
    const snap = sim.snapshot();
    for (const e of snap.events) {
      if (e.type === 'ring') rings++;
      if (e.type === 'crush' && e.count > 0) crushes += e.count;
      if (e.type === 'death') deaths++;
      if (e.type === 'molt') molts++;
      if (e.type === 'skill') skills++;
      if (e.type === 'cut') cuts++;
      if (e.type === 'birdDive') birds++;
      if (e.type === 'boss') bossSeen = true;
    }
    for (const s of sim.snakes) {
      if (s.alive && !(Number.isFinite(s.x) && Number.isFinite(s.y))) nan = true;
      if (s.alive && !s.isBoss) maxStage = Math.max(maxStage, s.stage);
    }
  }
  const ms = performance.now() - t0;
  check('15분 실행 중 좌표가 깨지지 않음', !nan);
  check('탈피(진화)가 일어남', molts > 10, `탈피 ${molts}회, 최고 단계 ${maxStage}`);
  check('스킬이 쓰임', skills > 20, `스킬 ${skills}회`);
  check('몸 절단이 일어남', cuts > 0, `절단 ${cuts}회`);
  check('새가 내려옴', birds > 0, `급강하 ${birds}회`);
  check('고리가 만들어짐', rings > 0, `고리 ${rings}회, 압착 처치 ${crushes}`);
  check('먹이 수가 유지됨', sim.foods.length > CONFIG.foodCount * 0.8 && sim.foods.length < 6000, `먹이 ${sim.foods.length}`);
  check('틱당 처리 시간 < 2ms', ms / ticks < 2, `${(ms / ticks).toFixed(3)}ms/틱`);
  console.log(`      (참고: 죽음 ${deaths}, 플레이어 사망 ${playerDeaths}, 보스 등장 ${bossSeen})`);
}

// 2) 상성 판정: 같은 단계 사냥 머리가 갑옷 몸에 부딪히면 사냥이 죽는다, 반대면 몸이 잘린다
{
  const sim = new Simulation(3);
  for (const b of sim.snakes.slice(3)) b.alive = false;
  const hunt = sim.snakes[1], armor = sim.snakes[2];
  for (const s of [hunt, armor]) (s as any).isPlayer = true;
  (sim as any).setForm(hunt, 3, 'hunt');
  (sim as any).setForm(armor, 3, 'armor');
  sim.snakes[0].alive = false;
  (sim as any).spawnAt(armor, 0, 0, 0, 40); // 오른쪽을 보고 왼쪽으로 몸이 뻗음
  (sim as any).spawnAt(hunt, -120, -80, Math.PI / 2, 20); // 아래로 내려오며 갑옷 몸에 부딪힘
  let huntDied = false, text = '';
  for (let t = 0; t < 120; t++) {
    sim.setCommand(1, { ...emptyCommand(Math.PI / 2) });
    sim.setCommand(2, { ...emptyCommand(0) });
    hunt.cmd = emptyCommand(Math.PI / 2);
    armor.cmd = emptyCommand(0);
    sim.step();
    for (const e of sim.snapshot().events) {
      if (e.type === 'death' && e.snake === 1) huntDied = true;
      if (e.type === 'matchup') text = e.text;
    }
    if (huntDied) break;
  }
  check('사냥 머리 → 갑옷 몸: 사냥이 죽음', huntDied);

  const sim2 = new Simulation(4);
  for (const b of sim2.snakes.slice(3)) b.alive = false;
  sim2.snakes[0].alive = false;
  const a2 = sim2.snakes[1], h2 = sim2.snakes[2];
  for (const s of [a2, h2]) (s as any).isPlayer = true;
  (sim2 as any).setForm(a2, 3, 'armor');
  (sim2 as any).setForm(h2, 3, 'hunt');
  (sim2 as any).spawnAt(h2, 0, 0, 0, 40);
  (sim2 as any).spawnAt(a2, -120, -80, Math.PI / 2, 20);
  const before = h2.segCount;
  let cut = false, a2alive = true;
  for (let t = 0; t < 120; t++) {
    a2.cmd = emptyCommand(Math.PI / 2);
    h2.cmd = emptyCommand(0);
    sim2.step();
    for (const e of sim2.snapshot().events) if (e.type === 'cut' && e.snake === 2) cut = true;
    a2alive = a2.alive;
    if (cut) break;
  }
  check('갑옷 머리 → 사냥 몸: 사냥 몸이 잘리고 갑옷은 산다', cut && a2alive && h2.segCount < before, `${before} → ${h2.segCount}`);
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
  for (let k = 0; k < 10 && b.alive; k++) (sim as any).damageBoss(b, CONFIG.bossSkillDamage, 0);
  sim.step();
  check('보스 마디를 다 깎으면 승리', !b.alive && sim.state === 'won');
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

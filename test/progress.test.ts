// 판 밖 성장 규칙: 레벨·앰버·숙련·진화 계보·단계
import { newProfile, parseProfile, applyMatch, unlockState, unlock, levelInfo, stars, STARTERS, evoNode } from '../src/shared/progress';
import { nextTier, tierOf } from '../src/shared/tiers';
import { Simulation } from '../src/shared/sim';

let fails = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`);
  if (!ok) fails++;
};

const p = newProfile(0);
check('처음엔 계열 대표 8종만 열림', p.unlocked.length === 8 && STARTERS.length === 8);
check('진화 계보: 대표 → 1·2, 1 → 3, 2 → 4', evoNode('orchid')!.parent === 'widemantis' && evoNode('ghost')!.parent === 'smallmantis' && evoNode('smallmantis')!.parent === 'kingmantis' && evoNode('kingmantis')!.parent === null);
check('앞 종 숙련이 없으면 못 엶', unlockState(p, 'widemantis') === 'needStars');
const m = { species: 'kingmantis', rank: 2, total: 21, score: 2400, kills: 8, deaths: 4, maxLevel: 13, tier: 1, ended: true };
const g = applyMatch(p, m);
check('한 판 보상: 경험치·앰버', g.xp > 80 && g.amber > 60, `xp ${g.xp} 앰버 ${g.amber}`);
check('3등 안이면 다음 판 단계 +1', g.tierBefore === 1 && g.tierAfter === 2);
check('한 판이면 대표 종 숙련 ★1 → 다음 종이 열 수 있게 됨', g.starsAfter >= 1 && g.newlyReady.includes('widemantis'), g.newlyReady.join(','));
check('앰버로 열기', unlock(p, 'widemantis') && p.unlocked.includes('widemantis'), `남은 앰버 ${p.amber}`);
check('레벨 계산', levelInfo(0).level === 1 && levelInfo(100).level === 2 && levelInfo(250).level === 3);
check('별 계산', stars(0).stars === 0 && stars(120).stars === 1 && stars(99999).stars === 5);
check('단계 사다리', nextTier(4, 1, 21) === 4 && nextTier(2, 15, 21) === 1 && nextTier(2, 8, 21) === 2);
check('중간에 나가면 보상 절반·단계 그대로', (() => { const q = newProfile(0); const a = applyMatch(q, { ...m, ended: false }); return a.tierAfter === 1 && a.xp < g.xp; })());
check('단계 배율이 순위 점수에', applyMatch(newProfile(0), { ...m, tier: 3 }).rankScore === Math.round(2400 * tierOf(3).scoreMul));
const old = parseProfile(null, { best: 1234, species: 'ghost' });
check('예전 저장 옮기기(최고 점수·고르던 종 열기)', old.best.score === 1234 && old.unlocked.includes('ghost') && old.lastSpecies === 'ghost' && old.seenIntro);
const round = parseProfile(JSON.stringify(p));
check('저장 → 읽기 그대로', round.amber === p.amber && round.unlocked.length === p.unlocked.length && round.tier === p.tier);
check('깨진 저장은 새로', parseProfile('{oops').unlocked.length === 8);

// 단계가 시뮬레이션에 들어감
const sim = new Simulation(7, '나', { power: 1, bots: 20, map: 'grass', loadout: { species: 'rhino', form: '', traits: [] }, v3: true, tier: 4 });
const bots = sim.snakes.filter((s) => !s.isPlayer && !s.isBoss);
check('4단계: 봇이 레벨 4로 시작, 반응이 빠름', bots.every((b) => b.level === 4) && Math.max(...bots.map((b) => b.react)) <= 0.3, `레벨 ${bots[0].level}`);
const sim1 = new Simulation(7, '나', { power: 1, bots: 20, map: 'grass', loadout: { species: 'rhino', form: '', traits: [] }, v3: true });
check('단계 없음 = 1단계(예전과 같은 봇)', sim1.snakes.filter((s) => !s.isPlayer).every((b) => b.level === 1));

console.log(fails ? `${fails}개 실패` : '성장 규칙 모두 통과');
process.exit(fails ? 1 : 0);

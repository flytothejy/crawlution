// 사용: node scripts/species-report.cjs duel.json field1.json field2.json ...
const path = require('path');
const files = process.argv.slice(2).map((f) => require(path.resolve(f)));
const meta = Object.assign({}, ...files.map((f) => f.meta || {}));
const pct = (x) => (100 * x).toFixed(0) + '%';
const L = ['armor', 'hunt', 'swarm', 'poison', 'spider'];
const KO = { armor: '갑옷', hunt: '사냥', swarm: '무리', poison: '독', spider: '거미' };
for (const d of files.filter((f) => f.mode === 'ablate')) {
  console.log('\n=== 기술 가치: 같은 종끼리 한쪽만 기술 사용 (50%면 기술이 승패에 영향 없음) ===');
  for (const st of [2, 3, 4, 5]) for (const l of L) {
    const rs = d.results.filter((r) => r.stage === st && r.a === l && r.win);
    const id = Object.keys(meta).find((k) => meta[k].stage === st && meta[k].lineage === l);
    console.log(`  ${st}단계 ${meta[id].name}(${meta[id].skill}): 기술 쓴 쪽 승률 ${pct(rs.filter((r) => r.win === 'skill').length / rs.length)}`);
  }
}
for (const d of files.filter((f) => f.mode === 'duel')) {
  const R = d.results;
  console.log(`\n=== 1:1 대결 ${R.length}판 (판정승 ${R.filter((r) => r.win && r.win.endsWith('*')).length}, 무승부 ${R.filter((r) => !r.win).length}) ===`);
  console.log('자리 편향: 0번 자리 승률', pct(R.filter((r) => r.win && r.win.replace('*', '') === r.a).length / R.length));
  for (const st of [2, 3, 4, 5]) {
    const rs = R.filter((r) => r.stage === st);
    const row = (l) => {
      const mine = rs.filter((r) => r.a === l || r.b === l);
      const w = mine.filter((r) => r.win && r.win.replace('*', '') === l).length;
      return w / mine.length;
    };
    console.log(`\n${st}단계 승률(4상대 합산): ` + L.map((l) => `${KO[l]} ${pct(row(l))}`).join(' · ') + `   평균 ${(rs.reduce((s, r) => s + r.t, 0) / rs.length).toFixed(1)}초`);
    console.log('  행이 열을 이긴 비율:      ' + L.map((l) => KO[l].padEnd(3)).join(' '));
    for (const a of L) {
      console.log('   ' + KO[a].padEnd(3) + ' ' + L.map((b) => {
        if (a === b) return ' -- ';
        const m = rs.filter((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
        return pct(m.filter((r) => r.win && r.win.replace('*', '') === a).length / m.length).padStart(4);
      }).join(' '));
    }
    // 대결 한 판당 평균: 준 피해(물기/기술/기타), 기술 1회당 피해, 막은 비율
    for (const l of L) {
      const recs = rs.flatMap((r) => [r.a === l ? r.aRec : null, r.b === l ? r.bRec : null]).filter(Boolean);
      const sum = (f) => recs.reduce((s, x) => s + f(x), 0) / recs.length;
      const dealt = (k) => sum((x) => x.dealt[k] || 0);
      const all = sum((x) => Object.values(x.dealt).reduce((a, b) => a + b, 0));
      const casts = sum((x) => x.casts);
      console.log(`   ${KO[l]}: 판당 피해 ${all.toFixed(0)} (물기 ${(dealt('bite') + dealt('crit') + dealt('rage')).toFixed(0)}, 기술 ${dealt('skill').toFixed(0)}, 독 ${dealt('poison').toFixed(0)}, 반동 ${dealt('recoil').toFixed(0)}) · 기술 ${casts.toFixed(1)}회, 1회당 ${(dealt('skill') / Math.max(casts, 0.01)).toFixed(0)} · 받는 피해 감소 ${pct(1 - sum((x) => x.taken) / Math.max(sum((x) => x.raw), 1))}`);
    }
  }
}
const fields = files.filter((f) => f.mode === 'field');
if (fields.length) {
  const out = {};
  let rounds = 0;
  for (const f of fields) {
    rounds += f.rounds;
    for (const [k, v] of Object.entries(f.out)) {
      const o = (out[k] ??= { time: 0, dealt: {}, taken: 0, raw: 0, blocked: 0, kills: 0, skillKills: 0, deaths: 0, casts: 0, skillHits: 0 });
      for (const x of ['time', 'taken', 'raw', 'blocked', 'kills', 'skillKills', 'deaths', 'casts', 'skillHits']) o[x] += v[x];
      for (const [kk, vv] of Object.entries(v.dealt)) o.dealt[kk] = (o.dealt[kk] || 0) + vv;
    }
  }
  console.log(`\n=== 실전 통계 ${rounds}판 (종별, 분당) ===`);
  console.log('종 | 단계 | 산 시간(분) | 피해/분 | 기술 비중 | 기술 1회당 | 처치/분 | 쓰러짐/분 | 처치:쓰러짐 | 받은 피해 감소 | 기술 처치 비중');
  const rows = Object.entries(out).filter(([id]) => meta[id]).sort((a, b) => meta[a[0]].stage - meta[b[0]].stage || L.indexOf(meta[a[0]].lineage) - L.indexOf(meta[b[0]].lineage));
  for (const [id, v] of rows) {
    const m = meta[id], min = v.time / 60;
    const all = Object.values(v.dealt).reduce((a, b) => a + b, 0);
    console.log(`${m.name}(${KO[m.lineage] || '-'}·${m.skill}) | ${m.stage} | ${min.toFixed(0)} | ${(all / min).toFixed(0)} | ${pct((v.dealt.skill || 0) / Math.max(all, 1))} | ${((v.dealt.skill || 0) / Math.max(v.casts, 1)).toFixed(0)} | ${(v.kills / min).toFixed(2)} | ${(v.deaths / min).toFixed(2)} | ${(v.kills / Math.max(v.deaths, 1)).toFixed(2)} | ${pct(1 - v.taken / Math.max(v.raw, 1))} | ${pct(v.skillKills / Math.max(v.kills, 1))}`);
  }
}

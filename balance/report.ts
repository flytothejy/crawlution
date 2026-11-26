// 측정 결과(latest.json)를 분석해 보고서를 만든다: balance/out/report.html(보기용), docs/balance.md(저장소 기록).
// 기준선(baseline.json)이 있으면 바뀐 만큼(Δ)을 같이 보여 준다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { V3_FAMILY, V3_FAMILIES } from '../src/shared/v3';
import { kitOf, v3FamOf, V3_ROSTER, nameOf, SLOTS, avg, median, type Slot } from './lib';
import type { BenchRow } from './bench';
import type { DuelRow } from './duel';
import type { EscapeRow } from './escape';
import { mergeArena, type ArenaAgg } from './arena';
import { W, FLAG, TARGET } from './weights';

type Data = { profile: { name: string; benchLevels: number[]; duelLevels: number[]; arenaRounds: number }; at: string; bench?: BenchRow[]; duel?: DuelRow[]; arena?: Record<string, ArenaAgg>[]; escape?: EscapeRow[] };

export interface SkillA {
  sp: string;
  slot: Slot;
  name: string;
  fam: string;
  byLv: Record<number, { cd: number; dmgPct: number; dmg1Pct: number; targets: number; cc: Record<string, number>; knock: number; guard: number; heal: number; move: number; hide: number; safe: number; value: number; per10: number; ratio: number; cast: boolean }>;
  ratio: number; // 레벨 평균, 같은 칸 중간값 대비
  usePerMin: number; // 실전(아레나) 분당 사용
  useRatio: number; // 같은 칸 중간값 대비
  dmgShare: number; // 실전 피해 중 이 칸 몫
  survLift: number; // 방어 칸: 붙잡힌 교전에서 이 기술을 쓴 경우 생존율 − 안 쓴 경우(%p). 질 때 꺼내는 기술일수록 낮게 나온다(참고용)
  escLift: number; // 방어 칸: 탈출 실험에서 기술이 준비된 경우 생존율 − 대기 중(%p). 이게 기술 효과
  escBase: number; // 대기 중일 때 생존율
  flags: string[];
}
export interface SpeciesA {
  sp: string;
  name: string;
  fam: string;
  duel: Record<number, number>; // 레벨별 1:1 승률
  duelAll: number;
  duelN: number;
  kd: number;
  dpm: number;
  life: number;
  rank: number;
  lives: number;
  skillIdx: number; // 기술 실측 지수(4칸 비율 평균)
  strength: number; // 종합 강함 지수(표준점수 평균)
  flags: string[];
}

const valueOf = (r: BenchRow) => {
  const dmgPct = r.dmg / Math.max(1, r.refHp);
  let v = dmgPct * W.dmg + r.knock / 100 * W.knock + Math.max(0, r.guard) * W.guard + Math.max(0, r.heal > 0.05 ? r.heal : 0) * W.heal + Math.max(0, r.move) / 100 * W.move + r.hide * W.hide + r.safe * W.safe;
  for (const [k, s] of Object.entries(r.cc)) v += s * (W.cc[k] ?? 0);
  return { dmgPct, v };
};

function zs(xs: number[]) {
  const m = avg(xs), sd = Math.sqrt(avg(xs.map((x) => (x - m) ** 2))) || 1;
  return xs.map((x) => (x - m) / sd);
}

export function analyze(d: Data) {
  const levels = [...new Set((d.bench ?? []).map((r) => r.level))].sort((a, b) => a - b);
  // ---- 기술(실측) ----
  const skills: SkillA[] = [];
  for (const sp of V3_ROSTER)
    for (const slot of SLOTS) {
      const kit = kitOf(sp)!;
      const sk: SkillA = { sp, slot, name: kit[slot].name, fam: v3FamOf(sp)!, byLv: {}, ratio: 0, usePerMin: 0, useRatio: 0, dmgShare: 0, survLift: NaN, escLift: NaN, escBase: NaN, flags: [] };
      for (const lv of levels) {
        const rs = (d.bench ?? []).filter((r) => r.sp === sp && r.slot === slot && r.level === lv);
        if (!rs.length) continue;
        const vs = rs.map(valueOf);
        const cc: Record<string, number> = {};
        for (const r of rs) for (const [k, v] of Object.entries(r.cc)) cc[k] = (cc[k] ?? 0) + v / rs.length;
        const value = avg(vs.map((x) => x.v));
        const cd = avg(rs.map((r) => r.cd));
        sk.byLv[lv] = {
          cd, cc, value, per10: slot === 'ult' ? value : (value / Math.max(1, cd)) * 10, ratio: 0, cast: rs.every((r) => r.cast),
          dmgPct: avg(vs.map((x) => x.dmgPct)), dmg1Pct: avg(rs.map((r) => (r.dmg1 ?? NaN) / Math.max(1, r.refHp))), targets: avg(rs.map((r) => r.targets)), knock: avg(rs.map((r) => r.knock)),
          guard: avg(rs.map((r) => r.guard)), heal: avg(rs.map((r) => r.heal)), move: avg(rs.map((r) => r.move)), hide: avg(rs.map((r) => r.hide)), safe: avg(rs.map((r) => r.safe)),
        };
      }
      skills.push(sk);
    }
  for (const slot of SLOTS)
    for (const lv of levels) {
      const same = skills.filter((s) => s.slot === slot && s.byLv[lv]);
      const med = median(same.map((s) => s.byLv[lv].per10)) || 1;
      for (const s of same) s.byLv[lv].ratio = s.byLv[lv].per10 / med;
    }
  for (const s of skills) s.ratio = avg(Object.values(s.byLv).map((x) => x.ratio));

  // ---- 아레나 ----
  const arena = mergeArena(d.arena ?? []);
  for (const s of skills) {
    const a = arena[s.sp];
    if (!a) continue;
    const mins = a.secs / 60;
    s.usePerMin = (a.casts[s.slot] ?? 0) / Math.max(1e-6, mins);
    const tot = Object.values(a.dmg).reduce((x, y) => x + y, 0);
    s.dmgShare = (a.dmg[s.slot] ?? 0) / Math.max(1, tot);
    if (s.slot === 'def' && a.eng) {
      const withN = a.engDef ?? 0, withLived = a.engDefLived ?? 0, lived = a.eng - a.engDied;
      const woN = a.eng - withN, woLived = lived - withLived;
      if (withN >= 15 && woN >= 15) s.survLift = withLived / withN - woLived / woN;
    }
  }
  for (const slot of SLOTS) {
    const same = skills.filter((s) => s.slot === slot && arena[s.sp]);
    const med = median(same.map((s) => s.usePerMin)) || 1;
    for (const s of same) s.useRatio = s.usePerMin / med;
  }
  const SLOTK: Record<Slot, string> = { atk: '공격', def: '방어', spc: '특수', ult: '필살기' };
  for (const s of skills) {
    if (Object.values(s.byLv).some((x) => !x.cast)) s.flags.push('실측에서 안 나감');
    if (s.ratio >= FLAG.skillHigh) s.flags.push(`센 ${SLOTK[s.slot]} 기술(칸 중간값의 ${s.ratio.toFixed(1)}배)`);
    // 한 번 써서 바로 드러나는 효과(피해·제어·지킴·이동·숨기)가 거의 없으면 '준비·강화·아군 기술' — 실측으로는 못 잰다
    const lvs = Object.values(s.byLv);
    const silent = lvs.length > 0 && lvs.every((x) => x.dmgPct < 0.03 && x.value < 0.12);
    if (silent) s.flags.push('실측 밖(준비·강화·아군 기술이라 한 번 써서는 효과가 안 보임)');
    else if (s.ratio > 0 && s.ratio <= FLAG.skillLow) s.flags.push(`약한 ${SLOTK[s.slot]} 기술(칸 중간값의 ${s.ratio.toFixed(2)}배)`);
    if (arena[s.sp] && s.useRatio < FLAG.rarelyUsed) s.flags.push(`봇이 거의 안 씀(분당 ${s.usePerMin.toFixed(2)}회)`);
    if (s.dmgShare >= FLAG.oneSkill) s.flags.push(`실전 피해의 ${Math.round(s.dmgShare * 100)}%가 이 기술`);
    if (s.slot === 'def' && d.escape?.length) {
      const rs = d.escape.filter((r) => r.sp === s.sp);
      const on = rs.filter((r) => r.ready), off = rs.filter((r) => !r.ready);
      if (on.length && off.length) {
        s.escBase = off.filter((r) => r.lived).length / off.length;
        s.escLift = on.filter((r) => r.lived).length / on.length - s.escBase;
        if (s.escLift < FLAG.escapeMin) s.flags.push(`탈출 실험: 써도 생존율 ${sign(s.escLift, 0, 100) || '±0'}%p`);
      }
    }
  }

  // ---- 1:1 ----
  const duels = d.duel ?? [];
  const dLv = [...new Set(duels.map((r) => r.level))].sort((a, b) => a - b);
  const wr = (sp: string, lv?: number) => {
    let w = 0, n = 0;
    for (const r of duels) {
      if (lv !== undefined && r.level !== lv) continue;
      if (r.a === sp) ((w += r.win === 1 ? 1 : r.win === 0 ? 0.5 : 0), n++);
      else if (r.b === sp) ((w += r.win === 2 ? 1 : r.win === 0 ? 0.5 : 0), n++);
    }
    return { wr: n ? w / n : NaN, n };
  };
  const famM: Record<string, Record<string, { w: number; n: number }>> = {};
  for (const r of duels) {
    const fa = v3FamOf(r.a)!, fb = v3FamOf(r.b)!;
    const add = (x: string, y: string, w: number) => (((famM[x] ??= {})[y] ??= { w: 0, n: 0 }), (famM[x][y].w += w), famM[x][y].n++);
    add(fa, fb, r.win === 1 ? 1 : r.win === 0 ? 0.5 : 0);
    add(fb, fa, r.win === 2 ? 1 : r.win === 0 ? 0.5 : 0);
  }

  // ---- 종 ----
  const species: SpeciesA[] = V3_ROSTER.map((sp) => {
    const a = arena[sp];
    const mins = a ? a.secs / 60 : 0;
    const dmgTot = a ? Object.values(a.dmg).reduce((x, y) => x + y, 0) : 0;
    const all = wr(sp);
    return {
      sp, name: nameOf(sp), fam: v3FamOf(sp)!,
      duel: Object.fromEntries(dLv.map((lv) => [lv, wr(sp, lv).wr])), duelAll: all.wr, duelN: all.n,
      kd: a ? a.kills / Math.max(1, a.deaths) : NaN, dpm: a ? dmgTot / Math.max(1e-6, mins) : NaN, life: a ? a.secs / Math.max(1, a.lives) : NaN,
      rank: a && a.rankN ? a.rankPct / a.rankN : NaN, lives: a?.lives ?? 0,
      skillIdx: avg(skills.filter((s) => s.sp === sp).map((s) => s.ratio)), strength: 0, flags: [],
    };
  });
  const parts: number[][] = [];
  if (duels.length) parts.push(zs(species.map((s) => s.duelAll)));
  if (d.arena?.length) parts.push(zs(species.map((s) => s.rank)), zs(species.map((s) => Math.log(Math.max(0.05, s.kd)))));
  species.forEach((s, i) => (s.strength = parts.length ? avg(parts.map((p) => p[i])) : 0));
  for (const s of species) {
    if (s.duelAll >= FLAG.duelHigh) s.flags.push(`1:1 승률 ${pct(s.duelAll)}`);
    if (s.duelAll <= FLAG.duelLow) s.flags.push(`1:1 승률 ${pct(s.duelAll)}`);
    if (s.strength >= FLAG.z) s.flags.push('종합 강함');
    if (s.strength <= -FLAG.z) s.flags.push('종합 약함');
  }

  // ---- 계열 ----
  const families = V3_FAMILIES.map((f) => {
    const ss = species.filter((s) => s.fam === f.id);
    const a = mergeArena(ss.map((s) => (arena[s.sp] ? { [s.sp]: arena[s.sp] } : {})));
    const sum = Object.values(a).reduce((o, r) => ((o.k += r.kills), (o.d += r.deaths), (o.sec += r.secs), (o.l += r.lives), (o.dm += Object.values(r.dmg).reduce((x, y) => x + y, 0)), (o.rp += r.rankPct), (o.rn += r.rankN), o), { k: 0, d: 0, sec: 0, l: 0, dm: 0, rp: 0, rn: 0 });
    const fw = Object.entries(famM[f.id] ?? {}).filter(([k]) => k !== f.id).reduce((o, [, v]) => ((o.w += v.w), (o.n += v.n), o), { w: 0, n: 0 });
    const eg = Object.values(a).reduce((o, r) => ((o.n += r.eng ?? 0), (o.d += r.engDied ?? 0), o.t.push(...(r.ttd ?? [])), o), { n: 0, d: 0, t: [] as number[] });
    return { surv: eg.n ? 1 - eg.d / eg.n : NaN, ttd: median(eg.t), fam: f.id, name: f.name, icon: f.icon, duel: fw.n ? fw.w / fw.n : NaN, kd: sum.k / Math.max(1, sum.d), dpm: sum.dm / Math.max(1e-6, sum.sec / 60), life: sum.sec / Math.max(1, sum.l), rank: sum.rn ? sum.rp / sum.rn : NaN, strength: avg(ss.map((s) => s.strength)), skillIdx: avg(ss.map((s) => s.skillIdx)) };
  });

  // ---- 전체 건강 지표 ----
  const ttk: Record<number, number> = {}, draw: Record<number, number> = {};
  for (const lv of dLv) {
    const rs = duels.filter((r) => r.level === lv);
    ttk[lv] = median(rs.filter((r) => r.win !== 0 && r.t < 60).map((r) => r.t));
    draw[lv] = rs.filter((r) => r.win === 0).length / Math.max(1, rs.length);
  }
  const mix: Record<string, number> = {};
  for (const a of Object.values(arena)) for (const [k, v] of Object.entries(a.dmg)) mix[k] = (mix[k] ?? 0) + v;
  const mixTot = Object.values(mix).reduce((x, y) => x + y, 0) || 1;
  for (const k of Object.keys(mix)) mix[k] /= mixTot;

  const all = Object.values(arena);
  const sum = (k: 'eng' | 'engDied' | 'engCc' | 'engTime' | 'engDef' | 'engDefLived') => all.reduce((x, r) => x + (r[k] ?? 0), 0);
  const ttdAll = all.flatMap((r) => r.ttd ?? []);
  const eng = {
    n: sum('eng'), survive: 1 - sum('engDied') / Math.max(1, sum('eng')), ttd: median(ttdAll), ccShare: sum('engCc') / Math.max(1e-6, sum('engTime')),
    defUse: sum('engDef') / Math.max(1, sum('eng')), defLived: sum('engDefLived') / Math.max(1, sum('engDef')),
    ttdHist: [0, 1, 2, 3, 4, 6, 8, 12, 99].slice(0, -1).map((lo, i, arr) => ({ lo, hi: [1, 2, 3, 4, 6, 8, 12, 99][i], n: ttdAll.filter((x) => x >= lo && x < [1, 2, 3, 4, 6, 8, 12, 99][i]).length / Math.max(1, ttdAll.length) })),
  };
  const ttkAll = median(duels.filter((r) => r.win !== 0 && r.t < 60).map((r) => r.t));
  return { at: d.at, profile: d.profile, levels, duelLevels: dLv, skills, species, families, famM, global: { ttk, ttkAll, draw, mix, eng, duels: duels.length, rounds: d.arena?.length ?? 0 } };
}
type A = ReturnType<typeof analyze>;

const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '–');
const f1 = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const sign = (x: number, d = 1, k = 1) => (Number.isFinite(x) && Math.abs(x * k) >= 10 ** -d / 2 ? `${x > 0 ? '+' : ''}${(x * k).toFixed(d)}` : '');
const SLOTN: Record<Slot, string> = { atk: '공격', def: '방어', spc: '특수', ult: '필살기' };
const CCN: Record<string, string> = { stun: '기절', root: '묶임', slow: '느려짐', charm: '매혹', confuse: '혼란', fear: '공포', silence: '침묵', blind: '눈부심', mark: '표시', poison: '중독', itch: '가려움' };

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

function html(A: A, B: A | null) {
  const bSp = new Map(B?.species.map((s) => [s.sp, s]) ?? []);
  const bSk = new Map(B?.skills.map((s) => [s.sp + s.slot, s]) ?? []);
  const bFam = new Map(B?.families.map((s) => [s.fam, s]) ?? []);
  const fc = (id: string) => `#${V3_FAMILY[id as keyof typeof V3_FAMILY].color.toString(16).padStart(6, '0')}`;
  const heat = (x: number, lo = 0.3, hi = 0.7) => {
    if (!Number.isFinite(x)) return '';
    const k = Math.max(-1, Math.min(1, (x - (lo + hi) / 2) / ((hi - lo) / 2)));
    return k >= 0 ? `background:rgba(80,200,110,${(k * 0.55).toFixed(2)})` : `background:rgba(235,90,80,${(-k * 0.55).toFixed(2)})`;
  };
  const delta = (cur: number, old: number | undefined, k = 100, d = 0) => (B && old !== undefined ? `<small class="dl">${sign(cur - old, d, k)}</small>` : '');
  const flagsAll = [
    ...A.species.filter((s) => s.flags.length).map((s) => ({ k: 2 + Math.abs(s.strength), t: `<b style="color:${fc(s.fam)}">${esc(s.name)}</b> ${s.flags.join(' · ')} <small>(강함 지수 ${f1(s.strength, 2)})</small>` })),
    ...A.skills.filter((s) => s.flags.length).map((s) => ({ k: s.flags.every((f) => f.startsWith('실측 밖')) ? -1 : Math.min(1.9, Math.abs(Math.log(Math.max(0.05, s.ratio))) + (s.flags.some((f) => f.startsWith('실전')) ? 0.8 : 0)), t: `<b style="color:${fc(s.fam)}">${esc(nameOf(s.sp))}</b> ${SLOTN[s.slot]} <b>${esc(s.name)}</b>: ${s.flags.join(' · ')}` })),
  ].sort((a, b) => b.k - a.k);

  const lvH = A.duelLevels.map((l) => `<th data-n>1:1 Lv${l}</th>`).join('');
  const spRows = A.species
    .map((s) => {
      const o = bSp.get(s.sp);
      return `<tr><td class="n" style="--c:${fc(s.fam)}">${esc(s.name)}</td><td>${V3_FAMILY[s.fam as keyof typeof V3_FAMILY].icon}</td>${A.duelLevels.map((l) => `<td style="${heat(s.duel[l])}">${pct(s.duel[l])}</td>`).join('')}<td style="${heat(s.duelAll)}">${pct(s.duelAll)}${delta(s.duelAll, o?.duelAll)}</td><td style="${heat(s.kd, 0.5, 1.5)}">${f1(s.kd, 2)}${delta(s.kd, o?.kd, 1, 2)}</td><td style="${heat(s.rank)}">${pct(s.rank)}${delta(s.rank, o?.rank)}</td><td>${f1(s.dpm, 0)}</td><td>${f1(s.life, 0)}</td><td style="${heat(s.skillIdx, 0.75, 1.25)}">${f1(s.skillIdx, 2)}</td><td style="${heat(s.strength, -1, 1)}"><b>${f1(s.strength, 2)}</b>${delta(s.strength, o?.strength, 1, 2)}</td><td class="fl">${esc(s.flags.join(' · '))}</td></tr>`;
    })
    .join('');
  const lv = A.levels[A.levels.length - 1];
  const skRows = A.skills
    .map((s) => {
      const x = s.byLv[lv] ?? Object.values(s.byLv)[0];
      if (!x) return '';
      const o = bSk.get(s.sp + s.slot);
      const cc = Object.entries(x.cc).filter(([, v]) => v >= 0.05).map(([k, v]) => `${CCN[k] ?? k} ${v.toFixed(1)}`).join(' ');
      return `<tr data-slot="${s.slot}"><td class="n" style="--c:${fc(s.fam)}">${esc(nameOf(s.sp))}</td><td>${SLOTN[s.slot]}</td><td>${esc(s.name)}</td><td>${s.slot === 'ult' ? '–' : f1(x.cd, 0)}</td><td>${pct(x.dmgPct)}</td><td>${pct(x.dmg1Pct)}</td><td>${f1(x.targets, 1)}</td><td class="cc">${cc}</td><td>${x.knock >= 30 ? f1(x.knock, 0) : ''}</td><td>${x.guard >= 0.02 ? pct(x.guard) : ''}</td><td>${x.move >= 20 ? f1(x.move, 0) : ''}</td><td>${f1(x.value, 2)}</td><td style="${heat(s.ratio, 0.6, 1.4)}"><b>${f1(s.ratio, 2)}</b>${delta(s.ratio, o?.ratio, 1, 2)}</td><td style="${heat(s.useRatio, 0.4, 1.6)}">${f1(s.usePerMin, 2)}</td><td>${pct(s.dmgShare)}</td><td style="${heat(s.escLift, 0, 0.3)}">${Number.isFinite(s.escLift) ? sign(s.escLift, 0, 100) || '0' : ''}</td><td class="fl">${esc(s.flags.join(' · '))}</td></tr>`;
    })
    .join('');
  const famRows = A.families
    .map((f) => {
      const o = bFam.get(f.fam);
      return `<tr><td class="n" style="--c:${fc(f.fam)}">${f.icon} ${esc(f.name)}</td><td style="${heat(f.duel, 0.4, 0.6)}">${pct(f.duel)}${delta(f.duel, o?.duel)}</td><td style="${heat(f.kd, 0.6, 1.4)}">${f1(f.kd, 2)}${delta(f.kd, o?.kd, 1, 2)}</td><td style="${heat(f.rank, 0.4, 0.6)}">${pct(f.rank)}${delta(f.rank, o?.rank)}</td><td>${f1(f.dpm, 0)}</td><td>${f1(f.life, 0)}</td><td>${f1(f.skillIdx, 2)}</td><td>${pct(f.surv)}</td><td>${f1(f.ttd)}</td><td style="${heat(f.strength, -0.8, 0.8)}"><b>${f1(f.strength, 2)}</b></td></tr>`;
    })
    .join('');
  const fams = V3_FAMILIES.map((f) => f.id);
  const matrix = `<table class="mx"><tr><th></th>${fams.map((f) => `<th>${V3_FAMILY[f].icon}</th>`).join('')}</tr>${fams
    .map((r) => `<tr><th>${V3_FAMILY[r].icon} ${V3_FAMILY[r].name}</th>${fams.map((c) => { const v = A.famM[r]?.[c]; const x = v ? v.w / v.n : NaN; return r === c ? '<td class="dg">·</td>' : `<td style="${heat(x, 0.35, 0.65)}">${pct(x)}</td>`; }).join('')}</tr>`)
    .join('')}</table>`;
  const mix = Object.entries(A.global.mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${({ atk: '공격', def: '방어', spc: '특수', ult: '필살기', bite: '물기', etc: '그 밖(특성·본능 등)' } as Record<string, string>)[k] ?? k} ${pct(v)}`).join(' · ');

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>크롤루션 밸런스 보고서</title>
<style>
:root{--bg:#f6f3ea;--ink:#2a2418;--mut:#7a705c;--line:#e2dccb;--card:#fffdf7}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;background:var(--bg);color:var(--ink)}
header{padding:16px 16px 8px}h1{font-size:20px;margin:0}header small{color:var(--mut)}
nav{display:flex;gap:6px;padding:0 12px 8px;overflow-x:auto;position:sticky;top:0;background:var(--bg);z-index:3}
nav button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 12px;font:inherit;white-space:nowrap}
nav button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
section{display:none;padding:0 12px 24px}section.on{display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0}
.card h3{margin:0 0 6px;font-size:15px}.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.kv div{background:var(--bg);border-radius:8px;padding:8px}.kv b{display:block;font-size:18px}.kv small{color:var(--mut)}
ul.fl{margin:0;padding-left:18px}ul.fl li{margin:3px 0}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{padding:5px 7px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th{position:sticky;top:0;background:#efe9da;cursor:pointer;font-weight:600}td.n,th:first-child{text-align:left;position:sticky;left:0;background:var(--card)}
td.n{border-left:4px solid var(--c);font-weight:600}td.fl{text-align:left;color:#8a3a20;white-space:normal;min-width:180px}td.cc{text-align:left;white-space:normal;min-width:110px}
small.dl{display:block;font-size:10.5px;color:var(--mut)}
table.mx td,table.mx th{text-align:center}table.mx td.dg{color:var(--mut)}
.chips{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap}.chips button{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:4px 10px;font:inherit}.chips button.on{background:var(--ink);color:#fff}
p.note{color:var(--mut);font-size:12.5px}
</style></head><body>
<header><h1>크롤루션 밸런스 보고서</h1><small>${A.at.slice(0, 16).replace('T', ' ')} UTC · ${A.profile.name === 'full' ? '전체 측정' : '빠른 점검'} · 1:1 ${A.global.duels}판 · 아레나 ${A.global.rounds}판${B ? ` · 기준선(${B.at.slice(0, 10)}) 대비 Δ` : ''}</small></header>
<nav><button data-t="sum" class="on">요약</button><button data-t="fam">계열</button><button data-t="sp">종</button><button data-t="sk">기술</button><button data-t="how">방법</button></nav>
<section id="sum" class="on">
<div class="card"><h3>전체 지표</h3><div class="kv">${A.duelLevels.map((l) => `<div><small>1:1 결판 시간(Lv${l})</small><b>${f1(A.global.ttk[l])}초</b><small>무승부 ${pct(A.global.draw[l])}</small></div>`).join('')}<div><small>계열 1:1 승률 폭</small><b>${pct(Math.min(...A.families.map((f) => f.duel)))}–${pct(Math.max(...A.families.map((f) => f.duel)))}</b></div><div><small>계열 K/D 폭</small><b>${f1(Math.min(...A.families.map((f) => f.kd)), 2)}–${f1(Math.max(...A.families.map((f) => f.kd)), 2)}</b></div></div><p class="note">실전 피해 출처: ${mix}</p></div>
<div class="card"><h3>전투 시간 기준(balance/weights.ts)</h3><div class="kv">${[
    ['1:1 결판 시간', A.global.ttkAll, TARGET.ttk, (x: number) => `${f1(x)}초`],
    ['붙잡혀 쓰러지기까지', A.global.eng.ttd, TARGET.ttd, (x: number) => `${f1(x)}초`],
    ['붙잡힌 뒤 살아남음', A.global.eng.survive, TARGET.survive, pct],
    ['쓰러질 때 제어에 묶인 비율', A.global.eng.ccShare, TARGET.ccShare, pct],
  ].map(([n, v, t, fmt]) => { const x = v as number, [lo, hi] = t as [number, number], ok = x >= lo && x <= hi; return `<div><small>${n}</small><b style="color:${ok ? '#2f8a3e' : '#c0442c'}">${ok ? '✓' : '✗'} ${(fmt as (x: number) => string)(x)}</b><small>목표 ${(fmt as (x: number) => string)(lo)}~${(fmt as (x: number) => string)(hi)}</small></div>`; }).join('')}</div>
<p class="note">붙잡힌 교전 ${A.global.eng.n}번 · 방어 기술을 쓴 비율 ${pct(A.global.eng.defUse)} · 그중 살아남음 ${pct(A.global.eng.defLived)} · 쓰러지기까지 분포 ${A.global.eng.ttdHist.map((h) => `${h.lo}~${h.hi === 99 ? '' : h.hi}초 ${pct(h.n)}`).join(' · ')}</p></div>
<div class="card"><h3>살펴볼 것 ${flagsAll.length}개 <small>(센 순서)</small></h3><ul class="fl">${flagsAll.map((f) => `<li>${f.t}</li>`).join('') || '<li>없음</li>'}</ul></div>
</section>
<section id="fam"><div class="tw"><table class="st"><tr><th>계열</th><th>1:1 승률</th><th>K/D</th><th>판 순위</th><th>분당 피해</th><th>한 생(초)</th><th>기술 지수</th><th>붙잡혀 생존</th><th>쓰러지기까지(초)</th><th>강함 지수</th></tr>${famRows}</table></div>
<div class="card"><h3>계열 상성(행이 열을 이긴 비율)</h3><div class="tw">${matrix}</div></div></section>
<section id="sp"><p class="note">표 머리를 누르면 정렬. 강함 지수 = 1:1 승률·판 순위·K/D 표준점수 평균(0이 보통, ±${FLAG.z} 넘으면 표시).</p><div class="tw"><table class="st"><tr><th>종</th><th>계열</th>${lvH}<th>1:1 전체</th><th>K/D</th><th>판 순위</th><th>분당 피해</th><th>한 생(초)</th><th>기술 지수</th><th>강함 지수</th><th>표시</th></tr>${spRows}</table></div></section>
<section id="sk"><p class="note">Lv${lv} 실측. 가치 = 기술 한 번이 낸 효과를 '상대 체력 비율'로 환산(방법 탭). 칸 대비 = 10초당 가치 ÷ 같은 칸 중간값(필살기는 한 번당). 실전 = 아레나 분당 사용·피해 비중.</p>
<div class="chips"><button data-f="all" class="on">전체</button><button data-f="atk">공격</button><button data-f="def">방어</button><button data-f="spc">특수</button><button data-f="ult">필살기</button></div>
<div class="tw"><table class="st" id="skt"><tr><th>종</th><th>칸</th><th>기술</th><th>쿨</th><th>피해 합</th><th>1명 최대</th><th>대상</th><th>제어(초)</th><th>밀기</th><th>지킴</th><th>이동</th><th>가치</th><th>칸 대비</th><th>실전 분당</th><th>실전 비중</th><th>탈출 기여(%p)</th><th>표시</th></tr>${skRows}</table></div></section>
<section id="how"><div class="card"><h3>세 층</h3><ul class="fl">
<li><b>기술 실측</b>: 레벨 ${A.levels.join('·')}, 고정 장면에서 기술 하나를 한 번 쓴다. 공격 장면(앞에 허수아비 3마리) · 방어 장면(세 방향에서 0.5초마다 최대 체력 4%) · 이동 장면(혼자 직진). 안 쓴 판과의 차이로 잰다. 봇 판단이 끼지 않는 순수 수치.</li>
<li><b>1:1 대전표</b>: 레벨 ${A.duelLevels.join('·')}, 40종 모든 쌍 × 시드 × 자리 바꿈, 봇 AI(싸움꾼). 60초 넘으면 남은 체력으로 판정.</li>
<li><b>탈출 실험</b>: 체력 35%로 쫓기는 곤충(봇 AI)과 같은 레벨 공격자(계열 대표 8종)를 붙여, 방어 기술이 준비된 경우와 재사용 대기 중인 경우의 10초 생존율 차이를 잰다. 방어 기술이 실제로 살려 주는지 보는 통제 실험.</li>
<li><b>아레나 판</b>: 21마리 모두 봇 AI로 5분 판 ${A.global.rounds}번. 피해는 '어느 기술 칸에서 나왔나'를 시뮬레이션이 표시한다(장판·투사체·소환수·독까지 이어짐).</li></ul>
<p class="note">1:1·아레나는 봇 AI 실력이 섞인다. 기술 실측은 강한데 실전 성적이 낮으면 봇이 그 기술을 잘 못 쓰는 것일 수 있다('봇이 거의 안 씀' 표시 참고).</p></div>
<div class="card"><h3>기술 가치 환산(balance/weights.ts)</h3><p>피해: 상대 최대 체력 비율 그대로 · 1초당 ${Object.entries(W.cc).filter(([, v]) => v > 0).map(([k, v]) => `${CCN[k] ?? k} ${v}`).join(', ')} · 밀기 100당 ${W.knock} · 지킨 체력·회복: 내 최대 체력 비율 그대로 · 이동 100당 ${W.move} · 숨기 1초 ${W.hide} · 무적 1초 ${W.safe}</p>
<p class="note">기준: 1:1에서 서로 초당 상대 체력의 약 20%를 깎으므로 1초 기절 ≈ 20%. 표시 기준: 칸 대비 ${FLAG.skillHigh}배↑/${FLAG.skillLow}배↓, 1:1 ${pct(FLAG.duelHigh)}↑/${pct(FLAG.duelLow)}↓, 실전 사용이 칸 중간값의 ${pct(FLAG.rarelyUsed)} 밑, 한 칸이 실전 피해의 ${pct(FLAG.oneSkill)} 넘음.</p></div>
<div class="card"><h3>다시 재기</h3><p><code>npm run balance</code> 전체(2코어 약 20분) · <code>npm run balance:quick</code> 빠른 점검 · <code>-- --only=bench</code> 한 층만 · <code>-- --baseline</code> 기준선 저장. 종·기술을 바꾸면 빠른 점검 → 표시 확인 → 전체 측정 순서로.</p></div></section>
<script>
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button,section').forEach(e=>e.classList.remove('on'));b.classList.add('on');document.getElementById(b.dataset.t).classList.add('on');scrollTo(0,0)});
document.querySelectorAll('.chips button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.chips button').forEach(e=>e.classList.remove('on'));b.classList.add('on');document.querySelectorAll('#skt tr[data-slot]').forEach(r=>r.style.display=b.dataset.f==='all'||r.dataset.slot===b.dataset.f?'':'none')});
document.querySelectorAll('table.st').forEach(t=>t.querySelectorAll('th').forEach((th,i)=>th.onclick=()=>{const rows=[...t.querySelectorAll('tr')].slice(1);const num=v=>{const x=parseFloat(v.replace(/[^0-9.+-]/g,''));return isNaN(x)?-1e9:x};const dir=th.dataset.d=th.dataset.d==='1'?'-1':'1';rows.sort((a,b)=>{const A=a.children[i].firstChild?.textContent??'',B=b.children[i].firstChild?.textContent??'';const na=num(A),nb=num(B);return (na!==-1e9||nb!==-1e9?na-nb:A.localeCompare(B))*(+dir)});rows.forEach(r=>t.appendChild(r))}));
</script></body></html>`;
}

function md(A: A, B: A | null) {
  const bSp = new Map(B?.species.map((s) => [s.sp, s]) ?? []);
  const lines: string[] = [];
  lines.push(`# 밸런스 보고서`, '', `${A.at.slice(0, 10)} · ${A.profile.name === 'full' ? '전체 측정' : '빠른 점검'} · 1:1 ${A.global.duels}판 · 아레나 ${A.global.rounds}판${B ? ` · 기준선 ${B.at.slice(0, 10)} 대비` : ''}`, '');
  lines.push('보기용 보고서: `npm run balance` 뒤 `balance/out/report.html`. 방법은 `balance/README.md`.', '');
  lines.push('## 전체 지표', '');
  for (const l of A.duelLevels) lines.push(`- 1:1 결판 시간 중간값 Lv${l}: ${f1(A.global.ttk[l])}초 (무승부 ${pct(A.global.draw[l])})`);
  const g = A.global.eng;
  lines.push(`- 1:1 결판 시간 중간값 ${f1(A.global.ttkAll)}초 (목표 ${TARGET.ttk.join('~')}초)`, `- 붙잡혀 쓰러지기까지 중간값 ${f1(g.ttd)}초 (목표 ${TARGET.ttd.join('~')}초) · 붙잡힌 뒤 살아남음 ${pct(g.survive)} (목표 ${TARGET.survive.map(pct).join('~')}) · 쓰러질 때 제어에 묶인 비율 ${pct(g.ccShare)} (목표 ${pct(TARGET.ccShare[1])} 이하)`);
  lines.push(`- 실전 피해 출처: ${Object.entries(A.global.mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`, '');
  lines.push('## 계열', '', '| 계열 | 1:1 승률 | K/D | 판 순위 | 분당 피해 | 강함 지수 |', '|---|---|---|---|---|---|');
  for (const f of [...A.families].sort((a, b) => b.strength - a.strength)) lines.push(`| ${f.icon} ${f.name} | ${pct(f.duel)} | ${f1(f.kd, 2)} | ${pct(f.rank)} | ${f1(f.dpm, 0)} | ${f1(f.strength, 2)} |`);
  lines.push('', '## 종 (강함 지수 순)', '', '| 종 | 계열 | 1:1 | K/D | 판 순위 | 기술 지수 | 강함 지수 | Δ강함 |', '|---|---|---|---|---|---|---|---|');
  for (const s of [...A.species].sort((a, b) => b.strength - a.strength)) lines.push(`| ${s.name} | ${V3_FAMILY[s.fam as keyof typeof V3_FAMILY].name} | ${pct(s.duelAll)} | ${f1(s.kd, 2)} | ${pct(s.rank)} | ${f1(s.skillIdx, 2)} | ${f1(s.strength, 2)} | ${B ? sign(s.strength - (bSp.get(s.sp)?.strength ?? NaN), 2) : ''} |`);
  lines.push('', '## 살펴볼 것', '');
  for (const s of A.species.filter((x) => x.flags.length)) lines.push(`- **${s.name}**: ${s.flags.join(' · ')}`);
  for (const s of A.skills.filter((x) => x.flags.length)) lines.push(`- ${nameOf(s.sp)} ${SLOTN[s.slot]} **${s.name}**: ${s.flags.join(' · ')}`);
  return lines.join('\n') + '\n';
}

/** 기준선은 분석 결과(analysis)로 저장한다(원자료보다 10배 작다). 예전 원자료 기준선도 읽는다 */
export function asAnalysis(x: unknown): A {
  return (x as { species?: unknown }).species ? (x as A) : analyze(x as Data);
}

export function buildReport(data: unknown, base: unknown) {
  const A = analyze(data as Data);
  const B = base ? asAnalysis(base) : null;
  const out = join(import.meta.dirname, 'out');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.html'), html(A, B));
  writeFileSync(join(out, 'analysis.json'), JSON.stringify(A));
  writeFileSync(join(import.meta.dirname, '..', 'docs', 'balance.md'), md(A, B));
  return A;
}

// 3판 4칸 기술: 공격(Lv1) · 방어(Lv3) · 특수(Lv5) · 필살기(게이지).
// 칸마다 '어떻게 실제로 돌리나(impl)'를 붙인다.
//   main/sub/ult = 2판 엔진에 이미 있는 기술을 그대로 부른다(계열·형태를 직접 지정)
//   new/newult   = 3판에서 새로 만든 기술(skills3.ts)
import { V3_BY_ID, V3_FAMILY, V3_SPECIES, v3Kit, type V3FamId, type V3Skill, type V3Slot } from './v3';
import { FAMILY, SPECIES_BY_ID, SUBS_BY_ID, type AiKind, type FamilyId } from './species';

export type KitSlot = 'atk' | 'def' | 'spc';
export const KIT_SLOTS: KitSlot[] = ['atk', 'def', 'spc'];
/** 칸이 열리는 레벨 */
export const KIT_UNLOCK: Record<KitSlot, number> = { atk: 1, def: 3, spc: 5 };

export type KitImpl =
  | { k: 'main'; fam: FamilyId; form: string }
  | { k: 'sub'; sub: string }
  | { k: 'ult'; fam: FamilyId }
  | { k: 'new'; id: string }
  | { k: 'newult'; id: string };

export interface KitSkill {
  slot: V3Slot;
  name: string;
  icon: string;
  desc: string;
  awake?: string;
  cd: number; // 필살기는 0(게이지)
  ai: AiKind;
  range: number;
  impl: KitImpl;
}

export interface Kit {
  v3fam: V3FamId;
  atk: KitSkill;
  def: KitSkill;
  spc: KitSkill;
  ult: KitSkill;
}

/** 3판 새 기술: 이름 → 구현 번호 · 봇 판단 · 사거리 */
export const NEW_SKILLS: Record<string, { id: string; ai: AiKind; range: number; ult?: boolean }> = {
  // 지네
  '독턱 찌르기': { id: 'fangstab', ai: 'dash', range: 170 },
  '몸 말기': { id: 'coil', ai: 'defense', range: 0 },
  휘감기: { id: 'wrap', ai: 'melee', range: 130 },
  '백족 소용돌이': { id: 'vortex', ai: 'aoe', range: 320, ult: true },
  '긴 다리 채찍': { id: 'legwhip', ai: 'cone', range: 150 },
  '치켜들어 덮치기': { id: 'rear', ai: 'dash', range: 200 },
  '노린내 분비': { id: 'spray', ai: 'aoe', range: 130 },
  '빛 점액': { id: 'glowspit', ai: 'proj', range: 280 },
  // 잠자리
  물수제비: { id: 'skip', ai: 'dash', range: 240 },
  // 벌
  '붕붕 진동': { id: 'buzz', ai: 'aoe', range: 110 },
  '진흙 항아리': { id: 'mudpot', ai: 'target', range: 320 },
  // 개미
  '개미산 쏘기': { id: 'acid', ai: 'line', range: 260 },
  '굴 파기': { id: 'burrow', ai: 'escape', range: 0 },
  '개미 부르기': { id: 'antcall', ai: 'summon', range: 320 },
  '개미 떼 행진': { id: 'antriver', ai: 'line', range: 420, ult: true },
  '군단 진군': { id: 'armymarch', ai: 'summon', range: 300, ult: true },
  '잎 방패': { id: 'leafshield', ai: 'defense', range: 0 },
  '도약 침': { id: 'leapsting', ai: 'dash', range: 180 },
  '불개미 둥지': { id: 'firenest', ai: 'place', range: 180 },
  // 거미
  '껑충 덮치기': { id: 'pounce', ai: 'dash', range: 200 },
  '새끼 흩기': { id: 'babies', ai: 'aoe', range: 140 },
  // 나비
  '인분 흩뿌리기': { id: 'powder', ai: 'cone', range: 210 },
  '팔랑 비행': { id: 'flutter', ai: 'escape', range: 0 },
  '꽃향기 홀리기': { id: 'charm', ai: 'target', range: 300 },
  '나비 떼 폭풍': { id: 'bstorm', ai: 'aoe', range: 300, ult: true },
  '쓴 독 몸': { id: 'bitter', ai: 'defense', range: 0 },
  '눈알 무늬': { id: 'eyespot', ai: 'cone', range: 170 },
  '푸른 섬광': { id: 'morpho', ai: 'cone', range: 200 },
  '독털 흩뿌리기': { id: 'hairs', ai: 'cone', range: 190 },
  // 종 고유 필살기(사마귀)
  '반격 자세': { id: 'riposte', ai: 'aoe', range: 220, ult: true },
  '번개 찌르기': { id: 'blinkstab', ai: 'aoe', range: 360, ult: true },
  '꽃밭 유혹': { id: 'bloom', ai: 'aoe', range: 240, ult: true },
  '유령 처형': { id: 'reap', ai: 'target', range: 460, ult: true },
};

function toKitSkill(slot: V3Slot, v: V3Skill): KitSkill {
  const base = { slot, name: v.name, icon: v.icon, desc: v.desc, awake: v.awake, cd: v.cd ?? 0 };
  const r = v.play.real;
  if (r) {
    const fam = SPECIES_BY_ID.get(r.sp)!.family;
    if (r.kind === 'main') {
      const f = FAMILY[fam].forms.find((x) => x.id === r.form)!;
      return { ...base, ai: f.ai, range: f.range, impl: { k: 'main', fam, form: r.form! } };
    }
    if (r.kind === 'sub') {
      const sd = SUBS_BY_ID.get(r.sub!)!;
      return { ...base, ai: sd.ai, range: sd.range, impl: { k: 'sub', sub: r.sub! } };
    }
    return { ...base, ai: 'aoe', range: FAMILY[fam].ult.range, impl: { k: 'ult', fam } };
  }
  const n = NEW_SKILLS[v.name];
  if (!n) throw new Error(`3판 기술 구현 없음: ${v.name}`);
  return { ...base, ai: n.ai, range: n.range, impl: n.ult ? { k: 'newult', id: n.id } : { k: 'new', id: n.id } };
}

const cache = new Map<string, Kit>();
/** 종의 4칸 기술(3판 종이 아니면 null) */
export function kitOf(speciesId: string): Kit | null {
  const hit = cache.get(speciesId);
  if (hit) return hit;
  const sp = V3_BY_ID.get(speciesId);
  if (!sp) return null;
  const k = v3Kit(sp);
  const kit: Kit = { v3fam: sp.fam, atk: toKitSkill('atk', k.atk), def: toKitSkill('def', k.def), spc: toKitSkill('spc', k.spc), ult: toKitSkill('ult', k.ult) };
  cache.set(speciesId, kit);
  return kit;
}

/** 3판 판에 나오는 종(40) */
export const V3_ROSTER = V3_SPECIES.map((s) => s.id);
export const v3FamOf = (speciesId: string): V3FamId | null => V3_BY_ID.get(speciesId)?.fam ?? null;
export { V3_FAMILY };

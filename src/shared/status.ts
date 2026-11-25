// 상태 정리: 곤충에게 걸리는 강화(이로운 것)·이상(해로운 것)을 한 목록으로.
// 시뮬레이션이 매 장면 '남은 시간'을 보내고, 렌더러는 머리 위에 작은 아이콘 + 지속시간만큼 도는 시계 덮개로 그린다.
import type { Snake } from './sim';

export type StatusKind = 'debuff' | 'buff';

export interface StatusDef {
  id: string;
  name: string;
  kind: StatusKind;
  color: number; // 아이콘 바탕색
  desc: string; // 걸리면 어떻게 되나
  /** 남은 시간(초). 0 이하 = 없음, -1 = 시간 없이 다음 행동까지 */
  get: (s: Snake) => number;
  /** 도감 표에서 이 상태를 주는 기술을 찾을 때 쓰는 말(기술 설명·반응) */
  keys: string[];
}

const any = (...v: number[]) => Math.max(0, ...v);

export const STATUSES: StatusDef[] = [
  // ---- 상태 이상(해로움) ----
  { id: 'stun', name: '기절', kind: 'debuff', color: 0xffc83a, desc: '움직이지도 기술을 쓰지도 못한다.', get: (s) => s.stunT, keys: ['기절', '멈칫', 'stun', 'lift'] },
  { id: 'root', name: '묶임', kind: 'debuff', color: 0x6ab84a, desc: '제자리에 묶여 방향만 바꿀 수 있다.', get: (s) => s.rootT, keys: ['묶', 'root'] },
  { id: 'slow', name: '느려짐', kind: 'debuff', color: 0x5aa8ff, desc: '움직임이 느려진다.', get: (s) => any(s.slowT, s.yuckT), keys: ['느려', '느리게', 'slow'] },
  { id: 'silence', name: '침묵', kind: 'debuff', color: 0x9a8ac8, desc: '기술을 쓰지 못한다(움직임·물기는 됨).', get: (s) => s.silenceT, keys: ['침묵', 'silence'] },
  { id: 'fear', name: '공포', kind: 'debuff', color: 0xb05ae8, desc: '겁먹어 느려지고 기술을 못 쓴다.', get: (s) => s.fearT, keys: ['겁먹', '공포', 'fear'] },
  { id: 'blind', name: '눈부심', kind: 'debuff', color: 0xfff0a0, desc: '기술 조준이 흔들려 빗나가기 쉽다.', get: (s) => s.blindT, keys: ['눈부심', 'blind'] },
  { id: 'confuse', name: '혼란', kind: 'debuff', color: 0xff9ad8, desc: '조작 방향이 흔들리고 기술 조준이 빗나간다(나비만 건다).', get: (s) => s.confuseT, keys: ['혼란', 'confuse'] },
  { id: 'charm', name: '매혹', kind: 'debuff', color: 0xff6aa8, desc: '건 쪽으로 천천히 걸어간다.', get: (s) => s.charmT, keys: ['걸어오게', 'charm'] },
  { id: 'mark', name: '표식', kind: 'debuff', color: 0xff6a4a, desc: '받는 피해가 늘어난다(산·빛 표시 등).', get: (s) => s.markT, keys: ['표시', '받는 피해 +', '녹음', 'mark'] },
  { id: 'poison', name: '중독', kind: 'debuff', color: 0x6ae84a, desc: '시간이 지나며 피해를 받는다.', get: (s) => s.poisonT, keys: ['중독', '독', 'poison'] },
  { id: 'itch', name: '가려움', kind: 'debuff', color: 0xd8c870, desc: '독털이 박혀 오래 피해를 받는다.', get: (s) => s.itchT, keys: ['가려움', 'itch'] },
  { id: 'grabbed', name: '잡힘', kind: 'debuff', color: 0xc8783a, desc: '큰턱·몸에 붙들려 끌려다닌다.', get: (s) => (s.grabbedBy >= 0 ? -1 : 0), keys: ['잡아', '잡는', '휘감', '감아', 'grab'] },
  { id: 'captured', name: '포획', kind: 'debuff', color: 0x8a8a8a, desc: '그물에 갇혀 아무것도 못 한다.', get: (s) => s.netT, keys: ['포획'] },
  // ---- 상태 강화(이로움) ----
  { id: 'invuln', name: '무적', kind: 'buff', color: 0xffe066, desc: '피해를 받지 않는다.', get: (s) => any(s.invulnT, s.deadT), keys: ['무적'] },
  { id: 'shield', name: '피해 감소', kind: 'buff', color: 0x7ac8ff, desc: '받는 피해가 줄어든다(막기·웅크리기·등판).', get: (s) => any(s.reduceT, s.curlT, s.backT), keys: ['피해 −', '받는 피해 −', '막는다', '막기', 'shield', 'curl'] },
  { id: 'bitter', name: '반사', kind: 'buff', color: 0xffa040, desc: '나를 문 적이 피해를 돌려받거나 중독된다.', get: (s) => s.bitterT, keys: ['돌려받', '문 적은', 'bitter'] },
  { id: 'hidden', name: '숨음', kind: 'buff', color: 0x7ac84a, desc: '잘 보이지 않고 봇이 노리지 않는다.', get: (s) => any(s.hiddenT, s.ambushT), keys: ['안 보이', '잘 안 보임', '숨어', 'hide'] },
  { id: 'fly', name: '비행', kind: 'buff', color: 0xc8f0ff, desc: '떠 있어 몸 충돌을 무시한다.', get: (s) => s.flyT, keys: ['날아', '비행', '떠', 'fly'] },
  { id: 'ghost', name: '통과', kind: 'buff', color: 0xd8d0ff, desc: '몸 충돌 없이 지나간다(땅속·뒷걸음).', get: (s) => (s.ghostT > 0.15 ? s.ghostT : 0), keys: ['몸 충돌', '땅속', 'ghost'] },
  { id: 'power', name: '다음 공격 강화', kind: 'buff', color: 0xff5a3a, desc: '다음 공격·물기가 강해진다(치명타·마비·배율).', get: (s) => (s.fangT > 0 ? s.fangT : s.nextBiteT > 0 ? s.nextBiteT : s.nextMul > 1 || s.critNext > 0 || s.prayArmed ? -1 : 0), keys: ['다음 공격', '다음 물기', '치명타'] },
  { id: 'haste', name: '빠름', kind: 'buff', color: 0x9affd8, desc: '잠깐 빨라진다(탈출 질주·질주 출발).', get: (s) => any(s.escapeT, s.sprintT), keys: ['빨라', '질주 속도', '속도 +'] },
  { id: 'sight', name: '겹눈', kind: 'buff', color: 0x7ae0ff, desc: '숨은 적이 보이고 주변 적의 움직임이 드러난다.', get: (s) => s.compoundT, keys: ['겹눈', '숨은 적이 보'] },
  { id: 'feast', name: '폭풍 성장', kind: 'buff', color: 0xffd23f, desc: '좋아하는 먹이를 먹어 빠르게 자란다.', get: (s) => s.feastT, keys: [] },
];

export const STATUS_BY_ID = new Map(STATUSES.map((d) => [d.id, d]));

/** 스냅숏용: [상태 번호, 남은 시간(0.05초 단위 반올림)]을 나란히. -1 = 시간 없음 */
export function packStatus(s: Snake): number[] {
  const out: number[] = [];
  for (let i = 0; i < STATUSES.length; i++) {
    const t = STATUSES[i].get(s);
    if (t > 0.03 || t === -1) out.push(i, t === -1 ? -1 : Math.round(t * 20) / 20);
  }
  return out;
}

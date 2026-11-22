// 설정 값과 저장. 화면(설정 창)은 main.ts에서 이 목록으로 만든다.
import type { MapTheme } from '../shared/types';

export interface Settings {
  son: boolean; // 아들 모드: 내 곤충 5배 강하게(출시 전 삭제 예정)
  bots: number;
  map: MapTheme | 'random';
  hand: 'right' | 'left';
  btnSize: 's' | 'm' | 'l';
  sound: boolean;
  volume: number; // 0~1
  vibe: boolean;
  shake: boolean;
  labels: boolean;
  numbers: boolean;
  quality: 'auto' | 'high' | 'low';
  dist: boolean;
}

export const SON_POWER = 5;

const KEY = 'crawlution.settings';

export function defaultSettings(): Settings {
  return { son: false, bots: 20, map: 'random', hand: 'right', btnSize: 'm', sound: true, volume: 0.8, vibe: true, shake: true, labels: true, numbers: true, quality: 'auto', dist: true };
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // 자동 화질이 생기기 전 기본값(선명하게)은 자동으로 옮긴다
      if (!saved.v) saved.quality = saved.quality === 'low' ? 'low' : 'auto';
      return { ...d, ...saved };
    }
    // 예전 효과음·진동 저장값을 이어받는다
    if (localStorage.getItem('crawlution.sound') === '0') d.sound = false;
    if (localStorage.getItem('crawlution.vibe') === '0') d.vibe = false;
  } catch {
    /* 저장 불가 환경 */
  }
  return d;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, v: 2 }));
  } catch {
    /* 저장 불가 환경 */
  }
}

type Opt<T> = [T, string];
export type Row =
  | { key: keyof Settings; kind: 'toggle'; icon: string; label: string; desc?: string; special?: boolean }
  | { key: keyof Settings; kind: 'seg'; icon: string; label: string; desc?: string; options: Opt<string | number>[] }
  | { key: keyof Settings; kind: 'range'; icon: string; label: string; desc?: string };

export const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: '🎮 게임',
    rows: [
      { key: 'son', kind: 'toggle', icon: '🦸', label: '아들 모드', desc: '내 곤충이 5배 강해져요: 주는 피해 ×5, 받는 피해 ÷5 (시험용)', special: true },
      { key: 'bots', kind: 'seg', icon: '🐛', label: '다른 곤충 수', desc: '다음 판부터 적용', options: [[10, '적게'], [20, '보통'], [30, '많이']] },
      { key: 'map', kind: 'seg', icon: '🗺️', label: '맵', desc: '다음 판부터 적용', options: [['random', '무작위'], ['grass', '풀밭'], ['sand', '모래밭'], ['forest', '낙엽 숲']] },
    ],
  },
  {
    title: '✋ 조작',
    rows: [
      { key: 'hand', kind: 'seg', icon: '🤚', label: '버튼 위치', desc: '부스트·웅크리기·스킬 버튼을 놓을 쪽', options: [['right', '오른쪽'], ['left', '왼쪽']] },
      { key: 'btnSize', kind: 'seg', icon: '🔘', label: '버튼 크기', options: [['s', '작게'], ['m', '보통'], ['l', '크게']] },
    ],
  },
  {
    title: '🔊 소리',
    rows: [
      { key: 'sound', kind: 'toggle', icon: '🔊', label: '효과음' },
      { key: 'volume', kind: 'range', icon: '🎚️', label: '음량' },
      { key: 'vibe', kind: 'toggle', icon: '📳', label: '진동' },
    ],
  },
  {
    title: '🖥️ 화면',
    rows: [
      { key: 'shake', kind: 'toggle', icon: '💥', label: '화면 흔들림' },
      { key: 'numbers', kind: 'toggle', icon: '🔢', label: '피해 숫자' },
      { key: 'labels', kind: 'toggle', icon: '🏷️', label: '곤충 이름표' },
      { key: 'dist', kind: 'toggle', icon: '📊', label: '갈래 분포 표시' },
      { key: 'quality', kind: 'seg', icon: '✨', label: '화질', desc: '자동: 끊기면 알아서 해상도와 효과를 줄여요', options: [['auto', '자동'], ['high', '선명하게'], ['low', '가볍게']] },
    ],
  },
];

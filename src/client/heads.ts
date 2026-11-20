// 종별 머리: 머리판(모양·눈·뿔) 한 장 + 움직이는 부품(더듬이·큰턱·낫·송곳니).
// 텍스처 단위: 머리 반지름 R = 40px, 머리 중심 = (C, C), +x 방향을 본다.
import { Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import { lookOf } from './look';

export type PartKind = 'antenna' | 'mandible' | 'sickle' | 'fang' | 'forcipule';

export interface HeadPart {
  tex: Texture;
  ax: number; // 텍스처 안 회전축(0~1)
  ay: number;
  x: number; // 머리 중심 기준 위치(R 단위), y는 오른쪽(+) 기준. 왼쪽은 뒤집어 쓴다
  y: number;
  rot: number; // 기본 각도(오른쪽 기준)
  kind: PartKind;
  front: boolean; // 머리판 위에 그릴지
}

export interface HeadKit {
  base: Texture;
  ax: number;
  ay: number;
  parts: HeadPart[];
}

export const HR = 40; // 텍스처 속 머리 반지름
const C = 80; // 머리판 텍스처 속 머리 중심
const INK = 0x1b2a12;

type Shape = 'cute' | 'beetle' | 'dome' | 'bugeye' | 'fly' | 'mantis' | 'dragon' | 'ant' | 'bee' | 'wasp' | 'spider' | 'centipede';

const SHAPE: Record<string, Shape> = {
  caterpillar: 'cute',
  ladybug: 'dome', longhorn: 'beetle', stag: 'beetle', rhino: 'beetle',
  tiger: 'bugeye', robberfly: 'fly', mantis: 'mantis', dragonfly: 'dragon',
  weaver: 'ant', bee: 'bee', soldier: 'ant', heatball: 'bee',
  fireant: 'ant', bombardier: 'beetle', wasp: 'wasp', hornet: 'wasp',
  jumper: 'spider', orbweaver: 'spider', garden: 'spider', widow: 'spider',
  boss: 'centipede',
};

function darker(c: number, k = 0.55) {
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
}
function lighter(c: number, k = 0.45) {
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}

function eye(g: Graphics, x: number, y: number, rx: number, ry: number, color = 0x141414) {
  g.ellipse(x, y, rx, ry).fill(color).stroke({ width: 2, color: INK });
  g.circle(x + rx * 0.3, y - ry * 0.35, Math.max(1.6, rx * 0.32)).fill({ color: 0xffffff, alpha: 0.9 });
}

function facets(g: Graphics, x: number, y: number, r: number, color: number) {
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, d = (i / 9) * r * 0.75;
    g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.13).fill({ color: lighter(color, 0.35), alpha: 0.55 });
  }
}

/** 머리판 */
function drawBase(g: Graphics, species: string) {
  const look = lookOf(species);
  const shape = SHAPE[species] ?? 'beetle';
  const hc = look.head, edge = darker(hc, 0.5);
  const R = HR;
  const ol = { width: 4, color: INK };
  switch (shape) {
    case 'cute': {
      g.circle(C, C, R).fill(hc).stroke(ol);
      g.ellipse(C - 8, C - 14, 14, 9).fill({ color: 0xffffff, alpha: 0.35 });
      for (const s of [-1, 1]) {
        g.circle(C + 12, C + s * 14, 11).fill(0xffffff).stroke({ width: 2.5, color: INK });
        g.circle(C + 16, C + s * 13, 6).fill(0x161616);
        g.circle(C + 18, C + s * 13 - 2, 2.2).fill(0xffffff);
        g.ellipse(C - 2, C + s * 27, 6, 3.5).fill({ color: 0xff7aa8, alpha: 0.55 });
      }
      g.moveTo(C + 30, C - 7).quadraticCurveTo(C + 37, C, C + 30, C + 7).stroke({ width: 3, color: INK, cap: 'round' });
      break;
    }
    case 'dome': {
      // 무당벌레: 검은 앞가슴판에 흰 점, 작은 머리
      g.ellipse(C, C, R * 0.95, R).fill(0x1c1c1c).stroke(ol);
      g.ellipse(C - 2, C - 17, 10, 8).fill(0xf6f2e6);
      g.ellipse(C - 2, C + 17, 10, 8).fill(0xf6f2e6);
      g.ellipse(C + 26, C, 14, 18).fill(0x111111).stroke({ width: 3, color: INK });
      eye(g, C + 30, C - 9, 5, 5, 0xf6f2e6);
      eye(g, C + 30, C + 9, 5, 5, 0xf6f2e6);
      g.ellipse(C - 12, C - 22, 10, 5).fill({ color: 0xffffff, alpha: 0.35 });
      break;
    }
    case 'beetle': {
      g.ellipse(C, C, R, R * 0.95).fill(hc).stroke(ol);
      g.ellipse(C - 10, C - 16, 14, 7).fill({ color: 0xffffff, alpha: 0.4 });
      g.moveTo(C - 30, C).lineTo(C + 18, C).stroke({ width: 2, color: edge, alpha: 0.7 });
      eye(g, C + 22, C - 24, 6, 7);
      eye(g, C + 22, C + 24, 6, 7);
      if (species === 'rhino') {
        // 큰 뿔(끝이 갈라짐)
        g.poly([C + 8, C - 13, C + 60, C - 9, C + 78, C - 24, C + 82, C - 14, C + 72, C - 2, C + 82, C + 10, C + 76, C + 18, C + 60, C + 9, C + 8, C + 13]).fill(darker(hc, 0.8)).stroke(ol);
        g.moveTo(C + 14, C - 4).lineTo(C + 60, C - 2).stroke({ width: 3, color: 0xffffff, alpha: 0.35 });
      }
      if (species === 'bombardier') g.ellipse(C + 2, C, R * 0.5, R * 0.4).fill({ color: 0xffb04a, alpha: 0.6 });
      break;
    }
    case 'bugeye': {
      g.ellipse(C, C, R * 0.9, R * 0.85).fill(hc).stroke(ol);
      g.ellipse(C - 10, C - 12, 12, 6).fill({ color: 0xffffff, alpha: 0.45 });
      eye(g, C + 10, C - 22, 15, 13, 0x23345a);
      eye(g, C + 10, C + 22, 15, 13, 0x23345a);
      break;
    }
    case 'fly': {
      g.circle(C, C, R * 0.88).fill(hc).stroke(ol);
      for (const s of [-1, 1]) {
        g.ellipse(C + 4, C + s * 20, 18, 21).fill(0x8a2a1a).stroke({ width: 3, color: INK });
        facets(g, C + 4, C + s * 20, 18, 0x8a2a1a);
        g.circle(C + 10, C + s * 20 - 8, 3).fill({ color: 0xffffff, alpha: 0.8 });
      }
      // 수염(입 털)
      for (let k = -2; k <= 2; k++) g.moveTo(C + 28, C + k * 4).lineTo(C + 40, C + k * 6).stroke({ width: 2, color: 0xe8dcb0, cap: 'round' });
      break;
    }
    case 'mantis': {
      // 역삼각형 머리, 모서리에 큰 눈
      g.poly([C - 26, C - 40, C + 6, C - 14, C + 36, C, C + 6, C + 14, C - 26, C + 40, C - 20, C]).fill(hc).stroke({ width: 4, color: INK, join: 'round' });
      for (const s of [-1, 1]) {
        g.circle(C - 22, C + s * 34, 12).fill(lighter(hc, 0.35)).stroke({ width: 3, color: INK });
        g.moveTo(C - 22, C + s * 26).lineTo(C - 22, C + s * 42).stroke({ width: 3, color: 0x1b1b1b });
      }
      g.circle(C + 26, C, 5).fill(darker(hc, 0.6));
      break;
    }
    case 'dragon': {
      for (const s of [-1, 1]) {
        g.circle(C + 4, C + s * 19, 25).fill(0x2a8a9a).stroke({ width: 4, color: INK });
        facets(g, C + 4, C + s * 19, 25, 0x2a8a9a);
        g.ellipse(C + 12, C + s * 19 - 10, 8, 5).fill({ color: 0xffffff, alpha: 0.7 });
      }
      g.ellipse(C + 26, C, 10, 12).fill(hc).stroke({ width: 3, color: INK });
      break;
    }
    case 'ant': {
      const big = species === 'soldier' ? 1.15 : 1;
      g.circle(C - 6, C - 16 * big, 24 * big).fill(hc).stroke(ol);
      g.circle(C - 6, C + 16 * big, 24 * big).fill(hc).stroke(ol);
      g.ellipse(C + 8, C, 26 * big, 30 * big).fill(hc);
      g.moveTo(C - 26, C).lineTo(C + 10, C).stroke({ width: 2.5, color: edge });
      g.ellipse(C - 12, C - 24, 10, 5).fill({ color: 0xffffff, alpha: 0.35 });
      eye(g, C + 14, C - 26 * big, 5, 6);
      eye(g, C + 14, C + 26 * big, 5, 6);
      break;
    }
    case 'bee': {
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        g.circle(C + Math.cos(a) * R * 0.9, C + Math.sin(a) * R * 0.9, 8).fill(lighter(look.body, 0.15));
      }
      g.circle(C, C, R * 0.88).fill(hc).stroke(ol);
      for (const s of [-1, 1]) g.ellipse(C + 4, C + s * 22, 12, 17).fill(0x141414).stroke({ width: 2.5, color: INK });
      g.ellipse(C + 28, C, 9, 12).fill(look.body);
      g.ellipse(C - 8, C - 10, 10, 5).fill({ color: 0xffffff, alpha: 0.35 });
      break;
    }
    case 'wasp': {
      g.ellipse(C, C, R * 0.95, R * 0.9).fill(hc).stroke(ol);
      g.ellipse(C + 20, C, 16, 20).fill(0xf6d24a).stroke({ width: 2.5, color: INK });
      g.moveTo(C + 14, C).lineTo(C + 30, C).stroke({ width: 3, color: 0x1b1b1b });
      for (const s of [-1, 1]) {
        g.ellipse(C + 2, C + s * 23, 13, 18).fill(0x1a1a1a).stroke({ width: 3, color: INK });
        g.ellipse(C + 6, C + s * 23 - 8, 4, 3).fill({ color: 0xffffff, alpha: 0.8 });
      }
      break;
    }
    case 'spider': {
      g.circle(C - 4, C, R * 1.05).fill(hc).stroke(ol);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        g.moveTo(C - 4 + Math.cos(a) * 30, C + Math.sin(a) * 30).lineTo(C - 4 + Math.cos(a) * 40, C + Math.sin(a) * 40).stroke({ width: 2, color: lighter(hc, 0.3), alpha: 0.6 });
      }
      g.ellipse(C - 14, C - 14, 12, 6).fill({ color: 0xffffff, alpha: 0.25 });
      const big = species === 'jumper' ? 11 : 8;
      eye(g, C + 24, C - 10, big, big, 0x0e0e0e);
      eye(g, C + 24, C + 10, big, big, 0x0e0e0e);
      for (const [dx, dy, r] of [[12, -24, 5], [12, 24, 5], [2, -14, 4], [2, 14, 4], [-6, -26, 3.5], [-6, 26, 3.5]] as const) eye(g, C + dx, C + dy, r, r, 0x0e0e0e);
      if (species === 'widow') g.poly([C - 20, C - 6, C - 12, C, C - 20, C + 6, C - 28, C]).fill(0xd8262f);
      break;
    }
    case 'centipede': {
      g.ellipse(C, C, R * 1.0, R * 1.12).fill(0x8a1e14).stroke(ol);
      g.ellipse(C - 10, C - 16, 14, 7).fill({ color: 0xffffff, alpha: 0.3 });
      g.moveTo(C - 30, C).lineTo(C + 20, C).stroke({ width: 3, color: 0x5a120c });
      eye(g, C + 20, C - 22, 6, 6, 0x111111);
      eye(g, C + 20, C + 22, 6, 6, 0x111111);
      // 왕관 표시
      g.poly([C - 22, C - 12, C - 30, C - 18, C - 26, C - 6, C - 34, C, C - 26, C + 6, C - 30, C + 18, C - 22, C + 12]).fill(0xffd23f).stroke({ width: 2.5, color: INK });
      break;
    }
  }
}

// ---------- 부품 텍스처 ----------

function antennaTex(r: Renderer, kind: 'short' | 'long' | 'elbow' | 'club' | 'feather', color: number) {
  const g = new Graphics();
  const W = kind === 'long' ? 140 : 80, H = 60;
  g.rect(0, 0, W, H).fill({ color: 0, alpha: 0 });
  const y0 = 10; // 회전축 (4, 10), +y 방향(바깥)으로 휘어짐
  const st = { width: 3.5, color, cap: 'round' as const, join: 'round' as const };
  if (kind === 'long') {
    let px = 4, py = y0;
    for (let i = 1; i <= 9; i++) {
      const t = i / 9;
      const x = 4 + t * 128, y = y0 + Math.sin(t * 1.4) * 38;
      g.moveTo(px, py).lineTo(x, y).stroke({ width: 5 - t * 2.5, color: i % 2 ? color : lighter(color, 0.5), cap: 'round' });
      px = x;
      py = y;
    }
  } else if (kind === 'elbow') {
    g.moveTo(4, y0).lineTo(30, y0 + 4).lineTo(58, y0 + 26).stroke(st);
    g.circle(58, y0 + 26, 4).fill(color);
  } else if (kind === 'feather') {
    g.moveTo(4, y0).quadraticCurveTo(30, y0 + 4, 50, y0 + 28).stroke(st);
    for (let k = 1; k < 6; k++) {
      const x = 4 + k * 8, y = y0 + k * 3;
      g.moveTo(x, y).lineTo(x + 4, y + 9).stroke({ width: 1.5, color });
    }
  } else {
    g.moveTo(4, y0).quadraticCurveTo(30, y0 + 2, 46, y0 + 26).stroke(st);
    if (kind === 'club') g.ellipse(46, y0 + 28, 5, 7).fill(color);
    else g.circle(46, y0 + 26, 3.5).fill(color);
  }
  return { tex: r.generateTexture({ target: g, resolution: 2, frame: new Rectangle(0, 0, W, H) }), ax: 4 / W, ay: y0 / H };
}

/** 큰턱: 회전축 (6, 30)에서 앞(+x)으로 뻗고 안쪽(-y)으로 휜다 */
function mandibleTex(r: Renderer, size: number, color: number, teeth: boolean, branch = false) {
  const g = new Graphics();
  const W = 20 + size, H = 60;
  g.rect(0, 0, W, H).fill({ color: 0, alpha: 0 });
  const L = size;
  const pts = [6, 26, 6 + L * 0.5, 30, 6 + L * 0.9, 22, 6 + L, 8, 6 + L * 0.72, 18, 6 + L * 0.42, 22, 6, 36];
  g.poly(pts).fill(color).stroke({ width: 3, color: INK, join: 'round' });
  if (teeth) for (let k = 1; k <= 3; k++) g.poly([6 + L * 0.25 * k, 22, 6 + L * 0.25 * k + 4, 15, 6 + L * 0.25 * k + 8, 22]).fill(color).stroke({ width: 2, color: INK });
  if (branch) g.poly([6 + L * 0.55, 24, 6 + L * 0.62, 6, 6 + L * 0.7, 22]).fill(color).stroke({ width: 2.5, color: INK });
  g.moveTo(10, 27).lineTo(6 + L * 0.7, 23).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
  return { tex: r.generateTexture({ target: g, resolution: 2, frame: new Rectangle(0, 0, W, H) }), ax: 6 / W, ay: 30 / H };
}

/** 사마귀 앞다리(낫): 회전축 (6, 10) */
function sickleTex(r: Renderer, color: number) {
  const g = new Graphics();
  const W = 90, H = 60;
  g.rect(0, 0, W, H).fill({ color: 0, alpha: 0 });
  g.moveTo(6, 10).lineTo(52, 30).stroke({ width: 9, color, cap: 'round' });
  g.moveTo(6, 10).lineTo(52, 30).stroke({ width: 2, color: lighter(color, 0.4), cap: 'round' });
  g.moveTo(52, 30).lineTo(84, 10).stroke({ width: 7, color: darker(color, 0.8), cap: 'round' });
  for (let k = 0; k < 4; k++) g.poly([20 + k * 8, 16 + k * 3.5, 24 + k * 8, 26 + k * 3.5, 28 + k * 8, 19 + k * 3.5]).fill(0x2b5e1d);
  g.circle(52, 30, 5).fill(darker(color, 0.7)).stroke({ width: 2, color: INK });
  return { tex: r.generateTexture({ target: g, resolution: 2, frame: new Rectangle(0, 0, W, H) }), ax: 6 / W, ay: 10 / H };
}

function fangTex(r: Renderer, color: number, size: number) {
  const g = new Graphics();
  const W = 12 + size, H = 40;
  g.rect(0, 0, W, H).fill({ color: 0, alpha: 0 });
  g.poly([4, 14, 4 + size * 0.7, 12, 4 + size, 4, 4 + size * 0.85, 20, 4, 26]).fill(color).stroke({ width: 2.5, color: INK, join: 'round' });
  return { tex: r.generateTexture({ target: g, resolution: 2, frame: new Rectangle(0, 0, W, H) }), ax: 4 / W, ay: 20 / H };
}

const cache = new Map<string, HeadKit>();

export function headKit(r: Renderer, species: string): HeadKit {
  const hit = cache.get(species);
  if (hit) return hit;
  const look = lookOf(species);
  const shape = SHAPE[species] ?? 'beetle';
  const g = new Graphics();
  const FW = 180, FH = 160;
  g.rect(0, 0, FW, FH).fill({ color: 0, alpha: 0 });
  drawBase(g, species);
  const base = r.generateTexture({ target: g, resolution: 2, frame: new Rectangle(0, 0, FW, FH) });
  const parts: HeadPart[] = [];
  const add = (t: { tex: Texture; ax: number; ay: number }, kind: PartKind, x: number, y: number, rot: number, front = false) =>
    parts.push({ tex: t.tex, ax: t.ax, ay: t.ay, x, y, rot, kind, front });
  const ink = 0x1e1a14;

  // 더듬이
  const ant: Record<Shape, 'short' | 'long' | 'elbow' | 'club' | 'feather' | null> = {
    cute: 'club', beetle: look.feats?.includes('antennaLong') ? 'long' : 'club', dome: 'club', bugeye: 'short', fly: 'short', mantis: 'short',
    dragon: null, ant: 'elbow', bee: 'elbow', wasp: 'elbow', spider: null, centipede: 'long',
  };
  if (species === 'longhorn') ant.beetle = 'long';
  if (species === 'stag' || species === 'rhino') ant.beetle = 'feather';
  const ak = ant[shape];
  if (ak) add(antennaTex(r, ak, ak === 'long' && species !== 'boss' ? 0x2a2a30 : ink), 'antenna', 0.55, 0.32, ak === 'long' ? 0.05 : -0.15);

  // 큰턱·낫·송곳니
  if (species === 'stag') add(mandibleTex(r, 74, darker(look.head, 1.1), true, true), 'mandible', 0.72, 0.3, 0.35);
  else if (species === 'boss') add(mandibleTex(r, 52, 0x2a0a06, false), 'forcipule', 0.75, 0.42, 0.45);
  else if (shape === 'ant') add(mandibleTex(r, species === 'soldier' ? 40 : 26, darker(look.head, 0.75), true), 'mandible', 0.82, 0.22, 0.3);
  else if (species === 'tiger') add(mandibleTex(r, 30, 0xe8e0c8, true), 'mandible', 0.78, 0.22, 0.25);
  else if (species === 'hornet' || species === 'heatball' || species === 'bombardier' || species === 'longhorn') add(mandibleTex(r, 22, darker(look.head, 0.6), false), 'mandible', 0.85, 0.18, 0.25);
  if (species === 'mantis') add(sickleTex(r, look.body), 'sickle', 0.15, 0.55, 0.35);
  if (shape === 'spider') add(fangTex(r, 0x151515, species === 'widow' ? 22 : 16), 'fang', 0.95, 0.12, 0.15, true);

  const kit: HeadKit = { base, ax: C / FW, ay: C / FH, parts };
  cache.set(species, kit);
  return kit;
}

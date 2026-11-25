// 화면 그리기. 시뮬레이션 상태를 받아 그리기만 한다(상태를 바꾸지 않음).
import { Application, BitmapFont, BitmapText, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../shared/config';
import { relation } from '../shared/combat';
import { V3_BY_ID } from '../shared/v3';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import { Motion, type Pose } from './motion';
import { themeOf, type FxBit, type FxTheme } from './fxtheme';
import { FAMILY, likerOf, SPECIAL_FOODS, SPECIES_BY_ID, taste, type FamilyId } from '../shared/species';
import type { EnemyView, FxKind, GameEvent, MapTheme, MapView, MinionView, ProjView, RingView, SnakeView, TeleView, ZoneView } from '../shared/types';
import { headKit, HR, type HeadKit, type HeadPart } from './heads';
import { lookKey, lookOf } from './look';

export { lookOf, lookKey };

/** 계열 색(보스·없음은 빨강) */
export function famColor(f: FamilyId | null | undefined, k: 1 | 2 = 1): number {
  if (!f) return 0xff4a3a;
  return k === 1 ? FAMILY[f].color : FAMILY[f].color2;
}

/** 나비 날개 텍스처 크기와 뿌리 위치 */
/** 흙먼지 색(땅 색에 가까운 베이지) */
const DUST = 0xc9b48e;
/** 몸 동작 층이 맡는 기술(예전 도형 연출을 줄인다) */
const MOTION_KINDS = new Set<string>(['charge', 'push', 'lift', 'hop', 'thud', 'land', 'dive', 'snatch', 'shock', 'windup', 'lifted']);
const BW_W = 130, BW_H = 200, BW_AX = 0.04, BW_AY = 0.52;
function lighterC(c: number, k: number) {
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}

const FOOD_COLORS = [0xfff07a, 0xa6f37a, 0x7ae3f3, 0xf3a1d7, 0xffc37a, 0xd6a1ff];
const FONT = 'Jua, system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';
const TITLE = 'BlackHan, Jua, system-ui, sans-serif';
const INK = 0x1b2a12;

export interface FrameSnake extends SnakeView {
  segs: Float32Array; // 보간된 위치
}

export interface Frame {
  snakes: FrameSnake[];
  foods: Float32Array;
  rings: RingView[];
  zones: ZoneView[];
  projs: ProjView[];
  minions: MinionView[];
  teles: TeleView[];
  enemy: EnemyView | null;
  map: MapView;
  playerId: number;
}

interface Aura {
  kind: 'whirl' | 'circle' | 'lantern' | 'compound' | 'sky';
  life: number;
  max: number;
  r: number;
  col: number;
}

interface PartSprite {
  sp: Sprite;
  part: HeadPart;
  side: 1 | -1;
}

interface SnakeGfx {
  species: string; // 모습 열쇠
  level: number;
  kit: HeadKit;
  head: Container;
  wings: Sprite[];
  bw: boolean; // 나비 날개
  stinger: boolean;
  headBase: Sprite;
  parts: PartSprite[];
  label: Text;
}

/**
 * 레이어 하나에 스프라이트를 모아 두고, 이번 프레임에 보이는 것만 빌려 쓴다.
 * 곤충마다 마디 수만큼 스프라이트를 만들어 숨겨 두던 방식은 후반에 물체가 1만 개를 넘어
 * 숨긴 것까지 매 프레임 처리되며 느려졌다. 빌린 순서가 곧 그리는 순서다.
 */
class SpritePool {
  private sprites: Sprite[] = [];
  private used = 0;
  constructor(private layer: Container) {}
  begin() {
    this.used = 0;
  }
  take(tex: Texture, ax = 0.5, ay = 0.5): Sprite {
    let sp = this.sprites[this.used];
    if (!sp) {
      sp = new Sprite(tex);
      this.layer.addChild(sp);
      this.sprites.push(sp);
    }
    this.used++;
    if (sp.texture !== tex) sp.texture = tex;
    sp.anchor.set(ax, ay);
    sp.visible = true;
    sp.rotation = 0;
    sp.alpha = 1;
    sp.tint = 0xffffff;
    return sp;
  }
  end() {
    const sp = this.sprites;
    for (let i = this.used; i < sp.length; i++) sp[i].visible = false;
    // 크게 늘었다가 줄어들면 남는 것은 정리
    if (sp.length > this.used * 2 + 300) {
      for (const x of sp.splice(this.used + 150)) x.destroy();
    }
  }
  get size() {
    return this.used;
  }
}

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
  drag: number;
  /** 종별 입자: 회전 속도, 중력(+아래), 흔들림 */
  vr?: number;
  g?: number;
  sway?: number;
  fade?: number;
}

interface Popup {
  t: Text | BitmapText;
  vx: number;
  vy: number;
  g: number; // 중력(피해 숫자는 튀어 올랐다 떨어짐)
  life: number;
  max: number;
  big: number; // 등장할 때 부풀기 배율
}

interface Combo {
  t: BitmapText;
  n: number;
  total: number;
  life: number;
  x: number;
  y: number;
}

interface Shape {
  draw: (g: Graphics, k: number) => void;
  life: number;
  max: number;
}

interface Fx {
  s: Sprite;
  life: number;
  max: number;
  s0: number; // 시작·끝 크기
  s1: number;
  a0: number; // 시작 투명도
  vr: number; // 회전 속도
}

interface Ghost {
  s: Sprite;
  life: number;
  max: number;
}

/** 머리 크기 = 몸 반지름 × 이 값(진화할수록 커짐) */
function headMul(s: SnakeView) {
  if (s.isBoss) return 1.55;
  return [1.3, 1.3, 1.6, 1.78][s.stage] ?? 1.6;
}

export class GameRenderer {
  app = new Application();
  world = new Container();
  private bg!: TilingSprite;
  private foodLayer = new Container();
  private zoneGfx = new Graphics();
  private teleGfx = new Graphics();
  private minionGfx = new Graphics();
  private auras = new Map<number, Aura[]>();
  private playerFam: FamilyId | null = null;
  private playerLv = 1;
  reveal = false;
  private ringGfx = new Graphics();
  private markGfx = new Graphics();
  private shadowLayer = new Container();
  private glowLayer = new Container();
  private legLayer = new Container();
  private bodyLayer = new Container();
  private ghostLayer = new Container();
  private headLayer = new Container();
  private statusGfx = new Graphics();
  private shapeGfx = new Graphics();
  private fxLayer = new Container();
  private enemyGfx = new Graphics();
  private mapLayer = new Container();
  private deco = new Container();
  private screenGfx = new Graphics();
  private mapKey = '';
  private combos = new Map<number, Combo>();
  private hpGfx = new Graphics();
  private labelLayer = new Container();
  private popupLayer = new Container();
  private tex: Record<string, Texture> = {};
  private snakes = new Map<number, SnakeGfx>();
  private shadowPool = new SpritePool(this.shadowLayer);
  private glowPool = new SpritePool(this.glowLayer);
  private legPool = new SpritePool(this.legLayer);
  private bodyPool = new SpritePool(this.bodyLayer);
  private portraits = new Map<string, string>();
  private foodSprites: Sprite[] = [];
  private foodBackLayer = new Container();
  private foodBack: Sprite[] = [];
  private foodBadge: Sprite[] = [];
  private particles: Particle[] = [];
  private freeParticles: Sprite[] = [];
  private popups: Popup[] = [];
  private shapes: Shape[] = [];
  private ghosts: Ghost[] = [];
  /** 종별 모션: 기술을 쓴 곤충 몸에 잠깐 붙는 연출 */
  private flair = new Map<number, { th: FxTheme; t: number; max: number }>();
  /** 몸 동작(예고·발동·여운 자세) */
  readonly motion = new Motion();
  /** 화면 충격파(묵직한 착지·필살기) */
  private waves: { f: ShockwaveFilter; x: number; y: number; t: number; life: number }[] = [];
  /** 곤충마다 마지막으로 그린 머리 위치(여운 연출용) */
  private lastHead = new Map<number, [number, number]>();
  private fxs: Fx[] = [];
  private decalLayer = new Container();
  private fxSpriteLayer = new Container();
  private screenFx = new Graphics();
  private speedLines = 0;
  private screenFlash = 0;
  private flashT = new Map<number, number>(); // 맞았을 때 하얗게 번쩍
  private biteT = new Map<number, number>(); // 물 때 큰턱 닫힘
  private strikeT = new Map<number, number>(); // 스킬 쓸 때 낫·턱 휘두름
  private pulseT = new Map<number, number>(); // 탈피 직후 몸 부풀기
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private punch = 0;
  private shake = 0;
  private time = 0;
  private view = { x0: 0, x1: 0, y0: 0, y1: 0 };
  /** 화면 설정 */
  opts = { shake: true, labels: true, numbers: true, zoomMul: 1 };
  private sizeHost: HTMLElement | Window = window;

  /** resizeTo: 화면 전체(기본) 또는 도감처럼 상자 하나 */
  async init(parent: HTMLElement, resizeTo: HTMLElement | Window = window) {
    this.sizeHost = resizeTo;
    await this.app.init({
      resizeTo,
      antialias: true,
      background: 0x1f3a1c,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    parent.appendChild(this.app.canvas);
    this.makeTextures();
    // 피해 숫자용 비트맵 글꼴: 매번 글자 텍스처를 새로 만들지 않아 후반에도 가볍다
    BitmapFont.install({
      name: 'dmg',
      style: { fontFamily: TITLE, fontSize: 64, fill: 0xffffff, stroke: { color: INK, width: 12, join: 'round' }, dropShadow: { color: 0x000000, alpha: 0.4, distance: 5, angle: Math.PI / 2, blur: 0 } },
      chars: [['0', '9'], '!', '연타급소역습필살 ×+-'],
      resolution: 1,
      padding: 8,
    });

    this.bg = new TilingSprite({ texture: this.tex.ground_grass, width: CONFIG.arenaRadius * 2 + 400, height: CONFIG.arenaRadius * 2 + 400 });
    this.bg.position.set(-CONFIG.arenaRadius - 200, -CONFIG.arenaRadius - 200);
    const mask = new Graphics().circle(0, 0, CONFIG.arenaRadius).fill(0xffffff);
    this.bg.mask = mask;
    const border = new Graphics()
      .circle(0, 0, CONFIG.arenaRadius + 14)
      .stroke({ width: 28, color: 0x3d6b2f, alpha: 1 })
      .circle(0, 0, CONFIG.arenaRadius + 2)
      .stroke({ width: 4, color: 0xb8e08a, alpha: 0.6 });
    this.ghostLayer.blendMode = 'add';
    this.glowLayer.blendMode = 'add';

    this.world.addChild(
      this.bg, mask, this.deco, border, this.mapLayer, this.decalLayer, this.zoneGfx, this.teleGfx, this.foodBackLayer, this.foodLayer, this.ringGfx, this.markGfx,
      this.shadowLayer, this.glowLayer, this.legLayer, this.bodyLayer, this.ghostLayer, this.headLayer, this.minionGfx, this.statusGfx, this.shapeGfx,
      this.fxSpriteLayer, this.fxLayer, this.enemyGfx, this.hpGfx, this.labelLayer, this.popupLayer,
    );
    this.fxSpriteLayer.blendMode = 'add';
    this.app.stage.addChild(this.world, this.screenGfx, this.screenFx);
  }

  private makeTextures() {
    const r = this.app.renderer;
    const body = new Graphics();
    body.circle(32, 32, 32).fill(0x7c7c7c);
    body.circle(32, 31, 28.5).fill(0xd2d2d2);
    body.circle(31, 29, 23).fill(0xffffff);
    this.tex.body = r.generateTexture({ target: body, resolution: 2 });

    const shine = new Graphics();
    shine.ellipse(20, 12, 14, 8).fill({ color: 0xffffff, alpha: 0.75 });
    shine.ellipse(22, 13, 7, 4).fill({ color: 0xffffff, alpha: 0.9 });
    this.tex.shine = r.generateTexture({ target: shine, resolution: 2 });

    const spot = new Graphics();
    spot.circle(16, 16, 16).fill(0xffffff);
    this.tex.spot = r.generateTexture({ target: spot, resolution: 2 });

    const gem = new Graphics();
    gem.poly([16, 0, 32, 16, 16, 32, 0, 16]).fill(0xffffff).stroke({ width: 3, color: 0x2a2a2a });
    gem.poly([16, 4, 24, 14, 16, 12, 8, 14]).fill({ color: 0xffffff, alpha: 0.9 });
    this.tex.gem = r.generateTexture({ target: gem, resolution: 2 });

    // 기술 연출용: 초승달 칼날, 충격파 고리, 번쩍임, 그을린 자국
    const slash = new Graphics();
    for (let k = 0; k < 14; k++) {
      const rr = 118 - k * 1.6, a0 = -1.25 + k * 0.02, a1 = 1.25 - k * 0.02;
      slash.moveTo(128 + Math.cos(a0) * rr, 128 + Math.sin(a0) * rr).arc(128, 128, rr, a0, a1).stroke({ width: 30 - k * 2, color: 0xffffff, alpha: 0.05 + k * 0.05, cap: 'round' });
    }
    this.tex.slash = r.generateTexture({ target: slash, resolution: 1, frame: new Rectangle(0, 0, 256, 256) });
    const ring = new Graphics();
    for (let k = 0; k < 12; k++) ring.circle(128, 128, 100 + k * 1.5).stroke({ width: 3, color: 0xffffff, alpha: 0.08 + (k < 6 ? k : 12 - k) * 0.12 });
    this.tex.ring = r.generateTexture({ target: ring, resolution: 1, frame: new Rectangle(0, 0, 256, 256) });
    const flare = new Graphics();
    for (let i = 14; i >= 1; i--) flare.circle(128, 128, i * 7).fill({ color: 0xffffff, alpha: 0.05 + (14 - i) * 0.012 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, L = k % 2 ? 120 : 80;
      flare.poly([128 + Math.cos(a - 0.06) * 12, 128 + Math.sin(a - 0.06) * 12, 128 + Math.cos(a) * L, 128 + Math.sin(a) * L, 128 + Math.cos(a + 0.06) * 12, 128 + Math.sin(a + 0.06) * 12]).fill({ color: 0xffffff, alpha: 0.5 });
    }
    this.tex.flare = r.generateTexture({ target: flare, resolution: 1, frame: new Rectangle(0, 0, 256, 256) });
    const scorch = new Graphics();
    let sd = 11;
    const srnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 18; k++) scorch.circle(128 + (srnd() - 0.5) * 120, 128 + (srnd() - 0.5) * 120, 20 + srnd() * 40).fill({ color: 0xffffff, alpha: 0.12 });
    this.tex.scorch = r.generateTexture({ target: scorch, resolution: 1, frame: new Rectangle(0, 0, 256, 256) });

    const glow = new Graphics();
    for (let i = 12; i >= 1; i--) glow.circle(48, 48, 16 + i * 2.6).fill({ color: 0xffffff, alpha: 0.055 });
    this.tex.glow = r.generateTexture({ target: glow, resolution: 1 });

    // 다리 한 쌍(+y, -y로 뻗음). 가운데가 (32,32)
    const legs = new Graphics();
    legs.moveTo(32, 32).lineTo(37, 7).lineTo(28, 0).stroke({ width: 4.5, color: 0x2a2018, cap: 'round', join: 'round' });
    legs.moveTo(32, 32).lineTo(37, 57).lineTo(28, 64).stroke({ width: 4.5, color: 0x2a2018, cap: 'round', join: 'round' });
    this.tex.legs = r.generateTexture({ target: legs, resolution: 2 });

    const wing = new Graphics();
    wing.ellipse(32, 14, 30, 13).fill({ color: 0xffffff, alpha: 0.55 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
    wing.moveTo(4, 14).lineTo(60, 14).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
    this.tex.wing = r.generateTexture({ target: wing, resolution: 2 });

    const sting = new Graphics();
    sting.poly([0, 8, 26, 12, 0, 16]).fill(0x1b1b1b);
    this.tex.sting = r.generateTexture({ target: sting, resolution: 2 });

    const shadow = new Graphics();
    for (let i = 10; i >= 1; i--) shadow.circle(40, 40, 22 + i * 1.8).fill({ color: 0x000000, alpha: 0.05 });
    this.tex.shadow = r.generateTexture({ target: shadow, resolution: 1 });

    const food = new Graphics();
    for (let i = 8; i >= 1; i--) food.circle(32, 32, 11 + i * 2.4).fill({ color: 0xffffff, alpha: 0.06 });
    food.circle(32, 32, 11.5).fill(0x3a3a3a); // 진한 테두리: 어떤 바닥에서도 잘 보이게
    food.circle(32, 32, 9.5).fill(0xffffff);
    food.circle(29, 28.5, 3.5).fill({ color: 0xffffff, alpha: 1 });
    this.tex.food = r.generateTexture({ target: food, resolution: 2 });

    // 보석: 회색 면으로 그려 두고 능력치 색으로 물들인다
    const dia = new Graphics();
    const P = (pts: number[], c: number) => dia.poly(pts).fill(c);
    dia.poly([8, 26, 20, 12, 44, 12, 56, 26, 32, 56]).fill(INK).stroke({ width: 6, color: INK, join: 'round' });
    P([11, 26, 21, 15, 27, 26], 0xe6e6e6);
    P([21, 15, 43, 15, 37, 26, 27, 26], 0xffffff);
    P([43, 15, 53, 26, 37, 26], 0xcfcfcf);
    P([11, 26, 27, 26, 32, 51], 0xb4b4b4);
    P([27, 26, 37, 26, 32, 51], 0xd8d8d8);
    P([37, 26, 53, 26, 32, 51], 0x8e8e8e);
    P([24, 17, 30, 17, 26, 22], 0xffffff);
    this.tex.diamond = r.generateTexture({ target: dia, resolution: 2 });
    // 특별 먹이: 접시 위 그림 글자
    const plate = new Graphics().circle(34, 34, 30).fill(0xffffff).stroke({ width: 5, color: INK });
    plate.circle(34, 34, 24).stroke({ width: 3, color: 0xffffff, alpha: 0.6 });
    this.tex.plate = r.generateTexture({ target: plate, resolution: 2 });
    for (const f of SPECIAL_FOODS) {
      const t = new Text({ text: f.icon, style: { fontSize: 60, fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif', padding: 6 } });
      this.tex['sp_' + f.id] = r.generateTexture({ target: t, resolution: 1 });
      t.destroy();
    }
    // 좋아함·싫어함 표시
    const badge = (c: number, draw: (g: Graphics) => void) => {
      const g = new Graphics().circle(16, 16, 14).fill(c).stroke({ width: 3.5, color: INK });
      draw(g);
      const tx = r.generateTexture({ target: g, resolution: 2 });
      g.destroy();
      return tx;
    };
    this.tex.like = badge(0x3fc83a, (g) => g.moveTo(16, 24).bezierCurveTo(4, 15, 9, 6, 16, 11.5).bezierCurveTo(23, 6, 28, 15, 16, 24).fill(0xffffff));
    this.tex.hate = badge(0xe0402a, (g) => g.moveTo(10, 10).lineTo(22, 22).moveTo(22, 10).lineTo(10, 22).stroke({ width: 4.5, color: 0xffffff, cap: 'round' }));

    // 황금 꿀방울
    const hd = new Graphics();
    hd.moveTo(32, 4).bezierCurveTo(44, 22, 56, 34, 56, 44).bezierCurveTo(56, 58, 44, 64, 32, 64).bezierCurveTo(20, 64, 8, 58, 8, 44).bezierCurveTo(8, 34, 20, 22, 32, 4).fill(0xffc21a).stroke({ width: 5, color: INK });
    hd.ellipse(24, 40, 6, 10).fill({ color: 0xffffff, alpha: 0.75 });
    hd.ellipse(40, 52, 9, 5).fill({ color: 0xffef9a, alpha: 0.7 });
    this.tex.honeydrop = r.generateTexture({ target: hd, resolution: 2 });
    const dot = new Graphics();
    for (let i = 5; i >= 1; i--) dot.circle(16, 16, 3 + i * 2.4).fill({ color: 0xffffff, alpha: 0.12 });
    dot.circle(16, 16, 4).fill(0xffffff);
    this.tex.dot = r.generateTexture({ target: dot, resolution: 2 });
    // 종별 입자 모양(흰색, tint로 물들임)
    const mk = (name: string, draw: (g: Graphics) => void) => {
      const g = new Graphics();
      draw(g);
      this.tex['bit_' + name] = r.generateTexture({ target: g, resolution: 2 });
    };
    mk('petal', (g) => g.ellipse(16, 10, 7, 11).fill(0xffffff).ellipse(16, 10, 3, 7).fill({ color: 0xffffff, alpha: 0.6 }));
    mk('leaf', (g) => g.moveTo(16, 0).quadraticCurveTo(30, 12, 16, 28).quadraticCurveTo(2, 12, 16, 0).fill(0xffffff).moveTo(16, 2).lineTo(16, 26).stroke({ width: 1.5, color: 0xd0d0d0 }));
    mk('shard', (g) => g.poly([16, 0, 24, 14, 16, 30, 9, 14]).fill(0xffffff));
    mk('drop', (g) => g.moveTo(12, 0).quadraticCurveTo(24, 16, 12, 24).quadraticCurveTo(0, 16, 12, 0).fill(0xffffff).circle(9, 15, 3).fill({ color: 0xffffff, alpha: 0.5 }));
    mk('mote', (g) => {
      for (let i = 6; i >= 1; i--) g.circle(16, 16, 2 + i * 2.2).fill({ color: 0xffffff, alpha: 0.1 });
      g.circle(16, 16, 3).fill(0xffffff);
    });
    mk('ember', (g) => g.circle(8, 8, 8).fill({ color: 0xffffff, alpha: 0.35 }).circle(8, 8, 4).fill(0xffffff));
    mk('sand', (g) => g.rect(0, 0, 6, 6).fill(0xffffff));
    mk('silk', (g) => g.moveTo(0, 2).bezierCurveTo(12, -2, 24, 6, 40, 2).stroke({ width: 2, color: 0xffffff }));
    mk('star', (g) => g.poly([16, 0, 19, 13, 32, 16, 19, 19, 16, 32, 13, 19, 0, 16, 13, 13]).fill(0xffffff));
    mk('bubble', (g) => g.circle(14, 14, 12).stroke({ width: 2.5, color: 0xffffff }).circle(10, 9, 3).fill({ color: 0xffffff, alpha: 0.8 }));
    mk('paper', (g) => g.poly([0, 2, 14, 0, 16, 12, 3, 14]).fill(0xffffff));
    // 3판: 개미(머리·배 두 덩이 + 다리), 인분(반짝이 마름모), 독털(가는 바늘), 나비(날개 네 장)
    mk('ant', (g) => {
      g.moveTo(4, 3).lineTo(20, 15).moveTo(4, 15).lineTo(20, 3).moveTo(12, 0).lineTo(12, 18).stroke({ width: 1.6, color: 0xffffff });
      g.circle(19, 9, 3.6).fill(0xffffff).circle(12, 9, 2.6).fill(0xffffff).ellipse(5, 9, 4.6, 3.6).fill(0xffffff);
    });
    // 흙먼지 덩이: 가장자리가 부드러운 뭉게구름(가산 합성 아님)
    mk('puff', (g) => {
      for (let i = 9; i >= 1; i--) g.circle(24, 24, 3 + i * 2.3).fill({ color: 0xffffff, alpha: 0.11 });
      g.circle(18, 18, 6).fill({ color: 0xffffff, alpha: 0.18 });
    });
    mk('scale', (g) => g.poly([8, 0, 13, 8, 8, 16, 3, 8]).fill(0xffffff).circle(8, 8, 1.6).fill({ color: 0xffffff, alpha: 0.6 }));
    mk('hair', (g) => g.moveTo(0, 3).lineTo(30, 1).stroke({ width: 1.8, color: 0xffffff, cap: 'round' }).circle(30, 1, 1.6).fill(0xffffff));
    mk('bfly', (g) => {
      g.ellipse(9, 9, 8, 6).fill(0xffffff).ellipse(23, 9, 8, 6).fill(0xffffff);
      g.ellipse(10, 20, 6, 5).fill({ color: 0xffffff, alpha: 0.85 }).ellipse(22, 20, 6, 5).fill({ color: 0xffffff, alpha: 0.85 });
      g.rect(15, 4, 2, 20).fill(0x2a2a2a);
    });

    for (const theme of ['grass', 'sand', 'forest'] as MapTheme[]) this.tex['ground_' + theme] = this.makeGround(theme);
  }

  /** 바닥 무늬(이음새 없이 반복) */
  private makeGround(theme: MapTheme): Texture {
    const r = this.app.renderer;
    const T = 256;
    const g = new Graphics();
    const pal = {
      grass: { base: 0x74b257, blob: [0x6aa64e, 0x7fbc60], line: [0x5c9a42, 0x8cc96b], dot: 0xe9f7c8 },
      sand: { base: 0xe2c588, blob: [0xd6b676, 0xeed49c], line: [0xc9a462, 0xf2dcae], dot: 0xfff4d6 },
      forest: { base: 0x5e4a30, blob: [0x6b5536, 0x524026], line: [0x7a8a3a, 0x8a5a2a], dot: 0xc8a46a },
    }[theme];
    g.rect(0, 0, T, T).fill(pal.base);
    let seed = theme === 'grass' ? 42 : theme === 'sand' ? 7 : 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const wrap = (draw: (ox: number, oy: number) => void) => {
      for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) draw(ox, oy);
    };
    for (let i = 0; i < 26; i++) {
      const x = rnd() * T, y = rnd() * T, rr = 18 + rnd() * 30, col = pal.blob[rnd() < 0.5 ? 0 : 1];
      wrap((ox, oy) => g.circle(x + ox, y + oy, rr).fill({ color: col, alpha: 0.5 }));
    }
    if (theme === 'grass') {
      for (let i = 0; i < 140; i++) {
        const x = rnd() * T, y = rnd() * T, h = 4 + rnd() * 7, lean = (rnd() - 0.5) * 4, col = pal.line[rnd() < 0.5 ? 0 : 1];
        wrap((ox, oy) => g.moveTo(x + ox, y + oy).lineTo(x + ox + lean, y + oy - h).stroke({ width: 1.6, color: col, alpha: 0.8, cap: 'round' }));
      }
    } else if (theme === 'sand') {
      // 바람 물결 무늬
      for (let i = 0; i < 18; i++) {
        const x = rnd() * T, y = rnd() * T, w = 30 + rnd() * 40;
        wrap((ox, oy) => g.moveTo(x + ox, y + oy).quadraticCurveTo(x + ox + w / 2, y + oy - 6, x + ox + w, y + oy).stroke({ width: 2, color: pal.line[0], alpha: 0.55 }));
      }
    } else {
      // 낙엽
      for (let i = 0; i < 46; i++) {
        const x = rnd() * T, y = rnd() * T, s2 = 4 + rnd() * 5, a = rnd() * Math.PI, col = [0x8a4a22, 0x9a6a2a, 0x5a5a22, 0x4a2a14][Math.floor(rnd() * 4)];
        wrap((ox, oy) => g.ellipse(x + ox, y + oy, s2, s2 * 0.45).fill({ color: col, alpha: 0.55 }));
        void a;
      }
    }
    for (let i = 0; i < 22; i++) {
      const x = rnd() * T, y = rnd() * T, rr = 1.2 + rnd() * 1.5;
      g.circle(x, y, rr).fill({ color: pal.dot, alpha: 0.7 });
    }
    return r.generateTexture({ target: g, resolution: 1, frame: new Rectangle(0, 0, T, T) });
  }

  /** 판마다 바뀌는 지형: 바닥·장식·바위·웅덩이 */
  setMap(map: MapView) {
    const key = map.theme + map.rocks.map((o) => o.x.toFixed(0)).join(',');
    if (key === this.mapKey) return;
    this.mapKey = key;
    this.bg.texture = this.tex['ground_' + map.theme];
    this.deco.removeChildren().forEach((c) => c.destroy());
    this.makeDecorations(map.theme);
    this.mapLayer.removeChildren().forEach((c) => c.destroy());
    const g = new Graphics();
    for (const p of map.puddles) {
      const col = map.theme === 'forest' ? 0x4a3a22 : map.theme === 'sand' ? 0x3ab0b8 : 0x4a9ad0;
      g.ellipse(p.x + 4, p.y + 6, p.r * 1.02, p.r * 0.86).fill({ color: 0x000000, alpha: 0.12 });
      g.ellipse(p.x, p.y, p.r, p.r * 0.84).fill({ color: col, alpha: 0.85 }).stroke({ width: 5, color: mix(col, 0x000000, 0.35), alpha: 0.6 });
      g.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.35, p.r * 0.12).fill({ color: 0xffffff, alpha: 0.35 });
      g.ellipse(p.x + p.r * 0.2, p.y + p.r * 0.25, p.r * 0.5, p.r * 0.1).fill({ color: 0xffffff, alpha: 0.15 });
    }
    for (const o of map.rocks) {
      g.ellipse(o.x + 8, o.y + 12, o.r * 1.02, o.r * 0.92).fill({ color: 0x000000, alpha: 0.22 });
      if (map.theme === 'forest') {
        // 나무 그루터기
        g.circle(o.x, o.y, o.r).fill(0x6a4424).stroke({ width: 6, color: 0x3a2412 });
        for (let k = 1; k <= 4; k++) g.circle(o.x, o.y, o.r * (1 - k * 0.2)).stroke({ width: 3, color: 0x9a6a3a, alpha: 0.8 });
        g.circle(o.x, o.y, o.r * 0.12).fill(0x8a5a2a);
      } else {
        const col = map.theme === 'sand' ? 0xc08a52 : 0x9aa39a;
        const pts: number[] = [];
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          const rr = o.r * (0.88 + 0.12 * Math.sin(k * 2.3 + o.x));
          pts.push(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr * 0.92);
        }
        g.poly(pts).fill(col).stroke({ width: 6, color: mix(col, 0x000000, 0.45) });
        g.ellipse(o.x - o.r * 0.25, o.y - o.r * 0.3, o.r * 0.45, o.r * 0.22).fill({ color: 0xffffff, alpha: 0.3 });
        g.ellipse(o.x + o.r * 0.2, o.y + o.r * 0.35, o.r * 0.5, o.r * 0.2).fill({ color: 0x000000, alpha: 0.12 });
      }
    }
    this.mapLayer.addChild(g);
  }

  private makeDecorations(theme: MapTheme) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const R = CONFIG.arenaRadius;
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (R - 80);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const g = new Graphics();
      if (theme === 'grass') {
        const petal = [0xffffff, 0xffe066, 0xff9ec7, 0xb59cff][Math.floor(rnd() * 4)];
        const n = 5 + Math.floor(rnd() * 3), pr = 14 + rnd() * 10;
        for (let k = 0; k < n; k++) {
          const pa = (k / n) * Math.PI * 2;
          g.ellipse(Math.cos(pa) * pr * 0.8, Math.sin(pa) * pr * 0.8, pr * 0.7, pr * 0.45).fill({ color: petal, alpha: 0.55 });
        }
        g.circle(0, 0, pr * 0.45).fill({ color: 0xffc94a, alpha: 0.7 });
      } else if (theme === 'sand') {
        if (rnd() < 0.5) {
          // 조개껍데기
          const s2 = 10 + rnd() * 8;
          g.moveTo(0, 0).arc(0, 0, s2, Math.PI, 0).lineTo(0, 0).fill({ color: 0xfff0d8, alpha: 0.8 });
          for (let k = 1; k < 5; k++) g.moveTo(0, 0).lineTo(Math.cos(Math.PI + (k * Math.PI) / 5) * s2, Math.sin(Math.PI + (k * Math.PI) / 5) * s2).stroke({ width: 1.5, color: 0xd8b48a });
        } else {
          // 마른 풀
          for (let k = 0; k < 5; k++) g.moveTo(0, 0).lineTo((k - 2) * 5, -14 - rnd() * 8).stroke({ width: 2, color: 0xa88a4a, cap: 'round' });
        }
      } else {
        // 버섯·이끼
        if (rnd() < 0.5) {
          const s2 = 10 + rnd() * 10;
          g.rect(-s2 * 0.2, 0, s2 * 0.4, s2 * 0.7).fill(0xf2e6cc);
          g.ellipse(0, 0, s2, s2 * 0.6).fill(rnd() < 0.5 ? 0xd8402a : 0xe8a03a);
          g.circle(-s2 * 0.4, -s2 * 0.1, s2 * 0.15).fill(0xffffff);
          g.circle(s2 * 0.3, -s2 * 0.2, s2 * 0.12).fill(0xffffff);
        } else g.circle(0, 0, 16 + rnd() * 16).fill({ color: 0x6a8a2a, alpha: 0.55 });
      }
      g.rotation = rnd() * Math.PI;
      g.position.set(x, y);
      this.deco.addChild(g);
    }
  }

  private dropGfx(g: SnakeGfx) {
    g.head.destroy({ children: true });
    for (const w of g.wings) w.destroy();
    g.label.destroy();
  }

  private labelText(s: FrameSnake) {
    const spName = SPECIES_BY_ID.get(s.species)?.name ?? V3_BY_ID.get(s.species)?.name ?? '';
    return s.isBoss ? '👑 왕지네' : s.isPlayer ? `Lv${s.level} 나 · ${spName}` : `Lv${s.level} ${s.name} · ${spName}`;
  }

  private getSnakeGfx(s: FrameSnake): SnakeGfx {
    let g = this.snakes.get(s.id);
    const key = lookKey(s.species, s.stage);
    if (g && g.species === key) {
      if (g.level !== s.level) ((g.level = s.level), (g.label.text = this.labelText(s)));
      return g;
    }
    if (g) this.dropGfx(g);
    const look = lookOf(key);
    const feats = new Set(look.feats ?? []);
    const kit = headKit(this.app.renderer, key);
    const head = new Container();
    const label = new Text({
      text: this.labelText(s),
      style: { fontFamily: FONT, fontSize: s.isBoss ? 20 : 14, fill: s.isBoss ? 0xffb0a0 : s.isPlayer ? 0xd6ff8a : 0xffffff, stroke: { color: INK, width: 4, join: 'round' } },
    });
    label.anchor.set(0.5, 1);
    const wings: Sprite[] = [];
    const bw = feats.has('bwings') && !!look.bwing;
    if (bw) {
      const t = this.bwingTex(key, look);
      for (let k = 0; k < 2; k++) {
        const w = new Sprite(t);
        w.anchor.set(BW_AX, BW_AY);
        wings.push(w);
      }
    } else if (feats.has('wings') || feats.has('wings4')) {
      const n = feats.has('wings4') ? 4 : 2;
      for (let k = 0; k < n; k++) {
        const w = new Sprite(this.tex.wing);
        w.anchor.set(0.05, 0.5);
        if (look.wingTint !== undefined) w.tint = look.wingTint;
        wings.push(w);
      }
    }
    const stinger = feats.has('stinger');
    // 머리: 뒤쪽 부품 → 머리판 → 앞쪽 부품
    const parts: PartSprite[] = [];
    const mk = (front: boolean) => {
      for (const part of kit.parts) {
        if (part.front !== front) continue;
        for (const side of [1, -1] as const) {
          const sp = new Sprite(part.tex);
          sp.anchor.set(part.ax, part.ay);
          head.addChild(sp);
          parts.push({ sp, part, side });
        }
      }
    };
    mk(false);
    const headBase = new Sprite(kit.base);
    headBase.anchor.set(kit.ax, kit.ay);
    head.addChild(headBase);
    mk(true);
    for (const w of wings) this.headLayer.addChild(w);
    this.headLayer.addChild(head);
    this.labelLayer.addChild(label);
    g = {
      species: key, level: s.level, kit, head, wings, stinger, headBase, parts, label, bw,
    };
    this.snakes.set(s.id, g);
    return g;
  }

  /** 시뮬레이션이 보낸 사건으로 이펙트를 만든다 */
  handleEvents(events: GameEvent[], snakesById: Map<number, SnakeView>, playerId: number) {
    for (const e of events) {
      switch (e.type) {
        case 'eat': {
          if (!this.isNear(e.x, e.y)) break;
          const mine = e.snake === playerId;
          if (e.gold) {
            for (let i = 0; i < 18; i++) this.spawnParticle(e.x, e.y, i % 3 ? 0xffc21a : 0xffffff, 90 + Math.random() * 160, 0.5, 0.55);
            if (mine) {
              this.popup(e.x, e.y - 24, '🍯 다시 뽑기 +1', 0xffe066, 24, 1.3);
              this.punch = Math.max(this.punch, 0.025);
            }
            break;
          }
          if (e.special !== undefined) {
            if (e.taste === 1) {
              for (let i = 0; i < 30; i++) this.spawnParticle(e.x, e.y, [0xffe066, 0x7dff5a, 0xffffff][i % 3], 120 + Math.random() * 240, 0.7, 0.7);
              if (mine) {
                this.popup(e.x, e.y - 34, '폭풍 성장!', 0xffe066, 36, 1.7, true);
                this.punch = Math.max(this.punch, 0.06);
                this.shake = Math.max(this.shake, 6);
              } else this.popup(e.x, e.y - 20, '냠냠!', 0xffe066, 18);
            } else if (e.taste === -1) {
              for (let i = 0; i < 16; i++) this.spawnParticle(e.x, e.y, i % 2 ? 0x9aa860 : 0x6a7a3a, 60 + Math.random() * 90, 0.6, 0.55);
              this.popup(e.x, e.y - 24, mine ? '웩! 느려짐' : '웩!', 0xc8e890, mine ? 26 : 16);
            } else {
              for (let i = 0; i < 10; i++) this.spawnParticle(e.x, e.y, FOOD_COLORS[i % FOOD_COLORS.length], 60 + Math.random() * 80, 0.4, 0.5);
            }
            break;
          }
          const n = e.big ? 8 : 3;
          for (let i = 0; i < n; i++) this.spawnParticle(e.x, e.y, FOOD_COLORS[i % FOOD_COLORS.length], 40 + Math.random() * 60, 0.35, e.big ? 0.5 : 0.3);
          break;
        }
        case 'hit': {
          if (!this.isNear(e.x, e.y)) break;
          const t = snakesById.get(e.snake);
          const mine = e.by === playerId, me = e.snake === playerId;
          if (e.blocked) {
            if (mine || me) this.popup(e.x, e.y - 10, '막힘!', 0xcfe8ff, 18);
            break;
          }
          this.flashT.set(e.snake, 0.13);
          if (e.by >= 0 && e.kind === 'bite') this.biteT.set(e.by, 0.25);
          const big = e.dmg >= 25;
          if (e.kind === 'bite' || e.kind === 'recoil' || e.kind === 'crit') {
            const col = e.good ? 0xffd23f : 0xffffff;
            const ang = Math.random() * Math.PI;
            this.addShape((g, k) => {
              const rr = 14 + (1 - k) * 10;
              g.moveTo(e.x + Math.cos(ang - 0.9) * rr, e.y + Math.sin(ang - 0.9) * rr).arc(e.x, e.y, rr, ang - 0.9, ang + 0.9).stroke({ width: 5 * k, color: col, alpha: k });
              g.moveTo(e.x + Math.cos(ang + Math.PI - 0.9) * rr, e.y + Math.sin(ang + Math.PI - 0.9) * rr).arc(e.x, e.y, rr, ang + Math.PI - 0.9, ang + Math.PI + 0.9).stroke({ width: 5 * k, color: col, alpha: k });
            }, 0.22);
            for (let i = 0; i < (big ? 12 : 6); i++) this.spawnParticle(e.x, e.y, i % 2 ? col : t ? lookOf(lookKey(t.species, t.stage)).body : 0xffffff, 80 + Math.random() * 140, 0.35, 0.45);
          }
          if (e.kind === 'poison' && e.dmg < 6 && !me) break;
          const special = e.kind === 'crit' || e.kind === 'ult';
          if (mine || me || e.dmg >= 10 || special) {
            let col = 0xffffff, size = 24 + Math.min(30, e.dmg / 2.2);
            if (me) col = e.kind === 'recoil' || e.kind === 'reflect' ? 0xd08aff : 0xff5a4a;
            else if (mine) col = e.kind === 'poison' ? 0x9aff5a : e.kind === 'minion' ? 0xffe08a : 0xffd23f;
            else ((col = 0xe0e0e0), (size *= 0.7));
            if (special) {
              col = e.kind === 'crit' ? 0xff7a1a : 0xff3a8a;
              size = Math.max(size, 40);
              if (e.kind === 'crit') this.popup(e.x, e.y - 40, '급소!', 0xffffff, 26, 0.9, true);
              this.shake = Math.max(this.shake, e.kind === 'ult' ? 12 : 16);
              this.punch = Math.max(this.punch, 0.06);
              for (let i = 0; i < 20; i++) this.spawnParticle(e.x, e.y, i % 2 ? col : 0xffffff, 140 + Math.random() * 260, 0.6, 0.7);
            }
            this.dmgPop(e.x, e.y, e.dmg, col, size, mine && special);
            if (mine && t) this.comboHit(t.id, e.dmg, e.x, e.y);
          }
          if (me) {
            this.shake = Math.max(this.shake, big ? 14 : 7);
            this.punch = Math.max(this.punch, big ? 0.05 : 0.025);
          } else if (mine) {
            this.shake = Math.max(this.shake, big ? 8 : 4);
            this.punch = Math.max(this.punch, big ? 0.04 : 0.015);
          }
          break;
        }
        case 'death': {
          const s = snakesById.get(e.snake);
          const col = s ? lookOf(lookKey(s.species, s.stage)).body : 0xffffff;
          const n = s?.isBoss ? 140 : 34;
          for (let i = 0; i < n; i++) this.spawnParticle(e.x, e.y, i % 3 ? col : 0xffffff, 80 + Math.random() * (s?.isBoss ? 520 : 260), 0.8, s?.isBoss ? 1.1 : 0.7);
          this.addShape((g, k) => g.circle(e.x, e.y, 20 + (1 - k) * (s?.isBoss ? 300 : 120)).stroke({ width: 10 * k, color: col, alpha: k }), 0.5);
          if (e.snake === playerId || e.by === playerId) {
            this.shake = Math.max(this.shake, s?.isBoss ? 28 : 14);
            this.punch = Math.max(this.punch, 0.06);
          }
          if (e.by === playerId && e.cause !== 'crush') this.popup(e.x, e.y - 24, s?.isBoss ? '왕지네 처치!' : '처치!', 0xffffff, s?.isBoss ? 44 : 32);
          if (e.cause === 'enemy' && e.snake === playerId) this.popup(e.x, e.y - 20, '천적에게 당했다', 0xffb0a0, 26);
          this.auras.delete(e.snake);
          break;
        }
        case 'drop': {
          if (!this.isNear(e.x, e.y)) break;
          this.addShape((g, k) => g.circle(e.x, e.y, e.r * (1.2 - k * 0.5)).stroke({ width: 6 * k, color: 0xbfe6ff, alpha: k }), 0.35);
          for (let i = 0; i < 8; i++) this.spawnParticle(e.x, e.y, 0xbfe6ff, 80 + Math.random() * 120, 0.35, 0.4);
          break;
        }
        case 'tongue': {
          this.addShape((g, k) => {
            g.moveTo(e.x0, e.y0).lineTo(e.x1, e.y1).stroke({ width: 26 * k, color: 0xff7aa8, alpha: k, cap: 'round' });
            g.moveTo(e.x0, e.y0).lineTo(e.x1, e.y1).stroke({ width: 8 * k, color: 0xffc8dc, alpha: k, cap: 'round' });
            g.circle(e.x1, e.y1, 22 * k).fill({ color: 0xff7aa8, alpha: k });
          }, 0.35);
          if (this.isNear(e.x1, e.y1)) this.shake = Math.max(this.shake, 10);
          break;
        }
        case 'lick': {
          this.addShape((g, k) => {
            g.moveTo(e.x0, e.y0).lineTo(e.x1, e.y1).stroke({ width: e.w * (0.6 + 0.4 * k), color: 0xff8ab0, alpha: 0.85 * k, cap: 'round' });
            g.moveTo(e.x0, e.y0).lineTo(e.x1, e.y1).stroke({ width: e.w * 0.25, color: 0xffd0e0, alpha: k, cap: 'round' });
          }, 0.5);
          this.shake = Math.max(this.shake, 12);
          break;
        }
        case 'netSwoop': {
          this.addShape((g, k) => g.circle(e.x, e.y, e.r * (1 + (1 - k) * 0.5)).stroke({ width: 10 * k, color: 0xffffff, alpha: k }), 0.4);
          for (let i = 0; i < 20; i++) this.spawnParticle(e.x, e.y, 0xf0e6c0, 100 + Math.random() * 160, 0.5, 0.5);
          if (this.isNear(e.x, e.y)) this.shake = Math.max(this.shake, 12);
          break;
        }
        case 'released': {
          for (let i = 0; i < 24; i++) this.spawnParticle(e.x, e.y, 0xffffff, 80 + Math.random() * 160, 0.6, 0.6);
          break;
        }
        case 'ring': {
          for (let i = 0; i < 18; i++) this.spawnParticle(e.cx, e.cy, 0xffe066, 60 + Math.random() * 80, 0.6, 0.45);
          if (e.snake === playerId) this.popup(e.cx, e.cy, e.trapped > 0 ? `감쌌다! ${e.trapped}마리` : '고리!', 0xffe066, e.trapped > 0 ? 30 : 22);
          break;
        }
        case 'crush': {
          if (e.count <= 0) break;
          for (let i = 0; i < 70; i++) this.spawnParticle(e.cx, e.cy, i % 2 ? 0xffd54a : 0xffffff, 120 + Math.random() * 420, 0.9, 0.9);
          this.addShape((g, k) => g.circle(e.cx, e.cy, 30 + (1 - k) * 220).stroke({ width: 16 * k, color: 0xffd54a, alpha: k }), 0.55);
          this.shake = Math.max(this.shake, e.snake === playerId ? 20 : 8);
          if (e.snake === playerId) {
            this.punch = Math.max(this.punch, 0.07);
            this.popup(e.cx, e.cy, e.count >= 2 ? `압착! ×${e.count}` : '압착!', 0xffd54a, e.count >= 2 ? 48 : 42);
          }
          break;
        }
        case 'bounce': {
          if (!this.isNear(e.x, e.y)) break;
          for (let i = 0; i < 4; i++) this.spawnParticle(e.x, e.y, 0xffffff, 60 + Math.random() * 60, 0.25, 0.3);
          break;
        }
        case 'pop':
          if (e.snake === playerId || this.isNear(e.x, e.y)) this.popup(e.x, e.y, e.text, e.color, e.snake === playerId ? 24 : 17);
          break;
        case 'levelUp': {
          if (!this.isNear(e.x, e.y)) break;
          const s = snakesById.get(e.snake);
          const col = famColor(s?.family);
          for (let i = 0; i < 14; i++) this.spawnParticle(e.x + (Math.random() - 0.5) * 40, e.y + (Math.random() - 0.5) * 40, i % 2 ? 0xfff3a0 : col, 40 + Math.random() * 80, 0.8, 0.45);
          this.addShape((g, k) => g.circle(e.x, e.y - (1 - k) * 30, 14 + (1 - k) * 40).stroke({ width: 5 * k, color: 0xfff3a0, alpha: k }), 0.6);
          if (e.snake === playerId) this.popup(e.x, e.y - 40, `레벨 ${e.level}!`, 0xfff3a0, 30, 1.2, true);
          break;
        }
        case 'evolveStart':
          this.pulseT.set(e.snake, 1);
          break;
        case 'evolve': {
          const s = snakesById.get(e.snake);
          const col = famColor(s?.family);
          this.pulseT.set(e.snake, 0.7);
          if (!this.isNear(e.x, e.y)) break;
          for (let i = 0; i < 80; i++) this.spawnParticle(e.x, e.y, i % 3 ? col : 0xffffff, 100 + Math.random() * 340, 1, 0.8);
          this.fx('flare', e.x, e.y, col, 60, 420, 0.8, 0, 1.5);
          this.fx('ring', e.x, e.y, 0xffffff, 40, 380, 0.7);
          // 껍질 조각이 튄다
          for (let j = 0; j < 10; j++) {
            const a = (j / 10) * Math.PI * 2 + Math.random() * 0.3;
            this.addShape((g, k) => {
              const d = 20 + (1 - k) * 140;
              const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
              g.poly([x - 8, y - 5, x + 7, y - 7, x + 5, y + 6, x - 6, y + 5]).fill({ color: col, alpha: k }).stroke({ width: 2, color: INK, alpha: k });
            }, 0.8);
          }
          // 빛 기둥
          this.addShape((g, k) => {
            const w = 50 * (0.4 + k);
            g.rect(e.x - w / 2, e.y - 400, w, 400).fill({ color: col, alpha: 0.25 * k });
            g.rect(e.x - w / 6, e.y - 400, w / 3, 400).fill({ color: 0xffffff, alpha: 0.5 * k });
          }, 0.9);
          if (e.snake === playerId) {
            this.shake = Math.max(this.shake, 12);
            this.punch = Math.max(this.punch, 0.08);
          }
          break;
        }
        case 'skill': {
          this.strikeT.set(e.snake, 0.45);
          if (!this.isNear(e.x, e.y)) break;
          const col = famColor(e.fam);
          // 시전 신호는 작게: 예고 자세(머리·몸)를 가리지 않게
          const n = e.slot === 'ult' ? 40 : 6;
          for (let i = 0; i < n; i++) this.spawnParticle(e.x, e.y, i % 2 ? col : 0xffffff, 80 + Math.random() * 180, 0.4, 0.45);
          if (e.slot === 'ult') {
            this.fx('flare', e.x, e.y, col, 60, 380, 0.6, 0, 2);
            if (e.snake === playerId) this.punch = Math.max(this.punch, 0.08);
          } else this.fx('flare', e.x, e.y, col, 20, 80, 0.25, 0, 2, 0.5);
          if (e.snake === playerId) this.punch = Math.max(this.punch, 0.04);
          break;
        }
        case 'fx':
          this.skillFx(e, playerId);
          break;
        case 'ultReady':
          if (e.snake === playerId) this.pulseT.set(e.snake, 0.4);
          break;
        case 'skillHit': {
          if (!this.isNear(e.x, e.y)) break;
          const col = { cut: 0xffffff, stun: 0xffe066, push: 0xbfe0ff, slow: 0x9ad0ff, root: 0xe8e0ff, blind: 0xf6ff8a, mark: 0xff7a5a, fear: 0xb88aff, silence: 0xff9a9a, grab: 0xd8b878, poison: 0x9aff5a, confuse: 0xffe066, charm: 0xff9ad8, itch: 0xfff0b0 }[e.kind];
          for (let i = 0; i < 12; i++) this.spawnParticle(e.x, e.y, col, 80 + Math.random() * 160, 0.45, 0.55);
          if (e.kind === 'push' || e.kind === 'stun' || e.kind === 'grab') {
            // 몸통 박치기: 하얀 번쩍 + 껍질 조각 + 흙먼지
            this.fx('flare', e.x, e.y, 0xffffff, 20, 110, 0.18, Math.random() * 3, 0, 0.9);
            for (let i = 0; i < 8; i++) this.spawnBit('shard', e.x, e.y, i % 2 ? 0xfff0c0 : 0x8a6a4a, 180 + Math.random() * 200, 0.4, 0.8);
            for (let i = 0; i < 5; i++) this.spawnBit('puff', e.x, e.y, DUST, 60 + Math.random() * 60, 0.45, 0.5);
          }
          if (e.kind === 'cut') {
            const a = Math.random() * Math.PI;
            this.fx('slash', e.x, e.y, 0xffd23f, 50, 90, 0.3, a, 0);
            this.fx('slash', e.x, e.y, 0xffffff, 50, 90, 0.3, a + Math.PI / 2, 0);
          } else if (e.kind === 'stun') {
            this.addShape((g, k) => g.star(e.x, e.y, 8, 16 + (1 - k) * 30, 8 + (1 - k) * 12).fill({ color: 0xffe066, alpha: k * 0.8 }), 0.35);
          } else if (e.kind === 'mark' || e.kind === 'blind') {
            this.fx('flare', e.x, e.y, col, 30, 120, 0.35);
          }
          break;
        }
        case 'birdDive': {
          this.addShape((g, k) => g.circle(e.x, e.y, e.r * (1 + (1 - k) * 0.4)).stroke({ width: 14 * k, color: 0xffffff, alpha: k * 0.8 }), 0.5);
          for (let i = 0; i < 40; i++) this.spawnParticle(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 0xf3e6c8, 100 + Math.random() * 200, 0.8, 0.7);
          if (this.isNear(e.x, e.y)) this.shake = Math.max(this.shake, 16);
          break;
        }
      }
    }
  }

  // ---------- 계열별 기술 연출 ----------

  private addAura(id: number, kind: Aura['kind'], life: number, r: number, col: number) {
    const list = this.auras.get(id) ?? [];
    list.push({ kind, life, max: life, r, col });
    this.auras.set(id, list);
  }

  private skillFx(e: Extract<GameEvent, { type: 'fx' }>, playerId: number) {
    const th = themeOf(e.sp);
    /** 종 테마 색: 대표 종(base)은 원래 색, 다른 종은 테마 색 [0 주색, 1 보조, 2 강조] */
    const C = (def: number, k: 0 | 1 | 2) => (th && !th.base ? th.pal[k] : def);
    const c = C(famColor(e.fam), 0), c2 = C(famColor(e.fam, 2), 1);
    const near = this.isNear(e.x, e.y);
    const mine = e.snake === playerId;
    const r = e.r ?? 100, a = e.angle ?? 0, len = e.len ?? 200, half = e.half ?? 0.6;
    const hit = (shake: number, punch: number) => {
      if (!near) return;
      this.shake = Math.max(this.shake, mine ? shake : shake * 0.4);
      if (mine) this.punch = Math.max(this.punch, punch);
    };
    if (e.kind !== 'windup' && e.kind !== 'lifted') this.flourish(e, th, near, mine);
    if (this.motionFx(e, near, C, hit)) return;
    switch (e.kind as FxKind) {
      case 'charge':
        this.lineFx(e.x, e.y, a, len, e.awake ? 90 : 50, c, C(0xffe0a0, 2));
        for (let i = 0; i < 30; i++) this.spawnParticle(e.x + Math.cos(a) * Math.random() * len, e.y + Math.sin(a) * Math.random() * len, i % 2 ? C(0x9a7a4a, 0) : C(0xd8b88a, 1), 60 + Math.random() * 120, 0.8, 0.6);
        hit(10, 0.05);
        break;
      case 'shock':
      case 'thud':
      case 'slam':
        this.aoeFx(e.x, e.y, r, e.kind === 'slam' ? C(0xffb03a, 2) : C(0xd89a4a, 0), true);
        hit(e.kind === 'slam' ? 20 : 14, 0.06);
        break;
      case 'lift':
      case 'grab':
      case 'scissor':
        this.coneFx(e.x, e.y, a, r, e.kind === 'scissor' ? half : 0.7, e.kind === 'scissor' ? C(0xffe8a0, 0) : c, e.kind === 'scissor');
        if (e.kind === 'scissor') {
          const hx = e.x + Math.cos(a) * r * 0.6, hy = e.y + Math.sin(a) * r * 0.6;
          this.fx('slash', hx, hy, C(0xfff0b0, 1), 60, 120, 0.3, a + 0.8, 0);
          this.fx('slash', hx, hy, 0xffffff, 60, 120, 0.3, a - 0.8, 0);
          for (let i = 0; i < 20; i++) this.spawnParticle(hx, hy, i % 2 ? C(0xffd23f, 1) : 0xffffff, 120 + Math.random() * 200, 0.4, 0.4);
        }
        hit(8, 0.04);
        break;
      case 'throw':
        this.lineFx(e.x, e.y, a, 160, 30, c, 0xffffff);
        hit(10, 0.04);
        break;
      case 'push':
        this.coneFx(e.x, e.y, a, r, 0.7, c, false);
        for (let k = 1; k <= 3; k++) this.afterMs(() => this.coneFx(e.x, e.y, a, r, 0.7, c, false), k * 450);
        break;
      case 'sweep':
        this.coneFx(e.x, e.y, a, r, half, C(0xd8ff9a, 0), true);
        hit(12, 0.05);
        break;
      case 'combo':
        this.coneFx(e.x, e.y, a, r, half, e.awake ? 0xffffff : C(0xc8ff8a, 0), true);
        hit(e.awake ? 12 : 6, 0.03);
        break;
      case 'stab':
        this.lineFx(e.x, e.y, a, len, 26, C(0xe8fff0, 1), C(0xb8ff7a, 0));
        hit(10, 0.05);
        break;
      case 'threat':
        this.ringFx(e.x, e.y, r, 0xc88aff);
        for (const sd of [-1, 1])
          this.addShape((g, k) => {
            const w = 60 * (1.4 - k * 0.4);
            g.ellipse(e.x + sd * w * 0.6, e.y - 10, w * 0.6, w * 0.35).fill({ color: 0xe8f0ff, alpha: 0.55 * k }).stroke({ width: 3, color: INK, alpha: k });
            g.circle(e.x + sd * w * 0.7, e.y - 10, 8).fill({ color: 0x5a3aa8, alpha: k });
          }, 0.6);
        hit(6, 0.03);
        break;
      case 'whirl':
        this.addAura(e.snake, 'whirl', 2, r, C(0xd8ff9a, 0));
        hit(10, 0.06);
        break;
      case 'dive':
      case 'snatch':
        this.lineFx(e.x, e.y, a, len, 36, c, c2);
        break;
      case 'land':
        this.aoeFx(e.x, e.y, r, c, false);
        hit(10, 0.05);
        break;
      case 'circle':
        this.addAura(e.snake, 'circle', 1.5, r, c);
        break;
      case 'lip':
        this.lineFx(e.x, e.y, a, len, 20, 0xd8b88a, 0xffffff);
        break;
      case 'compound':
        this.ringFx(e.x, e.y, 160, c);
        this.addAura(e.snake, 'compound', 3, 60, c);
        break;
      case 'sting':
        this.fx('flare', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, C(0xb8ff5a, 0), 20, 90, 0.25);
        break;
      case 'rain':
        this.ringFx(e.x, e.y, r, C(0xf2c230, 0));
        hit(6, 0.03);
        break;
      case 'cloud':
        for (let i = 0; i < 26; i++) this.spawnParticle(e.x + (Math.random() - 0.5) * r, e.y + (Math.random() - 0.5) * r, i % 2 ? C(0xa8b850, 0) : C(0x7a8a3a, 1), 30 + Math.random() * 50, 1.1, 0.9);
        break;
      case 'jet':
        this.lineFx(e.x, e.y, a, len, 40, C(0xb8c860, 0), C(0xe8f0a0, 1));
        break;
      case 'backjet':
        this.coneFx(e.x, e.y, a, len, half, C(0xa8b850, 0), false);
        for (let i = 0; i < 24; i++) {
          const aa = a + (Math.random() - 0.5) * half * 2;
          this.spawnParticle(e.x + Math.cos(aa) * len * Math.random(), e.y + Math.sin(aa) * len * Math.random(), i % 2 ? C(0xa8b850, 0) : C(0x7a8a3a, 1), 30 + Math.random() * 60, 0.9, 0.8);
        }
        break;
      case 'gasburst':
        this.aoeFx(e.x, e.y, r, C(0x9aa83a, 0), false);
        for (let i = 0; i < 60; i++) this.spawnParticle(e.x, e.y, i % 3 ? C(0x8a9a3a, 0) : C(0xd8e870, 1), 120 + Math.random() * 300, 1.2, 1);
        hit(16, 0.07);
        break;
      case 'web':
      case 'prison':
        this.ringFx(e.x, e.y, r, C(0xf0f0ff, 0));
        if (e.kind === 'prison') hit(10, 0.06);
        break;
      case 'silk':
        break;
      case 'pit':
      case 'hell':
        this.ringFx(e.x, e.y, r, C(0xd8b878, 0));
        for (let i = 0; i < 30; i++) this.spawnParticle(e.x + (Math.random() - 0.5) * r * 1.6, e.y + (Math.random() - 0.5) * r * 1.6, C(0xe8d0a0, 1), 40 + Math.random() * 80, 0.8, 0.5);
        if (e.kind === 'hell') hit(14, 0.06);
        break;
      case 'sand':
        this.coneFx(e.x, e.y, a, len, half, C(0xe8d0a0, 0), false);
        for (let i = 0; i < 30; i++) {
          const aa = a + (Math.random() - 0.5) * half * 2;
          const d = Math.random() * len;
          this.spawnParticle(e.x + Math.cos(aa) * d, e.y + Math.sin(aa) * d, i % 2 ? C(0xe8d0a0, 0) : C(0xc8a870, 1), 40 + Math.random() * 80, 0.6, 0.45);
        }
        break;
      case 'ambush':
        if (e.awake) {
          this.aoeFx(e.x, e.y, r, C(0xd8b878, 0), true);
          hit(14, 0.06);
        } else for (let i = 0; i < 20; i++) this.spawnParticle(e.x, e.y, C(0xd8b878, 0), 60 + Math.random() * 100, 0.6, 0.6);
        break;
      case 'summon':
      case 'alarm':
        for (let i = 0; i < (e.awake ? 50 : 20); i++) this.spawnParticle(e.x, e.y, i % 2 ? C(0xffd23f, 0) : C(0x3a2a10, 1), 80 + Math.random() * 200, 0.6, 0.5);
        if (e.awake) this.ringFx(e.x, e.y, 200, C(0xffd23f, 0));
        break;
      case 'honey':
        this.ringFx(e.x, e.y, r, C(0xffc21a, 0));
        break;
      case 'heat':
        this.fx('flare', e.x, e.y, C(0xff8a1c, 0), 40, 140, 0.5);
        break;
      case 'waggle':
        this.ringFx(e.x, e.y, r, 0xffd23f);
        this.ringFx(e.x, e.y, r * 0.6, 0xffffff);
        break;
      case 'flash':
        this.fx('flare', e.x, e.y, C(0xf6ff8a, 0), r * 0.6, r * 2.6, 0.5, 0, 2);
        this.ringFx(e.x, e.y, r, C(0xf6ff8a, 1));
        hit(6, 0.04);
        if (near) this.screenFlash = Math.max(this.screenFlash, mine ? 0.25 : 0.45);
        break;
      case 'signal':
        this.fx('flare', e.x, e.y, C(0xd8ff5a, 0), 20, 90, 0.3);
        break;
      case 'lantern':
        this.addAura(e.snake, 'lantern', 4, r, C(0xd8ff5a, 0));
        break;
      case 'aurora':
        this.fx('flare', e.x, e.y, C(0x7affc8, 0), r * 0.5, r * 3, 0.9, 0, 1);
        for (let k = 0; k < 3; k++) this.afterMs(() => this.ringFx(e.x, e.y, r * (0.6 + k * 0.25), [C(0x7affc8, 0), C(0xd8ff5a, 1), C(0x9ac8ff, 2)][k]), k * 120);
        if (near) this.screenFlash = Math.max(this.screenFlash, 0.5);
        hit(12, 0.07);
        break;
      case 'camo':
        for (let i = 0; i < 18; i++) this.spawnParticle(e.x, e.y, i % 2 ? C(0x7ac84a, 0) : C(0x3a6a2a, 1), 50 + Math.random() * 90, 0.6, 0.5);
        break;
      case 'hop':
      case 'roll':
      case 'backstep':
      case 'escape':
        for (let i = 0; i < 12; i++) this.spawnParticle(e.x, e.y, C(0xffffff, 1), 60 + Math.random() * 120, 0.4, 0.4);
        break;
      case 'curl':
      case 'backplate':
      case 'bitter':
      case 'playdead':
      case 'fang':
        this.ringFx(e.x, e.y, 60, e.kind === 'bitter' ? 0x9aff5a : e.kind === 'fang' ? 0xb88aff : 0x9ad0ff);
        if (e.kind === 'playdead' && near) this.popup(e.x, e.y - 30, 'Zzz…', 0xcfe8ff, 22);
        break;
      case 'heal':
        for (let i = 0; i < 20; i++) this.spawnParticle(e.x + (Math.random() - 0.5) * 50, e.y + (Math.random() - 0.5) * 50, i % 2 ? 0x7dff5a : 0xffffff, 30 + Math.random() * 60, 0.8, 0.5);
        break;
      case 'chirp':
        for (let k = 0; k < 3; k++) this.afterMs(() => this.ringFx(e.x, e.y, r * (0.5 + k * 0.25), 0xfff3a0), k * 90);
        hit(6, 0.03);
        break;
      case 'decoy':
        if (e.x1 !== undefined && e.y1 !== undefined) this.lineFx(e.x1, e.y1, Math.atan2(e.y - e.y1, e.x - e.x1), Math.hypot(e.x - e.x1, e.y - e.y1), 20, 0xffffff, 0xcfe8ff);
        break;
      default:
        this.v3Fx(e, th, C, near, hit);
    }
  }

  /** 화면 충격파: 땅이 출렁이는 굴절(묵직한 착지, 필살기 끝) */
  private shockwave(x: number, y: number, amp = 26, life = 0.55) {
    if (!this.opts.shake || this.waves.length >= 3) return;
    const f = new ShockwaveFilter({ center: { x: 0, y: 0 }, amplitude: amp, wavelength: 120, speed: 560, brightness: 1.05, radius: 320 });
    this.waves.push({ f, x, y, t: 0, life });
    this.world.filters = this.waves.map((w) => w.f);
  }

  /** 땅이 갈라진 금(착지 자리) */
  private cracks(x: number, y: number, r: number, col = 0x3a2a18) {
    const n = 7;
    const lines: [number, number][][] = [];
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + Math.random() * 0.5, px = x, py = y;
      const pts: [number, number][] = [[px, py]];
      const L = r * (0.55 + Math.random() * 0.5);
      for (let k = 1; k <= 4; k++) {
        a += (Math.random() - 0.5) * 0.7;
        px += Math.cos(a) * L / 4;
        py += Math.sin(a) * L / 4;
        pts.push([px, py]);
      }
      lines.push(pts);
    }
    this.addShape((g, k) => {
      for (const pts of lines) {
        g.moveTo(pts[0][0], pts[0][1]);
        for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
      }
      g.stroke({ width: 3.5, color: col, alpha: Math.min(1, k * 2) * 0.75 });
    }, 1.6);
  }

  /** 흙먼지 고리: 땅을 따라 바깥으로 낮게 퍼진다 */
  private dustRing(x: number, y: number, r: number, col = DUST, n = 28) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const d = r * 0.3;
      this.spawnBit('puff', x + Math.cos(a) * d, y + Math.sin(a) * d, mix(col, 0xffffff, Math.random() * 0.3), r * (4.5 + Math.random() * 1.5), 0.55 + Math.random() * 0.3, 0.55 + Math.random() * 0.4, a, 0.2);
    }
  }

  /**
   * 몸 동작 신호를 받아 자세를 재생하고, 그 기술의 이펙트를 그린다.
   * true면 예전 이펙트(도형 하나)를 그리지 않는다.
   */
  private motionFx(e: Extract<GameEvent, { type: 'fx' }>, near: boolean, C: (def: number, k: 0 | 1 | 2) => number, hit: (shake: number, punch: number) => void): boolean {
    const now = this.time;
    const id = e.snake;
    const a = e.angle ?? 0, r = e.r ?? 100;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rnd = Math.random;
    const dust = C(0xc8a878, 0), light = C(0xfff0c0, 1);
    switch (e.kind as FxKind) {
      case 'windup': {
        const d = e.dur ?? 0.15;
        this.motion.play(id, 'windup:' + (e.wk ?? ''), d, now);
        if (!near) return true;
        const wing = e.wk === 'dive' || e.wk === 'snatch';
        // 힘이 모인다: 바깥에서 머리로 빨려 드는 작은 빛(머리를 가리지 않게 적게)
        for (let i = 0; i < 8; i++) {
          const aa = rnd() * Math.PI * 2, R = 60 + rnd() * 25;
          this.spawnBit('mote', e.x + Math.cos(aa) * R, e.y + Math.sin(aa) * R, light, (R - 20) / d, d * 0.9, 0.45, aa + Math.PI, 0.05);
        }
        if (wing) {
          // 날개 바람: 아래로 눌린 풀먼지가 둥글게 밀려난다
          this.dustRing(e.x, e.y, 26, 0xe8f0e0, 14);
        } else {
          // 뒷발로 땅 긁기: 뒤로 흙덩이가 튄다
          for (let i = 0; i < 10; i++) this.spawnBit('sand', e.x - ca * 18, e.y - sa * 18, 0x8a6a4a, 120 + rnd() * 140, 0.45, 1.1, a + Math.PI, 0.9);
          for (let i = 0; i < 4; i++) this.spawnBit('puff', e.x - ca * 22, e.y - sa * 22, DUST, 60 + rnd() * 40, 0.5, 0.6, a + Math.PI, 0.8);
        }
        return true;
      }
      case 'charge': {
        this.motion.play(id, 'charge', e.dur ?? 0.3, now);
        if (!near) return true;
        if (e.awake) {
          // 대지 진동 돌진: 지나간 길을 따라 땅이 연달아 갈라지고 흙기둥이 솟는다
          const d = e.dur ?? 0.4;
          for (let k = 1; k <= Math.ceil(d / 0.06); k++)
            this.afterMs(() => {
              const [x, y] = this.lastHead.get(id) ?? [e.x, e.y];
              if (!this.isNear(x, y)) return;
              this.cracks(x, y, 46);
              for (let i = 0; i < 4; i++) this.spawnBit('puff', x, y, DUST, 40 + rnd() * 60, 0.6, 0.7);
              for (let i = 0; i < 4; i++) this.spawnBit('shard', x, y, 0x7a5a3a, 120 + rnd() * 120, 0.45, 0.8);
              this.shake = Math.max(this.shake, 9);
            }, k * 60);
        }
        // 출발 자리: 뒤로 터지는 흙먼지와 돌 조각(길을 미리 긋지 않는다: 몸이 직접 달린다)
        this.dustRing(e.x - ca * 14, e.y - sa * 14, 30, DUST, 14);
        for (let i = 0; i < 10; i++) this.spawnBit('shard', e.x, e.y, 0x8a6a4a, 160 + rnd() * 160, 0.5, 0.8, a + Math.PI, 1.2);
        hit(e.awake ? 12 : 7, 0.03);
        return true;
      }
      case 'push': {
        this.motion.play(id, 'brace', e.dur ?? 2, now);
        return false; // 바람 고리 4번은 그대로(앞쪽 방패는 몸 동작에서 그린다)
      }
      case 'lift': {
        this.motion.play(id, 'lift', 0.38, now);
        if (!near) return true;
        // 아래에서 위로 퍼 올리는 큰 호: 앞쪽에서 짧은 호 3개가 차례로 위로 솟는다
        const hx = e.x + ca * r * 0.45, hy = e.y + sa * r * 0.45;
        for (let k = 0; k < 3; k++)
          this.afterMs(() => {
            const yy = hy - k * 14;
            this.addShape((g, q) => {
              g.arc(hx, yy + 10, r * (0.5 + k * 0.12), a - 1.1, a + 1.1);
              g.stroke({ width: (12 - k * 3) * q, color: k === 0 ? light : 0xffffff, alpha: q, cap: 'round' });
            }, 0.22);
          }, k * 45);
        for (let i = 0; i < 18; i++) this.spawnBit('sand', hx, hy, dust, 140 + rnd() * 160, 0.6, 1, -Math.PI / 2, 1.4);
        hit(9, 0.04);
        return true;
      }
      case 'lifted': {
        const d = e.dur ?? 0.45;
        this.motion.play(id, 'lifted', d, now);
        const tx = e.x1 ?? e.x, ty = e.y1 ?? e.y;
        this.afterMs(() => {
          this.motion.play(id, 'slammed', 0.3, this.time);
          const [lx, ly] = this.lastHead.get(id) ?? [tx, ty];
          if (!this.isNear(lx, ly)) return;
          this.dustRing(lx, ly, 40, DUST, 18);
          this.fx('ring', lx, ly, mix(light, DUST, 0.5), 14, 100, 0.3, 0, 0, 0.7);
          this.cracks(lx, ly, 50);
          for (let i = 0; i < 10; i++) this.spawnBit('star', lx, ly - 30, 0xffe066, 40 + rnd() * 40, 0.6, 0.8);
          this.shake = Math.max(this.shake, 10);
        }, d * 1000);
        return true;
      }
      case 'hop': {
        const jump = e.wk === 'jump';
        this.motion.play(id, jump ? 'jump' : 'flit', e.dur ?? 0.3, now);
        if (!near) return true;
        if (jump) {
          // 날아오름: 발밑 흙이 아래로 눌려 퍼지고 날개 바람
          this.dustRing(e.x, e.y, 34, DUST, 18);
        } else {
          for (let i = 0; i < 10; i++) this.spawnBit('mote', e.x, e.y, C(0xe8f8ff, 1), 120 + rnd() * 80, 0.35, 0.8, a + Math.PI, 1.2);
        }
        return true;
      }
      case 'thud': {
        this.motion.play(id, 'land', 0.32, now);
        if (!near) return true;
        // 쾅: 화면이 출렁이고, 땅이 갈라지고, 돌 조각이 튀고, 흙먼지가 낮게 번진다
        this.shockwave(e.x, e.y, 16);
        this.cracks(e.x, e.y, r * 0.8);
        this.decal(e.x, e.y, r * 0.9, 0x5a4024);
        this.dustRing(e.x, e.y, r * 0.5, DUST, 22);
        for (let i = 0; i < 18; i++) this.spawnBit('shard', e.x, e.y, i % 4 ? 0x7a5a3a : light, 200 + rnd() * 240, 0.55, 1 + rnd() * 0.7);
        this.fx('ring', e.x, e.y, mix(light, DUST, 0.5), r * 0.2, r * 2.2, 0.3, 0, 0, 0.45);
        hit(24, 0.09);
        return true;
      }
      case 'land': {
        const sky = e.wk === 'skydrop';
        this.motion.play(id, sky ? 'skydrop' : 'land', sky ? 0.35 : 0.22, now);
        if (!near) return true;
        // 내리꽂힘: 바람 고리 + 깃털처럼 흩어지는 빛 + 작은 충격파
        this.fx('ring', e.x, e.y, light, r * 0.2, r * 2, 0.3, 0, 0, 0.7);
        this.dustRing(e.x, e.y, r * 0.45, 0xdde8d0, 22);
        for (let i = 0; i < 14; i++) this.spawnBit('leaf', e.x, e.y, C(0xb8ff9a, 0), 160 + rnd() * 160, 0.6, 0.9);
        if (sky || e.awake) this.shockwave(e.x, e.y, 12, 0.45);
        this.cracks(e.x, e.y, r * 0.5, 0x3a3a2a);
        hit(sky ? 18 : 12, 0.06);
        return true;
      }
      case 'dive': {
        if (e.wk === 'sky') {
          this.motion.play(id, 'sky', e.dur ?? 3, now);
          if (near) this.dustRing(e.x, e.y, 46, 0xdde8d0, 24);
          return true;
        }
        this.motion.play(id, 'dive', e.dur ?? 0.35, now);
        return true; // 길을 미리 긋던 직선은 없앤다(몸이 직접 날아간다)
      }
      case 'snatch': {
        const d = e.dur ?? 0.3;
        this.motion.play(id, 'snatch', d, now);
        // 끝에서 다리 여섯 개가 바구니처럼 오므라든다
        this.afterMs(() => {
          const [lx, ly] = this.lastHead.get(id) ?? [e.x, e.y];
          if (!this.isNear(lx, ly)) return;
          const col = C(0xfff0b0, 1);
          for (let j = 0; j < 6; j++) {
            const aa = a + (j / 6 - 0.5) * 2.2;
            const L = 46;
            this.addShape((g, q) => {
              const reach = L * (0.4 + 0.6 * q);
              g.moveTo(lx + Math.cos(aa) * reach, ly + Math.sin(aa) * reach).lineTo(lx + Math.cos(a) * 12, ly + Math.sin(a) * 12);
              g.stroke({ width: 4 * q + 1, color: col, alpha: q, cap: 'round' });
            }, 0.25);
          }
          this.fx('ring', lx, ly, col, 8, 70, 0.25);
        }, d * 900);
        return true;
      }
      case 'shock': {
        // 충격파(돌진 끝·넘긴 자리): 흙먼지 고리 + 돌 조각 + 금 + 작은 굴절
        if (!near) return true;
        this.dustRing(e.x, e.y, r * 0.45, DUST, 16);
        for (let i = 0; i < 12; i++) this.spawnBit('shard', e.x, e.y, 0x7a5a3a, 160 + rnd() * 200, 0.5, 0.9);
        this.fx('ring', e.x, e.y, light, r * 0.2, r * 2, 0.28, 0, 0, 0.45);
        this.cracks(e.x, e.y, r * 0.6);
        if (e.awake) this.shockwave(e.x, e.y, 12, 0.45);
        hit(e.awake ? 16 : 10, 0.05);
        return true;
      }
      default:
        return false;
    }
  }

  /** 3판 새 기술 이펙트(도감에서 재생). 색은 종 테마 [주색, 보조, 강조] */
  private v3Fx(e: Extract<GameEvent, { type: 'fx' }>, th: FxTheme | null, C: (def: number, k: 0 | 1 | 2) => number, near: boolean, hit: (shake: number, punch: number) => void) {
    if (!near) return;
    const r = e.r ?? 100, a = e.angle ?? 0, len = e.len ?? 200, half = e.half ?? 0.6;
    const bit = th?.bit ?? 'mote';
    const P = (k: 0 | 1 | 2, def: number) => C(def, k);
    const later = (t: number, fn: () => void) => this.afterMs(fn, t * 1000);
    const cos = Math.cos, sin = Math.sin, rnd = Math.random;
    switch (e.kind as FxKind) {
      case 'fangstab': {
        // 독턱 두 줄이 X자로 겹치는 찌르기
        const c = P(0, 0xff4a2a);
        this.lineFx(e.x, e.y, a + 0.1, len, 20, c, P(1, 0xffd23f));
        this.lineFx(e.x, e.y, a - 0.1, len, 20, c, 0xffffff);
        const hx = e.x + cos(a) * len, hy = e.y + sin(a) * len;
        this.fx('slash', hx, hy, c, 50, 120, 0.3, a + 0.8, 0);
        this.fx('slash', hx, hy, 0xffffff, 50, 120, 0.3, a - 0.8, 0);
        for (let i = 0; i < 18; i++) this.spawnBit('drop', hx, hy, i % 2 ? 0xb88aff : c, 120 + rnd() * 160, 0.6, 0.7, a, 1.6);
        hit(10, 0.05);
        break;
      }
      case 'coil': {
        // 나선으로 조여드는 몸 고리
        const c = P(0, 0xff4a2a);
        for (let k = 0; k < 3; k++) later(k * 0.12, () => this.ringFx(e.x, e.y, r * (1.25 - k * 0.25), k === 1 ? P(1, 0xffd23f) : c));
        for (let i = 0; i < 40; i++) {
          const t = i / 40, aa = t * Math.PI * 6, d = r * (1.3 - t * 0.8);
          later(t * 0.45, () => this.spawnBit(i % 3 === 0 ? 'ember' : 'dot', e.x + cos(aa) * d, e.y + sin(aa) * d, i % 2 ? c : P(1, 0xffd23f), 40, 0.5, 0.9, aa + Math.PI / 2, 0.2));
        }
        hit(6, 0.03);
        break;
      }
      case 'vortex': {
        // 큰 원 다리 자국 + 가운데로 빨려 드는 나선 바람
        const c = P(0, 0xff4a2a);
        this.ringFx(e.x, e.y, r, c);
        later(0.25, () => this.ringFx(e.x, e.y, r * 0.6, P(1, 0xffd23f)));
        for (let i = 0; i < 90; i++) {
          const aa = rnd() * Math.PI * 2, d = r * (0.7 + rnd() * 0.6);
          later(rnd() * 0.9, () => this.spawnBit(i % 4 === 0 ? 'ember' : bit, e.x + cos(aa) * d, e.y + sin(aa) * d, i % 2 ? c : P(2, 0xffffff), 180 + rnd() * 120, 0.8, 0.9, aa + Math.PI + 0.7, 0.3));
        }
        later(0.7, () => this.aoeFx(e.x, e.y, r * 0.45, c, true));
        hit(16, 0.06);
        break;
      }
      case 'acid': {
        // 지글거리는 산 줄기
        const c = P(0, 0xffa030);
        this.lineFx(e.x, e.y, a, len, 26, c, P(1, 0xfff0a0));
        for (let i = 0; i < 26; i++) {
          const t = rnd(), x = e.x + cos(a) * len * t, y = e.y + sin(a) * len * t;
          this.spawnBit(i % 3 === 0 ? 'bubble' : 'drop', x, y, i % 2 ? c : 0xfff0a0, 30 + rnd() * 70, 0.8, 0.6);
        }
        const hx = e.x + cos(a) * len, hy = e.y + sin(a) * len;
        for (let i = 0; i < 14; i++) this.spawnBit('bubble', hx, hy, 0xffffff, 40 + rnd() * 50, 1.1, 0.7, -Math.PI / 2, 1.4);
        hit(6, 0.03);
        break;
      }
      case 'burrow': {
        // 흙 고리 + 흙 분수
        const c = P(0, 0xc89a5a);
        this.aoeFx(e.x, e.y, r, c, true);
        for (let i = 0; i < 34; i++) this.spawnBit('sand', e.x, e.y, i % 2 ? c : 0x8a6a3a, 120 + rnd() * 220, 0.7, 1.2, -Math.PI / 2, 2.4);
        hit(8, 0.03);
        break;
      }
      case 'antcall': {
        // 땅에서 개미가 원을 그리며 솟아나 바깥으로 달려 나간다
        const c = P(0, 0xe8a05a);
        this.ringFx(e.x, e.y, r * 0.7, c);
        const n = Math.round(r / 6) + 8;
        for (let i = 0; i < n; i++) {
          const aa = (i / n) * Math.PI * 2;
          later(rnd() * 0.5, () => this.spawnBit('ant', e.x + cos(aa) * r * 0.5, e.y + sin(aa) * r * 0.5, i % 3 === 0 ? P(1, 0xffd8a0) : 0x2a2018, 70 + rnd() * 60, 1.6, 1.0, aa + 0.4, 0.4));
        }
        break;
      }
      case 'antriver': {
        // 앞쪽 넓은 띠로 개미 강물
        const c = P(0, 0xe8a05a);
        this.coneFx(e.x, e.y, a, len, half * 0.6, c, false);
        for (let i = 0; i < 110; i++) {
          const side = (rnd() - 0.5) * 2, off = side * 60;
          const x = e.x - sin(a) * off, y = e.y + cos(a) * off;
          later(rnd() * 0.8, () => this.spawnBit('ant', x, y, i % 4 === 0 ? P(1, 0xffd8a0) : i % 4 === 1 ? c : 0x2a2018, 380 + rnd() * 160, len / 450, 1.05, a + side * 0.12, 0.08));
        }
        later(0.6, () => {
          const hx = e.x + cos(a) * len, hy = e.y + sin(a) * len;
          for (let i = 0; i < 24; i++) this.spawnBit('sand', hx, hy, 0xc89a5a, 100 + rnd() * 160, 0.6, 1.1, a, 1.6);
        });
        hit(14, 0.05);
        break;
      }
      case 'leafwall': {
        // 머리 앞에 부채처럼 선 큰 잎
        const c = P(0, 0x7ad84a);
        for (let i = 0; i < 9; i++) {
          const aa = a + (i / 8 - 0.5) * 1.8, d = 46 + (i % 2) * 8;
          for (let k = 0; k < 5; k++) later(k * 0.5, () => this.spawnBit('leaf', e.x + cos(aa) * d, e.y + sin(aa) * d, i % 2 ? c : P(1, 0xd8ffa0), 6, 0.6, 1.8, aa, 0.1));
        }
        this.coneFx(e.x, e.y, a, 70, 0.9, c, false);
        break;
      }
      case 'nest': {
        // 흙 둔덕 + 들끓는 붉은 개미 + 불씨
        const c = P(0, 0xff5a2a);
        this.aoeFx(e.x, e.y, r * 0.8, 0xb07a4a, true);
        for (let k = 0; k < 8; k++)
          later(k * 0.25, () => {
            for (let i = 0; i < 10; i++) {
              const aa = rnd() * Math.PI * 2, d = rnd() * r * 0.9;
              this.spawnBit(i % 3 === 0 ? 'ember' : 'ant', e.x + cos(aa) * d, e.y + sin(aa) * d, i % 2 ? c : 0x3a1a10, 30 + rnd() * 40, 0.5, 0.8);
            }
          });
        this.ringFx(e.x, e.y, r, c);
        break;
      }
      case 'buzz': {
        // 겹겹이 퍼지는 진동 고리
        const c = P(0, 0xffe066);
        for (let k = 0; k < 5; k++) later(k * 0.12, () => this.ringFx(e.x, e.y, r * (0.4 + k * 0.18), k % 2 ? c : 0xffffff));
        for (let i = 0; i < 24; i++) this.spawnBit('mote', e.x, e.y, c, 140 + rnd() * 120, 0.5, 0.9);
        hit(6, 0.02);
        break;
      }
      case 'mudpot': {
        // 진흙 덩이가 호를 그리며 날아가 철퍽
        const c = P(0, 0xd8a868);
        const x0 = e.x1 ?? e.x, y0 = e.y1 ?? e.y;
        for (let i = 0; i <= 10; i++) {
          const t = i / 10, x = x0 + (e.x - x0) * t, y = y0 + (e.y - y0) * t - Math.sin(t * Math.PI) * 70;
          later(t * 0.3, () => this.spawnBit('drop', x, y, c, 10, 0.3, 1.4));
        }
        later(0.32, () => {
          this.aoeFx(e.x, e.y, r, c, false);
          for (let i = 0; i < 22; i++) this.spawnBit('drop', e.x, e.y, i % 2 ? c : 0x8a6a3a, 120 + rnd() * 150, 0.7, 0.9);
          hit(8, 0.03);
        });
        break;
      }
      case 'powder': {
        // 부채꼴로 퍼져 천천히 가라앉는 반짝이 가루
        const c = P(0, 0xffe066);
        this.coneFx(e.x, e.y, a, r, Math.min(half, 1.4), c, false);
        for (let i = 0; i < 80; i++) {
          const aa = a + (rnd() - 0.5) * half * 2, d = r * (0.15 + rnd() * 0.85);
          later(rnd() * 0.35, () => this.spawnBit('scale', e.x + cos(aa) * d * 0.3, e.y + sin(aa) * d * 0.3, [c, P(1, 0xff9ad8), P(2, 0xffffff)][i % 3], d * 1.4, 1.6 + rnd() * 1.2, 0.8 + rnd() * 0.5, aa, 0.2));
        }
        hit(4, 0.02);
        break;
      }
      case 'flutter': {
        // 지그재그 날개 잔상과 가루
        const c = P(0, 0xffe066);
        this.ringFx(e.x, e.y, 50, c);
        for (let k = 0; k < 6; k++) later(k * 0.22, () => {
          for (let i = 0; i < 6; i++) this.spawnBit('scale', e.x, e.y, [c, P(1, 0xff9ad8), 0xffffff][i % 3], 60 + rnd() * 80, 1.0, 0.8);
        });
        break;
      }
      case 'charm': {
        // 분홍 꽃가루 띠가 대상에게 이어지고 머리 위에 꽃이 핀다
        const c = P(1, 0xff9ad8);
        if (e.x1 !== undefined && e.y1 !== undefined) {
          const d = Math.hypot(e.x - e.x1, e.y - e.y1), aa = Math.atan2(e.y - e.y1, e.x - e.x1);
          this.lineFx(e.x1, e.y1, aa, d, 14, c, 0xffffff);
          for (let i = 0; i < 26; i++) {
            const t = i / 26;
            later(t * 0.3, () => this.spawnBit('petal', e.x1! + cos(aa) * d * t, e.y1! + sin(aa) * d * t, i % 2 ? c : 0xffffff, 30, 1.2, 0.8));
          }
        }
        later(0.3, () => {
          this.ringFx(e.x, e.y, 60, c);
          for (let i = 0; i < 10; i++) {
            const aa = (i / 10) * Math.PI * 2;
            this.spawnBit('petal', e.x + cos(aa) * 14, e.y - 40 + sin(aa) * 14, i % 2 ? c : 0xffe0f0, 12, 1.4, 1.1, aa, 0.2);
          }
        });
        break;
      }
      case 'bstorm': {
        // 색색 나비 떼 회오리
        const pal = [P(0, 0xffe066), P(1, 0xff9ad8), P(2, 0xffffff), 0x7ad8ff];
        this.ringFx(e.x, e.y, r, pal[0]);
        for (let k = 0; k < 16; k++)
          later(k * 0.24, () => {
            for (let i = 0; i < 7; i++) {
              const aa = rnd() * Math.PI * 2, d = r * (0.3 + rnd() * 0.7);
              this.spawnBit(i % 2 ? 'bfly' : 'scale', e.x + cos(aa) * d, e.y + sin(aa) * d, pal[(i + k) % 4], 160 + rnd() * 80, 0.7, i % 2 ? 0.9 + rnd() * 0.5 : 0.8, aa + Math.PI / 2, 0.3);
            }
            if (k % 4 === 0) this.ringFx(e.x, e.y, r * (0.6 + rnd() * 0.3), pal[k % 4]);
          });
        hit(12, 0.04);
        break;
      }
      case 'eyespot': {
        // 큰 눈알 두 개가 확 커지며 깜빡 + 밀어내는 바람
        const c = P(0, 0xffd23f);
        for (const sd of [-1, 1]) {
          const x = e.x + cos(a) * 50 - sin(a) * 38 * sd, y = e.y + sin(a) * 50 + cos(a) * 38 * sd;
          this.fx('ring', x, y, c, 10, 120, 0.5);
          this.fx('ring', x, y, 0x1b1b1b, 6, 60, 0.45);
          this.fx('ring', x, y, 0xffffff, 2, 22, 0.4);
          later(0.25, () => this.fx('ring', x, y, c, 30, 90, 0.35));
        }
        this.coneFx(e.x, e.y, a, r, 0.8, P(1, 0xd8b888), false);
        for (let i = 0; i < 20; i++) this.spawnBit('scale', e.x, e.y, i % 2 ? c : 0xffffff, 200 + rnd() * 200, 0.6, 0.9, a, 1.6);
        hit(12, 0.06);
        break;
      }
      case 'morpho': {
        // 금속빛 파랑 섬광 부채꼴과 별 조각
        const c = P(0, 0x4aa8ff);
        this.coneFx(e.x, e.y, a, r, half, c, true);
        this.fx('ring', e.x, e.y, 0xffffff, 20, 140, 0.25);
        for (let i = 0; i < 40; i++) {
          const aa = a + (rnd() - 0.5) * half * 2, d = r * rnd();
          this.spawnBit(i % 3 === 0 ? 'star' : 'scale', e.x + cos(aa) * d, e.y + sin(aa) * d, i % 2 ? c : P(1, 0xb0f0ff), 40 + rnd() * 80, 0.8, 0.9);
        }
        hit(10, 0.05);
        break;
      }
      case 'hairs': {
        // 바늘처럼 날아가는 독털
        const c = P(0, 0xfff0b0);
        this.coneFx(e.x, e.y, a, r, half, c, false);
        for (let i = 0; i < 60; i++) later(rnd() * 0.25, () => this.spawnBit('hair', e.x, e.y, i % 3 ? c : P(1, 0xd8b870), r * (1.6 + rnd() * 1.4), 0.5, 0.8, a, half * 2));
        hit(5, 0.02);
        break;
      }
    }
  }

  /** 부채꼴: 칼날 3겹이 휘두르듯 지나간다 */
  private coneFx(x: number, y: number, angle: number, range: number, half: number, col: number, slashes: boolean) {
    if (slashes)
      for (let j = 0; j < 3; j++) {
        const rr = range * (0.75 + j * 0.25);
        this.fx('slash', x + Math.cos(angle) * rr * 0.35, y + Math.sin(angle) * rr * 0.35, j === 1 ? 0xffffff : col, rr * 1.1, rr * 1.5, 0.35 + j * 0.08, angle - 0.5 + j * 0.25, 2.5);
      }
    this.addShape((g, k) => {
      const grow = 1 - k;
      g.moveTo(x, y).arc(x, y, range * (0.5 + 0.55 * grow), angle - half, angle + half).lineTo(x, y).fill({ color: col, alpha: 0.22 * k });
      for (let j = 0; j < 3; j++) {
        const rr = range * (0.55 + 0.22 * j) * (0.85 + 0.3 * grow);
        const a0 = angle - half * (1.1 - j * 0.15), a1 = angle + half * (1.1 - j * 0.15);
        g.moveTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr).arc(x, y, rr, a0, a1).stroke({ width: (14 - j * 4) * k, color: j === 1 ? 0xffffff : col, alpha: k });
      }
    }, 0.5);
    if (this.isNear(x, y)) this.speedLines = Math.max(this.speedLines, 0.25);
    for (let i = 0; i < 18; i++) {
      const a = angle + (Math.random() - 0.5) * 2 * half;
      this.spawnParticle(x + Math.cos(a) * range * 0.8, y + Math.sin(a) * range * 0.8, i % 2 ? col : 0xffffff, 60 + Math.random() * 160, 0.5, 0.55);
    }
  }

  /** 원형 폭발: 충격파 + 금 간 땅 */
  private aoeFx(x: number, y: number, r: number, col: number, cracks: boolean) {
    this.fx('ring', x, y, col, r * 0.4, r * 2.6, 0.55);
    this.fx('ring', x, y, 0xffffff, r * 0.2, r * 2.0, 0.4);
    this.fx('flare', x, y, col, r * 0.8, r * 2.4, 0.45, 0, 1.5);
    this.decal(x, y, r * 1.1, 0x1a1008);
    if (this.isNear(x, y)) this.speedLines = 0.35;
    const lines: number[][] = [];
    if (cracks)
      for (let j = 0; j < 9; j++) {
        const pts = [x, y];
        let a = (j / 9) * Math.PI * 2 + Math.random() * 0.4;
        for (let s = 1; s <= 4; s++) {
          a += (Math.random() - 0.5) * 0.6;
          pts.push(x + Math.cos(a) * r * 0.22 * s, y + Math.sin(a) * r * 0.22 * s);
        }
        lines.push(pts);
      }
    this.addShape((g, k) => {
      const grow = 1 - k;
      g.circle(x, y, r * (0.3 + 0.8 * Math.sqrt(grow))).fill({ color: col, alpha: 0.3 * k });
      g.circle(x, y, r * (0.3 + 0.8 * Math.sqrt(grow))).stroke({ width: 14 * k, color: col, alpha: k });
      g.circle(x, y, r * (0.15 + 1.1 * grow)).stroke({ width: 5 * k, color: 0xffffff, alpha: k * 0.9 });
      for (const c of lines) g.poly(c, false).stroke({ width: 5 * k, color: 0x3a2a10, alpha: k * 0.7 });
    }, 0.8);
    for (let i = 0; i < 40; i++) this.spawnParticle(x, y, i % 2 ? col : 0xffffff, 120 + Math.random() * 320, 0.7, 0.7);
  }

  /** 직선: 빛줄기 + 잔상 */
  private lineFx(x: number, y: number, angle: number, len: number, w: number, col: number, core: number) {
    const ex = x + Math.cos(angle) * len, ey = y + Math.sin(angle) * len;
    this.addShape((g, k) => {
      g.moveTo(x, y).lineTo(ex, ey).stroke({ width: w * (0.5 + 0.5 * k), color: col, alpha: 0.35 * k, cap: 'round' });
      g.moveTo(x, y).lineTo(ex, ey).stroke({ width: w * 0.3 * k, color: core, alpha: 0.9 * k, cap: 'round' });
    }, 0.4);
    for (let i = 0; i < 16; i++) {
      const t = Math.random();
      this.spawnParticle(x + (ex - x) * t, y + (ey - y) * t, i % 2 ? col : core, 40 + Math.random() * 90, 0.45, 0.5);
    }
  }

  private ringFx(x: number, y: number, r: number, col: number) {
    this.fx('ring', x, y, col, r * 0.5, r * 2.1, 0.55);
    this.addShape((g, k) => g.circle(x, y, r * (0.6 + 0.45 * (1 - k))).stroke({ width: 8 * k, color: col, alpha: k * 0.85 }), 0.5);
  }

  private addShape(draw: (g: Graphics, k: number) => void, life: number) {
    this.shapes.push({ draw, life, max: life });
  }

  /** 텍스처 효과 하나(커지며 사라짐, 가산 합성) */
  private fx(tex: string, x: number, y: number, color: number, size0: number, size1: number, life: number, rot = 0, vr = 0, alpha = 1) {
    if (this.fxs.length > 160) return;
    const s = new Sprite(this.tex[tex]);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = rot;
    s.tint = color;
    s.alpha = alpha;
    s.scale.set(size0 / 128);
    this.fxSpriteLayer.addChild(s);
    this.fxs.push({ s, life, max: life, s0: size0 / 128, s1: size1 / 128, a0: alpha, vr });
  }

  /** 바닥에 남는 그을린 자국 */
  private decal(x: number, y: number, r: number, color: number) {
    if (this.decalLayer.children.length > 30) this.decalLayer.children[0].destroy();
    const s = new Sprite(this.tex.scorch);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = Math.random() * Math.PI * 2;
    s.tint = color;
    s.alpha = 0.55;
    s.scale.set(r / 110);
    this.decalLayer.addChild(s);
    this.fxs.push({ s, life: 3, max: 3, s0: r / 110, s1: r / 110, a0: 0.55, vr: 0 });
  }

  private isNear(x: number, y: number) {
    const w = this.app.screen.width / this.zoom, h = this.app.screen.height / this.zoom;
    return Math.abs(x - this.camX) < w * 0.7 && Math.abs(y - this.camY) < h * 0.7;
  }

  private spawnParticle(x: number, y: number, color: number, speed: number, life: number, size: number) {
    if (this.particles.length > this.particleCap) return;
    const s = this.freeParticles.pop() ?? new Sprite(this.tex.dot);
    s.texture = this.tex.dot;
    s.rotation = 0;
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = color;
    s.alpha = 1;
    s.position.set(x, y);
    s.scale.set(size);
    s.visible = true;
    if (!s.parent) this.fxLayer.addChild(s);
    const a = Math.random() * Math.PI * 2;
    this.particles.push({ s, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, max: life, grow: -size * 0.6, drag: 3.2 });
  }

  /** 종별 입자 하나: 모양마다 움직임이 다르다(꽃잎은 흔들리며 떠다니고, 불씨는 오르고, 방울은 떨어진다) */
  private spawnBit(bit: FxBit | 'bfly' | 'puff', x: number, y: number, color: number, speed: number, life: number, size: number, dir?: number, spread = Math.PI) {
    if (this.particles.length > this.particleCap) return;
    if (bit === 'dot') return this.spawnParticle(x, y, color, speed, life, size);
    const s = this.freeParticles.pop() ?? new Sprite(this.tex.dot);
    s.texture = this.tex['bit_' + bit];
    s.anchor.set(0.5);
    const glow = bit === 'mote' || bit === 'ember' || bit === 'star' || bit === 'shard' || bit === 'scale';
    s.blendMode = glow ? 'add' : 'normal';
    s.tint = color;
    s.alpha = 1;
    s.position.set(x, y);
    s.rotation = Math.random() * Math.PI * 2;
    s.scale.set(size);
    s.visible = true;
    if (!s.parent) this.fxLayer.addChild(s);
    const a = dir === undefined ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * spread;
    const p: Particle = { s, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, max: life, grow: -size * 0.3, drag: 2.4 };
    switch (bit) {
      case 'petal':
      case 'leaf':
      case 'paper':
        p.vr = (Math.random() - 0.5) * 8;
        p.sway = 0.6 + Math.random();
        p.g = 40;
        p.drag = 3;
        p.grow = 0;
        p.fade = 0.95;
        break;
      case 'ember':
        p.g = -120;
        p.grow = -size * 0.8;
        break;
      case 'drop':
        p.g = 420;
        p.s.rotation = 0;
        p.drag = 1.2;
        break;
      case 'bubble':
        p.g = -60;
        p.grow = size * 0.9;
        p.drag = 2;
        p.fade = 0.8;
        break;
      case 'shard':
        p.vr = (Math.random() - 0.5) * 22;
        p.drag = 3.5;
        break;
      case 'star':
        p.vr = (Math.random() - 0.5) * 6;
        p.grow = -size * 0.9;
        break;
      case 'silk':
        p.vr = (Math.random() - 0.5) * 3;
        p.drag = 4;
        p.grow = 0;
        p.fade = 0.8;
        break;
      case 'sand':
        p.g = 160;
        p.vr = (Math.random() - 0.5) * 10;
        break;
      case 'mote':
        p.drag = 3;
        p.sway = 0.3;
        break;
      case 'scale':
        p.vr = (Math.random() - 0.5) * 10;
        p.sway = 0.5;
        p.g = 18;
        p.drag = 3.2;
        p.grow = 0;
        p.fade = 0.6;
        break;
      case 'hair':
        p.s.rotation = a;
        p.drag = 1.4;
        p.grow = 0;
        p.fade = 0.7;
        break;
      case 'ant':
        p.s.rotation = a;
        p.drag = 0.6;
        p.grow = 0;
        p.fade = 0.85;
        break;
      case 'puff':
        p.drag = 4.5;
        p.grow = size * 1.6;
        p.vr = (Math.random() - 0.5) * 1.5;
        p.fade = 0.9;
        break;
      case 'bfly':
        p.s.rotation = a + Math.PI / 2;
        p.sway = 1.2;
        p.drag = 0.8;
        p.grow = 0;
        p.fade = 0.7;
        break;
    }
    this.particles.push(p);
  }

  /** 종별 연출: 기술 모양을 따라 종의 입자를 뿌리고, 몸에 모션(잔상·빛무리·회오리 …)을 붙인다 */
  private flourish(e: Extract<GameEvent, { type: 'fx' }>, th: FxTheme | null, near: boolean, mine: boolean) {
    if (!th || !near) return;
    const [p0, p1, p2] = th.pal;
    const col = (i: number) => (i % 3 === 0 ? p0 : i % 3 === 1 ? p1 : p2);
    const a = e.angle ?? 0, r = e.r ?? 90, len = e.len ?? 0, half = e.half ?? 0.6;
    const n = th.base ? 12 : MOTION_KINDS.has(e.kind) ? 12 : 30;
    const sz = th.bit === 'sand' ? 1.1 : th.bit === 'silk' ? 1.3 : 1;
    for (let i = 0; i < n; i++) {
      let x = e.x, y = e.y, dir: number | undefined, spd = 80 + Math.random() * 160;
      if (len > 0) {
        // 직선: 길을 따라 뿌리고 옆으로 흩어진다
        const t = Math.random();
        x += Math.cos(a) * len * t;
        y += Math.sin(a) * len * t;
        dir = a + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        spd *= 0.6;
      } else if (e.half !== undefined) {
        const aa = a + (Math.random() - 0.5) * half * 2;
        const d = r * (0.4 + Math.random() * 0.7);
        x += Math.cos(aa) * d;
        y += Math.sin(aa) * d;
        dir = aa;
      } else {
        const aa = Math.random() * Math.PI * 2;
        const d = r * Math.random() * 0.8;
        x += Math.cos(aa) * d;
        y += Math.sin(aa) * d;
        dir = aa;
      }
      this.spawnBit(th.bit, x, y, col(i), spd, 0.6 + Math.random() * 0.6, sz * (0.8 + Math.random() * 0.6), dir, 1.2);
    }
    // 모션: 시전한 곤충 몸에 잠깐 붙는다
    this.flair.set(e.snake, { th, t: th.motion === 'phantom' ? 0.9 : 0.6, max: th.motion === 'phantom' ? 0.9 : 0.6 });
    // 몸 동작이 있는 기술은 종 연출의 고리·번쩍을 빼고 입자만 남긴다(몸 동작이 주인공)
    if (th.base || MOTION_KINDS.has(e.kind)) return;
    switch (th.motion) {
      case 'heavy':
        this.decal(e.x, e.y, r * 0.8, 0x1a1008);
        this.fx('ring', e.x, e.y, p0, r * 0.3, r * 1.8, 0.45);
        if (mine) this.shake = Math.max(this.shake, 8);
        break;
      case 'glow':
        this.fx('flare', e.x, e.y, p1, r * 0.4, r * 1.8, 0.6, 0, 0.5, 0.8);
        break;
      case 'zigzag': {
        const pts: number[][] = [];
        for (let j = 0; j < 4; j++) {
          const aa = (len > 0 ? a : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * 1.6;
          const line = [e.x, e.y];
          let x = e.x, y = e.y;
          for (let s2 = 0; s2 < 5; s2++) {
            x += Math.cos(aa + (Math.random() - 0.5) * 1.4) * r * 0.25;
            y += Math.sin(aa + (Math.random() - 0.5) * 1.4) * r * 0.25;
            line.push(x, y);
          }
          pts.push(line);
        }
        this.addShape((g, k) => {
          for (const l of pts) {
            g.poly(l, false).stroke({ width: 7 * k, color: p0, alpha: 0.5 * k });
            g.poly(l, false).stroke({ width: 2.5 * k, color: 0xffffff, alpha: k });
          }
        }, 0.3);
        break;
      }
      case 'drip':
        for (let i = 0; i < 6; i++) this.decal(e.x + (Math.random() - 0.5) * r, e.y + (Math.random() - 0.5) * r, 10 + Math.random() * 14, p0);
        break;
      case 'spin':
        for (let k = 0; k < 2; k++) this.afterMs(() => this.ringFx(e.x, e.y, r * (0.5 + k * 0.3), k ? p1 : p0), k * 110);
        break;
      default:
        break;
    }
  }

  private popup(x: number, y: number, text: string, color: number, size: number, life?: number, title = false) {
    const big = size >= 30 || title;
    const t = new Text({
      text,
      style: {
        fontFamily: big ? TITLE : FONT,
        fontSize: size,
        fill: color,
        stroke: { color: INK, width: Math.max(5, size * 0.22), join: 'round' },
        dropShadow: { color: 0x000000, alpha: 0.35, distance: Math.max(3, size * 0.12), angle: Math.PI / 2, blur: 0 },
        padding: 8,
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0.3);
    t.rotation = (Math.random() - 0.5) * 0.12;
    this.popupLayer.addChild(t);
    const L = life ?? (big ? 1.6 : 1.2);
    this.popups.push({ t, vx: 0, vy: big ? -28 : -52, g: 0, life: L, max: L, big: 1.45 });
    void title;
  }

  /** 피해 숫자: 옆으로 튀며 솟았다가 떨어진다 */
  private dmgPop(x: number, y: number, dmg: number, color: number, size: number, bang: boolean) {
    if (!this.opts.numbers) return;
    if (this.popups.length > 60) return;
    const t = new BitmapText({ text: bang ? `${dmg}!` : String(dmg), style: { fontFamily: 'dmg', fontSize: size } });
    t.tint = color;
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() - 0.5) * 20, y - 10);
    t.scale.set(0.2);
    t.rotation = (Math.random() - 0.5) * 0.3;
    this.popupLayer.addChild(t);
    const iz = 1 / Math.max(0.5, this.zoom);
    this.popups.push({ t, vx: (Math.random() - 0.5) * 240 * iz, vy: (-320 - Math.random() * 120) * iz, g: 900 * iz, life: 0.95, max: 0.95, big: 1.9 });
  }

  /** 내가 같은 상대를 연달아 때리면 콤보로 모아 보여 준다 */
  private comboHit(id: number, dmg: number, x: number, y: number) {
    if (!this.opts.numbers) return;
    let c = this.combos.get(id);
    if (!c || c.life <= 0) {
      if (c) c.t.destroy();
      const t = new BitmapText({ text: '', style: { fontFamily: 'dmg', fontSize: 24 } });
      t.tint = 0xffe066;
      t.anchor.set(0.5);
      this.popupLayer.addChild(t);
      c = { t, n: 0, total: 0, life: 0, x, y };
      this.combos.set(id, c);
    }
    c.n++;
    c.total += dmg;
    c.life = 1.1;
    c.x = x;
    c.y = y;
    const txt = c.n >= 2 ? `${c.n}연타! ${c.total}` : '';
    if (c.t.text !== txt) c.t.text = txt;
    c.t.scale.set(1.5 / Math.max(0.6, this.zoom));
  }

  /** 종 초상화(카드·HUD·결과 화면용 이미지). 한 번 그려 두고 재사용 */
  private bwingCache = new Map<string, Texture>();
  /** 나비 날개 한쪽(앞날개 + 뒷날개). 뿌리 = (BW_AX, BW_AY), +x = 몸 바깥, -y = 앞쪽 */
  private bwingTex(key: string, look: import('../shared/species').Look): Texture {
    const hit = this.bwingCache.get(key);
    if (hit) return hit;
    const b = look.bwing!;
    const g = new Graphics();
    const W = BW_W, H = BW_H, ox = W * BW_AX, oy = H * BW_AY;
    g.rect(0, 0, W, H).fill({ color: 0, alpha: 0 });
    const ink = { width: 3, color: 0x1b2a12 };
    const moth = b.kind === 'moth';
    const fw = moth ? 0.8 : 1, hw = moth ? 0.8 : 1;
    // 앞날개: 뿌리에서 앞·바깥으로 뻗은 둥근 세모
    const fore = (gg: Graphics) => gg.moveTo(ox, oy - 4).bezierCurveTo(ox + 30 * fw, oy - 70 * fw, ox + 92 * fw, oy - 92 * fw, ox + 112 * fw, oy - 72 * fw).bezierCurveTo(ox + 122 * fw, oy - 40 * fw, ox + 100 * fw, oy - 8, ox + 76 * fw, oy + 2).closePath();
    // 뒷날개: 뒤·바깥으로 둥글게(호랑나비는 꼬리 돌기)
    const hind = (gg: Graphics) => {
      gg.moveTo(ox + 2, oy + 2).bezierCurveTo(ox + 50 * hw, oy - 6, ox + 96 * hw, oy + 14 * hw, ox + 88 * hw, oy + 48 * hw);
      if (b.kind === 'swallow') gg.lineTo(ox + 74, oy + 66).lineTo(ox + 70, oy + 92).lineTo(ox + 60, oy + 68);
      gg.bezierCurveTo(ox + 44 * hw, oy + 78 * hw, ox + 14, oy + 50 * hw, ox + 2, oy + 10).closePath();
    };
    const c1 = b.c1, c2 = b.c2, c3 = b.c3;
    hind(g);
    g.fill(b.kind === 'owl' ? lighterC(c1, 0.1) : c1).stroke(ink);
    fore(g);
    g.fill(c1).stroke(ink);
    switch (b.kind) {
      case 'swallow':
        // 검은 줄무늬(앞날개 가로 띠) + 검은 테두리 + 뒷날개 푸른 점·붉은 눈무늬
        for (let i = 0; i < 4; i++) {
          const t = 0.22 + i * 0.2;
          g.moveTo(ox + 10 + t * 20, oy - 8 - t * 60).lineTo(ox + 30 + t * 80, oy - 30 - t * 60).stroke({ width: 7 - i, color: c2, cap: 'round' });
        }
        g.moveTo(ox + 76, oy + 2).bezierCurveTo(ox + 100, oy - 8, ox + 122, oy - 40, ox + 112, oy - 72).stroke({ width: 9, color: c2 });
        g.moveTo(ox + 88, oy + 48).bezierCurveTo(ox + 70, oy + 62, ox + 44, oy + 70, ox + 24, oy + 52).stroke({ width: 9, color: c2 });
        for (let i = 0; i < 4; i++) g.circle(ox + 32 + i * 14, oy + 54 - i * 4, 3.6).fill(c3);
        g.circle(ox + 22, oy + 50, 6).fill(0xff5a3a).circle(ox + 22, oy + 50, 2.5).fill(c2);
        break;
      case 'monarch':
        // 굵은 검은 날개맥 + 검은 테두리에 흰 점 두 줄
        for (const [x1, y1] of [[100, -76], [112, -50], [92, -22], [70, -4]]) g.moveTo(ox + 6, oy - 2).quadraticCurveTo(ox + x1 * 0.4, oy + y1 * 0.7, ox + x1, oy + y1).stroke({ width: 3, color: c2 });
        for (const [x1, y1] of [[84, 40], [60, 62], [30, 58]]) g.moveTo(ox + 4, oy + 6).quadraticCurveTo(ox + x1 * 0.5, oy + y1 * 0.4, ox + x1, oy + y1).stroke({ width: 3, color: c2 });
        g.moveTo(ox + 76, oy + 2).bezierCurveTo(ox + 100, oy - 8, ox + 122, oy - 40, ox + 112, oy - 72).bezierCurveTo(ox + 92, oy - 92, ox + 40, oy - 74, ox + 20, oy - 44).stroke({ width: 8, color: c2 });
        g.moveTo(ox + 88, oy + 48).bezierCurveTo(ox + 70, oy + 72, ox + 30, oy + 72, ox + 12, oy + 40).stroke({ width: 8, color: c2 });
        for (let i = 0; i < 7; i++) g.circle(ox + 112 - i * 5, oy - 70 + i * 11, 2).fill(c3);
        for (let i = 0; i < 6; i++) g.circle(ox + 84 - i * 12, oy + 50 + Math.sin(i) * 8, 2).fill(c3);
        break;
      case 'owl':
        // 갈색 물결 무늬 + 뒷날개 큰 노란 눈알
        for (let i = 0; i < 3; i++) g.moveTo(ox + 20, oy - 20 - i * 18).bezierCurveTo(ox + 50, oy - 30 - i * 18, ox + 70, oy - 10 - i * 18, ox + 104, oy - 30 - i * 16).stroke({ width: 3, color: c2, alpha: 0.7 });
        g.circle(ox + 58, oy + 34, 20).fill(c3).stroke({ width: 3, color: c2 });
        g.circle(ox + 58, oy + 34, 12).fill(0x141414);
        g.circle(ox + 53, oy + 29, 4.5).fill(0xffffff);
        g.circle(ox + 92, oy - 56, 6).fill(c3).circle(ox + 92, oy - 56, 3).fill(0x141414);
        break;
      case 'morpho': {
        // 가운데가 밝은 금속 파랑 + 검은 테두리 + 흰 점
        g.moveTo(ox + 10, oy - 8).bezierCurveTo(ox + 40, oy - 56, ox + 80, oy - 66, ox + 96, oy - 52).bezierCurveTo(ox + 96, oy - 30, ox + 80, oy - 10, ox + 60, oy - 4).closePath().fill({ color: c3, alpha: 0.55 });
        g.moveTo(ox + 8, oy + 8).bezierCurveTo(ox + 40, oy + 6, ox + 66, oy + 22, ox + 62, oy + 44).bezierCurveTo(ox + 40, oy + 54, ox + 20, oy + 40, ox + 8, oy + 12).closePath().fill({ color: c3, alpha: 0.5 });
        g.moveTo(ox + 76, oy + 2).bezierCurveTo(ox + 100, oy - 8, ox + 122, oy - 40, ox + 112, oy - 72).bezierCurveTo(ox + 92, oy - 92, ox + 60, oy - 84, ox + 44, oy - 68).stroke({ width: 10, color: c2 });
        g.moveTo(ox + 88, oy + 48).bezierCurveTo(ox + 70, oy + 72, ox + 30, oy + 72, ox + 12, oy + 40).stroke({ width: 9, color: c2 });
        for (let i = 0; i < 4; i++) g.circle(ox + 108 - i * 6, oy - 66 + i * 12, 2.4).fill(0xffffff);
        break;
      }
      case 'moth':
        // 복슬한 크림색 + 작은 갈색 점
        for (let i = 0; i < 6; i++) g.circle(ox + 30 + (i % 3) * 22, oy - 20 - Math.floor(i / 3) * 22, 3).fill({ color: c2, alpha: 0.8 });
        g.moveTo(ox + 20, oy - 10).bezierCurveTo(ox + 50, oy - 40, ox + 70, oy - 40, ox + 86, oy - 56).stroke({ width: 2, color: c3, alpha: 0.6 });
        g.circle(ox + 40, oy + 30, 4).fill({ color: c3, alpha: 0.7 });
        break;
    }
    // 날개 뿌리 털
    g.circle(ox + 4, oy, 7).fill(look.body);
    const t = this.app.renderer.generateTexture({ target: g, resolution: 2, frame: new Rectangle(0, 0, W, H) });
    this.bwingCache.set(key, t);
    return t;
  }

  portrait(key: string): string {
    if (!key.includes('@') && key !== 'boss') key = `${key}@2`;
    const cached = this.portraits.get(key);
    if (cached) return cached;
    const look = lookOf(key);
    const feats = new Set(look.feats ?? []);
    const kit = headKit(this.app.renderer, key);
    const grub = look.shape === 'cute';
    const c = new Container();
    const r = 22, scale = (r * 2) / 64;
    const n = key === 'boss' ? 8 : grub ? 6 : 5;
    const ang = -0.65;
    const pts: [number, number][] = [[0, 0]];
    for (let i = 1; i < n; i++) {
      const a = ang + Math.PI + Math.sin(i * 0.9) * 0.35;
      const [px, py] = pts[i - 1];
      pts.push([px + Math.cos(a) * r * 1.2, py + Math.sin(a) * r * 1.2]);
    }
    const spider = feats.has('legs8'), centi = feats.has('centipede');
    for (let i = 1; i < n; i++) {
      const on = centi ? true : spider ? i <= 3 : !grub && i <= 3;
      if (!on) continue;
      const leg = new Sprite(this.tex.legs);
      leg.anchor.set(0.5);
      leg.position.set(pts[i][0], pts[i][1]);
      leg.rotation = ang + Math.sin(i * 1.7) * 0.3;
      leg.scale.set(scale * (spider ? 1.5 : 1.1));
      c.addChild(leg);
    }
    if (feats.has('stinger')) {
      const st = new Sprite(this.tex.sting);
      st.anchor.set(1, 0.5);
      const [tx, ty] = pts[n - 1];
      st.position.set(tx, ty);
      st.rotation = ang;
      st.scale.set(scale * 1.2);
      c.addChild(st);
    }
    for (let i = n - 1; i >= 1; i--) {
      const [x, y] = pts[i];
      const taper = i > n - 3 ? 0.85 : 1;
      const b = new Sprite(this.tex.body);
      b.anchor.set(0.5);
      b.position.set(x, y);
      b.scale.set(scale * taper);
      const stripe = look.pattern === 'swarm' ? i % 3 === 0 : Math.floor(i / 2) % 2 === 1;
      b.tint = stripe ? look.stripe : look.body;
      c.addChild(b);
      const sh = new Sprite(this.tex.shine);
      sh.anchor.set(0.5);
      sh.position.set(x - r * 0.25, y - r * 0.35);
      sh.scale.set(scale * 0.9 * taper);
      sh.alpha = look.pattern === 'metal' ? 0.85 : 0.5;
      c.addChild(sh);
      if (look.pattern === 'spots' && i % 2 === 1) {
        const sp = new Sprite(this.tex.spot);
        sp.anchor.set(0.5);
        sp.position.set(x + 4, y - 2);
        sp.scale.set(scale * 0.55);
        sp.tint = 0x1b1b1b;
        c.addChild(sp);
      }
      if (feats.has('lamp') && i >= n - 2) {
        const gl = new Sprite(this.tex.spot);
        gl.anchor.set(0.5);
        gl.position.set(x, y);
        gl.scale.set(scale * 0.8);
        gl.tint = 0xe8ff6a;
        c.addChild(gl);
      }
    }
    if (feats.has('bwings') && look.bwing) {
      const t = this.bwingTex(key, look);
      for (const side of [1, -1]) {
        const w = new Sprite(t);
        w.anchor.set(BW_AX, BW_AY);
        w.position.set((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
        w.rotation = ang + side * (Math.PI / 2 + 0.12);
        w.scale.set(scale * 1.15, scale * 1.15 * side);
        c.addChild(w);
      }
    } else if (feats.has('wings') || feats.has('wings4')) {
      const k = feats.has('wings4') ? 4 : 2;
      for (let j = 0; j < k; j++) {
        const w = new Sprite(this.tex.wing);
        if (look.wingTint !== undefined) w.tint = look.wingTint;
        w.anchor.set(0.05, 0.5);
        w.position.set(pts[1][0], pts[1][1]);
        const side = j % 2 === 0 ? 1 : -1;
        w.rotation = ang + Math.PI + side * (0.5 + (j < 2 ? 0 : 0.35));
        w.scale.set(scale * 1.25, scale * 0.9);
        w.alpha = 0.8;
        c.addChild(w);
      }
    }
    const headR = r * (grub ? 1.3 : 1.55);
    const hk = headR / HR;
    const place = (front: boolean) => {
      for (const part of kit.parts) {
        if (part.front !== front) continue;
        for (const side of [1, -1] as const) {
          const sp = new Sprite(part.tex);
          sp.anchor.set(part.ax, part.ay);
          const lx = part.x * headR, ly = part.y * headR * side;
          sp.position.set(Math.cos(ang) * lx - Math.sin(ang) * ly, Math.sin(ang) * lx + Math.cos(ang) * ly);
          sp.rotation = ang + side * (part.rot + 0.1);
          sp.scale.set(hk, hk * side);
          c.addChild(sp);
        }
      }
    };
    place(false);
    const hb = new Sprite(kit.base);
    hb.anchor.set(kit.ax, kit.ay);
    hb.rotation = ang;
    hb.scale.set(hk);
    c.addChild(hb);
    place(true);
    const canvas = this.app.renderer.extract.canvas({ target: c, resolution: 2 }) as HTMLCanvasElement;
    const url = canvas.toDataURL();
    c.destroy({ children: true });
    this.portraits.set(key, url);
    return url;
  }

  /** 렌더러 시간 기준 예약(느리게 보기·한 장씩 넘기기에서도 순서가 맞게) */
  private timers: { at: number; fn: () => void }[] = [];
  private afterMs(fn: () => void, ms: number) {
    this.timers.push({ at: this.time + ms / 1000, fn });
  }

  private lastDt = 0.016;
  render(frame: Frame, dt: number) {
    this.lastDt = dt;
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }
    this.shapeGfx.clear();
    this.setMap(frame.map);
    const W = this.app.screen.width, H = this.app.screen.height;
    const player = frame.snakes.find((s) => s.id === frame.playerId);

    if (player && player.alive && player.segs.length >= 2) {
      const k = 1 - Math.exp(-dt * 14);
      this.camX += (player.segs[0] - this.camX) * k;
      this.camY += (player.segs[1] - this.camY) * k;
      const base = Math.max(0.85, Math.min(1.6, Math.min(W, H) / 560));
      const lenZoom = Math.max(0.64, Math.min(1.12, 1.12 - player.length * 0.0022));
      const sizeZoom = Math.max(0.72, Math.min(1, Math.pow(10 / player.r, 0.4)));
      this.zoom += (base * lenZoom * sizeZoom * this.opts.zoomMul - this.zoom) * (1 - Math.exp(-dt * 2));
    }
    this.shake *= Math.exp(-dt * 7);
    this.punch *= Math.exp(-dt * 9);
    if (!this.opts.shake) this.shake = this.punch = 0;
    this.labelLayer.visible = this.opts.labels;
    const z = this.zoom * (1 + this.punch);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.world.scale.set(z);
    this.world.position.set(W / 2 - this.camX * z + sx, H / 2 - this.camY * z + sy);
    if (this.waves.length) {
      for (const w of this.waves) {
        w.t += dt;
        w.f.time = w.t;
        const p = this.world.toGlobal({ x: w.x, y: w.y });
        w.f.centerX = p.x;
        w.f.centerY = p.y;
        w.f.amplitude *= Math.exp(-dt * 3);
      }
      const before = this.waves.length;
      this.waves = this.waves.filter((w) => w.t < w.life);
      if (this.waves.length !== before) this.world.filters = this.waves.length ? this.waves.map((w) => w.f) : null;
    }
    const hw = W / z / 2 + 90, hh = H / z / 2 + 90;
    this.view = { x0: this.camX - hw, x1: this.camX + hw, y0: this.camY - hh, y1: this.camY + hh };
    for (const m of [this.flashT, this.biteT, this.strikeT, this.pulseT]) {
      for (const [k, v] of m) {
        if (v - dt <= 0) m.delete(k);
        else m.set(k, v - dt);
      }
    }

    this.playerFam = player ? player.family : null;
    this.playerLv = player ? player.level : 1;
    this.drawZones(frame.zones, frame.playerId);
    this.drawTeles(frame.teles, frame.playerId, frame.snakes);
    this.drawFoods(frame.foods, player && player.alive ? player.family : null);
    this.drawRings(frame.rings);
    this.drawMarks(frame.snakes, player);

    this.statusGfx.clear();
    this.hpGfx.clear();
    const seen = new Set<number>();
    for (const pool of [this.shadowPool, this.glowPool, this.legPool, this.bodyPool]) pool.begin();
    for (const s of frame.snakes) {
      seen.add(s.id);
      this.drawSnake(s, player);
    }
    for (const pool of [this.shadowPool, this.glowPool, this.legPool, this.bodyPool]) pool.end();
    for (const [id, g] of this.snakes) {
      if (seen.has(id)) continue;
      g.head.visible = g.label.visible = false;
      for (const w of g.wings) w.visible = false;
    }
    this.drawProjs(frame.projs);
    this.drawMinions(frame.minions);
    this.drawAuras(frame.snakes, dt);
    this.drawEnemy(frame.enemy, frame.snakes);
    this.updateFx(dt);
  }

  /** 플레이어 기준 강약 표시: 초록(내가 강함) · 회색(비슷) · 빨강(상대가 강함) */
  private drawMarks(snakes: FrameSnake[], player: FrameSnake | undefined) {
    const g = this.markGfx;
    g.clear();
    if (!player || !player.alive) return;
    for (const s of snakes) {
      if (s.id === player.id || !s.alive || s.segs.length < 2) continue;
      const hx = s.segs[0], hy = s.segs[1];
      if (!this.isNear(hx, hy)) continue;
      const rel = relation(player, s);
      const R = s.r * headMul(s) + 10;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      if (rel > 0) {
        g.circle(hx, hy, R).stroke({ width: 3, color: 0x7dff5a, alpha: 0.75 });
      } else if (rel === 0) {
        g.circle(hx, hy, R).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
      } else {
        g.circle(hx, hy, R).stroke({ width: 3.5, color: 0xff4a3a, alpha: 0.6 + pulse * 0.35 });
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + this.time;
          g.moveTo(hx + Math.cos(a) * R, hy + Math.sin(a) * R).lineTo(hx + Math.cos(a) * (R + 9), hy + Math.sin(a) * (R + 9)).stroke({ width: 3, color: 0xff4a3a, alpha: 0.8 });
        }
      }
    }
  }

  private drawZones(zones: ZoneView[], playerId: number) {
    const g = this.zoneGfx;
    g.clear();
    const T = this.time;
    for (const z of zones) {
      if (!this.isNear(z.x, z.y)) continue;
      const k = Math.min(1, z.life / 0.5) * Math.min(1, (z.max - z.life) / 0.15 + 0.3);
      const mine = z.owner === playerId;
      switch (z.kind) {
        case 'gas': {
          // 뭉게뭉게 냄새 구름
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + T * 0.4;
            const rr = z.r * (0.45 + 0.12 * Math.sin(T * 1.7 + i));
            g.circle(z.x + Math.cos(a) * z.r * 0.42, z.y + Math.sin(a) * z.r * 0.42, rr).fill({ color: i % 2 ? 0x9aa83a : 0x7a8a2a, alpha: 0.16 * k });
          }
          g.circle(z.x, z.y, z.r * 0.6).fill({ color: 0xb8c860, alpha: 0.18 * k });
          g.circle(z.x, z.y, z.r).stroke({ width: 3, color: mine ? 0xd8e870 : 0x7a8a2a, alpha: 0.4 * k });
          if (Math.random() < 0.2) this.spawnParticle(z.x + (Math.random() - 0.5) * z.r * 1.4, z.y + (Math.random() - 0.5) * z.r * 1.4, 0xa8b850, 12, 1, 0.6);
          break;
        }
        case 'web':
        case 'prison': {
          const col = z.kind === 'prison' ? 0xe8e0ff : 0xffffff;
          const a0 = z.kind === 'prison' ? 0.9 : 0.65;
          g.circle(z.x, z.y, z.r).fill({ color: col, alpha: 0.07 * k });
          const sp = 12;
          for (let i = 0; i < sp; i++) {
            const ang = (i / sp) * Math.PI * 2;
            g.moveTo(z.x, z.y).lineTo(z.x + Math.cos(ang) * z.r, z.y + Math.sin(ang) * z.r);
          }
          g.stroke({ width: 1.8, color: col, alpha: a0 * k });
          for (let rr = z.r / 5; rr <= z.r + 1; rr += z.r / 5) {
            const pts: number[] = [];
            for (let i = 0; i <= sp; i++) {
              const ang = (i / sp) * Math.PI * 2;
              const sag = 1 - 0.06 * Math.sin(i * 1.7);
              pts.push(z.x + Math.cos(ang) * rr * sag, z.y + Math.sin(ang) * rr * sag);
            }
            g.poly(pts, false);
          }
          g.stroke({ width: 1.6, color: col, alpha: a0 * k });
          // 이슬 반짝
          if (Math.random() < 0.12) this.spawnParticle(z.x + (Math.random() - 0.5) * z.r * 1.4, z.y + (Math.random() - 0.5) * z.r * 1.4, 0xd8f0ff, 5, 0.6, 0.3);
          break;
        }
        case 'silk':
          g.circle(z.x, z.y, z.r * 0.55).fill({ color: 0xffffff, alpha: 0.28 * k });
          g.circle(z.x, z.y, z.r * 0.85).stroke({ width: 1.2, color: 0xffffff, alpha: 0.45 * k });
          break;
        case 'pit': {
          // 깔때기: 안으로 감기는 나선 + 어두운 가운데
          g.circle(z.x, z.y, z.r).fill({ color: 0xc8a870, alpha: 0.28 * k });
          for (let rr = z.r; rr > 20; rr -= z.r / 5) g.circle(z.x, z.y, rr).stroke({ width: 2.5, color: 0x8a6a3a, alpha: 0.35 * k });
          for (let j = 0; j < 4; j++) {
            const pts: number[] = [];
            for (let t = 0; t <= 1.001; t += 0.08) {
              const a = j * (Math.PI / 2) + t * 4 + T * 2.2;
              pts.push(z.x + Math.cos(a) * z.r * (1 - t), z.y + Math.sin(a) * z.r * (1 - t));
            }
            g.poly(pts, false).stroke({ width: 2.5, color: 0xf0dca8, alpha: 0.6 * k });
          }
          g.circle(z.x, z.y, 40).fill({ color: 0x3a2a14, alpha: 0.55 * k });
          if (Math.random() < 0.3) {
            const a = Math.random() * Math.PI * 2;
            this.spawnParticle(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r, 0xe8d0a0, 20, 0.6, 0.35);
          }
          break;
        }
        case 'honey':
          g.ellipse(z.x, z.y, z.r, z.r * 0.86).fill({ color: 0xffc21a, alpha: 0.3 * k }).stroke({ width: 4, color: 0xd8901a, alpha: 0.6 * k });
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const hx = z.x + Math.cos(a) * z.r * 0.5, hy = z.y + Math.sin(a) * z.r * 0.5;
            const pts: number[] = [];
            for (let j = 0; j < 6; j++) pts.push(hx + Math.cos((j / 6) * Math.PI * 2) * 12, hy + Math.sin((j / 6) * Math.PI * 2) * 12);
            g.poly(pts).stroke({ width: 2, color: 0xffe066, alpha: 0.6 * k });
          }
          break;
        case 'blade':
          for (let i = 0; i < 4; i++) {
            const a = i * 1.6 + z.x * 0.01;
            const rr = z.r * (0.4 + i * 0.15);
            g.moveTo(z.x + Math.cos(a - 0.6) * rr, z.y + Math.sin(a - 0.6) * rr).arc(z.x, z.y, rr, a - 0.6, a + 0.6).stroke({ width: 4, color: 0xe8fff0, alpha: 0.7 * k });
          }
          break;
        case 'stingers':
          for (let i = 0; i < 3; i++) {
            const a = i * 2.1, x = z.x + Math.cos(a) * 9, y = z.y + Math.sin(a) * 9;
            g.poly([x - 3, y + 4, x, y - 10, x + 3, y + 4]).fill({ color: 0x1b1b1b, alpha: k }).stroke({ width: 1.5, color: 0x9aff5a, alpha: 0.6 * k });
          }
          break;
        case 'nest': {
          for (let i = 0; i < 7; i++) {
            const a = (i / 6) * Math.PI * 2;
            const hx = i === 6 ? z.x : z.x + Math.cos(a) * 20, hy = i === 6 ? z.y : z.y + Math.sin(a) * 20;
            const pts: number[] = [];
            for (let j = 0; j < 6; j++) pts.push(hx + Math.cos((j / 6) * Math.PI * 2 + 0.5) * 11, hy + Math.sin((j / 6) * Math.PI * 2 + 0.5) * 11);
            g.poly(pts).fill({ color: 0xe8dcc0, alpha: 0.9 * k }).stroke({ width: 2, color: 0x8a7a5a, alpha: k });
          }
          if (mine) g.circle(z.x, z.y, z.r).stroke({ width: 2, color: 0xe8dcc0, alpha: 0.35 * k });
          break;
        }
        case 'bait':
          g.circle(z.x, z.y, 13).fill({ color: 0xff9ad8, alpha: k }).stroke({ width: 3, color: 0x3a3a3a, alpha: k });
          g.circle(z.x - 3, z.y - 4, 4).fill({ color: 0xffffff, alpha: k });
          if (mine) g.circle(z.x, z.y, z.r + 8).stroke({ width: 2, color: 0xff9ad8, alpha: 0.6 });
          break;
        case 'lantern':
          break;
        case 'rain':
          g.circle(z.x, z.y, z.r).fill({ color: 0x3a2a10, alpha: 0.14 * k }).stroke({ width: 3, color: 0xf2c230, alpha: 0.4 * k });
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.r;
            const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
            this.addShape((gg, kk) => gg.moveTo(x - 6, y - 40 * kk).lineTo(x, y - 4 * kk).stroke({ width: 3, color: 0x1b1b1b, alpha: kk }), 0.15);
            if (Math.random() < 0.3) this.spawnParticle(x, y, 0xb8ff5a, 30, 0.3, 0.3);
          }
          break;
        case 'decoy':
          g.circle(z.x, z.y, z.r).fill({ color: 0xffffff, alpha: 0.12 * k }).stroke({ width: 2, color: 0xffffff, alpha: 0.5 * k });
          break;
        case 'heat': {
          g.circle(z.x, z.y, z.r).fill({ color: 0xff8a1c, alpha: 0.18 * k });
          for (let i = 0; i < 6; i++) {
            const a = T * 6 + (i / 6) * Math.PI * 2;
            const bx = z.x + Math.cos(a) * z.r * 0.8, by = z.y + Math.sin(a) * z.r * 0.8;
            g.ellipse(bx, by, 7, 5).fill(0xffd23f).stroke({ width: 1.5, color: INK });
          }
          if (Math.random() < 0.4) this.spawnParticle(z.x, z.y, Math.random() < 0.5 ? 0xff8a1c : 0xffd23f, 60, 0.4, 0.5);
          break;
        }
      }
    }
  }

  /** 기술 예고(필살기): 내 것은 계열 색, 남의 것은 빨강 */
  private drawTeles(teles: TeleView[], playerId: number, snakes: FrameSnake[]) {
    const g = this.teleGfx;
    g.clear();
    for (const te of teles) {
      if (!this.isNear(te.x, te.y)) continue;
      const k = 1 - te.t / te.total;
      const ow = snakes.find((s) => s.id === te.owner);
      const col = te.owner === playerId ? famColor(ow?.family) : 0xff3a2a;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 24);
      if (te.shape === 'circle') {
        g.circle(te.x, te.y, te.r).fill({ color: col, alpha: 0.1 + 0.18 * k });
        g.circle(te.x, te.y, te.r * k).fill({ color: col, alpha: 0.18 });
        g.circle(te.x, te.y, te.r).stroke({ width: 5, color: col, alpha: 0.6 + 0.35 * pulse });
      } else if (te.shape === 'line') {
        const c = Math.cos(te.angle), s = Math.sin(te.angle), w = te.w / 2;
        const pts = [te.x - s * w, te.y + c * w, te.x + c * te.len - s * w, te.y + s * te.len + c * w, te.x + c * te.len + s * w, te.y + s * te.len - c * w, te.x + s * w, te.y - c * w];
        g.poly(pts).fill({ color: col, alpha: 0.12 + 0.18 * k }).stroke({ width: 4, color: col, alpha: 0.6 + 0.35 * pulse });
        g.moveTo(te.x, te.y).lineTo(te.x + c * te.len * k, te.y + s * te.len * k).stroke({ width: te.w * 0.5, color: col, alpha: 0.25 });
      }
    }
  }

  /** 부른 벌 */
  private drawMinions(minions: MinionView[]) {
    const g = this.minionGfx;
    g.clear();
    const T = this.time;
    for (const m of minions) {
      if (!this.isNear(m.x, m.y)) continue;
      const c = Math.cos(m.angle), s = Math.sin(m.angle);
      const wasp = m.kind === 'wasp';
      const L = wasp ? 13 : 10;
      g.ellipse(m.x + 3, m.y + 5, L, L * 0.6).fill({ color: 0x000000, alpha: 0.18 });
      const flap = Math.sin(T * 60 + m.x) * 0.5;
      for (const sd of [-1, 1]) {
        const wx = m.x - s * sd * 6, wy = m.y + c * sd * 6;
        g.ellipse(wx, wy, 7, 4 + flap * 2).fill({ color: 0xffffff, alpha: 0.6 });
      }
      g.ellipse(m.x, m.y, L, L * 0.62).fill(wasp ? 0xf2c230 : 0xf6c94a).stroke({ width: 2, color: INK });
      for (let k = -1; k <= 1; k += 2) g.moveTo(m.x + c * k * 3 - s * 5, m.y + s * k * 3 + c * 5).lineTo(m.x + c * k * 3 + s * 5, m.y + s * k * 3 - c * 5).stroke({ width: 2.5, color: 0x2a1e10 });
      g.circle(m.x + c * L * 0.8, m.y + s * L * 0.8, 4).fill(0x2a1e10);
    }
  }

  /** 몸을 따라다니는 기술 연출(천 개의 낫·맴돌기·유인등·겹눈) */
  private drawAuras(snakes: FrameSnake[], dt: number) {
    const g = this.statusGfx;
    for (const [id, list] of this.auras) {
      const s = snakes.find((x) => x.id === id);
      if (!s || !s.alive || s.segs.length < 2) {
        this.auras.delete(id);
        continue;
      }
      const hx = s.segs[0], hy = s.segs[1];
      for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i];
        a.life -= dt;
        if (a.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        const k = Math.min(1, a.life / 0.3);
        if (!this.isNear(hx, hy)) continue;
        if (a.kind === 'whirl' || a.kind === 'circle') {
          const n = a.kind === 'whirl' ? 8 : 4;
          const spin = this.time * (a.kind === 'whirl' ? 14 : 9);
          g.circle(hx, hy, a.r).stroke({ width: 3, color: a.col, alpha: 0.35 * k });
          for (let j = 0; j < n; j++) {
            const ang = spin + (j / n) * Math.PI * 2;
            const rr = a.r * (0.75 + 0.2 * Math.sin(this.time * 7 + j));
            g.moveTo(hx + Math.cos(ang - 0.45) * rr, hy + Math.sin(ang - 0.45) * rr).arc(hx, hy, rr, ang - 0.45, ang + 0.15).stroke({ width: 6, color: j % 2 ? 0xffffff : a.col, alpha: 0.9 * k });
          }
          if (Math.random() < 0.6) {
            const ang = Math.random() * Math.PI * 2;
            this.spawnParticle(hx + Math.cos(ang) * a.r * 0.8, hy + Math.sin(ang) * a.r * 0.8, a.col, 60, 0.3, 0.4);
          }
        } else if (a.kind === 'lantern') {
          const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
          g.circle(hx, hy, a.r).fill({ color: a.col, alpha: (0.06 + 0.05 * pulse) * k }).stroke({ width: 2, color: a.col, alpha: 0.4 * k });
          if (Math.random() < 0.5) {
            const ang = Math.random() * Math.PI * 2, d = Math.random() * a.r;
            this.spawnParticle(hx + Math.cos(ang) * d, hy + Math.sin(ang) * d, a.col, 10, 0.8, 0.4);
          }
        } else if (a.kind === 'compound') {
          g.circle(hx, hy, a.r + 10 * Math.sin(this.time * 6)).stroke({ width: 2.5, color: a.col, alpha: 0.6 * k });
        }
      }
    }
  }

  private drawProjs(projs: ProjView[]) {
    const g = this.shapeGfx;
    for (const p of projs) {
      if (!this.isNear(p.x, p.y)) continue;
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      switch (p.kind) {
        case 'sting':
        case 'bigsting': {
          const big = p.kind === 'bigsting' ? 1.6 : 1;
          g.moveTo(p.x - c * 70 * big, p.y - s * 70 * big).lineTo(p.x + c * 6, p.y + s * 6).stroke({ width: 12 * big, color: 0x9aff5a, alpha: 0.22 });
          g.moveTo(p.x - c * 30 * big, p.y - s * 30 * big).lineTo(p.x + c * 6, p.y + s * 6).stroke({ width: 7 * big, color: 0xd8ff8a, alpha: 0.5 });
          g.moveTo(p.x - c * 12 * big, p.y - s * 12 * big).lineTo(p.x + c * 10 * big, p.y + s * 10 * big).stroke({ width: 3.5 * big, color: 0x1b1b1b });
          g.circle(p.x + c * 10 * big, p.y + s * 10 * big, 3 * big).fill(0xffffff);
          break;
        }
        case 'silk':
          g.moveTo(p.x - c * 90, p.y - s * 90).lineTo(p.x, p.y).stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
          g.circle(p.x, p.y, 7).fill({ color: 0xffffff, alpha: 0.9 });
          break;
        case 'orb':
          g.circle(p.x, p.y, 18).fill({ color: 0xd8ff5a, alpha: 0.25 });
          g.circle(p.x, p.y, 9).fill(0xf6ffb0).stroke({ width: 2, color: 0xd8ff5a });
          if (Math.random() < 0.5) this.spawnParticle(p.x, p.y, 0xd8ff5a, 20, 0.4, 0.4);
          break;
        case 'spit':
          g.circle(p.x, p.y, 9).fill({ color: 0x9ad0ff, alpha: 0.85 }).stroke({ width: 2, color: INK });
          g.moveTo(p.x - c * 30, p.y - s * 30).lineTo(p.x, p.y).stroke({ width: 6, color: 0x9ad0ff, alpha: 0.35 });
          break;
      }
    }
  }

  /** 천적 그리기 */
  private drawEnemy(en: EnemyView | null, snakes: FrameSnake[]) {
    const g = this.enemyGfx;
    g.clear();
    const sg = this.screenGfx;
    sg.clear();
    if (!en) return;
    const T = this.time;
    if (en.kind === 'bird') {
      for (const sh of en.shadows) {
        const k = 1 - sh.t / sh.total;
        const r = sh.r * (1.6 - 0.6 * k);
        g.ellipse(sh.x, sh.y, r, r * 0.85).fill({ color: 0x000000, alpha: 0.12 + 0.35 * k });
        const w = r * 1.1;
        g.poly([sh.x - w, sh.y - r * 0.1, sh.x - w * 0.3, sh.y - r * 0.35, sh.x, sh.y - r * 0.15, sh.x + w * 0.3, sh.y - r * 0.35, sh.x + w, sh.y - r * 0.1, sh.x, sh.y + r * 0.3]).fill({ color: 0x000000, alpha: 0.15 + 0.3 * k });
        g.circle(sh.x, sh.y, sh.r).stroke({ width: 4, color: 0xff4a3a, alpha: 0.4 + 0.5 * Math.abs(Math.sin(T * 10)) * k });
      }
    } else if (en.kind === 'frog') {
      const { x, y } = en;
      const a = en.angle;
      if (en.warn > 0) g.circle(x, y, 120 + Math.sin(T * 8) * 10).stroke({ width: 6, color: 0xff4a3a, alpha: 0.7 });
      if (en.aim) {
        const k = 1 - en.aim.t / en.aim.total;
        const dx = en.aim.x - x, dy = en.aim.y - y;
        const d = Math.hypot(dx, dy) || 1;
        const L = Math.min(CONFIG.frogRange, d + 140);
        const ex = x + (dx / d) * L, ey = y + (dy / d) * L;
        // 점선 예고선
        const n = Math.floor(L / 40);
        for (let i = 0; i < n; i += 2) {
          const t0 = i / n, t1 = (i + 1) / n;
          g.moveTo(x + (ex - x) * t0, y + (ey - y) * t0).lineTo(x + (ex - x) * t1, y + (ey - y) * t1);
        }
        g.stroke({ width: 6 + k * 10, color: 0xff3a2a, alpha: 0.5 + 0.4 * Math.abs(Math.sin(T * 14)) });
        g.circle(en.aim.x, en.aim.y, 40 - k * 16).stroke({ width: 5, color: 0xff3a2a, alpha: 0.9 });
      }
      if (en.tongue) {
        g.moveTo(x, y).lineTo(en.tongue.x, en.tongue.y).stroke({ width: 22, color: 0xff7aa8, cap: 'round' });
        g.circle(en.tongue.x, en.tongue.y, 20).fill(0xff7aa8);
      }
      // 개구리 몸(가장자리에 앉아 안쪽을 본다)
      const c = Math.cos(a), s2 = Math.sin(a);
      const P = (fx: number, fy: number): [number, number] => [x + c * fx - s2 * fy, y + s2 * fx + c * fy];
      const bob = Math.sin(T * 3) * 4;
      g.ellipse(x + 10, y + 16, 110, 95).fill({ color: 0x000000, alpha: 0.2 });
      for (const sd of [-1, 1]) {
        const [lx, ly] = P(-50, sd * 85);
        g.ellipse(lx, ly, 46, 28).fill(0x3f8f2a).stroke({ width: 6, color: INK });
      }
      g.circle(x, y, 95 + bob).fill(0x5cbf3a).stroke({ width: 7, color: INK });
      g.ellipse(...P(10, 0), 60, 50).fill({ color: 0xc8f08a, alpha: 0.6 });
      for (const sd of [-1, 1]) {
        const [ex, ey] = P(40, sd * 52);
        g.circle(ex, ey, 30).fill(0x5cbf3a).stroke({ width: 6, color: INK });
        g.circle(ex, ey, 20).fill(0xfff6c8);
        const [px, py] = P(46, sd * 52);
        g.ellipse(px, py, 7, 14).fill(0x111111);
      }
      const [m1x, m1y] = P(80, -40), [m2x, m2y] = P(80, 40), [mcx, mcy] = P(96, 0);
      g.moveTo(m1x, m1y).quadraticCurveTo(mcx, mcy, m2x, m2y).stroke({ width: 6, color: INK, cap: 'round' });
    } else if (en.kind === 'rain') {
      // 화면을 어둡게 + 빗줄기
      const W = this.app.screen.width, H = this.app.screen.height;
      sg.rect(0, 0, W, H).fill({ color: 0x1a2a48, alpha: en.warn > 0 ? 0.12 : 0.22 });
      for (let i = 0; i < 70; i++) {
        const rx = ((i * 137.5 + T * 900) % (W + 200)) - 100, ry = ((i * 91.3 + T * 1600) % (H + 200)) - 100;
        sg.moveTo(rx, ry).lineTo(rx - 8, ry + 26).stroke({ width: 2, color: 0xcfe6ff, alpha: 0.45 });
      }
      for (const d of en.drops) {
        const k = 1 - d.t / d.total;
        g.circle(d.x, d.y, d.r).fill({ color: 0x2a5aa8, alpha: 0.12 + 0.22 * k });
        g.circle(d.x, d.y, d.r * (1.6 - 0.6 * k)).stroke({ width: 4, color: 0x9ad0ff, alpha: 0.4 + 0.5 * k });
      }
    } else if (en.kind === 'centipede') {
      // 왕지네는 곤충처럼 그려진다. 남은 시간만 표시
    } else if (en.kind === 'anteater') {
      const { x, y } = en;
      if (en.strip) {
        const st = en.strip;
        if (st.t > 0) {
          const k = 1 - st.t / st.total;
          g.moveTo(x, y).lineTo(st.x1, st.y1).stroke({ width: st.w, color: 0xff3a2a, alpha: 0.12 + 0.2 * k, cap: 'round' });
          // 화살표 무늬
          const dx = st.x1 - x, dy = st.y1 - y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
          for (let d = ((T * 400) % 160); d < L; d += 160) {
            const cx = x + ux * d, cy = y + uy * d;
            g.moveTo(cx - ux * 30 - uy * 40, cy - uy * 30 + ux * 40).lineTo(cx, cy).lineTo(cx - ux * 30 + uy * 40, cy - uy * 30 - ux * 40).stroke({ width: 8, color: 0xff3a2a, alpha: 0.5 + 0.3 * k });
          }
          g.moveTo(x, y).lineTo(st.x1, st.y1).stroke({ width: 4, color: 0xff3a2a, alpha: 0.8 });
        } else {
          g.moveTo(x, y).lineTo(st.x1, st.y1).stroke({ width: st.w * 0.7, color: 0xff8ab0, alpha: 0.9, cap: 'round' });
        }
      }
      // 주둥이
      const a = en.angle, c = Math.cos(a), s2 = Math.sin(a);
      g.poly([x - s2 * 90 - c * 60, y + c * 90 - s2 * 60, x + c * 130, y + s2 * 130, x + s2 * 90 - c * 60, y - c * 90 - s2 * 60]).fill(0x8a6a4a).stroke({ width: 7, color: INK, join: 'round' });
      g.circle(x + c * 120, y + s2 * 120, 16).fill(0x2a1a10);
      g.circle(x - s2 * 50, y + c * 50, 12).fill(0x111111);
      g.circle(x + s2 * 50, y - c * 50, 12).fill(0x111111);
    } else if (en.kind === 'child') {
      const { x, y, r } = en;
      const k = en.swoop;
      // 그림자 → 내려칠수록 진해짐
      g.circle(x, y, r * (1.25 - 0.25 * k)).fill({ color: 0x000000, alpha: 0.12 + 0.35 * k });
      // 손잡이(화면 위쪽에서 내려옴)
      g.moveTo(x + r * 0.7, y - r * 0.7).lineTo(x + r * 3, y - r * 6).stroke({ width: 14, color: 0x9a6a3a, cap: 'round' });
      g.moveTo(x + r * 0.7, y - r * 0.7).lineTo(x + r * 3, y - r * 6).stroke({ width: 5, color: 0xd8a46a, cap: 'round' });
      // 그물
      const rr = r * (1.25 - 0.25 * k);
      g.circle(x, y, rr).fill({ color: 0xffffff, alpha: 0.12 + 0.15 * k });
      for (let i = -4; i <= 4; i++) {
        const o = (i / 4.5) * rr;
        const h = Math.sqrt(Math.max(0, rr * rr - o * o));
        g.moveTo(x + o, y - h).lineTo(x + o, y + h);
        g.moveTo(x - h, y + o).lineTo(x + h, y + o);
      }
      g.stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
      g.circle(x, y, rr).stroke({ width: 8, color: k > 0 ? 0xff3a2a : 0x3a7ad8 });
    }
    // 채집망에 갇힌 곤충: 흔들리는 그물 주머니
    for (const s of snakes) {
      if (!s.alive || !s.captured || s.segs.length < 2) continue;
      const hx = s.segs[0] + Math.sin(T * 40) * 4, hy = s.segs[1];
      const R = s.r * headMul(s) * 2.2;
      g.circle(hx, hy, R).fill({ color: 0xffffff, alpha: 0.18 }).stroke({ width: 4, color: 0xffffff, alpha: 0.8 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + T;
        g.moveTo(hx, hy).lineTo(hx + Math.cos(a) * R, hy + Math.sin(a) * R);
      }
      g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
    }
  }

  private drawFoods(foods: Float32Array, myFam: FamilyId | null) {
    const n = foods.length / 5;
    const viewW = this.app.screen.width / this.zoom / 2 + 40, viewH = this.app.screen.height / this.zoom / 2 + 40;
    let used = 0, back = 0, badges = 0;
    const take = (pool: Sprite[], layer: Container, i: number, tex: Texture) => {
      let sp = pool[i];
      if (!sp) {
        sp = new Sprite(tex);
        sp.anchor.set(0.5);
        layer.addChild(sp);
        pool.push(sp);
      }
      sp.texture = tex;
      sp.visible = true;
      sp.rotation = 0;
      sp.alpha = 1;
      return sp;
    };
    for (let i = 0; i < n; i++) {
      const x = foods[i * 5], y = foods[i * 5 + 1];
      if (Math.abs(x - this.camX) > viewW || Math.abs(y - this.camY) > viewH) continue;
      const r = foods[i * 5 + 2], kind = foods[i * 5 + 3], sub = foods[i * 5 + 4];
      const ph = this.time * 3 + (x + y) * 0.05;
      const pulse = 1 + 0.18 * Math.sin(ph * 1.3);
      if (kind === 3) {
        // 황금 꿀방울: 금빛 + 반짝이며 흔들림
        const gl = take(this.foodBack, this.foodBackLayer, back++, this.tex.glow);
        gl.position.set(x, y);
        gl.tint = 0xffc21a;
        gl.scale.set(((r * 6.5) / 96) * (1 + 0.25 * Math.sin(ph * 2)));
        gl.alpha = 0.95;
        const d = take(this.foodSprites, this.foodLayer, used++, this.tex.honeydrop);
        d.anchor.set(0.5, 0.6);
        d.position.set(x, y + Math.sin(ph) * 3);
        d.tint = 0xffffff;
        d.rotation = Math.sin(ph * 0.8) * 0.15;
        d.scale.set(((r * 2.6) / 64) * (1 + 0.08 * Math.sin(ph * 2.2)));
        if (Math.random() < 0.025) this.spawnParticle(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2, 0xffffff, 10, 0.5, 0.35);
        continue;
      }
      if (kind === 4) {
        // 특별 먹이: 접시(좋아하는 갈래 색) + 그림, 내 입맛 표시
        const f = SPECIAL_FOODS[sub];
        if (!f) continue;
        const t = taste(myFam, sub);
        const bob = Math.sin(ph) * 3;
        if (t !== 0) {
          const gl = take(this.foodBack, this.foodBackLayer, back++, this.tex.glow);
          gl.position.set(x, y);
          gl.tint = t > 0 ? 0x7dff5a : 0xff4a3a;
          gl.scale.set(((r * 7.5) / 96) * (1 + 0.3 * Math.sin(ph * 2.5)));
          gl.alpha = t > 0 ? 1 : 0.7;
        }
        const pl = take(this.foodBack, this.foodBackLayer, back++, this.tex.plate);
        pl.position.set(x, y + bob);
        pl.tint = mix(likerOf(sub)?.color ?? 0xffffff, 0xffffff, 0.45);
        pl.scale.set((r * 2.8) / 68);
        const ic = take(this.foodSprites, this.foodLayer, used++, this.tex['sp_' + f.id]);
        ic.anchor.set(0.5);
        ic.position.set(x, y + bob - 1);
        ic.tint = 0xffffff;
        ic.rotation = Math.sin(ph * 0.7) * 0.12;
        ic.scale.set(((r * 2.3) / 72) * (1 + 0.06 * Math.sin(ph * 1.6)));
        if (t !== 0) {
          const b = take(this.foodBadge, this.foodLayer, badges++, t > 0 ? this.tex.like : this.tex.hate);
          b.position.set(x + r * 1.05, y - r * 1.0 + bob);
          b.scale.set((r * 1.25) / 32);
          b.tint = 0xffffff;
        }
        continue;
      }
      const s = take(this.foodSprites, this.foodLayer, used++, this.tex.food);
      s.anchor.set(0.5);
      s.position.set(x, y + Math.sin(ph) * 2.5);
      const h = Math.abs(Math.floor(x * 7 + y * 13)) % FOOD_COLORS.length;
      s.tint = kind === 1 ? 0xb8ff3a : kind === 2 ? 0xffa03a : FOOD_COLORS[h];
      s.scale.set(((r * 4.6) / 64) * pulse * (kind === 1 ? 1.3 : 1));
    }
    for (let i = used; i < this.foodSprites.length; i++) this.foodSprites[i].visible = false;
    for (let i = back; i < this.foodBack.length; i++) this.foodBack[i].visible = false;
    for (let i = badges; i < this.foodBadge.length; i++) this.foodBadge[i].visible = false;
  }

  private drawRings(rings: RingView[]) {
    const g = this.ringGfx;
    g.clear();
    for (const r of rings) {
      const p = Array.from(r.poly);
      const prog = 1 - r.t / r.total;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 18);
      g.poly(p, true).fill({ color: 0xffe066, alpha: 0.08 + prog * 0.18 });
      g.poly(p, true).stroke({ width: 16, color: 0xffd54a, alpha: 0.18 + pulse * 0.12 });
      g.poly(p, true).stroke({ width: 5, color: 0xfff3b0, alpha: 0.95 });
      const q: number[] = [];
      const k = prog * 0.75;
      for (let i = 0; i < p.length; i += 2) q.push(p[i] + (r.cx - p[i]) * k, p[i + 1] + (r.cy - p[i + 1]) * k);
      g.poly(q, true).stroke({ width: 3, color: 0xffffff, alpha: 0.35 + prog * 0.5 });
    }
  }

  /** 자세를 입힌 마디 위치: 머리 기준으로 마디 간격(늘어남·웅크림), 앞뒤 내밀기, 비틀기, 높이(화면 위로)를 더한다 */
  private posed(s: FrameSnake, P: Pose, zOf: (i: number) => number): number[] {
    const src = s.segs, n = src.length / 2;
    const out = new Array<number>(src.length);
    const hx = src[0], hy = src[1];
    const ca = Math.cos(s.angle), sa = Math.sin(s.angle);
    const jx = (Math.random() - 0.5) * P.jitter * 2, jy = (Math.random() - 0.5) * P.jitter * 2;
    for (let i = 0; i < n; i++) {
      let dx = (src[i * 2] - hx) * P.stretch, dy = (src[i * 2 + 1] - hy) * P.stretch;
      if (P.tilt) {
        const t = P.tilt * Math.min(1, i / Math.max(1, n - 1)), c = Math.cos(t), sn = Math.sin(t);
        [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
      }
      const lean = P.lean * Math.max(0, 1 - i / 5);
      out[i * 2] = hx + dx + ca * lean + jx;
      out[i * 2 + 1] = hy + dy + sa * lean + jy - zOf(i) * 0.85;
    }
    return out;
  }

  private drawSnake(s: FrameSnake, player: FrameSnake | undefined) {
    const g = this.getSnakeGfx(s);
    const vis = s.alive && s.segs.length >= 2;
    g.head.visible = vis;
    g.label.visible = vis;
    for (const w of g.wings) w.visible = vis;
    if (!vis) return;
    const look = lookOf(g.species);
    const feats = new Set(look.feats ?? []);
    const lcol = famColor(s.family);
    const grub = look.shape === 'cute';
    const lamp = feats.has('lamp');
    const longLegs = feats.has('longLegs');
    const n = s.segs.length / 2;
    // 몸 동작(자세): 높이·웅크림·늘어남·머리 들기. 그림자는 땅(원래 위치)에 남는다
    const P = this.motion.sample(s.id, this.time);
    const ground = s.segs;
    const zOf = (i: number) => (P ? P.z + P.headZ * Math.max(0, 1 - i / 4) : 0);
    const segs = P ? this.posed(s, P, zOf) : s.segs;
    const hzOf = (i: number) => 1 + zOf(i) / 140; // 높이 원근: 높을수록 커 보인다
    const bodyW = P ? P.width : 1;
    const pulse = this.pulseT.get(s.id) ?? 0;
    const grow = 1 + (pulse > 0 ? Math.sin((pulse / 0.7) * Math.PI) * 0.35 : 0);
    const scale = ((s.r * 2) / 64) * grow;
    const fly = s.fly ? 1 : 0;
    const lift = 1 + fly * 0.18;
    const swarm = look.pattern === 'swarm';
    const metal = look.pattern === 'metal';
    const spots = look.pattern === 'spots';
    const fuzzy = look.pattern === 'fuzzy';
    const allLegs = feats.has('centipede');
    const spider = feats.has('legs8');
    const flash = this.flashT.get(s.id) ?? 0;
    const blink = s.invuln && Math.sin(this.time * 30) > 0;
    const tint = (c: number) => {
      let out = c;
      if (s.slow) out = mix(out, 0x7ab8ff, 0.35);
      if (s.poisoned) out = mix(out, 0x8aff5a, 0.3 + 0.15 * Math.sin(this.time * 12));
      if (s.yuck) out = mix(out, 0x8a9a50, 0.4);
      if (s.feast) out = mix(out, 0xffe066, 0.22 + 0.18 * Math.sin(this.time * 14));
      if (s.evolving > 0) out = mix(out, mix(lcol, 0xffffff, 0.5), Math.min(0.85, s.evolving * 1.2));
      if (s.mark) out = mix(out, 0xff7a5a, 0.18 + 0.12 * Math.sin(this.time * 10));
      if (flash > 0) out = mix(out, 0xffffff, Math.min(1, flash / 0.13) * 0.85);
      return out;
    };
    // 진화 단계가 높을수록 화려하게: 빛 테두리(성충), 보석·반짝이(각성)
    const glowA = s.isBoss ? 0.3 : [0, 0, 0.14, 0.38][s.stage] ?? 0;
    const gems = !s.isBoss && s.stage >= 3;

    const fade = s.hidden > 0 ? (s.isPlayer ? 0.45 : s.hidden >= 1 ? 0.08 : 0.2) : s.sneaking ? 0.8 : 1;
    const vw = this.view;
    const inView = (i: number) => {
      const x = segs[i * 2], y = segs[i * 2 + 1];
      return x >= vw.x0 && x <= vw.x1 && y >= vw.y0 && y <= vw.y1;
    };
    // 독침(꼬리): 몸보다 아래에 깔리도록 먼저 빌린다
    if (g.stinger && n >= 2 && inView(n - 1)) {
      const ti = n - 1, tj = n - 2;
      const st = this.bodyPool.take(this.tex.sting, 1, 0.5);
      st.position.set(segs[ti * 2], segs[ti * 2 + 1]);
      st.rotation = Math.atan2(segs[tj * 2 + 1] - segs[ti * 2 + 1], segs[tj * 2] - segs[ti * 2]);
      st.scale.set(scale * 1.2);
      st.alpha = fade;
    }
    // 꼬리부터 머리 쪽으로: 머리에 가까운 마디가 위에 그려진다. 화면 밖 마디는 빌리지 않는다
    for (let i = n - 1; i >= 0; i--) {
      if (!inView(i)) continue;
      const x = segs[i * 2], y = segs[i * 2 + 1];
      const pj = Math.max(0, i - 1);
      const dirA = i === 0 ? s.angle : Math.atan2(segs[pj * 2 + 1] - y, segs[pj * 2] - x);
      const taper = i > n - 6 ? 0.7 + 0.3 * ((n - i) / 6) : 1;
      const wiggle = 1 + 0.05 * Math.sin(this.time * 10 - i * 0.7);
      const unit = swarm ? (i % 3 === 0 ? 0.8 : 0.93) : 1;
      const sh = this.shadowPool.take(this.tex.shadow);
      const zi = zOf(i);
      sh.position.set(ground[i * 2] + 3 + fly * 14 + zi * 0.25, ground[i * 2 + 1] + 6 + fly * 18 + zi * 0.1);
      sh.scale.set(scale * taper * 1.05 * (1 - fly * 0.2) * Math.max(0.55, 1 - zi / 170) * bodyW);
      sh.alpha = (1 - fly * 0.4) * Math.max(0.3, 1 - zi / 130);
      if (zi > 4) {
        // 떠 있으면 땅에 짙은 그림자를 한 겹 더(높이가 읽히게)
        const sh2 = this.shadowPool.take(this.tex.shadow);
        sh2.position.set(sh.x, sh.y);
        sh2.scale.set(sh.scale.x * 0.85);
        sh2.alpha = Math.min(0.9, 0.35 + zi / 120);
      }
      if (glowA > 0) {
        const gl = this.glowPool.take(this.tex.glow);
        gl.position.set(x, y);
        gl.scale.set(scale * taper * 1.15);
        gl.tint = lcol;
        gl.alpha = glowA * (0.6 + 0.4 * Math.sin(this.time * 5 - i * 0.35)) * fade;
      }
      // 반딧불이: 꼬리 마디가 빛난다
      if (lamp && i >= n - 3 && i > 0) {
        const lg = this.glowPool.take(this.tex.glow);
        lg.position.set(x, y);
        lg.scale.set(scale * taper * (1.9 + 0.3 * Math.sin(this.time * 6)));
        lg.tint = 0xe8ff6a;
        lg.alpha = (0.55 + 0.3 * Math.sin(this.time * 6 + i)) * fade;
      }
      const legOn = allLegs ? i > 0 : spider ? i >= 1 && i <= 4 : !grub && i >= 1 && i <= 3;
      if (legOn && !s.fly) {
        const leg = this.legPool.take(this.tex.legs);
        const swing = Math.sin(this.time * 16 + i * 1.3) * 0.35;
        leg.position.set(x, y);
        leg.rotation = dirA + swing;
        const spread = P ? 1 + 0.4 * P.legSpread : 1;
        leg.scale.set(scale * (spider ? 1.6 : longLegs ? 2.3 : allLegs ? 1.15 : 1.1) * lift * spread * hzOf(i));
        if (P && P.legSpread > 0) leg.rotation = dirA + swing * (1 - P.legSpread);
        leg.alpha = fade;
      }
      if (i === 0) continue;
      const b = this.bodyPool.take(this.tex.body);
      b.position.set(x, y);
      b.scale.set(scale * taper * wiggle * unit * lift * bodyW * hzOf(i));
      const stripeOn = swarm ? i % 3 === 0 : Math.floor(i / 2) % 2 === 1;
      b.tint = tint(lamp && i >= n - 3 ? 0xf0ff9a : stripeOn ? look.stripe : look.body);
      b.alpha = (blink ? 0.45 : 1) * fade;
      const shine = this.bodyPool.take(this.tex.shine);
      shine.position.set(x - s.r * 0.25 * taper, y - s.r * 0.35 * taper);
      shine.scale.set(scale * taper * 0.9 * lift * bodyW * hzOf(i));
      shine.alpha = ((metal ? 0.85 : fuzzy ? 0.2 : 0.45) + (s.boosting || s.dash ? 0.15 + 0.1 * Math.sin(this.time * 30) : 0)) * fade;
      // 점무늬 / 보석 장식
      const showGem = gems && i % 3 === 1;
      if ((spots && i % 2 === 1) || showGem) {
        if (showGem) {
          const spot = this.bodyPool.take(this.tex.gem);
          spot.position.set(x, y);
          spot.rotation = dirA;
          spot.scale.set(scale * 0.62 * taper);
          spot.tint = mix(lcol, 0xffffff, 0.35 + 0.25 * Math.sin(this.time * 6 - i));
          spot.alpha = fade;
        } else {
          const spot = this.bodyPool.take(this.tex.spot);
          const side = i % 4 === 1 ? 1 : -1;
          spot.position.set(x + Math.cos(dirA + Math.PI / 2) * s.r * 0.35 * side, y + Math.sin(dirA + Math.PI / 2) * s.r * 0.35 * side);
          spot.scale.set(scale * 0.55 * taper);
          spot.tint = 0x1b1b1b;
          spot.alpha = fade;
        }
      }
    }
    // 각성: 계열 색 입자가 흩날린다
    if (!s.isBoss && s.stage >= 3 && s.hidden <= 0 && Math.random() < 0.45 && this.isNear(segs[0], segs[1])) {
      const i = Math.floor(Math.random() * n);
      this.spawnParticle(segs[i * 2], segs[i * 2 + 1], Math.random() < 0.5 ? lcol : 0xffffff, 25, 0.6, 0.35);
    }
    // 날개(1~2번 마디 위, 퍼덕임)
    if (g.bw) {
      // 나비: 큰 날개를 느리고 크게 친다. 위에서 보면 접힐 때 폭이 좁아진다
      const wi = Math.min(n - 1, 1);
      const wx = (segs[0] + segs[wi * 2]) / 2, wy = (segs[1] + segs[wi * 2 + 1]) / 2;
      const ph = this.time * (s.fly ? 16 : 7) * (P && P.wingRate ? P.wingRate : 1) + s.id;
      const open = 0.45 + 0.55 * Math.abs(Math.cos(ph));
      g.wings.forEach((w, k) => {
        const side = k === 0 ? 1 : -1;
        w.position.set(wx, wy);
        w.rotation = s.angle + side * (Math.PI / 2 + 0.12);
        w.scale.set(scale * 1.6 * open * lift, scale * 1.6 * side * lift);
        w.alpha = 0.97;
      });
    } else if (g.wings.length) {
      const wi = Math.min(n - 1, 1);
      const wx = segs[wi * 2], wy = segs[wi * 2 + 1];
      const rate = P && P.wingRate ? P.wingRate : 1;
      const spreadW = P ? P.wingSpread : 0;
      const flap = Math.sin(this.time * (s.fly ? 60 : 30) * rate) * (s.fly || spreadW ? 0.35 + 0.15 * spreadW : 0.12);
      const back = s.angle + Math.PI;
      g.wings.forEach((w, k) => {
        const side = k % 2 === 0 ? 1 : -1;
        const pair = k < 2 ? 0 : 1;
        w.position.set(wx, wy);
        w.rotation = back + side * (0.45 + pair * 0.35 + flap + spreadW * 0.55);
        w.scale.set(scale * (1.35 - pair * 0.2) * lift * (1 + 0.25 * spreadW) * hzOf(1), scale * 0.95 * lift * hzOf(1));
        w.alpha = 0.75;
      });
    }
    // 머리
    const hx = segs[0], hy = segs[1];
    const headR = s.r * headMul(s) * grow * lift * (P ? P.headScale * hzOf(0) : 1);
    this.lastHead.set(s.id, [ground[0], ground[1]]);
    const hk = headR / HR;
    const ca = Math.cos(s.angle), sa = Math.sin(s.angle);
    g.head.position.set(hx, hy);
    g.headBase.rotation = s.angle;
    g.headBase.scale.set(hk);
    g.headBase.tint = flash > 0 ? 0xffd0d0 : 0xffffff;
    g.headBase.alpha = (blink ? 0.45 : 1) * fade;
    const bite = this.biteT.get(s.id) ?? 0;
    const strike = this.strikeT.get(s.id) ?? 0;
    for (const { sp, part, side } of g.parts) {
      const lx = part.x * headR, ly = part.y * headR * side;
      sp.position.set(ca * lx - sa * ly, sa * lx + ca * ly);
      let rot = part.rot;
      const ph = this.time + s.id * 0.7;
      if (part.kind === 'antenna') rot += Math.sin(ph * 3 + side) * 0.13;
      else if (part.kind === 'mandible' || part.kind === 'fang' || part.kind === 'forcipule') {
        rot += Math.sin(ph * 5) * 0.08;
        if (bite > 0) rot += bite > 0.15 ? 0.45 : -0.3; // 크게 벌렸다가 꽉 문다
        if (strike > 0) rot += strike > 0.25 ? 0.5 : -0.35;
      } else if (part.kind === 'sickle') {
        rot += Math.sin(ph * 2) * 0.05;
        const t = strike || bite;
        if (t > 0) rot -= 1.1 * Math.sin(Math.min(1, t / 0.25) * Math.PI);
      }
      sp.rotation = s.angle + side * rot;
      sp.scale.set(hk, hk * side);
      sp.alpha = (blink ? 0.45 : 1) * fade;
    }
    for (const w of g.wings) w.alpha = 0.75 * fade;
    // 이름표 + 체력바(화면 기준 일정한 크기)
    const iz = 1 / Math.max(0.5, this.zoom);
    const barW = (s.isBoss ? 110 : 50) * iz, barH = (s.isBoss ? 10 : 7) * iz;
    const barY = hy - headR - 12 * iz - barH;
    g.label.position.set(hx, barY - 3 * iz);
    g.label.scale.set(iz);
    g.label.alpha = s.hidden > 0 && !s.isPlayer ? 0 : 1;
    // 이름표 색: 나보다 레벨이 3 이상 높으면 빨강, 3 이상 낮으면 초록
    if (!s.isPlayer && !s.isBoss) {
      const dl = s.level - this.playerLv;
      const col = dl >= 3 ? 0xff8a7a : dl <= -3 ? 0xa8ff8a : 0xffffff;
      if (g.label.style.fill !== col) g.label.style.fill = col;
    }
    const nearMe = !!player && player.alive && player.segs.length >= 2 && !s.isPlayer && Math.hypot(hx - player.segs[0], hy - player.segs[1]) < 320;
    const showHp = (s.isBoss || s.hp < s.maxHp - 0.5 || nearMe) && !(s.hidden > 0 && !s.isPlayer);
    if (showHp && this.isNear(hx, hy)) {
      const k = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)));
      const col = s.isBoss ? 0xff5a3a : k > 0.5 ? 0x7dde4a : k > 0.25 ? 0xffc93a : 0xff4a3a;
      const hp = this.hpGfx;
      hp.roundRect(hx - barW / 2 - 2 * iz, barY - 2 * iz, barW + 4 * iz, barH + 4 * iz, 4 * iz).fill({ color: INK, alpha: 0.85 });
      if (k > 0) hp.roundRect(hx - barW / 2, barY, barW * k, barH, 3 * iz).fill(col);
      if (k > 0) hp.rect(hx - barW / 2, barY, barW * k, barH * 0.35).fill({ color: 0xffffff, alpha: 0.35 });
    }

    // 상태 표시
    const st = this.statusGfx;
    if (s.sneaking) {
      // 웅크리기: 단단한 껍질 테두리
      st.circle(hx, hy, headR + 6).stroke({ width: 4, color: 0x9ad0ff, alpha: 0.75 });
      st.circle(hx, hy, headR + 11).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
    }
    if (s.evolving > 0) {
      // 고치: 계열 색 빛이 몸을 감싼다
      const glow = 0.35 + 0.25 * Math.sin(this.time * 12);
      st.ellipse(hx, hy, headR * 1.8, headR * 1.5).fill({ color: mix(lcol, 0xffffff, 0.5), alpha: glow * 0.6 });
      for (let j = 0; j < 5; j++) {
        const yy = hy - headR * 1.2 + j * headR * 0.6;
        st.moveTo(hx - headR * 1.6, yy).quadraticCurveTo(hx, yy + Math.sin(this.time * 6 + j) * 8, hx + headR * 1.6, yy).stroke({ width: 3, color: 0xffffff, alpha: 0.6 });
      }
      st.moveTo(hx, hy - headR * 2.1).arc(hx, hy, headR * 2.1, -Math.PI / 2, -Math.PI / 2 + s.evolving * Math.PI * 2).stroke({ width: 5, color: 0xffffff, alpha: 0.95 });
      if (Math.random() < 0.6) this.spawnParticle(hx + (Math.random() - 0.5) * headR * 3, hy + (Math.random() - 0.5) * headR * 3, Math.random() < 0.5 ? lcol : 0xffffff, 20, 0.5, 0.4);
    }
    if (s.root) {
      for (let k = 0; k < 4; k++) {
        const a = k * 0.8 + 0.3;
        st.moveTo(hx + Math.cos(a) * headR * 1.3, hy + Math.sin(a) * headR * 1.3).lineTo(hx - Math.cos(a) * headR * 1.3, hy - Math.sin(a) * headR * 1.3).stroke({ width: 2.5, color: 0xffffff, alpha: 0.85 });
      }
      st.circle(hx, hy, headR * 1.15).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
    }
    if (s.mark) {
      const R = headR * 1.5, sp = this.time * 2;
      st.circle(hx, hy, R).stroke({ width: 3, color: 0xff6a4a, alpha: 0.85 });
      for (let k = 0; k < 4; k++) {
        const a = sp + (k * Math.PI) / 2;
        st.moveTo(hx + Math.cos(a) * (R - 6), hy + Math.sin(a) * (R - 6)).lineTo(hx + Math.cos(a) * (R + 9), hy + Math.sin(a) * (R + 9)).stroke({ width: 3.5, color: 0xff6a4a });
      }
    }
    if (s.blind) {
      for (let k = 0; k < 4; k++) {
        const ang = this.time * 9 + (k * Math.PI) / 2;
        st.star(hx + Math.cos(ang) * headR * 1.1, hy - headR * 1.2 + Math.sin(ang) * headR * 0.35, 4, 7, 3).fill(0xf6ff8a).stroke({ width: 1.5, color: INK });
      }
    }
    if (s.fear) {
      for (let k = 0; k < 2; k++) {
        const kk = (this.time * 1.3 + k / 2) % 1;
        st.ellipse(hx + (k ? 1 : -1) * headR * 0.9, hy - headR * (0.6 + kk), 3.5, 5).fill({ color: 0x9ad0ff, alpha: 1 - kk }).stroke({ width: 1.2, color: INK, alpha: 1 - kk });
      }
      st.circle(hx, hy, headR * 1.25).stroke({ width: 2, color: 0xb88aff, alpha: 0.6 });
    }
    if (s.silence) {
      const bx = hx + headR * 1.1, by = hy - headR * 1.3;
      st.circle(bx, by, 8).fill(0xffffff).stroke({ width: 2.5, color: 0xe0402a });
      st.moveTo(bx - 5, by + 5).lineTo(bx + 5, by - 5).stroke({ width: 2.5, color: 0xe0402a });
    }
    if (s.buff && (s.isPlayer || this.isNear(hx, hy))) {
      st.circle(hx, hy, headR * 1.35 + Math.sin(this.time * 8) * 3).stroke({ width: 2.5, color: mix(lcol, 0xffffff, 0.4), alpha: 0.8 });
      if (Math.random() < 0.3) this.spawnParticle(hx + (Math.random() - 0.5) * headR * 2, hy + (Math.random() - 0.5) * headR * 2, lcol, 30, 0.5, 0.35);
    }
    if (s.ultReady && s.isPlayer) st.circle(hx, hy, headR + 9).stroke({ width: 2.5, color: 0xffd23f, alpha: 0.45 + 0.35 * Math.sin(this.time * 7) });
    if (s.shield) {
      const R = headR * 1.7;
      const pts: number[] = [];
      for (let k = 0; k < 6; k++) pts.push(hx + Math.cos(k * (Math.PI / 3) + this.time) * R, hy + Math.sin(k * (Math.PI / 3) + this.time) * R);
      st.poly(pts).fill({ color: 0x9ad8ff, alpha: 0.18 }).stroke({ width: 4, color: 0xc8ecff, alpha: 0.9 });
    }
    if (s.stun) {
      for (let k = 0; k < 3; k++) {
        const ang = this.time * 6 + (k * Math.PI * 2) / 3;
        st.star(hx + Math.cos(ang) * headR * 1.2, hy - headR * 1.3 + Math.sin(ang) * headR * 0.4, 5, 7, 3).fill(0xffe066).stroke({ width: 1.5, color: INK });
      }
    }
    if (s.feast) {
      for (let k = 0; k < 4; k++) {
        const ang = this.time * 4 + (k * Math.PI) / 2;
        st.star(hx + Math.cos(ang) * headR * 1.7, hy + Math.sin(ang) * headR * 1.7, 4, 8, 3.5).fill(0xffe066).stroke({ width: 1.5, color: INK });
      }
      for (let i = 0; i < n; i += 5) if (Math.random() < 0.15) this.spawnParticle(segs[i * 2], segs[i * 2 + 1], Math.random() < 0.5 ? 0xffe066 : 0x7dff5a, 40, 0.5, 0.45);
    }
    if (s.yuck) {
      for (let k = 0; k < 3; k++) {
        const kk = (this.time * 0.9 + k / 3) % 1;
        st.circle(hx + Math.sin(this.time * 3 + k * 2) * headR * 0.8, hy - headR * (0.8 + kk * 1.8), 3 + kk * 5).fill({ color: 0xb8d870, alpha: 0.8 * (1 - kk) }).stroke({ width: 1.5, color: INK, alpha: 0.6 * (1 - kk) });
      }
    }
    if (s.isBoss) st.circle(hx, hy, headR + 8).stroke({ width: 3, color: 0xff6a4a, alpha: 0.4 + 0.3 * Math.sin(this.time * 5) });
    if (!s.isBoss && s.stage >= 3 && s.hidden <= 0 && !(P && P.z > 4)) st.circle(hx, hy, headR + 5).stroke({ width: 2.5, color: lcol, alpha: 0.35 + 0.25 * Math.sin(this.time * 4) });
    // 몸 동작에 딸린 그림: 버티기 방패, 돌진·급강하 흙먼지·바람
    if (P && this.isNear(hx, hy)) {
      if (P.ghost > 0 && !s.dash && Math.random() < P.ghost) {
        // 잔상(들려 날아갈 때 등): 머리 모양이 흐리게 남는다
        const gh = new Sprite(g.kit.base);
        gh.anchor.set(g.kit.ax, g.kit.ay);
        gh.position.set(hx, hy);
        gh.rotation = s.angle;
        gh.scale.set(hk);
        gh.tint = 0xffffff;
        gh.alpha = 0.35;
        this.ghostLayer.addChild(gh);
        this.ghosts.push({ s: gh, life: 0.2, max: 0.2 });
      }
      if (this.motion.has(s.id, 'brace')) {
        // 머리 앞의 반투명 껍질 방패: 밀어붙일 때마다 앞으로 부풀고 빛난다
        const push = Math.max(0, P.lean - 4) / 12;
        const R = headR * (1.9 + 0.5 * push);
        const fx0 = hx + ca * headR * (0.6 + 0.6 * push), fy0 = hy + sa * headR * (0.6 + 0.6 * push);
        const arcAt = (rr: number, h: number) => {
          st.moveTo(fx0 - ca * rr * 0 + Math.cos(s.angle - h) * rr, fy0 + Math.sin(s.angle - h) * rr);
          st.arc(fx0, fy0, rr, s.angle - h, s.angle + h);
        };
        arcAt(R, 1.0);
        st.stroke({ width: 7 + 5 * push, color: mix(lcol, 0xffffff, 0.35), alpha: 0.45 + 0.45 * push, cap: 'round' });
        arcAt(R * 0.8, 0.75);
        st.stroke({ width: 3, color: 0xffffff, alpha: 0.35 + 0.5 * push, cap: 'round' });
        if (Math.random() < 0.6) {
          // 뒷발로 버티며 흙이 뒤로 밀려난다
          const ti = Math.min(n - 1, 3);
          this.spawnBit('sand', ground[ti * 2], ground[ti * 2 + 1], 0xc8a878, 60 + Math.random() * 60, 0.4, 1, s.angle + Math.PI + (Math.random() - 0.5), 0.6);
        }
      }
      if (s.dash && P.z < 4 && Math.random() < 0.9) {
        // 땅을 긁으며 달린다: 몸 양옆으로 흙먼지
        for (const sd of [-1, 1]) {
          const px = ground[0] - ca * headR - sa * headR * 0.8 * sd, py = ground[1] - sa * headR + ca * headR * 0.8 * sd;
          this.spawnBit('sand', px, py, 0x8a6a4a, 50 + Math.random() * 80, 0.4, 1, s.angle + Math.PI + sd * 0.6, 0.5);
          if (Math.random() < 0.5) this.spawnBit('puff', px, py, DUST, 30 + Math.random() * 40, 0.55, 0.55, s.angle + Math.PI + sd * 0.9, 0.5);
        }
      }
      if (P.z > 20 && Math.random() < 0.5) {
        // 높이 떠 있을 때: 날개 바람에 땅의 풀·먼지가 흔들린다
        const aa = Math.random() * Math.PI * 2;
        this.spawnBit('mote', ground[0] + Math.cos(aa) * 20, ground[1] + Math.sin(aa) * 20, 0xffffff, 80, 0.35, 0.6, aa, 0.3);
      }
    }
    // 종별 모션(기술 쓴 직후)
    const fl = this.flair.get(s.id);
    if (fl && this.isNear(hx, hy)) {
      fl.t -= this.lastDt;
      if (fl.t <= 0) this.flair.delete(s.id);
      else {
        const k = fl.t / fl.max;
        const [p0, p1] = fl.th.pal;
        const m = fl.th.motion;
        if ((m === 'swift' || m === 'phantom') && Math.random() < (m === 'phantom' ? 0.6 : 0.8)) {
          const gh = new Sprite(g.kit.base);
          gh.anchor.set(g.kit.ax, g.kit.ay);
          gh.position.set(hx, hy);
          gh.rotation = s.angle;
          gh.scale.set(hk);
          gh.tint = m === 'phantom' ? p1 : p0;
          gh.alpha = m === 'phantom' ? 0.4 : 0.55;
          this.ghostLayer.addChild(gh);
          this.ghosts.push({ s: gh, life: m === 'phantom' ? 0.6 : 0.22, max: m === 'phantom' ? 0.6 : 0.22 });
        }
        if (m === 'spin') {
          const sp = this.time * 12;
          for (let j = 0; j < 3; j++) {
            const aa = sp + (j / 3) * Math.PI * 2;
            this.spawnBit(fl.th.bit, hx + Math.cos(aa) * headR * 2.2, hy + Math.sin(aa) * headR * 2.2, j % 2 ? p0 : p1, 20, 0.3, 0.6);
          }
        }
        if (m === 'glow') st.circle(hx, hy, headR * (1.6 + 0.6 * (1 - k))).fill({ color: p1, alpha: 0.18 * k });
        if (m === 'heavy' && Math.random() < 0.5) this.spawnBit('sand', hx + (Math.random() - 0.5) * headR * 2, hy + (Math.random() - 0.5) * headR * 2, p0, 60, 0.4, 0.9);
        if (m === 'zigzag' && Math.random() < 0.5) {
          const aa = Math.random() * Math.PI * 2, L = headR * 2.5;
          const x1 = hx + Math.cos(aa) * L * 0.5, y1 = hy + Math.sin(aa) * L * 0.5, x2 = hx + Math.cos(aa + 0.4) * L, y2 = hy + Math.sin(aa + 0.4) * L;
          this.addShape((gg, kk) => gg.moveTo(hx, hy).lineTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.5 * kk, color: p0, alpha: kk }), 0.12);
        }
        if (m === 'drip' && Math.random() < 0.4) this.spawnBit('drop', hx, hy, p0, 30, 0.6, 0.6, -Math.PI / 2, 1);
      }
    }
    // 돌진: 머리 잔상 + 속도선
    if (s.dash && this.isNear(hx, hy)) {
      const gh = new Sprite(g.kit.base);
      gh.anchor.set(g.kit.ax, g.kit.ay);
      gh.position.set(hx, hy);
      gh.rotation = s.angle;
      gh.scale.set(hk);
      gh.tint = lcol;
      gh.alpha = 0.55;
      this.ghostLayer.addChild(gh);
      this.ghosts.push({ s: gh, life: 0.25, max: 0.25 });
      for (let j = 0; j < 2; j++) {
        const off = (Math.random() - 0.5) * headR * 2;
        const bx = hx - ca * headR - sa * off, by = hy - sa * headR + ca * off;
        const L = 40 + Math.random() * 60;
        this.addShape((gg, k) => gg.moveTo(bx, by).lineTo(bx - ca * L, by - sa * L).stroke({ width: 3 * k, color: 0xffffff, alpha: k * 0.8 }), 0.15);
      }
    }
    // 부스트 잔상
    if (s.boosting && Math.random() < 0.6) {
      const ti = Math.max(0, n - 1);
      this.spawnParticle(segs[ti * 2], segs[ti * 2 + 1], look.body, 20 + Math.random() * 40, 0.4, 0.4);
    }
  }

  private updateFx(dt: number) {
    for (let i = this.fxs.length - 1; i >= 0; i--) {
      const f = this.fxs[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.s.destroy();
        this.fxs.splice(i, 1);
        continue;
      }
      const k = 1 - f.life / f.max; // 0 → 1
      const e = 1 - Math.pow(1 - k, 3);
      f.s.scale.set(f.s0 + (f.s1 - f.s0) * e);
      f.s.alpha = f.a0 * (1 - k * k);
      f.s.rotation += f.vr * dt;
    }
    // 기술을 쓰면 화면 가장자리에 집중선
    const sf = this.screenFx;
    sf.clear();
    if (this.screenFlash > 0) {
      this.screenFlash = Math.max(0, this.screenFlash - dt * 1.6);
      sf.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0xfaffd0, alpha: this.screenFlash });
    }
    if (this.speedLines > 0) {
      this.speedLines -= dt;
      const W = this.app.screen.width, H = this.app.screen.height, k = Math.max(0, this.speedLines / 0.35);
      const cx = W / 2, cy = H / 2, R0 = Math.min(W, H) * 0.36, R1 = Math.hypot(W, H) * 0.6;
      for (let j = 0; j < 40; j++) {
        const a = (j / 40) * Math.PI * 2 + Math.random() * 0.1;
        const r0 = R0 + Math.random() * 60;
        sf.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0).lineTo(cx + Math.cos(a) * R1, cy + Math.sin(a) * R1);
      }
      sf.stroke({ width: 3, color: 0xffffff, alpha: 0.35 * k });
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.freeParticles.push(p.s);
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      if (p.g) p.vy += p.g * dt;
      p.s.x += p.vx * dt + (p.sway ? Math.sin((p.max - p.life) * 6 + p.sway) * p.sway * 40 * dt : 0);
      p.s.y += p.vy * dt;
      if (p.vr) p.s.rotation += p.vr * dt;
      p.s.alpha = (p.fade ?? 1) * (p.life / p.max);
      p.s.scale.set(Math.max(0.05, p.s.scale.x + p.grow * dt));
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.life -= dt;
      if (gh.life <= 0) {
        gh.s.destroy();
        this.ghosts.splice(i, 1);
        continue;
      }
      gh.s.alpha = 0.55 * (gh.life / gh.max);
    }
    const sg = this.shapeGfx;
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const sh = this.shapes[i];
      sh.life -= dt;
      if (sh.life <= 0) {
        this.shapes.splice(i, 1);
        continue;
      }
      sh.draw(sg, sh.life / sh.max);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.t.destroy();
        this.popups.splice(i, 1);
        continue;
      }
      const age = p.max - p.life;
      const peak = p.big;
      const pop = age < 0.1 ? 0.3 + (age / 0.1) * (peak - 0.3) : peak - Math.min(peak - 1, (age - 0.1) * 3.2);
      p.t.scale.set(pop / Math.max(0.6, this.zoom));
      p.vy += p.g * dt;
      p.t.x += p.vx * dt;
      p.t.y += p.vy * dt;
      p.t.alpha = Math.min(1, p.life / 0.3);
    }
    for (const [id, c] of this.combos) {
      c.life -= dt;
      if (c.life <= 0) {
        c.t.destroy();
        this.combos.delete(id);
        continue;
      }
      c.t.position.set(c.x, c.y - 70 / Math.max(0.6, this.zoom));
      c.t.alpha = Math.min(1, c.life / 0.3);
    }
  }

  /** 화질: 선명하게(기기 해상도, 최대 2배) / 가볍게(1배) */
  // ---------- 화질 ----------
  // 단계 0: 기기 해상도(최대 2배), 1: 1.5배·파티클 줄임, 2: 1배·파티클 크게 줄임
  private qLevel = 0;
  private qAuto = true;
  private qEma = 16;
  private qSlow = 0;
  private qFast = 0;
  private qDrops = 0;
  private particleCap = 1000;

  setQuality(mode: 'auto' | 'high' | 'low') {
    this.qAuto = mode === 'auto';
    this.qDrops = 0;
    this.applyQuality(mode === 'low' ? 2 : 0);
  }

  private applyQuality(level: number) {
    this.qLevel = level;
    const dpr = window.devicePixelRatio || 1;
    const r = [Math.min(dpr, 2), Math.min(dpr, 1.5), 1][level];
    this.particleCap = [1000, 600, 300][level];
    if (this.app.renderer.resolution !== r) {
      const h = this.sizeHost;
      const [w, hh] = h instanceof Window ? [h.innerWidth, h.innerHeight] : [h.clientWidth, h.clientHeight];
      this.app.renderer.resize(w, hh, r);
    }
  }

  /** 자동 화질: 프레임이 2.5초 넘게 느리면 한 단계 낮추고, 15초 동안 넉넉하면 한 단계 올린다 */
  tickQuality(ms: number) {
    if (!this.qAuto || ms > 250) return; // 탭 전환 같은 긴 멈춤은 무시
    this.qEma = this.qEma * 0.95 + ms * 0.05;
    if (this.qEma > 22) ((this.qSlow += ms), (this.qFast = 0));
    else if (this.qEma < 15) ((this.qFast += ms), (this.qSlow = 0));
    else this.qSlow = this.qFast = 0;
    if (this.qSlow > 2500 && this.qLevel < 2) {
      this.applyQuality(this.qLevel + 1);
      this.qDrops++;
      this.qSlow = 0;
      this.qEma = 16;
    } else if (this.qFast > 15000 && this.qLevel > 0 && this.qDrops < 3) {
      // 올렸다 내렸다를 반복하지 않게, 세 번 낮춘 뒤로는 올리지 않는다
      this.applyQuality(this.qLevel - 1);
      this.qFast = 0;
    }
  }

  get qualityLabel() {
    return `${this.qAuto ? '자동 ' : ''}${['선명', '보통', '가볍게'][this.qLevel]}`;
  }

  get camera() {
    return { x: this.camX, y: this.camY, zoom: this.zoom * (1 + this.punch) };
  }
}

function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

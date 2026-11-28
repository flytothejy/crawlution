// 화면 그리기. 시뮬레이션 상태를 받아 그리기만 한다(상태를 바꾸지 않음).
import { Application, BitmapFont, BitmapText, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../shared/config';
import { relation } from '../shared/combat';
import { V3_BY_ID } from '../shared/v3';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import { Motion, PROGS, type Pose } from './motion';
import { STATUSES } from '../shared/status';
import { themeOf, type FxBit, type FxTheme } from './fxtheme';
import { FAMILY, likerOf, SPECIAL_FOODS, SPECIES_BY_ID, taste, type FamilyId, type Look } from '../shared/species';
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
/** 종 고유 필살기 색(fx의 wk) */
const WK_COL: Record<string, number> = {
  ghost: 0xb8a8ff, herc: 0xd8a040, kingstag: 0xc8c8d8, saw: 0xe8a850, firefly: 0xd8ff6a,
  emperor: 0x5ab8ff, sunset: 0xff6a3a, damsel: 0x8affff, tide: 0x4ab8ff,
  monarch: 0xff9a2a, owl: 0xc8a070, morpho: 0x3a8aff, tussock: 0xd8c060,
  legs: 0xe8e0d0, gigantea: 0xff7a2a, ttangjine: 0xf6e86a, buzz: 0xffe066, honeybee: 0xffc21a, bumble: 0xffe066, potter: 0x9a7448,
  leaf: 0x7ad84a, rage: 0xff3a2a, fireant: 0xff5a2a, jumper: 0x9ad8ff, widow: 0xff2a3a,
};
const DRY = [0xb07a3a, 0xc89a5a, 0x8a5a2a, 0xd8b070, 0x9a6a3a];
const MOTION_KINDS = new Set<string>(['antrun', 'spiderlings', 'stain', 'legwhip', 'aimline', 'throw', 'grab', 'sweep', 'combo', 'stab', 'threat', 'camo', 'playdead', 'baitset', 'charge', 'push', 'lift', 'hop', 'thud', 'land', 'dive', 'snatch', 'shock', 'windup', 'lifted', 'scissor', 'circle', 'compound', 'roll', 'trizone']);
const BW_W = 130, BW_H = 200, BW_AX = 0.04, BW_AY = 0.52;
function outE(x: number) {
  return 1 - Math.pow(1 - x, 3);
}
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
  kind: 'whirl' | 'circle' | 'lantern' | 'compound' | 'sky' | 'stance' | 'bloom' | 'plates' | 'legs' | 'buzz' | 'leaf' | 'rage';
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
  hornSp: Sprite | null; // 돌진 때 크게 보여 줄 뿔
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
  /** 땅에 남는 연출(갈라진 땅): 몸 아래에 그린다 */
  private crackGfx = new Graphics();
  private grounds: Shape[] = [];
  /** 몸 위에 떠 있는 구름(독가루 안개) */
  private cloudGfx = new Graphics();
  /** 화면 전체 안개(구름 안에 들어갔을 때) */
  private hazeGfx = new Graphics();
  private fxLayer = new Container();
  private enemyGfx = new Graphics();
  private mapLayer = new Container();
  private deco = new Container();
  private screenGfx = new Graphics();
  private mapKey = '';
  private combos = new Map<number, Combo>();
  private hpGfx = new Graphics();
  private iconLayer = new Container();
  private iconGfx = new Graphics();
  private iconPool = new SpritePool(this.iconLayer);
  /** 상태 아이콘 시계: 곤충·상태마다 처음 걸린 길이(다시 걸리면 갱신) */
  private stMax = new Map<string, { max: number; last: number }>();
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
  /** 겹눈을 켠 곤충 → 끝나는 시각 */
  private eyesT = new Map<number, number>();
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
      this.bg, mask, this.deco, border, this.mapLayer, this.decalLayer, this.crackGfx, this.zoneGfx, this.teleGfx, this.foodBackLayer, this.foodLayer, this.ringGfx, this.markGfx,
      this.shadowLayer, this.glowLayer, this.legLayer, this.bodyLayer, this.ghostLayer, this.headLayer, this.cloudGfx, this.minionGfx, this.statusGfx, this.shapeGfx,
      this.fxSpriteLayer, this.fxLayer, this.enemyGfx, this.hpGfx, this.iconLayer, this.iconGfx, this.labelLayer, this.popupLayer,
    );
    this.fxSpriteLayer.blendMode = 'add';
    this.app.stage.addChild(this.world, this.screenGfx, this.hazeGfx, this.screenFx);
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
    // 상태 아이콘(글자 없이 그림만): 동그란 바탕 + 테두리(이상=빨강, 강화=초록) + 그림
    for (const d of STATUSES) {
      const g = new Graphics();
      const C0 = 32, R = 28;
      g.circle(C0, C0, R + 3).fill(d.kind === 'debuff' ? 0xe8402a : 0x3ab84a);
      g.circle(C0, C0, R).fill(d.color).stroke({ width: 2, color: INK });
      g.ellipse(C0 - 8, C0 - 12, 12, 6).fill({ color: 0xffffff, alpha: 0.35 });
      drawStatusGlyph(g, d.id, C0, C0);
      this.tex['st_' + d.id] = r.generateTexture({ target: g, resolution: 2, frame: new Rectangle(0, 0, 64, 64) });
    }
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
    let hornSp: Sprite | null = null;
    if (kit.horn) {
      hornSp = new Sprite(kit.horn.tex);
      hornSp.anchor.set(kit.horn.ax, kit.horn.ay);
      hornSp.visible = false;
      head.addChild(hornSp);
    }
    for (const w of wings) this.headLayer.addChild(w);
    this.headLayer.addChild(head);
    this.labelLayer.addChild(label);
    g = {
      species: key, level: s.level, kit, head, wings, stinger, headBase, parts, hornSp, label, bw,
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
    // 긴 띠·궤적은 끝점이 화면 밖이어도 출발점이 보이면 그린다
    const near = this.isNear(e.x, e.y) || (e.x1 !== undefined && e.y1 !== undefined && this.isNear(e.x1, e.y1));
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
      case 'throw': {
        // 던진 궤적: 머리 위로 넘어가는 호(화면 위쪽으로 볼록)
        const L = len || 240;
        const x2 = e.x + Math.cos(a) * L, y2 = e.y + Math.sin(a) * L;
        const mx = (e.x + x2) / 2, my = (e.y + y2) / 2 - 90;
        this.addShape((g, k) => {
          g.moveTo(e.x, e.y).quadraticCurveTo(mx, my, x2, y2).stroke({ width: 10 * k + 2, color: c, alpha: 0.35 * k, cap: 'round' });
          g.moveTo(e.x, e.y).quadraticCurveTo(mx, my, x2, y2).stroke({ width: 3 * k + 1, color: 0xffffff, alpha: 0.8 * k, cap: 'round' });
        }, 0.45);
        for (let i = 0; i < 6; i++) this.spawnBit('shard', e.x, e.y, C(0xff8a4a, 0), 120 + Math.random() * 160, 0.4, 0.6, a, 1.2);
        hit(10, 0.04);
        break;
      }
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
        // 날개를 펼치는 순간(0.15초 뒤) 보라 위협 고리가 퍼진다
        this.afterMs(() => {
          this.ringFx(e.x, e.y, r, 0xc88aff);
          this.afterMs(() => this.ringFx(e.x, e.y, r * 0.75, 0xe8d8ff), 120);
        }, 150);
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
        // 잎이 우수수 떨어지며 몸을 덮는다(덮인 모습은 몸 그리기에서)
        for (let i = 0; i < 14; i++) this.spawnBit('leaf', e.x + (Math.random() - 0.5) * 60, e.y - 40 - Math.random() * 30, i % 2 ? C(0x7ac84a, 0) : C(0x3a6a2a, 1), 30 + Math.random() * 40, 0.5, 0.8, Math.PI / 2, 0.8);
        break;
      case 'baitset': {
        // 꽃을 내려놓으며 꽃잎이 흩뿌려진다
        const zx = e.x1 ?? e.x, zy = e.y1 ?? e.y;
        for (let i = 0; i < 18; i++) {
          const aa = Math.random() * Math.PI * 2;
          this.spawnBit('petal', zx, zy, [0xff9ec7, 0xffd0e8, 0xffffff][i % 3], 90 + Math.random() * 120, 0.7, 0.75 + Math.random() * 0.4, aa, 0.4);
        }
        this.ringFx(zx, zy, 44, 0xffb8dc);
        break;
      }
      case 'hop':
      case 'roll':
      case 'backstep':
      case 'escape':
        for (let i = 0; i < 12; i++) this.spawnParticle(e.x, e.y, C(0xffffff, 1), 60 + Math.random() * 120, 0.4, 0.4);
        break;
      case 'playdead':
        // 마른 잎이 바람에 날려 와 몸을 둘러싼다(둘러싼 모습은 몸 그리기에서)
        for (let i = 0; i < 16; i++) {
          const aa = Math.random() * Math.PI * 2;
          this.spawnBit('leaf', e.x + Math.cos(aa) * 110, e.y + Math.sin(aa) * 110, DRY[i % DRY.length], 140, 0.5, 0.8, aa + Math.PI, 0.3);
        }
        break;
      case 'curl':
      case 'backplate':
      case 'bitter':
      case 'fang':
        this.ringFx(e.x, e.y, 60, e.kind === 'bitter' ? 0x9aff5a : e.kind === 'fang' ? 0xb88aff : 0x9ad0ff);
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
  /** 작은 벌 한 마리(열 공·꿀벌 무리): 노랑·검정 줄 몸 + 날개 두 장 */
  private drawBee(g: Graphics, x: number, y: number, ang: number, size: number, alpha = 1) {
    const c = Math.cos(ang), sn = Math.sin(ang);
    const P2 = (u: number, v: number): [number, number] => [x + c * u - sn * v, y + sn * u + c * v];
    const flap = 0.6 + 0.4 * Math.abs(Math.sin(this.time * 60 + x));
    for (const sd of [-1, 1]) {
      const [wx, wy] = P2(-size * 0.1, sd * size * 0.75 * flap);
      g.ellipse(wx, wy, size * 0.55, size * 0.35).fill({ color: 0xffffff, alpha: 0.7 * alpha });
    }
    g.ellipse(x, y, size, size * 0.62).fill({ color: 0xffc21a, alpha }).stroke({ width: 1.2, color: INK, alpha });
    for (const u of [-0.35, 0.2]) {
      const [ax, ay] = P2(u * size, -size * 0.6), [bx, by] = P2(u * size, size * 0.6);
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: size * 0.28, color: 0x1b1b1b, alpha });
    }
    const [hx, hy] = P2(size * 0.95, 0);
    g.circle(hx, hy, size * 0.35).fill({ color: 0x1b1b1b, alpha });
  }

  /** 잎 더미로 덮기: 위장(사마귀 색 잎이 흩뿌려진 듯) · 죽은 척(마른 잎이 둘러쌈) */
  private leafOn = new Map<number, number[]>();
  private wrapAt = new Map<number, { x: number; y: number }>();
  private lastSegs = new Map<number, ArrayLike<number>>();
  private leafCover(s: FrameSnake, segs: ArrayLike<number>, n: number, headR: number, look: Look, mode: 'camo' | 'dead') {
    const st = this.statusGfx;
    const pal = mode === 'camo' ? [look.body, look.stripe, look.head, mix(look.body, 0xffffff, 0.25), mix(look.body, 0x000000, 0.25)] : DRY;
    this.leafOn.set(s.id, pal);
    const t0 = this.motion.started(s.id, mode === 'camo' ? 'camo' : 'playdead', this.time);
    const age = this.time - t0;
    const hash = (a: number, b: number) => {
      const v = Math.sin(s.id * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453;
      return v - Math.floor(v);
    };
    const R = s.r;
    const leaf = (x: number, y: number, L: number, W: number, rot: number, col: number, al: number) => {
      const c = Math.cos(rot), sn = Math.sin(rot);
      const p = (u: number, v: number): [number, number] => [x + c * u - sn * v, y + sn * u + c * v];
      const [ax, ay] = p(-L, 0), [bx, by] = p(L, 0), [c1x, c1y] = p(0, -W * 1.6), [c2x, c2y] = p(0, W * 1.6);
      st.moveTo(ax, ay).quadraticCurveTo(c1x, c1y, bx, by).quadraticCurveTo(c2x, c2y, ax, ay).fill({ color: col, alpha: al }).stroke({ width: 1.5, color: mix(col, 0x000000, 0.45), alpha: al });
      st.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1.2, color: mix(col, 0x000000, 0.35), alpha: al * 0.8 });
    };
    for (let i = 0; i < n; i += mode === 'camo' ? 1 : 2) {
      const x = segs[i * 2], y = segs[i * 2 + 1];
      if (!this.isNear(x, y)) continue;
      // 몸 방향(다음 마디 쪽)
      const j = Math.min(n - 1, i + 1), jj = Math.max(0, i - 1);
      const dir = Math.atan2(segs[jj * 2 + 1] - segs[j * 2 + 1], segs[jj * 2] - segs[j * 2]);
      const cnt = mode === 'camo' ? (i === 0 ? 5 : 2) : i === 0 ? 7 : 5;
      for (let q = 0; q < cnt; q++) {
        const h1 = hash(i, q), h2 = hash(i + 0.5, q + 3), h3 = hash(i + 0.25, q + 7);
        const col = pal[Math.floor(h3 * pal.length)];
        if (mode === 'camo') {
          // 몸 둘레 넓게 아무렇게나 흩어진 잎(빈 곳도 섞여 덤불처럼 보이지 않게, 살짝 바람에 흔들림)
          if (i > 0 && hash(i + 9, q) < 0.3) continue;
          const off = (h1 - 0.5) * R * 3.8, along = (h2 - 0.5) * R * 2.4;
          const lx = x + Math.cos(dir) * along - Math.sin(dir) * off, ly = y + Math.sin(dir) * along + Math.cos(dir) * off;
          const rot = h3 * Math.PI * 2 + Math.sin(this.time * 2 + i + q) * 0.06;
          const L = R * (0.55 + h2 * 0.45) * (i === 0 ? 1.2 : 1);
          leaf(lx, ly, L, L * 0.38, rot, col, Math.min(1, age * 6));
        } else {
          // 몸 둘레를 감싸듯 둥글게 붙은 마른 잎: 바깥에서 날아와 붙는다
          const ang = dir + (q / cnt) * Math.PI * 2 + h1 * 0.6;
          const k = Math.min(1, Math.max(0, (age - h2 * 0.25) / 0.3));
          const ease = 1 - (1 - k) * (1 - k);
          const rr = R * (0.95 + 0.25 * h3) + (1 - ease) * R * 3;
          const lx = x + Math.cos(ang) * rr, ly = y + Math.sin(ang) * rr;
          const rot = ang + Math.PI / 2 + (h2 - 0.5) * 0.8 + Math.sin(this.time * 5 + q + i) * 0.05 * ease;
          const L = R * (0.6 + h1 * 0.35) * (i === 0 ? 1.15 : 1);
          if (k > 0) leaf(lx, ly, L, L * 0.4, rot, col, 0.95 * Math.min(1, k * 2));
        }
      }
    }
    void headR;
  }

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
        if (e.wk === 'sweep') {
          // 낫을 치켜들 때: 낫 끝에서 연두 빛이 반짝
          for (const sd of [-1, 1]) this.spawnBit('star', e.x + ca * 20 - sa * 40 * sd, e.y + sa * 20 + ca * 40 * sd, C(0xd8ff9a, 0), 20, 0.2, 0.7);
          return true;
        }
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
        if (e.wk === 'yank') {
          this.motion.play(id, 'yank', d, now);
          return true;
        }
        if (e.wk === 'wrap') {
          // 휘감기: 맞은 적 자리를 기억해 몸 앞쪽이 그 둘레를 감는다
          this.wrapAt.set(id, { x: e.x, y: e.y });
          this.motion.play(id, 'wrap', d, now);
          return true;
        }
        if (e.wk === 'drip' || e.wk === 'spray') {
          this.motion.play(id, e.wk, d, now);
          // 몸 마디마다 꿀 방울(아래로 뚝뚝) · 노린내 액체(옆으로 칙칙)
          const drip = e.wk === 'drip';
          for (let k = 0; k < (drip ? 6 : 8); k++)
            this.afterMs(() => {
              const sg = this.lastSegs.get(id);
              if (!sg) return;
              const n = sg.length / 2;
              for (let i = 1; i < n; i += drip ? 3 : 2) {
                const x = sg[i * 2], y = sg[i * 2 + 1];
                if (!this.isNear(x, y)) continue;
                if (drip) this.spawnBit('drop', x, y, i % 2 ? 0xffc21a : 0xffe680, 20, 0.6, 0.8, Math.PI / 2, 0.3);
                else {
                  const j = Math.min(n - 1, i + 1);
                  const dir = Math.atan2(sg[j * 2 + 1] - y, sg[j * 2] - x) + (k % 2 ? 1 : -1) * Math.PI / 2;
                  this.spawnBit('drop', x, y, k % 3 ? 0xffc83a : 0xe8f070, 120 + rnd() * 80, 0.4, 0.6, dir, 0.4);
                }
              }
            }, k * (drip ? 120 : 110));
          return true;
        }
        if (e.wk === 'heft' || e.wk === 'fling' || e.wk === 'held') {
          this.motion.play(id, e.wk, d, now);
          return true;
        }
        if (e.wk === 'skyhurl') {
          // 하늘 높이 들린 적: 솟구치는 굵은 속도선 → 매달려 버둥 → 수직 낙하 속도선
          this.motion.play(id, 'skyhurl', d, now);
          if (!near) return true;
          for (let j = 0; j < 10; j++) {
            const ox = (rnd() - 0.5) * 70;
            this.afterMs(() => this.addShape((g, q) => g.moveTo(e.x + ox, e.y + 20 - (1 - q) * 80).lineTo(e.x + ox, e.y - 60 - (1 - q) * 260).stroke({ width: 5 * q + 1, color: 0xffffff, alpha: q * 0.8, cap: 'round' }), 0.3), j * 25);
          }
          this.dustRing(e.x, e.y, 40, DUST, 18);
          // 떨어지기 직전: 위에서 아래로 내리꽂는 속도선
          this.afterMs(() => {
            const [lx, ly] = this.lastHead.get(id) ?? [e.x, e.y];
            for (let j = 0; j < 9; j++) {
              const ox = (rnd() - 0.5) * 80;
              this.afterMs(() => this.addShape((g, q) => g.moveTo(lx + ox, ly - 340 + (1 - q) * 160).lineTo(lx + ox, ly - 120 + (1 - q) * 200).stroke({ width: 6 * q + 1, color: 0xfff0c0, alpha: q * 0.85, cap: 'round' }), 0.18), j * 15);
            }
          }, d * 780);
          return true;
        }
        if (e.wk === 'skyjump') {
          this.motion.play(id, 'skyjump', d, now);
          if (near) {
            this.dustRing(e.x, e.y, 50, DUST, 22);
            for (let i = 0; i < 12; i++) this.spawnBit('sand', e.x, e.y, 0x8a6a4a, 160 + rnd() * 180, 0.5, 1.1, -Math.PI / 2, 2.4);
          }
          return true;
        }
        if (e.wk === 'thrown') {
          // 내던져짐: 빙글 돌며 날아가 쾅 — 떨어진 자리에 흙먼지·금·별
          this.motion.play(id, 'thrown', d, now);
          this.afterMs(() => {
            this.motion.play(id, 'slammed', 0.3, this.time);
            const [lx, ly] = this.lastHead.get(id) ?? [e.x1 ?? e.x, e.y1 ?? e.y];
            if (!this.isNear(lx, ly)) return;
            this.dustRing(lx, ly, 44, DUST, 20);
            this.cracks(lx, ly, 46);
            this.fx('ring', lx, ly, 0xe8a850, 14, 120, 0.3, 0, 0, 0.8);
            for (let i = 0; i < 10; i++) this.spawnBit('star', lx, ly - 24, 0xffe066, 60 + rnd() * 60, 0.6, 0.8);
            for (let i = 0; i < 8; i++) this.spawnBit('shard', lx, ly, 0x8a6a4a, 140 + rnd() * 140, 0.45, 0.7);
            this.shake = Math.max(this.shake, 9);
          }, d * 1000);
          return true;
        }
        if (e.wk === 'tossed') {
          // 머리 위로 넘어가 뒤로 떨어진다: 떨어진 자리에 흙먼지·별
          this.motion.play(id, 'tossed', d, now);
          this.afterMs(() => {
            this.motion.play(id, 'slammed', 0.3, this.time);
            const [lx, ly] = this.lastHead.get(id) ?? [e.x, e.y];
            if (!this.isNear(lx, ly)) return;
            this.dustRing(lx, ly, 34, DUST, 16);
            this.cracks(lx, ly, 40);
            for (let i = 0; i < 8; i++) this.spawnBit('star', lx, ly - 26, 0xffe066, 40 + rnd() * 40, 0.6, 0.7);
            this.shake = Math.max(this.shake, 8);
          }, d * 1000);
          return true;
        }
        if (e.wk && PROGS[e.wk]) {
          // 그 밖의 몸 동작(벌 반동·정지 비행, 지네 찌르기·말기 등)
          this.motion.play(id, e.wk, d, now);
          if (e.wk === 'shot' && near) this.spawnBit('ember', e.x + ca * 24, e.y + sa * 24, C(0xffe066, 0), 60, 0.15, 0.8, a, 0.6);
          if (e.wk === 'bigshot' && near) {
            this.fx('ring', e.x + ca * 26, e.y + sa * 26, C(0xffb020, 0), 6, 60, 0.25);
            for (let i = 0; i < 8; i++) this.spawnBit('puff', e.x, e.y, 0xffffff, 80 + rnd() * 60, 0.4, 0.5, a + Math.PI, 0.9);
          }
          return true;
        }
        this.motion.play(id, 'lifted', d, now);
        // 솟구치는 속도선: 들린 적 아래에서 위(화면 위쪽)로 흰 줄
        if (near)
          for (let j = 0; j < 6; j++) {
            const ox = (rnd() - 0.5) * 40;
            this.afterMs(() => this.addShape((g, q) => g.moveTo(e.x + ox, e.y + 10 - (1 - q) * 30).lineTo(e.x + ox, e.y - 30 - (1 - q) * 90).stroke({ width: 3 * q + 1, color: 0xffffff, alpha: q * 0.8, cap: 'round' }), 0.22), j * 30);
          }
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
      case 'sweep':
        this.motion.play(id, 'sweep', 0.34, now);
        return false;
      case 'combo':
        this.motion.play(id, 'slash' + (e.wk ?? 'L'), e.wk === 'X' ? 0.3 : 0.2, now);
        return false;
      case 'stab':
        this.motion.play(id, 'thrust', 0.25, now);
        return false;
      case 'threat':
        this.motion.play(id, 'threat', e.dur ?? 0.9, now);
        return false;
      case 'camo':
        this.motion.play(id, 'camo', e.dur ?? 2, now);
        return false;
      case 'playdead':
        this.motion.play(id, 'playdead', e.dur ?? 2, now);
        return false;
      case 'hop': {
        const jump = e.wk === 'jump';
        this.motion.play(id, jump ? 'jump' : 'flit', e.dur ?? 0.3, now, e.half ?? 1);
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
      case 'warhorn': {
        // 군단 진군: 붉은 깃발 고리 두 겹 + 땅이 울리며 붉은 흙먼지
        if (!near) return true;
        const c1 = 0xd84a2a;
        this.ringFx(e.x, e.y, r, c1);
        this.afterMs(() => this.ringFx(e.x, e.y, r * 0.7, 0xffb060), 120);
        this.dustRing(e.x, e.y, r * 0.6, 0xc87a5a, 20);
        this.shake = Math.max(this.shake, 6);
        return true;
      }
      case 'antrun': {
        // 불려 나온 개미들이 내 둘레에서 표적까지 줄지어 달려간다
        if (!near) return true;
        const x0 = e.x1 ?? e.x, y0 = e.y1 ?? e.y;
        const n = Math.round((r || 4) * 3);
        for (let i = 0; i < n; i++)
          this.afterMs(() => {
            const aa = rnd() * Math.PI * 2, sx = x0 + Math.cos(aa) * 40, sy = y0 + Math.sin(aa) * 40;
            const dir = Math.atan2(e.y - sy, e.x - sx), d = Math.hypot(e.x - sx, e.y - sy);
            this.spawnBit('ant', sx, sy, i % 3 === 0 ? C(0xe8a05a, 0) : 0x2a2018, d / 0.7, 0.7, 1.05, dir, 0.05);
          }, i * 35);
        return true;
      }
      case 'spiderlings': {
        // 등에 업힌 새끼거미 수십 마리가 사방으로 흩어진다(다리가 꼬물꼬물)
        if (!near) return true;
        const n = 26;
        const list = Array.from({ length: n }, () => ({ a: rnd() * Math.PI * 2, v: r * (0.5 + rnd() * 0.6), s: 3 + rnd() * 2.5 }));
        this.addShape((g, q) => {
          const p = 1 - q;
          for (const sp of list) {
            const d = sp.v * (1 - (1 - p) * (1 - p)) + 10;
            const x = e.x + Math.cos(sp.a) * d, y = e.y + Math.sin(sp.a) * d;
            const wig = Math.sin(this.time * 40 + sp.a * 10) * 0.4;
            for (let l = 0; l < 4; l++)
              for (const sd of [-1, 1]) {
                const la = sp.a + sd * (0.9 + l * 0.35 + wig * (l % 2 ? 1 : -1));
                g.moveTo(x, y).lineTo(x + Math.cos(la) * sp.s * 2.2, y + Math.sin(la) * sp.s * 2.2);
              }
            g.stroke({ width: 1.2, color: 0x2a2018, alpha: Math.min(1, q * 2) });
            for (const sp2 of [sp]) g.circle(x, y, sp2.s).fill({ color: 0x4a3a28, alpha: Math.min(1, q * 2) });
          }
        }, 1.0);
        this.dustRing(e.x, e.y, 40, DUST, 14);
        hit(5, 0.02);
        return true;
      }
      case 'backstep': {
        // 앞에 실을 붙이고 뒤로 튕겨 미끄러진다: 붙인 자리와 머리 사이에 팽팽한 은빛 실
        this.motion.play(id, 'recoil', 0.45, now);
        if (!near) return false;
        const ax = e.x + ca * 40, ay = e.y + sa * 40;
        this.addShape((g, q) => {
          const [mx, my] = this.lastHead.get(id) ?? [e.x, e.y];
          g.moveTo(ax, ay).lineTo(mx, my).stroke({ width: 2.5, color: 0xf0f0ff, alpha: 0.9 * q });
          g.circle(ax, ay, 5).fill({ color: 0xffffff, alpha: q });
        }, 0.55);
        return false;
      }
      case 'fang':
        this.motion.play(id, 'venom', e.dur ?? 5, now);
        return false;
      case 'honey': {
        // 떠오른 벌 몸에서 꿀이 주르륵: 처음 한 번 굵은 꿀 줄기가 바닥까지
        if (!near) return false;
        for (let i = 0; i < 14; i++) {
          const aa = rnd() * Math.PI * 2, d = rnd() * r * 0.7;
          this.afterMs(() => this.spawnBit('drop', e.x + Math.cos(aa) * d, e.y + Math.sin(aa) * d - 50, i % 2 ? 0xffc21a : 0xffe680, 0, 0.35, 1.1 + rnd() * 0.5, Math.PI / 2, 0), i * 40);
        }
        return false;
      }
      case 'heat': {
        // 열 공: 작은 벌들이 내게서 날아가 적을 공처럼 감싼다(감싼 모습은 장판 그리기에서)
        if (!near) return true;
        const x0 = e.x1 ?? e.x, y0 = e.y1 ?? e.y;
        if (e.wk === 'miss') {
          // 표적 없음: 벌들이 앞으로 날아갔다 흩어진다
          for (let i = 0; i < 8; i++) this.spawnBit('mote', x0, y0, 0xffc21a, 200 + rnd() * 80, 0.5, 0.6, a + (rnd() - 0.5) * 0.8, 0.2);
          return true;
        }
        const list = Array.from({ length: 14 }, (_, i) => ({ o: rnd() * 0.25, a: (i / 14) * Math.PI * 2, sw: (rnd() - 0.5) * 80 }));
        this.addShape((g, q) => {
          const p = 1 - q;
          for (const b of list) {
            const t = Math.min(1, Math.max(0, (p - b.o) / 0.6));
            if (t <= 0) continue;
            const ox = Math.cos(b.a + this.time * 5) * 46 * t, oy = Math.sin(b.a + this.time * 5) * 46 * t;
            const mx = x0 + (e.x - x0) * t + Math.sin(t * Math.PI) * b.sw * 0.3, my = y0 + (e.y - y0) * t - Math.sin(t * Math.PI) * 30 + Math.cos(t * Math.PI) * 0;
            const x = mx + ox * t, y = my + oy * t;
            this.drawBee(g, x, y, Math.atan2(e.y - y0, e.x - x0) + (t > 0.9 ? b.a + this.time * 5 + Math.PI / 2 : 0), 6, Math.min(1, q * 4));
          }
        }, 0.85);
        return true;
      }
      case 'aimline': {
        // 곧게 그어지는 겨눔 줄: 쓴 순간 방향으로 고정, 머리를 따라 붙는다
        const d = e.dur ?? 0.3, L = e.len ?? 280;
        const snatch = e.wk === 'snatch';
        const col = snatch ? C(0xfff0b0, 1) : C(0xffb020, 0);
        this.addShape((g, q) => {
          const [mx, my] = this.lastHead.get(id) ?? [e.x, e.y];
          const p = 1 - q;
          const grow = Math.min(1, p * 3);
          const ex = mx + ca * L * grow, ey = my + sa * L * grow;
          const w = snatch ? 46 : 6;
          if (snatch) g.poly([mx - sa * w, my + ca * w, ex - sa * w, ey + ca * w, ex + sa * w, ey - ca * w, mx + sa * w, my - ca * w]).fill({ color: col, alpha: 0.12 + 0.1 * p });
          // 점선
          const segN = Math.floor((L * grow) / 18);
          for (let k = 0; k < segN; k += 2) {
            const t0 = (k * 18) / L, t1 = ((k + 1) * 18) / L;
            g.moveTo(mx + ca * L * t0, my + sa * L * t0).lineTo(mx + ca * L * t1, my + sa * L * t1);
          }
          g.stroke({ width: snatch ? 4 : 2.5, color: col, alpha: 0.9 });
          g.circle(ex, ey, (snatch ? 10 : 8) + 4 * Math.sin(this.time * 30)).stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
        }, d);
        return true;
      }
      case 'stain': {
        // 노린내 액체 얼룩: 몸 둘레 땅에 노란 얼룩이 번지고 김이 오른다(번쩍이지 않게)
        if (!near) return true;
        const c1 = C(0xffc83a, 0), c2 = C(0xe8f070, 1);
        const blots: [number, number, number][] = [];
        for (let i = 0; i < 9; i++) {
          const aa = rnd() * Math.PI * 2, d = r * (0.35 + rnd() * 0.6);
          blots.push([e.x + Math.cos(aa) * d, e.y + Math.sin(aa) * d, 10 + rnd() * 16]);
        }
        this.addShape((g, q) => {
          const p = 1 - q;
          for (const [x, y, rr] of blots) g.ellipse(x, y, rr * (0.4 + 0.6 * Math.min(1, p * 4)), rr * 0.7 * (0.4 + 0.6 * Math.min(1, p * 4))).fill({ color: c1, alpha: 0.45 * Math.min(1, q * 2) });
        }, 1.4);
        this.ringFx(e.x, e.y, r, c2);
        for (let k = 0; k < 4; k++) this.afterMs(() => { for (const [x, y] of blots) if (rnd() < 0.5) this.spawnBit('puff', x, y, 0xf0f0d0, 20, 0.7, 0.5, -Math.PI / 2, 0.4); }, k * 200);
        hit(5, 0.02);
        return true;
      }
      case 'legwhip': {
        // 긴 다리 채찍: 가는 다리 여러 가닥이 부채처럼 휘어져 앞쪽을 훑는다(칼날 빛 아님)
        if (!near) return true;
        const half = e.half ?? 0.9, R = r;
        const col = C(0xe8e0d0, 0);
        for (let j = 0; j < 9; j++) {
          const off = (j / 8 - 0.5) * 2 * half;
          this.addShape((g, q) => {
            const p = 1 - q;
            const aa = a + off * (0.3 + 0.7 * Math.min(1, p * 2.5));
            const L = R * (0.75 + 0.25 * Math.sin(j * 1.7));
            const tx = e.x + Math.cos(aa) * L, ty = e.y + Math.sin(aa) * L;
            const bx = e.x + Math.cos(aa - 0.35 * Math.sign(off || 1)) * L * 0.5, by = e.y + Math.sin(aa - 0.35 * Math.sign(off || 1)) * L * 0.5;
            g.moveTo(e.x, e.y).quadraticCurveTo(bx, by, tx, ty).stroke({ width: 3 * q + 1, color: j % 2 ? col : 0xffffff, alpha: q, cap: 'round' });
          }, 0.28);
        }
        for (let i = 0; i < 10; i++) this.spawnBit('hair', e.x + Math.cos(a) * R * 0.8, e.y + Math.sin(a) * R * 0.8, 0xffffff, 120 + rnd() * 120, 0.35, 0.7, a, 1.6);
        hit(5, 0.02);
        return true;
      }
      case 'snatch': {
        const d = e.dur ?? 0.3;
        if (e.wk === 'pull') {
          // 줄 위의 것들을 끌어오는 순간: 줄이 번쩍 줄어들며 내 쪽으로 빨려 오는 빛 알갱이
          this.motion.play(id, 'snatch:pull', d, now);
          if (!near) return true;
          const L = e.len ?? 280, col = C(0xfff0b0, 1);
          this.addShape((g, q) => {
            const [mx, my] = this.lastHead.get(id) ?? [e.x, e.y];
            const ex = mx + ca * L * q, ey = my + sa * L * q;
            g.moveTo(mx, my).lineTo(ex, ey).stroke({ width: 8 * q + 2, color: col, alpha: q, cap: 'round' });
          }, d);
          for (let i = 0; i < 16; i++) {
            const t = 0.25 + rnd() * 0.75;
            this.spawnBit('mote', e.x + ca * L * t + (rnd() - 0.5) * 40, e.y + sa * L * t + (rnd() - 0.5) * 40, col, (L * t) / d, d, 0.7, a + Math.PI, 0.1);
          }
          hit(8, 0.04);
          return true;
        }
        if (e.wk === 'grab') {
          // 낚아챈 순간: 다리를 오므리며 몸을 뒤로 당기고, 적이 내 앞으로 끌려온다
          this.motion.play(id, 'snatch:grab', d, now);
          if (!near) return true;
          const tx = e.x1 ?? e.x, ty = e.y1 ?? e.y;
          const col = C(0xfff0b0, 1);
          for (let j = 0; j < 6; j++) {
            const aa = a + Math.PI + (j / 6 - 0.5) * 2.4;
            this.addShape((g, q) => {
              const reach = 50 * q;
              g.moveTo(tx + Math.cos(aa) * reach, ty + Math.sin(aa) * reach).lineTo(tx, ty).stroke({ width: 4 * q + 1, color: col, alpha: q, cap: 'round' });
            }, 0.22);
          }
          // 끌려오는 길: 적 자리에서 내 앞까지 줄어드는 끈
          this.addShape((g, q) => {
            const [mx, my] = this.lastHead.get(id) ?? [e.x, e.y];
            const p = 1 - q;
            const cx = tx + (mx - tx) * p, cy = ty + (my - ty) * p;
            g.moveTo(cx, cy).lineTo(mx, my).stroke({ width: 5 * q + 1, color: col, alpha: q });
          }, d);
          this.fx('ring', tx, ty, col, 8, 70, 0.25);
          hit(9, 0.04);
          return true;
        }
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
      case 'scissor': {
        this.motion.play(id, 'scissor', e.dur ?? 0.3, now);
        if (!near) return true;
        // 양쪽 큰턱이 바깥에서 안으로 휘둘러 닫히는 두 개의 초승달 궤적 + 닫히는 순간 X자 번쩍
        const R = r * 0.8;
        for (const sd of [-1, 1]) {
          this.addShape((g, q) => {
            const p = 1 - q; // 0 → 1 진행
            const from = a + sd * 1.45, to = a + sd * (1.45 - 1.35 * Math.min(1, p * 2.2));
            const lo = Math.min(from, to), hi = Math.max(from, to);
            g.moveTo(e.x + Math.cos(lo) * R, e.y + Math.sin(lo) * R);
            g.arc(e.x, e.y, R, lo, hi);
            g.stroke({ width: 14 * q + 2, color: light, alpha: 0.85 * q, cap: 'round' });
            g.moveTo(e.x + Math.cos(lo) * R * 0.78, e.y + Math.sin(lo) * R * 0.78);
            g.arc(e.x, e.y, R * 0.78, lo, hi);
            g.stroke({ width: 4 * q, color: 0xffffff, alpha: q, cap: 'round' });
          }, 0.26);
        }
        this.afterMs(() => {
          const hx2 = e.x + ca * R, hy2 = e.y + sa * R;
          this.fx('slash', hx2, hy2, light, 50, 140, 0.25, a + 0.8, 0);
          this.fx('slash', hx2, hy2, 0xffffff, 50, 140, 0.25, a - 0.8, 0);
          for (let i = 0; i < 14; i++) this.spawnBit('shard', hx2, hy2, i % 2 ? light : 0xffffff, 140 + rnd() * 180, 0.4, 0.8);
          hit(9, 0.04);
        }, 90);
        return true;
      }
      case 'circle': {
        this.motion.play(id, 'circle', e.dur ?? 1.5, now, e.half ?? 1);
        if (!near) return true;
        this.dustRing(e.x, e.y, 40, 0xdde8d0, 16);
        return true;
      }
      case 'compound': {
        this.motion.play(id, 'compound', 0.6, now);
        this.eyesT.set(id, now + 3);
        if (!near) return true;
        // 벌집 무늬 파동이 눈에서 바깥으로 퍼진다
        const R = Math.min(r, 420);
        this.addShape((g, q) => {
          const p = 1 - q, rr = 40 + R * outE(p);
          const n = 18;
          for (let i = 0; i < n; i++) {
            const aa = (i / n) * Math.PI * 2;
            g.regularPoly(e.x + Math.cos(aa) * rr, e.y + Math.sin(aa) * rr, 16 + 10 * p, 6, aa).stroke({ width: 2.5, color: 0x7ae0ff, alpha: q });
          }
          g.circle(e.x, e.y, rr).stroke({ width: 2, color: 0xffffff, alpha: q * 0.6 });
        }, 0.7);
        return true;
      }
      case 'roll': {
        this.motion.play(id, 'roll', e.dur ?? 0.3, now, e.half ?? 1);
        if (!near) return true;
        const side = a + (e.half ?? 1) * Math.PI / 2;
        for (let i = 0; i < 8; i++) this.spawnBit('puff', e.x, e.y, DUST, 60 + rnd() * 60, 0.5, 0.55, side + Math.PI, 1);
        for (let i = 0; i < 8; i++) this.spawnBit('mote', e.x, e.y, C(0xc8faff, 1), 80 + rnd() * 80, 0.4, 0.6, side, 0.6);
        return true;
      }
      case 'trizone': {
        // 세 착지 자리를 잇는 삼각형이 번쩍이며 안쪽을 친다
        if (!near) return true;
        const vx = [0, 1, 2].map((i) => e.x + Math.cos(a + (i * 2 * Math.PI) / 3) * r), vy = [0, 1, 2].map((i) => e.y + Math.sin(a + (i * 2 * Math.PI) / 3) * r);
        const col = C(0x3ae8a8, 0);
        this.addShape((g, q) => {
          g.poly([vx[0], vy[0], vx[1], vy[1], vx[2], vy[2]]).fill({ color: col, alpha: 0.35 * q }).stroke({ width: 5 * q + 1, color: 0xffffff, alpha: q });
        }, 0.45);
        this.dustRing(e.x, e.y, r * 0.5, 0xd8f8ec, 18);
        hit(12, 0.05);
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
        for (let i = 0; i < 18; i++) this.spawnBit('drop', hx, hy, i % 2 ? 0x8aff5a : 0x3ac83a, 120 + rnd() * 160, 0.6, 0.7, a, 1.6);
        // 독: 맞은 자리에서 초록 독 연기가 뭉게뭉게 + 독방울이 떨어진다
        for (let k = 0; k < 5; k++)
          later(k * 0.12, () => {
            for (let i = 0; i < 5; i++) this.spawnBit('puff', hx + (rnd() - 0.5) * 40, hy + (rnd() - 0.5) * 40, i % 2 ? 0x6ad84a : 0xa8ff7a, 20 + rnd() * 25, 1.1, 0.8 + rnd() * 0.5, -Math.PI / 2, 0.8);
            this.spawnBit('bubble', hx + (rnd() - 0.5) * 30, hy, 0x9aff5a, 30, 0.9, 0.6, -Math.PI / 2, 0.6);
          });
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
        // 소용돌이: 나선 팔 네 개가 돌며 가운데로 감겨 든다
        const c2 = P(1, 0xffd23f);
        this.addShape((g, q) => {
          const p = 1 - q, rot = p * 7;
          for (let arm = 0; arm < 4; arm++) {
            const base = rot + (arm / 4) * Math.PI * 2;
            g.moveTo(e.x + Math.cos(base) * r, e.y + Math.sin(base) * r);
            for (let j = 1; j <= 16; j++) {
              const t = j / 16, rr = r * (1 - t * 0.92), aa = base + t * 3.2;
              g.lineTo(e.x + Math.cos(aa) * rr, e.y + Math.sin(aa) * rr);
            }
            g.stroke({ width: 10 * q + 2, color: arm % 2 ? c : c2, alpha: 0.55 * q, cap: 'round' });
          }
        }, 1.3);
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
        // 진흙 덩이: 울퉁불퉁 갈색 덩어리가 출렁이며 호를 그리고, 진흙 방울을 흘리다 철퍽 — 땅에 진흙 얼룩
        const c = 0x8a5a2a, c2 = 0xb07a40;
        const x0 = e.x1 ?? e.x, y0 = e.y1 ?? e.y;
        const T = 0.34;
        this.addShape((g, q) => {
          const t = 1 - q;
          const x = x0 + (e.x - x0) * t, y = y0 + (e.y - y0) * t - Math.sin(t * Math.PI) * 80;
          const R = 13 + Math.sin(t * Math.PI) * 4;
          const pts: number[] = [];
          for (let j = 0; j < 9; j++) {
            const aa = (j / 9) * Math.PI * 2;
            const rr = R * (0.8 + 0.25 * Math.sin(aa * 3 + this.time * 25));
            pts.push(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr * 0.85);
          }
          g.poly(pts).fill(c).stroke({ width: 2.5, color: 0x3a2410 });
          g.ellipse(x - R * 0.3, y - R * 0.35, R * 0.35, R * 0.18).fill({ color: 0xe0b080, alpha: 0.7 });
          if (Math.random() < 0.7) this.spawnBit('drop', x, y + R * 0.6, c2, 20, 0.35, 0.6, Math.PI / 2, 0.3);
        }, T);
        later(T, () => {
          // 철퍽: 사방으로 튀는 진흙 덩이 + 남는 진흙 자국
          const blots: [number, number, number][] = [];
          for (let i = 0; i < 8; i++) {
            const aa = rnd() * Math.PI * 2, d = r * (0.2 + rnd() * 0.7);
            blots.push([e.x + Math.cos(aa) * d, e.y + Math.sin(aa) * d, 5 + rnd() * 9]);
          }
          this.addShape((g, q) => {
            const al = Math.min(1, q * 2.5);
            const pts: number[] = [];
            for (let j = 0; j < 14; j++) {
              const aa = (j / 14) * Math.PI * 2, rr = r * (j % 2 ? 0.45 : 0.7) * (0.9 + 0.2 * Math.sin(j * 5));
              pts.push(e.x + Math.cos(aa) * rr, e.y + Math.sin(aa) * rr * 0.85);
            }
            g.poly(pts).fill({ color: c, alpha: 0.75 * al }).stroke({ width: 2, color: 0x3a2410, alpha: 0.6 * al });
            for (const [x, y, rr] of blots) g.circle(x, y, rr).fill({ color: c2, alpha: 0.8 * al });
          }, 1.6);
          for (let i = 0; i < 18; i++) this.spawnBit('drop', e.x, e.y, i % 2 ? c : c2, 140 + rnd() * 160, 0.55, 1.0, -Math.PI / 2 + (rnd() - 0.5) * 2.6, 0.2);
          this.shake = Math.max(this.shake, 6);
          hit(8, 0.03);
        });
        break;
      }
      case 'powder': {
        // 부채꼴로 퍼져 천천히 가라앉는 반짝이 가루
        const c = P(0, 0xffe066);
        this.coneFx(e.x, e.y, a, r, Math.min(half, 1.4), c, false);
        // 3초 남는 가루 구름: 부채꼴 안에 몽글몽글한 반짝이 구름 덩이들이 천천히 부풀며 일렁인다
        const puffs = Array.from({ length: half > 2 ? 16 : 14 }, () => {
          const aa = a + (rnd() - 0.5) * Math.min(half, 3.1) * 1.8, d = r * (0.25 + rnd() * 0.7);
          return { x: e.x + cos(aa) * d, y: e.y + sin(aa) * d, R: r * (0.22 + rnd() * 0.14), ph: rnd() * 6, col: [c, P(1, 0xff9ad8), 0xffc8f0][Math.floor(rnd() * 3)] };
        });
        this.addShape((g, q) => {
          const p = 1 - q, grow = Math.min(1, p * 6);
          const al = Math.min(1, q * 4);
          for (const f of puffs) {
            const R = f.R * (0.5 + 0.5 * grow) * (1 + 0.06 * Math.sin(this.time * 3 + f.ph));
            const ox = Math.sin(this.time * 1.3 + f.ph) * 6;
            g.circle(f.x + ox, f.y, R).fill({ color: f.col, alpha: 0.3 * al }).stroke({ width: 2, color: 0xffffff, alpha: 0.35 * al });
            g.circle(f.x + ox, f.y, R * 0.6).fill({ color: f.col, alpha: 0.35 * al });
            for (let j = 0; j < 3; j++) {
              const tw = Math.sin(this.time * 9 + f.ph + j * 2.1);
              if (tw > 0.4) g.star(f.x + ox + Math.cos(f.ph + j * 2) * R * 0.6, f.y + Math.sin(f.ph + j * 2) * R * 0.6, 4, 3 + 3 * tw, 1.2).fill({ color: 0xffffff, alpha: 0.9 * al });
            }
          }
        }, 3);
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
        // 색색 나비 서른여섯 마리가 세 겹 회오리로 4초 동안 돈다(바깥은 느리게, 안은 빠르게)
        const flock = Array.from({ length: 36 }, (_, i) => ({ lane: i % 3, a0: rnd() * Math.PI * 2, col: [0xffe066, 0xff9ad8, 0x7ad8ff, 0xffa04a, 0xb88aff][i % 5], s: 12 + rnd() * 5, ph: rnd() * 6 }));
        this.addShape((g, q) => {
          const p = 1 - q, al = Math.min(1, q * 5, p * 6);
          g.circle(e.x, e.y, r).fill({ color: 0xffffff, alpha: 0.08 * al }).stroke({ width: 3, color: 0xff9ad8, alpha: 0.4 * al });
          for (const b of flock) {
            const rr = r * [0.95, 0.68, 0.4][b.lane], sp = [2.2, 3.2, 4.4][b.lane];
            const aa = b.a0 + this.time * sp;
            const x = e.x + Math.cos(aa) * rr, y = e.y + Math.sin(aa) * rr * 0.92;
            const dir = aa + Math.PI / 2;
            const flap = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 18 + b.ph));
            const cc = Math.cos(dir), ss = Math.sin(dir);
            for (const sd of [-1, 1]) {
              // 앞날개·뒷날개
              const wx = x - ss * sd * b.s * 0.7 * flap, wy = y + cc * sd * b.s * 0.7 * flap;
              g.ellipse(wx + cc * 2, wy + ss * 2, b.s * 0.75 * flap + 1, b.s * 0.55).fill({ color: b.col, alpha: 0.95 * al }).stroke({ width: 1, color: INK, alpha: 0.7 * al });
              g.ellipse(wx - cc * 3, wy - ss * 3, b.s * 0.5 * flap + 1, b.s * 0.4).fill({ color: b.col, alpha: 0.8 * al });
            }
            g.moveTo(x - cc * 5, y - ss * 5).lineTo(x + cc * 5, y + ss * 5).stroke({ width: 2, color: INK, alpha: al });
          }
        }, 4);
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
        // 굵은 독털 바늘이 부채꼴로 휙: 크림색 털 끝이 초록 독으로 빛나고, 지나간 자리에 초록 독 안개
        const c = P(0, 0xfff0b0), g1 = 0x6ae84a, g2 = 0xb8ff7a;
        const needles = Array.from({ length: 22 }, () => ({ aa: a + (rnd() - 0.5) * half * 2, sp: r * (0.8 + rnd() * 0.5), o: rnd() * 0.12 }));
        this.addShape((g, q) => {
          const p = 1 - q;
          for (const nd of needles) {
            const t = Math.min(1, Math.max(0, (p - nd.o) / 0.5));
            if (t <= 0) continue;
            const d = nd.sp * (1 - (1 - t) * (1 - t));
            const x = e.x + Math.cos(nd.aa) * d, y = e.y + Math.sin(nd.aa) * d;
            const bx = x - Math.cos(nd.aa) * 18, by = y - Math.sin(nd.aa) * 18;
            g.moveTo(bx, by).lineTo(x, y).stroke({ width: 5.5, color: c, alpha: Math.min(1, q * 2), cap: 'round' });
            g.moveTo(x - Math.cos(nd.aa) * 7, y - Math.sin(nd.aa) * 7).lineTo(x, y).stroke({ width: 5.5, color: g1, alpha: Math.min(1, q * 2), cap: 'round' });
            g.circle(x, y, 4).fill({ color: g1, alpha: Math.min(1, q * 2) });
          }
        }, 0.6);
        for (let k = 0; k < 4; k++)
          later(0.1 + k * 0.1, () => {
            for (let i = 0; i < 6; i++) {
              const aa = a + (rnd() - 0.5) * half * 2, d = r * (0.3 + rnd() * 0.7);
              this.spawnBit('puff', e.x + cos(aa) * d, e.y + sin(aa) * d, i % 2 ? g1 : g2, 15, 1.2, 0.9 + rnd() * 0.4, -Math.PI / 2, 0.6);
            }
          });
        hit(6, 0.02);
        break;
      }
      // ---------- 종 고유 필살기(사마귀) ----------
      case 'riposte': {
        // 반격 자세: 흰 칼날 고리가 맥동하며 몸을 감싼다(맞으면 되베는 연출은 combo)
        this.ringFx(e.x, e.y, r, 0xffffff);
        this.afterMs(() => this.ringFx(e.x, e.y, r * 0.7, P(0, 0xb8ff7a)), 120);
        this.addAura(e.snake, 'stance', e.dur ?? 2.5, r * 0.8, P(0, 0xd8ff9a));
        hit(6, 0.03);
        break;
      }
      case 'reapslash': {
        // 큰 초승달 칼날: n(모은 반격 수)이 클수록 크고 여러 겹. ghost는 보랏빛
        const ghost = e.wk === 'ghost';
        const c = ghost ? 0xc8b8ff : P(0, 0xd8ff9a);
        const layers = 1 + Math.min(4, e.n ?? 0);
        for (let j = 0; j < layers; j++)
          later(j * 0.05, () => {
            const rr = r * (0.75 + j * 0.08);
            const a0 = a + j * 1.3;
            this.addShape((g, q) => {
              const sweep = (1 - q) * Math.PI * 2;
              g.arc(e.x, e.y, rr, a0, a0 + Math.max(0.2, sweep)).stroke({ width: 10 - j, color: j % 2 ? 0xffffff : c, alpha: Math.min(1, q * 2.5), cap: 'round' });
            }, 0.35);
          });
        this.aoeFx(e.x, e.y, r, c, false);
        if (ghost) for (let i = 0; i < 14; i++) this.spawnBit('leaf', e.x, e.y, DRY[i % DRY.length], 160 + rnd() * 120, 0.6, 0.8, rnd() * Math.PI * 2, Math.PI);
        if (e.awake && near) this.screenFlash = Math.max(this.screenFlash, 0.3);
        hit(e.awake ? 14 : 9, e.awake ? 0.08 : 0.05);
        break;
      }
      case 'blink': {
        // 번개 궤적: 출발점 → 도착점을 지그재그로 잇고 잔상
        if (e.x1 === undefined || e.y1 === undefined) break;
        if (e.wk === 'firefly') {
          this.fireflyZap(e.x1, e.y1, e.x, e.y, e.n ?? 1, hit);
          break;
        }
        if (e.wk === 'saw') {
          // 내던지기 궤적: 포물선 점선 + 뒤로 튀는 흙
          const x0 = e.x1, y0 = e.y1, x1 = e.x, y1 = e.y, dur = e.dur ?? 0.24;
          const c = WK_COL.saw;
          this.addShape((g, q) => {
            const p = Math.min(1, (1 - q) * 1.6);
            const N = 14;
            for (let k = 0; k < N * p; k++) {
              const t = k / N, hz = 85 * Math.sin(Math.PI * t) * 0.85;
              const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t - hz;
              g.circle(x, y, 5 - 3 * t).fill({ color: k % 2 ? c : 0xffffff, alpha: 0.75 * q });
            }
          }, dur + 0.35);
          this.dustRing(x0, y0, 26, DUST, 12);
          for (let i = 0; i < 6; i++) this.spawnBit('puff', x0, y0, DUST, 80 + rnd() * 60, 0.5, 0.6, a + Math.PI, 1);
          hit(6, 0.03);
          break;
        }
        const c = e.wk ? (WK_COL[e.wk] ?? P(0, 0xe8d890)) : P(0, 0xe8d890), x0 = e.x1, y0 = e.y1;
        const dx = e.x - x0, dy = e.y - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        const pts: number[] = [x0, y0];
        for (let k = 1; k < 6; k++) {
          const t = k / 6, j = (k % 2 ? 1 : -1) * (12 + rnd() * 14);
          pts.push(x0 + dx * t + nx * j, y0 + dy * t + ny * j);
        }
        pts.push(e.x, e.y);
        this.addShape((g, q) => {
          g.moveTo(pts[0], pts[1]);
          for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
          g.stroke({ width: 9, color: c, alpha: q * 0.55, cap: 'round', join: 'round' });
          g.moveTo(pts[0], pts[1]);
          for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
          g.stroke({ width: 3, color: 0xffffff, alpha: q, cap: 'round', join: 'round' });
        }, 0.3);
        this.lineFx(e.x - cos(a) * 30, e.y - sin(a) * 30, a, 60, 18, 0xffffff, c);
        for (let i = 0; i < 8; i++) this.spawnParticle(x0, y0, c, 40 + rnd() * 60, 0.35, 0.4);
        hit(8, 0.04);
        break;
      }
      case 'bloom': {
        // 꽃밭: 분홍 꽃잎이 원을 그리며 피고 안쪽으로 소용돌이
        const c = P(0, 0xff9ad8);
        this.ringFx(e.x, e.y, r, c);
        this.addAura(e.snake, 'bloom', e.dur ?? 2.5, r, c);
        for (let i = 0; i < 24; i++) {
          const aa = (i / 24) * Math.PI * 2;
          this.spawnBit('petal', e.x + cos(aa) * r, e.y + sin(aa) * r, i % 2 ? c : 0xffe0f0, 30, 1.2, 1, aa + Math.PI, 0.3);
        }
        hit(5, 0.02);
        break;
      }
      case 'bloomburst': {
        const c = P(0, 0xff9ad8);
        this.aoeFx(e.x, e.y, r, c, false);
        this.ringFx(e.x, e.y, r, 0xffffff);
        for (let i = 0; i < 40; i++) this.spawnBit('petal', e.x, e.y, [c, 0xffe0f0, 0xffffff][i % 3], 160 + rnd() * 200, 0.8, 0.9 + rnd() * 0.5, rnd() * Math.PI * 2, Math.PI);
        if (near) this.screenFlash = Math.max(this.screenFlash, 0.3);
        hit(13, 0.07);
        break;
      }
      case 'aura': {
        // 몸에 붙는 고리(종 고유 필살기): wk가 고리 종류
        const col = WK_COL[e.wk ?? ''] ?? 0xffffff;
        this.addAura(e.snake, (e.wk ?? 'stance') as Aura['kind'], e.dur ?? 3, r, col);
        if (e.wk === 'rage') this.ringFx(e.x, e.y, r, col);
        hit(5, 0.02);
        break;
      }
      case 'dropshadow': {
        // 천장 습격 예고: 맞을 적 발밑에 붉은 그림자가 점점 커지며 따라다닌다
        const id = e.snake, dur = e.dur ?? 1;
        this.addGround((g, q) => {
          const [x, y] = this.lastHead.get(id) ?? [e.x, e.y];
          const p = 1 - q;
          const rr = r * (0.35 + 0.9 * p);
          g.ellipse(x, y, rr, rr * 0.8).fill({ color: 0x1a0402, alpha: 0.2 + 0.4 * p });
          g.ellipse(x, y, rr * 1.15, rr * 0.92).stroke({ width: 4, color: 0xff3a1a, alpha: (0.4 + 0.5 * Math.abs(Math.sin(p * 18))) * (0.4 + 0.6 * p) });
          for (let j = 0; j < 8; j++) {
            const aa = (j / 8) * Math.PI * 2;
            g.moveTo(x + cos(aa) * rr * 0.6, y + sin(aa) * rr * 0.5).lineTo(x + cos(aa) * rr * 1.25, y + sin(aa) * rr * 1.0).stroke({ width: 3, color: 0x1a0402, alpha: 0.35 * p });
          }
        }, dur);
        break;
      }
      case 'glowtrail': {
        // 땅속을 지나가는 빛: 땅 위로 노란 빛 금이 솟고 흙이 들썩인다(오래 남음)
        const x0 = e.x, y0 = e.y, pts: number[] = [];
        for (let k = -2; k <= 2; k++) pts.push(x0 + cos(a) * k * 16 + (rnd() - 0.5) * 12, y0 + sin(a) * k * 16 + (rnd() - 0.5) * 12);
        this.addGround((g, q) => {
          g.poly(pts, false).stroke({ width: 18, color: 0x5a4418, alpha: 0.5 * q, cap: 'round', join: 'round' });
          g.poly(pts, false).stroke({ width: 7, color: 0xf6e86a, alpha: 0.9 * q, cap: 'round', join: 'round' });
          g.poly(pts, false).stroke({ width: 2.5, color: 0xffffff, alpha: q, cap: 'round', join: 'round' });
        }, 1.6);
        for (let i = 0; i < 5; i++) this.spawnBit('sand', x0, y0, 0x8a6a4a, 60 + rnd() * 80, 0.4, 0.8, -Math.PI / 2, 2.5);
        for (let i = 0; i < 3; i++) this.spawnBit('mote', x0, y0, 0xf6e86a, 40 + rnd() * 40, 0.6, 0.7, -Math.PI / 2, 1.5);
        break;
      }
      case 'geyser': {
        // 솟구침: 땅이 터지며 빛(또는 개미) 기둥이 솟고 방울이 사방으로
        const c = WK_COL[e.wk ?? ''] ?? 0xffffff, x0 = e.x, y0 = e.y, ant = e.wk === 'fireant';
        this.fx('ring', x0, y0, c, r * 0.3, r * 2.2, 0.5);
        this.fx('flare', x0, y0, c, r * 0.3, r * 1.0, 0.3, 0, 1.5, 0.7);
        this.dustRing(x0, y0, r * 0.5, DUST, 16);
        this.cracks(x0, y0, r * 0.7);
        this.addShape((g, q) => {
          const p = 1 - q, H = r * 1.5 * outE(Math.min(1, p * 3)), w = r * 0.35 * (1 - p * 0.5);
          g.ellipse(x0, y0 - H * 0.5, w, H * 0.5 + 8).fill({ color: c, alpha: 0.45 * q });
          g.ellipse(x0, y0 - H * 0.5, w * 0.45, H * 0.5).fill({ color: 0xffffff, alpha: 0.6 * q });
          g.ellipse(x0, y0, r * 0.6, r * 0.45).fill({ color: c, alpha: 0.25 * q });
        }, 0.7);
        for (let i = 0; i < 34; i++) {
          const aa = rnd() * Math.PI * 2;
          if (ant) this.spawnBit('ant', x0, y0, i % 3 ? 0xc83a1a : 0x2a1408, 160 + rnd() * 220, 0.8, 0.9 + rnd() * 0.4, aa, 0.2);
          else this.spawnBit(i % 2 ? 'drop' : 'mote', x0, y0 - 20, i % 3 ? c : 0xffffff, 200 + rnd() * 240, 0.8, 0.8 + rnd() * 0.6, aa, 0.3);
        }
        for (let i = 0; i < 14; i++) this.spawnBit('shard', x0, y0, 0x7a5a3a, 200 + rnd() * 200, 0.6, 0.8, -Math.PI / 2, 2.4);
        hit(14, 0.07);
        break;
      }
      case 'swarmline': {
        // 벌 떼가 줄지어 날아가 적을 덮친다
        if (e.x1 === undefined || e.y1 === undefined) break;
        const x0 = e.x1, y0 = e.y1, x1 = e.x, y1 = e.y, dur = e.dur ?? 0.35;
        const fl = Array.from({ length: 22 }, () => ({ b: rnd() * dur * 0.7, o: (rnd() - 0.5) * 50, ph: rnd() * 6 }));
        const ang = Math.atan2(y1 - y0, x1 - x0), nx = -sin(ang), ny = cos(ang);
        this.addShape((g, q) => {
          const t = (1 - q) * (dur + 0.3);
          for (const f of fl) {
            const u = Math.min(1, Math.max(0, (t - f.b) / dur));
            if (t < f.b) continue;
            const wob = Math.sin(t * 20 + f.ph) * 10 + f.o * (1 - u);
            this.drawBee(g, x0 + (x1 - x0) * u + nx * wob, y0 + (y1 - y0) * u + ny * wob, ang, 7, Math.min(1, q * 3));
          }
        }, dur + 0.3);
        break;
      }
      case 'buzzring': {
        // 진동 고리: 물결치듯 떨리는 노란 고리가 겹겹이 퍼진다
        const c = WK_COL[e.wk ?? ''] ?? 0xffe066, x0 = e.x, y0 = e.y, big = !!e.awake;
        for (let j = 0; j < (big ? 4 : 2); j++)
          later(j * 0.07, () =>
            this.addShape((g, q) => {
              const p = 1 - q, R = r * (0.25 + 0.8 * outE(p));
              const pts: number[] = [];
              for (let i = 0; i <= 48; i++) {
                const aa = (i / 48) * Math.PI * 2, rr = R + Math.sin(aa * 12 + this.time * 40) * (big ? 10 : 6);
                pts.push(x0 + cos(aa) * rr, y0 + sin(aa) * rr);
              }
              g.poly(pts, true).stroke({ width: (big ? 12 : 8) * q, color: j % 2 ? 0xffffff : c, alpha: 0.85 * q });
            }, 0.45),
          );
        if (big) {
          this.fx('flare', x0, y0, c, r * 0.4, r * 1.8, 0.35, 0, 1.5);
          if (near) this.screenFlash = Math.max(this.screenFlash, 0.2);
        }
        for (let i = 0; i < (big ? 24 : 10); i++) this.spawnBit('mote', x0, y0, i % 2 ? c : 0xffffff, r * (1 + rnd()), 0.4, 0.6);
        hit(big ? 14 : 6, big ? 0.06 : 0.02);
        break;
      }
      case 'lob': {
        // 진흙 덩이가 높은 호를 그리며 날아간다(땅에 그림자)
        if (e.x1 === undefined || e.y1 === undefined) break;
        const x0 = e.x1, y0 = e.y1, x1 = e.x, y1 = e.y, dur = e.dur ?? 0.4;
        this.addShape((g, q) => {
          const u = 1 - q, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, h = 130 * Math.sin(Math.PI * u);
          g.ellipse(x, y, 14, 9).fill({ color: 0x000000, alpha: 0.25 });
          g.circle(x, y - h, 16).fill(0x8a6a42).stroke({ width: 3, color: 0x4a3420 });
          g.circle(x - 5, y - h - 5, 5).fill({ color: 0xc8a878, alpha: 0.9 });
        }, dur);
        later(dur, () => {
          if (!this.isNear(x1, y1)) return;
          for (let i = 0; i < 14; i++) this.spawnBit('drop', x1, y1, i % 2 ? 0x8a6a42 : 0x6a4a2a, 120 + rnd() * 120, 0.5, 0.8);
          this.dustRing(x1, y1, 30, 0x8a6a42, 12);
        });
        break;
      }
      case 'jar': {
        // 진흙 호리병: 갇힌 적 둘레로 항아리 껍질이 씌워지고 점점 금이 가다 깨진다
        const id = e.snake, dur = e.dur ?? 1.6, R = r;
        const cracks: number[][] = [];
        for (let j = 0; j < 6; j++) {
          const aa = rnd() * Math.PI * 2, pts = [cos(aa) * R * 0.3, sin(aa) * R * 0.3];
          let px = pts[0], py = pts[1], ca = aa;
          for (let k = 0; k < 3; k++) ((ca += (rnd() - 0.5) * 1), (px += cos(ca) * R * 0.25), (py += sin(ca) * R * 0.25), pts.push(px, py));
          cracks.push(pts);
        }
        this.addShape((g, q) => {
          const [x, y] = this.lastHead.get(id) ?? [e.x, e.y];
          const p = 1 - q, grow = Math.min(1, p * 6);
          g.ellipse(x, y + R * 0.1, R * grow, R * 0.95 * grow).fill({ color: 0x9a7448, alpha: 0.78 }).stroke({ width: 5, color: 0x4a3420, alpha: 0.95 });
          g.ellipse(x, y - R * 0.75 * grow, R * 0.42 * grow, R * 0.2 * grow).fill({ color: 0x6a4a2a }).stroke({ width: 3, color: 0x4a3420 });
          g.ellipse(x - R * 0.35, y - R * 0.2, R * 0.18 * grow, R * 0.35 * grow).fill({ color: 0xd8b888, alpha: 0.5 });
          const m = Math.floor(cracks.length * Math.max(0, (p - 0.35) / 0.65));
          for (let j = 0; j < m; j++) {
            const c = cracks[j], pts: number[] = [];
            for (let k = 0; k < c.length; k += 2) pts.push(x + c[k], y + c[k + 1]);
            g.poly(pts, false).stroke({ width: 3, color: 0x2a1a0a, alpha: 0.9 });
          }
        }, dur);
        later(dur, () => {
          const [x, y] = this.lastHead.get(id) ?? [e.x, e.y];
          if (!this.isNear(x, y)) return;
          for (let i = 0; i < 22; i++) this.spawnBit('shard', x, y, i % 2 ? 0x9a7448 : 0x6a4a2a, 180 + rnd() * 200, 0.6, 0.9 + rnd() * 0.5);
          this.dustRing(x, y, R, 0x9a7448, 16);
          this.shake = Math.max(this.shake, 6);
        });
        hit(6, 0.03);
        break;
      }
      case 'laser': {
        // 정지 비행 조준: 내 머리에서 겨눈 적까지 붉은 조준선 + 조여드는 조준점
        const me = e.snake, tid = e.n ?? -1, dur = e.dur ?? 1, fx0 = e.x, fy0 = e.y;
        this.addShape((g, q) => {
          const [sx, sy] = this.lastHead.get(me) ?? [e.x1 ?? e.x, e.y1 ?? e.y];
          const [tx, ty] = tid >= 0 ? (this.lastHead.get(tid) ?? [fx0, fy0]) : [fx0, fy0];
          const p = 1 - q, L = Math.hypot(tx - sx, ty - sy) || 1, n = Math.floor(L / 22);
          for (let i = 0; i < n; i += 2) {
            const t0 = i / n, t1 = (i + 1) / n;
            g.moveTo(sx + (tx - sx) * t0, sy + (ty - sy) * t0).lineTo(sx + (tx - sx) * t1, sy + (ty - sy) * t1);
          }
          g.stroke({ width: 3, color: 0xff3a1a, alpha: 0.5 + 0.4 * p });
          g.moveTo(sx, sy).lineTo(tx, ty).stroke({ width: 10, color: 0xff3a1a, alpha: 0.12 + 0.2 * p });
          const rr = 60 - 36 * p;
          g.circle(tx, ty, rr).stroke({ width: 3, color: 0xff3a1a, alpha: 0.9 });
          for (let j = 0; j < 4; j++) {
            const aa = (j * Math.PI) / 2 + p * 2;
            g.moveTo(tx + cos(aa) * (rr - 10), ty + sin(aa) * (rr - 10)).lineTo(tx + cos(aa) * (rr + 14), ty + sin(aa) * (rr + 14)).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
          }
          if (q < 0.15) g.circle(tx, ty, 10).fill({ color: 0xff3a1a, alpha: Math.sin(this.time * 40) > 0 ? 1 : 0.3 });
        }, dur);
        break;
      }
      case 'snipe': {
        // 거대한 독침: 굵은 주황 궤적이 번쩍 그어지고, 끝에서 독이 터진다
        if (e.x1 === undefined || e.y1 === undefined) break;
        const x0 = e.x1, y0 = e.y1, x1 = e.x, y1 = e.y, w = r;
        const c = 0xff9a2a;
        this.addShape((g, q) => {
          const p = Math.min(1, (1 - q) * 6), hx = x0 + (x1 - x0) * p, hy = y0 + (y1 - y0) * p;
          g.moveTo(x0, y0).lineTo(hx, hy).stroke({ width: w * q, color: c, alpha: 0.35 * q, cap: 'round' });
          g.moveTo(x0, y0).lineTo(hx, hy).stroke({ width: w * 0.3 * q + 2, color: 0xffe0a0, alpha: 0.9 * q, cap: 'round' });
          const ca = cos(a), sa = sin(a);
          if (p < 1) g.poly([hx + ca * 34, hy + sa * 34, hx - sa * 12, hy + ca * 12, hx + sa * 12, hy - ca * 12]).fill(0x2a1a0a).stroke({ width: 2, color: 0xffe0a0 });
        }, 0.5);
        later(0.08, () => {
          this.fx('flare', x1, y1, c, 30, 160, 0.3, 0, 2);
          this.fx('ring', x1, y1, 0x8aff5a, 20, 160, 0.35);
          for (let i = 0; i < 16; i++) this.spawnBit('drop', x1, y1, i % 2 ? 0x8aff5a : c, 140 + rnd() * 160, 0.5, 0.7, a, 1.6);
        });
        for (let i = 0; i < 14; i++) {
          const t = rnd();
          this.spawnBit('ember', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c, 30 + rnd() * 40, 0.4, 0.6);
        }
        if (near) this.speedLines = Math.max(this.speedLines, 0.3);
        hit(12, 0.06);
        break;
      }
      case 'bigweb': {
        // 거대 그물 짓기: 바퀴살이 먼저 뻗고 나선 실이 안쪽으로 감긴다
        const x0 = e.x, y0 = e.y, dur = e.dur ?? 0.6, S = 16;
        this.addShape((g, q) => {
          const p = 1 - q * 0.999;
          const sp = Math.min(1, p * 2.2);
          for (let i = 0; i < S; i++) {
            const aa = (i / S) * Math.PI * 2;
            g.moveTo(x0, y0).lineTo(x0 + cos(aa) * r * sp, y0 + sin(aa) * r * sp);
          }
          g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
          const sp2 = Math.max(0, (p - 0.4) / 0.6), turns = 7;
          const N = Math.floor(turns * S * sp2);
          for (let i = 0; i < N; i++) {
            const t0 = i / (turns * S), t1 = (i + 1) / (turns * S);
            const r0 = r * (1 - t0 * 0.85), r1 = r * (1 - t1 * 0.85);
            const a0 = (i / S) * Math.PI * 2, a1 = ((i + 1) / S) * Math.PI * 2;
            g.moveTo(x0 + cos(a0) * r0, y0 + sin(a0) * r0).lineTo(x0 + cos(a1) * r1, y0 + sin(a1) * r1);
          }
          g.stroke({ width: 2, color: 0xe8f0ff, alpha: 0.85 });
        }, dur);
        later(dur * 0.9, () => {
          this.ringFx(x0, y0, r, 0xe8f0ff);
          for (let i = 0; i < 24; i++) {
            const aa = rnd() * Math.PI * 2, d = rnd() * r;
            this.spawnBit('star', x0 + cos(aa) * d, y0 + sin(aa) * d, 0xffffff, 20, 0.6, 0.5);
          }
        });
        hit(6, 0.03);
        break;
      }
      case 'eyes': {
        // 여덟 눈이 번쩍: 머리 위로 큰 눈 넷·작은 눈 넷이 빛난다
        const id = e.snake;
        this.addShape((g, q) => {
          const [x, y] = this.lastHead.get(id) ?? [e.x, e.y];
          const k = Math.min(1, q * 3) * Math.min(1, (1 - q) * 8), yy = y - 70;
          const eye = (ex: number, ey: number, er: number) => {
            g.circle(ex, ey, er * 1.6).fill({ color: 0x9ad8ff, alpha: 0.35 * k });
            g.circle(ex, ey, er).fill({ color: 0x0a0a14, alpha: k }).stroke({ width: 2, color: 0x9ad8ff, alpha: k });
            g.circle(ex - er * 0.3, ey - er * 0.3, er * 0.35).fill({ color: 0xffffff, alpha: k });
          };
          for (const sd of [-1, 1]) {
            eye(x + sd * 22, yy, 18);
            eye(x + sd * 54, yy + 6, 11);
            eye(x + sd * 28, yy - 34, 8);
            eye(x + sd * 60, yy - 24, 7);
          }
        }, 0.7);
        this.fx('flare', e.x, e.y - 70, 0x9ad8ff, 30, 110, 0.3, 0, 2, 0.6);
        hit(6, 0.03);
        break;
      }
      case 'crosshair': {
        // 겨눔 표시: 노린 적 둘레에 하늘색 꺾쇠가 돌며 조여든다
        const id = e.snake, dur = e.dur ?? 1;
        this.addShape((g, q) => {
          const [x, y] = this.lastHead.get(id) ?? [e.x, e.y];
          const p = 1 - q, rr = r * (1.4 - 0.4 * Math.min(1, p * 4));
          for (let j = 0; j < 4; j++) {
            const aa = (j * Math.PI) / 2 + this.time * 2;
            g.moveTo(x + cos(aa - 0.35) * rr, y + sin(aa - 0.35) * rr).arc(x, y, rr, aa - 0.35, aa + 0.35).stroke({ width: 9, color: 0x1a3a5a, alpha: 0.6 });
            g.moveTo(x + cos(aa - 0.35) * rr, y + sin(aa - 0.35) * rr).arc(x, y, rr, aa - 0.35, aa + 0.35).stroke({ width: 5, color: 0x9ad8ff, alpha: 1 });
          }
          g.circle(x, y, rr).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
          g.circle(x, y, 5).fill(0x9ad8ff);
        }, dur);
        break;
      }
      case 'brood': {
        // 새끼 거미 해일: 수십 마리 작은 거미가 다리를 놀리며 사방으로 쏟아져 나간다
        const x0 = e.x, y0 = e.y, N = 70, LIFE = 0.95;
        const sp = Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2 + rnd() * 0.15, v: 0.55 + rnd() * 0.45, b: rnd() * 0.25, s: 4 + rnd() * 3 }));
        this.addShape((g, q) => {
          const t = (1 - q) * LIFE;
          for (const f of sp) {
            if (t < f.b) continue;
            const u = Math.min(1, ((t - f.b) / (LIFE - 0.25)) * f.v * 1.4);
            const d = r * u, x = x0 + cos(f.a) * d, y = y0 + sin(f.a) * d, al = Math.min(1, (1 - u) * 4);
            const ca = cos(f.a), sa = sin(f.a), sz = f.s, wig = Math.sin(this.time * 40 + f.a * 10) * 0.4;
            for (let l = -1.5; l <= 1.5; l += 1) {
              for (const sd of [-1, 1]) {
                const la = f.a + sd * (1.2 + wig * sd) + l * 0.3 * sd;
                g.moveTo(x, y).lineTo(x + Math.cos(la) * sz * 1.9, y + Math.sin(la) * sz * 1.9);
              }
            }
            g.stroke({ width: 1.2, color: 0x2a2016, alpha: al });
            g.circle(x - ca * sz * 0.6, y - sa * sz * 0.6, sz * 0.8).fill({ color: 0x5a4a32, alpha: al });
            g.circle(x + ca * sz * 0.3, y + sa * sz * 0.3, sz * 0.5).fill({ color: 0x3a2e20, alpha: al });
          }
        }, LIFE);
        this.dustRing(x0, y0, 60, DUST, 24);
        for (let k = 1; k <= 3; k++) later(0.12 + (k - 1) * 0.2, () => this.fx('ring', x0, y0, 0xe0c898, 20, r * (0.8 + 0.6 * k), 0.4, 0, 0, 0.5));
        hit(9, 0.04);
        break;
      }
      case 'cocoon': {
        // 죽음의 고치: 흰 실이 감겨 고치가 되고, 위에 붉은 모래시계가 깜빡인다
        const id = e.snake, dur = e.dur ?? 2.5, R = r;
        this.addShape((g, q) => {
          const [x, y] = this.lastHead.get(id) ?? [e.x, e.y];
          const p = 1 - q, wrap = Math.min(1, p * 4);
          g.ellipse(x, y, R * 1.05, R * 0.8).fill({ color: 0xf0f0f8, alpha: 0.55 * wrap }).stroke({ width: 3, color: 0xffffff, alpha: 0.9 * wrap });
          const turns = 9 * wrap;
          for (let i = 0; i < turns; i++) {
            const yy = y - R * 0.7 + (i / 9) * R * 1.4, w = R * Math.sqrt(Math.max(0, 1 - ((yy - y) / (R * 0.85)) ** 2));
            g.moveTo(x - w, yy - 4).quadraticCurveTo(x, yy + 8, x + w, yy + 4).stroke({ width: 2, color: 0xd8d8e8, alpha: 0.9 });
          }
          const hy = y - R - 30, blink = 0.6 + 0.4 * Math.sin(this.time * 8);
          g.circle(x, hy, 24).fill({ color: 0x1a0a0e, alpha: 0.8 * wrap });
          g.poly([x - 14, hy - 18, x + 14, hy - 18, x, hy]).fill({ color: 0xff2a3a, alpha: blink * wrap });
          g.poly([x - 14, hy + 18, x + 14, hy + 18, x, hy]).fill({ color: 0xff2a3a, alpha: blink * wrap });
          if (Math.random() < 0.15) this.spawnBit('drop', x + (Math.random() - 0.5) * R, y, 0xff2a3a, 20, 0.6, 0.5, Math.PI / 2, 0.3);
        }, dur);
        hit(5, 0.03);
        break;
      }
      case 'silkpull': {
        // 실이 곧게 뻗어 적에게 붙고 팽팽히 당겨진다
        if (e.x1 === undefined || e.y1 === undefined) break;
        const me = e.snake, x1 = e.x, y1 = e.y, dur = (e.dur ?? 0.3) + 0.3;
        this.addShape((g, q) => {
          const [sx, sy] = this.lastHead.get(me) ?? [e.x1!, e.y1!];
          const p = Math.min(1, (1 - q) * 4);
          g.moveTo(sx, sy).lineTo(sx + (x1 - sx) * p, sy + (y1 - sy) * p).stroke({ width: 4, color: 0xffffff, alpha: 0.95 * q }).moveTo(sx, sy).lineTo(sx + (x1 - sx) * p, sy + (y1 - sy) * p).stroke({ width: 10, color: 0xff9aa8, alpha: 0.25 * q });
        }, dur);
        break;
      }
      case 'antswarm': {
        // 개미 떼가 한 적에게 몰려들어 쏜다
        if (e.x1 === undefined || e.y1 === undefined) break;
        const x0 = e.x1, y0 = e.y1, x1 = e.x, y1 = e.y;
        const ang = Math.atan2(y1 - y0, x1 - x0);
        for (let i = 0; i < 18; i++) {
          const aa = rnd() * Math.PI * 2, d = 40 + rnd() * 60;
          this.spawnBit('ant', x1 + cos(aa) * d, y1 + sin(aa) * d, i % 3 ? 0xc83a1a : 0x2a1408, d * 2.5, 0.4, 0.9, aa + Math.PI, 0.2);
        }
        void ang;
        void x0;
        this.fx('flare', x1, y1, 0xff5a2a, 20, 120, 0.25, 0, 2);
        for (let i = 0; i < 10; i++) this.spawnBit('ember', x1, y1, 0xff7a2a, 100 + rnd() * 100, 0.5, 0.7);
        hit(6, 0.03);
        break;
      }
      case 'quake': {
        // 내리꽂기: 땅이 쩍 갈라져 오래 남고, 흙덩이가 솟고, 먼지 고리
        const c = WK_COL[e.wk ?? ''] ?? 0xffc060, x0 = e.x, y0 = e.y;
        const cr: number[][] = [];
        const nC = e.awake ? 10 : 8;
        for (let j = 0; j < nC; j++) {
          let ang = (j / nC) * Math.PI * 2 + rnd() * 0.5;
          const L = r * (1.3 + rnd() * 0.8);
          const pts = [x0, y0];
          let px = x0, py = y0;
          for (let k = 1; k <= 6; k++) {
            ang += (rnd() - 0.5) * 0.8;
            px += (cos(ang) * L) / 6;
            py += (sin(ang) * L) / 6;
            pts.push(px, py);
          }
          cr.push(pts);
          if (rnd() < 0.75) {
            const bi = 2 + Math.floor(rnd() * 3);
            let bx = pts[bi * 2], by = pts[bi * 2 + 1], ba = ang + (rnd() < 0.5 ? -1 : 1) * 0.9;
            const bp = [bx, by];
            for (let k = 0; k < 3; k++) {
              ba += (rnd() - 0.5) * 0.6;
              bx += cos(ba) * L * 0.13;
              by += sin(ba) * L * 0.13;
              bp.push(bx, by);
            }
            cr.push(bp);
          }
        }
        // 솟은 땅 조각(가운데 둘레)
        const slabs: number[][] = [];
        for (let j = 0; j < 7; j++) {
          const ang = (j / 7) * Math.PI * 2 + rnd() * 0.4, d = r * (0.35 + rnd() * 0.2), w = 16 + rnd() * 14;
          const sx = x0 + cos(ang) * d, sy = y0 + sin(ang) * d, tx = -sin(ang), ty = cos(ang);
          slabs.push([sx - tx * w, sy - ty * w, sx + tx * w, sy + ty * w, sx + tx * w * 0.7 + cos(ang) * 14, sy + ty * w * 0.7 + sin(ang) * 14 - 14, sx - tx * w * 0.7 + cos(ang) * 14, sy - ty * w * 0.7 + sin(ang) * 14 - 14]);
        }
        const LIFE = 2.6;
        this.addGround((g, q) => {
          const t = (1 - q) * LIFE;
          const open = Math.min(1, t / 0.14);
          const fade = Math.min(1, (q * LIFE) / 0.8);
          const glow = Math.max(0, 1 - t / 1.2);
          g.circle(x0, y0, r * 0.55).fill({ color: 0x2a1a0a, alpha: 0.35 * fade });
          for (const pts of cr) {
            const n = pts.length / 2, m = Math.max(1, Math.ceil((n - 1) * open));
            for (let i = 0; i < m; i++) {
              const w = 1 - i / (n - 1);
              g.moveTo(pts[i * 2], pts[i * 2 + 1]).lineTo(pts[i * 2 + 2], pts[i * 2 + 3]).stroke({ width: 6 + 22 * w, color: 0x8a6a40, alpha: 0.6 * fade, cap: 'round' });
              g.moveTo(pts[i * 2], pts[i * 2 + 1]).lineTo(pts[i * 2 + 2], pts[i * 2 + 3]).stroke({ width: 3 + 12 * w, color: 0x140a02, alpha: 0.95 * fade, cap: 'round' });
              if (glow > 0) g.moveTo(pts[i * 2], pts[i * 2 + 1]).lineTo(pts[i * 2 + 2], pts[i * 2 + 3]).stroke({ width: 1.5 + 4 * w, color: 0xff8a2a, alpha: 0.95 * glow, cap: 'round' });
            }
          }
          for (const sl of slabs) {
            g.poly(sl).fill({ color: 0x8a6a42, alpha: 0.95 * fade }).stroke({ width: 2, color: 0x3a2610, alpha: 0.8 * fade });
            g.moveTo(sl[4], sl[5]).lineTo(sl[6], sl[7]).stroke({ width: 3, color: 0xc8a878, alpha: 0.9 * fade });
          }
        }, LIFE);
        this.fx('ring', x0, y0, 0xfff0d0, r * 0.3, r * 2.4, 0.4, 0, 0, 0.6);
        this.dustRing(x0, y0, r * 0.6, DUST, 16);
        for (let i = 0; i < 26; i++) this.spawnBit('shard', x0 + (rnd() - 0.5) * r * 0.6, y0 + (rnd() - 0.5) * r * 0.6, i % 3 ? 0x7a5a3a : 0xa08060, 220 + rnd() * 260, 0.7, 0.8 + rnd() * 0.7, -Math.PI / 2, 2.6);
        for (let i = 0; i < 6; i++) this.spawnBit('puff', x0, y0, DUST, 160 + rnd() * 160, 0.7, 0.9 + rnd() * 0.4);
        hit(20, 0.1);
        this.shake = Math.max(this.shake, 14);
        break;
      }
      case 'burst': {
        // 종 고유 필살기 공통 터짐: 색은 wk(종)로
        const c = WK_COL[e.wk ?? ''] ?? 0xffffff;
        if (e.wk === 'kingstag') {
          // 갑옷판이 사방으로 튕겨 나간다
          const x0 = e.x, y0 = e.y, m0 = rnd() * Math.PI;
          this.addShape((g, q) => {
            const d = r * (0.5 + 1.3 * (1 - q * q));
            for (let j = 0; j < 4; j++) {
              const m = m0 + (j * Math.PI) / 2, R0 = d, R1 = d + 30, h = 0.4;
              const pts: number[] = [];
              for (let i = 0; i <= 6; i++) pts.push(x0 + cos(m - h + (2 * h * i) / 6) * R1, y0 + sin(m - h + (2 * h * i) / 6) * R1);
              for (let i = 6; i >= 0; i--) pts.push(x0 + cos(m - h + (2 * h * i) / 6) * R0, y0 + sin(m - h + (2 * h * i) / 6) * R0);
              g.poly(pts).fill({ color: 0x8a90a8, alpha: q }).stroke({ width: 3, color: 0x2a2e40, alpha: q });
            }
          }, 0.45);
          for (let i = 0; i < 16; i++) this.spawnBit('shard', e.x, e.y, i % 2 ? 0xc8ccd8 : 0x8a90a8, 220 + rnd() * 200, 0.5, 0.8);
        }
        this.aoeFx(e.x, e.y, r, c, !!e.awake);
        this.ringFx(e.x, e.y, r, 0xffffff);
        for (let i = 0; i < 18; i++) this.spawnParticle(e.x, e.y, i % 3 ? c : 0xffffff, r * (0.6 + rnd() * 0.6), 0.5, 0.7);
        if (e.awake && near) this.screenFlash = Math.max(this.screenFlash, 0.25);
        hit(e.awake ? 12 : 8, e.awake ? 0.06 : 0.04);
        break;
      }
      case 'beam': {
        // 긴 띠: 나비 떼 강물(오래)·빛줄기(짧게)
        if (e.x1 === undefined || e.y1 === undefined) break;
        const c = WK_COL[e.wk ?? ''] ?? 0xffffff, x0 = e.x1, y0 = e.y1, x1 = e.x, y1 = e.y, w = r || 40, dur = e.dur ?? 0.3;
        const bandA = e.wk === 'monarch' ? 0.45 : 1;
        this.addShape((g, q) => {
          const k = Math.min(1, q * 3) * bandA;
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w, color: c, alpha: 0.22 * k, cap: 'round' });
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w * 0.35, color: c, alpha: 0.55 * k, cap: 'round' });
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: Math.max(2, w * 0.08), color: 0xffffff, alpha: 0.9 * k, cap: 'round' });
        }, dur);
        if (e.wk === 'monarch') {
          // 나비 떼가 길을 따라 강물처럼 흘러간다
          const L = Math.hypot(x1 - x0, y1 - y0), ca = cos(a), sa = sin(a), nx = -sa, ny = ca;
          const N = 54, LIFE = dur + 1;
          const fl = Array.from({ length: N }, (_, i) => ({
            b: (i / N) * (dur - 0.15) + rnd() * 0.05,
            tr: 0.8 + rnd() * 0.35,
            o: (rnd() - 0.5) * w * 0.85,
            ph: rnd() * 6.28,
            sz: 11 + rnd() * 7,
            col: [c, 0xffb040, 0xff7a1a][i % 3],
          }));
          this.addShape((g, q) => {
            const t = (1 - q) * LIFE;
            for (const f of fl) {
              const u = (t - f.b) / f.tr;
              if (u < 0 || u > 1) continue;
              const al = Math.min(1, u * 6, (1 - u) * 5);
              const wob = Math.sin(t * 5 + f.ph) * 16;
              const x = x0 + ca * L * u + nx * (f.o + wob), y = y0 + sa * L * u + ny * (f.o + wob);
              this.bfly(g, x, y, a + Math.cos(t * 5 + f.ph) * 0.35, f.sz, 0.3 + 0.7 * Math.abs(Math.sin(t * 18 + f.ph)), f.col, al);
            }
          }, LIFE);
        }
        if (e.wk === 'morpho') {
          // 빛줄기 전체가 반짝인다: 길을 따라 별빛과 빛 망울
          const L = Math.hypot(x1 - x0, y1 - y0), ca = cos(a), sa = sin(a);
          for (let i = 0; i < 16; i++) {
            const t = (i + rnd()) / 16, j = (rnd() - 0.5) * w * 0.9;
            this.spawnBit(i % 2 ? 'star' : 'mote', x0 + ca * L * t - sa * j, y0 + sa * L * t + ca * j, i % 3 ? c : 0xffffff, 20 + rnd() * 50, 0.45, 0.4 + rnd() * 0.5);
          }
          for (let i = 1; i <= 4; i++) {
            const t = i / 4 - rnd() * 0.12;
            this.fx('flare', x0 + ca * L * t, y0 + sa * L * t, i % 2 ? c : 0xffffff, 24, 100, 0.22, 0, 2);
          }
        }
        hit(e.wk === 'morpho' ? 5 : 3, 0.02);
        break;
      }
      case 'territory': {
        // 바닥에 남는 고리(영역·맴돌이): dur 동안
        const c = WK_COL[e.wk ?? ''] ?? 0xffffff, x0 = e.x, y0 = e.y, dur = e.dur ?? 3;
        this.ringFx(x0, y0, r, c);
        this.addShape((g, q) => {
          const k = Math.min(1, q * 6);
          const t = this.time;
          g.circle(x0, y0, r).fill({ color: c, alpha: 0.06 * k }).stroke({ width: 4, color: c, alpha: 0.6 * k });
          for (let j = 0; j < 6; j++) {
            const ang = t * 1.2 + (j / 6) * Math.PI * 2;
            g.moveTo(x0 + Math.cos(ang) * r, y0 + Math.sin(ang) * r).arc(x0, y0, r, ang, ang + 0.35).stroke({ width: 8, color: 0xffffff, alpha: 0.5 * k });
          }
        }, dur);
        hit(4, 0.02);
        break;
      }
      case 'tide': {
        // 물결: n=1 퍼짐, n=-1 오므라듦
        const c = WK_COL.tide, x0 = e.x, y0 = e.y, out = (e.n ?? 1) > 0;
        for (let j = 0; j < 3; j++)
          later(j * 0.08, () =>
            this.addShape((g, q) => {
              const p = out ? 1 - q : q;
              const rr = r * (0.2 + 0.8 * p);
              g.circle(x0, y0, rr).stroke({ width: 14 - j * 3, color: j === 1 ? 0xffffff : c, alpha: 0.75 * q });
            }, 0.55),
          );
        for (let i = 0; i < 30; i++) {
          const aa = (i / 30) * Math.PI * 2;
          if (out) this.spawnParticle(x0 + Math.cos(aa) * 30, y0 + Math.sin(aa) * 30, c, r * 0.9, 0.5, 0.7);
          else this.spawnParticle(x0 + Math.cos(aa) * r, y0 + Math.sin(aa) * r, c, 30, 0.5, 0.7);
        }
        hit(out ? 9 : 12, 0.05);
        break;
      }
      case 'bigeye': {
        // 땅에 떠오르는 거대한 눈알 무늬
        const x0 = e.x, y0 = e.y, dur = e.dur ?? 1.8;
        this.addShape((g, q) => {
          const open = Math.min(1, (1 - q) * 6) * Math.min(1, q * 5);
          const blink = q < 0.12 ? q / 0.12 : 1;
          const ry = r * 0.55 * open * blink;
          g.ellipse(x0, y0, r, Math.max(2, ry)).fill({ color: 0xf0e0b0, alpha: 0.35 * open }).stroke({ width: 6, color: 0x3a2a1a, alpha: 0.8 * open });
          g.circle(x0, y0, Math.min(r * 0.42, ry)).fill({ color: 0x8a5a2a, alpha: 0.7 * open });
          g.circle(x0, y0, Math.min(r * 0.2, ry * 0.5)).fill({ color: 0x1a1008, alpha: 0.9 * open });
          g.circle(x0 - r * 0.12, y0 - r * 0.1, Math.min(r * 0.07, ry * 0.2)).fill({ color: 0xffffff, alpha: 0.9 * open });
        }, dur);
        if (near) this.screenFlash = Math.max(this.screenFlash, 0.2);
        hit(10, 0.05);
        break;
      }
      case 'armor': {
        // 몸을 감싸는 고리(장수 갑옷·실바늘)
        const c = WK_COL[e.wk ?? ''] ?? 0xffffff;
        if (e.wk === 'kingstag') {
          // 장수 갑옷: 두꺼운 금속판 넷이 바깥에서 날아와 철컥 맞물린다
          this.addAura(e.snake, 'plates', e.dur ?? 4, r, c);
          const x0 = e.x, y0 = e.y;
          this.addShape((g, q) => {
            const d = r * (1 + 1.4 * q * q);
            for (let j = 0; j < 4; j++) {
              const m = (j * Math.PI) / 2 + 0.4;
              g.circle(x0 + cos(m) * d, y0 + sin(m) * d, 22).fill({ color: 0x8a90a8, alpha: 1 - q }).stroke({ width: 3, color: 0xe8ecff, alpha: 1 - q });
            }
          }, 0.18);
          later(0.18, () => {
            this.fx('ring', x0, y0, 0xe8ecff, r * 0.8, r * 1.8, 0.3);
            this.fx('flare', x0, y0, 0xffffff, r * 0.5, r * 1.6, 0.25);
            for (let j = 0; j < 4; j++) {
              const m = (j * Math.PI) / 2 + 0.4;
              for (let i = 0; i < 5; i++) this.spawnBit('star', x0 + cos(m) * r, y0 + sin(m) * r, i % 2 ? 0xffffff : 0xffe8a0, 120 + rnd() * 120, 0.35, 0.5, m, 1.4);
            }
            hit(9, 0.05);
          });
          break;
        }
        this.ringFx(e.x, e.y, r, c);
        this.addAura(e.snake, 'stance', e.dur ?? 3, r, c);
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
  private addGround(draw: (g: Graphics, k: number) => void, life: number) {
    this.grounds.push({ draw, life, max: life });
  }

  /** 반딧불 한 번 튐: 빛 구슬이 휙 날아가 '탕!' 터지고, 지나간 길은 잠깐 빛 실로 남는다(n번째일수록 크게) */
  private fireflyZap(x0: number, y0: number, x1: number, y1: number, n: number, hit: (shake: number, punch: number) => void) {
    const c = WK_COL.firefly, TRAVEL = 0.09, LIFE = 0.75;
    const dx = x1 - x0, dy = y1 - y0;
    this.addShape((g, q) => {
      const t = (1 - q) * LIFE, p = Math.min(1, t / TRAVEL);
      const hx = x0 + dx * p, hy = y0 + dy * p;
      const fade = t < TRAVEL ? 1 : Math.max(0, 1 - (t - TRAVEL) / (LIFE - TRAVEL));
      g.moveTo(x0, y0).lineTo(hx, hy).stroke({ width: 14, color: c, alpha: 0.3 * fade, cap: 'round' });
      g.moveTo(x0, y0).lineTo(hx, hy).stroke({ width: 4, color: 0xffffff, alpha: 0.95 * fade, cap: 'round' });
      if (p < 1) g.circle(hx, hy, 26).fill({ color: c, alpha: 0.3 }).circle(hx, hy, 14).fill({ color: c, alpha: 0.8 }).circle(hx, hy, 7).fill(0xffffff);
    }, LIFE);
    this.afterMs(() => {
      if (!this.isNear(x1, y1)) return;
      const big = Math.min(1.5, 0.8 + n * 0.1);
      this.fx('flare', x1, y1, c, 30, 140 * big, 0.3, 0, 2);
      this.fx('ring', x1, y1, 0xffffff, 10, 120 * big, 0.28);
      this.fx('ring', x1, y1, c, 20, 170 * big, 0.4);
      // '탕!' 십자 섬광
      const rot = Math.random() * Math.PI;
      this.addShape((g, q) => {
        const L = 95 * big * (0.5 + 0.5 * (1 - q));
        for (let j = 0; j < 2; j++) {
          const ca = Math.cos(rot + (j * Math.PI) / 2), sa = Math.sin(rot + (j * Math.PI) / 2);
          g.moveTo(x1 - ca * L, y1 - sa * L).lineTo(x1 + ca * L, y1 + sa * L).stroke({ width: 7 * q + 1, color: 0xffffff, alpha: q, cap: 'round' });
        }
        g.circle(x1, y1, 30 * q + 6).fill({ color: c, alpha: 0.65 * q });
      }, 0.28);
      for (let i = 0; i < 14; i++) this.spawnBit(i % 2 ? 'star' : 'mote', x1, y1, i % 3 ? c : 0xffffff, 140 + Math.random() * 180, 0.5, 0.6 + Math.random() * 0.5);
      hit(5 + n, 0.04);
    }, TRAVEL * 1000);
  }

  /** 나비 한 마리(날개 넷을 기울어진 타원으로) */
  private bfly(g: Graphics, x: number, y: number, ang: number, sz: number, flap: number, col: number, alpha: number) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (lx: number, ly: number) => [x + ca * lx - sa * ly, y + sa * lx + ca * ly];
    const wing = (cx: number, cy: number, rx: number, ry: number, c: number, al: number) => {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const t = (i / 10) * Math.PI * 2;
        pts.push(...P(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry));
      }
      g.poly(pts).fill({ color: c, alpha: al }).stroke({ width: 1.5, color: 0x1a0e04, alpha: al });
    };
    for (const sd of [-1, 1]) {
      wing(sz * 0.35, sd * sz * 0.75 * flap, sz * 0.55, sz * 0.75 * flap, col, alpha);
      wing(-sz * 0.35, sd * sz * 0.55 * flap, sz * 0.4, sz * 0.5 * flap, lighterC(col, 0.25), alpha * 0.9);
    }
    const [bx0, by0] = P(sz * 0.8, 0), [bx1, by1] = P(-sz * 0.8, 0);
    g.moveTo(bx0, by0).lineTo(bx1, by1).stroke({ width: Math.max(2, sz * 0.22), color: 0x1a0e04, alpha, cap: 'round' });
  }

  /** 독가루 구름: 뭉게뭉게 덩이가 겹친 반투명 구름(몸 위에 떠 있다) */
  private poisonCloud(x: number, y: number, R: number, k: number, seed: number) {
    const g = this.cloudGfx, T = this.time;
    const puffs: [number, number, number][] = [];
    const N = 18;
    for (let j = 0; j < N; j++) {
      const ang = j * 2.39996 + seed, d = R * 0.78 * Math.sqrt((j + 0.5) / N);
      const dr = R * 0.035 * Math.sin(T * 0.7 + j * 1.3);
      const pr = R * (0.24 + 0.06 * ((j * 7) % 5) / 4) * (1 + 0.07 * Math.sin(T * 1.2 + j * 1.7));
      puffs.push([x + Math.cos(ang + T * 0.05) * (d + dr), y + Math.sin(ang + T * 0.05) * (d + dr), pr]);
    }
    // 가장자리 뭉게(울퉁불퉁한 윤곽)
    for (let j = 0; j < 12; j++) {
      const ang = (j / 12) * Math.PI * 2 + T * 0.05 + seed;
      const pr = R * (0.2 + 0.04 * Math.sin(T * 1.4 + j * 2.1));
      puffs.push([x + Math.cos(ang) * R * 0.8, y + Math.sin(ang) * R * 0.8, pr]);
    }
    for (const [px, py, pr] of puffs) g.circle(px + pr * 0.1, py + pr * 0.22, pr).fill({ color: 0x5a4a10, alpha: 0.085 * k });
    for (const [px, py, pr] of puffs) g.circle(px, py, pr * 0.9).fill({ color: 0xe0cc6a, alpha: 0.12 * k });
    for (const [px, py, pr] of puffs) g.circle(px - pr * 0.22, py - pr * 0.3, pr * 0.52).fill({ color: 0xfffad0, alpha: 0.13 * k });
    for (const [px, py, pr] of puffs) g.circle(px - pr * 0.3, py - pr * 0.4, pr * 0.22).fill({ color: 0xffffff, alpha: 0.1 * k });
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

  /** 상태 아이콘 그림(도감 표용 이미지 주소) */
  statusIcon(id: string): string {
    const k = 'st:' + id;
    const hit = this.portraits.get(k);
    if (hit) return hit;
    const sp = new Sprite(this.tex['st_' + id]);
    const url = (this.app.renderer.extract.canvas({ target: sp, resolution: 1 }) as HTMLCanvasElement).toDataURL();
    sp.destroy();
    this.portraits.set(k, url);
    return url;
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
    this.drawZones(frame.zones, frame.playerId, player);
    this.drawTeles(frame.teles, frame.playerId, frame.snakes);
    this.drawFoods(frame.foods, player && player.alive ? player.family : null);
    this.drawRings(frame.rings);
    this.drawMarks(frame.snakes, player);

    this.statusGfx.clear();
    this.hpGfx.clear();
    this.iconGfx.clear();
    this.iconPool.begin();
    const seen = new Set<number>();
    for (const pool of [this.shadowPool, this.glowPool, this.legPool, this.bodyPool]) pool.begin();
    for (const s of frame.snakes) {
      seen.add(s.id);
      this.drawSnake(s, player);
    }
    for (const pool of [this.shadowPool, this.glowPool, this.legPool, this.bodyPool, this.iconPool]) pool.end();
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

  private drawZones(zones: ZoneView[], playerId: number, player?: FrameSnake) {
    const g = this.zoneGfx;
    g.clear();
    this.cloudGfx.clear();
    this.hazeGfx.clear();
    let haze = 0;
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
        case 'itchcloud': {
          // 독가루 구름: 땅엔 옅은 그늘, 몸 위로는 뭉게뭉게 떠 있는 반투명 구름(안에 들면 화면도 누렇게)
          g.circle(z.x, z.y, z.r).fill({ color: 0x8a7a30, alpha: 0.1 * k }).stroke({ width: 2, color: mine ? 0xffe880 : 0xb89a40, alpha: 0.3 * k });
          this.poisonCloud(z.x, z.y, z.r, k, (z.x * 0.013 + z.y * 0.007) % 6.28);
          if (Math.random() < 0.5) this.spawnBit('puff', z.x + (Math.random() - 0.5) * z.r * 1.4, z.y + (Math.random() - 0.5) * z.r * 1.4, 0xe8d070, 10, 1.4, 0.9);
          if (Math.random() < 0.4) this.spawnParticle(z.x + (Math.random() - 0.5) * z.r * 1.5, z.y + (Math.random() - 0.5) * z.r * 1.5, 0xfff080, 14, 1, 0.5);
          if (!mine && player && player.alive && player.segs.length >= 2 && Math.hypot(player.segs[0] - z.x, player.segs[1] - z.y) < z.r) haze = Math.max(haze, k);
          break;
        }
        case 'stinktrail': {
          // 노린내 얼룩: 누런 액체 웅덩이에서 김이 오른다
          g.circle(z.x, z.y, z.r).fill({ color: 0xc8a020, alpha: 0.22 * k });
          g.circle(z.x + z.r * 0.2, z.y - z.r * 0.1, z.r * 0.6).fill({ color: 0xe8d040, alpha: 0.22 * k });
          g.circle(z.x - z.r * 0.25, z.y + z.r * 0.2, z.r * 0.35).fill({ color: 0xfff080, alpha: 0.2 * k });
          if (Math.random() < 0.12) this.spawnBit('puff', z.x + (Math.random() - 0.5) * z.r, z.y, 0xe8f070, 30, 0.8, 0.5, -Math.PI / 2, 0.4);
          break;
        }
        case 'fireflood': {
          // 불개미 떼 범람: 붉게 달아오른 땅 위로 수많은 개미가 물결치듯 들끓고, 군데군데 흙 둔덕
          g.circle(z.x, z.y, z.r).fill({ color: 0x8a2a10, alpha: 0.2 * k }).stroke({ width: 4, color: 0xff5a2a, alpha: (0.5 + 0.2 * Math.sin(T * 6)) * k });
          for (let j = 0; j < 5; j++) {
            const aa = j * 1.26 + 0.4, d = z.r * (j === 0 ? 0 : 0.55);
            const mx = z.x + Math.cos(aa) * d, my = z.y + Math.sin(aa) * d;
            g.ellipse(mx, my, 26, 19).fill({ color: 0xb07a4a, alpha: 0.9 * k }).stroke({ width: 2, color: 0x5a3a1a, alpha: k });
            g.ellipse(mx, my - 2, 7, 5).fill({ color: 0x2a1408, alpha: k });
          }
          for (let i = 0; i < 90; i++) {
            const lane = i % 5, sp = (lane % 2 ? 1 : -1) * (0.6 + lane * 0.15);
            const aa = T * sp + i * 2.39996, rr = z.r * (0.12 + 0.86 * (((i * 37) % 97) / 97));
            const ax = z.x + Math.cos(aa) * rr, ay = z.y + Math.sin(aa) * rr, ha = aa + (sp > 0 ? Math.PI / 2 : -Math.PI / 2);
            const col = i % 4 === 0 ? 0x2a1408 : 0xc83a1a;
            g.circle(ax, ay, 2.6).fill({ color: col, alpha: k }).circle(ax + Math.cos(ha) * 4, ay + Math.sin(ha) * 4, 2).fill({ color: col, alpha: k });
          }
          if (Math.random() < 0.6) this.spawnBit('ember', z.x + (Math.random() - 0.5) * z.r * 1.6, z.y + (Math.random() - 0.5) * z.r * 1.6, 0xff7a2a, 40, 0.6, 0.6, -Math.PI / 2, 0.6);
          break;
        }
        case 'bigweb': {
          // 거대 그물: 은빛 바퀴살 16줄과 촘촘한 나선, 이슬방울이 반짝인다
          const S = 16, turns = 7;
          for (let i = 0; i < S; i++) {
            const aa = (i / S) * Math.PI * 2;
            g.moveTo(z.x, z.y).lineTo(z.x + Math.cos(aa) * z.r, z.y + Math.sin(aa) * z.r);
          }
          g.stroke({ width: 2.4, color: 0xffffff, alpha: 0.75 * k });
          for (let i = 0; i < turns * S; i++) {
            const t0 = i / (turns * S), t1 = (i + 1) / (turns * S);
            const r0 = z.r * (1 - t0 * 0.85), r1 = z.r * (1 - t1 * 0.85);
            const a0 = (i / S) * Math.PI * 2, a1 = ((i + 1) / S) * Math.PI * 2;
            g.moveTo(z.x + Math.cos(a0) * r0, z.y + Math.sin(a0) * r0).lineTo(z.x + Math.cos(a1) * r1, z.y + Math.sin(a1) * r1);
          }
          g.stroke({ width: 1.8, color: 0xe8f0ff, alpha: 0.65 * k });
          g.circle(z.x, z.y, z.r).fill({ color: 0xe8f0ff, alpha: 0.05 * k });
          for (let i = 0; i < 12; i++) {
            const aa = (i * 2.39996) % (Math.PI * 2), d = z.r * (0.2 + 0.75 * ((i * 53) % 13) / 13);
            const tw = 0.5 + 0.5 * Math.sin(T * 3 + i * 1.7);
            g.circle(z.x + Math.cos(aa) * d, z.y + Math.sin(aa) * d, 3).fill({ color: 0xffffff, alpha: tw * k });
          }
          if (mine) g.circle(z.x, z.y, z.r).stroke({ width: 3, color: 0xe8f0ff, alpha: 0.45 * k });
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
        case 'silk': {
          // 끈끈한 은빛 실 뭉치: 지그재그 실 몇 가닥 + 이슬 방울(반짝)
          const seed = z.x * 0.37 + z.y * 0.71;
          for (let j = 0; j < 3; j++) {
            const a0 = seed + j * 2.1, L = z.r * 1.1;
            const x1 = z.x + Math.cos(a0) * L, y1 = z.y + Math.sin(a0) * L, x2 = z.x - Math.cos(a0) * L, y2 = z.y - Math.sin(a0) * L;
            const mx = z.x + Math.cos(a0 + 1.57) * z.r * 0.35, my = z.y + Math.sin(a0 + 1.57) * z.r * 0.35;
            g.moveTo(x1, y1).quadraticCurveTo(mx, my, x2, y2).stroke({ width: 1.6, color: 0xf4f4ff, alpha: 0.8 * k });
          }
          g.circle(z.x, z.y, z.r * 0.5).fill({ color: 0xffffff, alpha: 0.18 * k });
          const tw = 0.5 + 0.5 * Math.sin(T * 6 + seed);
          g.circle(z.x + Math.cos(seed) * z.r * 0.4, z.y + Math.sin(seed) * z.r * 0.4, 2.5).fill({ color: 0xffffff, alpha: (0.4 + 0.6 * tw) * k });
          break;
        }
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
          // 바닥에 고인 꿀 웅덩이(울퉁불퉁) + 반짝 + 위에서 꿀이 뚝뚝 떨어져 철퍽
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.4, d = z.r * (0.25 + 0.35 * ((i * 37) % 10) / 10);
            const bx = z.x + Math.cos(a) * d, by = z.y + Math.sin(a) * d * 0.86, br = z.r * (0.18 + 0.08 * Math.sin(i * 2.3));
            g.ellipse(bx, by, br, br * 0.7).fill({ color: 0xffb000, alpha: 0.55 * k });
            g.ellipse(bx - br * 0.3, by - br * 0.25, br * 0.35, br * 0.15).fill({ color: 0xffffff, alpha: 0.5 * k });
          }
          if (Math.random() < 0.35 && this.isNear(z.x, z.y)) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * z.r * 0.8;
            const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d * 0.86;
            this.spawnBit('drop', x, y - 34, Math.random() < 0.5 ? 0xffc21a : 0xffe680, 0, 0.28, 0.9, Math.PI / 2, 0);
            this.afterMs(() => this.addShape((gg, q) => gg.ellipse(x, y, 4 + 10 * (1 - q), 2 + 5 * (1 - q)).stroke({ width: 2, color: 0xffd040, alpha: q }), 0.3), 280);
          }
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
        case 'firenest': {
          // 불개미 둥지: 흙 둔덕 + 들끓는 붉은 개미 점 + 불씨
          g.circle(z.x, z.y, z.r).fill({ color: 0x8a4a2a, alpha: 0.16 * k }).stroke({ width: 3, color: 0xff5a2a, alpha: 0.45 * k });
          g.ellipse(z.x, z.y, z.r * 0.42, z.r * 0.32).fill({ color: 0xb07a4a, alpha: 0.85 * k }).stroke({ width: 2.5, color: 0x5a3a1a, alpha: k });
          g.ellipse(z.x, z.y - 2, z.r * 0.12, z.r * 0.08).fill({ color: 0x2a1408, alpha: k });
          for (let i = 0; i < 12; i++) {
            const a = T * (i % 2 ? 1.6 : -1.3) + i * 0.9, rr = z.r * (0.3 + 0.55 * ((i * 37) % 10) / 10);
            g.circle(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, 2.6).fill({ color: i % 3 ? 0xc83a1a : 0x2a1408, alpha: k });
          }
          if (Math.random() < 0.3 && this.isNear(z.x, z.y)) this.spawnBit('ember', z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r, 0xff7a2a, 30, 0.5, 0.6, -Math.PI / 2, 0.6);
          break;
        }
        case 'bait': {
          // 들판의 꽃과 똑같이 생긴 꽃(조금 더 진하게): 꽃잎이 살랑인다
          const n = 6, pr = 18;
          const sway = Math.sin(this.time * 2 + z.x) * 0.12;
          for (let q = 0; q < n; q++) {
            const pa = (q / n) * Math.PI * 2 + sway;
            const px = z.x + Math.cos(pa) * pr * 0.8, py = z.y + Math.sin(pa) * pr * 0.8;
            g.ellipse(px, py, pr * 0.7, pr * 0.45).fill({ color: 0xff9ec7, alpha: 0.8 * k });
          }
          g.circle(z.x, z.y, pr * 0.45).fill({ color: 0xffc94a, alpha: 0.9 * k });
          if (mine) g.circle(z.x, z.y, z.r + 10).stroke({ width: 2, color: 0xff9ad8, alpha: 0.35 + 0.2 * Math.sin(this.time * 4) });
          break;
        }
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
          // 작은 벌 열네 마리가 여러 궤도로 빙빙 돌며 공처럼 감싼다 + 열 아지랑이
          const nb = z.r > 80 ? 24 : 14, bs = Math.max(5.5, z.r * 0.08);
          for (let i = 0; i < nb; i++) {
            const lane = i % 3, sp = [6, -5, 7.5][lane], rr = z.r * [0.55, 0.75, 0.95][lane];
            const a = T * sp + (i / nb) * Math.PI * 2;
            const tilt = [0.55, 0.85, 0.7][lane];
            const bx = z.x + Math.cos(a) * rr, by = z.y + Math.sin(a) * rr * tilt;
            this.drawBee(g, bx, by, a + (sp > 0 ? Math.PI / 2 : -Math.PI / 2), bs, k);
          }
          if (Math.random() < 0.3) this.spawnBit('puff', z.x + (Math.random() - 0.5) * z.r, z.y, 0xffb060, 30, 0.6, 0.5, -Math.PI / 2, 0.3);
          if (Math.random() < 0.4) this.spawnParticle(z.x, z.y, Math.random() < 0.5 ? 0xff8a1c : 0xffd23f, 60, 0.4, 0.5);
          break;
        }
      }
    }
    if (haze > 0) {
      // 구름 안: 화면 전체가 누런 독가루로 뿌옇고 가장자리가 더 짙다
      const W = this.app.screen.width, H = this.app.screen.height, T = this.time, hg = this.hazeGfx;
      hg.rect(0, 0, W, H).fill({ color: 0xc8b040, alpha: 0.16 * haze });
      for (let j = 0; j < 4; j++) hg.rect(0, 0, W, H).stroke({ width: 60 + j * 70, color: 0xa89030, alpha: 0.07 * haze });
      const M = Math.max(W, H);
      for (let j = 0; j < 10; j++) {
        const ang = j * 0.628 + T * 0.08, rr = M * (0.16 + 0.04 * Math.sin(T * 0.9 + j));
        hg.circle(W / 2 + Math.cos(ang) * M * 0.55, H / 2 + Math.sin(ang) * M * 0.5, rr).fill({ color: 0xe0cc70, alpha: 0.08 * haze });
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
      if (m.kind === 'ant' || m.kind === 'soldier' || m.kind === 'worker') {
        this.drawAnt(g, m.x, m.y, m.angle, m.kind === 'soldier', m.bite, Math.min(1, m.life / 0.4), m.kind === 'worker' ? 0.85 : 1);
        continue;
      }
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

  /** 개미 한 마리(일개미·군대개미 병정): 머리·가슴·배 세 마디, 다리 여섯, 더듬이, 큰턱. 물 때 큰턱이 쩍 */
  private drawAnt(g: Graphics, x: number, y: number, ang: number, soldier: boolean, bite: number, alpha: number, size = 1) {
    const S = (soldier ? 1.45 : 1) * size;
    const c = Math.cos(ang), sn = Math.sin(ang);
    const P2 = (u: number, v: number): [number, number] => [x + (c * u - sn * v) * S, y + (sn * u + c * v) * S];
    const body = soldier ? 0x8a2a14 : 0x2a1a10, edge = soldier ? 0x3a0e06 : 0x000000;
    const walk = Math.sin(this.time * 26 + x * 0.1);
    // 그림자
    g.ellipse(x + 3, y + 5, 16 * S, 7 * S).fill({ color: 0x000000, alpha: 0.18 * alpha });
    // 다리 여섯(번갈아 걷기)
    for (let l = 0; l < 3; l++)
      for (const sd of [-1, 1]) {
        const ph = (l % 2 ? 1 : -1) * sd * walk * 3;
        const [bx, by] = P2(1 - l * 3, 0), [kx, ky] = P2(3 - l * 4 + ph, sd * 7), [fx, fy] = P2(5 - l * 6 + ph * 1.5, sd * 12);
        g.moveTo(bx, by).lineTo(kx, ky).lineTo(fx, fy).stroke({ width: 1.6 * S, color: edge, alpha });
      }
    // 배 · 가슴 · 머리
    const [ax, ay] = P2(-9, 0), [tx, ty] = P2(0, 0), [hx, hy] = P2(8, 0);
    g.ellipse(ax, ay, 0, 0);
    g.circle(ax, ay, 6.5 * S).fill({ color: body, alpha }).stroke({ width: 1.4, color: edge, alpha });
    g.circle(tx, ty, 3.6 * S).fill({ color: body, alpha }).stroke({ width: 1.2, color: edge, alpha });
    g.circle(hx, hy, (soldier ? 5.4 : 4.4) * S).fill({ color: body, alpha }).stroke({ width: 1.4, color: edge, alpha });
    g.circle(...P2(-10.5, -2.5), 1.8 * S).fill({ color: 0xffffff, alpha: 0.35 * alpha });
    // 더듬이(꺾인)
    for (const sd of [-1, 1]) {
      const [e1x, e1y] = P2(10, sd * 2), [e2x, e2y] = P2(14, sd * 6), [e3x, e3y] = P2(18, sd * 4 + Math.sin(this.time * 9 + sd) * 1.5);
      g.moveTo(e1x, e1y).lineTo(e2x, e2y).lineTo(e3x, e3y).stroke({ width: 1.1 * S, color: edge, alpha });
    }
    // 큰턱: 평소 살짝, 물 때 쩍 벌렸다 닫음
    const open = bite < 0.18 ? Math.sin((bite / 0.18) * Math.PI) : 0.15;
    const jl = soldier ? 7 : 4.5;
    for (const sd of [-1, 1]) {
      const [m0x, m0y] = P2(11, sd * 2), [m1x, m1y] = P2(11 + jl, sd * (2 + open * 6));
      g.moveTo(m0x, m0y).lineTo(m1x, m1y).stroke({ width: (soldier ? 2.4 : 1.6) * S, color: soldier ? 0xffb060 : 0x5a3a20, alpha, cap: 'round' });
    }
    if (soldier) g.circle(hx, hy, 9 * S).stroke({ width: 1.5, color: 0xff7a3a, alpha: 0.35 * alpha });
    if (bite < 0.15) {
      // 문 순간: 큰턱 앞에서 흰 '딱' 별과 작은 피해 조각
      const [px, py] = P2(16 + jl, 0);
      g.star(px, py, 4, 7 * S * (1 - bite / 0.15) + 2, 2.5).fill({ color: 0xffffff, alpha: alpha * (1 - bite / 0.15) });
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
        } else if (a.kind === 'stance') {
          // 반격 자세: 흰 칼날 둘이 천천히 돌며 몸을 지킨다
          const pulse = 0.5 + 0.5 * Math.sin(this.time * 10);
          g.circle(hx, hy, a.r * (0.95 + 0.05 * pulse)).stroke({ width: 3, color: 0xffffff, alpha: (0.4 + 0.3 * pulse) * k });
          for (let j = 0; j < 2; j++) {
            const ang = this.time * 3 + j * Math.PI;
            g.moveTo(hx + Math.cos(ang - 0.5) * a.r, hy + Math.sin(ang - 0.5) * a.r).arc(hx, hy, a.r, ang - 0.5, ang + 0.5).stroke({ width: 7, color: a.col, alpha: 0.9 * k });
          }
        } else if (a.kind === 'bloom') {
          // 꽃밭: 둘레에 꽃잎이 돌며 안쪽으로 빨려 든다
          g.circle(hx, hy, a.r).fill({ color: a.col, alpha: 0.07 * k }).stroke({ width: 3, color: a.col, alpha: 0.5 * k });
          if (Math.random() < 0.9) {
            const ang = Math.random() * Math.PI * 2;
            this.spawnBit('petal', hx + Math.cos(ang) * a.r, hy + Math.sin(ang) * a.r, Math.random() < 0.5 ? a.col : 0xffe0f0, a.r * 0.9, 1, 0.8, ang + Math.PI + 0.6, 0.2);
          }
        } else if (a.kind === 'plates') {
          // 장수 갑옷: 두꺼운 금속판 넷이 몸을 감싸고 천천히 돈다(판마다 리벳·빛이 스친다)
          const R0 = a.r * 0.7, R1 = a.r, spin = this.time * 0.9, h = 0.6;
          g.circle(hx, hy, R1 + 6).fill({ color: 0xb8c0d8, alpha: 0.1 * k });
          for (let j = 0; j < 4; j++) {
            const m = spin + (j * Math.PI) / 2;
            const pts: number[] = [];
            for (let i = 0; i <= 8; i++) pts.push(hx + Math.cos(m - h + (2 * h * i) / 8) * R1, hy + Math.sin(m - h + (2 * h * i) / 8) * R1);
            for (let i = 8; i >= 0; i--) pts.push(hx + Math.cos(m - h + (2 * h * i) / 8) * R0, hy + Math.sin(m - h + (2 * h * i) / 8) * R0);
            g.poly(pts).fill({ color: 0x7a8098, alpha: 0.95 * k }).stroke({ width: 4, color: 0x22263a, alpha: k });
            g.moveTo(hx + Math.cos(m - h + 0.06) * (R1 - 6), hy + Math.sin(m - h + 0.06) * (R1 - 6)).arc(hx, hy, R1 - 6, m - h + 0.06, m + h - 0.06).stroke({ width: 4, color: 0xe8ecff, alpha: 0.85 * k });
            const Rm = (R0 + R1) / 2 + 2;
            for (const off of [-0.38, 0, 0.38]) g.circle(hx + Math.cos(m + off) * Rm, hy + Math.sin(m + off) * Rm, 3.6).fill({ color: 0xd8dce8, alpha: k }).stroke({ width: 1.5, color: 0x22263a, alpha: k });
            const gl = (((this.time * 1.2 + j * 0.3) % 1.8) / 1.8) * 2 - 0.5;
            if (gl >= 0 && gl <= 1) {
              const t = m - h + 2 * h * gl;
              g.moveTo(hx + Math.cos(t) * R0, hy + Math.sin(t) * R0).lineTo(hx + Math.cos(t) * R1, hy + Math.sin(t) * R1).stroke({ width: 7, color: 0xffffff, alpha: 0.75 * k });
            }
          }
        } else if (a.kind === 'legs') {
          // 천 다리 질풍: 긴 다리 잔상이 머리 둘레로 부채처럼 빠르게 돌고, 뒤로 바람 줄
          const spin = this.time * 16;
          for (let j = 0; j < 14; j++) {
            const ang = spin + (j / 14) * Math.PI * 2, wv = Math.sin(this.time * 30 + j) * 0.25;
            const r0 = a.r * 0.3, r1 = a.r * (0.9 + 0.15 * Math.sin(j * 2.3 + this.time * 9));
            g.moveTo(hx + Math.cos(ang) * r0, hy + Math.sin(ang) * r0).quadraticCurveTo(hx + Math.cos(ang + 0.3 + wv) * r1 * 0.7, hy + Math.sin(ang + 0.3 + wv) * r1 * 0.7, hx + Math.cos(ang + 0.5) * r1, hy + Math.sin(ang + 0.5) * r1);
          }
          g.stroke({ width: 3, color: a.col, alpha: 0.75 * k });
          g.circle(hx, hy, a.r).stroke({ width: 2, color: 0xffffff, alpha: 0.25 * k });
          if (Math.random() < 0.8) {
            const ba = s.angle + Math.PI + (Math.random() - 0.5) * 0.8;
            this.spawnBit('hair', hx + Math.cos(ba) * 30, hy + Math.sin(ba) * 30, 0xffffff, 220, 0.3, 1, ba, 0.2);
          }
        } else if (a.kind === 'buzz') {
          // 대진동: 몸 둘레가 물결치며 떨린다
          for (let j = 0; j < 3; j++) {
            const pts: number[] = [];
            const R = a.r * (0.6 + 0.2 * j) + Math.sin(this.time * 25 + j) * 4;
            for (let i = 0; i <= 36; i++) {
              const t = (i / 36) * Math.PI * 2, rr = R + Math.sin(t * 10 + this.time * 50 + j) * 5;
              pts.push(hx + Math.cos(t) * rr, hy + Math.sin(t) * rr);
            }
            g.poly(pts, true).stroke({ width: 3, color: j === 1 ? 0xffffff : a.col, alpha: 0.6 * k });
          }
        } else if (a.kind === 'leaf') {
          // 잎 베기 폭풍: 큰 잎 조각들이 둘레를 휘돌고, 머리 위엔 큰 잎 우산
          const spin = this.time * 4.5;
          g.circle(hx, hy, a.r).fill({ color: a.col, alpha: 0.06 * k }).stroke({ width: 2, color: a.col, alpha: 0.35 * k });
          for (let j = 0; j < 10; j++) {
            const ang = spin + (j / 10) * Math.PI * 2, rr = a.r * (0.7 + 0.25 * ((j * 7) % 4) / 3);
            const lx = hx + Math.cos(ang) * rr, ly = hy + Math.sin(ang) * rr, la = ang + Math.PI / 2 + this.time * 3;
            const L = 22, W = 11, ca = Math.cos(la), sa = Math.sin(la);
            g.moveTo(lx - ca * L, ly - sa * L).quadraticCurveTo(lx - sa * W, ly + ca * W, lx + ca * L, ly + sa * L).quadraticCurveTo(lx + sa * W, ly - ca * W, lx - ca * L, ly - sa * L).fill({ color: j % 2 ? a.col : 0x5aa83a, alpha: 0.95 * k }).stroke({ width: 1.5, color: 0x2a5a1a, alpha: k });
            g.moveTo(lx - ca * L, ly - sa * L).lineTo(lx + ca * L, ly + sa * L).stroke({ width: 1.2, color: 0xd8ffa0, alpha: 0.8 * k });
          }
          if (Math.random() < 0.5) {
            const ang = Math.random() * Math.PI * 2;
            this.spawnBit('leaf', hx + Math.cos(ang) * a.r, hy + Math.sin(ang) * a.r, a.col, 90, 0.6, 0.6, ang + Math.PI / 2, 0.3);
          }
        } else if (a.kind === 'rage') {
          // 분노: 붉은 기운이 맥박치고 김이 오른다
          const pulse = 0.5 + 0.5 * Math.sin(this.time * 14);
          g.circle(hx, hy, a.r * (0.85 + 0.15 * pulse)).fill({ color: a.col, alpha: (0.08 + 0.08 * pulse) * k }).stroke({ width: 4, color: a.col, alpha: (0.4 + 0.4 * pulse) * k });
          if (Math.random() < 0.6) this.spawnBit('puff', hx + (Math.random() - 0.5) * 40, hy + (Math.random() - 0.5) * 40, 0xff8a6a, 50, 0.5, 0.5, -Math.PI / 2, 0.6);
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
        case 'bigsting': {
          // 저격: 뾰족하고 큰 벌침이 총알처럼(긴 흰 꼬리 + 공기 고리)
          const L = 46, W = 9;
          const P2 = (u: number, v: number): [number, number] => [p.x + c * u - s * v, p.y + s * u + c * v];
          g.moveTo(p.x - c * 160, p.y - s * 160).lineTo(p.x, p.y).stroke({ width: 16, color: 0xffb020, alpha: 0.18 });
          g.moveTo(p.x - c * 90, p.y - s * 90).lineTo(p.x, p.y).stroke({ width: 6, color: 0xffffff, alpha: 0.7 });
          const pts = [P2(L * 0.55, 0), P2(-L * 0.2, -W), P2(-L * 0.45, -W * 0.6), P2(-L * 0.45, W * 0.6), P2(-L * 0.2, W)].flat();
          g.poly(pts).fill(0x2a1a0a).stroke({ width: 2, color: 0x000000 });
          const band = [P2(-L * 0.05, -W * 0.85), P2(-L * 0.18, -W * 0.95), P2(-L * 0.18, W * 0.95), P2(-L * 0.05, W * 0.85)].flat();
          g.poly(band).fill(0xffb020);
          const [tx, ty] = P2(L * 0.55, 0);
          g.circle(tx, ty, 3.5).fill(0xffffff);
          if (Math.random() < 0.6) {
            const [rx, ry] = P2(-L * 0.6, 0);
            this.addShape((gg, q) => gg.ellipse(rx, ry, 4 + 10 * (1 - q), 10 + 14 * (1 - q)).stroke({ width: 2, color: 0xffffff, alpha: 0.6 * q }), 0.18);
          }
          break;
        }
        case 'sting': {
          const big = 1;
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
        case 'glob': {
          // 빛 점액 덩이: 노랗게 빛나며 출렁인다
          const w = 1 + 0.15 * Math.sin(this.time * 30);
          g.circle(p.x, p.y, 18).fill({ color: 0xf6e86a, alpha: 0.25 });
          g.ellipse(p.x, p.y, 11 * w, 9 / w).fill(0xf6e86a).stroke({ width: 2, color: 0x8a6a1a });
          g.circle(p.x - 3, p.y - 3, 3).fill({ color: 0xffffff, alpha: 0.8 });
          g.moveTo(p.x - c * 34, p.y - s * 34).lineTo(p.x, p.y).stroke({ width: 7, color: 0xf6e86a, alpha: 0.35 });
          if (Math.random() < 0.4) this.spawnBit('drop', p.x, p.y, 0xf6e86a, 30, 0.4, 0.5, Math.PI / 2, 0.5);
          break;
        }
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
  /** 몸을 똬리로 말거나(coil) 앞쪽으로 적을 감은(wrap) 땅 위 마디 자리 */
  private coiled(s: FrameSnake, P: Pose): number[] {
    const src = s.segs, n = src.length / 2;
    const out = Array.from(src);
    if (n < 3) return out;
    let sp = 0;
    for (let i = 1; i < n; i++) sp += Math.hypot(src[i * 2] - src[i * 2 - 2], src[i * 2 + 1] - src[i * 2 - 1]);
    sp = Math.max(4, sp / (n - 1));
    const hx = src[0], hy = src[1];
    if (P.coil > 0.01) {
      // 머리를 가운데 두고 바깥으로 감기는 나선(아르키메데스): 고리 사이 = 몸 두께
      const gap = s.r * 2.1, r0 = s.r * 1.1;
      const cx = hx + Math.cos(s.angle + Math.PI / 2) * r0, cy = hy + Math.sin(s.angle + Math.PI / 2) * r0;
      let th = 0;
      const phi0 = s.angle - Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const rr = r0 + (gap * th) / (Math.PI * 2);
        const x = cx + Math.cos(phi0 - th) * rr, y = cy + Math.sin(phi0 - th) * rr;
        out[i * 2] = src[i * 2] + (x - src[i * 2]) * P.coil;
        out[i * 2 + 1] = src[i * 2 + 1] + (y - src[i * 2 + 1]) * P.coil;
        th += sp / rr;
      }
    } else {
      // 휘감기: 앞쪽 마디들이 적 둘레를 1바퀴 반 조여 감고, 나머지는 거기서 원래 자리로 이어진다
      const c = this.wrapAt.get(s.id);
      if (!c) return out;
      const R = s.r * 2.2 + 18;
      let ang = Math.atan2(hy - c.y, hx - c.x);
      const turns = Math.PI * 3;
      let th = 0, m = 0;
      const tmp: number[] = [];
      while (th < turns && m < n) {
        const rr = R * (1 - 0.15 * (th / turns));
        tmp.push(c.x + Math.cos(ang) * rr, c.y + Math.sin(ang) * rr);
        ang -= sp / rr;
        th += sp / rr;
        m++;
      }
      const ex = tmp[(m - 1) * 2], ey = tmp[(m - 1) * 2 + 1];
      for (let i = 0; i < n; i++) {
        let x: number, y: number;
        if (i < m) ((x = tmp[i * 2]), (y = tmp[i * 2 + 1]));
        else {
          // 감은 끝에서 원래 몸 자리로 부드럽게
          const f = Math.max(0, 1 - (i - m) / 10);
          const j = Math.min(n - 1, i - m + 1);
          const bx = src[j * 2] - src[2] + ex, by = src[j * 2 + 1] - src[3] + ey;
          x = bx * f + src[i * 2] * (1 - f);
          y = by * f + src[i * 2 + 1] * (1 - f);
        }
        out[i * 2] = src[i * 2] + (x - src[i * 2]) * P.wrap;
        out[i * 2 + 1] = src[i * 2 + 1] + (y - src[i * 2 + 1]) * P.wrap;
      }
    }
    return out;
  }

  private posed(s: FrameSnake, P: Pose, zOf: (i: number) => number, base?: ArrayLike<number>): number[] {
    const src = base ?? s.segs, n = src.length / 2;
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
    // 똬리·휘감기는 땅 위 모양 자체가 바뀌므로 그림자도 함께 바뀐다
    const ground = P && (P.coil > 0.01 || P.wrap > 0.01) ? this.coiled(s, P) : s.segs;
    const rearN = P && P.headZ > 40 ? 7 : 4;
    const zOf = (i: number) => (P ? P.z + P.headZ * Math.max(0, 1 - i / rearN) : 0);
    const segs = P ? this.posed(s, P, zOf, ground) : s.segs;
    this.lastSegs.set(s.id, segs);
    const hzOf = (i: number) => 1 + Math.min(zOf(i), 120) / 140 + Math.max(0, zOf(i) - 120) / 400; // 높이 원근: 높을수록 커 보인다(아주 높으면 덜)
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

    // 위장: 몸은 사라지고 잎 더미만 보인다
    const leafCamo = s.hidden > 0 && this.motion.has(s.id, 'camo');
    const fade = leafCamo ? (s.isPlayer ? 0.12 : 0) : s.hidden > 0 ? (s.isPlayer ? 0.45 : s.hidden >= 1 ? 0.08 : 0.2) : s.sneaking ? 0.8 : 1;
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
      sh.alpha = (1 - fly * 0.4) * Math.max(0.3, 1 - zi / 130) * (leafCamo ? 0.1 : 1);
      if (zi > 4) {
        // 떠 있으면 땅에 짙은 그림자를 한 겹 더(높이가 읽히게)
        const sh2 = this.shadowPool.take(this.tex.shadow);
        sh2.position.set(sh.x, sh.y);
        sh2.scale.set(sh.scale.x * 0.85);
        sh2.alpha = Math.min(0.9, 0.35 + zi / 120);
      }
      if (glowA > 0 && !leafCamo) {
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
        if (P && P.legWhip > 0) {
          // 긴 다리 채찍: 앞쪽 다리일수록 길게 늘어나 물결치며 앞으로 휘둘린다
          const fall = Math.max(0, 1 - i / Math.max(4, n * 0.7));
          const w = P.legWhip * fall;
          leg.scale.set(leg.scale.x * (1 + 1.8 * w), leg.scale.y * (1 + 0.6 * w));
          leg.rotation = dirA + Math.sin(P.legWave - i * 0.6) * 0.9 * w + swing * (1 - w);
        }
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
      const wbB = P ? P.wingBig : 0, foldB = P ? P.wingFold : 0;
      // 크게 펼칠 때는 날갯짓을 멈추고 활짝, 접을 때는 꽉 오므린다
      const open = (0.45 + 0.55 * Math.abs(Math.cos(ph))) * (1 - Math.min(1, wbB)) + Math.min(1, wbB);
      const big = 1 + 0.75 * wbB;
      g.wings.forEach((w, k) => {
        const side = k === 0 ? 1 : -1;
        w.position.set(wx, wy);
        w.rotation = s.angle + side * (Math.PI / 2 + 0.12);
        w.scale.set(scale * 1.6 * open * lift * big * (1 - 0.8 * foldB), scale * 1.6 * side * lift * big);
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
        const fold = P ? P.wingFold : 0;
        const wb = P ? P.wingBig : 0;
        // 위협: 날개를 몸 옆으로 거의 직각까지 활짝, 두 배 가까이 크게(부르르 떨며)
        const shiver = wb > 0 ? Math.sin(this.time * 70 + k) * 0.06 * wb : 0;
        w.rotation = back + side * ((0.45 + pair * 0.35 + flap * (1 - wb) + spreadW * 0.55) * (1 - 0.8 * fold) + 0.08 * fold + wb * (1.05 + pair * 0.5) + shiver);
        w.scale.set(scale * (1.35 - pair * 0.2) * lift * (1 + 0.25 * spreadW + 0.35 * fold + 1.1 * wb) * hzOf(1), scale * 0.95 * lift * hzOf(1) * (1 - 0.3 * fold + 2.4 * wb));
        if (look.wingTint === undefined) w.tint = wb > 0.05 ? mix(0xffffff, mix(look.body, 0xffffff, 0.45), Math.min(1, wb)) : 0xffffff;
        // 날개 끝 바람 줄기: 펼쳐 치거나 접어 내리꽂을 때 날개 끝에서 흰 선이 끌린다
        if (P && (fold > 0.5 || (spreadW > 0.5 && P.ghost > 0)) && pair === 0 && this.isNear(wx, wy)) {
          const L = 64 * w.scale.x * 0.95;
          const tx = wx + Math.cos(w.rotation) * L, ty = wy + Math.sin(w.rotation) * L;
          const bx = Math.cos(s.angle + Math.PI) * 38, by = Math.sin(s.angle + Math.PI) * 38;
          this.addShape((gg, q) => gg.moveTo(tx, ty).lineTo(tx + bx * q, ty + by * q).stroke({ width: 3 * q + 0.5, color: 0xffffff, alpha: 0.8 * q, cap: 'round' }), 0.16);
        }
        w.alpha = 0.75 + 0.2 * wb;
        if (wb > 0.3 && pair === 0 && look.shape === 'mantis' && this.isNear(wx, wy)) {
          // 활짝 편 날개(넓은 부채꼴 막 + 날개맥) 위에 눈알 무늬(위협 무늬)
          const L = 64 * w.scale.x * 0.55, W2 = 18 * w.scale.y;
          const ex = wx + Math.cos(w.rotation) * L, ey = wy + Math.sin(w.rotation) * L;
          const st2 = this.statusGfx;
          const LL = 64 * w.scale.x * 0.95, WW = LL * 0.42 * wb;
          const ra = w.rotation, cr = Math.cos(ra), sr = Math.sin(ra);
          const P2 = (u: number, v: number): [number, number] => [wx + cr * u - sr * v, wy + sr * u + cr * v];
          const [t1x, t1y] = P2(LL, 0), [q1x, q1y] = P2(LL * 0.55, -WW), [q2x, q2y] = P2(LL * 0.55, WW), [r1x, r1y] = P2(LL * 0.15, 0);
          const wcol = mix(look.body, 0xffffff, 0.55);
          st2.moveTo(r1x, r1y).quadraticCurveTo(q1x, q1y, t1x, t1y).quadraticCurveTo(q2x, q2y, r1x, r1y).fill({ color: wcol, alpha: 0.6 * wb }).stroke({ width: 2.5, color: INK, alpha: 0.8 * wb });
          for (const v of [-0.5, 0, 0.5]) {
            const [vx, vy] = P2(LL * 0.85, WW * v);
            st2.moveTo(r1x, r1y).lineTo(vx, vy).stroke({ width: 1.2, color: mix(wcol, 0x000000, 0.4), alpha: 0.7 * wb });
          }
          st2.circle(ex, ey, W2 * 0.75 * wb).fill({ color: 0xb88aff, alpha: 0.85 * wb }).stroke({ width: 2.5, color: INK, alpha: wb });
          st2.circle(ex, ey, W2 * 0.4 * wb).fill({ color: 0x1b1430, alpha: wb });
          st2.circle(ex - W2 * 0.12, ey - W2 * 0.14, W2 * 0.12 * wb).fill({ color: 0xffffff, alpha: wb });
        }
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
    g.headBase.scale.set(hk, hk * (P ? P.width : 1));
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
      else if (part.kind === 'forcipule' && P && (P.jaw || P.horn)) rot += P.jaw;
      if (part.kind === 'mandible' || part.kind === 'fang' || part.kind === 'forcipule') {
        rot += Math.sin(ph * 5) * 0.08;
        if (bite > 0) rot += bite > 0.15 ? 0.45 : -0.3; // 크게 벌렸다가 꽉 문다
        if (strike > 0 && !(P && P.jaw)) rot += strike > 0.25 ? 0.5 : -0.35;
        if (P && part.kind === 'mandible') rot += P.jaw;
      } else if (part.kind === 'sickle') {
        rot += Math.sin(ph * 2) * 0.05;
        const t = strike || bite;
        if (t > 0 && !(P && (P.armL || P.armR))) rot -= 1.1 * Math.sin(Math.min(1, t / 0.25) * Math.PI);
        if (P) rot += side > 0 ? P.armR : P.armL;
      }
      sp.rotation = s.angle + side * rot;
      // 뿔·큰턱·낫을 크게: 돌진·가위·베기 때 실제 모양이 커진다
      const big = P ? (part.kind === 'mandible' || part.kind === 'forcipule' || part.kind === 'fang' ? 1 + 0.65 * P.horn : part.kind === 'sickle' ? 1 + 1.1 * P.armScale : 1) : 1;
      sp.scale.set(hk * big, hk * side * big);
      if (part.kind === 'sickle' && P && P.armScale > 0.25 && this.isNear(hx, hy)) {
        // 낫 잔상: 휘두르는 궤적을 따라 낫 모양이 부채꼴로 남는다
        const gh = new Sprite(part.tex);
        gh.anchor.set(part.ax, part.ay);
        gh.position.set(hx + sp.x, hy + sp.y);
        gh.rotation = sp.rotation;
        gh.scale.set(sp.scale.x, sp.scale.y);
        gh.tint = mix(lcol, 0xffffff, 0.55);
        gh.alpha = 0.55 * Math.min(1, P.armScale);
        this.ghostLayer.addChild(gh);
        this.ghosts.push({ s: gh, life: 0.14, max: 0.14 });
      }
      sp.alpha = (blink ? 0.45 : 1) * fade;
    }
    if (g.hornSp && g.kit.horn) {
      const hb = P ? P.horn : 0;
      g.hornSp.visible = hb > 0.02;
      if (hb > 0.02) {
        const lx = g.kit.horn.x * headR;
        g.hornSp.position.set(ca * lx, sa * lx);
        g.hornSp.rotation = s.angle;
        const k2 = hk * (1 + 0.85 * hb);
        g.hornSp.scale.set(k2, k2 * (P ? P.width : 1));
        g.hornSp.alpha = fade;
      }
    }
    for (const w of g.wings) w.alpha = (0.75 + (P ? 0.2 * P.wingBig : 0)) * fade;
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

    // 상태 아이콘: 이름표 위에 한 줄. 이상(빨간 테) 먼저, 강화(초록 테) 다음. 지속시간만큼 어두운 시계 덮개가 걷힌다
    if (s.st && s.st.length && this.isNear(hx, hy) && !(s.hidden > 0 && !s.isPlayer)) {
      const items: { i: number; t: number }[] = [];
      for (let q = 0; q < s.st.length; q += 2) items.push({ i: s.st[q], t: s.st[q + 1] });
      items.sort((a, b) => (STATUSES[a.i].kind === STATUSES[b.i].kind ? 0 : STATUSES[a.i].kind === 'debuff' ? -1 : 1));
      const show = items.slice(0, 6);
      const sz = 17 * iz, gap = 3 * iz;
      const rowW = show.length * sz + (show.length - 1) * gap;
      const iy = barY - (this.opts.labels ? 20 * iz : 4 * iz) - sz / 2 - 2 * iz;
      show.forEach((it, k) => {
        const d = STATUSES[it.i];
        const cx = hx - rowW / 2 + sz / 2 + k * (sz + gap);
        const sp = this.iconPool.take(this.tex['st_' + d.id]);
        sp.position.set(cx, iy);
        sp.scale.set(sz / 64);
        // 시계 덮개: 남은 비율만큼 밝게 남기고, 지난 만큼 어둡게(12시부터 시계 방향)
        const key = s.id + ':' + d.id;
        const rec = this.stMax.get(key);
        if (it.t === -1) {
          this.stMax.delete(key);
          sp.alpha = 0.85 + 0.15 * Math.sin(this.time * 6);
          return;
        }
        let max = it.t;
        if (rec && it.t <= rec.last + 0.06) max = rec.max;
        this.stMax.set(key, { max, last: it.t });
        const frac = Math.max(0, Math.min(1, 1 - it.t / Math.max(0.05, max)));
        if (frac > 0.01) {
          const R = sz / 2 + 0.5 * iz;
          const a0 = -Math.PI / 2;
          this.iconGfx.moveTo(cx, iy).arc(cx, iy, R, a0, a0 + frac * Math.PI * 2).lineTo(cx, iy).fill({ color: 0x000000, alpha: 0.55 });
        }
        // 곧 끝남: 깜빡
        if (it.t < 0.5) sp.alpha = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 14));
      });
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
    // 겹눈에 잡힌 적: 머리에 벌집 모양 조준 고리
    for (const [cid, until] of this.eyesT) {
      if (cid === s.id || until <= this.time) continue;
      const c = this.lastHead.get(cid);
      if (!c || Math.hypot(c[0] - hx, c[1] - hy) > 420) continue;
      const rr = headR * 1.9 + 4 * Math.sin(this.time * 8);
      st.regularPoly(hx, hy, rr, 6, this.time * 0.8).stroke({ width: 3, color: 0x7ae0ff, alpha: 0.85 });
      st.regularPoly(hx, hy, rr * 0.55, 6, -this.time * 1.2).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
      for (let q = 0; q < 6; q++) {
        const aa = this.time * 0.8 + (q / 6) * Math.PI * 2;
        st.moveTo(hx + Math.cos(aa) * rr, hy + Math.sin(aa) * rr).lineTo(hx + Math.cos(aa) * rr * 1.3, hy + Math.sin(aa) * rr * 1.3).stroke({ width: 2.5, color: 0x7ae0ff, alpha: 0.85 });
      }
    }
    // 몸 동작에 딸린 그림: 버티기 방패, 돌진·급강하 흙먼지·바람
    const deadLeaf = this.motion.has(s.id, 'playdead');
    if (leafCamo || deadLeaf) {
      if (this.isNear(hx, hy)) this.leafCover(s, segs, n, headR, look, leafCamo ? 'camo' : 'dead');
    } else if (this.leafOn.has(s.id)) {
      // 잎이 걷히는 순간: 확 흩어진다
      const pal = this.leafOn.get(s.id)!;
      this.leafOn.delete(s.id);
      for (let i = 0; i < n; i += 2)
        for (let j = 0; j < 2; j++) this.spawnBit('leaf', segs[i * 2], segs[i * 2 + 1], pal[(i + j) % pal.length], 90 + Math.random() * 120, 0.6, 0.8);
    }
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
        // 머리 앞에 세운 껍질 방패(진짜 방패 모양): 밀어붙일 때마다 앞으로 나가며 빛난다
        const push = Math.max(0, P.lean - 4) / 12;
        const k = headR * (1.45 + 0.25 * push);
        const off = headR * (0.55 + 0.55 * push);
        // 방패 윤곽(앞 = +x, 옆 = ±y): 앞이 볼록한 방패
        const shape: [number, number][] = [[0.15, -1.25], [0.55, -1.15], [0.85, -0.7], [0.95, 0], [0.85, 0.7], [0.55, 1.15], [0.15, 1.25], [0.3, 0.6], [0.35, 0], [0.3, -0.6]];
        const pts: number[] = [];
        for (const [fx, fy] of shape) {
          const lx = off + fx * k, ly = fy * k;
          pts.push(hx + ca * lx - sa * ly, hy + sa * lx + ca * ly);
        }
        const face = mix(lcol, 0xfff0d0, 0.35);
        st.poly(pts).fill({ color: face, alpha: 0.82 }).stroke({ width: 3.5, color: INK, alpha: 0.9 });
        // 가운데 등줄과 빛 반사, 테두리 징
        const mx = (lx: number, ly: number) => [hx + ca * lx - sa * ly, hy + sa * lx + ca * ly];
        const [a1, b1] = mx(off + 0.45 * k, -0.9 * k), [a2, b2] = mx(off + 0.62 * k, 0), [a3, b3] = mx(off + 0.45 * k, 0.9 * k);
        st.moveTo(a1, b1).lineTo(a2, b2).lineTo(a3, b3).stroke({ width: 2.5, color: mix(face, 0x000000, 0.35), alpha: 0.8 });
        const [g1, g2] = mx(off + 0.62 * k, -0.45 * k);
        st.circle(g1, g2, k * 0.12).fill({ color: 0xffffff, alpha: 0.35 + 0.5 * push });
        for (const fy of [-0.95, 0.95]) {
          const [rx, ry] = mx(off + 0.45 * k, fy * k);
          st.circle(rx, ry, k * 0.07).fill(0x4a3a28);
        }
        if (push > 0.6) st.poly(pts).stroke({ width: 6, color: 0xffffff, alpha: (push - 0.6) * 1.5 });
        if (Math.random() < 0.6) {
          // 뒷발로 버티며 흙이 뒤로 밀려난다
          const ti = Math.min(n - 1, 3);
          this.spawnBit('sand', ground[ti * 2], ground[ti * 2 + 1], 0xc8a878, 60 + Math.random() * 60, 0.4, 1, s.angle + Math.PI + (Math.random() - 0.5), 0.6);
        }
      }
      if (P.horn > 0.05 && (look.horn || look.mandible)) {
        // 뿔 강조: 커진 뿔 끝에 번쩍이는 별 + 돌진 중에는 뿔 끝에서 뒤로 불꽃 줄
        const charging = this.motion.has(s.id, 'charge');
        const len = look.horn ? (look.horn === 'herc' ? 104 : look.horn === 'cauc' ? 92 : 82) / HR : 0.75 + (look.mandible?.size ?? 60) / 70;
        const L = headR * (0.15 + len * (1 + 0.85 * P.horn));
        const tx = hx + ca * L, ty = hy + sa * L;
        const tw = 0.6 + 0.4 * Math.sin(this.time * 30);
        st.star(tx, ty, 4, headR * 0.35 * P.horn * tw, headR * 0.1).fill({ color: 0xfff6c8, alpha: 0.85 * Math.min(1, P.horn) });
        if (charging && Math.random() < 0.9) {
          this.addShape((gg, q) => gg.moveTo(tx, ty).lineTo(tx - ca * 70 * q, ty - sa * 70 * q).stroke({ width: 4 * q + 1, color: 0xffe080, alpha: q, cap: 'round' }), 0.12);
          this.spawnBit('ember', tx, ty, 0xffd060, 120 + Math.random() * 120, 0.25, 0.6, s.angle + Math.PI, 1.2);
        }
      }
      if (this.motion.has(s.id, 'leafshield')) {
        // 잎꾼개미 잎 방패: 머리 앞에 큰 초록 잎을 세워 든다(잎맥이 빛남)
        const k = headR * 1.7;
        const off = headR * 0.7;
        const M = (u: number, v: number): [number, number] => [hx + ca * (off + u * k) - sa * v * k, hy + sa * (off + u * k) + ca * v * k];
        const [t1x, t1y] = M(0.75, 0), [b1x, b1y] = M(0.05, 0), [c1x, c1y] = M(0.45, -1.25), [c2x, c2y] = M(0.45, 1.25);
        const [l1x, l1y] = M(0.25, -1.0), [l2x, l2y] = M(0.25, 1.0);
        const leafC = 0x6ac83a;
        st.moveTo(l1x, l1y).quadraticCurveTo(c1x, c1y, t1x, t1y).quadraticCurveTo(c2x, c2y, l2x, l2y).quadraticCurveTo(b1x, b1y, l1x, l1y).fill({ color: leafC, alpha: 0.92 }).stroke({ width: 3, color: INK, alpha: 0.85 });
        const glow = 0.5 + 0.5 * Math.sin(this.time * 8);
        st.moveTo(b1x, b1y).lineTo(t1x, t1y).stroke({ width: 2.5, color: 0xd8ffa0, alpha: 0.6 + 0.4 * glow });
        for (const v of [-0.6, -0.3, 0.3, 0.6]) {
          const [vx, vy] = M(0.15 + Math.abs(v) * 0.1, 0), [wx2, wy2] = M(0.45, v * 1.1);
          st.moveTo(vx, vy).lineTo(wx2, wy2).stroke({ width: 1.5, color: 0xd8ffa0, alpha: 0.5 + 0.4 * glow });
        }
      }
      if (this.motion.has(s.id, 'dig') && Math.random() < 0.9) {
        // 땅속으로 파고드는 중: 머리 자리에 흙이 솟고 흙더미가 따라 움직인다
        this.spawnBit('sand', ground[0], ground[1], 0x8a6a4a, 60 + Math.random() * 80, 0.45, 1, -Math.PI / 2, 2.4);
        if (Math.random() < 0.5) this.spawnBit('puff', ground[0], ground[1], DUST, 20, 0.6, 0.7, -Math.PI / 2, 1);
        st.ellipse(ground[0], ground[1], headR * 1.3, headR * 0.8).fill({ color: 0x6a4a2a, alpha: 0.55 });
      }
      if (this.motion.has(s.id, 'venom') && Math.random() < 0.35) {
        // 독니: 송곳니 끝에서 붉은 독이 뚝뚝
        for (const sd of [-1, 1]) this.spawnBit('drop', hx + ca * headR * 1.1 - sa * headR * 0.35 * sd, hy + sa * headR * 1.1 + ca * headR * 0.35 * sd, 0xff3a4a, 20, 0.5, 0.6, Math.PI / 2, 0.2);
      }
      if ((this.motion.has(s.id, 'windup:fang') || this.motion.has(s.id, 'fang')) && Math.random() < 0.8) {
        // 독턱 끝에서 초록 독방울과 독 김
        for (const sd of [-1, 1]) {
          const fx2 = hx + ca * headR * 1.2 - sa * headR * 0.4 * sd, fy2 = hy + sa * headR * 1.2 + ca * headR * 0.4 * sd;
          this.spawnBit('drop', fx2, fy2, 0x7aff4a, 30, 0.45, 0.55, Math.PI / 2, 0.6);
          if (Math.random() < 0.4) this.spawnBit('puff', fx2, fy2, 0x8ae86a, 15, 0.7, 0.55, -Math.PI / 2, 0.6);
        }
      }
      if (this.motion.has(s.id, 'stampede') && Math.random() < 0.9) {
        // 백 개의 다리가 땅을 긁은 자국이 몸을 따라 점점이 남는다
        for (let q = 0; q < 3; q++) {
          const i = 1 + Math.floor(Math.random() * Math.max(1, n - 1));
          const x = ground[i * 2], y = ground[i * 2 + 1];
          const j = Math.max(0, i - 1);
          const dir = Math.atan2(ground[j * 2 + 1] - y, ground[j * 2] - x);
          for (const sd of [-1, 1]) {
            const px = x - Math.sin(dir) * headR * 1.1 * sd, py = y + Math.cos(dir) * headR * 1.1 * sd;
            this.addShape((gg, qq) => gg.moveTo(px, py).lineTo(px - Math.cos(dir) * 8, py - Math.sin(dir) * 8).stroke({ width: 2.5, color: 0x5a3a20, alpha: 0.7 * qq }), 0.9);
          }
        }
      }
      const eyesUntil = this.eyesT.get(s.id) ?? 0;
      if (eyesUntil > this.time) {
        // 겹눈: 양쪽 큰 눈이 벌집 무늬로 빛난다
        const kk = Math.min(1, (eyesUntil - this.time) * 3);
        for (const sd of [-1, 1]) {
          const ex = hx + ca * headR * 0.15 - sa * headR * 0.55 * sd, ey = hy + sa * headR * 0.15 + ca * headR * 0.55 * sd;
          const er = headR * 0.55;
          st.circle(ex, ey, er * 1.25).fill({ color: 0x7ae0ff, alpha: 0.25 * kk });
          for (let q = 0; q < 7; q++) {
            const aa = (q / 6) * Math.PI * 2;
            const cx = q === 6 ? ex : ex + Math.cos(aa) * er * 0.55, cy = q === 6 ? ey : ey + Math.sin(aa) * er * 0.55;
            st.regularPoly(cx, cy, er * 0.3, 6, Math.PI / 6).fill({ color: 0xd0f8ff, alpha: (0.5 + 0.4 * Math.sin(this.time * 12 + q)) * kk }).stroke({ width: 1.5, color: 0x2a8ac8, alpha: kk });
          }
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
    const cg = this.crackGfx;
    cg.clear();
    for (let i = this.grounds.length - 1; i >= 0; i--) {
      const sh = this.grounds[i];
      sh.life -= dt;
      if (sh.life <= 0) {
        this.grounds.splice(i, 1);
        continue;
      }
      sh.draw(cg, sh.life / sh.max);
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

/** 상태 아이콘 그림(64칸 텍스처 가운데 cx, cy 기준, 반지름 약 20 안) */
function drawStatusGlyph(g: Graphics, id: string, cx: number, cy: number) {
  const ink = { width: 3, color: INK, join: 'round' as const, cap: 'round' as const };
  switch (id) {
    case 'stun':
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        g.star(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10, 5, 8, 3.5).fill(0xffffff).stroke({ width: 1.8, color: INK });
      }
      break;
    case 'root':
      for (const sd of [-1, 0, 1]) g.moveTo(cx + sd * 9, cy - 16).bezierCurveTo(cx + sd * 9 + 8, cy - 4, cx + sd * 9 - 8, cy + 4, cx + sd * 9, cy + 16).stroke({ width: 4, color: 0x2a4a1a, cap: 'round' });
      g.moveTo(cx - 18, cy + 16).lineTo(cx + 18, cy + 16).stroke({ width: 4, color: 0x4a2a10, cap: 'round' });
      break;
    case 'slow':
      // 달팽이
      g.circle(cx + 2, cy - 2, 12).fill(0xffffff).stroke(ink);
      g.moveTo(cx + 2, cy - 2).arc(cx + 2, cy - 2, 6, 0, Math.PI * 1.5).stroke({ width: 2.5, color: INK });
      g.moveTo(cx - 18, cy + 12).lineTo(cx + 16, cy + 12).quadraticCurveTo(cx + 22, cy + 6, cx + 18, cy).stroke(ink);
      g.moveTo(cx + 18, cy).lineTo(cx + 20, cy - 8).stroke({ width: 2, color: INK });
      break;
    case 'silence':
      g.roundRect(cx - 17, cy - 14, 34, 24, 8).fill(0xffffff).stroke(ink);
      g.moveTo(cx - 6, cy + 10).lineTo(cx - 10, cy + 18).lineTo(cx + 2, cy + 10).fill(0xffffff);
      g.moveTo(cx - 7, cy - 8).lineTo(cx + 7, cy + 4).moveTo(cx + 7, cy - 8).lineTo(cx - 7, cy + 4).stroke({ width: 4, color: 0xe8402a, cap: 'round' });
      break;
    case 'fear':
      // 겁먹은 얼굴: 파르르 떨리는 입
      g.circle(cx, cy, 15).fill(0xffffff).stroke(ink);
      g.circle(cx - 6, cy - 4, 3).fill(INK).circle(cx + 6, cy - 4, 3).fill(INK);
      g.moveTo(cx - 8, cy + 7).lineTo(cx - 4, cy + 4).lineTo(cx, cy + 7).lineTo(cx + 4, cy + 4).lineTo(cx + 8, cy + 7).stroke({ width: 2.5, color: INK });
      g.moveTo(cx + 15, cy - 14).lineTo(cx + 18, cy - 6).stroke({ width: 2.5, color: 0x5ab0ff, cap: 'round' });
      break;
    case 'blind':
      g.moveTo(cx - 18, cy).quadraticCurveTo(cx, cy - 16, cx + 18, cy).quadraticCurveTo(cx, cy + 16, cx - 18, cy).fill(0xffffff).stroke(ink);
      g.circle(cx, cy, 6).fill(INK);
      g.moveTo(cx - 16, cy + 14).lineTo(cx + 16, cy - 14).stroke({ width: 4, color: 0xe8402a, cap: 'round' });
      break;
    case 'confuse':
      g.moveTo(cx, cy);
      for (let k = 0; k <= 40; k++) {
        const t = k / 40, a = t * Math.PI * 4, r = 2 + t * 15;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.stroke({ width: 3.5, color: INK, cap: 'round' });
      break;
    case 'charm':
      g.moveTo(cx, cy + 15).bezierCurveTo(cx - 22, cy, cx - 12, cy - 18, cx, cy - 7).bezierCurveTo(cx + 12, cy - 18, cx + 22, cy, cx, cy + 15).fill(0xffffff).stroke(ink);
      break;
    case 'mark':
      g.circle(cx, cy, 14).stroke({ width: 3.5, color: INK }).circle(cx, cy, 5).fill(INK);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) g.moveTo(cx + dx * 9, cy + dy * 9).lineTo(cx + dx * 19, cy + dy * 19).stroke({ width: 3.5, color: INK, cap: 'round' });
      break;
    case 'poison':
      g.moveTo(cx, cy - 17).quadraticCurveTo(cx + 15, cy + 2, cx, cy + 15).quadraticCurveTo(cx - 15, cy + 2, cx, cy - 17).fill(0x2a8a1a).stroke(ink);
      g.circle(cx - 4, cy + 3, 3).fill({ color: 0xffffff, alpha: 0.7 });
      break;
    case 'itch':
      for (let k = 0; k < 5; k++) {
        const x = cx - 14 + k * 7;
        g.moveTo(x, cy + 14).lineTo(x + (k % 2 ? 4 : -4), cy - 12).stroke({ width: 3, color: 0xfff6d0, cap: 'round' });
        g.circle(x + (k % 2 ? 4 : -4), cy - 13, 2.5).fill(0x3ac83a);
      }
      g.moveTo(cx - 18, cy + 14).lineTo(cx + 18, cy + 14).stroke({ width: 3, color: INK, cap: 'round' });
      break;
    case 'grabbed':
      for (const sd of [-1, 1]) g.moveTo(cx + sd * 16, cy + 14).quadraticCurveTo(cx + sd * 18, cy - 14, cx - sd * 2, cy - 12).stroke({ width: 6, color: INK, cap: 'round' });
      g.circle(cx, cy + 4, 6).fill(0xffffff).stroke({ width: 2, color: INK });
      break;
    case 'captured':
      for (let k = -2; k <= 2; k++) {
        g.moveTo(cx + k * 7, cy - 16).lineTo(cx + k * 7, cy + 16);
        g.moveTo(cx - 16, cy + k * 7).lineTo(cx + 16, cy + k * 7);
      }
      g.stroke({ width: 2.5, color: INK });
      break;
    case 'invuln':
      g.moveTo(cx, cy - 17).lineTo(cx + 15, cy - 10).lineTo(cx + 13, cy + 6).lineTo(cx, cy + 17).lineTo(cx - 13, cy + 6).lineTo(cx - 15, cy - 10).closePath().fill(0xffffff).stroke(ink);
      g.star(cx, cy, 5, 8, 3.5).fill(0xffc21a);
      break;
    case 'shield':
      g.moveTo(cx, cy - 17).lineTo(cx + 15, cy - 10).lineTo(cx + 13, cy + 6).lineTo(cx, cy + 17).lineTo(cx - 13, cy + 6).lineTo(cx - 15, cy - 10).closePath().fill(0xffffff).stroke(ink);
      g.moveTo(cx, cy - 12).lineTo(cx, cy + 12).stroke({ width: 3, color: 0x5aa8e8 });
      break;
    case 'bitter':
      g.moveTo(cx, cy - 16).quadraticCurveTo(cx + 13, cy + 2, cx, cy + 13).quadraticCurveTo(cx - 13, cy + 2, cx, cy - 16).fill(0xffffff).stroke(ink);
      g.moveTo(cx - 16, cy - 4).arc(cx, cy, 16, Math.PI, Math.PI * 1.5).stroke({ width: 3, color: INK, cap: 'round' });
      g.moveTo(cx - 2, cy - 21).lineTo(cx + 2, cy - 16).lineTo(cx - 4, cy - 14).stroke({ width: 2.5, color: INK, cap: 'round' });
      break;
    case 'hidden':
      g.moveTo(cx - 14, cy + 14).quadraticCurveTo(cx - 16, cy - 14, cx + 14, cy - 14).quadraticCurveTo(cx + 16, cy + 14, cx - 14, cy + 14).fill(0x2a8a1a).stroke(ink);
      g.moveTo(cx - 14, cy + 14).lineTo(cx + 12, cy - 12).stroke({ width: 2, color: 0xd8ffa0 });
      break;
    case 'fly':
      for (const sd of [-1, 1]) g.ellipse(cx + sd * 10, cy - 2, 10, 15).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 2.5, color: INK });
      g.roundRect(cx - 3, cy - 12, 6, 26, 3).fill(INK);
      break;
    case 'ghost':
      g.moveTo(cx - 13, cy + 15).lineTo(cx - 13, cy - 2).arc(cx, cy - 2, 13, Math.PI, 0).lineTo(cx + 13, cy + 15).lineTo(cx + 7, cy + 10).lineTo(cx, cy + 15).lineTo(cx - 7, cy + 10).closePath().fill({ color: 0xffffff, alpha: 0.9 }).stroke(ink);
      g.circle(cx - 5, cy - 2, 2.5).fill(INK).circle(cx + 5, cy - 2, 2.5).fill(INK);
      break;
    case 'power':
      g.moveTo(cx - 12, cy + 14).lineTo(cx + 12, cy - 12).stroke({ width: 6, color: 0xffffff, cap: 'round' });
      g.moveTo(cx - 12, cy + 14).lineTo(cx + 12, cy - 12).stroke({ width: 2, color: INK, cap: 'round' });
      g.moveTo(cx - 16, cy + 4).lineTo(cx - 4, cy + 16).stroke({ width: 4, color: INK, cap: 'round' });
      g.moveTo(cx + 6, cy - 16).lineTo(cx + 14, cy - 16).lineTo(cx + 14, cy - 8).stroke({ width: 3, color: INK, cap: 'round' });
      break;
    case 'haste':
      for (let k = 0; k < 2; k++) g.moveTo(cx - 14 + k * 12, cy - 13).lineTo(cx - 2 + k * 12, cy).lineTo(cx - 14 + k * 12, cy + 13).stroke({ width: 5, color: INK, cap: 'round', join: 'round' });
      break;
    case 'sight':
      for (let k = 0; k < 7; k++) {
        const a = (k / 6) * Math.PI * 2;
        const x = k === 6 ? cx : cx + Math.cos(a) * 10, y = k === 6 ? cy : cy + Math.sin(a) * 10;
        g.regularPoly(x, y, 5.5, 6, Math.PI / 6).fill(0xffffff).stroke({ width: 1.8, color: INK });
      }
      break;
    case 'feast':
      g.star(cx, cy, 5, 16, 7).fill(0xffffff).stroke(ink);
      break;
  }
}

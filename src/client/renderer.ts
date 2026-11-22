// 화면 그리기. 시뮬레이션 상태를 받아 그리기만 한다(상태를 바꾸지 않음).
import { Application, BitmapFont, BitmapText, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../shared/config';
import { relation } from '../shared/combat';
import { LINEAGE, SPECIAL_FOODS, SPECIES_BY_ID, STATS, taste, type Lineage } from '../shared/species';
import type { EnemyView, GameEvent, MapTheme, MapView, ProjView, RingView, SnakeView, ZoneView } from '../shared/types';
import { headKit, HR, type HeadKit, type HeadPart } from './heads';
import { lookOf } from './look';

export { lookOf };

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
  enemy: EnemyView | null;
  map: MapView;
  playerId: number;
}

interface PartSprite {
  sp: Sprite;
  part: HeadPart;
  side: 1 | -1;
}

interface SnakeGfx {
  species: string;
  kit: HeadKit;
  head: Container;
  wings: Sprite[];
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
  if (s.stage <= 1) return 1.3;
  return 1.35 + 0.09 * s.stage;
}

export class GameRenderer {
  app = new Application();
  world = new Container();
  private bg!: TilingSprite;
  private foodLayer = new Container();
  private zoneGfx = new Graphics();
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
  private fxs: Fx[] = [];
  private decalLayer = new Container();
  private fxSpriteLayer = new Container();
  private screenFx = new Graphics();
  private speedLines = 0;
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
  opts = { shake: true, labels: true, numbers: true };

  async init(parent: HTMLElement) {
    await this.app.init({
      resizeTo: window,
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
      chars: [['0', '9'], '!', '연타급소역습 ×+-'],
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
      this.bg, mask, this.deco, border, this.mapLayer, this.decalLayer, this.zoneGfx, this.foodBackLayer, this.foodLayer, this.ringGfx, this.markGfx,
      this.shadowLayer, this.glowLayer, this.legLayer, this.bodyLayer, this.ghostLayer, this.headLayer, this.statusGfx, this.shapeGfx,
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

    const dot = new Graphics();
    for (let i = 5; i >= 1; i--) dot.circle(16, 16, 3 + i * 2.4).fill({ color: 0xffffff, alpha: 0.12 });
    dot.circle(16, 16, 4).fill(0xffffff);
    this.tex.dot = r.generateTexture({ target: dot, resolution: 2 });

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

  private getSnakeGfx(s: FrameSnake): SnakeGfx {
    let g = this.snakes.get(s.id);
    if (g && g.species === s.species) return g;
    if (g) this.dropGfx(g);
    const look = lookOf(s.species);
    const feats = new Set(look.feats ?? []);
    const kit = headKit(this.app.renderer, s.species);
    const head = new Container();
    const spName = SPECIES_BY_ID.get(s.species)?.name ?? '';
    const label = new Text({
      text: s.isBoss ? '👑 왕지네' : s.isPlayer ? `나 · ${spName}` : `${s.name} · ${spName}`,
      style: { fontFamily: FONT, fontSize: s.isBoss ? 20 : 14, fill: s.isBoss ? 0xffb0a0 : s.isPlayer ? 0xd6ff8a : 0xffffff, stroke: { color: INK, width: 4, join: 'round' } },
    });
    label.anchor.set(0.5, 1);
    const wings: Sprite[] = [];
    if (feats.has('wings') || feats.has('wings4')) {
      const n = feats.has('wings4') ? 4 : 2;
      for (let k = 0; k < n; k++) {
        const w = new Sprite(this.tex.wing);
        w.anchor.set(0.05, 0.5);
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
      species: s.species, kit, head, wings, stinger, headBase, parts, label,
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
          if (e.gem !== undefined) {
            const st = STATS[e.gem];
            for (let i = 0; i < 16; i++) this.spawnParticle(e.x, e.y, i % 3 ? st.color : 0xffffff, 90 + Math.random() * 160, 0.5, 0.55);
            if (mine) {
              this.popup(e.x, e.y - 24, `${st.icon} ${st.name} Lv${e.lv}`, mix(st.color, 0xffffff, 0.35), 24, 1.3);
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
          // 물기: 이빨 자국(두 호가 맞물림)
          if (e.kind === 'bite' || e.kind === 'recoil') {
            const col = e.good ? 0xffd23f : 0xffffff;
            const ang = Math.random() * Math.PI;
            this.addShape((g, k) => {
              const rr = 14 + (1 - k) * 10;
              g.moveTo(e.x + Math.cos(ang - 0.9) * rr, e.y + Math.sin(ang - 0.9) * rr).arc(e.x, e.y, rr, ang - 0.9, ang + 0.9).stroke({ width: 5 * k, color: col, alpha: k });
              g.moveTo(e.x + Math.cos(ang + Math.PI - 0.9) * rr, e.y + Math.sin(ang + Math.PI - 0.9) * rr).arc(e.x, e.y, rr, ang + Math.PI - 0.9, ang + Math.PI + 0.9).stroke({ width: 5 * k, color: col, alpha: k });
            }, 0.22);
            for (let i = 0; i < (big ? 12 : 6); i++) this.spawnParticle(e.x, e.y, i % 2 ? col : t ? lookOf(t.species).body : 0xffffff, 80 + Math.random() * 140, 0.35, 0.45);
          }
          // 피해 숫자: 튀어 올랐다 떨어지고, 급소·역습은 크게
          const special = e.kind === 'crit' || e.kind === 'rage';
          if (mine || me || e.dmg >= 10 || special) {
            let col = 0xffffff, size = 24 + Math.min(30, e.dmg / 2.2);
            if (me) col = e.kind === 'recoil' ? 0xd08aff : 0xff5a4a;
            else if (mine) col = e.good ? 0xffd23f : 0xffffff;
            else ((col = 0xe0e0e0), (size *= 0.7));
            if (special) {
              col = e.kind === 'crit' ? 0xff7a1a : 0xff3a8a;
              size = Math.max(size, 40);
              this.popup(e.x, e.y - 40, e.kind === 'crit' ? '급소!' : '역습!', 0xffffff, 26, 0.9, true);
              this.shake = Math.max(this.shake, 16);
              this.punch = Math.max(this.punch, 0.06);
              for (let i = 0; i < 26; i++) this.spawnParticle(e.x, e.y, i % 2 ? col : 0xffffff, 140 + Math.random() * 260, 0.6, 0.7);
            }
            this.dmgPop(e.x, e.y, e.dmg, col, size, mine && e.good);
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
          const col = s ? lookOf(s.species).body : 0xffffff;
          const n = s?.isBoss ? 140 : 34;
          for (let i = 0; i < n; i++) this.spawnParticle(e.x, e.y, i % 3 ? col : 0xffffff, 80 + Math.random() * (s?.isBoss ? 520 : 260), 0.8, s?.isBoss ? 1.1 : 0.7);
          this.addShape((g, k) => g.circle(e.x, e.y, 20 + (1 - k) * (s?.isBoss ? 300 : 120)).stroke({ width: 10 * k, color: col, alpha: k }), 0.5);
          if (e.snake === playerId || e.by === playerId) {
            this.shake = Math.max(this.shake, s?.isBoss ? 28 : 14);
            this.punch = Math.max(this.punch, 0.06);
          }
          if (e.by === playerId && e.cause !== 'crush') this.popup(e.x, e.y - 24, s?.isBoss ? '왕지네 처치!' : '처치!', 0xffffff, s?.isBoss ? 44 : 32);
          if (e.cause === 'enemy' && e.snake === playerId) this.popup(e.x, e.y - 20, '천적에게 당했다', 0xffb0a0, 26);
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
        case 'matchup':
          this.popup(e.x, e.y - 34, e.text, e.good ? 0x9dff7a : 0xff8a7a, 24);
          break;
        case 'molt': {
          const sp = SPECIES_BY_ID.get(e.species);
          const col = sp ? LINEAGE[sp.lineage].color : 0xffffff;
          this.pulseT.set(e.snake, 0.7);
          if (!this.isNear(e.x, e.y)) break;
          for (let i = 0; i < 70; i++) this.spawnParticle(e.x, e.y, i % 3 ? col : 0xffffff, 100 + Math.random() * 320, 1, 0.8);
          this.addShape((g, k) => {
            g.circle(e.x, e.y, 20 + (1 - k) * 200).stroke({ width: 12 * k, color: col, alpha: k });
            g.circle(e.x, e.y, 10 + (1 - k) * 120).stroke({ width: 6 * k, color: 0xffffff, alpha: k });
            for (let j = 0; j < 12; j++) {
              const a = (j / 12) * Math.PI * 2 + (1 - k);
              g.moveTo(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30).lineTo(e.x + Math.cos(a) * (60 + (1 - k) * 160), e.y + Math.sin(a) * (60 + (1 - k) * 160)).stroke({ width: 4 * k, color: 0xffffff, alpha: k * 0.8 });
            }
          }, 0.8);
          if (e.snake === playerId) {
            this.shake = Math.max(this.shake, 12);
            this.punch = Math.max(this.punch, 0.08);
          }
          break;
        }
        case 'skill': {
          const sp = SPECIES_BY_ID.get(e.species);
          this.strikeT.set(e.snake, 0.45);
          if (!this.isNear(e.x, e.y) || !sp) break;
          const col = LINEAGE[sp.lineage].color;
          for (let i = 0; i < 24; i++) this.spawnParticle(e.x, e.y, i % 2 ? col : 0xffffff, 80 + Math.random() * 180, 0.5, 0.6);
          this.fx('flare', e.x, e.y, col, 40, 260, 0.5, 0, 2);
          this.fx('ring', e.x, e.y, col, 30, 300, 0.5);
          this.addShape((g, k) => {
            g.circle(e.x, e.y, 18 + (1 - k) * 110).stroke({ width: 12 * k, color: col, alpha: k });
            g.circle(e.x, e.y, 10 + (1 - k) * 60).stroke({ width: 6 * k, color: 0xffffff, alpha: k });
          }, 0.5);
          if (e.snake === playerId) this.punch = Math.max(this.punch, 0.05);
          break;
        }
        case 'skillHit': {
          if (!this.isNear(e.x, e.y)) break;
          const col = { cut: 0xffffff, stun: 0xffe066, push: 0xbfe0ff, slow: 0x9ad0ff, root: 0xd0c0ff }[e.kind];
          for (let i = 0; i < 14; i++) this.spawnParticle(e.x, e.y, col, 80 + Math.random() * 160, 0.45, 0.55);
          if (e.kind === 'cut') {
            // X자 베기 자국
            const a = Math.random() * Math.PI;
            this.fx('slash', e.x, e.y, 0xffd23f, 50, 90, 0.3, a, 0);
            this.fx('slash', e.x, e.y, 0xffffff, 50, 90, 0.3, a + Math.PI / 2, 0);
            this.fx('flare', e.x, e.y, 0xffffff, 30, 110, 0.25);
            this.addShape((g, k) => {
              const L = 34 * (1.2 - k * 0.2);
              for (const d of [a, a + Math.PI / 2]) {
                g.moveTo(e.x - Math.cos(d) * L, e.y - Math.sin(d) * L).lineTo(e.x + Math.cos(d) * L, e.y + Math.sin(d) * L).stroke({ width: 10 * k, color: 0xffd23f, alpha: k * 0.6 });
                g.moveTo(e.x - Math.cos(d) * L, e.y - Math.sin(d) * L).lineTo(e.x + Math.cos(d) * L, e.y + Math.sin(d) * L).stroke({ width: 4 * k, color: 0xffffff, alpha: k });
              }
            }, 0.3);
          } else if (e.kind === 'stun') {
            this.addShape((g, k) => g.star(e.x, e.y, 8, 16 + (1 - k) * 30, 8 + (1 - k) * 12).fill({ color: 0xffe066, alpha: k * 0.8 }), 0.35);
          }
          break;
        }
        case 'aoe': {
          const col = { cut: 0xff9a3a, stun: 0xffe066, push: 0xbfe0ff }[e.kind];
          this.fx('ring', e.x, e.y, col, e.r * 0.4, e.r * 2.6, 0.55);
          this.fx('ring', e.x, e.y, 0xffffff, e.r * 0.2, e.r * 2.0, 0.4);
          this.fx('flare', e.x, e.y, col, e.r * 0.8, e.r * 2.4, 0.45, 0, 1.5);
          this.decal(e.x, e.y, e.r * 1.1, 0x1a1008);
          if (this.isNear(e.x, e.y)) this.speedLines = 0.35;
          const cracks: number[][] = [];
          for (let j = 0; j < 9; j++) {
            const pts = [e.x, e.y];
            let a = (j / 9) * Math.PI * 2 + Math.random() * 0.4;
            for (let s = 1; s <= 4; s++) {
              a += (Math.random() - 0.5) * 0.6;
              pts.push(e.x + Math.cos(a) * e.r * 0.22 * s, e.y + Math.sin(a) * e.r * 0.22 * s);
            }
            cracks.push(pts);
          }
          this.addShape((g, k) => {
            const grow = 1 - k;
            g.circle(e.x, e.y, e.r * (0.3 + 0.8 * Math.sqrt(grow))).fill({ color: col, alpha: 0.3 * k });
            g.circle(e.x, e.y, e.r * (0.3 + 0.8 * Math.sqrt(grow))).stroke({ width: 14 * k, color: col, alpha: k });
            g.circle(e.x, e.y, e.r * (0.15 + 1.1 * grow)).stroke({ width: 5 * k, color: 0xffffff, alpha: k * 0.9 });
            for (const c of cracks) g.poly(c, false).stroke({ width: 5 * k, color: 0x3a2a10, alpha: k * 0.7 });
          }, 0.9);
          for (let i = 0; i < 60; i++) this.spawnParticle(e.x, e.y, i % 2 ? col : 0xffffff, 120 + Math.random() * 360, 0.7, 0.7);
          if (this.isNear(e.x, e.y)) {
            this.shake = Math.max(this.shake, 12);
            this.punch = Math.max(this.punch, 0.04);
          }
          break;
        }
        case 'cone': {
          const col = e.kind === 'cut' ? 0xffd23f : 0xffe066;
          // 칼날 3겹이 부채꼴을 따라 휘두르듯 지나간다
          for (let j = 0; j < 3; j++) {
            const rr = e.range * (0.75 + j * 0.25);
            this.fx('slash', e.x + Math.cos(e.angle) * rr * 0.35, e.y + Math.sin(e.angle) * rr * 0.35, j === 1 ? 0xffffff : col, rr * 1.1, rr * 1.5, 0.35 + j * 0.08, e.angle - 0.5 + j * 0.25, 2.5);
          }
          this.fx('flare', e.x, e.y, col, 60, 220, 0.35);
          this.decal(e.x + Math.cos(e.angle) * e.range * 0.6, e.y + Math.sin(e.angle) * e.range * 0.6, e.range * 0.6, 0x2a1a08);
          if (this.isNear(e.x, e.y)) this.speedLines = 0.3;
          this.addShape((g, k) => {
            const grow = 1 - k;
            g.moveTo(e.x, e.y).arc(e.x, e.y, e.range * (0.5 + 0.55 * grow), e.angle - e.half, e.angle + e.half).lineTo(e.x, e.y).fill({ color: col, alpha: 0.22 * k });
            // 겹친 초승달 베기
            for (let j = 0; j < 3; j++) {
              const rr = e.range * (0.55 + 0.22 * j) * (0.85 + 0.3 * grow);
              const a0 = e.angle - e.half * (1.1 - j * 0.15), a1 = e.angle + e.half * (1.1 - j * 0.15);
              g.moveTo(e.x + Math.cos(a0) * rr, e.y + Math.sin(a0) * rr).arc(e.x, e.y, rr, a0, a1).stroke({ width: (16 - j * 4) * k, color: j === 1 ? 0xffffff : col, alpha: k });
            }
            for (let j = 0; j < 7; j++) {
              const a = e.angle - e.half + (j / 6) * e.half * 2;
              g.moveTo(e.x + Math.cos(a) * e.range * 0.3, e.y + Math.sin(a) * e.range * 0.3)
                .lineTo(e.x + Math.cos(a) * e.range * (0.7 + 0.5 * grow), e.y + Math.sin(a) * e.range * (0.7 + 0.5 * grow))
                .stroke({ width: 2.5 * k, color: 0xffffff, alpha: k * 0.7 });
            }
          }, 0.6);
          if (this.isNear(e.x, e.y)) {
            this.shake = Math.max(this.shake, 12);
            this.punch = Math.max(this.punch, 0.05);
          }
          for (let i = 0; i < 30; i++) {
            const a = e.angle + (Math.random() - 0.5) * 2 * e.half;
            this.spawnParticle(e.x + Math.cos(a) * e.range * 0.8, e.y + Math.sin(a) * e.range * 0.8, i % 2 ? 0xffd23f : 0xffffff, 60 + Math.random() * 160, 0.6, 0.6);
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
  portrait(species: string): string {
    const cached = this.portraits.get(species);
    if (cached) return cached;
    const look = lookOf(species);
    const feats = new Set(look.feats ?? []);
    const kit = headKit(this.app.renderer, species);
    const c = new Container();
    const r = 22, scale = (r * 2) / 64;
    const n = species === 'boss' ? 8 : species === 'caterpillar' ? 6 : 5;
    const ang = -0.65;
    const pts: [number, number][] = [[0, 0]];
    for (let i = 1; i < n; i++) {
      const a = ang + Math.PI + Math.sin(i * 0.9) * 0.35;
      const [px, py] = pts[i - 1];
      pts.push([px + Math.cos(a) * r * 1.2, py + Math.sin(a) * r * 1.2]);
    }
    const spider = feats.has('legs8'), centi = feats.has('centipede');
    for (let i = 1; i < n; i++) {
      const on = centi ? true : spider ? i <= 3 : species !== 'caterpillar' && i <= 3;
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
        sp.tint = species === 'longhorn' ? 0xffffff : 0x1b1b1b;
        c.addChild(sp);
      }
    }
    if (feats.has('wings') || feats.has('wings4')) {
      const k = feats.has('wings4') ? 4 : 2;
      for (let j = 0; j < k; j++) {
        const w = new Sprite(this.tex.wing);
        w.anchor.set(0.05, 0.5);
        w.position.set(pts[1][0], pts[1][1]);
        const side = j % 2 === 0 ? 1 : -1;
        w.rotation = ang + Math.PI + side * (0.5 + (j < 2 ? 0 : 0.35));
        w.scale.set(scale * 1.25, scale * 0.9);
        w.alpha = 0.8;
        c.addChild(w);
      }
    }
    const headR = r * (species === 'caterpillar' ? 1.3 : 1.55);
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
    this.portraits.set(species, url);
    return url;
  }

  render(frame: Frame, dt: number) {
    this.time += dt;
    this.shapeGfx.clear();
    this.setMap(frame.map);
    const W = this.app.screen.width, H = this.app.screen.height;
    const player = frame.snakes.find((s) => s.id === frame.playerId);

    if (player && player.alive && player.segs.length >= 2) {
      const k = 1 - Math.exp(-dt * 14);
      this.camX += (player.segs[0] - this.camX) * k;
      this.camY += (player.segs[1] - this.camY) * k;
      const base = Math.max(0.85, Math.min(1.6, Math.min(W, H) / 560));
      const lenZoom = Math.max(0.55, Math.min(1.12, 1.12 - player.length * 0.0026));
      const sizeZoom = Math.max(0.6, Math.min(1, Math.pow(10 / player.r, 0.5)));
      this.zoom += (base * lenZoom * sizeZoom - this.zoom) * (1 - Math.exp(-dt * 2));
    }
    this.shake *= Math.exp(-dt * 7);
    this.punch *= Math.exp(-dt * 9);
    if (!this.opts.shake) this.shake = this.punch = 0;
    this.labelLayer.visible = this.opts.labels;
    const z = this.zoom * (1 + this.punch);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.world.scale.set(z);
    this.world.position.set(W / 2 - this.camX * z + sx, H / 2 - this.camY * z + sy);
    const hw = W / z / 2 + 90, hh = H / z / 2 + 90;
    this.view = { x0: this.camX - hw, x1: this.camX + hw, y0: this.camY - hh, y1: this.camY + hh };
    for (const m of [this.flashT, this.biteT, this.strikeT, this.pulseT]) {
      for (const [k, v] of m) {
        if (v - dt <= 0) m.delete(k);
        else m.set(k, v - dt);
      }
    }

    this.drawZones(frame.zones);
    this.drawFoods(frame.foods, player && player.alive ? player.lineage : null);
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

  private drawZones(zones: ZoneView[]) {
    const g = this.zoneGfx;
    g.clear();
    for (const z of zones) {
      if (!this.isNear(z.x, z.y)) continue;
      const k = Math.min(1, z.life / 0.5);
      if (z.kind === 'poison') {
        g.circle(z.x, z.y, z.r).fill({ color: 0x7dff3a, alpha: 0.24 * k });
        g.circle(z.x, z.y, z.r * 0.55).fill({ color: 0xc8ff5a, alpha: 0.22 * k });
        if (Math.random() < 0.08) this.spawnParticle(z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r, 0xb8ff5a, 15, 0.6, 0.35);
      } else {
        const col = z.kind === 'root' ? 0xe6dcff : 0xffffff;
        const a = (z.kind === 'root' ? 0.8 : 0.55) * k;
        g.circle(z.x, z.y, z.r).fill({ color: col, alpha: 0.09 * k });
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          g.moveTo(z.x, z.y).lineTo(z.x + Math.cos(ang) * z.r, z.y + Math.sin(ang) * z.r);
        }
        g.stroke({ width: 1.8, color: col, alpha: a });
        for (let rr = z.r / 5; rr <= z.r + 1; rr += z.r / 5) {
          const pts: number[] = [];
          for (let i = 0; i <= 12; i++) {
            const ang = (i / 12) * Math.PI * 2;
            pts.push(z.x + Math.cos(ang) * rr, z.y + Math.sin(ang) * rr);
          }
          g.poly(pts, false);
        }
        g.stroke({ width: 1.6, color: col, alpha: a });
      }
    }
  }

  private drawProjs(projs: ProjView[]) {
    const g = this.shapeGfx;
    for (const p of projs) {
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      g.moveTo(p.x - c * 70, p.y - s * 70).lineTo(p.x + c * 6, p.y + s * 6).stroke({ width: 14, color: 0xffb03a, alpha: 0.25 });
      g.moveTo(p.x - c * 30, p.y - s * 30).lineTo(p.x + c * 6, p.y + s * 6).stroke({ width: 8, color: 0xffe066, alpha: 0.5 });
      g.circle(p.x, p.y, 12).fill({ color: 0xfff3b0, alpha: 0.35 });
      g.moveTo(p.x - c * 12, p.y - s * 12).lineTo(p.x + c * 10, p.y + s * 10).stroke({ width: 3.5, color: 0x1b1b1b });
      g.circle(p.x + c * 10, p.y + s * 10, 3).fill(0xffffff);
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

  private drawFoods(foods: Float32Array, myLineage: Lineage | null) {
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
        // 보석: 능력치 색 빛 + 반짝이며 흔들림
        const c = STATS[sub]?.color ?? 0xffffff;
        const gl = take(this.foodBack, this.foodBackLayer, back++, this.tex.glow);
        gl.position.set(x, y);
        gl.tint = c;
        gl.scale.set(((r * 6) / 96) * (1 + 0.25 * Math.sin(ph * 2)));
        gl.alpha = 0.9;
        const d = take(this.foodSprites, this.foodLayer, used++, this.tex.diamond);
        d.position.set(x, y + Math.sin(ph) * 3);
        d.tint = mix(c, 0xffffff, 0.15);
        d.rotation = Math.sin(ph * 0.8) * 0.18;
        d.scale.set(((r * 3.1) / 64) * (1 + 0.08 * Math.sin(ph * 2.2)));
        if (Math.random() < 0.025) this.spawnParticle(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2, 0xffffff, 10, 0.5, 0.35);
        continue;
      }
      if (kind === 4) {
        // 특별 먹이: 접시(좋아하는 갈래 색) + 그림, 내 입맛 표시
        const f = SPECIAL_FOODS[sub];
        if (!f) continue;
        const t = myLineage ? taste(myLineage, sub) : 0;
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
        pl.tint = mix(LINEAGE[f.like].color, 0xffffff, 0.45);
        pl.scale.set((r * 2.8) / 68);
        const ic = take(this.foodSprites, this.foodLayer, used++, this.tex['sp_' + f.id]);
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

  private drawSnake(s: FrameSnake, player: FrameSnake | undefined) {
    const g = this.getSnakeGfx(s);
    const vis = s.alive && s.segs.length >= 2;
    g.head.visible = vis;
    g.label.visible = vis;
    for (const w of g.wings) w.visible = vis;
    if (!vis) return;
    const look = lookOf(s.species);
    const feats = new Set(look.feats ?? []);
    const lcol = s.isBoss ? 0xff4a3a : LINEAGE[s.lineage].color;
    const n = s.segs.length / 2;
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
      if (s.molt > 0) out = mix(out, 0xffffff, s.molt * 0.6);
      if (flash > 0) out = mix(out, 0xffffff, Math.min(1, flash / 0.13) * 0.85);
      return out;
    };
    // 진화 단계가 높을수록 화려하게: 빛 테두리(2+), 보석(4+), 반짝이(5)
    const glowA = s.isBoss ? 0.3 : [0, 0, 0.08, 0.18, 0.28, 0.42][s.stage];
    const gems = !s.isBoss && s.stage >= 4;

    const fade = s.sneaking ? 0.8 : 1;
    const vw = this.view;
    const inView = (i: number) => {
      const x = s.segs[i * 2], y = s.segs[i * 2 + 1];
      return x >= vw.x0 && x <= vw.x1 && y >= vw.y0 && y <= vw.y1;
    };
    // 독침(꼬리): 몸보다 아래에 깔리도록 먼저 빌린다
    if (g.stinger && n >= 2 && inView(n - 1)) {
      const ti = n - 1, tj = n - 2;
      const st = this.bodyPool.take(this.tex.sting, 1, 0.5);
      st.position.set(s.segs[ti * 2], s.segs[ti * 2 + 1]);
      st.rotation = Math.atan2(s.segs[tj * 2 + 1] - s.segs[ti * 2 + 1], s.segs[tj * 2] - s.segs[ti * 2]);
      st.scale.set(scale * 1.2);
      st.alpha = fade;
    }
    // 꼬리부터 머리 쪽으로: 머리에 가까운 마디가 위에 그려진다. 화면 밖 마디는 빌리지 않는다
    for (let i = n - 1; i >= 0; i--) {
      if (!inView(i)) continue;
      const x = s.segs[i * 2], y = s.segs[i * 2 + 1];
      const pj = Math.max(0, i - 1);
      const dirA = i === 0 ? s.angle : Math.atan2(s.segs[pj * 2 + 1] - y, s.segs[pj * 2] - x);
      const taper = i > n - 6 ? 0.7 + 0.3 * ((n - i) / 6) : 1;
      const wiggle = 1 + 0.05 * Math.sin(this.time * 10 - i * 0.7);
      const unit = swarm ? (i % 3 === 0 ? 0.8 : 0.93) : 1;
      const sh = this.shadowPool.take(this.tex.shadow);
      sh.position.set(x + 3 + fly * 14, y + 6 + fly * 18);
      sh.scale.set(scale * taper * 1.05 * (1 - fly * 0.2));
      sh.alpha = 1 - fly * 0.4;
      if (glowA > 0) {
        const gl = this.glowPool.take(this.tex.glow);
        gl.position.set(x, y);
        gl.scale.set(scale * taper * 1.15);
        gl.tint = lcol;
        gl.alpha = glowA * (0.6 + 0.4 * Math.sin(this.time * 5 - i * 0.35));
      }
      const legOn = allLegs ? i > 0 : spider ? i >= 1 && i <= 4 : s.species !== 'caterpillar' && i >= 1 && i <= 3;
      if (legOn && !s.fly) {
        const leg = this.legPool.take(this.tex.legs);
        const swing = Math.sin(this.time * 16 + i * 1.3) * 0.35;
        leg.position.set(x, y);
        leg.rotation = dirA + swing;
        leg.scale.set(scale * (spider ? 1.6 : allLegs ? 1.15 : 1.1) * lift);
        leg.alpha = fade;
      }
      if (i === 0) continue;
      const b = this.bodyPool.take(this.tex.body);
      b.position.set(x, y);
      b.scale.set(scale * taper * wiggle * unit * lift);
      const stripeOn = swarm ? i % 3 === 0 : Math.floor(i / 2) % 2 === 1;
      b.tint = tint(stripeOn ? look.stripe : look.body);
      b.alpha = (blink ? 0.45 : 1) * fade;
      const shine = this.bodyPool.take(this.tex.shine);
      shine.position.set(x - s.r * 0.25 * taper, y - s.r * 0.35 * taper);
      shine.scale.set(scale * taper * 0.9 * lift);
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
          spot.tint = s.species === 'longhorn' ? 0xffffff : 0x1b1b1b;
          spot.alpha = fade;
        }
      }
    }
    // 5단계 반짝이
    if (!s.isBoss && s.stage >= 5 && Math.random() < 0.5 && this.isNear(s.segs[0], s.segs[1])) {
      const i = Math.floor(Math.random() * n);
      this.spawnParticle(s.segs[i * 2], s.segs[i * 2 + 1], Math.random() < 0.5 ? 0xffe066 : 0xffffff, 25, 0.6, 0.35);
    }
    // 날개(1~2번 마디 위, 퍼덕임)
    if (g.wings.length) {
      const wi = Math.min(n - 1, 1);
      const wx = s.segs[wi * 2], wy = s.segs[wi * 2 + 1];
      const flap = Math.sin(this.time * (s.fly ? 60 : 30)) * (s.fly ? 0.35 : 0.12);
      const back = s.angle + Math.PI;
      g.wings.forEach((w, k) => {
        const side = k % 2 === 0 ? 1 : -1;
        const pair = k < 2 ? 0 : 1;
        w.position.set(wx, wy);
        w.rotation = back + side * (0.45 + pair * 0.35 + flap);
        w.scale.set(scale * (1.35 - pair * 0.2) * lift, scale * 0.95 * lift);
        w.alpha = 0.75;
      });
    }
    // 머리
    const hx = s.segs[0], hy = s.segs[1];
    const headR = s.r * headMul(s) * grow * lift;
    const hk = headR / HR;
    const ca = Math.cos(s.angle), sa = Math.sin(s.angle);
    g.head.position.set(hx, hy);
    g.headBase.rotation = s.angle;
    g.headBase.scale.set(hk);
    g.headBase.tint = flash > 0 ? 0xffd0d0 : 0xffffff;
    g.headBase.alpha = blink ? 0.45 : 1;
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
      sp.alpha = blink ? 0.45 : 1;
    }
    // 이름표 + 체력바(화면 기준 일정한 크기)
    const iz = 1 / Math.max(0.5, this.zoom);
    const barW = (s.isBoss ? 110 : 50) * iz, barH = (s.isBoss ? 10 : 7) * iz;
    const barY = hy - headR - 12 * iz - barH;
    g.label.position.set(hx, barY - 3 * iz);
    g.label.scale.set(iz);
    const nearMe = !!player && player.alive && player.segs.length >= 2 && !s.isPlayer && Math.hypot(hx - player.segs[0], hy - player.segs[1]) < 320;
    const showHp = s.isBoss || s.hp < s.maxHp - 0.5 || nearMe;
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
    if (s.molt > 0) {
      const glow = 0.35 + 0.25 * Math.sin(this.time * 12);
      st.circle(hx, hy, headR * 1.6).fill({ color: 0xffffff, alpha: glow * 0.5 });
      st.moveTo(hx, hy - headR * 1.9).arc(hx, hy, headR * 1.9, -Math.PI / 2, -Math.PI / 2 + s.molt * Math.PI * 2).stroke({ width: 5, color: 0xffffff, alpha: 0.95 });
      if (Math.random() < 0.5) this.spawnParticle(hx + (Math.random() - 0.5) * headR * 3, hy + (Math.random() - 0.5) * headR * 3, 0xffffff, 20, 0.5, 0.4);
    }
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
    if (s.magnet) {
      for (let j = 0; j < 3; j++) {
        const k = (this.time * 1.5 + j / 3) % 1;
        st.circle(hx, hy, 40 + (1 - k) * 200).stroke({ width: 3, color: 0xfff3b0, alpha: 0.5 * k });
      }
    }
    if (s.feast) {
      for (let k = 0; k < 4; k++) {
        const ang = this.time * 4 + (k * Math.PI) / 2;
        st.star(hx + Math.cos(ang) * headR * 1.7, hy + Math.sin(ang) * headR * 1.7, 4, 8, 3.5).fill(0xffe066).stroke({ width: 1.5, color: INK });
      }
      for (let i = 0; i < n; i += 5) if (Math.random() < 0.15) this.spawnParticle(s.segs[i * 2], s.segs[i * 2 + 1], Math.random() < 0.5 ? 0xffe066 : 0x7dff5a, 40, 0.5, 0.45);
    }
    if (s.yuck) {
      for (let k = 0; k < 3; k++) {
        const kk = (this.time * 0.9 + k / 3) % 1;
        st.circle(hx + Math.sin(this.time * 3 + k * 2) * headR * 0.8, hy - headR * (0.8 + kk * 1.8), 3 + kk * 5).fill({ color: 0xb8d870, alpha: 0.8 * (1 - kk) }).stroke({ width: 1.5, color: INK, alpha: 0.6 * (1 - kk) });
      }
    }
    if (s.ringFast) {
      for (let i = 0; i < n; i += 4) if (Math.random() < 0.3) this.spawnParticle(s.segs[i * 2], s.segs[i * 2 + 1], Math.random() < 0.5 ? 0xff8a1c : 0xffd23f, 30, 0.4, 0.5);
    }
    if (s.isBoss) st.circle(hx, hy, headR + 8).stroke({ width: 3, color: 0xff6a4a, alpha: 0.4 + 0.3 * Math.sin(this.time * 5) });
    if (!s.isBoss && s.stage >= 5) st.circle(hx, hy, headR + 5).stroke({ width: 2.5, color: 0xffe066, alpha: 0.35 + 0.25 * Math.sin(this.time * 4) });
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
      this.spawnParticle(s.segs[ti * 2], s.segs[ti * 2 + 1], look.body, 20 + Math.random() * 40, 0.4, 0.4);
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
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.alpha = p.life / p.max;
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
    if (this.app.renderer.resolution !== r) this.app.renderer.resize(window.innerWidth, window.innerHeight, r);
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

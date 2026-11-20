// 화면 그리기. 시뮬레이션 상태를 받아 그리기만 한다(상태를 바꾸지 않음).
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../shared/config';
import { beats, BOSS_LOOK, LINEAGE, SPECIES_BY_ID, type Look } from '../shared/species';
import type { BirdView, GameEvent, ProjView, RingView, SnakeView, ZoneView } from '../shared/types';

const FOOD_COLORS = [0xfff07a, 0xa6f37a, 0x7ae3f3, 0xf3a1d7, 0xffc37a, 0xd6a1ff];
const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export interface FrameSnake extends SnakeView {
  segs: Float32Array; // 보간된 위치
}

export interface Frame {
  snakes: FrameSnake[];
  foods: Float32Array;
  rings: RingView[];
  zones: ZoneView[];
  projs: ProjView[];
  bird: BirdView;
  playerId: number;
}

export function lookOf(species: string): Look {
  if (species === 'boss') return BOSS_LOOK;
  return SPECIES_BY_ID.get(species)?.look ?? SPECIES_BY_ID.get('caterpillar')!.look;
}

interface SnakeGfx {
  species: string;
  shadows: Container;
  legs: Container;
  bodies: Container;
  shadowSprites: Sprite[];
  legSprites: Sprite[];
  bodySprites: Sprite[];
  shineSprites: Sprite[];
  spotSprites: Sprite[];
  wings: Sprite[];
  stinger: Sprite | null;
  head: Sprite;
  face: Sprite;
  label: Text;
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
  t: Text;
  vy: number;
  life: number;
  max: number;
}

interface Shape {
  draw: (g: Graphics, k: number) => void;
  life: number;
  max: number;
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
  private legLayer = new Container();
  private bodyLayer = new Container();
  private headLayer = new Container();
  private statusGfx = new Graphics();
  private shapeGfx = new Graphics();
  private fxLayer = new Container();
  private birdGfx = new Graphics();
  private popupLayer = new Container();
  private tex: Record<string, Texture> = {};
  private faceTex = new Map<string, Texture>();
  private snakes = new Map<number, SnakeGfx>();
  private foodSprites: Sprite[] = [];
  private particles: Particle[] = [];
  private freeParticles: Sprite[] = [];
  private popups: Popup[] = [];
  private shapes: Shape[] = [];
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private shake = 0;
  private time = 0;

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

    this.bg = new TilingSprite({ texture: this.tex.grass, width: CONFIG.arenaRadius * 2 + 400, height: CONFIG.arenaRadius * 2 + 400 });
    this.bg.position.set(-CONFIG.arenaRadius - 200, -CONFIG.arenaRadius - 200);
    const mask = new Graphics().circle(0, 0, CONFIG.arenaRadius).fill(0xffffff);
    this.bg.mask = mask;
    const border = new Graphics()
      .circle(0, 0, CONFIG.arenaRadius + 14)
      .stroke({ width: 28, color: 0x3d6b2f, alpha: 1 })
      .circle(0, 0, CONFIG.arenaRadius + 2)
      .stroke({ width: 4, color: 0xb8e08a, alpha: 0.6 });
    const deco = this.makeDecorations();

    this.world.addChild(
      this.bg, mask, deco, border, this.zoneGfx, this.foodLayer, this.ringGfx, this.markGfx,
      this.shadowLayer, this.legLayer, this.bodyLayer, this.headLayer, this.statusGfx, this.shapeGfx, this.fxLayer, this.birdGfx, this.popupLayer,
    );
    this.app.stage.addChild(this.world);
  }

  private makeTextures() {
    const r = this.app.renderer;
    const body = new Graphics();
    body.circle(32, 32, 32).fill(0xa8a8a8);
    body.circle(32, 31, 29).fill(0xd8d8d8);
    body.circle(31, 29, 24).fill(0xffffff);
    this.tex.body = r.generateTexture({ target: body, resolution: 2 });

    const shine = new Graphics();
    shine.ellipse(20, 12, 14, 8).fill({ color: 0xffffff, alpha: 0.75 });
    shine.ellipse(22, 13, 7, 4).fill({ color: 0xffffff, alpha: 0.9 });
    this.tex.shine = r.generateTexture({ target: shine, resolution: 2 });

    const spot = new Graphics();
    spot.circle(16, 16, 16).fill(0xffffff);
    this.tex.spot = r.generateTexture({ target: spot, resolution: 2 });

    // 다리 한 쌍(+y, -y로 뻗음). 가운데가 (32,32)
    const legs = new Graphics();
    legs.moveTo(32, 32).lineTo(36, 6).lineTo(28, 0).stroke({ width: 4, color: 0x2a2018, cap: 'round', join: 'round' });
    legs.moveTo(32, 32).lineTo(36, 58).lineTo(28, 64).stroke({ width: 4, color: 0x2a2018, cap: 'round', join: 'round' });
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
    for (let i = 8; i >= 1; i--) food.circle(32, 32, 10 + i * 2.6).fill({ color: 0xffffff, alpha: 0.045 });
    food.circle(32, 32, 10).fill(0xffffff);
    food.circle(29, 29, 4).fill({ color: 0xffffff, alpha: 1 });
    this.tex.food = r.generateTexture({ target: food, resolution: 2 });

    const dot = new Graphics();
    for (let i = 5; i >= 1; i--) dot.circle(16, 16, 3 + i * 2.4).fill({ color: 0xffffff, alpha: 0.12 });
    dot.circle(16, 16, 4).fill(0xffffff);
    this.tex.dot = r.generateTexture({ target: dot, resolution: 2 });

    const T = 256;
    const g = new Graphics();
    g.rect(0, 0, T, T).fill(0x74b257);
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const wrap = (draw: (ox: number, oy: number) => void) => {
      for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) draw(ox, oy);
    };
    for (let i = 0; i < 26; i++) {
      const x = rnd() * T, y = rnd() * T, rr = 18 + rnd() * 30, col = rnd() < 0.5 ? 0x6aa64e : 0x7fbc60;
      wrap((ox, oy) => g.circle(x + ox, y + oy, rr).fill({ color: col, alpha: 0.5 }));
    }
    for (let i = 0; i < 140; i++) {
      const x = rnd() * T, y = rnd() * T, h = 4 + rnd() * 7, lean = (rnd() - 0.5) * 4, col = rnd() < 0.5 ? 0x5c9a42 : 0x8cc96b;
      wrap((ox, oy) => g.moveTo(x + ox, y + oy).lineTo(x + ox + lean, y + oy - h).stroke({ width: 1.6, color: col, alpha: 0.8, cap: 'round' }));
    }
    for (let i = 0; i < 22; i++) {
      const x = rnd() * T, y = rnd() * T, rr = 1.2 + rnd() * 1.5;
      g.circle(x, y, rr).fill({ color: 0xe9f7c8, alpha: 0.7 });
    }
    this.tex.grass = r.generateTexture({ target: g, resolution: 1, frame: new Rectangle(0, 0, T, T) });
  }

  /** 종마다 얼굴(눈·더듬이·턱·뿔·낫)을 한 번 그려 둔다. 머리 중심이 (48,48), 반지름 32 기준, +x를 본다 */
  private getFace(species: string): Texture {
    let t = this.faceTex.get(species);
    if (t) return t;
    const look = lookOf(species);
    const f = new Set(look.feats ?? []);
    const g = new Graphics();
    g.rect(0, 0, 112, 96).fill({ color: 0, alpha: 0 });
    const ink = 0x2a1d12;
    const cx = 48, cy = 48;
    // 더듬이
    if (!f.has('legs8')) {
      if (f.has('antennaLong')) {
        g.moveTo(cx + 18, cy - 12).bezierCurveTo(cx + 40, cy - 30, cx + 56, cy - 40, cx + 62, cy - 46).stroke({ width: 3, color: ink, cap: 'round' });
        g.moveTo(cx + 18, cy + 12).bezierCurveTo(cx + 40, cy + 30, cx + 56, cy + 40, cx + 62, cy + 46).stroke({ width: 3, color: ink, cap: 'round' });
      } else {
        g.moveTo(cx + 12, cy - 22).quadraticCurveTo(cx + 30, cy - 34, cx + 38, cy - 42).stroke({ width: 3, color: ink, cap: 'round' });
        g.moveTo(cx + 12, cy + 22).quadraticCurveTo(cx + 30, cy + 34, cx + 38, cy + 42).stroke({ width: 3, color: ink, cap: 'round' });
        g.circle(cx + 38, cy - 42, 3.5).fill(ink);
        g.circle(cx + 38, cy + 42, 3.5).fill(ink);
      }
    }
    // 큰턱
    if (f.has('mandibles')) {
      const big = species === 'stag' || species === 'boss';
      const L = big ? 40 : 22;
      g.moveTo(cx + 24, cy - 12).quadraticCurveTo(cx + 24 + L, cy - 22, cx + 24 + L * 0.9, cy - 2).stroke({ width: big ? 6 : 4, color: 0x3a2412, cap: 'round' });
      g.moveTo(cx + 24, cy + 12).quadraticCurveTo(cx + 24 + L, cy + 22, cx + 24 + L * 0.9, cy + 2).stroke({ width: big ? 6 : 4, color: 0x3a2412, cap: 'round' });
    }
    // 뿔
    if (f.has('horn')) {
      g.poly([cx + 14, cy - 9, cx + 60, cy - 4, cx + 64, cy - 14, cx + 70, cy - 6, cx + 60, cy + 6, cx + 14, cy + 9]).fill(0x2d1a0c);
    }
    // 사마귀 낫
    if (f.has('sickles')) {
      for (const sgn of [-1, 1]) {
        g.moveTo(cx + 10, cy + sgn * 24).lineTo(cx + 40, cy + sgn * 38).lineTo(cx + 58, cy + sgn * 20).stroke({ width: 5, color: 0x3f8a2a, cap: 'round', join: 'round' });
        g.moveTo(cx + 44, cy + sgn * 34).lineTo(cx + 50, cy + sgn * 28).stroke({ width: 2, color: 0x2b5e1d });
      }
    }
    // 눈
    if (f.has('legs8')) {
      // 거미: 앞쪽 큰 눈 2개 + 작은 눈 4개
      g.circle(cx + 20, cy - 8, 8).fill(0x111111);
      g.circle(cx + 20, cy + 8, 8).fill(0x111111);
      g.circle(cx + 22, cy - 10, 2.5).fill(0xffffff);
      g.circle(cx + 22, cy + 6, 2.5).fill(0xffffff);
      for (const [dx, dy] of [[8, -20], [8, 20], [0, -14], [0, 14]]) g.circle(cx + dx, cy + dy, 4).fill(0x111111);
      // 송곳니
      g.moveTo(cx + 28, cy - 5).lineTo(cx + 36, cy - 3).stroke({ width: 3, color: 0x111111, cap: 'round' });
      g.moveTo(cx + 28, cy + 5).lineTo(cx + 36, cy + 3).stroke({ width: 3, color: 0x111111, cap: 'round' });
    } else if (f.has('bigEyes')) {
      g.ellipse(cx + 10, cy - 18, 13, 11).fill(0x223a5a);
      g.ellipse(cx + 10, cy + 18, 13, 11).fill(0x223a5a);
      g.circle(cx + 14, cy - 21, 3.5).fill({ color: 0xffffff, alpha: 0.9 });
      g.circle(cx + 14, cy + 15, 3.5).fill({ color: 0xffffff, alpha: 0.9 });
    } else if (species === 'caterpillar') {
      g.circle(cx + 10, cy - 11, 8).fill(0xffffff);
      g.circle(cx + 10, cy + 11, 8).fill(0xffffff);
      g.circle(cx + 13, cy - 11, 4.5).fill(0x1b1b1b);
      g.circle(cx + 13, cy + 11, 4.5).fill(0x1b1b1b);
      g.circle(cx + 14.5, cy - 12.5, 1.6).fill(0xffffff);
      g.circle(cx + 14.5, cy + 9.5, 1.6).fill(0xffffff);
      g.ellipse(cx + 2, cy - 20, 5, 3).fill({ color: 0xff7aa8, alpha: 0.5 });
      g.ellipse(cx + 2, cy + 20, 5, 3).fill({ color: 0xff7aa8, alpha: 0.5 });
    } else {
      // 겹눈
      g.ellipse(cx + 12, cy - 15, 8, 9).fill(0x161616);
      g.ellipse(cx + 12, cy + 15, 8, 9).fill(0x161616);
      g.circle(cx + 14, cy - 18, 2.6).fill({ color: 0xffffff, alpha: 0.85 });
      g.circle(cx + 14, cy + 12, 2.6).fill({ color: 0xffffff, alpha: 0.85 });
    }
    t = this.app.renderer.generateTexture({ target: g, resolution: 2, frame: new Rectangle(0, 0, 112, 96) });
    this.faceTex.set(species, t);
    return t;
  }

  private makeDecorations(): Container {
    const c = new Container();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const R = CONFIG.arenaRadius;
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (R - 80);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const g = new Graphics();
      if (rnd() < 0.6) {
        const petal = [0xffffff, 0xffe066, 0xff9ec7, 0xb59cff][Math.floor(rnd() * 4)];
        const n = 5 + Math.floor(rnd() * 3), pr = 14 + rnd() * 10;
        for (let k = 0; k < n; k++) {
          const pa = (k / n) * Math.PI * 2;
          g.ellipse(Math.cos(pa) * pr * 0.8, Math.sin(pa) * pr * 0.8, pr * 0.7, pr * 0.45).fill({ color: petal, alpha: 0.55 });
        }
        g.circle(0, 0, pr * 0.45).fill({ color: 0xffc94a, alpha: 0.7 });
        g.rotation = rnd() * Math.PI;
      } else {
        const s = 16 + rnd() * 22;
        g.ellipse(4, 6, s, s * 0.7).fill({ color: 0x000000, alpha: 0.15 });
        g.ellipse(0, 0, s, s * 0.72).fill({ color: 0x9aa39a, alpha: 0.75 });
        g.ellipse(-s * 0.3, -s * 0.25, s * 0.4, s * 0.22).fill({ color: 0xffffff, alpha: 0.35 });
      }
      g.position.set(x, y);
      c.addChild(g);
    }
    return c;
  }

  private dropGfx(g: SnakeGfx) {
    g.shadows.destroy({ children: true });
    g.legs.destroy({ children: true });
    g.bodies.destroy({ children: true });
    g.head.destroy();
    g.face.destroy();
    g.label.destroy();
  }

  private getSnakeGfx(s: FrameSnake): SnakeGfx {
    let g = this.snakes.get(s.id);
    if (g && g.species === s.species) return g;
    if (g) this.dropGfx(g);
    const look = lookOf(s.species);
    const feats = new Set(look.feats ?? []);
    const shadows = new Container();
    const legs = new Container();
    const bodies = new Container();
    const head = new Sprite(this.tex.body);
    head.anchor.set(0.5);
    const face = new Sprite(this.getFace(s.species));
    face.anchor.set(48 / 112, 0.5);
    const label = new Text({
      text: s.isPlayer ? '' : s.isBoss ? '👑 왕지네' : s.name,
      style: { fontFamily: FONT, fontSize: s.isBoss ? 18 : 13, fontWeight: '700', fill: s.isBoss ? 0xffb0a0 : 0xffffff, stroke: { color: 0x2a3b1f, width: 3 } },
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
    let stinger: Sprite | null = null;
    if (feats.has('stinger')) {
      stinger = new Sprite(this.tex.sting);
      stinger.anchor.set(1, 0.5);
    }
    this.shadowLayer.addChild(shadows);
    this.legLayer.addChild(legs);
    this.bodyLayer.addChild(bodies);
    if (stinger) bodies.addChildAt(stinger, 0);
    this.headLayer.addChild(...wings, head, face, label);
    g = { species: s.species, shadows, legs, bodies, shadowSprites: [], legSprites: [], bodySprites: [], shineSprites: [], spotSprites: [], wings, stinger, head, face, label };
    this.snakes.set(s.id, g);
    return g;
  }

  /** 시뮬레이션이 보낸 사건으로 이펙트를 만든다 */
  handleEvents(events: GameEvent[], snakesById: Map<number, SnakeView>, playerId: number) {
    for (const e of events) {
      switch (e.type) {
        case 'eat': {
          if (!this.isNear(e.x, e.y)) break;
          const n = e.big ? 8 : 3;
          for (let i = 0; i < n; i++) this.spawnParticle(e.x, e.y, FOOD_COLORS[i % FOOD_COLORS.length], 40 + Math.random() * 60, 0.35, e.big ? 0.5 : 0.3);
          break;
        }
        case 'death': {
          const s = snakesById.get(e.snake);
          const col = s ? lookOf(s.species).body : 0xffffff;
          const n = s?.isBoss ? 120 : 26;
          for (let i = 0; i < n; i++) this.spawnParticle(e.x, e.y, col, 80 + Math.random() * (s?.isBoss ? 500 : 220), 0.7, s?.isBoss ? 1 : 0.6);
          if (e.snake === playerId || e.by === playerId) this.shake = Math.max(this.shake, s?.isBoss ? 26 : 10);
          if (e.by === playerId && e.cause !== 'crush') this.popup(e.x, e.y - 20, s?.isBoss ? '왕지네 처치!' : '처치!', 0xffffff, s?.isBoss ? 40 : 26);
          if (e.cause === 'bird' && e.snake === playerId) this.popup(e.x, e.y - 20, '새에게 잡혔다', 0xffb0a0, 26);
          break;
        }
        case 'ring': {
          for (let i = 0; i < 18; i++) this.spawnParticle(e.cx, e.cy, 0xffe066, 60 + Math.random() * 80, 0.6, 0.45);
          if (e.snake === playerId) this.popup(e.cx, e.cy, e.trapped > 0 ? `감쌌다! ${e.trapped}마리` : '고리!', 0xffe066, e.trapped > 0 ? 30 : 22);
          break;
        }
        case 'crush': {
          if (e.count <= 0) break;
          for (let i = 0; i < 60; i++) this.spawnParticle(e.cx, e.cy, i % 2 ? 0xffd54a : 0xffffff, 120 + Math.random() * 380, 0.9, 0.9);
          this.shake = Math.max(this.shake, e.snake === playerId ? 18 : 8);
          if (e.snake === playerId) this.popup(e.cx, e.cy, e.count >= 2 ? `압착! ×${e.count}` : '압착!', 0xffd54a, e.count >= 2 ? 44 : 38);
          break;
        }
        case 'bounce': {
          if (!this.isNear(e.x, e.y)) break;
          for (let i = 0; i < 5; i++) this.spawnParticle(e.x, e.y, 0xffffff, 60 + Math.random() * 60, 0.3, 0.35);
          break;
        }
        case 'cut': {
          if (!this.isNear(e.x, e.y)) break;
          const s = snakesById.get(e.snake);
          const col = s ? lookOf(s.species).body : 0xffffff;
          for (let i = 0; i < 16; i++) this.spawnParticle(e.x, e.y, i % 2 ? col : 0xffffff, 80 + Math.random() * 180, 0.5, 0.5);
          if (e.by === playerId) this.popup(e.x, e.y, `싹둑! -${e.n}`, 0xffffff, 22);
          if (e.snake === playerId) {
            this.popup(e.x, e.y, `-${e.n}`, 0xff8a7a, 24);
            this.shake = Math.max(this.shake, 8);
          }
          break;
        }
        case 'matchup':
          this.popup(e.x, e.y - 24, e.text, e.good ? 0x9dff7a : 0xff8a7a, 26);
          break;
        case 'moltStart':
          break;
        case 'molt': {
          const sp = SPECIES_BY_ID.get(e.species);
          const col = sp ? LINEAGE[sp.lineage].color : 0xffffff;
          if (!this.isNear(e.x, e.y)) break;
          for (let i = 0; i < 50; i++) this.spawnParticle(e.x, e.y, i % 3 ? col : 0xffffff, 80 + Math.random() * 260, 0.9, 0.7);
          this.addShape((g, k) => g.circle(e.x, e.y, 20 + (1 - k) * 160).stroke({ width: 8 * k, color: col, alpha: k }), 0.6);
          if (e.snake === playerId) {
            this.popup(e.x, e.y - 30, `${sp?.name ?? ''}(으)로 진화!`, 0xffffff, 32);
            this.shake = Math.max(this.shake, 10);
          }
          break;
        }
        case 'skill': {
          const sp = SPECIES_BY_ID.get(e.species);
          if (!this.isNear(e.x, e.y) || !sp) break;
          const col = LINEAGE[sp.lineage].color;
          for (let i = 0; i < 14; i++) this.spawnParticle(e.x, e.y, col, 60 + Math.random() * 120, 0.45, 0.5);
          if (e.snake === playerId) this.popup(e.x, e.y - 34, sp.skillName, 0xfff3b0, 20);
          break;
        }
        case 'skillHit': {
          if (!this.isNear(e.x, e.y)) break;
          const col = { cut: 0xffffff, stun: 0xffe066, push: 0xbfe0ff, slow: 0x9ad0ff, root: 0xd0c0ff }[e.kind];
          for (let i = 0; i < 10; i++) this.spawnParticle(e.x, e.y, col, 60 + Math.random() * 100, 0.4, 0.45);
          break;
        }
        case 'aoe': {
          const col = { cut: 0xff9a5a, stun: 0xffe066, push: 0xbfe0ff }[e.kind];
          this.addShape((g, k) => {
            g.circle(e.x, e.y, e.r * (1.05 - 0.25 * k)).fill({ color: col, alpha: 0.22 * k });
            g.circle(e.x, e.y, e.r * (1.05 - 0.25 * k)).stroke({ width: 6, color: col, alpha: 0.9 * k });
          }, 0.45);
          if (this.isNear(e.x, e.y)) this.shake = Math.max(this.shake, 6);
          break;
        }
        case 'cone': {
          const col = e.kind === 'cut' ? 0xffffff : 0xffe066;
          this.addShape((g, k) => {
            const r = e.range * (0.6 + 0.4 * (1 - k));
            g.moveTo(e.x, e.y).arc(e.x, e.y, r, e.angle - e.half, e.angle + e.half).lineTo(e.x, e.y).fill({ color: col, alpha: 0.28 * k });
            g.arc(e.x, e.y, r, e.angle - e.half, e.angle + e.half).stroke({ width: 5, color: col, alpha: k });
          }, 0.35);
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

  private isNear(x: number, y: number) {
    const w = this.app.screen.width / this.zoom, h = this.app.screen.height / this.zoom;
    return Math.abs(x - this.camX) < w * 0.7 && Math.abs(y - this.camY) < h * 0.7;
  }

  private spawnParticle(x: number, y: number, color: number, speed: number, life: number, size: number) {
    if (this.particles.length > 900) return;
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

  private popup(x: number, y: number, text: string, color: number, size: number) {
    const t = new Text({
      text,
      style: { fontFamily: FONT, fontSize: size, fontWeight: '900', fill: color, stroke: { color: 0x2a2000, width: 6 } },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0.3);
    this.popupLayer.addChild(t);
    this.popups.push({ t, vy: -40, life: 1.3, max: 1.3 });
  }

  render(frame: Frame, dt: number) {
    this.time += dt;
    this.shapeGfx.clear();
    const W = this.app.screen.width, H = this.app.screen.height;
    const player = frame.snakes.find((s) => s.id === frame.playerId);

    if (player && player.alive && player.segs.length >= 2) {
      const k = 1 - Math.exp(-dt * 14);
      this.camX += (player.segs[0] - this.camX) * k;
      this.camY += (player.segs[1] - this.camY) * k;
      const base = Math.max(0.85, Math.min(1.6, Math.min(W, H) / 560));
      const lenZoom = Math.max(0.68, Math.min(1.12, 1.12 - player.length * 0.0032));
      const sizeZoom = Math.max(0.72, Math.min(1, Math.pow(10 / player.r, 0.45)));
      this.zoom += (base * lenZoom * sizeZoom - this.zoom) * (1 - Math.exp(-dt * 2));
    }
    this.shake *= Math.exp(-dt * 7);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.world.scale.set(this.zoom);
    this.world.position.set(W / 2 - this.camX * this.zoom + sx, H / 2 - this.camY * this.zoom + sy);

    this.drawZones(frame.zones);
    this.drawFoods(frame.foods);
    this.drawRings(frame.rings);
    this.drawMarks(frame.snakes, player);

    this.statusGfx.clear();
    const seen = new Set<number>();
    // 날고 있는 곤충은 맨 나중에(위에) 그린다
    for (const s of frame.snakes) {
      seen.add(s.id);
      this.drawSnake(s);
    }
    for (const [id, g] of this.snakes) {
      if (!seen.has(id)) g.shadows.visible = g.legs.visible = g.bodies.visible = g.head.visible = g.face.visible = g.label.visible = false;
    }
    this.drawProjs(frame.projs);
    this.drawBird(frame.bird);
    this.updateFx(dt);
  }

  /** 플레이어 기준 강약 표시: 초록(내가 이김) · 회색(비김) · 빨강(내가 짐) */
  private drawMarks(snakes: FrameSnake[], player: FrameSnake | undefined) {
    const g = this.markGfx;
    g.clear();
    if (!player || !player.alive) return;
    const effOf = (a: SnakeView, b: SnakeView) => (a.isBoss ? 6 : a.stage + (beats(a.lineage, b.lineage) ? 1 : 0));
    for (const s of snakes) {
      if (s.id === player.id || !s.alive || s.segs.length < 2) continue;
      const hx = s.segs[0], hy = s.segs[1];
      if (!this.isNear(hx, hy)) continue;
      const mine = effOf(player, s), theirs = effOf(s, player);
      const R = s.r * 1.9 + 4;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      if (mine > theirs) {
        g.circle(hx, hy, R).stroke({ width: 3, color: 0x7dff5a, alpha: 0.75 });
        // 아래쪽을 가리키는 작은 화살표(먹을 수 있다)
        const ay = hy - R - 10 - pulse * 3;
        g.poly([hx - 6, ay - 6, hx + 6, ay - 6, hx, ay + 2]).fill({ color: 0x7dff5a, alpha: 0.9 });
      } else if (mine === theirs) {
        g.circle(hx, hy, R).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
      } else {
        g.circle(hx, hy, R).stroke({ width: 3.5, color: 0xff4a3a, alpha: 0.6 + pulse * 0.35 });
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + this.time;
          const x0 = hx + Math.cos(a) * R, y0 = hy + Math.sin(a) * R;
          const x1 = hx + Math.cos(a) * (R + 8), y1 = hy + Math.sin(a) * (R + 8);
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 3, color: 0xff4a3a, alpha: 0.8 });
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
        g.circle(z.x, z.y, z.r).fill({ color: 0x7dff3a, alpha: 0.22 * k });
        g.circle(z.x, z.y, z.r * 0.55).fill({ color: 0xc8ff5a, alpha: 0.2 * k });
      } else {
        // 거미줄: 방사선 + 동심 원
        const col = z.kind === 'root' ? 0xe6dcff : 0xffffff;
        const a = (z.kind === 'root' ? 0.75 : 0.5) * k;
        g.circle(z.x, z.y, z.r).fill({ color: col, alpha: 0.08 * k });
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          g.moveTo(z.x, z.y).lineTo(z.x + Math.cos(ang) * z.r, z.y + Math.sin(ang) * z.r);
        }
        g.stroke({ width: 1.5, color: col, alpha: a });
        for (let rr = z.r / 4; rr <= z.r + 1; rr += z.r / 4) g.circle(z.x, z.y, rr);
        g.stroke({ width: 1.5, color: col, alpha: a });
      }
    }
  }

  private drawProjs(projs: ProjView[]) {
    const g = this.shapeGfx;
    for (const p of projs) {
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      g.moveTo(p.x - c * 16, p.y - s * 16).lineTo(p.x + c * 6, p.y + s * 6).stroke({ width: 5, color: 0xffe066, alpha: 0.5 });
      g.moveTo(p.x - c * 10, p.y - s * 10).lineTo(p.x + c * 8, p.y + s * 8).stroke({ width: 2.5, color: 0x1b1b1b });
    }
  }

  private drawBird(bird: BirdView) {
    const g = this.birdGfx;
    g.clear();
    for (const sh of bird.shadows) {
      const k = 1 - sh.t / sh.total; // 0 → 1 (내려올수록 진해짐)
      const r = sh.r * (1.6 - 0.6 * k);
      g.ellipse(sh.x, sh.y, r, r * 0.85).fill({ color: 0x000000, alpha: 0.12 + 0.35 * k });
      // 새 실루엣(날개)
      const w = r * 1.1;
      g.poly([sh.x - w, sh.y - r * 0.1, sh.x - w * 0.3, sh.y - r * 0.35, sh.x, sh.y - r * 0.15, sh.x + w * 0.3, sh.y - r * 0.35, sh.x + w, sh.y - r * 0.1, sh.x, sh.y + r * 0.3]).fill({
        color: 0x000000,
        alpha: 0.15 + 0.3 * k,
      });
      g.circle(sh.x, sh.y, sh.r).stroke({ width: 3, color: 0xff4a3a, alpha: 0.4 + 0.5 * Math.abs(Math.sin(this.time * 10)) * k });
    }
  }

  private drawFoods(foods: Float32Array) {
    const n = foods.length / 4;
    const viewW = this.app.screen.width / this.zoom / 2 + 40, viewH = this.app.screen.height / this.zoom / 2 + 40;
    let used = 0;
    for (let i = 0; i < n; i++) {
      const x = foods[i * 4], y = foods[i * 4 + 1];
      if (Math.abs(x - this.camX) > viewW || Math.abs(y - this.camY) > viewH) continue;
      const r = foods[i * 4 + 2], kind = foods[i * 4 + 3];
      let s = this.foodSprites[used];
      if (!s) {
        s = new Sprite(this.tex.food);
        s.anchor.set(0.5);
        this.foodLayer.addChild(s);
        this.foodSprites.push(s);
      }
      s.visible = true;
      s.position.set(x, y);
      const h = Math.abs(Math.floor(x * 7 + y * 13)) % FOOD_COLORS.length;
      s.tint = kind === 1 ? 0xc8ff5a : kind === 2 ? 0xffb35a : FOOD_COLORS[h];
      const pulse = 1 + 0.15 * Math.sin(this.time * 3 + i);
      s.scale.set(((r * 4.2) / 64) * pulse * (kind === 1 ? 1.25 : 1));
      used++;
    }
    for (let i = used; i < this.foodSprites.length; i++) this.foodSprites[i].visible = false;
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

  private drawSnake(s: FrameSnake) {
    const g = this.getSnakeGfx(s);
    const vis = s.alive && s.segs.length >= 2;
    g.shadows.visible = g.legs.visible = g.bodies.visible = g.head.visible = g.face.visible = vis;
    g.label.visible = vis && !s.isPlayer;
    for (const w of g.wings) w.visible = vis;
    if (!vis) return;
    const look = lookOf(s.species);
    const feats = new Set(look.feats ?? []);
    const n = s.segs.length / 2;
    const scale = (s.r * 2) / 64;
    const fly = s.fly ? 1 : 0;
    const lift = 1 + fly * 0.18;
    const swarm = look.pattern === 'swarm';
    const metal = look.pattern === 'metal';
    const spots = look.pattern === 'spots';
    const fuzzy = look.pattern === 'fuzzy';
    const allLegs = feats.has('centipede');
    const spider = feats.has('legs8');
    const tint = (c: number) => (s.slow ? mix(c, 0x7ab8ff, 0.35) : s.molt > 0 ? mix(c, 0xffffff, s.molt * 0.6) : c);

    while (g.bodySprites.length < n) {
      const sh = new Sprite(this.tex.shadow);
      sh.anchor.set(0.5);
      const b = new Sprite(this.tex.body);
      b.anchor.set(0.5);
      const shine = new Sprite(this.tex.shine);
      shine.anchor.set(0.5);
      const spot = new Sprite(this.tex.spot);
      spot.anchor.set(0.5);
      const leg = new Sprite(this.tex.legs);
      leg.anchor.set(0.5);
      g.shadows.addChildAt(sh, 0);
      g.bodies.addChildAt(spot, g.stinger ? 1 : 0);
      g.bodies.addChildAt(shine, g.stinger ? 1 : 0);
      g.bodies.addChildAt(b, g.stinger ? 1 : 0);
      g.legs.addChildAt(leg, 0);
      g.shadowSprites.push(sh);
      g.bodySprites.push(b);
      g.shineSprites.push(shine);
      g.spotSprites.push(spot);
      g.legSprites.push(leg);
    }
    for (let i = 0; i < g.bodySprites.length; i++) {
      const b = g.bodySprites[i], sh = g.shadowSprites[i], shine = g.shineSprites[i], spot = g.spotSprites[i], leg = g.legSprites[i];
      if (i >= n) {
        b.visible = sh.visible = shine.visible = spot.visible = leg.visible = false;
        continue;
      }
      const x = s.segs[i * 2], y = s.segs[i * 2 + 1];
      const pj = Math.max(0, i - 1);
      const dirA = i === 0 ? s.angle : Math.atan2(s.segs[pj * 2 + 1] - y, s.segs[pj * 2] - x);
      const taper = i > n - 6 ? 0.7 + 0.3 * ((n - i) / 6) : 1;
      const wiggle = 1 + 0.05 * Math.sin(this.time * 10 - i * 0.7);
      const unit = swarm ? (i % 3 === 0 ? 0.78 : 0.92) : 1; // 무리: 작은 개체가 줄지어 가는 느낌
      sh.position.set(x + 3 + fly * 14, y + 6 + fly * 18);
      sh.scale.set(scale * taper * 1.05 * (1 - fly * 0.2));
      sh.alpha = 1 - fly * 0.4;
      sh.visible = true;
      // 다리: 지네는 모든 마디, 거미는 앞 4마디, 나머지는 앞 3마디
      const legOn = allLegs ? i > 0 : spider ? i >= 1 && i <= 4 : s.species !== 'caterpillar' && i >= 1 && i <= 3;
      leg.visible = legOn && !s.fly;
      if (legOn) {
        const swing = Math.sin(this.time * 16 + i * 1.3) * 0.35;
        leg.position.set(x, y);
        leg.rotation = dirA + swing;
        leg.scale.set(scale * (spider ? 1.5 : allLegs ? 1.1 : 1.05) * lift);
      }
      if (i === 0) {
        b.visible = shine.visible = spot.visible = false;
        continue;
      }
      b.visible = shine.visible = true;
      b.position.set(x, y);
      b.scale.set(scale * taper * wiggle * unit * lift);
      const stripeOn = swarm ? i % 3 === 0 : Math.floor(i / 2) % 2 === 1;
      b.tint = tint(stripeOn ? look.stripe : look.body);
      shine.position.set(x - s.r * 0.25 * taper, y - s.r * 0.35 * taper);
      shine.scale.set(scale * taper * 0.9 * lift);
      shine.alpha = metal ? 0.85 : fuzzy ? 0.2 : 0.45;
      shine.alpha += s.boosting || s.dash ? 0.15 + 0.1 * Math.sin(this.time * 30) : 0;
      // 점무늬(무당벌레·하늘소)
      spot.visible = spots && i % 2 === 1;
      if (spot.visible) {
        spot.position.set(x + Math.cos(dirA + Math.PI / 2) * s.r * 0.35 * (i % 4 === 1 ? 1 : -1), y + Math.sin(dirA + Math.PI / 2) * s.r * 0.35 * (i % 4 === 1 ? 1 : -1));
        spot.scale.set(scale * 0.55 * taper);
        spot.tint = s.species === 'longhorn' ? 0xffffff : 0x1b1b1b;
      }
    }
    // 독침(꼬리)
    if (g.stinger) {
      const ti = n - 1, tj = Math.max(0, n - 2);
      g.stinger.visible = true;
      g.stinger.position.set(s.segs[ti * 2], s.segs[ti * 2 + 1]);
      g.stinger.rotation = Math.atan2(s.segs[tj * 2 + 1] - s.segs[ti * 2 + 1], s.segs[tj * 2] - s.segs[ti * 2]);
      g.stinger.scale.set(scale * 1.1);
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
        w.scale.set(scale * (1.25 - pair * 0.2) * lift, scale * 0.9 * lift);
        w.alpha = 0.75;
      });
    }
    // 머리
    const hx = s.segs[0], hy = s.segs[1];
    const headScale = scale * 1.18 * lift;
    g.head.position.set(hx, hy);
    g.head.scale.set(headScale);
    g.head.tint = tint(look.head);
    g.face.position.set(hx, hy);
    g.face.rotation = s.angle;
    g.face.scale.set(headScale * 0.95);
    g.label.position.set(hx, hy - s.r * 2.6);
    g.label.scale.set(1 / Math.max(0.6, this.zoom));
    const a = s.sneaking ? 0.7 : 1;
    g.bodies.alpha = g.legs.alpha = a;
    g.head.alpha = g.face.alpha = a;

    // 상태 표시
    const st = this.statusGfx;
    if (s.molt > 0) {
      // 탈피: 빛나는 고치와 진행 원
      const glow = 0.35 + 0.25 * Math.sin(this.time * 12);
      st.circle(hx, hy, s.r * 2.2).fill({ color: 0xffffff, alpha: glow * 0.5 });
      st.arc(hx, hy, s.r * 2.6, -Math.PI / 2, -Math.PI / 2 + s.molt * Math.PI * 2).stroke({ width: 4, color: 0xffffff, alpha: 0.95 });
      if (Math.random() < 0.4) this.spawnParticle(hx + (Math.random() - 0.5) * s.r * 3, hy + (Math.random() - 0.5) * s.r * 3, 0xffffff, 20, 0.5, 0.35);
    }
    if (s.shield) {
      st.circle(hx, hy, s.r * 2.4).fill({ color: 0x9ad8ff, alpha: 0.18 }).stroke({ width: 3, color: 0xc8ecff, alpha: 0.85 });
    }
    if (s.stun) {
      for (let k = 0; k < 3; k++) {
        const ang = this.time * 6 + (k * Math.PI * 2) / 3;
        st.star(hx + Math.cos(ang) * s.r * 1.6, hy - s.r * 1.8 + Math.sin(ang) * s.r * 0.5, 5, 5, 2.2).fill(0xffe066);
      }
    }
    if (s.magnet) {
      const k = (this.time * 1.5) % 1;
      st.circle(hx, hy, 40 + k * 160).stroke({ width: 2, color: 0xfff3b0, alpha: 0.5 * (1 - k) });
    }
    if (s.ringFast) st.circle(hx, hy, s.r * 2).stroke({ width: 4, color: 0xff9a3a, alpha: 0.6 + 0.3 * Math.sin(this.time * 20) });
    if (s.isBoss) st.circle(hx, hy, s.r * 1.7).stroke({ width: 3, color: 0xff6a4a, alpha: 0.4 + 0.3 * Math.sin(this.time * 5) });
    // 부스트·돌진 잔상
    if ((s.boosting || s.dash) && Math.random() < (s.dash ? 1 : 0.6)) {
      const ti = s.dash ? 0 : Math.max(0, n - 1);
      this.spawnParticle(s.segs[ti * 2], s.segs[ti * 2 + 1], s.dash ? 0xffffff : look.body, 20 + Math.random() * 40, 0.4, s.dash ? 0.6 : 0.4);
    }
  }

  private updateFx(dt: number) {
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
      const pop = age < 0.18 ? 0.3 + (age / 0.18) * 0.95 : 1.25 - Math.min(0.25, (age - 0.18) * 1.5);
      p.t.scale.set(pop / Math.max(0.6, this.zoom));
      p.t.y += p.vy * dt;
      p.t.alpha = Math.min(1, p.life / 0.4);
    }
  }

  get camera() {
    return { x: this.camX, y: this.camY, zoom: this.zoom };
  }
}

function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

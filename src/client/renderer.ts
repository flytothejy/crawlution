// 화면 그리기. 시뮬레이션 상태를 받아 그리기만 한다(상태를 바꾸지 않음).
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../shared/config';
import { relation } from '../shared/combat';
import { LINEAGE, SPECIES_BY_ID } from '../shared/species';
import type { BirdView, GameEvent, ProjView, RingView, SnakeView, ZoneView } from '../shared/types';
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
  bird: BirdView;
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
  shadows: Container;
  glows: Container;
  legs: Container;
  bodies: Container;
  head: Container;
  shadowSprites: Sprite[];
  glowSprites: Sprite[];
  legSprites: Sprite[];
  bodySprites: Sprite[];
  shineSprites: Sprite[];
  spotSprites: Sprite[];
  wings: Sprite[];
  stinger: Sprite | null;
  headBase: Sprite;
  parts: PartSprite[];
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
  private birdGfx = new Graphics();
  private hpGfx = new Graphics();
  private labelLayer = new Container();
  private popupLayer = new Container();
  private tex: Record<string, Texture> = {};
  private snakes = new Map<number, SnakeGfx>();
  private portraits = new Map<string, string>();
  private foodSprites: Sprite[] = [];
  private particles: Particle[] = [];
  private freeParticles: Sprite[] = [];
  private popups: Popup[] = [];
  private shapes: Shape[] = [];
  private ghosts: Ghost[] = [];
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
    this.ghostLayer.blendMode = 'add';

    this.world.addChild(
      this.bg, mask, deco, border, this.zoneGfx, this.foodLayer, this.ringGfx, this.markGfx,
      this.shadowLayer, this.glowLayer, this.legLayer, this.bodyLayer, this.ghostLayer, this.headLayer, this.statusGfx, this.shapeGfx,
      this.fxLayer, this.birdGfx, this.hpGfx, this.labelLayer, this.popupLayer,
    );
    this.app.stage.addChild(this.world);
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
    g.glows.destroy({ children: true });
    g.legs.destroy({ children: true });
    g.bodies.destroy({ children: true });
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
    const shadows = new Container();
    const glows = new Container();
    glows.blendMode = 'add';
    const legs = new Container();
    const bodies = new Container();
    const head = new Container();
    const label = new Text({
      text: s.isPlayer ? '' : s.isBoss ? '👑 왕지네' : s.name,
      style: { fontFamily: FONT, fontSize: s.isBoss ? 20 : 14, fill: s.isBoss ? 0xffb0a0 : 0xffffff, stroke: { color: INK, width: 4, join: 'round' } },
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
    this.shadowLayer.addChild(shadows);
    this.glowLayer.addChild(glows);
    this.legLayer.addChild(legs);
    this.bodyLayer.addChild(bodies);
    if (stinger) bodies.addChildAt(stinger, 0);
    for (const w of wings) this.headLayer.addChild(w);
    this.headLayer.addChild(head);
    this.labelLayer.addChild(label);
    g = {
      species: s.species, kit, shadows, glows, legs, bodies, head,
      shadowSprites: [], glowSprites: [], legSprites: [], bodySprites: [], shineSprites: [], spotSprites: [],
      wings, stinger, headBase, parts, label,
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
          // 피해 숫자
          if (mine || me || e.dmg >= 10) {
            let col = 0xffffff, size = 17 + Math.min(20, e.dmg / 3);
            let text = String(e.dmg);
            if (me) col = e.kind === 'recoil' ? 0xd08aff : 0xff5a4a;
            else if (mine) {
              col = e.good ? 0xffd23f : 0xffffff;
              if (e.good) text += '!';
              size += 4;
            } else {
              col = 0xdddddd;
              size -= 4;
            }
            this.popup(e.x + (Math.random() - 0.5) * 16, e.y - 12, text, col, size, 0.8);
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
          this.addShape((g, k) => {
            g.circle(e.x, e.y, 18 + (1 - k) * 70).stroke({ width: 8 * k, color: col, alpha: k });
          }, 0.35);
          if (e.snake === playerId) {
            this.popup(e.x, e.y - 46, sp.skillName, 0xfff3b0, 26);
            this.punch = Math.max(this.punch, 0.03);
          }
          break;
        }
        case 'skillHit': {
          if (!this.isNear(e.x, e.y)) break;
          const col = { cut: 0xffffff, stun: 0xffe066, push: 0xbfe0ff, slow: 0x9ad0ff, root: 0xd0c0ff }[e.kind];
          for (let i = 0; i < 14; i++) this.spawnParticle(e.x, e.y, col, 80 + Math.random() * 160, 0.45, 0.55);
          if (e.kind === 'cut') {
            // X자 베기 자국
            const a = Math.random() * Math.PI;
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
            for (const c of cracks) g.poly(c, false).stroke({ width: 4 * k, color: 0x3a2a10, alpha: k * 0.7 });
          }, 0.7);
          for (let i = 0; i < 40; i++) this.spawnParticle(e.x, e.y, i % 2 ? col : 0xffffff, 120 + Math.random() * 360, 0.7, 0.7);
          if (this.isNear(e.x, e.y)) {
            this.shake = Math.max(this.shake, 12);
            this.punch = Math.max(this.punch, 0.04);
          }
          break;
        }
        case 'cone': {
          const col = e.kind === 'cut' ? 0xffd23f : 0xffe066;
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
          }, 0.4);
          if (this.isNear(e.x, e.y)) this.shake = Math.max(this.shake, 7);
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
    if (this.particles.length > 1000) return;
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

  private popup(x: number, y: number, text: string, color: number, size: number, life?: number) {
    const big = size >= 30;
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
    this.popups.push({ t, vy: big ? -28 : -52, life: L, max: L });
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
    const z = this.zoom * (1 + this.punch);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.world.scale.set(z);
    this.world.position.set(W / 2 - this.camX * z + sx, H / 2 - this.camY * z + sy);
    for (const m of [this.flashT, this.biteT, this.strikeT, this.pulseT]) {
      for (const [k, v] of m) {
        if (v - dt <= 0) m.delete(k);
        else m.set(k, v - dt);
      }
    }

    this.drawZones(frame.zones);
    this.drawFoods(frame.foods);
    this.drawRings(frame.rings);
    this.drawMarks(frame.snakes, player);

    this.statusGfx.clear();
    this.hpGfx.clear();
    const seen = new Set<number>();
    for (const s of frame.snakes) {
      seen.add(s.id);
      this.drawSnake(s, player);
    }
    for (const [id, g] of this.snakes) {
      if (seen.has(id)) continue;
      g.shadows.visible = g.glows.visible = g.legs.visible = g.bodies.visible = g.head.visible = g.label.visible = false;
      for (const w of g.wings) w.visible = false;
    }
    this.drawProjs(frame.projs);
    this.drawBird(frame.bird);
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
      g.moveTo(p.x - c * 30, p.y - s * 30).lineTo(p.x + c * 6, p.y + s * 6).stroke({ width: 8, color: 0xffe066, alpha: 0.35 });
      g.moveTo(p.x - c * 12, p.y - s * 12).lineTo(p.x + c * 10, p.y + s * 10).stroke({ width: 3.5, color: 0x1b1b1b });
      g.circle(p.x + c * 10, p.y + s * 10, 3).fill(0xffffff);
    }
  }

  private drawBird(bird: BirdView) {
    const g = this.birdGfx;
    g.clear();
    for (const sh of bird.shadows) {
      const k = 1 - sh.t / sh.total;
      const r = sh.r * (1.6 - 0.6 * k);
      g.ellipse(sh.x, sh.y, r, r * 0.85).fill({ color: 0x000000, alpha: 0.12 + 0.35 * k });
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

  private drawSnake(s: FrameSnake, player: FrameSnake | undefined) {
    const g = this.getSnakeGfx(s);
    const vis = s.alive && s.segs.length >= 2;
    g.shadows.visible = g.glows.visible = g.legs.visible = g.bodies.visible = g.head.visible = vis;
    g.label.visible = vis && !s.isPlayer;
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
      if (s.molt > 0) out = mix(out, 0xffffff, s.molt * 0.6);
      if (flash > 0) out = mix(out, 0xffffff, Math.min(1, flash / 0.13) * 0.85);
      return out;
    };
    // 진화 단계가 높을수록 화려하게: 빛 테두리(2+), 보석(4+), 반짝이(5)
    const glowA = s.isBoss ? 0.3 : [0, 0, 0.08, 0.18, 0.28, 0.42][s.stage];
    const gems = !s.isBoss && s.stage >= 4;

    while (g.bodySprites.length < n) {
      const sh = new Sprite(this.tex.shadow);
      sh.anchor.set(0.5);
      const gl = new Sprite(this.tex.glow);
      gl.anchor.set(0.5);
      const b = new Sprite(this.tex.body);
      b.anchor.set(0.5);
      const shine = new Sprite(this.tex.shine);
      shine.anchor.set(0.5);
      const spot = new Sprite(this.tex.spot);
      spot.anchor.set(0.5);
      const leg = new Sprite(this.tex.legs);
      leg.anchor.set(0.5);
      g.shadows.addChildAt(sh, 0);
      g.glows.addChildAt(gl, 0);
      g.bodies.addChildAt(spot, g.stinger ? 1 : 0);
      g.bodies.addChildAt(shine, g.stinger ? 1 : 0);
      g.bodies.addChildAt(b, g.stinger ? 1 : 0);
      g.legs.addChildAt(leg, 0);
      g.shadowSprites.push(sh);
      g.glowSprites.push(gl);
      g.bodySprites.push(b);
      g.shineSprites.push(shine);
      g.spotSprites.push(spot);
      g.legSprites.push(leg);
    }
    for (let i = 0; i < g.bodySprites.length; i++) {
      const b = g.bodySprites[i], sh = g.shadowSprites[i], gl = g.glowSprites[i], shine = g.shineSprites[i], spot = g.spotSprites[i], leg = g.legSprites[i];
      if (i >= n) {
        b.visible = sh.visible = gl.visible = shine.visible = spot.visible = leg.visible = false;
        continue;
      }
      const x = s.segs[i * 2], y = s.segs[i * 2 + 1];
      const pj = Math.max(0, i - 1);
      const dirA = i === 0 ? s.angle : Math.atan2(s.segs[pj * 2 + 1] - y, s.segs[pj * 2] - x);
      const taper = i > n - 6 ? 0.7 + 0.3 * ((n - i) / 6) : 1;
      const wiggle = 1 + 0.05 * Math.sin(this.time * 10 - i * 0.7);
      const unit = swarm ? (i % 3 === 0 ? 0.8 : 0.93) : 1;
      sh.position.set(x + 3 + fly * 14, y + 6 + fly * 18);
      sh.scale.set(scale * taper * 1.05 * (1 - fly * 0.2));
      sh.alpha = 1 - fly * 0.4;
      sh.visible = true;
      gl.visible = glowA > 0;
      if (gl.visible) {
        gl.position.set(x, y);
        gl.scale.set(scale * taper * 1.15);
        gl.tint = lcol;
        gl.alpha = glowA * (0.6 + 0.4 * Math.sin(this.time * 5 - i * 0.35));
      }
      const legOn = allLegs ? i > 0 : spider ? i >= 1 && i <= 4 : s.species !== 'caterpillar' && i >= 1 && i <= 3;
      leg.visible = legOn && !s.fly;
      if (legOn) {
        const swing = Math.sin(this.time * 16 + i * 1.3) * 0.35;
        leg.position.set(x, y);
        leg.rotation = dirA + swing;
        leg.scale.set(scale * (spider ? 1.6 : allLegs ? 1.15 : 1.1) * lift);
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
      b.alpha = blink ? 0.45 : 1;
      shine.position.set(x - s.r * 0.25 * taper, y - s.r * 0.35 * taper);
      shine.scale.set(scale * taper * 0.9 * lift);
      shine.alpha = (metal ? 0.85 : fuzzy ? 0.2 : 0.45) + (s.boosting || s.dash ? 0.15 + 0.1 * Math.sin(this.time * 30) : 0);
      // 점무늬 / 보석 장식
      const showGem = gems && i % 3 === 1;
      spot.visible = (spots && i % 2 === 1) || showGem;
      if (spot.visible) {
        if (showGem) {
          spot.texture = this.tex.gem;
          spot.position.set(x, y);
          spot.rotation = dirA;
          spot.scale.set(scale * 0.62 * taper);
          spot.tint = mix(lcol, 0xffffff, 0.35 + 0.25 * Math.sin(this.time * 6 - i));
        } else {
          spot.texture = this.tex.spot;
          spot.rotation = 0;
          const side = i % 4 === 1 ? 1 : -1;
          spot.position.set(x + Math.cos(dirA + Math.PI / 2) * s.r * 0.35 * side, y + Math.sin(dirA + Math.PI / 2) * s.r * 0.35 * side);
          spot.scale.set(scale * 0.55 * taper);
          spot.tint = s.species === 'longhorn' ? 0xffffff : 0x1b1b1b;
        }
      }
    }
    // 5단계 반짝이
    if (!s.isBoss && s.stage >= 5 && Math.random() < 0.5 && this.isNear(s.segs[0], s.segs[1])) {
      const i = Math.floor(Math.random() * n);
      this.spawnParticle(s.segs[i * 2], s.segs[i * 2 + 1], Math.random() < 0.5 ? 0xffe066 : 0xffffff, 25, 0.6, 0.35);
    }
    // 독침(꼬리)
    if (g.stinger) {
      const ti = n - 1, tj = Math.max(0, n - 2);
      g.stinger.visible = true;
      g.stinger.position.set(s.segs[ti * 2], s.segs[ti * 2 + 1]);
      g.stinger.rotation = Math.atan2(s.segs[tj * 2 + 1] - s.segs[ti * 2 + 1], s.segs[tj * 2] - s.segs[ti * 2]);
      g.stinger.scale.set(scale * 1.2);
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
    const a = s.sneaking ? 0.8 : 1;
    g.bodies.alpha = g.legs.alpha = a;

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
      const pop = age < 0.12 ? 0.3 + (age / 0.12) * 1.15 : 1.45 - Math.min(0.45, (age - 0.12) * 2.6);
      p.t.scale.set(pop / Math.max(0.6, this.zoom));
      p.t.y += p.vy * dt;
      p.t.alpha = Math.min(1, p.life / 0.35);
    }
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

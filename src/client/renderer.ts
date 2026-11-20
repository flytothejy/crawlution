// 화면 그리기. 시뮬레이션 상태를 받아 그리기만 한다(상태를 바꾸지 않음).
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../shared/config';
import type { GameEvent, RingView, SnakeView } from '../shared/types';

// 애벌레 팔레트: [몸, 줄무늬, 머리]
export const PALETTES: [number, number, number][] = [
  [0x8fd14f, 0x5fae2e, 0x74c23a], // 플레이어: 연두
  [0xf6cf4e, 0xd9a21b, 0xf0bd2a], // 노랑
  [0xf59a4f, 0xd4691d, 0xee8436], // 주황
  [0x5fc8ef, 0x2c93cf, 0x46b3e3], // 하늘
  [0xbf7ddc, 0x9450c4, 0xad66d2], // 보라
  [0xf38db3, 0xd95e8d, 0xea76a2], // 분홍
];

const FOOD_COLORS = [0xfff07a, 0xa6f37a, 0x7ae3f3, 0xf3a1d7, 0xffc37a, 0xd6a1ff];

export interface FrameSnake extends SnakeView {
  segs: Float32Array; // 보간된 위치
}

export interface Frame {
  snakes: FrameSnake[];
  foods: Float32Array;
  rings: RingView[];
  playerId: number;
}

interface SnakeGfx {
  shadows: Container;
  bodies: Container;
  shadowSprites: Sprite[];
  bodySprites: Sprite[];
  shineSprites: Sprite[];
  head: Sprite;
  face: Sprite;
  label: Text;
  palette: number;
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

export class GameRenderer {
  app = new Application();
  world = new Container();
  private bg!: TilingSprite;
  private foodLayer = new Container();
  private ringGfx = new Graphics();
  private shadowLayer = new Container();
  private bodyLayer = new Container();
  private headLayer = new Container();
  private fxLayer = new Container();
  private popupLayer = new Container();
  private tex: Record<string, Texture> = {};
  private snakes = new Map<number, SnakeGfx>();
  private foodSprites: Sprite[] = [];
  private particles: Particle[] = [];
  private freeParticles: Sprite[] = [];
  private popups: Popup[] = [];
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

    // 배경: 잔디 타일 + 원형 경기장
    this.bg = new TilingSprite({ texture: this.tex.grass, width: CONFIG.arenaRadius * 2 + 400, height: CONFIG.arenaRadius * 2 + 400 });
    this.bg.position.set(-CONFIG.arenaRadius - 200, -CONFIG.arenaRadius - 200);
    const mask = new Graphics().circle(0, 0, CONFIG.arenaRadius).fill(0xffffff);
    this.bg.mask = mask;
    const border = new Graphics()
      .circle(0, 0, CONFIG.arenaRadius + 14)
      .stroke({ width: 28, color: 0x3d6b2f, alpha: 1 })
      .circle(0, 0, CONFIG.arenaRadius + 2)
      .stroke({ width: 4, color: 0xb8e08a, alpha: 0.6 });
    // 장식: 큰 꽃·돌(미니어처 세계 느낌)
    const deco = this.makeDecorations();

    this.world.addChild(this.bg, mask, deco, border, this.foodLayer, this.ringGfx, this.shadowLayer, this.bodyLayer, this.headLayer, this.fxLayer, this.popupLayer);
    this.app.stage.addChild(this.world);
  }

  private makeTextures() {
    const r = this.app.renderer;
    // 몸 마디: 회색조 음영(색은 tint로 입힌다)
    const body = new Graphics();
    body.circle(32, 32, 32).fill(0xa8a8a8);
    body.circle(32, 31, 29).fill(0xd8d8d8);
    body.circle(31, 29, 24).fill(0xffffff);
    this.tex.body = r.generateTexture({ target: body, resolution: 2 });

    // 광택
    const shine = new Graphics();
    shine.ellipse(20, 12, 14, 8).fill({ color: 0xffffff, alpha: 0.75 });
    shine.ellipse(22, 13, 7, 4).fill({ color: 0xffffff, alpha: 0.9 });
    this.tex.shine = r.generateTexture({ target: shine, resolution: 2 });

    // 부드러운 그림자
    const shadow = new Graphics();
    for (let i = 10; i >= 1; i--) shadow.circle(40, 40, 22 + i * 1.8).fill({ color: 0x000000, alpha: 0.05 });
    this.tex.shadow = r.generateTexture({ target: shadow, resolution: 1 });

    // 얼굴(색 안 입힘): +x 방향을 본다
    const face = new Graphics();
    // 더듬이
    face.moveTo(44, 26).quadraticCurveTo(62, 14, 70, 6).stroke({ width: 3, color: 0x3b2a1a, cap: 'round' });
    face.moveTo(44, 38).quadraticCurveTo(62, 50, 70, 58).stroke({ width: 3, color: 0x3b2a1a, cap: 'round' });
    face.circle(70, 6, 4).fill(0x3b2a1a);
    face.circle(70, 58, 4).fill(0x3b2a1a);
    // 눈
    face.circle(42, 21, 8).fill(0xffffff);
    face.circle(42, 43, 8).fill(0xffffff);
    face.circle(45, 21, 4.5).fill(0x1b1b1b);
    face.circle(45, 43, 4.5).fill(0x1b1b1b);
    face.circle(46.5, 19.5, 1.6).fill(0xffffff);
    face.circle(46.5, 41.5, 1.6).fill(0xffffff);
    // 볼
    face.ellipse(34, 12, 5, 3).fill({ color: 0xff7aa8, alpha: 0.5 });
    face.ellipse(34, 52, 5, 3).fill({ color: 0xff7aa8, alpha: 0.5 });
    this.tex.face = r.generateTexture({ target: face, resolution: 2 });

    // 먹이: 빛나는 알갱이
    const food = new Graphics();
    for (let i = 8; i >= 1; i--) food.circle(32, 32, 10 + i * 2.6).fill({ color: 0xffffff, alpha: 0.045 });
    food.circle(32, 32, 10).fill(0xffffff);
    food.circle(29, 29, 4).fill({ color: 0xffffff, alpha: 1 });
    this.tex.food = r.generateTexture({ target: food, resolution: 2 });

    // 파티클
    const dot = new Graphics();
    for (let i = 5; i >= 1; i--) dot.circle(16, 16, 3 + i * 2.4).fill({ color: 0xffffff, alpha: 0.12 });
    dot.circle(16, 16, 4).fill(0xffffff);
    this.tex.dot = r.generateTexture({ target: dot, resolution: 2 });

    // 잔디 타일(이어 붙여도 이음새가 없도록 가장자리를 넘는 무늬는 반대편에도 그린다)
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
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (R - 80);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const g = new Graphics();
      if (rnd() < 0.6) {
        // 꽃
        const petal = [0xffffff, 0xffe066, 0xff9ec7, 0xb59cff][Math.floor(rnd() * 4)];
        const n = 5 + Math.floor(rnd() * 3), pr = 14 + rnd() * 10;
        for (let k = 0; k < n; k++) {
          const pa = (k / n) * Math.PI * 2;
          g.ellipse(Math.cos(pa) * pr * 0.8, Math.sin(pa) * pr * 0.8, pr * 0.7, pr * 0.45).fill({ color: petal, alpha: 0.55 });
        }
        g.circle(0, 0, pr * 0.45).fill({ color: 0xffc94a, alpha: 0.7 });
        g.rotation = rnd() * Math.PI;
      } else {
        // 돌
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

  private getSnakeGfx(s: FrameSnake): SnakeGfx {
    let g = this.snakes.get(s.id);
    if (g && g.palette === s.palette) return g;
    const shadows = new Container();
    const bodies = new Container();
    const head = new Sprite(this.tex.body);
    head.anchor.set(0.5);
    const face = new Sprite(this.tex.face);
    face.anchor.set(0.38, 0.5);
    const label = new Text({
      text: s.isPlayer ? '' : s.name,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x2a3b1f, width: 3 } },
    });
    label.anchor.set(0.5, 1);
    this.shadowLayer.addChild(shadows);
    this.bodyLayer.addChild(bodies);
    this.headLayer.addChild(head, face, label);
    g = { shadows, bodies, shadowSprites: [], bodySprites: [], shineSprites: [], head, face, label, palette: s.palette };
    this.snakes.set(s.id, g);
    return g;
  }

  /** 시뮬레이션이 보낸 사건으로 이펙트를 만든다 */
  handleEvents(events: GameEvent[], snakesById: Map<number, FrameSnake>, playerId: number) {
    for (const e of events) {
      switch (e.type) {
        case 'eat': {
          const near = this.isNear(e.x, e.y);
          if (!near) break;
          const n = e.big ? 8 : 3;
          for (let i = 0; i < n; i++) this.spawnParticle(e.x, e.y, FOOD_COLORS[i % FOOD_COLORS.length], 40 + Math.random() * 60, 0.35, e.big ? 0.5 : 0.3);
          break;
        }
        case 'death': {
          const s = snakesById.get(e.snake);
          const col = PALETTES[s?.palette ?? 0][0];
          for (let i = 0; i < 26; i++) this.spawnParticle(e.x, e.y, col, 80 + Math.random() * 220, 0.7, 0.6);
          if (e.snake === playerId || e.by === playerId) this.shake = Math.max(this.shake, 10);
          if (e.by === playerId && e.cause !== 'crush') this.popup(e.x, e.y - 20, '처치!', 0xffffff, 26);
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
      }
    }
  }

  private isNear(x: number, y: number) {
    const w = this.app.screen.width / this.zoom, h = this.app.screen.height / this.zoom;
    return Math.abs(x - this.camX) < w * 0.7 && Math.abs(y - this.camY) < h * 0.7;
  }

  private spawnParticle(x: number, y: number, color: number, speed: number, life: number, size: number) {
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
      style: { fontFamily: 'system-ui, sans-serif', fontSize: size, fontWeight: '900', fill: color, stroke: { color: 0x3a2a00, width: 6 } },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0.3);
    this.popupLayer.addChild(t);
    this.popups.push({ t, vy: -40, life: 1.3, max: 1.3 });
  }

  render(frame: Frame, dt: number) {
    this.time += dt;
    const W = this.app.screen.width, H = this.app.screen.height;
    const player = frame.snakes.find((s) => s.id === frame.playerId);

    // 카메라
    if (player && player.alive && player.segs.length >= 2) {
      const k = 1 - Math.exp(-dt * 12);
      this.camX += (player.segs[0] - this.camX) * k;
      this.camY += (player.segs[1] - this.camY) * k;
      const base = Math.max(0.85, Math.min(1.6, Math.min(W, H) / 560));
      const lenZoom = Math.max(0.68, Math.min(1.12, 1.12 - player.length * 0.0037));
      this.zoom += (base * lenZoom - this.zoom) * (1 - Math.exp(-dt * 2));
    }
    this.shake *= Math.exp(-dt * 7);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.world.scale.set(this.zoom);
    this.world.position.set(W / 2 - this.camX * this.zoom + sx, H / 2 - this.camY * this.zoom + sy);

    this.drawFoods(frame.foods);
    this.drawRings(frame.rings);

    const seen = new Set<number>();
    for (const s of frame.snakes) {
      seen.add(s.id);
      this.drawSnake(s);
    }
    for (const [id, g] of this.snakes) {
      if (!seen.has(id)) {
        g.shadows.visible = g.bodies.visible = g.head.visible = g.face.visible = g.label.visible = false;
      }
    }
    this.updateFx(dt);
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
      const prog = 1 - r.t / r.total; // 0 → 1
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 18);
      g.poly(p, true).fill({ color: 0xffe066, alpha: 0.08 + prog * 0.18 });
      g.poly(p, true).stroke({ width: 16, color: 0xffd54a, alpha: 0.18 + pulse * 0.12 });
      g.poly(p, true).stroke({ width: 5, color: 0xfff3b0, alpha: 0.95 });
      // 조여 들어오는 안쪽 고리
      const q: number[] = [];
      const k = prog * 0.75;
      for (let i = 0; i < p.length; i += 2) q.push(p[i] + (r.cx - p[i]) * k, p[i + 1] + (r.cy - p[i + 1]) * k);
      g.poly(q, true).stroke({ width: 3, color: 0xffffff, alpha: 0.35 + prog * 0.5 });
    }
  }

  private drawSnake(s: FrameSnake) {
    const g = this.getSnakeGfx(s);
    const vis = s.alive && s.segs.length >= 2;
    g.shadows.visible = g.bodies.visible = g.head.visible = g.face.visible = vis;
    g.label.visible = vis && !s.isPlayer;
    if (!vis) return;
    const n = s.segs.length / 2;
    const [cBody, cStripe, cHead] = PALETTES[s.palette % PALETTES.length];
    const scale = (s.r * 2) / 64;
    const boostGlow = s.boosting ? 0.15 + 0.1 * Math.sin(this.time * 30) : 0;

    // 필요한 만큼 스프라이트 확보(꼬리가 아래, 머리가 위에 그려지도록 앞쪽에 끼워 넣는다)
    while (g.bodySprites.length < n) {
      const sh = new Sprite(this.tex.shadow);
      sh.anchor.set(0.5);
      const b = new Sprite(this.tex.body);
      b.anchor.set(0.5);
      const shine = new Sprite(this.tex.shine);
      shine.anchor.set(0.5);
      shine.alpha = 0.55;
      g.shadows.addChildAt(sh, 0);
      g.bodies.addChildAt(shine, 0);
      g.bodies.addChildAt(b, 0);
      g.shadowSprites.push(sh);
      g.bodySprites.push(b);
      g.shineSprites.push(shine);
    }
    for (let i = 0; i < g.bodySprites.length; i++) {
      const b = g.bodySprites[i], sh = g.shadowSprites[i], shine = g.shineSprites[i];
      if (i >= n) {
        b.visible = sh.visible = shine.visible = false;
        continue;
      }
      const x = s.segs[i * 2], y = s.segs[i * 2 + 1];
      // 꼬리로 갈수록 살짝 가늘게
      const taper = i > n - 6 ? 0.7 + 0.3 * ((n - i) / 6) : 1;
      // 꿈틀거림: 마디마다 숨 쉬듯 크기가 출렁인다
      const wiggle = 1 + 0.05 * Math.sin(this.time * 10 - i * 0.7);
      sh.position.set(x + 3, y + 6);
      sh.scale.set(scale * taper * 1.05);
      sh.visible = true;
      if (i === 0) {
        // 머리는 따로 그린다
        b.visible = shine.visible = false;
        continue;
      }
      b.visible = shine.visible = true;
      b.position.set(x, y);
      b.scale.set(scale * taper * wiggle);
      b.tint = Math.floor(i / 2) % 2 === 0 ? cBody : cStripe;
      b.alpha = 1;
      shine.position.set(x - s.r * 0.25 * taper, y - s.r * 0.35 * taper);
      shine.scale.set(scale * taper * 0.9);
      shine.alpha = 0.45 + boostGlow;
    }
    // 머리
    const hx = s.segs[0], hy = s.segs[1];
    g.head.position.set(hx, hy);
    g.head.scale.set(scale * 1.18);
    g.head.tint = cHead;
    g.face.position.set(hx, hy);
    g.face.rotation = s.angle;
    g.face.scale.set(scale * 1.18 * 0.95);
    g.label.position.set(hx, hy - s.r * 2.2);
    g.label.scale.set(1 / Math.max(0.6, this.zoom));
    // 살금살금이면 반투명
    const a = s.sneaking ? 0.7 : 1;
    g.bodies.alpha = a;
    g.head.alpha = g.face.alpha = a;
    // 부스트 잔상 파티클
    if (s.boosting && Math.random() < 0.6) {
      const ti = Math.max(0, n - 1);
      this.spawnParticle(s.segs[ti * 2], s.segs[ti * 2 + 1], cBody, 20 + Math.random() * 40, 0.4, 0.4);
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
      const k = p.life / p.max;
      p.s.alpha = k;
      p.s.scale.set(Math.max(0.05, p.s.scale.x + p.grow * dt));
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
      // 톡 튀어나왔다가 떠오르며 사라짐
      const pop = age < 0.18 ? 0.3 + (age / 0.18) * 0.95 : 1.25 - Math.min(0.25, (age - 0.18) * 1.5);
      p.t.scale.set(pop / Math.max(0.6, this.zoom));
      p.t.y += p.vy * dt;
      p.t.alpha = Math.min(1, p.life / 0.4);
    }
  }

  /** 미니맵용 */
  get camera() {
    return { x: this.camX, y: this.camY, zoom: this.zoom };
  }
}

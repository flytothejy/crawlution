// 천적(공공의 적): 판 중간중간 하나씩 나타나 모두를 위협한다. 나타나기 3초 전에 경보.
import { CONFIG } from './config';
import type { Simulation, Snake } from './sim';
import type { EnemyKind, EnemyView } from './types';

interface Shadow {
  x: number;
  y: number;
  r: number;
  t: number;
  total: number;
}

interface Drop extends Shadow {}

export const ENEMY_KINDS: EnemyKind[] = ['bird', 'frog', 'rain', 'centipede', 'anteater', 'child'];

export class Enemies {
  kind: EnemyKind | null = null;
  phase: 'idle' | 'warn' | 'active' = 'idle';
  next: number = CONFIG.enemyFirst;
  private last: EnemyKind | null = null;
  private t = 0; // 단계 타이머(경보 남은 시간 / 활동 남은 시간)
  x = 0;
  y = 0;
  angle = 0;
  // 새
  shadows: Shadow[] = [];
  private dives = 0;
  private diveT = 0;
  // 개구리
  aim: { x: number; y: number; t: number; total: number } | null = null;
  private tongue: { x: number; y: number; t: number } | null = null;
  private cd = 0;
  // 소나기
  drops: Drop[] = [];
  private dropAcc = 0;
  // 개미핥기
  strip: { x1: number; y1: number; w: number; t: number; total: number; lick: number } | null = null;
  private licks = 0;
  // 어린아이(채집망)
  private netTarget = -1;
  private retarget = 0;
  swoop = 0; // 0이면 이동 중, >0이면 내려치기 준비(남은 시간)
  held: number[] = [];

  constructor(private sim: Simulation) {}

  reset() {
    this.kind = null;
    this.phase = 'idle';
    this.next = CONFIG.enemyFirst;
    this.last = null;
    this.shadows = [];
    this.drops = [];
    this.aim = this.tongue = this.strip = null;
    this.held = [];
  }

  private edgePoint(): [number, number, number] {
    const a = this.sim.rng.range(0, Math.PI * 2);
    const R = CONFIG.arenaRadius - 30;
    return [Math.cos(a) * R, Math.sin(a) * R, a + Math.PI];
  }

  /** 몸이 긴 곤충일수록 잘 뽑힌다 */
  private pickWeighted(top = 5): Snake | null {
    const c = this.sim.snakes
      .filter((s) => this.sim.onField(s) && !s.isBoss)
      .map((s) => ({ s, v: s.segCount * (s.sneaking ? 0.4 : 1) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, top);
    const sum = c.reduce((n, x) => n + x.v, 0);
    let roll = this.sim.rng.next() * sum;
    for (const x of c) {
      roll -= x.v;
      if (roll <= 0) return x.s;
    }
    return c[0]?.s ?? null;
  }

  update(dt: number) {
    const sim = this.sim;
    if (this.phase === 'idle') {
      if (sim.time < this.next) return;
      const pool = ENEMY_KINDS.filter((k) => k !== this.last);
      this.kind = sim.rng.pick(pool);
      this.phase = 'warn';
      this.t = CONFIG.enemyWarn;
      [this.x, this.y, this.angle] = this.edgePoint();
      if (this.kind === 'child' || this.kind === 'rain' || this.kind === 'bird') {
        const s = this.pickWeighted(3);
        if (s) ((this.x = s.x), (this.y = s.y));
      }
      sim.events.push({ type: 'enemyWarn', kind: this.kind, x: this.x, y: this.y });
      return;
    }
    if (this.phase === 'warn') {
      this.t -= dt;
      if (this.t <= 0) this.start();
      return;
    }
    switch (this.kind) {
      case 'bird':
        this.updateBird(dt);
        break;
      case 'frog':
        this.updateFrog(dt);
        break;
      case 'rain':
        this.updateRain(dt);
        break;
      case 'centipede':
        this.updateCentipede(dt);
        break;
      case 'anteater':
        this.updateAnteater(dt);
        break;
      case 'child':
        this.updateChild(dt);
        break;
    }
  }

  private start() {
    const sim = this.sim;
    this.phase = 'active';
    const k = this.kind!;
    if (k === 'bird') ((this.dives = CONFIG.birdDives), (this.diveT = 0), (this.t = 99));
    if (k === 'frog') ((this.t = CONFIG.frogLife), (this.cd = 0.5));
    if (k === 'rain') ((this.t = CONFIG.rainLife), (this.dropAcc = 0));
    if (k === 'centipede') {
      this.t = CONFIG.centipedeLife;
      sim.spawnCentipede(this.x * 0.92, this.y * 0.92);
    }
    if (k === 'anteater') ((this.licks = CONFIG.anteaterLicks), (this.cd = 0.3), (this.t = 99));
    if (k === 'child') {
      this.t = CONFIG.childLife;
      this.cd = CONFIG.netEvery;
      this.swoop = 0;
      this.retarget = 0;
    }
    sim.events.push({ type: 'enemyStart', kind: k, x: this.x, y: this.y });
  }

  private end(killed = false) {
    const sim = this.sim;
    sim.events.push({ type: 'enemyEnd', kind: this.kind!, killed });
    this.last = this.kind;
    this.kind = null;
    this.phase = 'idle';
    this.shadows = [];
    this.drops = [];
    this.aim = this.tongue = this.strip = null;
    this.next = sim.time + sim.rng.range(CONFIG.enemyGapMin, CONFIG.enemyGapMax);
  }

  /** 왕지네가 죽었을 때 sim이 알려 준다 */
  centipedeKilled() {
    if (this.kind === 'centipede' && this.phase === 'active') this.end(true);
  }

  // ---------- 새: 그림자 급강하 ----------
  private updateBird(dt: number) {
    const sim = this.sim;
    this.diveT -= dt;
    if (this.diveT <= 0 && this.dives > 0) {
      const target = this.pickWeighted(4);
      if (target) {
        const lead = CONFIG.birdShadowTime * 0.6;
        const sp = CONFIG.stageSpeed[target.stage];
        this.shadows.push({
          x: target.x + Math.cos(target.angle) * sp * lead,
          y: target.y + Math.sin(target.angle) * sp * lead,
          r: CONFIG.birdRadius, t: CONFIG.birdShadowTime, total: CONFIG.birdShadowTime,
        });
      }
      this.dives--;
      this.diveT = CONFIG.birdDiveEvery;
    }
    for (let k = this.shadows.length - 1; k >= 0; k--) {
      const sh = this.shadows[k];
      sh.t -= dt;
      if (sh.t > 0) continue;
      sim.events.push({ type: 'birdDive', x: sh.x, y: sh.y, r: sh.r });
      for (const s of sim.snakes) {
        if (!sim.onField(s) || s.isBoss || s.flyT > 0) continue;
        const headIn = Math.hypot(s.x - sh.x, s.y - sh.y) < sh.r;
        let bodyIn = headIn;
        for (let i = 0; i < s.segN && !bodyIn; i += 2) if (Math.hypot(s.segs[i * 2] - sh.x, s.segs[i * 2 + 1] - sh.y) < sh.r) bodyIn = true;
        if (bodyIn) sim.damage(s, s.maxHp * CONFIG.birdDamage * (headIn ? 1 : 0.6), -1, 'enemy', s.x, s.y, 'enemy', 'bird');
      }
      this.shadows.splice(k, 1);
    }
    if (this.dives <= 0 && this.shadows.length === 0) this.end();
  }

  // ---------- 개구리: 가장자리에서 혀 발사 ----------
  private updateFrog(dt: number) {
    const sim = this.sim;
    this.t -= dt;
    if (this.tongue) {
      this.tongue.t -= dt;
      if (this.tongue.t <= 0) this.tongue = null;
    }
    if (this.aim) {
      this.aim.t -= dt;
      if (this.aim.t <= 0) {
        // 발사: 예고선 방향으로 혀를 쭉 뻗는다
        const dx = this.aim.x - this.x, dy = this.aim.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const L = Math.min(CONFIG.frogRange, d + 140);
        const ex = this.x + (dx / d) * L, ey = this.y + (dy / d) * L;
        this.tongue = { x: ex, y: ey, t: 0.35 };
        sim.events.push({ type: 'tongue', x0: this.x, y0: this.y, x1: ex, y1: ey });
        for (const s of sim.snakes) {
          if (!sim.onField(s) || s.isBoss || s.flyT > 0) continue;
          const w = 22 + s.r;
          if (segDist(s.x, s.y, this.x, this.y, ex, ey) < w) {
            sim.damage(s, s.maxHp * CONFIG.frogHead, -1, 'enemy', s.x, s.y, 'enemy', 'frog');
            if (s.alive) sim.shove(s, Math.atan2(this.y - s.y, this.x - s.x), 220);
            continue;
          }
          for (let i = 2; i < s.segN; i += 2) {
            if (segDist(s.segs[i * 2], s.segs[i * 2 + 1], this.x, this.y, ex, ey) < w) {
              sim.damage(s, s.maxHp * CONFIG.frogHead * 0.55, -1, 'enemy', s.segs[i * 2], s.segs[i * 2 + 1], 'enemy', 'frog');
              break;
            }
          }
        }
        this.aim = null;
        this.cd = CONFIG.frogEvery;
      }
      return;
    }
    this.cd -= dt;
    if (this.cd <= 0 && this.t > 0) {
      let best: Snake | null = null, bd: number = CONFIG.frogRange;
      for (const s of sim.snakes) {
        if (!sim.onField(s) || s.isBoss) continue;
        const d = Math.hypot(s.x - this.x, s.y - this.y);
        if (d < bd) ((bd = d), (best = s));
      }
      if (best) {
        const sp = CONFIG.stageSpeed[best.stage] * 0.45;
        this.aim = { x: best.x + Math.cos(best.angle) * sp, y: best.y + Math.sin(best.angle) * sp, t: CONFIG.frogAim, total: CONFIG.frogAim };
        this.angle = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
      } else this.cd = 0.5;
    }
    if (this.t <= 0 && !this.aim && !this.tongue) this.end();
  }

  // ---------- 소나기: 빗방울이 곳곳에 떨어짐(몸이 길수록 많이 맞음) ----------
  private updateRain(dt: number) {
    const sim = this.sim;
    this.t -= dt;
    if (this.t > 0) {
      this.dropAcc += dt;
      while (this.dropAcc >= CONFIG.rainEvery) {
        this.dropAcc -= CONFIG.rainEvery;
        const s = this.pickWeighted(12);
        if (!s || s.segN < 1) continue;
        const i = Math.floor(sim.rng.next() * s.segN);
        const a = sim.rng.range(0, Math.PI * 2), d = sim.rng.range(0, 90);
        const r = CONFIG.rainRadius;
        this.drops.push({ x: s.segs[i * 2] + Math.cos(a) * d, y: s.segs[i * 2 + 1] + Math.sin(a) * d, r, t: CONFIG.rainWarn, total: CONFIG.rainWarn });
      }
    }
    for (let k = this.drops.length - 1; k >= 0; k--) {
      const dr = this.drops[k];
      dr.t -= dt;
      if (dr.t > 0) continue;
      sim.events.push({ type: 'drop', x: dr.x, y: dr.y, r: dr.r });
      for (const s of sim.snakes) {
        if (!sim.onField(s) || s.isBoss || s.flyT > 0) continue;
        for (let i = 0; i < s.segN; i += 2) {
          if (Math.hypot(s.segs[i * 2] - dr.x, s.segs[i * 2 + 1] - dr.y) < dr.r + s.r * 0.5) {
            sim.damage(s, s.maxHp * CONFIG.rainDamage, -1, 'enemy', dr.x, dr.y, 'enemy', 'rain');
            s.slowT = Math.max(s.slowT, 1.2);
            break;
          }
        }
      }
      this.drops.splice(k, 1);
    }
    if (this.t <= 0 && this.drops.length === 0) this.end();
  }

  // ---------- 왕지네: 1등을 쫓아다님 ----------
  private updateCentipede(dt: number) {
    const sim = this.sim;
    this.t -= dt;
    const b = sim.bossId >= 0 ? sim.snakes[sim.bossId] : null;
    if (b && b.alive) ((this.x = b.x), (this.y = b.y));
    if (this.t <= 0) {
      sim.despawnCentipede();
      this.end(false);
    }
  }

  // ---------- 개미핥기: 긴 혀로 띠 모양을 핥아 마디를 뜯어 감 ----------
  private updateAnteater(dt: number) {
    const sim = this.sim;
    if (this.strip) {
      const st = this.strip;
      if (st.t > 0) {
        st.t -= dt;
        if (st.t <= 0) {
          // 핥기!
          st.lick = 0.45;
          sim.events.push({ type: 'lick', x0: this.x, y0: this.y, x1: st.x1, y1: st.y1, w: st.w });
          for (const s of sim.snakes) {
            if (!sim.onField(s) || s.isBoss || s.flyT > 0) continue;
            let hit = false;
            for (let i = 0; i < s.segN && !hit; i += 2) if (segDist(s.segs[i * 2], s.segs[i * 2 + 1], this.x, this.y, st.x1, st.y1) < st.w / 2 + s.r) hit = true;
            if (!hit) continue;
            sim.eatTail(s, Math.floor(s.segCount * CONFIG.anteaterEat));
            sim.damage(s, s.maxHp * 0.1, -1, 'enemy', s.x, s.y, 'enemy', 'anteater');
          }
          sim.foods = sim.foods.filter((f) => segDist(f.x, f.y, this.x, this.y, st.x1, st.y1) > st.w / 2);
        }
      } else {
        st.lick -= dt;
        if (st.lick <= 0) {
          this.strip = null;
          this.licks--;
          this.cd = 1.2;
        }
      }
      return;
    }
    this.cd -= dt;
    if (this.cd > 0) return;
    if (this.licks <= 0) return this.end();
    const target = this.pickWeighted(8);
    const tx = target ? target.x : 0, ty = target ? target.y : 0;
    this.angle = Math.atan2(ty - this.y, tx - this.x);
    const L = CONFIG.anteaterLen;
    this.strip = { x1: this.x + Math.cos(this.angle) * L, y1: this.y + Math.sin(this.angle) * L, w: CONFIG.anteaterWidth, t: CONFIG.anteaterAim, total: CONFIG.anteaterAim, lick: 0 };
  }

  // ---------- 어린아이: 채집망으로 덮쳐 가둠 ----------
  private updateChild(dt: number) {
    const sim = this.sim;
    this.t -= dt;
    this.held = this.held.filter((id) => sim.snakes[id].netT > 0);
    // 목표: 가까우면서 긴 곤충(4초마다 다시 고름)
    this.retarget -= dt;
    let tgt = this.netTarget >= 0 ? sim.snakes[this.netTarget] : null;
    if (this.retarget <= 0 || !tgt || !sim.onField(tgt)) {
      let best = -1;
      tgt = null;
      for (const s of sim.snakes) {
        if (!sim.onField(s) || s.isBoss || s.invulnT > 0) continue;
        const v = s.segCount / (300 + Math.hypot(s.x - this.x, s.y - this.y));
        if (v > best) ((best = v), (tgt = s));
      }
      this.netTarget = tgt ? tgt.id : -1;
      this.retarget = 4;
    }
    if (tgt) {
      const sp = CONFIG.stageSpeed[tgt.stage];
      const tx = tgt.x + Math.cos(tgt.angle) * sp * 0.35, ty = tgt.y + Math.sin(tgt.angle) * sp * 0.35;
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      const speed = CONFIG.netSpeed * (this.swoop > 0 ? 0.75 : 1); // 내려치는 중에도 따라간다
      if (d > 1) {
        const v = Math.min(d, speed * dt);
        this.x += (dx / d) * v;
        this.y += (dy / d) * v;
      }
      if (this.swoop <= 0) {
        this.cd -= dt;
        if (this.cd <= 0 && this.t > 0 && d < 240) this.swoop = CONFIG.netAim;
      }
    }
    if (this.swoop > 0) {
      this.swoop -= dt;
      if (this.swoop <= 0) {
        let caught = 0;
        for (const s of sim.snakes) {
          if (!sim.onField(s) || s.isBoss || s.flyT > 0 || s.invulnT > 0) continue;
          if (Math.hypot(s.x - this.x, s.y - this.y) < CONFIG.netRadius) {
            sim.capture(s);
            this.held.push(s.id);
            caught++;
          }
        }
        sim.events.push({ type: 'netSwoop', x: this.x, y: this.y, r: CONFIG.netRadius, caught });
        this.cd = CONFIG.netEvery;
        this.retarget = 0;
      }
    }
    if (this.t <= 0 && this.held.length === 0 && this.swoop <= 0) this.end();
  }

  /** 봇이 피해야 할 위험도(0~1) */
  hazard(x: number, y: number): number {
    if (this.phase !== 'active') return 0;
    let h = 0;
    for (const sh of this.shadows) if (Math.hypot(x - sh.x, y - sh.y) < sh.r + 20) h = Math.max(h, 0.9);
    for (const d of this.drops) if (Math.hypot(x - d.x, y - d.y) < d.r + 10) h = Math.max(h, 0.5);
    if (this.aim && segDist(x, y, this.x, this.y, this.aim.x + (this.aim.x - this.x) * 0.3, this.aim.y + (this.aim.y - this.y) * 0.3) < 50) h = Math.max(h, 0.9);
    if (this.strip && this.strip.t > 0 && segDist(x, y, this.x, this.y, this.strip.x1, this.strip.y1) < this.strip.w / 2 + 20) h = Math.max(h, 0.9);
    if (this.kind === 'child' && Math.hypot(x - this.x, y - this.y) < CONFIG.netRadius + 40) h = Math.max(h, this.swoop > 0 ? 1 : 0.6);
    if (this.kind === 'frog' && Math.hypot(x - this.x, y - this.y) < 160) h = Math.max(h, 0.7);
    return h;
  }

  view(): EnemyView | null {
    if (!this.kind) return null;
    const warn = this.phase === 'warn' ? this.t : 0;
    const sim = this.sim;
    switch (this.kind) {
      case 'bird':
        return { kind: 'bird', warn, shadows: this.shadows.map((s) => ({ ...s })) };
      case 'frog':
        return { kind: 'frog', warn, x: this.x, y: this.y, angle: this.angle, aim: this.aim ? { ...this.aim } : null, tongue: this.tongue ? { ...this.tongue } : null };
      case 'rain':
        return { kind: 'rain', warn, drops: this.drops.map((d) => ({ ...d })) };
      case 'centipede':
        return { kind: 'centipede', warn, x: this.x, y: this.y, bossId: sim.bossId, life: Math.max(0, this.t) };
      case 'anteater':
        return { kind: 'anteater', warn, x: this.x, y: this.y, angle: this.angle, strip: this.strip ? { ...this.strip } : null };
      case 'child':
        return {
          kind: 'child', warn, x: this.x, y: this.y, r: CONFIG.netRadius, swoop: this.swoop > 0 ? 1 - this.swoop / CONFIG.netAim : 0,
          held: this.held.map((id) => ({ x: sim.snakes[id].x, y: sim.snakes[id].y, t: sim.snakes[id].netT })),
        };
    }
  }
}

/** 점과 선분 사이 거리 */
export function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0, dy = y1 - y0;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

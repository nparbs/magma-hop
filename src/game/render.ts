// Draws the world on a 2D canvas. Everything is shapes in code: no image files.

import {
  BOLT_HALF, BOLT_LIVE, BOLT_WARN, DEBRIS_R, DRONE_R, HazardKind, Kind, PLAYER_H, RESPAWN_TICKS, Sim, UNITS_PER_METER, WIDTH,
  hazardPos, platX, platY,
} from '../sim/sim';
import { ZONES, zoneIndexAt } from '../sim/zones';
import { hashFrac } from '../sim/rng';

const FONT = '"Fredoka", system-ui, sans-serif';
/** The column is always at least this tall in world units; tall phones see more. */
const VIEW_MIN_H = 660;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  spin?: number;
  shape?: 'sq' | 'dot' | 'star';
}

export interface Marker {
  meters: number;
  label: string;
  color: string;
}

// ---------- Color helpers ----------

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const r = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t);
  return `rgb(${r(0)},${r(1)},${r(2)})`;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** How much of zone `i` is showing at this height (fades over 120 m around each border). */
function zoneWeight(i: number, m: number): number {
  const from = ZONES[i].from;
  const to = i + 1 < ZONES.length ? ZONES[i + 1].from : Infinity;
  return clamp01((m - from + 60) / 120) * (to === Infinity ? 1 : clamp01((to - m + 60) / 120));
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  /** Pixels per world unit. */
  s = 1;
  /** Column left edge on screen, px. */
  ox = 0;
  camY = 0;
  private dpr = 1;
  private particles: Particle[] = [];
  private shake = 0;
  private flash = 0;
  private flashColor = '#fff';
  private squash = 0;
  private springAnim = new Map<number, number>();
  private wind: { x: number; y: number; len: number; sp: number }[] = [];
  private time = 0;
  private face = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    // Short landscape phones trade a little view height for a wider column.
    this.s = Math.min(this.w / WIDTH, this.h / (this.h < 500 ? VIEW_MIN_H * 0.8 : VIEW_MIN_H));
    this.ox = (this.w - WIDTH * this.s) / 2;
  }

  /** Column width in px. */
  get colW(): number {
    return WIDTH * this.s;
  }

  snapCamera(y: number): void {
    this.camY = y + 120;
  }

  sx(x: number): number {
    return this.ox + x * this.s;
  }
  sy(y: number): number {
    return this.h * 0.5 - (y - this.camY) * this.s;
  }

  // ---------- Effects the game asks for ----------

  burst(x: number, y: number, n: number, color: string, speed = 3, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1, life: 0, max: 30 + Math.random() * 30,
        color, size: 3 + Math.random() * 3, grav: 0.15, shape: 'dot', ...opts,
      });
    }
  }

  onEvent(e: Sim['events'][number], sim: Sim): void {
    switch (e.t) {
      case 'bounce':
        this.squash = 1;
        if (e.kind === Kind.Ice) this.burst(e.x, e.y, 6, '#e8fbff', 2, { grav: 0.05, shape: 'star' });
        else this.burst(e.x, e.y, 3, 'rgba(255,255,255,0.7)', 1.5, { grav: 0, max: 18 });
        break;
      case 'spring':
        this.squash = 1.4;
        this.burst(e.x, e.y, 14, '#ffd84a', 4, { shape: 'star', grav: 0.05 });
        for (const p of sim.platforms) if (p.spring !== null && Math.abs(platY(p, sim.tick) - e.y) < 1) this.springAnim.set(p.id, 1);
        break;
      case 'crumble':
        for (let i = 0; i < 10; i++) {
          this.particles.push({
            x: e.x + (Math.random() - 0.5) * 60, y: e.y - 4, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2,
            life: 0, max: 60, color: '#a67c52', size: 5 + Math.random() * 5, grav: 0.35, spin: Math.random(), shape: 'sq',
          });
        }
        break;
      case 'fake':
        this.burst(e.x, e.y, 16, 'rgba(255,255,255,0.8)', 2.5, { grav: -0.02, max: 40 });
        break;
      case 'stomp':
        this.squash = 1.2;
        this.burst(e.x, e.y, 18, '#ff5d73', 4, { shape: 'sq' });
        this.shake = Math.max(this.shake, 6);
        break;
      case 'strike':
        this.flash = 1;
        this.flashColor = '#e9f0ff';
        this.shake = Math.max(this.shake, 10);
        break;
      case 'die':
        this.burst(e.x, e.y + PLAYER_H / 2, 40, '#ffb347', 6, { shape: 'sq' });
        this.burst(e.x, e.y + PLAYER_H / 2, 20, '#ffffff', 4);
        this.shake = 18;
        this.flash = 0.8;
        this.flashColor = '#ff4d4d';
        break;
    }
  }

  // ---------- The frame ----------

  draw(sim: Sim, alpha: number, prev: { x: number; y: number }, markers: Marker[], dt: number): void {
    const { ctx } = this;
    this.time += dt;
    const k = dt * 60;

    // Smoothed player position between ticks.
    let px = sim.x;
    let py = sim.y;
    if (Math.abs(sim.x - prev.x) < WIDTH / 2) px = prev.x + (sim.x - prev.x) * alpha;
    py = prev.y + (sim.y - prev.y) * alpha;
    if (sim.vx > 0.5) this.face = 1;
    else if (sim.vx < -0.5) this.face = -1;

    const target = py + 120;
    const follow = target < this.camY ? 0.16 : 0.12;
    this.camY += (target - this.camY) * (1 - Math.pow(1 - follow, k));

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const shx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - 0.8 * k);

    const camM = this.camY / UNITS_PER_METER;
    this.drawSky(camM);
    ctx.save();
    ctx.translate(shx, shy);
    this.drawBackdrop(camM);

    // Column clip so wrap copies don't spill.
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.ox, 0, this.colW, this.h);
    ctx.clip();

    this.drawWind(sim, k);
    this.drawMarkers(markers);
    this.drawPlatforms(sim, alpha);
    this.drawHazards(sim, alpha);
    this.drawBolts(sim);
    this.drawParticles(k);
    if (!sim.dead) this.drawPlayer(px, py, sim, k);
    ctx.restore();

    this.drawEdges();
    ctx.restore();

    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.55;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - 0.06 * k);
    }
  }

  private drawSky(m: number): void {
    const { ctx } = this;
    let top = ZONES[0].sky[0];
    let bot = ZONES[0].sky[1];
    for (let i = 1; i < ZONES.length; i++) {
      const t = clamp01((m - ZONES[i].from + 60) / 120);
      if (t > 0) {
        top = mix(top.startsWith('#') ? top : rgbToHex(top), ZONES[i].sky[0], t);
        bot = mix(bot.startsWith('#') ? bot : rgbToHex(bot), ZONES[i].sky[1], t);
      }
    }
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /** Parallax scenery: skyline, clouds, aurora, stars, the planet, the void's glow. */
  private drawBackdrop(m: number): void {
    const { ctx, s } = this;
    const pY = (wy: number, P: number) => this.h * 0.5 - (wy - this.camY) * P * s;

    // Stars from the glacier up.
    const starA = clamp01((m - 1100) / 700);
    if (starA > 0) {
      const cell = 70;
      const off = (this.camY * 0.04 * s) % cell;
      for (let cy = -1; cy < this.h / cell + 1; cy++) {
        const row = Math.floor(this.camY * 0.04 * s / cell) - cy;
        for (let cx = 0; cx < this.w / cell + 1; cx++) {
          const f = hashFrac(row, cx);
          if (f > 0.55) continue;
          const x = cx * cell + hashFrac(cx, row + 7) * cell;
          const y = cy * cell + off + hashFrac(row, cx + 3) * cell;
          const tw = 0.6 + 0.4 * Math.sin(this.time * (1 + f * 3) + f * 50);
          ctx.globalAlpha = starA * tw * (0.4 + f);
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, y, f < 0.08 ? 2.5 : 1.5, f < 0.08 ? 2.5 : 1.5);
        }
      }
      ctx.globalAlpha = 1;
    }

    // The void's nebulae.
    const voidA = zoneWeight(5, m);
    if (voidA > 0) {
      for (let i = 0; i < 5; i++) {
        const x = this.w * hashFrac(i, 91);
        const y = ((pY(30000 + i * 900, 0.08) % (this.h * 1.6)) + this.h * 1.6) % (this.h * 1.6) - this.h * 0.3;
        const r = 140 + 160 * hashFrac(i, 17);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, i % 2 ? 'rgba(170,70,255,0.35)' : 'rgba(40,200,220,0.25)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = voidA;
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }

    // The planet below you in orbit.
    const orbitA = clamp01((m - 1700) / 300) * clamp01((3600 - m) / 600);
    if (orbitA > 0) {
      // Its top edge sinks slowly as you climb away from it.
      const R = Math.max(this.w, this.h) * 1.4;
      const cy = this.h * 0.7 + (m - 2000) * 0.3 * s + R;
      ctx.globalAlpha = orbitA;
      const g = ctx.createRadialGradient(this.w / 2, cy, R * 0.9, this.w / 2, cy, R * 1.04);
      g.addColorStop(0, '#2b6cb0');
      g.addColorStop(0.8, '#5fb3e8');
      g.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.w / 2, cy, R * 1.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Aurora ribbons over the glacier.
    const aurA = zoneWeight(3, m);
    if (aurA > 0) {
      ctx.lineWidth = 28;
      ctx.lineCap = 'round';
      for (let r = 0; r < 3; r++) {
        ctx.strokeStyle = r === 1 ? 'rgba(140,120,255,0.18)' : 'rgba(90,255,190,0.2)';
        ctx.globalAlpha = aurA;
        ctx.beginPath();
        for (let x = -20; x <= this.w + 20; x += 20) {
          const y = this.h * (0.22 + r * 0.1) + Math.sin(x * 0.008 + this.time * 0.4 + r) * 40 + Math.sin(x * 0.02 + this.time * 0.9) * 12;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Clouds: white in the cloudline, bruised in the storm.
    const cloudA = clamp01((m - 120) / 150) * clamp01((1500 - m) / 250);
    if (cloudA > 0) {
      const P = 0.45;
      const cell = 240;
      const base = Math.floor((this.camY * P - this.h / s) / cell);
      for (let c = base; c < base + Math.ceil((this.h * 2) / (s * cell)) + 2; c++) {
        for (let j = 0; j < 3; j++) {
          const f = hashFrac(c, j);
          if (f > 0.7) continue;
          const wy = (c * cell + hashFrac(c, j + 10) * cell) / P;
          const y = pY(wy, P);
          if (y < -120 || y > this.h + 120) continue;
          const x = hashFrac(c, j + 20) * (this.w + 200) - 100;
          const storm = clamp01((wy / UNITS_PER_METER - 650) / 120);
          this.cloud(x, y, (40 + 60 * f) * Math.max(0.7, s), mix('#ffffff', '#4a4f78', storm), cloudA * (0.55 + 0.3 * f));
        }
      }
    }

    // Rooftops skyline.
    const cityA = clamp01((900 - m) / 400);
    if (cityA > 0) {
      for (const [P, col, hMul, seed] of [
        [0.18, '#c97b84', 0.9, 3],
        [0.32, '#7a5c7c', 1.2, 5],
        [0.5, '#3d3557', 1.6, 9],
      ] as const) {
        const ground = pY(0, P) + 40 * s;
        ctx.fillStyle = col;
        ctx.globalAlpha = cityA;
        let x = -10;
        let i = 0;
        while (x < this.w + 10) {
          const bw = (30 + 50 * hashFrac(seed, i)) * Math.max(0.8, s);
          const bh = (60 + 220 * hashFrac(i, seed)) * hMul * Math.max(0.8, s);
          ctx.fillRect(x, ground - bh, bw - 3, bh + this.h);
          if (P === 0.5) {
            ctx.fillStyle = '#ffd98a';
            for (let wy = ground - bh + 10; wy < Math.min(ground - 8, this.h); wy += 16) {
              for (let wx = x + 6; wx < x + bw - 10; wx += 12) {
                if (hashFrac(Math.floor(wx), Math.floor(wy)) < 0.35) ctx.fillRect(wx, wy, 5, 7);
              }
            }
            ctx.fillStyle = col;
          }
          x += bw;
          i++;
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  private cloud(x: number, y: number, r: number, color: string, a: number): void {
    const { ctx } = this;
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.9, y + r * 0.2, r * 0.75, 0, Math.PI * 2);
    ctx.arc(x - r * 0.9, y + r * 0.25, r * 0.65, 0, Math.PI * 2);
    ctx.arc(x + r * 0.3, y - r * 0.45, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Dim the space beside the column and draw the shimmering wrap edges. */
  private drawEdges(): void {
    const { ctx } = this;
    if (this.ox < 2) return;
    ctx.fillStyle = 'rgba(8,10,30,0.42)';
    ctx.fillRect(0, 0, this.ox, this.h);
    ctx.fillRect(this.ox + this.colW, 0, this.w - this.ox - this.colW, this.h);
    for (const ex of [this.ox, this.ox + this.colW]) {
      const g = ctx.createLinearGradient(ex - 6, 0, ex + 6, 0);
      g.addColorStop(0, 'rgba(160,220,255,0)');
      g.addColorStop(0.5, `rgba(160,220,255,${0.35 + 0.15 * Math.sin(this.time * 3)})`);
      g.addColorStop(1, 'rgba(160,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ex - 6, 0, 12, this.h);
    }
  }

  /** Call fn at x and at its wrapped copy when it's near an edge. */
  private wrapped(x: number, margin: number, fn: (x: number) => void): void {
    fn(x);
    if (x < margin) fn(x + WIDTH);
    if (x > WIDTH - margin) fn(x - WIDTH);
  }

  private visible(y: number, pad = 80): boolean {
    const top = this.camY + (this.h * 0.5) / this.s + pad;
    const bot = this.camY - (this.h * 0.5) / this.s - pad;
    return y < top && y > bot;
  }

  private drawMarkers(markers: Marker[]): void {
    const { ctx } = this;
    for (const mk of markers) {
      const wy = mk.meters * UNITS_PER_METER;
      if (!this.visible(wy, 20) || mk.meters <= 0) continue;
      const y = this.sy(wy);
      ctx.strokeStyle = mk.color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(this.ox, y);
      ctx.lineTo(this.ox + this.colW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `600 ${Math.round(12 * Math.max(1, this.s))}px ${FONT}`;
      ctx.fillStyle = mk.color;
      ctx.textAlign = 'right';
      ctx.fillText(mk.label, this.ox + this.colW - 8, y - 6);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlatforms(sim: Sim, alpha: number): void {
    const { ctx, s } = this;
    const t = sim.tick - 1 + alpha;
    for (const p of sim.platforms) {
      const wy = platY(p, t);
      if (!this.visible(wy)) continue;
      const zi = zoneIndexAt(p.y / UNITS_PER_METER);
      let [face, edge] = ZONES[zi].plat;
      let a = 1;
      if (p.kind === Kind.Crumble) [face, edge] = ['#c49a6c', '#7d5a3a'];
      if (p.kind === Kind.Ice) [face, edge] = ['#dff8ff', '#7fd0ee'];
      if (p.broken >= 0) {
        const since = sim.tick - p.broken;
        // A faint outline while it waits to come back.
        a = since > RESPAWN_TICKS - 60 ? 0.25 + 0.5 * ((since - (RESPAWN_TICKS - 60)) / 60) : 0.12;
      }
      if (p.kind === Kind.Fake && p.broken < 0) a = 0.78 + 0.08 * Math.sin(this.time * 7 + p.id);
      const x0 = platX(p, t);
      const pw = p.w * s;
      const th = 11 * s;
      this.wrapped(x0, p.w, (x) => {
        const X = this.sx(x) - pw / 2;
        const Y = this.sy(wy);
        ctx.globalAlpha = a;
        if (p.broken >= 0) {
          ctx.strokeStyle = edge;
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 2;
          roundRect(ctx, X, Y, pw, th, 5 * s);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          return;
        }
        if (p.kind === Kind.Crumble) {
          // Loose bricks with gaps: it breaks after one bounce.
          const n = Math.max(3, Math.round(p.w / 22));
          const gap = 2.5 * s;
          const bw = (pw - gap * (n - 1)) / n;
          for (let i = 0; i < n; i++) {
            const bx = X + i * (bw + gap);
            const by = Y + (hashFrac(p.id, i) - 0.5) * 2 * s;
            ctx.fillStyle = edge;
            roundRect(ctx, bx, by + 2 * s, bw, th, 2.5 * s);
            ctx.fill();
            ctx.fillStyle = face;
            roundRect(ctx, bx, by, bw, th - 3 * s, 2.5 * s);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = edge;
          roundRect(ctx, X, Y + 2 * s, pw, th, 5 * s);
          ctx.fill();
          ctx.fillStyle = face;
          roundRect(ctx, X, Y, pw, th - 3 * s, 5 * s);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(X + 6 * s, Y + 2 * s, pw - 12 * s, 2 * s);
        }

        if (p.kind === Kind.Ice) {
          ctx.fillStyle = '#bfefff';
          for (let i = 0; i < Math.floor(p.w / 14); i++) {
            const ix = X + 7 * s + i * 14 * s;
            const ih = (5 + 8 * hashFrac(p.id, i)) * s;
            ctx.beginPath();
            ctx.moveTo(ix - 3 * s, Y + th + s);
            ctx.lineTo(ix + 3 * s, Y + th + s);
            ctx.lineTo(ix, Y + th + ih);
            ctx.fill();
          }
        } else if (p.kind === Kind.Fake) {
          // The tell: a hairline gap along the bottom edge.
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.setLineDash([3, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(X + 4, Y + th - 1);
          ctx.lineTo(X + pw - 4, Y + th - 1);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (p.mx !== 0 || p.my !== 0) {
          // Little thrusters keep moving ledges up.
          const fl = 3 + Math.random() * 4;
          ctx.fillStyle = '#ffb347';
          for (const ex of [X + 8 * s, X + pw - 8 * s]) {
            ctx.beginPath();
            ctx.moveTo(ex - 3 * s, Y + th + 1);
            ctx.lineTo(ex + 3 * s, Y + th + 1);
            ctx.lineTo(ex, Y + th + fl * s);
            ctx.fill();
          }
        }
        if (p.spring !== null) {
          const anim = this.springAnim.get(p.id) ?? 0;
          const sxp = this.sx(x + p.spring);
          const hgt = (12 + anim * 10) * s;
          ctx.strokeStyle = '#d9d9e8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let i = 0; i <= 6; i++) {
            const yy = Y - (hgt * i) / 6;
            const xx = sxp + (i % 2 ? 6 : -6) * s;
            if (i === 0) ctx.moveTo(sxp, Y);
            else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
          ctx.fillStyle = '#ff5d73';
          roundRect(ctx, sxp - 10 * s, Y - hgt - 4 * s, 20 * s, 5 * s, 2 * s);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    }
    for (const [id, v] of this.springAnim) {
      const nv = v - 0.06;
      if (nv <= 0) this.springAnim.delete(id);
      else this.springAnim.set(id, nv);
    }
  }

  private drawHazards(sim: Sim, alpha: number): void {
    const { ctx, s } = this;
    const t = sim.tick - 1 + alpha;
    for (const h of sim.hazards) {
      if (h.dead || !this.visible(h.y)) continue;
      const [hx, hy] = hazardPos(h, t);
      this.wrapped(hx, 40, (x) => {
        const X = this.sx(x);
        const Y = this.sy(hy);
        if (h.kind === HazardKind.Drone) {
          const r = DRONE_R * s;
          const zi = zoneIndexAt(h.y / UNITS_PER_METER);
          const body = ['#e04f5f', '#e04f5f', '#ff7a45', '#7de0ff', '#ff5dd1', '#b56cff'][zi];
          // Spikes.
          ctx.fillStyle = zi >= 4 ? '#d9d3f5' : '#2a2140';
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + this.time * 2;
            const rr = i % 2 ? r * 1.0 : r * 1.4;
            ctx.lineTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr);
          }
          ctx.fill();
          ctx.fillStyle = body;
          ctx.beginPath();
          ctx.arc(X, Y, r * 0.9, 0, Math.PI * 2);
          ctx.fill();
          // Eye watching you.
          const dx = Math.sign(sim.x - x) * 3 * s;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(X + dx, Y - 1 * s, r * 0.42, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1b1530';
          ctx.beginPath();
          ctx.arc(X + dx * 1.4, Y - 1 * s, r * 0.2, 0, Math.PI * 2);
          ctx.fill();
          // Rotor.
          ctx.strokeStyle = '#2a2140';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(X, Y - r * 1.1);
          ctx.lineTo(X, Y - r * 1.5);
          ctx.stroke();
          const rw = Math.abs(Math.sin(this.time * 30)) * r * 1.3;
          ctx.fillStyle = 'rgba(42,33,64,0.7)';
          ctx.fillRect(X - rw, Y - r * 1.6, rw * 2, 2.5 * s);
        } else {
          const r = DEBRIS_R * s;
          const ang = this.time * 2 * Math.sign(h.a) + h.id;
          ctx.fillStyle = 'rgba(255,150,60,0.35)';
          ctx.beginPath();
          ctx.ellipse(X - Math.sign(h.a) * r * 1.4, Y, r * 1.6, r * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#8b8fa8';
          ctx.strokeStyle = '#4a4e66';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            const a = ang + (i / 7) * Math.PI * 2;
            const rr = r * (0.75 + 0.35 * hashFrac(h.id, i));
            ctx.lineTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });
    }
  }

  private drawBolts(sim: Sim): void {
    const { ctx, s } = this;
    for (const b of sim.bolts) {
      const age = sim.tick - b.start;
      const X = this.sx(b.x);
      if (age < BOLT_WARN) {
        // Warning: a flickering column and a mark at the top.
        const f = age / BOLT_WARN;
        ctx.globalAlpha = 0.12 + 0.25 * f * (0.5 + 0.5 * Math.sin(this.time * 30));
        ctx.fillStyle = '#ffe66d';
        ctx.fillRect(X - BOLT_HALF * s, 0, BOLT_HALF * 2 * s, this.h);
        ctx.globalAlpha = 0.9;
        ctx.font = `700 ${Math.round(22 * s)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('⚡', X, 34 * s);
        ctx.globalAlpha = 1;
      } else if (age <= BOLT_WARN + BOLT_LIVE) {
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = '#9fd3ff';
        ctx.shadowBlur = 24;
        for (let pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? 3 : 9;
          ctx.globalAlpha = pass ? 1 : 0.4;
          ctx.beginPath();
          let x = X;
          ctx.moveTo(x, -10);
          for (let y = 0; y < this.h + 20; y += 30) {
            x = X + (Math.random() - 0.5) * BOLT_HALF * 1.6 * s;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawWind(sim: Sim, k: number): void {
    const { ctx, s } = this;
    const w = sim.wind;
    const want = Math.min(40, Math.round(Math.abs(w) * 18));
    while (this.wind.length < want) {
      this.wind.push({ x: Math.random() * WIDTH, y: Math.random() * this.h, len: 20 + Math.random() * 40, sp: 0.6 + Math.random() * 0.8 });
    }
    if (this.wind.length > want) this.wind.length = want;
    if (!want) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const p of this.wind) {
      p.x += w * 6 * p.sp * k;
      if (p.x > WIDTH + 60) p.x -= WIDTH + 120;
      if (p.x < -60) p.x += WIDTH + 120;
      const X = this.sx(p.x);
      ctx.moveTo(X, p.y);
      ctx.lineTo(X - Math.sign(w) * p.len * s, p.y);
    }
    ctx.stroke();
  }

  private drawParticles(k: number): void {
    const { ctx, s } = this;
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life += k;
      if (p.life >= p.max) continue;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vy -= p.grav * k;
      keep.push(p);
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const X = this.sx(p.x);
      const Y = this.sy(p.y);
      const z = p.size * s;
      if (p.shape === 'sq') {
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate((p.spin ?? 0) * p.life * 0.2);
        ctx.fillRect(-z / 2, -z / 2, z, z);
        ctx.restore();
      } else if (p.shape === 'star') {
        ctx.fillRect(X - z / 2, Y - 0.5, z, 1.5);
        ctx.fillRect(X - 0.5, Y - z / 2, 1.5, z);
      } else {
        ctx.beginPath();
        ctx.arc(X, Y, z / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.particles = keep.length > 400 ? keep.slice(-400) : keep;
  }

  /** Pip: a round little spring-bot with one big eye and a glowing antenna. */
  private drawPlayer(px: number, py: number, sim: Sim, k: number): void {
    const { ctx, s } = this;
    this.squash = Math.max(0, this.squash - 0.09 * k);
    const sq = Math.sin(Math.min(1, this.squash) * Math.PI) * 0.28 * Math.min(1, this.squash + 0.3);
    const stretch = Math.min(0.18, Math.max(0, sim.vy) * 0.012);
    const sxk = 1 + sq - stretch * 0.5;
    const syk = 1 - sq + stretch;
    const tilt = Math.max(-0.35, Math.min(0.35, sim.vx * 0.045));

    this.wrapped(px, 30, (x) => {
      const X = this.sx(x);
      const feet = this.sy(py);
      const legH = (10 - sq * 18 + stretch * 10) * s;
      const r = 13 * s;
      ctx.save();
      ctx.translate(X, feet);
      ctx.rotate(tilt);
      // Shadow when near a surface is skipped; the coil carries the motion.
      ctx.strokeStyle = '#7b8199';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const yy = -(legH * i) / 5;
        const xx = (i % 2 ? 5 : -5) * s;
        if (i === 0) ctx.moveTo(-6 * s, 0);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.fillStyle = '#4b5068';
      roundRect(ctx, -8 * s, -2 * s, 16 * s, 4 * s, 2 * s);
      ctx.fill();

      ctx.translate(0, -legH - r * syk);
      ctx.scale(sxk, syk);
      // Antenna.
      ctx.strokeStyle = '#4b5068';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(-this.face * 4 * s, -r - 8 * s, -this.face * 2 * s, -r - 13 * s);
      ctx.stroke();
      const glow = 0.7 + 0.3 * Math.sin(this.time * 6);
      ctx.fillStyle = `rgba(120,255,200,${glow})`;
      ctx.shadowColor = '#78ffc8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(-this.face * 2 * s, -r - 14 * s, 3.5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Body.
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#ffd166');
      g.addColorStop(1, '#f08c2e');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#7a3f12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Visor and eye, looking where you're going and up or down.
      const lookY = Math.max(-3, Math.min(3, -sim.vy * 0.25)) * s;
      ctx.fillStyle = '#20253a';
      roundRect(ctx, -9 * s + this.face * 2 * s, -7 * s, 18 * s, 11 * s, 5 * s);
      ctx.fill();
      ctx.fillStyle = sim.iceTimer > 0 ? '#9ff0ff' : '#7dfcc6';
      ctx.beginPath();
      ctx.arc(this.face * 4 * s, -1.5 * s + lookY, 3.6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.face * 5 * s, -3 * s + lookY, 1.2 * s, 0, Math.PI * 2);
      ctx.fill();
      // Bolt on the side.
      ctx.fillStyle = '#c96a1c';
      ctx.beginPath();
      ctx.arc(-this.face * 8 * s, 6 * s, 2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Speed lines when falling hard.
    if (sim.vy < -15) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const X = this.sx(px) + (Math.random() - 0.5) * 40 * s;
        const Y = this.sy(py) - 40 * s - Math.random() * 30 * s;
        ctx.moveTo(X, Y);
        ctx.lineTo(X, Y - 25 * s);
      }
      ctx.stroke();
    }
  }
}

function rgbToHex(c: string): string {
  const m = c.match(/\d+/g)!;
  return '#' + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Left and right, from keys, touch halves, a gamepad, or tilt. Returns an integer -4..4.

import { INPUT_MAX } from '../sim/sim';

export class Input {
  private keys = new Set<string>();
  private touches = new Map<number, number>();
  private tilt = 0;
  tiltOn = false;
  /** Fires on pause keys. */
  onPause: () => void = () => {};

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
        this.keys.add(e.code);
        e.preventDefault();
      }
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) this.onPause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touches.clear();
    });

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.touches.set(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
    };
    const move = (e: PointerEvent) => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
    };
    const up = (e: PointerEvent) => this.touches.delete(e.pointerId);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma === null) return;
      // Landscape phones tilt around the other axis.
      const angle = (screen.orientation?.angle ?? 0) % 360;
      let v = e.gamma;
      if (angle === 90) v = e.beta ?? 0;
      else if (angle === 270 || angle === -90) v = -(e.beta ?? 0);
      this.tilt = v;
    });
  }

  /** iOS asks before giving tilt. Must be called from a tap. */
  async enableTilt(): Promise<boolean> {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof D?.requestPermission === 'function') {
      try {
        if ((await D.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.tiltOn = true;
    return true;
  }

  read(): number {
    let v = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) v -= INPUT_MAX;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) v += INPUT_MAX;
    if (v === 0 && this.touches.size) {
      // The newest touch wins.
      let last = 0;
      for (const d of this.touches.values()) last = d;
      v = last * INPUT_MAX;
    }
    if (v === 0) {
      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad) continue;
        if (pad.buttons[14]?.pressed) v = -INPUT_MAX;
        else if (pad.buttons[15]?.pressed) v = INPUT_MAX;
        else if (Math.abs(pad.axes[0] ?? 0) > 0.15) v = Math.round((pad.axes[0] ?? 0) * INPUT_MAX);
        if (v) break;
      }
    }
    if (v === 0 && this.tiltOn) {
      const t = this.tilt / 22;
      if (Math.abs(t) > 0.12) v = Math.round(Math.max(-1, Math.min(1, t)) * INPUT_MAX);
    }
    return Math.max(-INPUT_MAX, Math.min(INPUT_MAX, v));
  }

  get touching(): boolean {
    return this.touches.size > 0;
  }

  /** A gamepad's A or Start, for menus. */
  padConfirm(): boolean {
    for (const pad of navigator.getGamepads?.() ?? []) if (pad && (pad.buttons[0]?.pressed || pad.buttons[9]?.pressed)) return true;
    return false;
  }

  reset(): void {
    this.touches.clear();
  }

  get element(): HTMLElement {
    return this.el;
  }
}

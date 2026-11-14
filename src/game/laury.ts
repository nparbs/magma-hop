// Laury pops up in the corner with a speech bubble. Two ways:
// - tour(lines): the first-time tutorial. The run waits; Next (tap, Enter, Space, gamepad) steps through.
// - say(line): a quick quip while you play. Types out, stays a moment, then she slides away.
// She never takes touches during a quip, so steering on a phone isn't blocked.

import type { LauryArt } from './render';

const TYPE_SPEED = 45; // characters a second

export class Laury {
  private line = '';
  private typed = 0;
  private hold = 0;
  private time = 0;
  private lines: string[] = [];
  private at = 0;
  private done: (() => void) | null = null;
  private wave = 0;

  constructor(
    private root: HTMLElement,
    private art: LauryArt,
    private textEl: HTMLElement,
    private srEl: HTMLElement,
    private nextBtn: HTMLButtonElement,
    skipBtn: HTMLButtonElement,
  ) {
    nextBtn.addEventListener('click', () => this.next());
    skipBtn.addEventListener('click', () => this.finish());
  }

  /** True while the tutorial is up. */
  get touring(): boolean {
    return this.done !== null;
  }

  get showing(): boolean {
    return this.root.classList.contains('show');
  }

  /** Step through lines; resolves when the last one is dismissed or skipped. */
  tour(lines: string[]): Promise<void> {
    this.finish();
    this.lines = lines;
    this.at = 0;
    this.root.classList.add('tour');
    return new Promise((resolve) => {
      this.done = resolve;
      this.setLine(lines[0], 1.6);
    });
  }

  /** Show one line for a moment, then slide away. Replaces whatever she was saying. */
  say(line: string): void {
    if (this.touring) return;
    this.root.classList.remove('tour');
    this.setLine(line, 1.6);
    this.hold = Math.max(2.4, line.length / 20);
  }

  /** Next tutorial line (or finish the one being typed first). */
  next(): void {
    if (!this.touring) return;
    if (this.typed < this.line.length) {
      this.typed = this.line.length;
      return;
    }
    if (++this.at >= this.lines.length) this.finish();
    else this.setLine(this.lines[this.at], 0);
  }

  /** End the tutorial (if any) and hide. */
  finish(): void {
    const d = this.done;
    this.done = null;
    this.root.classList.remove('tour');
    this.hide();
    d?.();
  }

  hide(): void {
    this.root.classList.remove('show');
    this.hold = 0;
  }

  private setLine(line: string, wave: number): void {
    this.line = line;
    this.typed = 0;
    this.wave = wave;
    this.srEl.textContent = line;
    this.textEl.textContent = '';
    if (this.touring) this.nextBtn.textContent = this.at >= this.lines.length - 1 ? "Let's go!" : 'Next ▶';
    this.root.classList.add('show');
  }

  /** Call every frame. `calm` keeps her still. */
  update(dt: number, calm: boolean): void {
    if (!this.showing) return;
    this.time += dt;
    this.wave = Math.max(0, this.wave - dt);
    if (this.typed < this.line.length) {
      this.typed = Math.min(this.line.length, this.typed + dt * TYPE_SPEED);
      this.textEl.textContent = this.line.slice(0, Math.floor(this.typed));
    } else {
      this.textEl.textContent = this.line;
      if (!this.touring && this.hold > 0) {
        this.hold -= dt;
        if (this.hold <= 0) this.hide();
      }
    }
    this.art.draw(this.time, this.typed < this.line.length, this.wave > 0 && !calm, calm);
  }
}

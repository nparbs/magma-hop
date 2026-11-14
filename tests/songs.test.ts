import { describe, expect, it } from 'vitest';
import { ALL_SONGS, ZONE_SONGS } from '../src/game/songs';
import { ZONES } from '../src/sim/zones';

describe('songs', () => {
  it('has at least two songs for every zone', () => {
    expect(ZONE_SONGS.length).toBe(ZONES.length);
    for (const list of ZONE_SONGS) expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('every pattern is the right length and uses only its own characters', () => {
    const names = new Set<string>();
    for (const s of ALL_SONGS) {
      expect(names.has(s.name), `duplicate song name ${s.name}`).toBe(false);
      names.add(s.name);
      const check = (what: string, p: string, len: number, chars: RegExp) => {
        expect(p.length, `${s.name} ${what} length`).toBe(len);
        expect(p, `${s.name} ${what} characters`).toMatch(chars);
      };
      check('bass', s.bass, 16, /^[xo5.]+$/);
      check('arp', s.arp, 16, /^[0-3.]+$/);
      check('kick', s.kick, 16, /^[x.]+$/);
      check('snare', s.snare, 16, /^[x.]+$/);
      check('hat', s.hat, 16, /^[x.]+$/);
      if (s.lead) check('lead', s.lead, 64, /^[0-9.-]+$/);
      expect(s.prog.length).toBe(4);
      expect(s.scale.length).toBe(7);
      expect(s.bpm).toBeGreaterThan(60);
      expect(s.bpm).toBeLessThan(180);
    }
  });
});

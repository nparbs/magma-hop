import { describe, expect, it } from 'vitest';
import { ALL_SONGS, OVER_SONGS, TITLE_SONGS, ZONE_SONGS, onPass } from '../src/game/songs';
import { ZONES } from '../src/sim/zones';

describe('songs', () => {
  it('has enough songs that the loops don\'t wear thin', () => {
    expect(ZONE_SONGS.length).toBe(ZONES.length);
    expect(ZONE_SONGS[0].length, 'the first zone is heard most').toBeGreaterThanOrEqual(5);
    for (const list of ZONE_SONGS) expect(list.length).toBeGreaterThanOrEqual(4);
    expect(TITLE_SONGS.length).toBeGreaterThanOrEqual(3);
    expect(OVER_SONGS.length).toBeGreaterThanOrEqual(3);
  });

  it('every song has a B section', () => {
    for (const s of ALL_SONGS) expect(s.b, `${s.name} has no B section`).toBeTruthy();
  });

  it('every pattern is the right length and uses only its own characters', () => {
    const names = new Set<string>();
    for (const a of ALL_SONGS) {
      expect(names.has(a.name), `duplicate song name ${a.name}`).toBe(false);
      names.add(a.name);
      // Check the A section and the song with its B parts swapped in.
      for (const s of [a, { ...onPass(a, 1), name: `${a.name} (B)` }]) {
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
    }
  });
});

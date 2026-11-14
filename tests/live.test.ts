import { describe, expect, it } from 'vitest';
import { LIVE_STALE_MS, LiveRoom, validPts } from '../server/live';

const who = (pub: string, mode: string, meters = 0) => ({ pub, mode, name: pub.toUpperCase(), skin: 1, meters });

describe('live climbers', () => {
  it('shows climbers in the same mode only, never yourself', () => {
    const room = new LiveRoom();
    room.post('ra', who('a', 'endless'), [3, 10, 20], 0);
    room.post('rb', who('b', 'endless'), [3, 50, 60], 0);
    room.post('rc', who('c', 'daily:2026-11-14'), [3, 1, 2], 0);
    const seen = room.post('ra', who('a', 'endless'), [6, 11, 21], 10);
    expect(seen.map((o) => o.id)).toEqual(['b']);
    expect(seen[0].pts).toEqual([3, 50, 60]);
    expect(room.post('rc', who('c', 'daily:2026-11-14'), [], 10)).toEqual([]);
  });

  it('drops climbers who stop posting or leave', () => {
    const room = new LiveRoom();
    room.post('ra', who('a', 'endless'), [3, 1, 1], 0);
    room.post('rb', who('b', 'endless'), [3, 1, 1], 0);
    expect(room.post('ra', who('a', 'endless'), [], LIVE_STALE_MS + 1)).toEqual([]);
    room.post('rb', who('b', 'endless'), [], LIVE_STALE_MS + 2);
    room.leave('rb');
    expect(room.post('ra', who('a', 'endless'), [], LIVE_STALE_MS + 3)).toEqual([]);
    expect(room.counts(LIVE_STALE_MS + 3)).toEqual({ endless: 1 });
  });

  it('ignores samples it already has and hands out the public id only', () => {
    const room = new LiveRoom();
    room.post('rb', who('b', 'endless'), [3, 1, 1, 6, 2, 2], 0);
    room.post('rb', who('b', 'endless'), [6, 9, 9, 9, 3, 3], 0);
    const [b] = room.post('ra', who('a', 'endless'), [3, 0, 0], 0);
    expect(b.pts).toEqual([3, 1, 1, 6, 2, 2, 9, 3, 3]);
    expect(JSON.stringify(b)).not.toContain('rb');
  });

  it('checks posted samples', () => {
    expect(validPts([3, 10, 20, 6, 11, 22], 420)).toBe(true);
    expect(validPts([6, 10, 20, 3, 11, 22], 420)).toBe(false);
    expect(validPts([3, 10], 420)).toBe(false);
    expect(validPts([3.5, 10, 20], 420)).toBe(false);
    expect(validPts([3, Infinity, 20], 420)).toBe(false);
    expect(validPts('nope', 420)).toBe(false);
  });
});

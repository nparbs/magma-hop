import { describe, expect, it } from 'vitest';
import { Store, weekStart } from '../server/db';
import { cleanName } from '../src/sim/names';

const run = (player: string, name: string, meters: number) => ({ player, name, meters, ticks: 100, cause: 'bat', seed: 1, log: [], sim: 2 });

describe('board', () => {
  it("lists each climber's best once, highest first", () => {
    const s = new Store(':memory:');
    s.add(run('a', 'Ann', 100));
    s.add(run('a', 'Ann', 300));
    s.add(run('b', 'Bo', 200));
    s.add(run('c', 'Cy', 50));
    const top = s.top(0, 10);
    expect(top.map((r) => [r.name, r.meters])).toEqual([
      ['Ann', 300],
      ['Bo', 200],
      ['Cy', 50],
    ]);
    expect(s.rank('b', 200, 0)).toBe(2);
    expect(s.rank('c', 250, 0)).toBe(2);
    expect(s.best('a', 0)).toBe(300);
  });

  it('renames all of a climber’s runs to their newest name', () => {
    const s = new Store(':memory:');
    s.add(run('a', 'Old', 100));
    s.add(run('a', 'New', 50));
    expect(s.top(0, 10)[0].name).toBe('New');
  });

  it('weeks start on Monday UTC', () => {
    const wed = Date.UTC(2026, 10, 11, 15);
    expect(new Date(weekStart(wed)).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    const mon = Date.UTC(2026, 10, 9, 0, 0, 1);
    expect(weekStart(mon)).toBe(Date.UTC(2026, 10, 9));
  });

  it('cleans names', () => {
    expect(cleanName('  <b>Zed</b>  ')).toBe('bZedb');
    expect(cleanName('x')).toBe('Climber');
    expect(cleanName('a very long name indeed')).toBe('a very long na');
  });
});

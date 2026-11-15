import { describe, expect, it } from 'vitest';
import { Store, utcDay, weekStart } from '../server/db';
import { cleanName } from '../src/sim/names';

const ALL = { since: 0 };
const run = (player: string, name: string, meters: number, day: string | null = null) => ({
  player, name, meters, ticks: 100, cause: 'bat', seed: 1, log: [5, 4, 9, 0], sim: 2, day,
});

describe('board', () => {
  it("lists each climber's best once, highest first", () => {
    const s = new Store(':memory:');
    s.add(run('a', 'Ann', 100));
    s.add(run('a', 'Ann', 300));
    s.add(run('b', 'Bo', 200));
    s.add(run('c', 'Cy', 50));
    const top = s.top(ALL, 10);
    expect(top.map((r) => [r.name, r.meters])).toEqual([
      ['Ann', 300],
      ['Bo', 200],
      ['Cy', 50],
    ]);
    expect(s.rank('b', 200, ALL)).toBe(2);
    expect(s.rank('c', 250, ALL)).toBe(2);
    expect(s.best('a', ALL)?.meters).toBe(300);
  });

  it('renames all of a climber’s runs to their newest name', () => {
    const s = new Store(':memory:');
    s.add(run('a', 'Old', 100));
    s.add(run('a', 'New', 50));
    expect(s.top(ALL, 10)[0].name).toBe('New');
  });

  it('keeps daily runs off the endless boards, and each day apart', () => {
    const s = new Store(':memory:');
    s.add(run('a', 'Ann', 100));
    s.add(run('a', 'Ann', 900, '2026-11-14'));
    s.add(run('b', 'Bo', 400, '2026-11-14'));
    s.add(run('b', 'Bo', 999, '2026-11-13'));
    expect(s.top(ALL, 10).map((r) => r.meters)).toEqual([100]);
    expect(s.top({ day: '2026-11-14' }, 10).map((r) => [r.name, r.meters])).toEqual([
      ['Ann', 900],
      ['Bo', 400],
    ]);
    expect(s.rank('b', 400, { day: '2026-11-14' })).toBe(2);
    expect(s.best('b', { day: '2026-11-14' })?.meters).toBe(400);
    expect(s.best('a', { day: '2026-11-13' })).toBeNull();
  });

  it('puts Daily summit finishers first, fastest first, then everyone else by height', () => {
    const s = new Store(':memory:');
    const day = '2026-11-14';
    const d = (player: string, name: string, meters: number, ticks: number, cause: string) => ({ ...run(player, name, meters, day), ticks, cause });
    s.add(d('a', 'Ann', 1500, 5000, 'summit'));
    s.add(d('a', 'Ann', 1500, 4000, 'summit'));
    s.add(d('b', 'Bo', 1500, 4500, 'summit'));
    s.add(d('c', 'Cy', 1490, 3000, 'lava'));
    s.add(d('e', 'Ed', 700, 900, 'bat'));
    const top = s.top({ day }, 10);
    expect(top.map((r) => [r.name, r.ticks, r.cause])).toEqual([
      ['Ann', 4000, 'summit'],
      ['Bo', 4500, 'summit'],
      ['Cy', 3000, 'lava'],
      ['Ed', 900, 'bat'],
    ]);
    expect(s.best('a', { day })).toMatchObject({ ticks: 4000, cause: 'summit' });
    expect(s.rank('b', { meters: 1500, ticks: 4500, cause: 'summit' }, { day })).toBe(2);
    expect(s.rank('z', { meters: 1500, ticks: 100, cause: 'summit' }, { day })).toBe(1);
    expect(s.rank('c', { meters: 1490, ticks: 3000, cause: 'lava' }, { day })).toBe(3);
    expect(s.rank('z', { meters: 800, ticks: 1, cause: 'lava' }, { day })).toBe(4);
    // Endless boards still go by height alone.
    s.add({ ...run('a', 'Ann', 300), ticks: 50, cause: 'lava' });
    s.add({ ...run('b', 'Bo', 400), ticks: 9000, cause: 'bat' });
    expect(s.top(ALL, 10).map((r) => [r.name, r.meters])).toEqual([['Bo', 400], ['Ann', 300]]);
    expect(s.rank('a', 300, ALL)).toBe(2);
  });

  it('hands back a stored run with its inputs', () => {
    const s = new Store(':memory:');
    const id = s.add({ ...run('a', 'Ann', 120, '2026-11-14'), skin: 3 });
    const r = s.run(id)!;
    expect(r).toMatchObject({ id, name: 'Ann', meters: 120, seed: 1, sim: 2, day: '2026-11-14', log: [5, 4, 9, 0], skin: 3 });
    expect(s.top({ day: '2026-11-14' }, 1)[0].id).toBe(id);
    expect(s.run(id + 1)).toBeNull();
    // Runs sent without a look get the default one.
    expect(s.run(s.add(run('b', 'Bo', 50)))!.skin).toBe(0);
  });

  it('makes one secret and keeps it', () => {
    const s = new Store(':memory:');
    expect(s.secret()).toBe(s.secret());
    expect(s.secret().length).toBeGreaterThan(20);
  });

  it('weeks start on Monday UTC and days are UTC dates', () => {
    const wed = Date.UTC(2026, 10, 11, 15);
    expect(new Date(weekStart(wed)).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    const mon = Date.UTC(2026, 10, 9, 0, 0, 1);
    expect(weekStart(mon)).toBe(Date.UTC(2026, 10, 9));
    expect(utcDay(Date.UTC(2026, 10, 14, 23, 59))).toBe('2026-11-14');
  });

  it('cleans names', () => {
    expect(cleanName('  <b>Zed</b>  ')).toBe('bZedb');
    expect(cleanName('x')).toBe('Climber');
    expect(cleanName('a very long name indeed')).toBe('a very long na');
  });
});

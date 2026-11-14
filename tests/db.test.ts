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

  it('hands back a stored run with its inputs', () => {
    const s = new Store(':memory:');
    const id = s.add(run('a', 'Ann', 120, '2026-11-14'));
    const r = s.run(id)!;
    expect(r).toMatchObject({ id, name: 'Ann', meters: 120, seed: 1, sim: 2, day: '2026-11-14', log: [5, 4, 9, 0] });
    expect(s.top({ day: '2026-11-14' }, 1)[0].id).toBe(id);
    expect(s.run(id + 1)).toBeNull();
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

// One past-tense word per run-ending cause, for the game-over screen: "<verb> at 840 m".
// Causes are the keys of AFTER in laury-lines.ts, plus `summit`.

export const CAUSE_VERB: Record<string, string> = {
  lava: 'Scorched',
  bat: 'Bitten',
  wisp: 'Snagged',
  rockfall: 'Squished',
  quit: 'Quit',
  summit: 'Erupted',
};

/** The game-over line, e.g. "Scorched at 840 m" or "Scorched at 1,000 m". Unknown causes say "Fell". */
export function causeLine(cause: string, meters: number): string {
  const known = Object.prototype.hasOwnProperty.call(CAUSE_VERB, cause);
  const verb = known ? CAUSE_VERB[cause] : 'Fell';
  const m = Math.round(meters).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${verb} at ${m} m`;
}

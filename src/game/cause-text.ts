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

/** Just the word, e.g. "Scorched": the game-over screen shows the height big right under it. Unknown causes say "Fell". */
export function causeWord(cause: string): string {
  return Object.prototype.hasOwnProperty.call(CAUSE_VERB, cause) ? CAUSE_VERB[cause] : 'Fell';
}

/** The whole line, e.g. "Scorched at 840 m" or "Scorched at 1,000 m". */
export function causeLine(cause: string, meters: number): string {
  const verb = causeWord(cause);
  const m = Math.round(meters).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${verb} at ${m} m`;
}

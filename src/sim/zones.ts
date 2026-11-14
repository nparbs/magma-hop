// The tower's bands, by height in meters. Pure data: the sim reads the rules, the page reads the colors.

export interface Zone {
  name: string;
  /** Height in meters where this zone begins. */
  from: number;
  /** Sky gradient: top, bottom. */
  sky: [string, string];
  /** Platform face and edge colors. */
  plat: [string, string];
  /** What the HUD says when you arrive. */
  intro: string;
}

export const ZONES: Zone[] = [
  { name: 'Rooftops', from: 0, sky: ['#ff9a76', '#ffd8a8'], plat: ['#f3ece4', '#8b6f8e'], intro: 'Bounce up. Steer with ← →' },
  { name: 'Cloudline', from: 250, sky: ['#6fb7ff', '#cfe9ff'], plat: ['#ffffff', '#b7cbe6'], intro: 'Platforms start to drift and crumble' },
  { name: 'Thunderhead', from: 700, sky: ['#3a3f6b', '#7c7fa8'], plat: ['#9aa3c7', '#5c6488'], intro: 'Wind gusts. Lightning. Keep moving' },
  { name: 'Glacier Sky', from: 1300, sky: ['#1d3b5c', '#5fa8c9'], plat: ['#c8f1ff', '#7cc4e0'], intro: 'Ice is slippery. Some ledges bob' },
  { name: 'Low Orbit', from: 2000, sky: ['#0b1030', '#2a2f6b'], plat: ['#b0b8d8', '#6c7499'], intro: 'Watch for drifting debris' },
  { name: 'The Void', from: 3000, sky: ['#05030d', '#1c0b2e'], plat: ['#d18cff', '#7a3fb0'], intro: 'Everything, all at once. Forever' },
];

export function zoneIndexAt(meters: number): number {
  let i = 0;
  while (i + 1 < ZONES.length && meters >= ZONES[i + 1].from) i++;
  return i;
}

/** Where each hazard and platform trick starts, in meters. */
export const FEATURE = {
  drones: 150,
  moving: 220,
  crumble: 300,
  fakes: 350,
  wind: 700,
  lightning: 760,
  ice: 1300,
  bobbing: 1300,
  debris: 2000,
  void: 3000,
} as const;

/** 0 at the bottom, creeping toward 1 forever. Every difficulty dial reads this. */
export const difficulty = (meters: number) => (meters <= 0 ? 0 : meters / (meters + 1200));

/** Strongest gust, in world units per tick, at this height. 0 means calm. */
export function windStrength(meters: number): number {
  if (meters < FEATURE.wind) return 0;
  if (meters < FEATURE.ice) return 1.5 + 0.5 * ((meters - FEATURE.wind) / (FEATURE.ice - FEATURE.wind));
  if (meters < FEATURE.debris) return 1.0;
  if (meters < FEATURE.void) return 0;
  return 1.6 + 0.6 * difficulty(meters);
}

export function lightningOn(meters: number): boolean {
  return (meters >= FEATURE.lightning && meters < FEATURE.ice) || meters >= FEATURE.void;
}

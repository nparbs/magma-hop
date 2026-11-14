// The volcano's bands, by height in meters. Pure data: the sim reads the rules, the page reads the colors.

export type Decor = 'pillar' | 'crystal' | 'bone' | 'icicle' | 'crag' | 'cloud';
export type Mote = 'ember' | 'glint' | 'dust' | 'snow' | 'ash';

export interface Zone {
  name: string;
  /** Height in meters where this zone begins. */
  from: number;
  /** Background: top, bottom. */
  sky: [string, string];
  /** Far rock layer and near rock layer. */
  rock: [string, string];
  /** Ledge colors: glowing top edge, lit rock, dark rock. */
  plat: [string, string, string];
  /** What the far layer is made of, and what drifts in the air. */
  decor: Decor;
  mote: Mote;
  moteColor: string;
  /** What the HUD says when you arrive. */
  intro: string;
}

export const ZONES: Zone[] = [
  {
    name: 'Magma Chamber', from: 0, sky: ['#2a0d12', '#5a1608'], rock: ['#3d1512', '#1c0a0c'],
    plat: ['#ffb02e', '#7a3b2a', '#3a1c1a'], decor: 'pillar', mote: 'ember', moteColor: '#ff9a3c',
    intro: 'The lava is rising. Hop up!',
  },
  {
    name: 'Crystal Caves', from: 250, sky: ['#140f2e', '#2b1245'], rock: ['#2a1d52', '#120c26'],
    plat: ['#6ff2e0', '#4a3a86', '#221a48'], decor: 'crystal', mote: 'glint', moteColor: '#9af7ff',
    intro: 'Ledges drift, crack and crumble',
  },
  {
    name: 'Fossil Beds', from: 700, sky: ['#1d1710', '#3b2a17'], rock: ['#4a3924', '#211a12'],
    plat: ['#f0d9a0', '#8a6a42', '#40301e'], decor: 'bone', mote: 'dust', moteColor: '#d9c08a',
    intro: 'Steam gusts. Rockfalls. Keep moving',
  },
  {
    name: 'Ice Cap', from: 1300, sky: ['#0c2238', '#1e4a66'], rock: ['#2a5876', '#0f2a40'],
    plat: ['#e8fbff', '#6aa9c9', '#2c5878'], decor: 'icicle', mote: 'snow', moteColor: '#e8fbff',
    intro: 'Ice is slippery. Some ledges bob',
  },
  {
    name: 'Crater Rim', from: 2000, sky: ['#0a0a1e', '#3a1420'], rock: ['#2c1a22', '#120a10'],
    plat: ['#ff6a3c', '#5a3038', '#2a161c'], decor: 'crag', mote: 'ember', moteColor: '#ffb84a',
    intro: 'Fire wisps drift across the vent',
  },
  {
    name: 'Ash Clouds', from: 3000, sky: ['#17141c', '#3a2f38'], rock: ['#4a4450', '#26222c'],
    plat: ['#ffd9f2', '#75697f', '#3a3340'], decor: 'cloud', mote: 'ash', moteColor: '#c9c0cf',
    intro: 'Everything, all at once. Forever',
  },
];

export function zoneIndexAt(meters: number): number {
  let i = 0;
  while (i + 1 < ZONES.length && meters >= ZONES[i + 1].from) i++;
  return i;
}

/** Where each hazard and platform trick starts, in meters. */
export const FEATURE = {
  pickups: 100,
  bats: 150,
  moving: 220,
  crumble: 300,
  fakes: 350,
  bubble: 400,
  wind: 700,
  rockfall: 760,
  ice: 1300,
  bobbing: 1300,
  wisps: 2000,
  ash: 3000,
} as const;

/** 0 at the bottom, creeping toward 1 forever. Every difficulty dial reads this. */
export const difficulty = (meters: number) => (meters <= 0 ? 0 : meters / (meters + 1200));

/** Strongest gust, in world units per tick, at this height. 0 means calm. */
export function windStrength(meters: number): number {
  if (meters < FEATURE.wind) return 0;
  if (meters < FEATURE.ice) return 1.2 + 0.4 * ((meters - FEATURE.wind) / (FEATURE.ice - FEATURE.wind));
  if (meters < FEATURE.wisps) return 0.8;
  if (meters < FEATURE.ash) return 0;
  return 1.3 + 0.6 * difficulty(meters);
}

export function rockfallOn(meters: number): boolean {
  return (meters >= FEATURE.rockfall && meters < FEATURE.ice) || meters >= FEATURE.ash;
}

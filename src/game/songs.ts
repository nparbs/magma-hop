// The music, as data. audio.ts plays it with synthesized voices. No audio files.
//
// Every song is four bars of sixteen steps, looped. Pattern strings have one character per step
// (16 per bar pattern, 64 for the lead):
//   bass  `x` chord root, `o` an octave up, `5` the fifth, `.` rest
//   arp   `0`-`3` a chord tone (root, third, fifth, octave), `.` rest
//   lead  `0`-`9` a scale step above the key (7 is the octave), `-` holds the note before, `.` rest
//   drums `x` hit, `.` rest

export interface Song {
  name: string;
  bpm: number;
  /** MIDI note of the key. */
  root: number;
  /** Semitones of the scale's seven steps. */
  scale: number[];
  /** Chord root per bar, as a scale step (may be negative). */
  prog: [number, number, number, number];
  bass: string;
  bassWave: OscillatorType;
  arp: string;
  arpWave: OscillatorType;
  /** Octaves above the bass. */
  arpOct: number;
  /** Sustained chord under each bar. */
  pad: boolean;
  kick: string;
  snare: string;
  hat: string;
  lead?: string;
  leadWave?: OscillatorType;
  /** Octaves above the key root. */
  leadOct?: number;
}

const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

const REST = '................';
/** A 64-step lead from four 16-step bars. */
const bars = (a: string, b: string, c: string, d: string) => a + b + c + d;

/** Plays on the title screen and the menus. */
export const TITLE_SONG: Song = {
  name: 'Magma Hop', bpm: 108, root: 43, scale: MAJOR, prog: [0, 5, 3, 4],
  bass: 'x..x..x.x..x..o.', bassWave: 'triangle',
  arp: '..0...1...2...1.', arpWave: 'sine', arpOct: 2, pad: true,
  kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
  lead: bars('4-.4.5.7--.5.4..', '2-.2.4.5--.4.2..', '4-.4.5.7--.9.8.7', '5---4---2---0---'),
  leadWave: 'square', leadOct: 2,
};

/** Plays on the run-over screen: cooling down. */
export const OVER_SONG: Song = {
  name: 'Cooling Down', bpm: 76, root: 45, scale: MINOR, prog: [0, 5, 3, 4],
  bass: 'x...............', bassWave: 'sine',
  arp: '0...2...1...2...', arpWave: 'sine', arpOct: 2, pad: true,
  kick: REST, snare: REST, hat: REST,
  lead: bars('4---2---0-------', REST, '4---5---4---2---', '0---------------'),
  leadWave: 'triangle', leadOct: 2,
};

/** In ZONES order: a few songs per zone, busier the higher you go. */
export const ZONE_SONGS: Song[][] = [
  // Magma Chamber
  [
    {
      name: 'Rumble', bpm: 96, root: 38, scale: PHRYGIAN, prog: [0, 1, 0, -2],
      bass: 'x.....x...x.....', bassWave: 'sawtooth',
      arp: '....2.......1...', arpWave: 'triangle', arpOct: 2, pad: true,
      kick: 'x.........x.....', snare: '........x.......', hat: REST,
      lead: bars('0-..1-..0-......', REST, '3-..1-..0-......', REST), leadWave: 'triangle', leadOct: 2,
    },
    {
      name: 'Hot Feet', bpm: 116, root: 38, scale: MINOR, prog: [0, 5, 2, 6],
      bass: 'x..x..x.x..x..o.', bassWave: 'square',
      arp: '..0...1...2...1.', arpWave: 'triangle', arpOct: 2, pad: false,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
      lead: bars('7-5-4-2-0---2-4-', '5-------4---2---', '7-5-4-2-0---2-4-', '2-------0-------'), leadWave: 'square', leadOct: 2,
    },
    {
      name: 'Pressure', bpm: 104, root: 40, scale: HARMONIC, prog: [0, 0, 5, 4],
      bass: 'x.x...x.x.x...x.', bassWave: 'sawtooth',
      arp: '0.2.1.2.0.2.1.2.', arpWave: 'triangle', arpOct: 2, pad: true,
      kick: 'x.....x.x.......', snare: '....x.......x...', hat: REST,
    },
  ],
  // Crystal Caves
  [
    {
      name: 'Glass', bpm: 104, root: 40, scale: DORIAN, prog: [0, 3, 5, 4],
      bass: 'x.......x.......', bassWave: 'triangle',
      arp: '0.1.2.3.2.1.0.2.', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x.......x.......', snare: REST, hat: '..x...x...x...x.',
    },
    {
      name: 'Geode', bpm: 92, root: 41, scale: LYDIAN, prog: [0, 1, 0, 4],
      bass: 'x.......x...o...', bassWave: 'sine',
      arp: '3.2.1.0.3.2.1.0.', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x...............', snare: REST, hat: '....x.......x...',
      lead: bars('7---9---8---7---', '4-------5-------', '9---8---7---5---', '4---------------'), leadWave: 'sine', leadOct: 2,
    },
    {
      name: 'Echo', bpm: 120, root: 40, scale: DORIAN, prog: [0, 3, 0, 4],
      bass: 'x...x...x...x...', bassWave: 'triangle',
      arp: '0123012301230123', arpWave: 'sine', arpOct: 2, pad: false,
      kick: 'x.......x.......', snare: REST, hat: 'x.x.x.x.x.x.x.x.',
    },
  ],
  // Fossil Beds
  [
    {
      name: 'Dust', bpm: 104, root: 33, scale: MINOR, prog: [0, 5, 3, 4],
      bass: 'x..x..x.x..x..5.', bassWave: 'square',
      arp: '0..2..1...2..3..', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
    },
    {
      name: 'Dig Site', bpm: 100, root: 36, scale: MINOR, prog: [0, 3, 4, 0],
      bass: 'x..x....x..x..5.', bassWave: 'square',
      arp: '0...2...1...3...', arpWave: 'triangle', arpOct: 2, pad: false,
      kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      lead: bars('0.2.3...4.3.2...', '3.4.5...4.3.2...', '0.2.3...4.5.7...', '5...4...2...0...'), leadWave: 'square', leadOct: 2,
    },
  ],
  // Ice Cap
  [
    {
      name: 'Thin Air', bpm: 104, root: 42, scale: LYDIAN, prog: [0, 1, 4, 3],
      bass: 'x...............', bassWave: 'sine',
      arp: '3...2...1...2...', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x.......x.......', snare: '............x...', hat: '....x.......x...',
    },
    {
      name: 'Whiteout', bpm: 84, root: 38, scale: DORIAN, prog: [0, 3, 5, 4],
      bass: 'x...............', bassWave: 'sine',
      arp: '0..1..2..3..2..1', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x...............', snare: '........x.......', hat: REST,
      lead: bars('7-------9-------', '8-------7-------', '5-------4-------', '2---------------'), leadWave: 'sine', leadOct: 2,
    },
  ],
  // Crater Rim
  [
    {
      name: 'Drive', bpm: 104, root: 36, scale: HARMONIC, prog: [0, 5, 3, 4],
      bass: 'x.x.x.x.o.x.x.5.', bassWave: 'sawtooth',
      arp: '0.2.1.2.0.2.3.2.', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    },
    {
      name: 'Rimfire', bpm: 128, root: 33, scale: PHRYGIAN, prog: [0, 1, 0, 6],
      bass: 'xxo.xxo.xxo.xx5.', bassWave: 'sawtooth',
      arp: '0.1.2.3.2.1.0.1.', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x',
      lead: bars('0-1-0-....3-1-0-', REST, '4-5-4-....7-5-4-', REST), leadWave: 'square', leadOct: 2,
    },
  ],
  // Ash Clouds
  [
    {
      name: 'All at Once', bpm: 104, root: 38, scale: HARMONIC, prog: [0, 1, 5, 4],
      bass: 'xxo.xxo.xxo.x5o5', bassWave: 'sawtooth',
      arp: '0123210302132031', arpWave: 'square', arpOct: 2, pad: true,
      kick: 'x...x...x...x.x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
    },
    {
      name: 'Last Light', bpm: 140, root: 40, scale: HARMONIC, prog: [0, 5, 3, 4],
      bass: 'x.xox.xox.xox.xo', bassWave: 'sawtooth',
      arp: '0123210302132031', arpWave: 'square', arpOct: 2, pad: true,
      kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      lead: bars('7-6-5-4-5-6-7---', '4-------2-------', '7-6-5-4-5-6-9---', '7---------------'), leadWave: 'square', leadOct: 2,
    },
  ],
];

export const ALL_SONGS: Song[] = [TITLE_SONG, OVER_SONG, ...ZONE_SONGS.flat()];

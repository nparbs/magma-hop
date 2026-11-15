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
  /** A B section: played on every other pass, swapping in these parts (the rest stay as in A). */
  b?: SongPart;
}

/** The parts a B section may change. Same pattern rules as the song. */
export interface SongPart {
  prog?: [number, number, number, number];
  bass?: string;
  arp?: string;
  lead?: string;
  kick?: string;
  snare?: string;
  hat?: string;
}

/** The song as it plays on this pass: A on even passes, A with its B parts swapped in on odd ones. */
export const onPass = (s: Song, pass: number): Song => (pass % 2 === 1 && s.b ? { ...s, ...s.b } : s);

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
  b: {
    prog: [3, 4, 5, 4], hat: 'x.x.x.x.x.x.xxxx',
    lead: bars('7-.7.5.4--.2.4..', '5-.5.4.2--.4.5..', '7-.9.7.5--.4.2..', '0---------------'),
  },
};

const TITLE_SUNNY: Song = {
  name: 'Sunny Ledge', bpm: 116, root: 41, scale: MAJOR, prog: [0, 3, 4, 3],
  bass: 'x.o.x.o.x.o.x.5.', bassWave: 'triangle',
  arp: '0.1.2.1.0.1.2.3.', arpWave: 'sine', arpOct: 2, pad: true,
  kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
  lead: bars('0-.2.4.7--.4.2..', '4-.5.7.9--.7.5..', '0-.2.4.7--.9.7.5', '4---------------'),
  leadWave: 'square', leadOct: 2,
  b: {
    prog: [3, 0, 4, 3],
    lead: bars('7-.5.4.2--.4.5..', '7-.9.7.5--.4.2..', '7-.5.4.2--.4.5.7', '0---------------'),
  },
};

const TITLE_WARM: Song = {
  name: 'Warm Up', bpm: 100, root: 38, scale: MAJOR, prog: [0, 4, 5, 3],
  bass: 'x...x...x...x.5.', bassWave: 'triangle',
  arp: '0.2.1.2.0.2.1.3.', arpWave: 'sine', arpOct: 2, pad: true,
  kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
  lead: bars('2-4-7---5-4-2---', '2-4-5-7-9---7---', '5-7-9---7-5-4---', '2---------------'),
  leadWave: 'triangle', leadOct: 2,
  b: {
    prog: [3, 5, 4, 0],
    lead: bars('7-5-4---2-4-5---', '7-9-7-5-4---2---', '4-5-7-9-7-5-4---', '0---------------'),
  },
};

/** Plays on the run-over screen: cooling down. */
export const OVER_SONG: Song = {
  name: 'Cooling Down', bpm: 76, root: 45, scale: MINOR, prog: [0, 5, 3, 4],
  bass: 'x...............', bassWave: 'sine',
  arp: '0...2...1...2...', arpWave: 'sine', arpOct: 2, pad: true,
  kick: REST, snare: REST, hat: REST,
  lead: bars('4---2---0-------', REST, '4---5---4---2---', '0---------------'),
  leadWave: 'triangle', leadOct: 2,
  b: {
    prog: [3, 0, 4, 0],
    lead: bars('2---4---5---4---', REST, '2---0---2-------', '0---------------'),
  },
};

const OVER_EMBERS: Song = {
  name: 'Embers Fade', bpm: 68, root: 40, scale: DORIAN, prog: [0, 3, 4, 0],
  bass: 'x...............', bassWave: 'sine',
  arp: '0...1...2...1...', arpWave: 'sine', arpOct: 2, pad: true,
  kick: REST, snare: REST, hat: REST,
  lead: bars('2---4---3-------', '2---0-----------', '4---5---4---2---', '0---------------'),
  leadWave: 'triangle', leadOct: 2,
  b: {
    prog: [4, 0, 3, 0],
    lead: bars('4---5---7-------', '5---4---2-------', '4---3---2---0---', '0---------------'),
  },
};

const OVER_ASH: Song = {
  name: 'Ash Settles', bpm: 64, root: 36, scale: MINOR, prog: [0, 2, 5, 4],
  bass: 'x.......o.......', bassWave: 'sine',
  arp: '2...1...0...1...', arpWave: 'triangle', arpOct: 2, pad: true,
  kick: REST, snare: REST, hat: REST,
  lead: bars('4-------2---0---', REST, '4---5---4-------', '2---0-----------'),
  leadWave: 'sine', leadOct: 2,
  b: {
    prog: [5, 3, 4, 0], arp: '0...2...1...2...',
    lead: bars('7-------5---4---', '2---------------', '4---2---0-------', '0---------------'),
  },
};

/** Plays on the win screen after reaching the Daily summit. */
export const SUMMIT_SONG: Song = {
  name: 'Summit', bpm: 120, root: 43, scale: MAJOR, prog: [0, 3, 4, 0],
  bass: 'x...x.o.x...x.5.', bassWave: 'triangle',
  arp: '0.1.2.3.2.1.2.3.', arpWave: 'sine', arpOct: 2, pad: true,
  kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
  lead: bars('4-5-7---9---7---', '5-7-8---7-------', '4-5-7---9-8-7-9-', '7---------------'),
  leadWave: 'square', leadOct: 2,
  b: {
    prog: [4, 3, 0, 4], arp: '0.2.1.3.2.1.3.2.',
    lead: bars('7-9-8---7-5-4---', '2-4-5---4-------', '5-7-9---8-7-5---', '7---------------'),
  },
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
      b: { prog: [0, 5, 1, 0], lead: bars('0-..3-..1-......', REST, '4-..3-..1-..0-..', REST) },
    },
    {
      name: 'Hot Feet', bpm: 116, root: 38, scale: MINOR, prog: [0, 5, 2, 6],
      bass: 'x..x..x.x..x..o.', bassWave: 'square',
      arp: '..0...1...2...1.', arpWave: 'triangle', arpOct: 2, pad: false,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
      lead: bars('7-5-4-2-0---2-4-', '5-------4---2---', '7-5-4-2-0---2-4-', '2-------0-------'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [5, 6, 5, 4], snare: '....x.......x.xx',
        lead: bars('4-2-0-2-4---2---', '0-------2---4---', '4-2-0-2-4---5-7-', '4-------0-------'),
      },
    },
    {
      name: 'Pressure', bpm: 104, root: 40, scale: HARMONIC, prog: [0, 0, 5, 4],
      bass: 'x.x...x.x.x...x.', bassWave: 'sawtooth',
      arp: '0.2.1.2.0.2.1.2.', arpWave: 'triangle', arpOct: 2, pad: true,
      kick: 'x.....x.x.......', snare: '....x.......x...', hat: REST,
      b: { prog: [5, 4, 0, 0], arp: '2.0.1.0.2.0.1.0.' },
    },
    {
      name: 'Slow Lava', bpm: 82, root: 35, scale: MINOR, prog: [0, 2, 3, 0],
      bass: 'x.......x...5...', bassWave: 'triangle',
      arp: '0...1...2...1...', arpWave: 'triangle', arpOct: 2, pad: true,
      kick: 'x.......x.......', snare: REST, hat: REST,
      lead: bars('0---2---3---2---', REST, '3---4---3---2---', '0---------------'), leadWave: 'triangle', leadOct: 2,
      b: { prog: [3, 4, 2, 0], lead: bars('4---3---2---0---', REST, '2---3---4---3---', '0---------------') },
    },
    {
      name: 'Cinder Path', bpm: 108, root: 41, scale: DORIAN, prog: [0, 3, 6, 4],
      bass: 'x..x..x...x.x...', bassWave: 'sawtooth',
      arp: '0.2.0.1.0.2.1.2.', arpWave: 'triangle', arpOct: 2, pad: false,
      kick: 'x...x.....x.....', snare: '........x.......', hat: '..x...x...x...x.',
      lead: bars('2-3-4---3-2-0---', '2-3-4-5-4---2---', '4-5-4-3-2-3-4---', '0---------------'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [4, 3, 5, 0], snare: '........x.....x.',
        lead: bars('5-4-3-2-3---0---', REST, '5-4-3-2-3-4-5---', '4---------------'),
      },
    },
    {
      name: 'Magma Heart', bpm: 90, root: 37, scale: HARMONIC, prog: [0, 1, 5, 0],
      bass: 'x...x...o...5...', bassWave: 'sawtooth',
      arp: '0..1..2..1..0.2.', arpWave: 'triangle', arpOct: 2, pad: true,
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: REST,
      b: { prog: [0, 5, 4, 0], arp: '2.1.0.1.2.3.2.1.', kick: 'x.....x...x...x.' },
    },
  ],
  // Crystal Caves
  [
    {
      name: 'Glass', bpm: 104, root: 40, scale: DORIAN, prog: [0, 3, 5, 4],
      bass: 'x.......x.......', bassWave: 'triangle',
      arp: '0.1.2.3.2.1.0.2.', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x.......x.......', snare: REST, hat: '..x...x...x...x.',
      b: { prog: [5, 4, 0, 3], arp: '2.0.3.1.2.0.3.1.' },
    },
    {
      name: 'Geode', bpm: 92, root: 41, scale: LYDIAN, prog: [0, 1, 0, 4],
      bass: 'x.......x...o...', bassWave: 'sine',
      arp: '3.2.1.0.3.2.1.0.', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x...............', snare: REST, hat: '....x.......x...',
      lead: bars('7---9---8---7---', '4-------5-------', '9---8---7---5---', '4---------------'), leadWave: 'sine', leadOct: 2,
      b: { prog: [3, 4, 1, 0], lead: bars('9---8---7---8---', '5-------4-------', '7---8---9---7---', '4---------------') },
    },
    {
      name: 'Echo', bpm: 120, root: 40, scale: DORIAN, prog: [0, 3, 0, 4],
      bass: 'x...x...x...x...', bassWave: 'triangle',
      arp: '0123012301230123', arpWave: 'sine', arpOct: 2, pad: false,
      kick: 'x.......x.......', snare: REST, hat: 'x.x.x.x.x.x.x.x.',
      b: { prog: [0, 4, 3, 0], arp: '3210321032103210' },
    },
    {
      name: 'Prism', bpm: 112, root: 45, scale: LYDIAN, prog: [0, 4, 1, 3],
      bass: 'x.......x.....5.', bassWave: 'sine',
      arp: '0.1.2.3.3.2.1.0.', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x.......x.......', snare: REST, hat: '..x...x...x...x.',
      lead: bars('4-5-7---9-7-5---', '8-7-5-4-5-----..', '9-8-7---5-4-2---', '4---------------'), leadWave: 'sine', leadOct: 2,
      b: {
        prog: [3, 1, 4, 0], arp: '3.2.1.0.1.2.3.2.',
        lead: bars('9---8-7-5---7---', REST, '8-7-5-4-5---7---', '4---------------'),
      },
    },
    {
      name: 'Stalactite', bpm: 96, root: 38, scale: DORIAN, prog: [0, 2, 4, 3],
      bass: 'x...o...x...5...', bassWave: 'triangle',
      arp: '0.2.3.2.1.2.0.2.', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x...............', snare: REST, hat: '....x.......x.x.',
      lead: bars('2---4---3-2-0---', '2---4---5---4---', '7---5---4-2-0---', '2---------------'), leadWave: 'sine', leadOct: 2,
      b: {
        prog: [3, 4, 0, 2], arp: '3.1.2.0.3.1.2.0.',
        lead: bars('4---5---7---5---', '4---3---2---0---', REST, '0---------------'),
      },
    },
  ],
  // Fossil Beds
  [
    {
      name: 'Dust', bpm: 104, root: 33, scale: MINOR, prog: [0, 5, 3, 4],
      bass: 'x..x..x.x..x..5.', bassWave: 'square',
      arp: '0..2..1...2..3..', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
      b: { prog: [3, 4, 0, 5], arp: '0..2..3..2..1..2' },
    },
    {
      name: 'Dig Site', bpm: 100, root: 36, scale: MINOR, prog: [0, 3, 4, 0],
      bass: 'x..x....x..x..5.', bassWave: 'square',
      arp: '0...2...1...3...', arpWave: 'triangle', arpOct: 2, pad: false,
      kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      lead: bars('0.2.3...4.3.2...', '3.4.5...4.3.2...', '0.2.3...4.5.7...', '5...4...2...0...'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [4, 3, 0, 0],
        lead: bars('5.4.3...2.3.4...', '5.7.8...7.5.4...', '5.4.3...2.3.4.5.', '0...............'),
      },
    },
    {
      name: 'Bone Yard', bpm: 112, root: 34, scale: MINOR, prog: [0, 0, 3, 4],
      bass: 'x..x..x.x.x..x5.', bassWave: 'square',
      arp: '0.2.0.2.1.2.1.3.', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x..x....x..x....', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
      lead: bars('0.2.3.2.0.2.3...', '4.3.2.0.2.3.4...', '0.2.3.2.0.5.4.3.', '2...0...........'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [3, 4, 0, 0], kick: 'x..x....x..x..x.',
        lead: bars('4.5.7...5.4.3...', '4.5.7.8.7.5.4...', '4.5.7...5.4.3.2.', '0...............'),
      },
    },
    {
      name: 'Quarry', bpm: 124, root: 35, scale: DORIAN, prog: [0, 3, 0, 4],
      bass: 'x.x.x.o.x.x.x.5.', bassWave: 'sawtooth',
      arp: '0.1.2.1.0.1.2.3.', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x',
      b: { prog: [3, 4, 5, 4], arp: '2.1.0.1.2.3.2.1.' },
    },
  ],
  // Ice Cap
  [
    {
      name: 'Thin Air', bpm: 104, root: 42, scale: LYDIAN, prog: [0, 1, 4, 3],
      bass: 'x...............', bassWave: 'sine',
      arp: '3...2...1...2...', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x.......x.......', snare: '............x...', hat: '....x.......x...',
      b: { prog: [3, 4, 1, 0], arp: '1...2...3...2...' },
    },
    {
      name: 'Whiteout', bpm: 84, root: 38, scale: DORIAN, prog: [0, 3, 5, 4],
      bass: 'x...............', bassWave: 'sine',
      arp: '0..1..2..3..2..1', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x...............', snare: '........x.......', hat: REST,
      lead: bars('7-------9-------', '8-------7-------', '5-------4-------', '2---------------'), leadWave: 'sine', leadOct: 2,
      b: { prog: [5, 3, 4, 0], lead: bars('9-------8-------', '7-------5-------', '4-------5-------', '4---------------') },
    },
    {
      name: 'Frostbite', bpm: 100, root: 44, scale: MAJOR, prog: [0, 4, 3, 4],
      bass: 'x.......x.......', bassWave: 'sine',
      arp: '2...1...0...1...', arpWave: 'sine', arpOct: 2, pad: true,
      kick: 'x...............', snare: '............x...', hat: '....x.......x...',
      lead: bars('4---5---7-------', '9---7---5-------', '4---5---7---9---', '7---------------'), leadWave: 'sine', leadOct: 2,
      b: { prog: [3, 0, 4, 0], lead: bars('9---8---7-------', '5---4---2-------', '4---5---7---5---', '4---------------') },
    },
    {
      name: 'Snowdrift', bpm: 76, root: 39, scale: MINOR, prog: [0, 5, 2, 4],
      bass: 'x...............', bassWave: 'sine',
      arp: '0...2...1...0...', arpWave: 'sine', arpOct: 2, pad: true,
      kick: REST, snare: REST, hat: '....x...........',
      lead: bars('2-------0-------', '2---4---3---2---', '5-------4-------', '2---------------'), leadWave: 'sine', leadOct: 2,
      b: {
        prog: [3, 4, 0, 0], arp: '3...2...1...2...',
        lead: bars('4-------5-------', '4---3---2-------', '0---2---4-------', '0---------------'),
      },
    },
  ],
  // Crater Rim
  [
    {
      name: 'Drive', bpm: 104, root: 36, scale: HARMONIC, prog: [0, 5, 3, 4],
      bass: 'x.x.x.x.o.x.x.5.', bassWave: 'sawtooth',
      arp: '0.2.1.2.0.2.3.2.', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
      b: { prog: [3, 4, 5, 4], arp: '2.0.2.3.2.0.1.0.' },
    },
    {
      name: 'Rimfire', bpm: 128, root: 33, scale: PHRYGIAN, prog: [0, 1, 0, 6],
      bass: 'xxo.xxo.xxo.xx5.', bassWave: 'sawtooth',
      arp: '0.1.2.3.2.1.0.1.', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x',
      lead: bars('0-1-0-....3-1-0-', REST, '4-5-4-....7-5-4-', REST), leadWave: 'square', leadOct: 2,
      b: { prog: [0, 6, 5, 6], lead: bars('0-1-3-....4-3-1-', REST, '3-4-3-....5-4-3-', REST) },
    },
    {
      name: 'Heat Wave', bpm: 136, root: 39, scale: HARMONIC, prog: [0, 5, 6, 4],
      bass: 'x.xxo.xxx.xxo.x5', bassWave: 'sawtooth',
      arp: '0.2.1.2.3.2.1.2.', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x...x...x..xx...', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x',
      lead: bars('0-2-4-2-0-2-4-5-', '7-5-4-2-4-5-7---', '0-2-4-2-0-2-4-5-', '7---------------'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [3, 4, 0, 6],
        lead: bars('4-5-7-5-4-5-7-9-', '7-5-4-2-0-----..', '4-5-7-5-4-5-7-9-', '7---------------'),
      },
    },
    {
      name: 'Slag Run', bpm: 148, root: 42, scale: DORIAN, prog: [0, 3, 4, 3],
      bass: 'xxoxxxoxxxoxxx5x', bassWave: 'sawtooth',
      arp: '0.2.3.2.1.2.3.2.', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.xx',
      lead: bars('4-4-5-4-2-0-2---', '4-4-5-7-5-4-2---', '4-4-5-4-2-0-2-4-', '0---------------'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [4, 3, 0, 0],
        lead: bars('7-7-9-7-5-4-5---', '7-7-9-7-5-4-2---', '7-5-4-2-4-5-7-9-', '7---------------'),
      },
    },
  ],
  // Ash Clouds
  [
    {
      name: 'All at Once', bpm: 104, root: 38, scale: HARMONIC, prog: [0, 1, 5, 4],
      bass: 'xxo.xxo.xxo.x5o5', bassWave: 'sawtooth',
      arp: '0123210302132031', arpWave: 'square', arpOct: 2, pad: true,
      kick: 'x...x...x...x.x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
      b: { prog: [5, 4, 0, 1], arp: '3210123020312013' },
    },
    {
      name: 'Last Light', bpm: 140, root: 40, scale: HARMONIC, prog: [0, 5, 3, 4],
      bass: 'x.xox.xox.xox.xo', bassWave: 'sawtooth',
      arp: '0123210302132031', arpWave: 'square', arpOct: 2, pad: true,
      kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      lead: bars('7-6-5-4-5-6-7---', '4-------2-------', '7-6-5-4-5-6-9---', '7---------------'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [3, 4, 0, 5],
        lead: bars('4-5-6-7-6-5-4---', '2-------0-------', '4-5-6-7-9-7-6---', '7---------------'),
      },
    },
    {
      name: 'Cinder Storm', bpm: 156, root: 43, scale: HARMONIC, prog: [0, 1, 0, 4],
      bass: 'x.xxo.xxx.xxo.x5', bassWave: 'sawtooth',
      arp: '0123210302132031', arpWave: 'square', arpOct: 2, pad: true,
      kick: 'x..xx..xx..xx..x', snare: '....x..x....x..x', hat: 'xxxxxxxxxxxxxxxx',
      lead: bars('7-6-7-9-7-6-5-4-', '5-4-5-7-5-4-2---', '7-6-7-9-7-6-5-4-', '2---------------'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [5, 4, 1, 0],
        lead: bars('9-8-7-6-7-8-9---', '4-5-6-7-6-5-4---', '9-8-7-6-7-8-9-7-', '7---------------'),
      },
    },
    {
      name: 'Pyroclast', bpm: 132, root: 36, scale: PHRYGIAN, prog: [0, 1, 5, 6],
      bass: 'xxxoxxxoxxxoxx5o', bassWave: 'sawtooth',
      arp: '0213021302130213', arpWave: 'square', arpOct: 2, pad: false,
      kick: 'x.x.x.x.x.x.x.x.', snare: '....x..x....x...', hat: 'xxxxxxxxxxxxxxxx',
      lead: bars('0-1-0-3-1-0-1-3-', '4-3-1-0-1-3-4---', '0-1-0-3-1-0-1-3-', '7---------------'), leadWave: 'square', leadOct: 2,
      b: {
        prog: [0, 6, 5, 1],
        lead: bars('7-5-4-3-4-5-7---', '8-7-5-4-3-1-0---', '7-5-4-3-4-5-7-8-', '7---------------'),
      },
    },
  ],
];

/** Title and menu songs; the first is the theme and always plays first. */
export const TITLE_SONGS: Song[] = [TITLE_SONG, TITLE_SUNNY, TITLE_WARM];

/** Run-over songs. */
export const OVER_SONGS: Song[] = [OVER_SONG, OVER_EMBERS, OVER_ASH];

export const ALL_SONGS: Song[] = [...TITLE_SONGS, ...OVER_SONGS, SUMMIT_SONG, ...ZONE_SONGS.flat()];

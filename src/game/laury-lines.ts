// What Laury says. Plain data, so it's easy to add jokes. `{h}` in a check-in line becomes the height.

/** Her first-time walk-through of the basics. `touch`/`tilt` pick how steering is explained. */
export function basicsTour(touch: boolean): string[] {
  return [
    "Hi! I'm Laury. I study this volcano. Mostly I study running away from it.",
    touch
      ? 'You bounce all by yourself. Just steer: hold the left or right side of the screen. Or turn on Tilt and lean your phone.'
      : 'You bounce all by yourself. Just steer with ← → or A / D. A gamepad works too.',
    'Go off one side and you pop out the other. Handy for shortcuts.',
    "The lava follows you up and the view never goes back down. Fall in and the run's over. So... don't.",
    'Fire bats, rockfalls and fire wisps end a run in one hit. Land on a bat from above to squash it.',
    "Cracked ledges break after one bounce. Fakes have a broken glow, so check before you trust 'em.",
    'Geysers and lava bubbles carry you up for free. A blue shell blocks one hit. Mushrooms are extra bouncy.',
    "Your score is the highest point you reach. Go! I'll check on you on the way up.",
  ];
}

/** Her first-time walk-through of the Daily Climb. */
export function dailyTour(liveOn: boolean): string[] {
  return [
    'Ooh, the Daily Climb! One volcano, the same for everyone, all day. A new one at midnight UTC.',
    "Learn it, try again, beat your best. It has its own board, so it's a fair fight.",
    'Your best try today races you as a blue ghost. Beat your ghost, basically.',
    ...(liveOn ? ["Anyone climbing it right now hops along beside you too. Wave! They can't see it, but it's polite."] : []),
    'The Daily Climb has a summit. Reach it fastest and you top the board.',
    'Good luck. Same volcano, so no excuses!',
  ];
}

/** At the start of any later run. */
export const START: string[] = [
  'Remember: the floor is lava. Eventually.',
  "Fun fact: magma is just lava that hasn't gone outside yet.",
  'I asked the volcano to calm down. It erupted. Rude.',
  'Pro tip: up is the good direction.',
  'Stretch first. Embers pull hamstrings too.',
  "The lava isn't chasing you. It's just very, very interested.",
  "Today's forecast: hot, with a chance of hotter.",
  'See a bat? Be the shoe.',
  'Bounce responsibly.',
  "I'd come with you, but these are my good boots.",
  "Ledges are like friends. The cracked ones let you down.",
  "You've got this. The lava's got a lot going on too, but you've got this.",
  "Don't look down. Actually, do. That's where the ledges are.",
  'Hot tip! ...Sorry. I say that every time.',
  "Fake ledges have a broken glow. Real ones have self-esteem.",
  "Steam gusts push you sideways. Lean into it. Or don't, I'm a scientist, not a coach.",
  'What did the volcano say to its sweetheart? I lava you.',
  "You're hot stuff. Literally. Please don't hug me.",
  'My field notes just say "AAAA" in big letters. Your turn.',
  'This volcano gets one star from me. Too spicy.',
  "If you get scared, just remember the lava's scared of nothing. Wait, that's not helpful.",
  "I timed the eruption: it's happening now. It's always happening now.",
  "Rocks fall. Bats bite. Lava's lava. Have fun!",
  "Every ledge is a fresh start. Every gap is a fresh panic.",
];

/** Daily Climb starts after the first, mixed in with the ones above. */
export const DAILY_START: string[] = [
  'Same volcano as before? Yep. Same ledges, new you.',
  "Third time's the charm. Or the twelfth. I'm not counting. I'm counting.",
  "Everyone's on this exact volcano today. Try not to step on anyone's toes.",
  "You've seen these ledges before. They've seen you fall off them. Show 'em.",
];

/** Sometimes at the start, about how the last run ended. */
export const AFTER: Record<string, string[]> = {
  lava: [
    "Last time you went for a swim. Lava's not a pool, I checked.",
    'Lava: 1, you: 0. Rematch!',
    "You fell in the lava last time. It said you're welcome back anytime. Don't.",
  ],
  bat: [
    "A bat got you last time. Remember: from above is lunch, from the side it's you who's lunch.",
    'That bat is telling all its friends about you. Prove it wrong.',
  ],
  wisp: [
    "A wisp got you. They're not cute. I know, they look cute.",
    'Wisps drift, you dodge. That was the deal.',
  ],
  rockfall: [
    'Squished by a rock last time. When the column glows, scoot!',
    "That rock had your name on it. Literally, I'm checking. Nope, just rock.",
  ],
  quit: ['You called it early last time. Snack break? Respect.'],
  summit: [
    'You reached the top last time! Want to see if you can do it faster?',
    'The eruption launched you out. Hard to beat, but try.',
    'Last run, you beat the mountain. This run, beat yourself.',
    'Top of the volcano, last time. Let\'s see if it happens again.',
  ],
};

/** Check-ins at the 500 m marks. The first few are fixed, then random ones. */
export const MILESTONE: Record<number, string> = {
  500: "500 m! You're officially higher than my motivation.",
  1000: "A whole kilometer! I'd clap, but I'm holding on.",
  1500: "1,500 m. The air's thin up here. So's my sandwich.",
  2000: '2 km! Are you sure you\'re not part bird?',
  3000: "3 km! I don't even have a map for up here.",
};
export const CHECK_IN: string[] = [
  "{h}! I'm running out of things to say. Keep going anyway.",
  '{h}! The volcano is starting to respect you.',
  "{h}! You're doing great. The lava is doing great too, sadly.",
  '{h}! Write home. Wait, home is lava. Never mind.',
  '{h}! My notes now say "AAAA" with extra exclamation points.',
  "{h}! Okay, show-off.",
  "{h}! I'm telling everyone I trained you.",
  "{h}! How's the view? Mine's mostly smoke.",
];

/** When the volcano starts rumbling and the lava is about to surge. */
export const RUMBLE: string[] = [
  'Ooh, feel that? The volcano is clearing its throat.',
  'Rumble alert! Something hot is coming up. Hop!',
  "The ground's buzzing. That's never good. Climb!",
  "Lava's about to surge. Move your feet, friend.",
  "Here it comes! Well, it's coming. Get higher!",
  'Deep breath. The volcano is about to sneeze.',
];

/** After the player gets through a surge. */
export const SURGE_SURVIVED: string[] = [
  'Whew! You outran a whole wall of lava. Nice.',
  'Still here? Good. That surge was rude.',
  'The lava came up, but you went up faster. Winning.',
  'That was close, and you stayed ahead of it. Good work.',
  "Surge dodged! I didn't even blink. I did blink.",
  'Look at you, riding the lava wave like a pro.',
];

/** The lava got very close, but the player escaped. */
export const NEAR_MISS: string[] = [
  'Ooh, that was close! I could feel the heat from here.',
  'Your tail was basically glowing. Lucky!',
  'The lava licked your heels. You got away.',
  'Too close! My eyebrows are singed. Keep going.',
  'Nice escape. That gap was tiny and you took it.',
  "Whoa! I think I just screamed. Don't tell anyone.",
];

/** Reaching the summit in the Daily Climb; the eruption launches the player out. */
export const SUMMIT: string[] = [
  'The summit! The eruption launched you right out. Wow.',
  'You made it to the top. The volcano is impressed. Grudgingly.',
  'Summit reached! The mountain is rumbling in applause.',
  'You beat the mountain. Fastest one wins the board.',
  'Top of the volcano! It blew its top, and so did I.',
  'Erupted out the top, and you did it. Nice one!',
];

/** Pick from a list, avoiding the lines in `recent` when it can. */
export function pick(list: string[], recent: string[]): string {
  const fresh = list.filter((l) => !recent.includes(l));
  const from = fresh.length ? fresh : list;
  return from[Math.floor(Math.random() * from.length)];
}

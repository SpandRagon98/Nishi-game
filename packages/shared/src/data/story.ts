/** All narrative text for Chapter 1. Original writing for NISHI: THE THIRD CALL. */

export type ObjectiveId = 'flashlight' | 'office' | 'reels' | 'power' | 'decode' | 'exit' | 'escape';

export const OBJECTIVES: { id: ObjectiveId; title: string; hint: string }[] = [
  { id: 'flashlight', title: 'Find a working flashlight', hint: 'A red emergency kit sits on the iron bench a few steps along the platform. Walk up to it and press E.' },
  { id: 'office', title: "Search the station master's office", hint: 'Cross the platform to the green door in the middle of the station building. Read the logbook (E), then open the desk drawer for the key.' },
  { id: 'reels', title: 'Recover the three SHUNYA audio reels', hint: 'Follow the marker to each reel. Up close they hiss like a running tape. Each one gives a number: your journal (Tab) keeps them.' },
  { id: 'power', title: 'Restore electricity at the fuse box', hint: 'Unlock the Maintenance Room (east end of the building) with the key. Set each fuse to the rating from the logbook; the fuse panel shows it.' },
  { id: 'decode', title: 'Decode the platform announcement', hint: 'Enter the reel numbers at the console in the Signal Room in the order the announcement called. Missed it? The console and your journal (Tab) keep the order, and the console can replay it.' },
  { id: 'exit', title: 'Open the station exit', hint: 'Go to the steel exit doors at the back of the Waiting Hall and start the door motor (E).' },
  { id: 'escape', title: 'Escape before the Caller takes you', hint: 'Run through the exit corridor behind the gate to the street. Do not stop.' },
];

/**
 * The spine of the chapter. A beat plays as a story card when it happens and is kept in the journal
 * under "The story so far". `next` tells the player exactly what to do afterwards.
 */
export type StoryBeatId = 'arrival' | ObjectiveId | 'first_hunt' | 'reel_1' | 'reel_2' | 'reel_3' | 'phone';

export const STORY_BEATS: Record<StoryBeatId, { title: string; text: string; next?: string }> = {
  arrival: {
    title: '03:13 AM · Nishipur Junction',
    text: 'Kabir parked by the gate and stayed in the car with the radio on. The moment you stepped inside, the gate slammed shut behind you. The timetable still reads 3:13, as it has since the night your mother vanished here in 1999. The tape said she is still on this platform. Something here has learned her voice.',
    next: 'Find a light. There is a red emergency kit on the bench just ahead.',
  },
  flashlight: {
    title: 'Her torch',
    text: 'Scratched into the handle: M. SEN, UNIT 4. Your mother held this light. She left it where you would find it.',
    next: "Cross to the station master's office: the green door in the middle of the building.",
  },
  phone: {
    title: 'The line that never closed',
    text: 'The telephone in the office has been ringing for twenty-seven years. The voice on the other end knows your name.',
  },
  office: {
    title: "The station master's log",
    text: "His last entries: 03:13, \"It said my name.\" 03:14, \"It said it again.\" Then nothing. In the drawer, the maintenance key and a note in your mother's hand: \"Three reels. Three numbers. Do not let it call a third time.\"",
    next: 'Find the three SHUNYA reels. The marker at the top of the screen points to the nearest one.',
  },
  reel_1: {
    title: 'The first voice',
    text: "A child counting in Bengali, stopping on one number. Then breathing, very close to the microphone, that is not the child's.",
  },
  reel_2: {
    title: 'The second voice',
    text: 'A station announcer repeating one number until his voice stops sounding like his own. Unit 4 recorded him the night the station closed.',
  },
  reel_3: {
    title: 'The third voice',
    text: "Your mother. Not a recording from 1999: she says your name, and today's date. \"If you are hearing this, I kept it busy long enough. Now finish it, Aditi.\"",
  },
  reels: {
    title: 'Three numbers',
    text: 'You have all three. The Caller does too: every time you lifted a reel, it heard you breathe. The station needs power before the console will listen.',
    next: 'Unlock the Maintenance Room at the east end of the building and restore the fuses.',
  },
  power: {
    title: 'The station wakes',
    text: 'The tubes stutter on, one platform at a time. The public address speakers hum. They have been waiting since 1999 to finish an announcement.',
    next: 'Listen for the reel order, then enter the numbers at the console in the Signal Room. The console can replay the announcement.',
  },
  decode: {
    title: 'The third call, answered',
    text: "Every speaker falls silent. Then, in your mother's voice, softly: \"Go. Now. Don't look back for me.\" Far away, the gate motor groans awake.",
    next: 'Open the steel exit doors at the back of the Waiting Hall.',
  },
  exit: {
    title: 'Run',
    text: 'The gate is open. Behind you, every speaker on the platform says your name. Once. Twice.',
    next: 'Run down the exit corridor to the street before it says it a third time.',
  },
  escape: {
    title: 'The street',
    text: 'Dawn over the tram lines. In your pocket the cassette is still turning. When you play it back at home there are two voices on it now: hers, and one that is learning yours.',
  },
  first_hunt: {
    title: 'It is hunting',
    text: 'The lights die and the static rises. The Caller is moving towards you.',
    next: 'Hide (lockers, cupboards, under counters) or keep moving out of its sight. A flashlight in its face stuns it for a moment.',
  },
};

export const FUSE_LABELS = ['PLATFORM LIGHTING', 'WAITING HALL', 'SIGNAL CABIN', 'PUBLIC ADDRESS'] as const;
export const FUSE_VALUES = [5, 10, 15, 20, 30] as const;

/** Bengali number words, as counted on the reels. */
export const BENGALI_NUMBERS = ['shunyo', 'ek', 'dui', 'tin', 'char', 'panch', 'chhoy', 'saat', 'aat', 'noy'];

export const REEL_TEXT: Record<string, (digit: number) => string> = {
  reel_a: (d) => `REEL A — a child counting slowly in Bengali, stopping at "${BENGALI_NUMBERS[d]}" (${d}). Then, very close to the microphone, someone breathes.`,
  reel_b: (d) => `REEL B — a station announcer reading platform numbers. He repeats "${BENGALI_NUMBERS[d]}" (${d}) until his voice stops sounding like his own.`,
  reel_c: (d) => `REEL C — your mother's voice: "If you are listening, the number is ${BENGALI_NUMBERS[d]}, ${d}. Don't let it say your name three times."`,
};

export function logbookText(solution: number[]): string {
  return [
    'NISHIPUR JN. — STATION MASTER\'S DAILY LOG',
    '13.03.1999  02:40  SHUNYA field unit still working in PA room. They asked for the platform to be kept empty.',
    '13.03.1999  03:05  Fuses replaced after surge. For the record:',
    ...solution.map((v, i) => `      ${['Platform lighting', 'Waiting hall', 'Signal cabin', 'Public address'][i]} — ${v} A`),
    '13.03.1999  03:13  Announcement played with nobody at the console. It said my name.',
    '13.03.1999  03:14  It said it again.',
    '(The rest of the page has been torn out.)',
  ].join('\n');
}

export const DOCUMENTS: Record<string, { title: string; body: string }> = {
  note_ticket: {
    title: 'Second-class ticket, Nishipur Jn. → Howrah',
    body: 'Issued 13 March 1999, 02:58. Passenger: M. SEN. On the back, in blue ink: "Platform Zero isn\'t on the map. Ask for it anyway." The ink matches your mother\'s handwriting.',
  },
  note_memo: {
    title: 'Project SHUNYA — internal memorandum',
    body: 'To all field units. Effective immediately, recordings are to be made only in pairs. Unit 4 reports that playback contains voices of staff who were not present at the time of recording. Unit 4 further reports that one of the voices answers questions. Do not ask it questions.',
  },
  note_photo: {
    title: 'Faded photograph',
    body: 'A woman in a cotton saree holds up an audio reel and laughs at whoever is behind the camera. Written on the back: "Mrinalini, Unit 4, last night of recording." Behind her, at the end of the carriage, a tall figure is standing too close to the window.',
  },
};

/** The cassette, then the phone call with Kabir: [speaker ('' = the tape), line, voice]. */
export const PROLOGUE_TAPE = [
  ['', "Aditi... if you're hearing this, I'm still at the station.", 'female'],
  ['', "Platform Zero. It isn't on any map. They built it for the recordings.", 'female'],
  ['', "It copies voices. It copied mine. Don't answer it when it calls the third time.", 'female'],
] as const;

export const PROLOGUE_CALL = [
  ['KABIR', "Aditi? It's two in the morning. What happened?", 'male'],
  ['ADITI', "It's her, Kabir. Ma's voice, on a tape. She says she's at Nishipur Junction. I'm going tonight.", 'female'],
  ['KABIR', "Then I'm driving you. I'll wait in the car outside with the radio on. No arguments.", 'male'],
  ['ADITI', 'Okay. Thank you, Kabir.', 'female'],
] as const;

/** Stable short key for a spoken line (FNV-1a): recorded clips are stored as <key>.mp3. */
export function lineKey(text: string) {
  let h = 0x811c9dc5;
  for (const ch of text.trim()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const PHONE_LINES = [
  'A woman\'s voice, very far away: "Aditi? Is that you? Don\'t come to the platform..." The line goes dead.',
  'Static. Then your own voice, recorded, saying words you have never said.',
  'A railway clerk reads out a list of names. Yours is the last one.',
];

const KABIR = 'KABIR (radio, from the car)';

export const RADIO = {
  intro: [
    { speaker: KABIR, text: "Aditi, radio check. I'm right outside in the car. The gate shut behind you the second you went in, and I can't move it from here." },
    { speaker: KABIR, text: "Your mother's unit hid three reels in there. Find them, get the power back, and the gate motor should answer. Torch first: there's an emergency kit on the bench right by you. And don't trust the announcements." },
  ],
  afterFlashlight: { speaker: KABIR, text: "I can see your light through the gate. Now the station master's office: green door, middle of the building. He kept a logbook, and the maintenance key." },
  afterOffice: { speaker: KABIR, text: "Keep that logbook in your head: the fuse ratings are in it. First the three reels. They hiss when you're close." },
  afterPower: { speaker: KABIR, text: "The lights just came on out here too. Listen to the announcement: it gives the order of the reels. If you miss it, the console in the signal room plays it again." },
  afterDecode: { speaker: KABIR, text: "The gate motor is live. Open it and run. I've got the car door open. Don't stop on the platform." },
  huntWarning: { speaker: 'RADIO', text: '— — static rises — —' },
};

export const ANNOUNCEMENTS = {
  arrival: (name: string) =>
    `Attention please. Passenger ${name}. Passenger ${name}. Please proceed to Platform Zero. Your train is arriving.`,
  /** after the power returns: the reel order and the console code it spells, said twice */
  decodeOrder: (order: string[], code: string) =>
    `Jatri-gon, mon dewa shunun. The third call will come in this order: reel ${order[0]}, then reel ${order[1]}, then reel ${order[2]}. The code is ${code.split('').join(', ')}. I repeat, ${code.split('').join(', ')}. Please do not answer.`,
  garbled: [
    'Attention please... the 3:13 local to... ... has been... cancelled. Passengers are requested to remain where they can be heard.',
    'Platform Zero... Platform Zero... somebody is waiting for you on Platform Zero.',
    'We regret to inform you that the last train has already left. We regret to inform you. We regret.',
  ],
};

/** Aditi talking to herself: now and then while exploring, and after each task. */
export const ADITI_THOUGHTS: { ambient: string[]; after: Partial<Record<ObjectiveId, string>> } = {
  ambient: [
    "It's so cold in here. I can see my breath.",
    'Nobody has been here in years. So why does it smell of smoke?',
    "Hello? ...No. Don't call out, Aditi.",
    'Ma walked on these same tiles. Twenty-seven years ago.',
    "That's just the wind. It's just the wind.",
    'Keep moving. Kabir is right outside.',
    'Why does every clock here stop at three thirteen?',
    'Somebody was sitting here. The dust is still warm.',
  ],
  after: {
    flashlight: "Ma's torch. It still works. Of course it does.",
    office: 'Three reels, three numbers. Okay. I can do this.',
    reels: "That's all three. Now the power.",
    power: 'Light. Finally. Now I just have to listen.',
    decode: 'That was her voice. Ma...',
    exit: "Run. Don't look back.",
  },
};

export const WHISPERS = [
  'stay where I can hear you',
  'the third time I call, you will answer',
  'she is still on the platform',
  'say your name for me',
  'I learned it from her',
];

/** Lines the Caller can forge over the team radio. `{name}` becomes a teammate's name. */
export const VOICE_DECEPTION_LINES = [
  '{name}: I found the last reel in the carriage. Come quick, I\'m in the toilet compartment.',
  '{name}: It went down into the passage, the platform is clear, move now!',
  '{name}: I\'m hurt. Ticket office. Please... I can\'t move.',
  '{name}: Turn your torch off, it can see the light. Turn it off.',
  '{name}: The gate is open. Everyone to the waiting hall.',
];

export const RADIO_PRESETS = [
  { id: 'here', text: 'Over here!' },
  { id: 'hunt', text: 'It\'s hunting, hide!' },
  { id: 'help', text: 'I need help!' },
  { id: 'reel', text: 'Found a reel.' },
  { id: 'clear', text: 'All clear.' },
  { id: 'fake', text: 'That message wasn\'t me.' },
];

/** All narrative text for Chapter 1. Original writing for NISHI: THE THIRD CALL. */

export type ObjectiveId = 'flashlight' | 'office' | 'reels' | 'power' | 'decode' | 'exit' | 'escape';

export const OBJECTIVES: { id: ObjectiveId; title: string; hint: string }[] = [
  { id: 'flashlight', title: 'Find a working flashlight', hint: 'Railway emergency kits are red metal boxes. Check the benches and the ticket office.' },
  { id: 'office', title: "Search the station master's office", hint: 'Read the logbook and check the desk drawer.' },
  { id: 'reels', title: 'Recover the three SHUNYA audio reels', hint: 'The reels were hidden around the station. Listen for tape hiss.' },
  { id: 'power', title: 'Restore electricity at the fuse box', hint: 'The fuse box is in the locked maintenance room. The logbook lists the correct fuse ratings.' },
  { id: 'decode', title: 'Decode the platform announcement', hint: 'Enter the reel numbers at the announcement console, in the order the announcement gives.' },
  { id: 'exit', title: 'Open the station exit', hint: 'The collapsible gate is in the waiting hall.' },
  { id: 'escape', title: 'Escape before the Caller takes you', hint: 'Run through the exit corridor to the street.' },
];

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

export const PHONE_LINES = [
  'A woman\'s voice, very far away: "Aditi? Is that you? Don\'t come to the platform..." The line goes dead.',
  'Static. Then your own voice, recorded, saying words you have never said.',
  'A railway clerk reads out a list of names. Yours is the last one.',
];

export const RADIO = {
  intro: [
    { speaker: 'DEV (archive liaison)', text: 'Radio check... can you hear me? The exit gates sealed themselves the moment you went in. Whatever runs this station is on the old SHUNYA circuit.' },
    { speaker: 'DEV (archive liaison)', text: 'Three reels were hidden here in 1999. Find them, get the power back, and the gate motor should answer. Find a torch first. Do not trust the announcements.' },
  ],
  afterFlashlight: { speaker: 'DEV (archive liaison)', text: "Good. The station master's office is next to the signal room. He kept a logbook, and the maintenance key." },
  afterOffice: { speaker: 'DEV (archive liaison)', text: 'The fuse ratings in that logbook should get the mains back. The fuse box is in maintenance.' },
  afterPower: { speaker: 'DEV (archive liaison)', text: 'Power is up. Listen to the announcement. It will give the order of the reels. Use the console in the signal room.' },
  afterDecode: { speaker: 'DEV (archive liaison)', text: 'The gate motor is live. Open it and run. Do not stop on the platform.' },
  huntWarning: { speaker: 'RADIO', text: '— — static rises — —' },
};

export const ANNOUNCEMENTS = {
  arrival: (name: string) =>
    `Attention please. Passenger ${name}. Passenger ${name}. Please proceed to Platform Zero. Your train is arriving.`,
  decodeOrder: (order: string[]) =>
    `Jatri-gon, mon dewa shunun. The third call will come in this order: reel ${order[0]}, then reel ${order[1]}, then reel ${order[2]}. Please do not answer.`,
  garbled: [
    'Attention please... the 3:13 local to... ... has been... cancelled. Passengers are requested to remain where they can be heard.',
    'Platform Zero... Platform Zero... somebody is waiting for you on Platform Zero.',
    'We regret to inform you that the last train has already left. We regret to inform you. We regret.',
  ],
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

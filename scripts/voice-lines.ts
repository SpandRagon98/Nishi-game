/**
 * Lists every fixed spoken line with the voice that reads it and whether its recording exists.
 * Recordings live in apps/client/src/assets/voice/<key>.mp3 (key = lineKey(text)); speech.ts plays
 * them and falls back to the browser's voice for anything unrecorded.
 *   npx tsx scripts/voice-lines.ts            all lines as JSON
 *   npx tsx scripts/voice-lines.ts --missing  only lines without a recording
 */
import { existsSync } from 'node:fs';
import { ADITI_THOUGHTS, ANNOUNCEMENTS, PHONE_LINES, PROLOGUE_CALL, PROLOGUE_TAPE, RADIO, lineKey } from '../packages/shared/src/index';

/** ElevenLabs preset voices on Higgsfield (text2speech_v2, variant elevenlabs). Swap an id and re-record its lines to recast. */
export const VOICES = {
  aditi: 'b0f766b7-8703-4bd1-b973-f857c36837b6', // Maya
  mother: 'ca83ca7f-c186-493d-bd69-0d765fa861b2', // Elena
  kabir: '6f98d3dd-324f-4845-8c28-c1d1647a06cd', // Marcus
  announcer: 'd081b915-6623-4a44-bacf-80d0f1c90a03', // Nora
  caller: 'e5666b9c-99a2-4fac-8b4e-abee078b186d', // Vlad, played slowed
};

const lines: [keyof typeof VOICES, string][] = [
  ...PROLOGUE_TAPE.map(([, t]) => ['mother', t] as const),
  ...PROLOGUE_CALL.map(([who, t]) => [who === 'KABIR' ? 'kabir' : 'aditi', t] as const),
  ['caller', 'I am still in the booth.'],
  ['mother', PHONE_LINES[0].match(/"([^"]+)"/)![1]],
  ...[...RADIO.intro, RADIO.afterFlashlight, RADIO.afterOffice, RADIO.afterPower, RADIO.afterDecode].map((l) => ['kabir', l.text] as const),
  ...[...ADITI_THOUGHTS.ambient, ...Object.values(ADITI_THOUGHTS.after)].map((t) => ['aditi', t!] as const),
  // the code announcement carries random digits, so it stays with the browser voice
  ...ANNOUNCEMENTS.garbled.map((t) => ['announcer', t] as const),
  ['announcer', 'This is the third call. This is the third call.'],
  ['announcer', 'Incorrect. Incorrect. Please wait where you are.'],
  ['announcer', 'Platform Zero is now closed. Thank you for travelling with us.'],
];

const dir = new URL('../apps/client/src/assets/voice/', import.meta.url);
const out = lines.map(([role, text]) => ({ key: lineKey(text), role, voice: VOICES[role], text, have: existsSync(new URL(`${lineKey(text)}.mp3`, dir)) }));
console.log(JSON.stringify(process.argv.includes('--missing') ? out.filter((l) => !l.have) : out, null, 1));

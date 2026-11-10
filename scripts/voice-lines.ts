/**
 * Lists every fixed spoken line: who says it, how (style), and whether its recording exists.
 * Recordings live in apps/client/src/assets/voice/<key>.mp3 (key = lineKey(text)); speech.ts plays
 * them and falls back to the browser's voice for anything unrecorded. scripts/voices/generate.py
 * records them locally with OmniVoice (VoiceStudio's default engine), see the README.
 *   npx tsx scripts/voice-lines.ts            all lines as JSON
 *   npx tsx scripts/voice-lines.ts --missing  only lines without a recording
 */
import { existsSync } from 'node:fs';
import {
  ADITI_THOUGHTS, ANNOUNCEMENTS, CUTSCENE_LINES, NISHI_CALL, PHONE_LINES, PROLOGUE_CALL, PROLOGUE_TAPE, RADIO, lineKey,
} from '../packages/shared/src/index';

/**
 * The cast (voice design attributes, then the delivery each line gets):
 *   aditi     Aditi Sen, 27: young adult woman, Indian English. Frightened, holding herself together.
 *   mother    Mrinalini Sen (Ma), lost in 1999: middle-aged woman, low and warm, tired, urgent.
 *   kabir     Kabir, 28, waiting in the car: young man, low, steady for her sake, worried underneath.
 *   announcer the station's public address: a middle-aged woman's railway announcement voice.
 *   booth     the voice under the hiss on the tape: an old man, very low, slowed down.
 * The Caller has no voice of its own: it speaks with Ma's (`call` and `caller` styles are hers).
 */
export type Role = 'aditi' | 'mother' | 'kabir' | 'announcer' | 'booth';
/**
 * speak: plain · thought: Aditi under her breath · radio: Kabir over the walkie-talkie · phone: a phone
 * line · tape: the cassette and the reels · pa: the station speakers · note: Ma's words read close in the
 * head · call: the Nishi calling in Ma's voice (mixed live: one ear, far away) · caller: the same voice,
 * wrong (slowed, lowered, doubled with a whisper)
 */
export type Style = 'speak' | 'thought' | 'radio' | 'phone' | 'tape' | 'pa' | 'note' | 'call' | 'caller';

const lines: [Role, Style, string][] = [
  ...PROLOGUE_TAPE.map(([, t]) => ['mother', 'tape', t] as [Role, Style, string]),
  ...PROLOGUE_CALL.map(([who, t]) => (who === 'KABIR' ? ['kabir', 'phone', t] : ['aditi', 'speak', t]) as [Role, Style, string]),
  ['booth', 'tape', 'I am still in the booth.'],
  ['mother', 'phone', PHONE_LINES[0].match(/"([^"]+)"/)![1]],
  ...[...RADIO.intro, RADIO.afterFlashlight, RADIO.afterOffice, RADIO.afterPower, RADIO.afterDecode].map((l) => ['kabir', 'radio', l.text] as [Role, Style, string]),
  ...[...ADITI_THOUGHTS.ambient, ...Object.values(ADITI_THOUGHTS.after)].map((t) => ['aditi', 'thought', t!] as [Role, Style, string]),
  ...NISHI_CALL.replies.map((t) => ['aditi', 'thought', t] as [Role, Style, string]),
  ['aditi', 'thought', NISHI_CALL.resisted],
  ...NISHI_CALL.calls.map((t, i) => ['mother', i < 2 ? 'call' : 'caller', t] as [Role, Style, string]),
  ...Object.entries(CUTSCENE_LINES).flatMap(([id, ls]) =>
    ls!.map((l) => [l.who === 'aditi' ? 'aditi' : 'mother', l.who === 'caller' ? 'caller' : ({ office: 'note', reels: 'tape', decode: 'pa' } as Record<string, Style>)[id] ?? 'speak', l.text] as [Role, Style, string]),
  ),
  // the code announcement carries random digits, so it stays with the browser voice
  ...ANNOUNCEMENTS.garbled.map((t) => ['announcer', 'pa', t] as [Role, Style, string]),
  ['announcer', 'pa', 'This is the third call. This is the third call.'],
  ['announcer', 'pa', 'Incorrect. Incorrect. Please wait where you are.'],
  ['announcer', 'pa', 'Platform Zero is now closed. Thank you for travelling with us.'],
];

const dir = new URL('../apps/client/src/assets/voice/', import.meta.url);
const seen = new Set<string>();
const out = lines
  .map(([role, style, text]) => ({ key: lineKey(text), role, style, text, have: existsSync(new URL(`${lineKey(text)}.mp3`, dir)) }))
  // a line said by two parts of the story is recorded once
  .filter((l) => !seen.has(l.key) && seen.add(l.key));
console.log(JSON.stringify(process.argv.includes('--missing') ? out.filter((l) => !l.have) : out, null, 1));

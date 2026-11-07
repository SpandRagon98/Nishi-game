import { audio, FORCE_MUTE } from './engine';

/**
 * Spoken lines use the browser's built-in speech synthesis (no external TTS service, no recordings).
 * When unavailable, subtitles still carry every line.
 */
let voices: SpeechSynthesisVoice[] = [];
function refreshVoices() {
  try {
    voices = window.speechSynthesis?.getVoices() ?? [];
  } catch {
    voices = [];
  }
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function pickVoice(pref: 'in' | 'female' | 'male') {
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const india = en.filter((v) => /in$/i.test(v.lang) || /india/i.test(v.name));
  const pool = india.length ? india : en;
  if (pref === 'female') return pool.find((v) => /female|heera|veena|zira|neerja|aria|samantha/i.test(v.name)) ?? pool[0];
  if (pref === 'male') return pool.find((v) => /male|ravi|david|prabhat|guy|daniel/i.test(v.name)) ?? pool[0];
  return pool[0];
}

export interface SpeakOpts {
  voice?: 'in' | 'female' | 'male';
  rate?: number;
  pitch?: number;
  enabled: boolean;
}

export function speak(text: string, o: SpeakOpts) {
  if (FORCE_MUTE || !o.enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(o.voice ?? 'in');
    if (v) u.voice = v;
    u.rate = o.rate ?? 0.95;
    u.pitch = o.pitch ?? 1;
    u.volume = Math.min(1, audio.dialogueVolume);
    window.speechSynthesis.speak(u);
  } catch {
    /* speech is optional */
  }
}

export function stopSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

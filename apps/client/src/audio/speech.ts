import { lineKey } from '@nishi/shared';
import { audio, FORCE_MUTE } from './engine';

/**
 * Spoken lines. A line plays a recorded voice clip when one exists for its exact text
 * (src/assets/voice/<lineKey(text)>.mp3, listed by scripts/voice-lines.ts); otherwise the browser's
 * speech synthesis reads it. Subtitles always carry every line.
 */
const CLIPS = import.meta.glob('../assets/voice/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const clipUrl = (text: string): string | undefined => CLIPS[`../assets/voice/${lineKey(text)}.mp3`];

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

const playing = new Set<HTMLAudioElement>();
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Speaks a line and resolves when it has finished (or after its reading time when silent). */
export function speak(text: string, o: SpeakOpts): Promise<void> {
  const readingTime = 900 + text.length * 60;
  if (FORCE_MUTE || !o.enabled || typeof window === 'undefined') return wait(readingTime);
  const url = clipUrl(text);
  return new Promise<void>((resolve) => {
    const safety = setTimeout(resolve, readingTime * 2.5);
    const done = () => {
      clearTimeout(safety);
      resolve();
    };
    try {
      if (url) {
        const a = new Audio(url);
        // slowed clips drop in pitch too: the garbled announcements and the voice under the hiss
        a.preservesPitch = false;
        a.playbackRate = o.rate !== undefined && o.rate <= 0.8 ? o.rate + 0.1 : 1;
        a.volume = Math.min(1, audio.dialogueVolume);
        a.onended = a.onerror = () => {
          playing.delete(a);
          done();
        };
        playing.add(a);
        void a.play().catch(done);
        return;
      }
      if (!('speechSynthesis' in window)) return void setTimeout(done, readingTime);
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(o.voice ?? 'in');
      if (v) u.voice = v;
      u.rate = o.rate ?? 0.95;
      u.pitch = o.pitch ?? 1;
      u.volume = Math.min(1, audio.dialogueVolume);
      u.onend = u.onerror = done;
      window.speechSynthesis.speak(u);
    } catch {
      done();
    }
  });
}

export function stopSpeech() {
  for (const a of playing) a.pause();
  playing.clear();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

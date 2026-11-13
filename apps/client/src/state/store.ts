import type { Room } from '@colyseus/sdk';
import { createProfile, type StoryBeatId, type GhostAbilityId, type MatchSummary, type ObjectiveId, type PlayerProfile, type ProgressionUpdate } from '@nishi/shared';
import { create } from 'zustand';
import type { GameSession } from '../game/session';
import { profileRepository } from './profile';
import { loadSettings, saveSettings, type Settings } from './settings';

export type Screen = 'menu' | 'prologue' | 'characters' | 'chapters' | 'unlocks' | 'settings' | 'credits' | 'lobby' | 'loading' | 'game';
export type Overlay = null | 'pause' | 'journal' | 'doc' | 'fuse' | 'keypad' | 'chat' | 'ending' | 'end';

export interface Subtitle {
  id: number;
  speaker: string;
  text: string;
  kind: 'radio' | 'announcement' | 'whisper' | 'phone' | 'tape' | 'system' | 'thought';
  fake?: boolean;
  start: number;
  end: number;
}

export interface Toast {
  id: number;
  title: string;
  text?: string;
  tone: 'info' | 'warn' | 'good' | 'unlock';
  until: number;
}

export interface HudState {
  prompt: string | null;
  zone: string;
  clock: string;
  stamina: number;
  exhausted: boolean;
  flashlight: boolean;
  hasFlashlight: boolean;
  /** the flashlight is in hand rather than the phone */
  usingFlashlight: boolean;
  abilityName: string;
  abilityLeft: number;
  abilityCooldown: number;
  abilityActive: boolean;
  hiding: boolean;
  status: string;
  bleedout: number;
  reviveProgress: number;
  signal: number;
  objective: ObjectiveId | null;
  echo: { angle: number; kind: 'ghost' | 'echo' | 'apparition'; dist: number }[];
  teammates: { id: string; name: string; status: string; characterId: string }[];
  ghost: {
    energy: number;
    readyIn: Record<GhostAbilityId, number>;
    mode: string;
    huntLeft: number;
    warnLeft: number;
    stunLeft: number;
    time: number;
  } | null;
  downedNearby: string | null;
  /** where the next task is: step text, bearing relative to the view (rad), route distance (m) */
  guide: { step: string; angle: number; dist: number; vertical: 'up' | 'down' | null } | null;
}

const EMPTY_HUD: HudState = {
  prompt: null, zone: '', clock: '03:13', stamina: 1, exhausted: false, flashlight: false, hasFlashlight: false, usingFlashlight: false,
  abilityName: '', abilityLeft: 0, abilityCooldown: 1, abilityActive: false, hiding: false, status: 'alive', bleedout: 0,
  reviveProgress: 0, signal: 0, objective: 'flashlight', echo: [], teammates: [], ghost: null, downedNearby: null, guide: null,
};

export type StartRequest = { kind: 'solo' } | { kind: 'multi'; room: Room };

interface AppState {
  screen: Screen;
  settingsReturn: Screen;
  settings: Settings;
  profile: PlayerProfile;
  profileLoaded: boolean;
  room: Room | null;
  session: GameSession | null;
  start: StartRequest | null;
  overlay: Overlay;
  doc: { title: string; body: string } | null;
  subtitles: Subtitle[];
  toasts: Toast[];
  radioLog: Subtitle[];
  chatLog: { id: number; from: string; text: string; fake?: boolean; at: number }[];
  hud: HudState;
  end: { summary: MatchSummary; progression: ProgressionUpdate | null; won: boolean } | null;
  /** story beats reached this match, in order (the journal's "story so far") */
  storyLog: StoryBeatId[];
  /** beats waiting to be shown as story cards; the first one is on screen */
  storyQueue: { id: StoryBeatId; until: number }[];

  go(screen: Screen): void;
  openSettings(from: Screen): void;
  setSettings(p: Partial<Settings>): void;
  initProfile(): Promise<void>;
  updateProfile(fn: (p: PlayerProfile) => PlayerProfile): void;
  setOverlay(o: Overlay): void;
  showDoc(title: string, body: string): void;
  subtitle(s: Omit<Subtitle, 'id' | 'start' | 'end'>, duration?: number): void;
  toast(t: Omit<Toast, 'id' | 'until'>, ms?: number): void;
  chat(from: string, text: string, fake?: boolean): void;
  setHud(h: Partial<HudState>): void;
  resetGameUi(): void;
  beat(id: StoryBeatId): void;
  popStory(): void;
}

let uid = 1;

export const useApp = create<AppState>((set, get) => ({
  screen: 'menu',
  settingsReturn: 'menu',
  settings: loadSettings(),
  profile: createProfile('pending', 'Guest'),
  profileLoaded: false,
  room: null,
  session: null,
  start: null,
  overlay: null,
  doc: null,
  subtitles: [],
  toasts: [],
  radioLog: [],
  chatLog: [],
  hud: EMPTY_HUD,
  end: null,
  storyLog: [],
  storyQueue: [],

  go: (screen) => set({ screen }),
  openSettings: (from) => set({ screen: 'settings', settingsReturn: from }),
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    saveSettings(settings);
    set({ settings });
  },
  initProfile: async () => {
    const profile = await profileRepository.load();
    set({ profile, profileLoaded: true });
  },
  updateProfile: (fn) => {
    const profile = fn(get().profile);
    set({ profile });
    void profileRepository.save(profile);
  },
  setOverlay: (overlay) => set({ overlay }),
  showDoc: (title, body) => set({ doc: { title, body }, overlay: 'doc' }),
  subtitle: (s, duration) => {
    const now = performance.now();
    const queue = get().subtitles.filter((x) => x.end > now);
    const lastEnd = queue.length ? Math.max(...queue.map((x) => x.end)) : now;
    const dur = duration ?? Math.min(9000, 2200 + s.text.length * 55);
    const start = s.kind === 'whisper' ? now : Math.max(now, lastEnd);
    const sub: Subtitle = { ...s, id: uid++, start, end: start + dur };
    set({ subtitles: [...queue, sub], radioLog: [...get().radioLog, sub].slice(-40) });
  },
  toast: (t, ms = 4200) => {
    const now = performance.now();
    set({ toasts: [...get().toasts.filter((x) => x.until > now), { ...t, id: uid++, until: now + ms }].slice(-5) });
  },
  chat: (from, text, fake) => set({ chatLog: [...get().chatLog, { id: uid++, from, text, fake, at: performance.now() }].slice(-30) }),
  setHud: (h) => set({ hud: { ...get().hud, ...h } }),
  resetGameUi: () => set({ overlay: null, doc: null, subtitles: [], toasts: [], radioLog: [], chatLog: [], hud: EMPTY_HUD, end: null, storyLog: [], storyQueue: [] }),
  popStory: () => set({ storyQueue: get().storyQueue.slice(1) }),
  beat: (id) => {
    if (get().storyLog.includes(id)) return;
    set({ storyLog: [...get().storyLog, id], storyQueue: [...get().storyQueue, { id, until: 0 }] });
  },
}));

/** Non-reactive accessor for hot paths (render loop, input handlers). */
export const app = () => useApp.getState();

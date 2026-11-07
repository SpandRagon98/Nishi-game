export type UnlockCondition =
  | { type: 'default' }
  | { type: 'achievement'; id: string }
  | { type: 'chapter'; chapterId: string }
  | { type: 'collectibles'; count: number }
  | { type: 'wins'; role: 'survivor' | 'ghost'; count: number };

export interface SurvivorStats {
  walk: number;
  sprint: number;
  crouch: number;
  /** seconds of continuous sprint from full stamina */
  sprintSeconds: number;
  reviveSeconds: number;
}

export interface SurvivorDef {
  id: string;
  name: string;
  profession: string;
  origin: string;
  backstory: string;
  ability: { id: 'echo_sense' | 'adrenaline' | 'none'; name: string; key: string; description: string; cooldown: number; duration: number };
  passive: string;
  stats: SurvivorStats;
  palette: { coat: string; accent: string; trousers: string; skin: string; hair: string };
  unlock: UnlockCondition;
  /** false = registered for a future chapter, not yet selectable in this build */
  playable: boolean;
}

export interface GhostDef {
  id: string;
  name: string;
  title: string;
  lore: string;
  palette: { body: string; glow: string };
  unlock: UnlockCondition;
  playable: boolean;
}

const BASE: SurvivorStats = { walk: 2.7, sprint: 5.4, crouch: 1.5, sprintSeconds: 6, reviveSeconds: 5 };

export const SURVIVORS: SurvivorDef[] = [
  {
    id: 'aditi',
    name: 'Aditi Sen',
    profession: 'Audio forensic investigator',
    origin: 'Kolkata, West Bengal',
    backstory:
      "Aditi rebuilds voices from damaged tape for court cases. Twenty-seven years ago her mother, an archivist, left for a night shift and never came home. Last week a reel arrived at Aditi's lab with no sender, and her mother's voice was on it.",
    ability: {
      id: 'echo_sense', name: 'Echo Sense', key: 'Q', cooldown: 25, duration: 5,
      description: 'Isolate supernatural frequencies for 5 seconds: shows the direction of the Caller and of false sound sources, and exposes forged radio messages.',
    },
    passive: "Hears the Caller's approach from further away.",
    stats: { ...BASE },
    palette: { coat: '#24414a', accent: '#c9b37e', trousers: '#1d1f24', skin: '#a8765a', hair: '#141110' },
    unlock: { type: 'default' },
    playable: true,
  },
  {
    id: 'kabir',
    name: 'Kabir Khan',
    profession: 'Emergency responder',
    origin: 'Howrah, West Bengal',
    backstory:
      "Kabir has pulled people from collapsed buildings and flooded subways. He signed on as the team's medic because the archive offered double pay. He does not believe in ghosts. He also has not slept since he heard the recording.",
    ability: {
      id: 'adrenaline', name: 'Adrenaline', key: 'Q', cooldown: 50, duration: 6,
      description: 'Instantly refills stamina and removes sprint drain for 6 seconds.',
    },
    passive: 'Revives teammates 2.5x faster and has 25% more sprint endurance.',
    stats: { ...BASE, sprint: 5.2, sprintSeconds: 7.5, reviveSeconds: 2 },
    palette: { coat: '#8a2f1f', accent: '#d8d2b4', trousers: '#26282c', skin: '#8d5e44', hair: '#0f0d0c' },
    unlock: { type: 'default' },
    playable: true,
  },
  {
    id: 'meera',
    name: 'Meera Iyer',
    profession: 'Archive cataloguer',
    origin: 'Chennai, Tamil Nadu',
    backstory: 'Meera indexed the surviving SHUNYA catalogue cards. Some of the cards list recordings dated after the project was shut down.',
    ability: { id: 'none', name: 'Cross-Reference', key: 'Q', cooldown: 0, duration: 0, description: 'Arrives with Chapter 3: reveals hidden evidence locations.' },
    passive: 'Arrives with Chapter 3.',
    stats: { ...BASE },
    palette: { coat: '#4b3a5a', accent: '#d0a24c', trousers: '#222222', skin: '#7a5039', hair: '#0d0b0b' },
    unlock: { type: 'collectibles', count: 3 },
    playable: false,
  },
  {
    id: 'tenzin',
    name: 'Tenzin Dorje',
    profession: 'Mountain rescue guide',
    origin: 'Darjeeling, West Bengal',
    backstory: 'Tenzin grew up below the old sanatorium. He knows which of its stairways go nowhere.',
    ability: { id: 'none', name: 'Pathfinder', key: 'Q', cooldown: 0, duration: 0, description: 'Arrives with Chapter 4.' },
    passive: 'Arrives with Chapter 4.',
    stats: { ...BASE },
    palette: { coat: '#2f4b2c', accent: '#b74a2a', trousers: '#232323', skin: '#b8875f', hair: '#111111' },
    unlock: { type: 'chapter', chapterId: 'ward-13' },
    playable: false,
  },
  {
    id: 'farah',
    name: 'Farah Qureshi',
    profession: 'Film restorer',
    origin: 'Mumbai, Maharashtra',
    backstory: 'Farah restores nitrate reels for a studio archive. One reel keeps restoring itself overnight.',
    ability: { id: 'none', name: 'Exposure', key: 'Q', cooldown: 0, duration: 0, description: 'Arrives with Chapter 5.' },
    passive: 'Arrives with Chapter 5.',
    stats: { ...BASE },
    palette: { coat: '#3b2a22', accent: '#e0c38a', trousers: '#1f1f1f', skin: '#a77455', hair: '#1a1412' },
    unlock: { type: 'achievement', id: 'flashbulb' },
    playable: false,
  },
];

export const GHOSTS: GhostDef[] = [
  {
    id: 'caller',
    name: 'The Caller',
    title: 'Echo of Project SHUNYA',
    lore:
      'Nobody recorded the Caller. It recorded itself, in the silence between tracks and the hiss after a name is spoken. It wears the voices it has collected. It has learned to call a third time.',
    palette: { body: '#0b0d10', glow: '#9fb8c8' },
    unlock: { type: 'default' },
    playable: true,
  },
  {
    id: 'seventh-lock',
    name: 'The Seventh Lock',
    title: 'Mistress of the Mansion',
    lore: 'A presence bound behind seven locks in a rural Bengali mansion. Arrives with Chapter 2.',
    palette: { body: '#1a0b0b', glow: '#c86a5a' },
    unlock: { type: 'wins', role: 'ghost', count: 3 },
    playable: false,
  },
];

export const survivorById = (id: string) => SURVIVORS.find((s) => s.id === id) ?? SURVIVORS[0];
export const ghostById = (id: string) => GHOSTS.find((g) => g.id === id) ?? GHOSTS[0];

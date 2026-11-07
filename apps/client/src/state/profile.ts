import { createProfile, sanitizeProfile, type PlayerProfile } from '@nishi/shared';

/**
 * Persistence boundary for player progression.
 *
 * The prototype uses anonymous guest profiles stored in the browser. To move to Supabase (or any
 * other backend), implement this interface with a server-backed repository. Never put service keys
 * in the frontend: use the backend's public anon key plus row-level security, or your own API.
 */
export interface ProfileRepository {
  load(): Promise<PlayerProfile>;
  save(profile: PlayerProfile): Promise<void>;
  reset(): Promise<PlayerProfile>;
}

const KEY = 'nishi.profile.v1';

function newGuestId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'guest_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class LocalProfileRepository implements ProfileRepository {
  async load(): Promise<PlayerProfile> {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return sanitizeProfile(JSON.parse(raw), newGuestId());
    } catch {
      /* fall through to a fresh profile */
    }
    const p = createProfile(newGuestId(), 'Guest');
    await this.save(p);
    return p;
  }

  async save(profile: PlayerProfile) {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {
      /* storage unavailable: progress lasts for this session only */
    }
  }

  async reset() {
    const p = createProfile(newGuestId(), 'Guest');
    await this.save(p);
    return p;
  }
}

export const profileRepository: ProfileRepository = new LocalProfileRepository();

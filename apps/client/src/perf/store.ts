import { create } from 'zustand';

/** Live renderer stats and the adaptive governor's current decisions. */
export interface PerfState {
  fps: number;
  /** worst frame of the last second, in ms */
  worst: number;
  dpr: number;
  /** 0 = full profile, 1 = AO off, 2 = post-processing off */
  degrade: number;
  calls: number;
  tris: number;
}

export const usePerf = create<PerfState>(() => ({ fps: 0, worst: 0, dpr: 1, degrade: 0, calls: 0, tris: 0 }));

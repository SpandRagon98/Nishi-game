export interface ChapterDef {
  id: string;
  index: number;
  title: string;
  location: string;
  synopsis: string;
  levelId: string | null;
  available: boolean;
  loadingLines: string[];
}

export const CHAPTERS: ChapterDef[] = [
  {
    id: 'platform-zero', index: 1, title: 'Platform Zero', location: 'Abandoned railway junction near Kolkata',
    synopsis: 'Nishipur Junction closed in 1999, the same week Project SHUNYA was shut down. At 3:13 AM its announcement system is speaking your name.',
    levelId: 'platform-zero', available: true,
    loadingLines: [
      'Nishipur Junction was decommissioned on 14 March 1999. The timetable board was never taken down.',
      'Locals say the last train still announces itself at 3:13 AM.',
      "SHUNYA field unit 4 installed recording equipment inside the station's public address system.",
    ],
  },
  { id: 'seven-locks', index: 2, title: 'The House of Seven Locks', location: 'Rural Bengali mansion', synopsis: 'A zamindar mansion where every door was locked from the inside.', levelId: null, available: false, loadingLines: [] },
  { id: 'stepwell', index: 3, title: 'The Stepwell', location: 'Rajasthan', synopsis: 'Thirteen storeys down, the water remembers every voice that fell into it.', levelId: null, available: false, loadingLines: [] },
  { id: 'ward-13', index: 4, title: 'Ward 13', location: 'Himalayan sanatorium', synopsis: 'Patients were recorded describing a visitor who came every night at the same minute.', levelId: null, available: false, loadingLines: [] },
  { id: 'reel-nine', index: 5, title: 'Reel Number Nine', location: 'Mumbai film studio', synopsis: 'An unfinished film whose dubbing sessions were never completed by the living.', levelId: null, available: false, loadingLines: [] },
  { id: 'flooded-letters', index: 6, title: 'The Flooded Letters', location: 'Kerala backwaters', synopsis: 'A drowned post office still sorts letters addressed to the missing.', levelId: null, available: false, loadingLines: [] },
  { id: 'last-broadcast', index: 7, title: 'The Last Broadcast', location: 'Assam radio relay facility', synopsis: 'The relay tower transmits a programme that was never scheduled.', levelId: null, available: false, loadingLines: [] },
  { id: 'shunya', index: 8, title: 'SHUNYA', location: 'Underground archival complex', synopsis: 'Forty thousand voices. One of them is waiting for you to answer.', levelId: null, available: false, loadingLines: [] },
];

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);

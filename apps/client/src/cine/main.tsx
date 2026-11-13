import { createRoot } from 'react-dom/client';
import '../styles.css';
import { getTextures } from '../three/textures';
import './cine.css';
import { Preview } from './notalone/Preview';

/**
 * The cutscene preview (cine.html, dev server only). It shares the game's renderer, materials,
 * textures, fog and audio engine but is its own page: nothing here touches the game's state,
 * story, saves or flow.
 */
const root = createRoot(document.getElementById('root')!);
root.render(<div className="cine-loading kicker">Loading the preview…</div>);
const coarse = matchMedia('(pointer: coarse)').matches;
void Promise.all([
  getTextures(coarse ? 512 : 1024, () => {}),
  // the phone screen and the reel's label are painted on canvases: their fonts must be ready first
  document.fonts.load('500 32px "IBM Plex Mono"'),
  document.fonts.load('400 32px "IBM Plex Sans"'),
  document.fonts.load('300 32px "IBM Plex Sans"'),
  document.fonts.load('500 32px "Noto Serif Bengali"', 'নিশিপুর'),
]).then(() => root.render(<Preview />));

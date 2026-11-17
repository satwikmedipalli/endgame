import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/bricolage-grotesque/400.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';

import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initSupabase } from './lib';

window.endgame.getConfig().then((c) => {
  initSupabase(c);
  createRoot(document.getElementById('root')!).render(<App configured={!!c} />);
});

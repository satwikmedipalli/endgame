// The paper's two themes: Salmon from sunrise to sunset in Richardson, Sepia after.
// Colours live in styles.css as CSS variables; this only decides which set is on.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { NEXT_PREF, resolveTheme, type ThemeMode, type ThemePref } from '@shared/sun';
import type { CardKind } from '@shared/types';
import { local } from './lib';

type ThemeValue = { mode: ThemeMode; pref: ThemePref; label: string; setPref: (p: ThemePref) => void; cyclePref: () => void };

const KEY = 'endgame.themePref';
const Ctx = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => local.get<ThemePref>(KEY, 'auto'));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Re-check once a minute so the theme (and the Dock icon) flip at sunrise and sunset.
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const { mode, label } = resolveTheme(pref, now);
    const setPref = (p: ThemePref) => {
      setPrefState(p);
      local.set(KEY, p);
    };
    return { mode, pref, label: label.replace('tap the icon for Auto', 'change it in Settings'), setPref, cyclePref: () => setPref(NEXT_PREF[pref]) };
  }, [pref, now]);

  useEffect(() => {
    document.documentElement.dataset.theme = value.mode;
    window.endgame.setTheme(value.mode);
  }, [value.mode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}

export const KIND_LABEL: Record<CardKind, string> = {
  news: 'News',
  code: 'Coding',
  history: 'History',
  chess: 'Chess',
  stocks: 'Markets',
  italian: 'Italiano',
  watch: 'Watch',
  puzzle: 'Puzzle',
};

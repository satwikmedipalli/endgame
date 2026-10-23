import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { NEXT_PREF, resolveTheme, type ThemeMode, type ThemePref } from '@/lib/sun';
import { palettes, type Palette } from './tokens';

type ThemeValue = {
  mode: ThemeMode;
  pref: ThemePref;
  label: string;
  t: Palette;
  setPref: (p: ThemePref) => void;
  cyclePref: () => void;
};

const KEY = 'endgame.themePref';
const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('auto');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'auto' || v === 'light' || v === 'dark') setPrefState(v);
      })
      .catch(() => {});
    // Re-check once a minute so the theme flips at sunrise and sunset by itself.
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const { mode, label } = resolveTheme(pref, now);
    const setPref = (p: ThemePref) => {
      setPrefState(p);
      AsyncStorage.setItem(KEY, p).catch(() => {});
    };
    return { mode, pref, label, t: palettes[mode], setPref, cyclePref: () => setPref(NEXT_PREF[pref]) };
  }, [pref, now]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}

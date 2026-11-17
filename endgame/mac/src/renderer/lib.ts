// Supabase for the window. It's created once the main process has handed over the settings.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { EndgameConfig } from '../api';

/** Null when Endgame isn't set up yet (or in the sample-day demo). */
export let supabase: SupabaseClient | null = null;
export let config: EndgameConfig | null = null;

export function initSupabase(c: EndgameConfig | null) {
  config = c;
  supabase = c
    ? createClient(c.supabaseUrl, c.supabaseKey, {
        // Keeps you signed in: the session lives in the app's storage and refreshes itself.
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'endgame.auth' },
      })
    : null;
}

export const uuid = () => crypto.randomUUID();

/** Small key/value store on this Mac (the app's own storage). */
export const local = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

/** Typing in a field shouldn't trigger the one-key shortcuts. */
export const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

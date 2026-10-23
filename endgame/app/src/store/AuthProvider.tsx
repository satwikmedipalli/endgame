import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

type Auth = {
  /** False until the stored session has been read. */
  ready: boolean;
  /** True when Supabase is configured; false means on-device only. */
  enabled: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<Auth>(
    () => ({
      ready,
      enabled: !!supabase,
      session,
      // Both return an error message, or null on success.
      signIn: async (email, password) => {
        const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
        return error?.message ?? null;
      },
      // Only works until signups are switched off after the first account.
      signUp: async (email, password) => {
        const { data, error } = await supabase!.auth.signUp({ email: email.trim(), password });
        if (error) return error.message;
        return data.session ? null : 'Account created, but email confirmation is still on in Supabase.';
      },
      signOut: async () => {
        await supabase?.auth.signOut();
      },
    }),
    [ready, session],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

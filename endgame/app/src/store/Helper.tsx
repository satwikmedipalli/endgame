import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { toRows } from '@/lib/sync';
import type { ChatMessage } from '@/lib/types';
import { useFeed } from './FeedStore';

// Talks to the Mac helper through Supabase: its heartbeat, Sync jobs and chat jobs.
const ONLINE_WITHIN_MS = 90_000;

export type SyncJob = { id: string; status: 'queued' | 'running' | 'done' | 'failed'; stage?: string; error?: string; day?: string };

type Helper = {
  /** The Mac helper sent a heartbeat in the last 90 seconds. */
  online: boolean;
  lastSeen: string | null;
  busy: string | null;
  job: SyncJob | null;
  requestSync: (day?: string) => Promise<void>;
  ask: (cardId: string, text: string) => Promise<void>;
  /** Card ids waiting for a reply. */
  thinking: Set<string>;
};

const Ctx = createContext<Helper | null>(null);

export function HelperProvider({ children }: { children: ReactNode }) {
  const feed = useFeed();
  const { userId, appendChat, syncNow } = feed;
  const [status, setStatus] = useState<{ last_seen: string; busy: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [job, setJob] = useState<SyncJob | null>(null);
  const [thinking, setThinking] = useState<Set<string>>(new Set());
  const chatJobs = useRef(new Map<string, string>()); // job id → card id
  const todayRef = useRef(feed.today);
  // The store's functions change on every edit; keep the realtime channel stable.
  const fns = useRef({ appendChat, syncNow });

  useEffect(() => {
    todayRef.current = feed.today;
    fns.current = { appendChat, syncNow };
  }, [feed.today, appendChat, syncNow]);

  const stopThinking = useCallback((cardId: string) => {
    setThinking((s) => {
      if (!s.has(cardId)) return s;
      const n = new Set(s);
      n.delete(cardId);
      return n;
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    const sb = supabase;
    sb.from('helper_status')
      .select('last_seen, busy')
      .maybeSingle()
      .then(({ data }) => data && setStatus(data));

    const ch = sb
      .channel(`endgame-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'helper_status', filter: `user_id=eq.${userId}` }, (p) => {
        const row = p.new as { last_seen: string; busy: string | null };
        if (row?.last_seen) setStatus(row);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `user_id=eq.${userId}` }, (p) => {
        const r = p.new as { id: string; card_id: string; role: ChatMessage['role']; text: string; created_at: string };
        fns.current.appendChat(r.card_id, { id: r.id, role: r.role, text: r.text, at: new Date(r.created_at).toISOString() });
        if (r.role === 'assistant') stopThinking(r.card_id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `user_id=eq.${userId}` }, (p) => {
        const r = p.new as { id: string; type: string; status: SyncJob['status']; result?: { stage?: string; day?: string }; error?: string };
        if (r.type === 'sync') {
          setJob((j) => (j && j.id === r.id ? { ...j, status: r.status, stage: r.result?.stage ?? j.stage, error: r.error, day: r.result?.day ?? j.day } : j));
          if (r.status === 'done') fns.current.syncNow();
        }
        if (r.type === 'chat' && r.status === 'failed') {
          const cardId = chatJobs.current.get(r.id);
          if (cardId) {
            stopThinking(cardId);
            fns.current.appendChat(cardId, { id: randomUUID(), role: 'system', text: `The Mac couldn't answer: ${r.error ?? 'unknown error'}`, at: new Date().toISOString() });
          }
        }
      })
      // A new or rebuilt day (from Sync) shows up without a manual refresh.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'days', filter: `user_id=eq.${userId}` }, () => fns.current.syncNow())
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [userId, stopThinking]);

  const online = !!status && now - new Date(status.last_seen).getTime() < ONLINE_WITHIN_MS;

  const requestSync = useCallback(
    async (day?: string) => {
      if (!supabase || !userId) return;
      const { data, error } = await supabase
        .from('jobs')
        .insert({ type: 'sync', payload: day ? { day } : {}, user_id: userId })
        .select('id')
        .single();
      setJob(error ? { id: '', status: 'failed', error: error.message } : { id: data.id, status: 'queued', day });
    },
    [userId],
  );

  const ask = useCallback(
    async (cardId: string, text: string) => {
      const msg: ChatMessage = { id: randomUUID(), role: 'user', text, at: new Date().toISOString() };
      appendChat(cardId, msg);
      const today = todayRef.current;
      if (!supabase || !userId || !online || !today) {
        appendChat(cardId, {
          id: randomUUID(),
          role: 'system',
          text: 'Saved. The Mac is offline, so this gets answered next time it is on (or use Discuss in Claude).',
          at: new Date(Date.now() + 1).toISOString(),
        });
        return;
      }
      setThinking((s) => new Set(s).add(cardId));
      // Write the day, card and question straight away so the Mac can read them; the
      // background sync would get there too, but a second later.
      const withMsg = { ...today, cards: today.cards.map((c) => (c.id === cardId ? { ...c, chat: [...c.chat, msg] } : c)) };
      const rows = toRows({ [today.day]: withMsg }, userId);
      try {
        const d = await supabase.from('days').upsert(rows.days);
        if (d.error) throw d.error;
        const c = await supabase.from('cards').upsert(rows.cards.filter((r) => r.id === cardId));
        if (c.error) throw c.error;
        const m = await supabase.from('chat_messages').upsert(rows.chats.filter((r) => r.id === msg.id));
        if (m.error) throw m.error;
        const j = await supabase.from('jobs').insert({ type: 'chat', payload: { day: today.day, card_id: cardId }, user_id: userId }).select('id').single();
        if (j.error) throw j.error;
        chatJobs.current.set(j.data.id, cardId);
      } catch (e) {
        stopThinking(cardId);
        appendChat(cardId, { id: randomUUID(), role: 'system', text: `Couldn't reach the Mac: ${(e as Error).message}`, at: new Date().toISOString() });
      }
    },
    [userId, online, appendChat, stopThinking],
  );

  const value = useMemo<Helper>(
    () => ({ online, lastSeen: status?.last_seen ?? null, busy: online ? (status?.busy ?? null) : null, job, requestSync, ask, thinking }),
    [online, status, job, requestSync, ask, thinking],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHelper() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHelper must be used inside HelperProvider');
  return v;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { freshCards, seedYesterday, stripSamples } from '@shared/data/sample';
import * as F from '@shared/feed';
import * as S from '@shared/sync';
import type { Card, CardStatus, ChatMessage, DayFeed } from '@shared/types';
import { local, supabase, uuid as randomUUID } from '../lib';
import { useAuth } from './Auth';

// Local-first: the copy on this Mac is the source the UI reads and writes instantly.
// When signed in, changes are pushed to Supabase in the background and the
// server copy is merged in on launch and whenever the app comes back.
const KEY = 'endgame.feeds.v1';
const SNAP_KEY = 'endgame.sync.snapshot.v1';
const KEEP_DAYS = 60;
const PUSH_DELAY = 1500;

export type SyncState = { status: 'local' | 'syncing' | 'synced' | 'offline'; at?: string; error?: string };

type Store = {
  ready: boolean;
  today: DayFeed | null;
  feeds: Record<string, DayFeed>;
  sync: SyncState;
  mark: (id: string, status: Exclude<CardStatus, 'open'>) => void;
  undo: (id: string) => void;
  opened: (id: string) => void;
  patch: (id: string, patch: Partial<Card>) => void;
  addChat: (id: string, msg: Omit<ChatMessage, 'at' | 'id'>) => void;
  /** Adds a full message to every day that has this card; ignores ids already present. */
  appendChat: (cardId: string, msg: ChatMessage) => void;
  autoSkipBefore: (index: number) => void;
  clearNews: () => void;
  rebuild: () => void;
  resetAll: () => Promise<void>;
  syncNow: () => void;
  userId: string | null;
};

const Ctx = createContext<Store | null>(null);

function prune(feeds: Record<string, DayFeed>) {
  const keep = Object.keys(feeds).sort().slice(-KEEP_DAYS);
  return Object.fromEntries(keep.map((d) => [d, feeds[d]]));
}

/** Older builds stored chat without ids; give them one so they can sync. */
function withChatIds(feeds: Record<string, DayFeed>) {
  for (const f of Object.values(feeds)) for (const c of f.cards) for (const m of c.chat) if (!m.id) m.id = randomUUID();
  return feeds;
}

// Without Supabase the app is a demo and fills days with sample cards. Signed in, it never
// does: a day Sync hasn't built yet holds only real carry-overs until Sync replaces it.
const isDemo = () => !supabase;

/** Adds today (and, in the demo, a sample yesterday on a brand-new install) without touching existing days. */
function withToday(feeds: Record<string, DayFeed>, today: string) {
  const demo = isDemo();
  let next = feeds;
  if (demo && Object.keys(next).length === 0) {
    const y = F.prevDay(today);
    next = { [y]: seedYesterday(y) };
  }
  if (!next[today]) return { ...next, [today]: F.ensureDay(next, today, demo ? freshCards(today) : []) };
  const prev = Object.keys(next).filter((d) => d < today).sort().pop();
  const topped = F.addCarryOvers(next[today], prev ? next[prev] : null);
  return topped === next[today] ? next : { ...next, [today]: topped };
}

async function pull(cutoff: string): Promise<S.Rows> {
  const [days, cards, chats] = await Promise.all([
    supabase!.from('days').select('*').gte('day', cutoff),
    supabase!.from('cards').select('*').gte('day', cutoff),
    supabase!.from('chat_messages').select('*').gte('created_at', cutoff),
  ]);
  const err = days.error ?? cards.error ?? chats.error;
  if (err) throw err;
  return { days: days.data, cards: cards.data, chats: chats.data } as S.Rows;
}

async function push(rows: S.Rows) {
  // Days first: cards reference them.
  if (rows.days.length) {
    const { error } = await supabase!.from('days').upsert(rows.days);
    if (error) throw error;
  }
  const [cards, chats] = await Promise.all([
    rows.cards.length ? supabase!.from('cards').upsert(rows.cards) : null,
    rows.chats.length ? supabase!.from('chat_messages').upsert(rows.chats) : null,
  ]);
  const err = cards?.error ?? chats?.error;
  if (err) throw err;
}

export function FeedProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [feeds, setFeeds] = useState<Record<string, DayFeed>>({});
  const [day, setDay] = useState(() => F.dayKey(new Date()));
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>({ status: 'local' });
  const loaded = useRef(false);
  const feedsRef = useRef(feeds);
  const snap = useRef<Record<string, string>>({});
  const pushing = useRef(false);

  useEffect(() => {
    feedsRef.current = feeds;
  }, [feeds]);

  const pushNow = useCallback(async () => {
    if (!supabase || !userId || pushing.current || !loaded.current) return;
    const rows = S.toRows(prune(feedsRef.current), userId);
    const changed = S.changedRows(rows, snap.current);
    if (S.isEmpty(changed)) return;
    pushing.current = true;
    setSync((s) => ({ ...s, status: 'syncing' }));
    try {
      await push(changed);
      snap.current = { ...snap.current, ...S.snapshot(changed) };
      local.set(SNAP_KEY, snap.current);
      setSync({ status: 'synced', at: new Date().toISOString() });
    } catch (e) {
      // Nothing is lost: unsent rows stay different from the snapshot and go next time.
      setSync({ status: 'offline', error: (e as Error).message });
    } finally {
      pushing.current = false;
    }
  }, [userId]);

  const pullAndMerge = useCallback(async () => {
    if (!supabase || !userId) return;
    try {
      const rows = await pull(F.prevDayN(F.dayKey(new Date()), KEEP_DAYS));
      const remote = S.fromRows(rows);
      // What the server already has doesn't need sending again.
      snap.current = S.snapshot(S.toRows(remote, userId));
      setFeeds((mine) => withToday(isDemo() ? S.mergeFeeds(mine, remote) : stripSamples(S.mergeFeeds(mine, remote)), F.dayKey(new Date())));
      setSync({ status: 'synced', at: new Date().toISOString() });
    } catch (e) {
      setSync({ status: 'offline', error: (e as Error).message });
    }
  }, [userId]);

  // Load the device copy once and make sure today exists (never rebuilds an existing day).
  useEffect(() => {
    snap.current = local.get<Record<string, string>>(SNAP_KEY, {});
    const stored = local.get<Record<string, DayFeed>>(KEY, {});
    loaded.current = true;
    setFeeds(withToday(isDemo() ? withChatIds(stored) : stripSamples(withChatIds(stored)), F.dayKey(new Date())));
    setReady(true);
  }, []);

  // Signing in (or launching signed in) merges the server copy.
  useEffect(() => {
    // State only changes after the network call returns, so this is not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready && userId) pullAndMerge();
  }, [ready, userId, pullAndMerge]);

  // Save locally on every change; push to the server shortly after.
  useEffect(() => {
    if (!loaded.current) return;
    local.set(KEY, prune(feeds));
    if (!userId) return;
    const id = setTimeout(pushNow, PUSH_DELAY);
    return () => clearTimeout(id);
  }, [feeds, userId, pushNow]);

  // New day if the app stays open past midnight; re-sync when it comes back.
  useEffect(() => {
    const check = () => {
      const d = F.dayKey(new Date());
      setDay(d);
      setFeeds((f) => (!loaded.current || f[d] ? f : withToday(f, d)));
    };
    const id = setInterval(() => {
      check();
      pushNow();
    }, 60_000);
    // Coming back to the window (or waking the Mac) re-syncs.
    let last = 0;
    const back = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 30_000) return;
      last = Date.now();
      check();
      pullAndMerge().then(pushNow);
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [pushNow, pullAndMerge]);

  const edit = useCallback((fn: (feed: DayFeed) => DayFeed) => setFeeds((f) => (f[day] ? { ...f, [day]: fn(f[day]) } : f)), [day]);

  const store = useMemo<Store>(
    () => ({
      ready,
      today: feeds[day] ?? null,
      feeds,
      sync: userId ? sync : { status: 'local' },
      mark: (id, s) => edit((f) => F.mark(f, id, s)),
      undo: (id) => edit((f) => F.undo(f, id)),
      opened: (id) => edit((f) => F.markOpened(f, id)),
      patch: (id, p) => edit((f) => F.patchCard(f, id, p)),
      addChat: (id, msg) =>
        edit((f) => {
          const c = f.cards.find((x) => x.id === id);
          return c ? F.patchCard(f, id, { chat: [...c.chat, { ...msg, id: randomUUID(), at: new Date().toISOString() }] }) : f;
        }),
      appendChat: (cardId, msg) =>
        setFeeds((all) => {
          let changed = false;
          const next: Record<string, DayFeed> = {};
          for (const [d, f] of Object.entries(all)) {
            const c = f.cards.find((x) => x.id === cardId);
            if (!c || c.chat.some((m) => m.id === msg.id)) {
              next[d] = f;
              continue;
            }
            changed = true;
            const chat = [...c.chat, msg].sort((a, b) => a.at.localeCompare(b.at));
            next[d] = { ...f, cards: f.cards.map((x) => (x.id === cardId ? { ...x, chat } : x)) };
          }
          return changed ? next : all;
        }),
      autoSkipBefore: (i) => edit((f) => F.autoSkipNewsBefore(f, i)),
      clearNews: () => edit(F.clearAllNews),
      // Signed in, today's cards come from Sync; rebuilding just re-reads the server copy.
      rebuild: () => (isDemo() ? setFeeds((f) => ({ ...f, [day]: F.ensureDay(f, day, freshCards(day), { force: true }) })) : pullAndMerge().then(pushNow)),
      resetAll: async () => {
        // Clear the server copy too, or the next merge would bring it all back.
        if (supabase && userId) {
          await supabase.from('days').delete().eq('user_id', userId);
          await supabase.from('chat_messages').delete().eq('user_id', userId);
        }
        snap.current = {};
        local.remove(SNAP_KEY);
        setFeeds(withToday({}, day));
      },
      syncNow: () => {
        pullAndMerge().then(pushNow);
      },
      userId,
    }),
    [ready, feeds, day, sync, edit, userId, pullAndMerge, pushNow],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useFeed() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFeed must be used inside FeedProvider');
  return v;
}

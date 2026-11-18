import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { progress } from '@shared/feed';
import { buildPaper, pageOf, readingOrder } from '@shared/paper';
import { Done } from './components/Done';
import { Newspaper } from './components/Newspaper';
import { Paper } from './components/Paper';
import { Progress } from './components/Progress';
import { Reader } from './components/Reader';
import { Settings } from './components/Settings';
import { Setup } from './components/Setup';
import { config, supabase, typing } from './lib';
import { AuthProvider, useAuth } from './store/Auth';
import { FeedProvider, useFeed } from './store/Feed';
import { HelperProvider, useHelper } from './store/Helper';
import { ThemeProvider } from './theme';

type View = 'front' | 'progress' | 'settings' | 'setup';

function Shell() {
  const { today, ready } = useFeed();
  const { requestSync } = useHelper();
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<View>('front');
  const [lookBack, setLookBack] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [page, setPage] = useState(0);
  const pages = useMemo(() => buildPaper(today?.cards ?? []), [today?.cards]);
  const order = useMemo(() => readingOrder(pages), [pages]);
  const lastOpen = useRef<string | null>(null);
  if (openId) lastOpen.current = openId;

  const stats = today ? progress(today) : null;
  // Signed in, a day Sync hasn't built yet only has carry-overs; it isn't "done".
  const finished = !!stats?.finished && !(supabase && today?.source !== 'sync');

  // The end screen arrives a beat after the last card is cleared and the paper is put away.
  useEffect(() => {
    if (!finished || openId) return setShowDone(false);
    const id = setTimeout(() => setShowDone(true), 600);
    return () => clearTimeout(id);
  }, [finished, openId]);

  // The menu bar shows how many cards are left.
  useEffect(() => {
    if (stats) window.endgame.setProgress({ left: stats.total - stats.cleared, total: stats.total, finished });
  }, [stats?.total, stats?.cleared, finished]);

  // Commands from the app menu and the menu bar item.
  useEffect(
    () =>
      window.endgame.onCommand((cmd) => {
        if (cmd === 'sync') requestSync();
        else if (cmd === 'progress' || cmd === 'settings') {
          setOpenId(null);
          setView(cmd);
        } else {
          setOpenId(null);
          setView('front');
          setPage(0);
        }
      }),
    [requestSync],
  );

  // Return opens the first story still open on the page you're looking at.
  useEffect(() => {
    if (openId || view !== 'front' || !today) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey) return;
      if (e.key === 'Enter' && document.activeElement === document.body) {
        const here = order.filter((c) => pageOf(pages, c.id) === page);
        const first = here.find((c) => c.status === 'open') ?? here[0];
        if (first) setOpenId(first.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, view, today, order, pages, page]);

  // Putting the paper away returns you to the page of the last story you read.
  const close = useCallback(() => {
    setOpenId(null);
    (document.activeElement as HTMLElement | null)?.blur?.();
    const i = lastOpen.current ? pageOf(pages, lastOpen.current) : -1;
    if (i >= 0) setPage(i);
  }, [pages]);
  if (!ready || !today) return <div className="front" />;

  if (view === 'setup') return <Setup onCancel={() => setView('settings')} />;
  return (
    <>
      <Newspaper
        feed={today}
        pages={pages}
        at={page}
        onTurn={setPage}
        onOpen={(id) => {
          setLookBack(false);
          setOpenId(id);
        }}
        onNav={setView}
        active={!openId && view === 'front'}
      />
      <Reader cards={order} openId={openId} onOpen={setOpenId} onClose={close} />
      {view === 'progress' && (
        <Paper title="Progress" onClose={() => setView('front')}>
          <Progress />
        </Paper>
      )}
      {view === 'settings' && (
        <Paper title="Settings" onClose={() => setView('front')}>
          <Settings onEditSetup={() => setView('setup')} />
        </Paper>
      )}
      {finished && showDone && !lookBack && !openId && view === 'front' && <Done feed={today} onLookBack={() => setLookBack(true)} />}
    </>
  );
}

/** Signs in with the login saved in Setup, so there's no separate sign-in screen. */
function Gate() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const tried = useRef(false);
  useEffect(() => {
    if (!auth.ready || auth.session || !config || tried.current) return;
    tried.current = true;
    auth.signIn(config.email, config.password).then(setError);
  }, [auth]);

  if (!auth.ready) return <div className="front" />;
  if (supabase && !auth.session) {
    if (!error) return <div className="front" />;
    if (editing) return <Setup onCancel={() => setEditing(false)} />;
    return (
      <div className="setup">
        <div className="setup-inner">
          <h1 className="title">Endgame</h1>
          <p>Couldn&apos;t sign in: {error}</p>
          <div className="row gap-s">
            <button type="button" className="btn btn-done" onClick={() => auth.signIn(config!.email, config!.password).then(setError)}>
              Try again
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Change settings
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <FeedProvider>
      <HelperProvider>
        <Shell />
      </HelperProvider>
    </FeedProvider>
  );
}

export function App({ configured }: { configured: boolean }) {
  const [demo, setDemo] = useState(false);
  return (
    <ThemeProvider>
      {!configured && !demo ? (
        <Setup onDemo={() => setDemo(true)} />
      ) : (
        <AuthProvider>
          <Gate />
        </AuthProvider>
      )}
    </ThemeProvider>
  );
}

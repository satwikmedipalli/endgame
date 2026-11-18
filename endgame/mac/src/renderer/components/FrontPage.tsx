import { useMemo } from 'react';

import { progress } from '@shared/feed';
import type { Block, Card, DayFeed } from '@shared/types';
import { supabase } from '../lib';
import { useFeed } from '../store/Feed';
import { useHelper } from '../store/Helper';
import { KIND_LABEL, useTheme } from '../theme';
import { useUpdate } from './Settings';
import { SyncButton, useSyncLabel } from './Sync';

type Props = { feed: DayFeed; onOpen: (id: string) => void; onNav: (view: 'progress' | 'settings') => void };

const LESSONS = new Set(['code', 'stocks', 'chess', 'italian']);

function excerpt(c: Card): string {
  const t = c.blocks.find((b): b is Extract<Block, { type: 'text' }> => b.type === 'text');
  return t ? t.text : c.kind === 'news' ? '' : c.hook;
}

function Status({ c }: { c: Card }) {
  if (c.status === 'done') return <>Done</>;
  if (c.status === 'skip') return <>Skipped</>;
  if (c.continued) return <>Continued from yesterday</>;
  return <>{c.kind === 'news' ? c.hook : c.tag}</>;
}

/** A tiny picture of the puzzle on its tile. */
function PuzzleThumb({ c }: { c: Card }) {
  const b = c.blocks[0];
  if (b?.type === 'sudoku') {
    const mine = c.puzzle?.entries ?? '';
    return (
      <span className="thumb sudoku-thumb" aria-hidden>
        {[...b.givens].map((g, i) => (
          <span key={i} className={g !== '0' ? 'g' : /[1-9]/.test(mine[i] ?? '') ? 'm' : ''} />
        ))}
      </span>
    );
  }
  if (b?.type === 'crossword') {
    const mine = c.puzzle?.entries ?? '';
    return (
      <span className="thumb xw-thumb" aria-hidden style={{ gridTemplateColumns: `repeat(${b.size}, 1fr)` }}>
        {[...b.grid].map((ch, i) => (
          <span key={i} className={ch === '#' ? 'b' : /[A-Z]/.test(mine[i] ?? '') ? 'm' : ''} />
        ))}
      </span>
    );
  }
  return null;
}

function Tile({ c, onOpen, lead, compact }: { c: Card; onOpen: (id: string) => void; lead?: boolean; compact?: boolean }) {
  const cleared = c.status !== 'open';
  const text = excerpt(c);
  return (
    <button type="button" className={`tile${lead ? ' lead' : ''}${compact ? ' compact' : ''}${cleared ? ' cleared' : ''}`} onClick={() => onOpen(c.id)}>
      <span className={`kicker${lead ? ' hot' : ''}`}>
        {lead ? `${c.tag} · Lead` : c.kind === 'news' ? c.tag : KIND_LABEL[c.kind]}
      </span>
      <span className="tile-title">{c.title}</span>
      {!compact && text && <span className="tile-text">{text}</span>}
      <span className="grow" />
      {c.kind === 'puzzle' && <PuzzleThumb c={c} />}
      <span className="tile-meta">
        <Status c={c} />
      </span>
    </button>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="fp-section">
      <header className="fp-section-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function FrontPage({ feed, onOpen, onNav }: Props) {
  const { label } = useTheme();
  const { clearNews } = useFeed();
  const { online } = useHelper();
  const sync = useSyncLabel();
  const update = useUpdate();
  const p = progress(feed);
  const unbuilt = !!supabase && feed.source !== 'sync';

  const { lead, top, more, lessons, also, puzzles } = useMemo(() => {
    const news = feed.cards.filter((c) => c.kind === 'news');
    // The lead is the first story still open, so the top of the page is always something to read.
    const leadCard = news.find((c) => c.status === 'open') ?? news[0];
    const rest = news.filter((c) => c !== leadCard);
    return {
      lead: leadCard,
      top: rest.slice(0, 6),
      more: rest.slice(6),
      lessons: feed.cards.filter((c) => LESSONS.has(c.kind)),
      also: feed.cards.filter((c) => c.kind === 'history' || c.kind === 'watch'),
      puzzles: feed.cards.filter((c) => c.kind === 'puzzle'),
    };
  }, [feed.cards]);

  const newsOpen = feed.cards.filter((c) => c.kind === 'news' && c.status === 'open').length;
  let date = '';
  try {
    date = new Date(`${feed.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch {}

  return (
    <div className="front">
      <div className="dragbar" aria-hidden />
      <div className="masthead">
        <nav className="fp-nav">
          <span className={`dot${online ? ' on' : ''}`} title={online ? 'Helper running' : 'Helper offline'} />
          <span className="faint small">{sync.running ? sync.text : online ? 'Helper ready' : 'Helper offline'}</span>
          {update?.status === 'ready' && (
            <button type="button" className="link hot" onClick={() => window.endgame.restartToUpdate()}>
              Update ready · Restart
            </button>
          )}
          <button type="button" className="link" onClick={() => onNav('progress')}>
            Progress
          </button>
          <button type="button" className="link" onClick={() => onNav('settings')}>
            Settings
          </button>
        </nav>
        <h1 className="title">Endgame</h1>
        <div className="strip">
          <span>{date}</span>
          <span className="strong">
            {p.cleared} of {p.total} cleared · {p.total - p.cleared} left
          </span>
          <span>{label}</span>
        </div>
        <div className="ticks" aria-hidden>
          {feed.cards.map((c) => (
            <span key={c.id} className={c.status === 'done' ? 'done' : c.status === 'skip' ? 'skip' : ''} />
          ))}
        </div>
      </div>

      {unbuilt && (
        <div className="notice">
          <div>
            <h2>Today isn&apos;t built yet.</h2>
            <p className="muted">
              Sync writes today&apos;s news and lessons in about two minutes.
              {feed.cards.length ? ' Below is what carried over from yesterday.' : ''}
            </p>
          </div>
          <SyncButton label="Build today" />
        </div>
      )}

      {lead && (
        <div className="fp-top">
          <Tile c={lead} onOpen={onOpen} lead />
          {top.map((c) => (
            <Tile key={c.id} c={c} onOpen={onOpen} />
          ))}
        </div>
      )}

      {more.length > 0 && (
        <Section
          title="More news"
          aside={
            newsOpen > 1 && (
              <button type="button" className="link" onClick={clearNews}>
                Clear all {newsOpen} news
              </button>
            )
          }
        >
          <div className="fp-list">
            {more.map((c) => (
              <Tile key={c.id} c={c} onOpen={onOpen} compact />
            ))}
          </div>
        </Section>
      )}

      {lessons.length > 0 && (
        <Section title="Lessons">
          <div className="fp-grid">
            {lessons.map((c) => (
              <Tile key={c.id} c={c} onOpen={onOpen} />
            ))}
          </div>
        </Section>
      )}

      {(also.length > 0 || puzzles.length > 0) && (
        <div className="fp-split">
          {also.length > 0 && (
            <Section title="Also today">
              <div className="fp-grid two">
                {also.map((c) => (
                  <Tile key={c.id} c={c} onOpen={onOpen} />
                ))}
              </div>
            </Section>
          )}
          {puzzles.length > 0 && (
            <Section title="Puzzles">
              <div className="fp-grid two">
                {puzzles.map((c) => (
                  <Tile key={c.id} c={c} onOpen={onOpen} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      <footer className="fp-foot">
        <span>Click a story to read it · ← → turn pages · D done · S skip · Esc back to the front page</span>
        <span>That&apos;s the whole paper. There is no more below.</span>
      </footer>
    </div>
  );
}

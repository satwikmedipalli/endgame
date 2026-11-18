import { useEffect, useRef, useState } from 'react';

import { progress } from '@shared/feed';
import type { PaperPage } from '@shared/paper';
import type { Block, Card, DayFeed } from '@shared/types';
import { supabase, typing } from '../lib';
import { useFeed } from '../store/Feed';
import { useHelper } from '../store/Helper';
import { KIND_LABEL, useTheme } from '../theme';
import { ChessBoard } from './ChessBoard';
import { useUpdate } from './Settings';
import { SyncButton, useSyncLabel } from './Sync';

type Props = {
  feed: DayFeed;
  pages: PaperPage[];
  /** Page to show; the parent keeps it so closing a story returns to its page. */
  at: number;
  onTurn: (page: number) => void;
  onOpen: (id: string) => void;
  onNav: (view: 'progress' | 'settings') => void;
  /** False while a story or panel is open on top (the keys belong to it then). */
  active: boolean;
};

const textOf = (c: Card) => c.blocks.find((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')?.text ?? '';
const cardsOf = (p: PaperPage) => (p.kind === 'front' ? ([p.lead, ...p.top].filter(Boolean) as Card[]) : p.cards);

function Meta({ c }: { c: Card }) {
  if (c.status === 'done') return <>Done</>;
  if (c.status === 'skip') return <>Skipped</>;
  if (c.continued) return <>Continued from yesterday</>;
  return <>{c.kind === 'news' ? c.hook : c.tag}</>;
}

/** A news story at one of three sizes. */
function Story({ c, size, onOpen, hot }: { c: Card; size: 'lead' | 'md' | 'sm'; onOpen: (id: string) => void; hot?: boolean }) {
  const text = size === 'sm' ? '' : textOf(c);
  return (
    <button type="button" className={`story ${size}${c.status !== 'open' ? ' cleared' : ''}`} onClick={() => onOpen(c.id)}>
      <span className={`kicker${hot ? ' hot' : ''}`}>{c.tag}</span>
      <span className="story-title">{c.title}</span>
      {text && <span className="story-text">{text}</span>}
      <span className="story-meta">
        <Meta c={c} />
      </span>
    </button>
  );
}

/** A small picture of what's inside a lesson, puzzle or story card. */
function Preview({ c }: { c: Card }) {
  const b = c.blocks[0];
  if (b?.type === 'sudoku') {
    const mine = c.puzzle?.entries ?? '';
    return (
      <span className="mini-sudoku" aria-hidden>
        {[...b.givens].map((g, i) => (
          <span key={i} className={`${i % 9 === 2 || i % 9 === 5 ? 'br ' : ''}${Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5 ? 'bb' : ''}`}>
            {g !== '0' ? g : /[1-9]/.test(mine[i] ?? '') ? <em>{mine[i]}</em> : ''}
          </span>
        ))}
      </span>
    );
  }
  if (b?.type === 'crossword') {
    const mine = c.puzzle?.entries ?? '';
    const starts = new Map(b.clues.map((k) => [k.row * b.size + k.col, k.n]));
    return (
      <span className="mini-xw" aria-hidden style={{ gridTemplateColumns: `repeat(${b.size}, 1fr)` }}>
        {[...b.grid].map((ch, i) => (
          <span key={i} className={ch === '#' ? 'b' : ''}>
            {starts.get(i) && <small>{starts.get(i)}</small>}
            {/[A-Z]/.test(mine[i] ?? '') ? mine[i] : ''}
          </span>
        ))}
      </span>
    );
  }
  if (c.preview?.fen) return <ChessBoard fen={c.preview.fen} size={176} />;
  if (c.preview?.phrase)
    return (
      <span className="mini-phrase">
        <span>{c.preview.phrase.it}</span>
        <small>{c.preview.phrase.en}</small>
      </span>
    );
  const code = c.blocks.find((x): x is Extract<Block, { type: 'code' }> => x.type === 'code');
  if (code) return <pre className="mini-code">{code.code.split('\n').slice(0, 5).join('\n')}</pre>;
  return null;
}

/** A lesson, puzzle, history story or watch pick on a break page. */
function Feature({ c, onOpen }: { c: Card; onOpen: (id: string) => void }) {
  return (
    <button type="button" className={`feature${c.status !== 'open' ? ' cleared' : ''}`} onClick={() => onOpen(c.id)}>
      <span className="kicker">
        {KIND_LABEL[c.kind]} · {c.tag}
      </span>
      <span className="feature-title">{c.title}</span>
      {c.kind !== 'puzzle' && <span className="story-text">{c.hook}</span>}
      <Preview c={c} />
      <span className="story-meta">{c.status === 'open' ? `${c.cta} →` : <Meta c={c} />}</span>
    </button>
  );
}

function RunningHead({ page, n, total }: { page: PaperPage; n: number; total: number }) {
  const shown = page.kind === 'section' ? page.cards.length : cardsOf(page).length;
  const sub =
    page.kind === 'section'
      ? `${shown} ${shown === 1 ? 'story' : 'stories'}`
      : page.kind === 'break'
        ? 'Lessons, puzzles and stories, between the news'
        : 'The rest of today';
  return (
    <header className="running">
      <div className="running-top">
        <span className="running-name">Endgame</span>
        <span>
          Page {n + 1} of {total}
        </span>
      </div>
      <div className="running-title">
        <h1 className={page.kind === 'section' ? '' : 'italic'}>{page.title}</h1>
        <span className="muted small">{sub}</span>
      </div>
    </header>
  );
}

function Front({ page, pages, feed, onOpen, onTurn, onNav }: { page: Extract<PaperPage, { kind: 'front' }>; pages: PaperPage[]; feed: DayFeed; onOpen: (id: string) => void; onTurn: (i: number) => void; onNav: Props['onNav'] }) {
  const { label } = useTheme();
  const { online } = useHelper();
  const sync = useSyncLabel();
  const update = useUpdate();
  const p = progress(feed);
  const unbuilt = !!supabase && feed.source !== 'sync';
  let date = '';
  try {
    date = new Date(`${feed.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch {}
  return (
    <>
      <header className="masthead">
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
      </header>

      {unbuilt && (
        <div className="notice">
          <div>
            <h2>Today isn&apos;t printed yet.</h2>
            <p className="muted">Sync writes today&apos;s news, lessons and puzzles in about two minutes.</p>
          </div>
          <SyncButton label="Print today" />
        </div>
      )}

      <div className="front-grid">
        <div className="front-lead">
          {page.lead && <Story c={page.lead} size="lead" onOpen={onOpen} hot />}
          {page.top[2] && <Story c={page.top[2]} size="sm" onOpen={onOpen} />}
        </div>
        <div className="front-mid">
          {page.top.slice(0, 2).map((c) => (
            <Story key={c.id} c={c} size="md" onOpen={onOpen} />
          ))}
        </div>
        <aside className="inside">
          <h2>Inside today</h2>
          {pages.slice(1).map((pg, k) => {
            const left = cardsOf(pg).filter((c) => c.status === 'open').length;
            const label = pg.kind === 'break' || pg.kind === 'back' ? cardsOf(pg).map((c) => c.title).join(', ') : pg.title;
            return (
              <button key={pg.id} type="button" className={`inside-row${pg.kind === 'break' || pg.kind === 'back' ? ' extra' : ''}${left ? '' : ' cleared'}`} onClick={() => onTurn(k + 1)}>
                <span className="inside-name">
                  {pg.kind === 'break' ? <em>A break: </em> : pg.kind === 'back' ? <em>Back page: </em> : null}
                  {label}
                </span>
                <span className="inside-n">{k + 2}</span>
              </button>
            );
          })}
        </aside>
      </div>
    </>
  );
}

/**
 * The day as a newspaper. Turn the page with → / ←, a two-finger swipe, the arrows at the
 * edges, or the section names along the bottom. Clicking a story opens it as a sheet of paper.
 */
export function Newspaper({ feed, pages, at, onTurn, onOpen, onNav, active }: Props) {
  const { clearNews } = useFeed();
  const page = Math.max(0, Math.min(at, pages.length - 1));
  const go = (i: number) => i >= 0 && i < pages.length && onTurn(i);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ']') go(page + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === '[') go(page - 1);
      else if (e.key === 'Home') go(0);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Two-finger swipe left or right on the trackpad.
  const swipe = useRef({ x: 0, until: 0 });
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const s = swipe.current;
    if (Date.now() < s.until) return;
    s.x += e.deltaX;
    if (Math.abs(s.x) > 120) {
      go(page + (s.x > 0 ? 1 : -1));
      s.x = 0;
      s.until = Date.now() + 700;
    }
  };

  const newsOpen = feed.cards.filter((c) => c.kind === 'news' && c.status === 'open').length;
  const prev = pages[page - 1];
  const next = pages[page + 1];
  // Tabs: one per section (continued pages and breaks share their neighbour's tab).
  // A continued section or back page shares the tab of its first page.
  const continued = (p: PaperPage) => (p.kind === 'section' && p.part > 1) || (p.kind === 'back' && p.title !== 'Back page');
  const tabs = pages.map((p, i) => ({ i, label: continued(p) ? null : p.short })).filter((t) => t.label);
  const tabOf = (i: number) => {
    let k = i;
    while (k > 0 && pages[k] && continued(pages[k])) k--;
    return k;
  };

  return (
    <div className="paper" onWheel={onWheel}>
      <div className="track" style={{ transform: `translateX(${-page * 100}%)` }}>
        {pages.map((p, i) => (
          <section key={p.id} className={`page page-${p.kind}`} aria-label={p.title} inert={i !== page}>
            {p.kind === 'front' ? (
              <Front page={p} pages={pages} feed={feed} onOpen={onOpen} onTurn={go} onNav={onNav} />
            ) : (
              <>
                <RunningHead page={p} n={i} total={pages.length} />
                {p.kind === 'section' ? (
                  <div className="section-grid">
                    <div className="section-lead">{p.cards[0] && <Story c={p.cards[0]} size="lead" onOpen={onOpen} />}</div>
                    <div className="section-more">
                      {p.cards.slice(1).map((c) => (
                        <Story key={c.id} c={c} size="sm" onOpen={onOpen} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={`break-grid n${p.cards.length}`}>
                    {p.cards.map((c) => (
                      <Feature key={c.id} c={c} onOpen={onOpen} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        ))}
      </div>

      {prev && (
        <button type="button" className="edge left" aria-label={`Previous page: ${prev.title}`} onClick={() => go(page - 1)}>
          <span>‹</span>
          <small>{prev.short}</small>
        </button>
      )}
      {next && (
        <button type="button" className="edge right" aria-label={`Next page: ${next.title}`} onClick={() => go(page + 1)}>
          <span>›</span>
          <small>{next.short}</small>
        </button>
      )}

      <nav className="tabs" aria-label="Sections">
        {tabs.map((t) => (
          <button key={t.i} type="button" className={`tab${tabOf(page) === t.i ? ' on' : ''}`} onClick={() => go(t.i)}>
            {t.label}
          </button>
        ))}
        <span className="grow" />
        {newsOpen > 1 && (
          <button type="button" className="link small" onClick={clearNews}>
            Clear all {newsOpen} news
          </button>
        )}
      </nav>
    </div>
  );
}

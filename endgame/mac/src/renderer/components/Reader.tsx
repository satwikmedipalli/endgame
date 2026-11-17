import { useCallback, useEffect, useRef, useState } from 'react';

import { nextOpenIndex } from '@shared/feed';
import type { Card, DayFeed } from '@shared/types';
import { typing } from '../lib';
import { useFeed } from '../store/Feed';
import { KIND_LABEL } from '../theme';
import { CardBody } from './CardBody';
import { Icon } from './Icon';

type Props = { feed: DayFeed; openId: string | null; onOpen: (id: string) => void; onClose: () => void };

/** The keyboard belongs to a puzzle grid while it has focus. */
const puzzleHasKeys = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('[data-keys]');

/**
 * A card opens as a sheet of paper over the front page. Pages turn sideways (arrow keys,
 * a two-finger swipe, or Previous / Next), the next pages wait stacked underneath, and
 * closing drops the paper away.
 */
export function Reader({ feed, openId, onOpen, onClose }: Props) {
  const { mark, undo, opened } = useFeed();
  const cards = feed.cards;
  const page = openId ? cards.findIndex((c) => c.id === openId) : -1;
  const isOpen = page >= 0;
  // While closing, keep drawing the last page so it can slide away.
  const [lastPage, setLastPage] = useState(page);
  const shown = isOpen ? page : lastPage;
  useEffect(() => {
    if (isOpen) setLastPage(page);
  }, [isOpen, page]);

  useEffect(() => {
    const c = cards[page];
    if (c && !c.openedAt) opened(c.id);
  }, [page, cards, opened]);

  const go = useCallback((i: number) => i >= 0 && i < cards.length && onOpen(cards[i].id), [cards, onOpen]);

  const finish = useCallback(
    (c: Card, status: 'done' | 'skip') => {
      mark(c.id, status);
      // Next open card after this one; none left means the day is over and the paper goes.
      const after = { ...feed, cards: cards.map((x) => (x.id === c.id ? { ...x, status } : x)) };
      const nxt = nextOpenIndex(after, cards.indexOf(c));
      setTimeout(() => (nxt >= 0 ? go(nxt) : onClose()), 160);
    },
    [mark, feed, cards, go, onClose],
  );

  // Keyboard: ← → turn, D done, S skip, U undo, Esc closes.
  useEffect(() => {
    if (!isOpen) return;
    const c = cards[page];
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || puzzleHasKeys(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === ']') go(page + 1);
      else if (k === 'ArrowLeft' || k === '[') go(page - 1);
      else if (k === 'Escape') onClose();
      else if ((k === 'd' || k === 'D') && c.status === 'open') finish(c, 'done');
      else if ((k === 's' || k === 'S') && c.status === 'open') finish(c, 'skip');
      else if ((k === 'u' || k === 'U') && c.status !== 'open') undo(c.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, page, cards, go, onClose, finish, undo]);

  // Two-finger horizontal swipe on the trackpad turns the page.
  const swipe = useRef({ x: 0, until: 0 });
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const s = swipe.current;
    if (Date.now() < s.until) return;
    s.x += e.deltaX;
    if (Math.abs(s.x) > 140) {
      go(page + (s.x > 0 ? 1 : -1));
      s.x = 0;
      s.until = Date.now() + 650;
    }
  };

  if (shown < 0) return null;
  const from = Math.max(0, shown - 1);
  const to = Math.min(cards.length - 1, shown + 2);
  return (
    <div className={`reader${isOpen ? ' open' : ''}`} aria-hidden={!isOpen}>
      <div className="scrim" onClick={onClose} />
      {cards.slice(from, to + 1).map((c, k) => {
        const i = from + k;
        const d = i - shown;
        const pos = !isOpen ? 'away' : d < 0 ? 'turned' : d === 0 ? 'current' : d === 1 ? 'under1' : 'under2';
        return (
          <article key={c.id} className={`sheet ${pos}`} aria-label={c.title} onWheel={d === 0 ? onWheel : undefined} inert={d !== 0 || !isOpen}>
            <header className="sheet-head">
              <span className={`kicker${i === 0 && c.kind === 'news' ? ' hot' : ''}`}>
                {KIND_LABEL[c.kind]} · {c.tag}
              </span>
              {c.continued && <span className="pill">Continued from yesterday</span>}
              <span className="grow" />
              <span className="faint small">Esc to close</span>
              <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
                <Icon name="close" size={16} />
              </button>
            </header>
            <div className="sheet-scroll">
              <h1 className="sheet-title">{c.title}</h1>
              {c.kind === 'news' && <p className="byline">{c.hook}</p>}
              <CardBody card={c} active={d === 0 && isOpen} />
            </div>
            <footer className="sheet-foot">
              <button type="button" className="btn" disabled={i === 0} onClick={() => go(i - 1)}>
                ← Previous
              </button>
              <span className="muted small tabular">
                {i + 1} of {cards.length}
              </span>
              <button type="button" className="btn" disabled={i === cards.length - 1} onClick={() => go(i + 1)}>
                Next →
              </button>
              <span className="grow" />
              {c.status === 'open' ? (
                <>
                  <button type="button" className="btn wide" onClick={() => finish(c, 'skip')}>
                    Skip <kbd>S</kbd>
                  </button>
                  <button type="button" className="btn btn-done wide" onClick={() => finish(c, 'done')}>
                    DONE <kbd>D</kbd>
                  </button>
                </>
              ) : (
                <>
                  <span className="muted small">
                    <Icon name="check" size={14} /> {c.status === 'done' ? 'Done' : 'Skipped'}
                  </span>
                  <button type="button" className="btn" onClick={() => undo(c.id)}>
                    Undo <kbd>U</kbd>
                  </button>
                </>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

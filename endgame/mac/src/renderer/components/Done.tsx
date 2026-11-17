import { useEffect, useState } from 'react';

import { dayKey, progress } from '@shared/feed';
import type { DayFeed } from '@shared/types';
import { supabase } from '../lib';
import { KIND_LABEL } from '../theme';
import { SyncButton } from './Sync';

function tomorrow() {
  const [y, m, d] = dayKey(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The end of the paper. Every card is done or skipped: close the laptop. */
export function Done({ feed, onLookBack }: { feed: DayFeed; onLookBack: () => void }) {
  const { done, skipped } = progress(feed);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className={`done${shown ? ' in' : ''}`} role="dialog" aria-label="Done for today">
      <div className="done-inner">
        <div className="ticks big" aria-hidden>
          {feed.cards.map((c) => (
            <span key={c.id} className={c.status === 'done' ? 'done' : 'skip'} />
          ))}
        </div>
        <p className="muted">
          {done} done · {skipped} skipped
        </p>
        <h1 className="done-title">That&apos;s the day.</h1>
        <p className="done-sub">Close the laptop.</p>
        <div className="row gap center-row">
          <button type="button" className="btn btn-done wide" onClick={() => window.endgame.quit()}>
            Quit Endgame <kbd>⌘Q</kbd>
          </button>
          <button type="button" className="btn wide" onClick={onLookBack}>
            Look back
          </button>
        </div>
        <ul className="done-list">
          {feed.cards
            .filter((c) => c.status === 'done')
            .slice(0, 8)
            .map((c) => (
              <li key={c.id}>
                <span className="kicker">{KIND_LABEL[c.kind]}</span> {c.title}
              </li>
            ))}
        </ul>
        {supabase && (
          <div className="done-tomorrow">
            <p className="faint small">Tomorrow&apos;s paper is printed at the next Sync. Quitting stops the helper too; it starts again when you open Endgame.</p>
            <SyncButton day={tomorrow()} label="Prepare tomorrow" />
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, type ReactNode } from 'react';

import { typing } from '../lib';
import { Icon } from './Icon';

/** A single sheet over the front page, for Progress and Settings. */
export function Paper({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !typing(e)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="reader open">
      <div className="scrim" onClick={onClose} />
      <article className="sheet current" aria-label={title}>
        <header className="sheet-head">
          <span className="kicker">{title}</span>
          <span className="grow" />
          <span className="faint small">Esc to close</span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="sheet-scroll">{children}</div>
      </article>
    </div>
  );
}

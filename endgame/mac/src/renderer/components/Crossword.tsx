import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { Block, CrosswordClue } from '@shared/types';
import { useFeed } from '../store/Feed';

type B = Extract<Block, { type: 'crossword' }>;
type Dir = 'across' | 'down';

/** Type straight into the grid. Space or a second click switches across/down; Tab jumps to the next clue. */
export function Crossword({ b, cardId }: { b: B; cardId?: string }) {
  const { today, patch } = useFeed();
  const card = today?.cards.find((c) => c.id === cardId);
  const n = b.size;
  const blank = useMemo(() => [...b.grid].map((ch) => (ch === '#' ? '#' : '.')).join(''), [b.grid]);
  const entries = card?.puzzle?.entries?.length === n * n ? card.puzzle.entries : blank;
  const checked = !!card?.puzzle?.checked;
  const [sel, setSel] = useState(() => b.grid.search(/[A-Z]/));
  const [dir, setDir] = useState<Dir>('across');
  const gridRef = useRef<HTMLDivElement>(null);

  const open = (i: number) => i >= 0 && i < n * n && b.grid[i] !== '#';
  const clueAt = (i: number, d: Dir): CrosswordClue | undefined =>
    b.clues.find((c) => c.dir === d && cellsOf(c).includes(i));
  const cellsOf = (c: CrosswordClue) => Array.from({ length: c.answer.length }, (_, k) => (c.dir === 'across' ? c.row * n + c.col + k : (c.row + k) * n + c.col));

  const active = clueAt(sel, dir) ?? clueAt(sel, dir === 'across' ? 'down' : 'across');
  const activeDir = active?.dir ?? dir;
  const activeCells = active ? cellsOf(active) : [];
  const numbers = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of b.clues) m.set(c.row * n + c.col, c.n);
    return m;
  }, [b.clues, n]);
  const solved = [...entries].every((ch, i) => ch === b.grid[i]);
  const filled = [...entries].filter((ch) => /[A-Z]/.test(ch)).length;
  const total = [...b.grid].filter((ch) => ch !== '#').length;

  // Fast typing can deliver the next key before React re-renders, so keys read and write
  // the latest letters and square through this ref rather than the last render's values.
  const live = useRef({ entries, sel });
  live.current.entries = entries;
  live.current.sel = sel;
  const save = (next: string, check = false) => {
    live.current.entries = next;
    if (cardId) patch(cardId, { puzzle: { entries: next, checked: check } });
  };
  const setAt = (i: number, v: string) => {
    const cur = live.current.entries;
    save(cur.slice(0, i) + v + cur.slice(i + 1));
  };
  const goTo = (i: number) => {
    live.current.sel = i;
    setSel(i);
  };

  const step = (from: number, d: Dir, by: number) => {
    let i = from;
    for (let k = 0; k < n * n; k++) {
      const r = Math.floor(i / n) + (d === 'down' ? by : 0);
      const c = (i % n) + (d === 'across' ? by : 0);
      if (r < 0 || c < 0 || r >= n || c >= n) return from;
      i = r * n + c;
      if (open(i)) return i;
    }
    return from;
  };
  const nextClue = (back = false) => {
    const order = [...b.clues];
    const at = active ? order.indexOf(active) : -1;
    const next = order[(at + (back ? -1 : 1) + order.length) % order.length];
    setDir(next.dir);
    goTo(next.row * n + next.col);
  };
  const pick = (i: number) => {
    if (!open(i)) return;
    if (i === sel) setDir((d) => (d === 'across' ? 'down' : 'across'));
    goTo(i);
    gridRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    const at = live.current.sel;
    const word = (clueAt(at, activeDir) ?? active) ? cellsOf((clueAt(at, activeDir) ?? active)!) : [];
    if (/^[a-zA-Z]$/.test(k) && !e.metaKey && !e.ctrlKey) {
      setAt(at, k.toUpperCase());
      const nxt = word[word.indexOf(at) + 1];
      if (nxt !== undefined) goTo(nxt);
    } else if (k === 'Backspace' || k === 'Delete') {
      if (/[A-Z]/.test(live.current.entries[at])) setAt(at, '.');
      else {
        const prev = word[word.indexOf(at) - 1];
        if (prev !== undefined) {
          setAt(prev, '.');
          goTo(prev);
        }
      }
    } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
      if (activeDir !== 'across' && clueAt(at, 'across')) setDir('across');
      else goTo(step(at, 'across', k === 'ArrowRight' ? 1 : -1));
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      if (activeDir !== 'down' && clueAt(at, 'down')) setDir('down');
      else goTo(step(at, 'down', k === 'ArrowDown' ? 1 : -1));
    } else if (k === ' ') setDir((d) => (d === 'across' ? 'down' : 'across'));
    else if (k === 'Tab') nextClue(e.shiftKey);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const list = (d: Dir) => (
    <div className="clues">
      <h4>{d === 'across' ? 'Across' : 'Down'}</h4>
      {b.clues
        .filter((c) => c.dir === d)
        .map((c) => (
          <button
            key={`${d}${c.n}`}
            type="button"
            className={`clue${active === c ? ' on' : ''}`}
            onClick={() => {
              setDir(c.dir);
              goTo(c.row * n + c.col);
              gridRef.current?.focus();
            }}
          >
            <b>{c.n}</b>
            <span>{c.clue}</span>
          </button>
        ))}
    </div>
  );

  return (
    <div className="puzzle">
      <div>
        <div className="clue-bar">{active ? `${active.n} ${active.dir === 'across' ? 'Across' : 'Down'} · ${active.clue}` : ''}</div>
        <div
          ref={gridRef}
          className="xw"
          role="grid"
          aria-label="Mini crossword"
          tabIndex={0}
          data-keys
          onKeyDown={onKey}
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, width: n * 84 }}
        >
          {[...b.grid].map((ch, i) =>
            ch === '#' ? (
              <span key={i} className="xw-cell black" />
            ) : (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                className={`xw-cell${i === sel ? ' sel' : activeCells.includes(i) ? ' word' : ''}${checked && /[A-Z]/.test(entries[i]) && entries[i] !== ch ? ' wrong' : ''}`}
                aria-label={`${numbers.get(i) ? `${numbers.get(i)}, ` : ''}${/[A-Z]/.test(entries[i]) ? entries[i] : 'empty'}`}
                onClick={() => pick(i)}
              >
                {numbers.get(i) && <small>{numbers.get(i)}</small>}
                {/[A-Z]/.test(entries[i]) ? entries[i] : ''}
              </button>
            ),
          )}
        </div>
        <div className="row gap-s xw-actions">
          <button type="button" className="btn" onClick={() => save(entries, true)}>
            Check
          </button>
          <button type="button" className="btn" onClick={() => save(blank)}>
            Clear
          </button>
          <span className="puzzle-status">{solved ? <b>Solved. Press DONE.</b> : `${filled} of ${total} letters`}</span>
        </div>
      </div>
      <div className="clue-lists">
        {list('across')}
        {list('down')}
      </div>
    </div>
  );
}

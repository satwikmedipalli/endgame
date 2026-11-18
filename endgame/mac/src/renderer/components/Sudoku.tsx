import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { conflicts } from '@shared/sudoku';
import type { Block } from '@shared/types';
import { useFeed } from '../store/Feed';

type B = Extract<Block, { type: 'sudoku' }>;

/** Click a square (or move with the arrow keys), then type 1–9. Delete clears it. */
export function Sudoku({ b, cardId }: { b: B; cardId?: string }) {
  const { today, patch } = useFeed();
  const card = today?.cards.find((c) => c.id === cardId);
  const entries = card?.puzzle?.entries ?? '.'.repeat(81);
  const checked = !!card?.puzzle?.checked;
  const [sel, setSel] = useState(() => b.givens.indexOf('0'));

  // What's on the board: givens plus your numbers.
  const cells = useMemo(() => [...b.givens].map((g, i) => (g !== '0' ? g : entries[i] !== '.' ? entries[i] : '0')).join(''), [b.givens, entries]);
  const bad = useMemo(() => conflicts(cells), [cells]);
  const left = [...cells].filter((c) => c === '0').length;
  const solved = cells === b.solution;

  // Keys read and write the latest values through this ref (fast typing outruns re-renders).
  const live = useRef({ entries, sel });
  live.current.entries = entries;
  live.current.sel = sel;
  const save = (next: string, check = false) => {
    live.current.entries = next;
    if (cardId) patch(cardId, { puzzle: { entries: next, checked: check } });
  };
  const put = (v: string) => {
    const { entries: cur, sel: at } = live.current;
    if (at < 0 || b.givens[at] !== '0') return;
    save(cur.slice(0, at) + v + cur.slice(at + 1));
  };
  const move = (dr: number, dc: number) => {
    const i = live.current.sel;
    const next = ((Math.floor(i / 9) + dr + 9) % 9) * 9 + ((i % 9) + dc + 9) % 9;
    live.current.sel = next;
    setSel(next);
  };

  const onKey = (e: KeyboardEvent) => {
    if (/^[1-9]$/.test(e.key)) put(e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') put('.');
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowLeft') move(0, -1);
    else if (e.key === 'ArrowRight') move(0, 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const sr = Math.floor(sel / 9);
  const sc = sel % 9;
  return (
    <div className="puzzle">
      <div className="sudoku" role="grid" aria-label="Sudoku" tabIndex={0} data-keys onKeyDown={onKey}>
        {[...cells].map((v, i) => {
          const r = Math.floor(i / 9);
          const c = i % 9;
          const given = b.givens[i] !== '0';
          const wrong = !given && v !== '0' && (bad.has(i) || (checked && v !== b.solution[i]));
          const peer = r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3));
          const same = v !== '0' && v === cells[sel];
          const cls = ['cell', given ? 'given' : 'mine', i === sel ? 'sel' : peer ? 'peer' : '', same && i !== sel ? 'same' : '', wrong ? 'wrong' : '', c % 3 === 2 && c < 8 ? 'box-r' : '', r % 3 === 2 && r < 8 ? 'box-b' : ''];
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              className={cls.filter(Boolean).join(' ')}
              aria-label={`Row ${r + 1}, column ${c + 1}: ${v === '0' ? 'empty' : v}${given ? ', given' : ''}`}
              onClick={() => {
                live.current.sel = i;
                setSel(i);
              }}
            >
              {v === '0' ? '' : v}
            </button>
          );
        })}
      </div>
      <div className="puzzle-side">
        <div className="numpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button key={n} type="button" className="btn num" onClick={() => put(n)}>
              {n}
            </button>
          ))}
        </div>
        <div className="row gap-s">
          <button type="button" className="btn grow" onClick={() => put('.')}>
            Erase
          </button>
          <button type="button" className="btn grow" onClick={() => save(entries, true)}>
            Check
          </button>
        </div>
        <p className="puzzle-status">
          {solved ? <b>Solved. Press DONE.</b> : `${left} ${left === 1 ? 'square' : 'squares'} left · ${b.level}`}
        </p>
        <p className="faint small">Arrow keys move, 1–9 fills, Delete clears. Numbers that clash turn red; Check marks any that are wrong.</p>
      </div>
    </div>
  );
}

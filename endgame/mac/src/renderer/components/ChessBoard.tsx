import { Chess } from 'chess.js';
import { useMemo } from 'react';

import { PIECES } from './pieces';

const FILES = 'abcdefgh';
// Warm amber stands out on the grey board in both themes.
const TINT = '#E89B2C';

type Props = {
  fen: string;
  size?: number;
  /** Squares to tint, like "e4". */
  highlight?: string[];
  /** Arrows as from-to squares, like "g1f3". */
  arrows?: string[];
  /** 'b' draws the board from Black's side. */
  orientation?: 'w' | 'b';
  /** Makes every square clickable (drills). */
  onSquare?: (square: string) => void;
  /** Per-square tint for drill feedback, e.g. { f3: 'var(--ok)' }. */
  marks?: Record<string, string>;
};

/** Every board is drawn from a FEN that chess.js accepts; anything else is refused. */
export function ChessBoard({ fen, size = 320, highlight = [], arrows = [], orientation = 'w', onSquare, marks = {} }: Props) {
  const board = useMemo(() => {
    try {
      return new Chess(fen).board();
    } catch {
      return null;
    }
  }, [fen]);
  if (!board) return <p className="muted">This position failed validation, so it is not shown.</p>;

  const sq = size / 8;
  const flip = orientation === 'b';
  const at = (name: string) => {
    const f = FILES.indexOf(name[0]);
    const r = Number(name[1]);
    return { x: flip ? 7 - f : f, y: flip ? r - 1 : 8 - r };
  };
  const ranks = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flip ? FILES.split('').reverse() : FILES.split('');

  return (
    <div className="board-wrap">
      <div className="board-ranks" style={{ height: size }} aria-hidden>
        {ranks.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div className="board" role="img" aria-label={`Chess position ${fen}`} style={{ width: size, height: size }}>
        {ranks.map((r) =>
          files.map((f) => {
            const name = f + r;
            const dark = (FILES.indexOf(f) + r) % 2 === 1;
            const cell = board[8 - r][FILES.indexOf(f)];
            const lit = marks[name] ?? (highlight.includes(name) ? TINT : null);
            const inner = (
              <>
                {lit && <span className="sq-tint" style={{ background: lit }} />}
                {cell && <span className="piece" dangerouslySetInnerHTML={{ __html: PIECES[cell.color + cell.type.toUpperCase()] }} />}
              </>
            );
            return onSquare ? (
              <button key={name} type="button" aria-label={name} className={`sq ${dark ? 'dark' : 'light'}`} onClick={() => onSquare(name)}>
                {inner}
              </button>
            ) : (
              <span key={name} className={`sq ${dark ? 'dark' : 'light'}`}>
                {inner}
              </span>
            );
          }),
        )}
        {arrows.length > 0 && (
          <svg className="board-arrows" width={size} height={size} aria-hidden>
            {arrows.map((a, i) => {
              const from = at(a.slice(0, 2));
              const to = at(a.slice(2, 4));
              const [x1, y1, x2, y2] = [(from.x + 0.5) * sq, (from.y + 0.5) * sq, (to.x + 0.5) * sq, (to.y + 0.5) * sq];
              const len = Math.hypot(x2 - x1, y2 - y1) || 1;
              const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
              const head = sq * 0.42;
              const [bx, by] = [x2 - ux * head, y2 - uy * head];
              const w = sq * 0.3;
              return (
                <g key={i} opacity={0.85}>
                  <line x1={x1} y1={y1} x2={bx} y2={by} stroke={TINT} strokeWidth={sq * 0.16} strokeLinecap="round" />
                  <polygon points={`${x2},${y2} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}`} fill={TINT} />
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className="board-files" style={{ width: size }} aria-hidden>
        {files.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>
  );
}

import { Chess } from 'chess.js';
import { useState } from 'react';

import { GRADES, type Grade } from '@shared/srs';
import type { Block } from '@shared/types';
import { useFeed } from '../store/Feed';
import { ChessBoard } from './ChessBoard';
import { Crossword } from './Crossword';
import { Icon } from './Icon';
import { Sudoku } from './Sudoku';

/** Reads Italian aloud with the Mac's own Italian voice (Alice or Federica, if installed). */
export function speakItalian(text: string) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'it-IT';
  u.rate = 0.9;
  const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').startsWith('it'));
  if (voice) u.voice = voice;
  synth.speak(u);
}

function Speak({ text }: { text: string }) {
  return (
    <button type="button" className="speak" aria-label={`Play pronunciation of ${text}`} onClick={() => speakItalian(text)}>
      <Icon name="speaker" size={18} />
    </button>
  );
}

function Quiz({ b }: { b: Extract<Block, { type: 'quiz' }> }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === b.answer;
  return (
    <div className="panel">
      <p className="panel-q">{b.question}</p>
      {b.code && <pre className="code">{b.code}</pre>}
      <div className="options">
        {b.options.map((opt, i) => {
          const chosen = picked === i;
          const showRight = picked !== null && i === b.answer;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={chosen}
              className={`option${showRight ? ' right' : chosen ? ' chosen' : ''}${b.code ? ' mono' : ''}`}
              onClick={() => setPicked(i)}
            >
              {opt}
              {showRight && <Icon name="check" size={16} />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className="panel-note">
          <b className={right ? 'ok' : ''}>{right ? 'Right. ' : 'Not quite. '}</b>
          {b.explain}
        </p>
      )}
    </div>
  );
}

/**
 * Click-the-board drill. "square": click the answer square. "move": click a piece, then
 * where it goes; chess.js turns that into notation and compares it with the answer.
 */
function Drill({ b }: { b: Extract<Block, { type: 'chessDrill' }> }) {
  const [from, setFrom] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; said: string; marks: Record<string, string> } | null>(null);
  const solved = result?.ok;
  const revealed = !solved && tries >= 2;
  const OK = 'var(--ok)';
  const BAD = 'var(--down)';

  const answerMarks = (): Record<string, string> => {
    if (b.mode === 'square') return { [b.answer]: OK };
    const m = new Chess(b.fen).move(b.answer);
    return { [m.from]: OK, [m.to]: OK };
  };

  const onSquare = (sq: string) => {
    if (solved || revealed) return;
    if (b.mode === 'square') {
      const ok = sq === b.answer;
      setTries((n) => n + (ok ? 0 : 1));
      setResult({ ok, said: sq, marks: { [sq]: ok ? OK : BAD } });
      return;
    }
    const game = new Chess(b.fen);
    const piece = game.get(sq as never);
    if (!from || (piece && piece.color === game.turn())) {
      if (piece && piece.color === game.turn()) {
        setFrom(sq);
        setResult(null);
      }
      return;
    }
    let san: string | null = null;
    try {
      san = game.move({ from, to: sq, promotion: 'q' }).san;
    } catch {
      san = null;
    }
    setFrom(null);
    if (!san) return setResult({ ok: false, said: 'not a legal move', marks: { [sq]: BAD } });
    const ok = san === b.answer;
    setTries((n) => n + (ok ? 0 : 1));
    setResult({ ok, said: san, marks: { [from]: ok ? OK : BAD, [sq]: ok ? OK : BAD } });
  };

  const marks = revealed ? answerMarks() : { ...(result?.marks ?? {}), ...(from ? { [from]: 'var(--hot)' } : {}) };
  return (
    <div className="panel">
      <p className="panel-q">{b.question}</p>
      <ChessBoard fen={b.fen} size={336} orientation={b.orientation} onSquare={onSquare} marks={marks} />
      <p className="panel-note">
        {solved ? (
          <>
            <b className="ok">Right. </b>
            {b.explain ?? ''}
          </>
        ) : revealed ? (
          <>
            <b>The answer is {b.answer}. </b>
            {b.explain ?? ''}
          </>
        ) : result ? (
          `You ${b.mode === 'square' ? 'clicked' : 'played'} ${result.said}. Try again.`
        ) : b.mode === 'move' ? (
          from ? `Now click where the piece on ${from} goes.` : 'Click the piece, then the square it moves to.'
        ) : (
          'Click the square.'
        )}
      </p>
    </div>
  );
}

function Chart({ b }: { b: Extract<Block, { type: 'chart' }> }) {
  const W = 600;
  const H = b.kind === 'candle' ? 220 : 180;
  const values = b.kind === 'candle' ? b.candles.flatMap((k) => [k.h, k.l]) : b.points;
  const max = Math.max(...values);
  const min = b.kind === 'bar' ? 0 : Math.min(...values);
  const y = (v: number) => H - 8 - ((v - min) / (max - min || 1)) * (H - 16);
  return (
    <figure className="panel chart">
      {b.title && <figcaption className="chart-title">{b.title}</figcaption>}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={b.title ?? 'Chart'}>
        {b.kind === 'candle'
          ? b.candles.map((k, i) => {
              const bw = W / b.candles.length;
              const cx = i * bw + bw / 2;
              const color = k.c >= k.o ? 'var(--ok)' : 'var(--down)';
              const top = y(Math.max(k.o, k.c));
              return (
                <g key={i}>
                  <path d={`M${cx},${y(k.h)} L${cx},${y(k.l)}`} stroke={color} strokeWidth={1.5} />
                  <rect x={cx - bw * 0.3} y={top} width={bw * 0.6} height={Math.max(1.5, y(Math.min(k.o, k.c)) - top)} rx={1.5} fill={color} />
                </g>
              );
            })
          : b.kind === 'line' ? (
              <path
                d={b.points.map((v, i) => `${i ? 'L' : 'M'}${(i / (b.points.length - 1)) * W},${y(v)}`).join(' ')}
                stroke="var(--ink)"
                strokeWidth={2.5}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              b.points.map((v, i) => {
                const bw = W / b.points.length;
                return <rect key={i} x={i * bw + bw * 0.18} y={y(v)} width={bw * 0.64} height={H - 8 - y(v)} fill={i === b.points.length - 1 ? 'var(--hot)' : 'var(--ink)'} opacity={i === b.points.length - 1 ? 1 : 0.7} />;
              })
            )}
      </svg>
      {b.labels && (
        <div className="chart-labels">
          {b.labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      {b.caption && <p className="panel-note">{b.caption}</p>}
    </figure>
  );
}

/**
 * Flashcards for words due today: see the Italian (and hear it), think of the meaning,
 * reveal, then say how well you knew it. Answers are saved on the card; the helper
 * schedules them when you press DONE.
 */
function VocabReview({ b, cardId }: { b: Extract<Block, { type: 'vocabReview' }>; cardId?: string }) {
  const { today, patch } = useFeed();
  const grades = today?.cards.find((c) => c.id === cardId)?.practice?.grades ?? {};
  const next = b.items.findIndex((w) => !grades[w.id]);
  const [shown, setShown] = useState(false);
  const w = b.items[next];

  if (next < 0) {
    const knew = b.items.filter((x) => (grades[x.id] ?? 0) >= 3).length;
    return (
      <div className="panel">
        <p className="panel-q">
          Review done: {knew} of {b.items.length} you knew well.
        </p>
        <p className="panel-note">Words you missed come back sooner. Press DONE at the end to save the schedule.</p>
      </div>
    );
  }
  const grade = (g: Grade) => {
    if (!cardId) return;
    patch(cardId, { practice: { grades: { ...grades, [w.id]: g } } });
    setShown(false);
  };
  return (
    <div className="panel">
      <div className="row between muted small">
        <span>Review</span>
        <span className="tabular">
          {next + 1} / {b.items.length}
        </span>
      </div>
      <div className="row gap">
        <span className="serif xl grow">{w.it}</span>
        <Speak text={w.it} />
      </div>
      {shown ? (
        <>
          <p className="lead-text">{w.en}</p>
          {w.note && <p className="panel-note">{w.note}</p>}
          <div className="row gap-s">
            {GRADES.map(({ grade: g, label }) => (
              <button key={g} type="button" className={`btn grow${g === 3 ? ' btn-strong' : ''}`} onClick={() => grade(g)}>
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" className="btn" onClick={() => setShown(true)}>
          Show meaning
        </button>
      )}
    </div>
  );
}

export function BlockView({ b, cardId }: { b: Block; cardId?: string }) {
  switch (b.type) {
    case 'heading':
      return <h3 className="block-heading">{b.text}</h3>;
    case 'text':
      return <p className="block-text">{b.text}</p>;
    case 'code':
      return <pre className="code">{b.code}</pre>;
    case 'callout':
      return (
        <aside className="callout">
          {b.label && <b>{b.label}. </b>}
          {b.text}
        </aside>
      );
    case 'diagram':
      return (
        <div className="panel">
          {b.title && <h4 className="serif l">{b.title}</h4>}
          {b.rows.map((r, i) => (
            <div key={i} className="diagram-row">
              <span className="diagram-n">{i + 1}</span>
              <code className="diagram-code">{r.code}</code>
              <Icon name="arrow" size={18} />
              <span className={`diagram-value${r.label ? '' : ' solid'}`}>
                {r.label && <small>{r.label}</small>}
                <code>{r.value}</code>
              </span>
            </div>
          ))}
          {b.caption && <p className="panel-note">{b.caption}</p>}
        </div>
      );
    case 'chart':
      return <Chart b={b} />;
    case 'chessBoard':
      return (
        <div className="panel center">
          <ChessBoard fen={b.fen} size={336} highlight={b.highlight} arrows={b.arrows} orientation={b.orientation} />
          {b.caption && <p className="panel-note">{b.caption}</p>}
        </div>
      );
    case 'quiz':
      return <Quiz b={b} />;
    case 'chessDrill':
      return <Drill b={b} />;
    case 'vocabReview':
      return <VocabReview b={b} cardId={cardId} />;
    case 'italianPhrase':
      return (
        <div className="phrase">
          <div className="grow">
            <div className="serif xl italic">{b.it}</div>
            <div className="muted small">{b.en}</div>
            {b.note && <div className="faint small">{b.note}</div>}
          </div>
          <Speak text={b.it} />
        </div>
      );
    case 'sudoku':
      return <Sudoku b={b} cardId={cardId} />;
    case 'crossword':
      return <Crossword b={b} cardId={cardId} />;
  }
}

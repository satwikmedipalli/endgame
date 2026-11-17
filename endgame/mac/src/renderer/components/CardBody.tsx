import { useEffect, useRef, useState } from 'react';

import { isLessonCourse } from '@shared/course';
import { discussLink } from '@shared/discuss';
import type { Card } from '@shared/types';
import { typing } from '../lib';
import { useFeed } from '../store/Feed';
import { useHelper } from '../store/Helper';
import { BlockView } from './Blocks';
import { Icon } from './Icon';

const NOUN: Partial<Record<Card['kind'], string>> = { history: 'story', watch: 'pitch' };
/** Cards whose content the helper writes when you open them: lessons, history stories, watch pitches. */
export const writtenOnOpen = (c: Card) => !c.blocks.length && (isLessonCourse(c.course) || c.kind === 'history');
const isBook = (c: Card) => c.tag.startsWith('Book');

/** A card before its content exists: opening it asks the helper once to write it. */
function Pending({ card }: { card: Card }) {
  const { userId } = useFeed();
  const { online, explain, lessons } = useHelper();
  const job = lessons[card.id];
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || job || !userId) return;
    asked.current = true;
    explain(card.id);
  }, [job, userId, explain, card.id]);

  const failed = job?.status === 'failed';
  const noun = NOUN[card.kind] ?? 'lesson';
  const text = !userId
    ? `The ${noun} is written by the helper. Sign in to use it.`
    : failed
      ? `The ${noun} couldn't be written: ${job.error ?? 'unknown error'}`
      : job?.status === 'done'
        ? 'Done. Loading it…'
        : !online
          ? `The helper is offline. The ${noun} gets written as soon as it's back, and appears here.`
          : job?.status === 'running'
            ? `Writing the ${noun}. This takes a minute or so.`
            : 'Asking the helper…';
  return (
    <div className="pending">
      {card.kind !== 'watch' && <p className="block-text">{card.hook}</p>}
      <p className="pending-line">
        {!failed && userId && <span className="spinner" aria-hidden />}
        {text}
      </p>
      {failed && (
        <button type="button" className="btn" onClick={() => explain(card.id)}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Optional one line after a rating; it goes into your taste profile word for word. */
function RatingComment({ card }: { card: Card }) {
  const { patch } = useFeed();
  const [text, setText] = useState(card.watch?.comment ?? '');
  const save = () => text.trim() !== (card.watch?.comment ?? '') && patch(card.id, { watch: { ...card.watch!, comment: text.trim() || undefined } });
  return (
    <input
      className="field"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && save()}
      maxLength={140}
      placeholder="One line about it (optional)"
      aria-label="Comment on this title"
    />
  );
}

/** Italian is capped at 10 minutes a day: a quiet countdown, then a nudge to stop. */
function ItalianTimer() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, 600 - Math.floor((now - start) / 1000));
  return (
    <p className={`small tabular ${left ? 'muted' : 'strong'}`}>
      {left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left of today’s 10 minutes` : 'That’s your 10 minutes. Press DONE; the rest can wait for tomorrow.'}
    </p>
  );
}

function WatchFlow({ card }: { card: Card }) {
  const { patch, mark } = useFeed();
  const stage = card.watch?.stage ?? 'teaser';
  const verb = isBook(card) ? 'read' : 'watch';
  const choice = (label: string, onClick: () => void, solid = false) => (
    <button key={label} type="button" className={`btn grow${solid ? ' btn-done' : ''}`} onClick={onClick}>
      {label}
    </button>
  );

  if (stage === 'followup' || stage === 'rated') {
    return (
      <div className="stack">
        <p className="muted">{stage === 'rated' ? `You rated it ${card.watch?.rating}/10.` : `Did you ${verb} it? Pick a rating, or Skip if you haven't yet.`}</p>
        <div className="ratings">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Rate ${n} out of 10`}
              className={`btn rating${card.watch?.rating === n ? ' btn-done' : ''}`}
              onClick={() => {
                patch(card.id, { watch: { ...card.watch, stage: 'rated', rating: n } });
                mark(card.id, 'done');
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {stage === 'rated' && <RatingComment card={card} />}
      </div>
    );
  }
  if (stage === 'teaser') {
    return (
      <div className="stack">
        <p className="block-text">{card.hook}</p>
        <div className="row gap-s">
          {choice('Not for me', () => mark(card.id, 'skip'))}
          {choice('Interested', () => patch(card.id, { watch: { stage: 'pitch' } }), true)}
        </div>
      </div>
    );
  }
  // Interested: the pitch is written now by the helper, unless it already exists.
  if (!card.blocks.length) return <Pending card={card} />;
  return (
    <div className="stack">
      {card.blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
      <h3 className="block-heading">Will you {verb} it?</h3>
      {stage === 'decided' ? (
        <p className="muted">{card.watch?.willWatch ? `Noted. Tomorrow you'll get a quick “Did you ${verb} it?”.` : 'Noted. It will not come back.'}</p>
      ) : (
        <div className="row gap-s">
          {choice('No', () => patch(card.id, { watch: { stage: 'decided', willWatch: false } }))}
          {choice('Yes', () => patch(card.id, { watch: { stage: 'decided', willWatch: true } }), true)}
        </div>
      )}
    </div>
  );
}

function Chat({ card, active }: { card: Card; active: boolean }) {
  const { ask, thinking, online } = useHelper();
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const waiting = thinking.has(card.id);

  // ⌘K jumps to the question box on the open sheet.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else if (e.key === 'Escape' && typing(e) && document.activeElement === input.current) {
        input.current?.blur();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  const discuss = () => {
    const { url, copy } = discussLink(card);
    if (copy) {
      window.endgame.copy(copy);
      setCopied(true);
    }
    window.endgame.openExternal(url);
  };
  const send = (msg: string) => {
    const m = msg.trim();
    if (!m || waiting) return;
    ask(card.id, m);
    setText('');
  };

  return (
    <section className="chat" aria-label="Ask about this card">
      <h3 className="block-heading">Ask anything</h3>
      {card.chat.map((m) =>
        m.role === 'system' ? (
          <p key={m.id} className="chat-system">
            {m.text}
          </p>
        ) : (
          <p key={m.id} className={`bubble ${m.role}`}>
            {m.text}
          </p>
        ),
      )}
      {waiting && <p className="bubble assistant muted">Thinking…</p>}
      <div className="row gap-s wrap">
        {(card.kind === 'italian' ? ['Chat with me in Italian', 'Simplify'] : card.kind === 'puzzle' ? ['Give me a hint'] : ['Simplify', 'Another example']).map((chip) => (
          <button key={chip} type="button" className="btn chip" onClick={() => send(chip)}>
            {chip}
          </button>
        ))}
      </div>
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={card.kind === 'news' ? 'Ask about this story…  (⌘K)' : 'Ask a question…  (⌘K)'}
          aria-label="Ask a question"
        />
        <button type="submit" className="send" aria-label="Send">
          <Icon name="send" size={18} />
        </button>
      </form>
      <button type="button" className="link" onClick={discuss}>
        {online ? 'Discuss in Claude →' : 'Helper offline? Discuss in Claude →'}
      </button>
      {copied && <p className="faint small center">Prompt copied. Paste it in Claude.</p>}
    </section>
  );
}

/** Everything on a card's page between its title and the Skip / DONE bar. */
export function CardBody({ card, active }: { card: Card; active: boolean }) {
  return (
    <div className="card-body">
      {card.kind === 'italian' && active && <ItalianTimer />}
      {card.kind === 'watch' ? (
        <WatchFlow card={card} />
      ) : writtenOnOpen(card) ? (
        active ? <Pending card={card} /> : <p className="block-text">{card.hook}</p>
      ) : (
        card.blocks.map((b, i) => <BlockView key={i} b={b} cardId={card.id} />)
      )}
      {card.kind === 'news' && !card.blocks.length && <p className="block-text">{card.hook}</p>}
      {card.kind === 'stocks' && <p className="faint small">Education, not financial advice.</p>}
      {card.kind !== 'watch' && <Chat card={card} active={active} />}
    </div>
  );
}

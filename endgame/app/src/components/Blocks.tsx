import { Chess } from 'chess.js';
import * as Speech from 'expo-speech';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { GRADES, type Grade } from '@/lib/srs';
import type { Block, CardKind } from '@/lib/types';
import { useFeed } from '@/store/FeedStore';
import { useTheme } from '@/theme/ThemeProvider';
import { accent, fonts } from '@/theme/tokens';
import { ChessBoard } from './ChessBoard';
import { Icon } from './Icon';
import { Serif, T } from './ui';

export function speakItalian(text: string) {
  Speech.stop();
  Speech.speak(text, { language: 'it-IT', rate: 0.9 });
}

function Panel({ children, gap = 14 }: { children: React.ReactNode; gap?: number }) {
  const { t, mode } = useTheme();
  return (
    <View
      style={{
        gap,
        padding: 18,
        borderRadius: 20,
        backgroundColor: t.card,
        borderWidth: 1,
        borderColor: t.cardLine,
        shadowColor: t.shadow,
        shadowOpacity: mode === 'light' ? 0.5 : 0,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      {children}
    </View>
  );
}

function Mono({ children, size = 14, color }: { children: React.ReactNode; size?: number; color?: string }) {
  const { t } = useTheme();
  return <Text style={{ fontFamily: fonts.mono, fontSize: size, lineHeight: size * 1.7, color: color ?? t.text }}>{children}</Text>;
}

function Quiz({ b, kind }: { b: Extract<Block, { type: 'quiz' }>; kind: CardKind }) {
  const { t, mode } = useTheme();
  const a = accent(kind, mode);
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === b.answer;
  const monoOptions = !!b.code;
  return (
    <Panel>
      <T w={500} size={15}>
        {b.question}
      </T>
      {b.code && (
        <View style={{ padding: 14, borderRadius: 12, backgroundColor: t.codeBg }}>
          <Mono>{b.code}</Mono>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {b.options.map((opt, i) => {
          const chosen = picked === i;
          const showRight = picked !== null && i === b.answer;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => setPicked(i)}
              style={{
                flexBasis: '47%',
                flexGrow: 1,
                minHeight: 52,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: showRight || chosen ? 1.5 : 1,
                borderColor: showRight ? a.color : chosen ? t.muted : t.btnLine,
                backgroundColor: showRight ? a.wash : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Text style={{ fontFamily: monoOptions ? fonts.mono : fonts.body, fontSize: 15, color: chosen || showRight ? t.text : t.muted, textAlign: 'center' }}>{opt}</Text>
              {showRight && <Icon name="check" size={16} color={a.color} stroke={2.2} />}
            </Pressable>
          );
        })}
      </View>
      {picked !== null && (
        <T size={14} color={t.body} style={{ lineHeight: 21 }}>
          <T w={600} size={14} color={right ? a.color : t.text}>
            {right ? 'Right. ' : 'Not quite. '}
          </T>
          {b.explain}
        </T>
      )}
    </Panel>
  );
}

/**
 * Tap-the-board drill. "square": tap the answer square. "move": tap a piece, then
 * where it goes; chess.js turns that into notation and compares it with the answer.
 */
function Drill({ b, kind }: { b: Extract<Block, { type: 'chessDrill' }>; kind: CardKind }) {
  const { t, mode } = useTheme();
  const a = accent(kind, mode);
  const [from, setFrom] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; said: string; marks: Record<string, string> } | null>(null);
  const solved = result?.ok;
  const revealed = !solved && tries >= 2;

  const answerMarks = (): Record<string, string> => {
    if (b.mode === 'square') return { [b.answer]: t.ok };
    const m = new Chess(b.fen).move(b.answer);
    return { [m.from]: t.ok, [m.to]: t.ok };
  };

  const onSquare = (sq: string) => {
    if (solved || revealed) return;
    if (b.mode === 'square') {
      const ok = sq === b.answer;
      setTries((n) => n + (ok ? 0 : 1));
      setResult({ ok, said: sq, marks: { [sq]: ok ? t.ok : t.down } });
      return;
    }
    const game = new Chess(b.fen);
    const piece = game.get(sq as never);
    if (!from || (piece && piece.color === game.turn())) {
      // First tap (or switching to another of your pieces) picks the piece.
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
    if (!san) return setResult({ ok: false, said: 'not a legal move', marks: { [sq]: t.down } });
    const ok = san === b.answer;
    setTries((n) => n + (ok ? 0 : 1));
    setResult({ ok, said: san, marks: { [from]: ok ? t.ok : t.down, [sq]: ok ? t.ok : t.down } });
  };

  const marks = revealed ? answerMarks() : { ...(result?.marks ?? {}), ...(from ? { [from]: a.color } : {}) };
  return (
    <Panel gap={12}>
      <T w={500} size={15}>
        {b.question}
      </T>
      <ChessBoard fen={b.fen} size={264} orientation={b.orientation} accent={a.color} onSquare={onSquare} marks={marks} />
      <T size={14} color={t.body} style={{ lineHeight: 21 }}>
        {solved ? (
          <>
            <T w={600} size={14} color={a.color}>
              Right.{' '}
            </T>
            {b.explain ?? ''}
          </>
        ) : revealed ? (
          <>
            <T w={600} size={14}>
              The answer is {b.answer}.{' '}
            </T>
            {b.explain ?? ''}
          </>
        ) : result ? (
          `You ${b.mode === 'square' ? 'tapped' : 'played'} ${result.said}. Try again.`
        ) : b.mode === 'move' ? (
          from ? `Now tap where the piece on ${from} goes.` : 'Tap the piece, then the square it moves to.'
        ) : (
          'Tap the square.'
        )}
      </T>
    </Panel>
  );
}

function Chart({ b, kind }: { b: Extract<Block, { type: 'chart' }>; kind: CardKind }) {
  const { t, mode } = useTheme();
  const a = accent(kind, mode);
  const W = 300;
  const H = b.kind === 'candle' ? 170 : 140;
  const values = b.kind === 'candle' ? b.candles.flatMap((k) => [k.h, k.l]) : b.points;
  const max = Math.max(...values);
  const min = b.kind === 'bar' ? 0 : Math.min(...values);
  const y = (v: number) => H - 8 - ((v - min) / (max - min || 1)) * (H - 16);
  return (
    <Panel gap={10}>
      {b.title && (
        <T w={500} size={14} color={t.muted}>
          {b.title}
        </T>
      )}
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {b.kind === 'candle' ? (
          b.candles.map((k, i) => {
            // Up candles (close at or above open) are green, down candles red; the wick spans low to high.
            const bw = W / b.candles.length;
            const cx = i * bw + bw / 2;
            const color = k.c >= k.o ? t.ok : t.down;
            const top = y(Math.max(k.o, k.c));
            return (
              <G key={i}>
                <Path d={`M${cx},${y(k.h)} L${cx},${y(k.l)}`} stroke={color} strokeWidth={1.5} />
                <Rect x={cx - bw * 0.3} y={top} width={bw * 0.6} height={Math.max(1.5, y(Math.min(k.o, k.c)) - top)} rx={1.5} fill={color} />
              </G>
            );
          })
        ) : b.kind === 'line' ? (
          <Path
            d={b.points.map((v, i) => `${i ? 'L' : 'M'}${(i / (b.points.length - 1)) * W},${y(v)}`).join(' ')}
            stroke={a.color}
            strokeWidth={2.5}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : (
          b.points.map((v, i) => {
            const bw = W / b.points.length;
            return <Rect key={i} x={i * bw + bw * 0.18} y={y(v)} width={bw * 0.64} height={H - 8 - y(v)} rx={4} fill={a.color} opacity={i === b.points.length - 1 ? 1 : 0.55} />;
          })
        )}
      </Svg>
      {b.labels && (
        <View style={{ flexDirection: 'row' }}>
          {b.labels.map((l, i) => (
            <T key={i} size={12} color={t.faint} style={{ flex: 1, textAlign: 'center' }}>
              {l}
            </T>
          ))}
        </View>
      )}
      {b.caption && (
        <T size={13} color={t.muted} style={{ lineHeight: 19 }}>
          {b.caption}
        </T>
      )}
    </Panel>
  );
}

/**
 * Flashcards for words due today: see the Italian (and hear it), think of the
 * meaning, reveal, then say how well you knew it. Answers are saved on the card,
 * so you can stop and pick up again; the Mac schedules them when you press DONE.
 */
function VocabReview({ b, kind, cardId }: { b: Extract<Block, { type: 'vocabReview' }>; kind: CardKind; cardId?: string }) {
  const { t, mode } = useTheme();
  const a = accent(kind, mode);
  const { today, patch } = useFeed();
  const grades = today?.cards.find((c) => c.id === cardId)?.practice?.grades ?? {};
  const next = b.items.findIndex((w) => !grades[w.id]);
  const [shown, setShown] = useState(false);
  const w = b.items[next];

  if (next < 0) {
    const knew = b.items.filter((x) => (grades[x.id] ?? 0) >= 3).length;
    return (
      <Panel>
        <T w={500} size={15}>
          Review done: {knew} of {b.items.length} you knew well.
        </T>
        <T size={13} color={t.muted}>
          Words you missed come back sooner. Press DONE at the end to save the schedule.
        </T>
      </Panel>
    );
  }
  const grade = (g: Grade) => {
    if (!cardId) return;
    patch(cardId, { practice: { grades: { ...grades, [w.id]: g } } });
    setShown(false);
  };
  return (
    <Panel>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={13} color={t.muted}>
          Review
        </T>
        <T size={13} color={t.muted} style={{ fontVariant: ['tabular-nums'] }}>
          {next + 1} / {b.items.length}
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Serif size={30} style={{ flex: 1 }}>
          {w.it}
        </Serif>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play pronunciation of ${w.it}`}
          onPress={() => speakItalian(w.it)}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: a.color, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="speaker" size={18} color={t.card} stroke={1.9} />
        </Pressable>
      </View>
      {shown ? (
        <>
          <T size={17} color={t.body}>
            {w.en}
          </T>
          {w.note && (
            <T size={13} color={t.muted}>
              {w.note}
            </T>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {GRADES.map(({ grade: g, label }) => (
              <Pressable
                key={g}
                accessibilityRole="button"
                onPress={() => grade(g)}
                style={{ flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: g === 3 ? a.color : t.btnLine, backgroundColor: g === 3 ? a.wash : 'transparent' }}
              >
                <T w={600} size={14}>
                  {label}
                </T>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShown(true)}
          style={{ height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.btnLine }}
        >
          <T w={600} size={14}>
            Show meaning
          </T>
        </Pressable>
      )}
    </Panel>
  );
}

export function BlockView({ b, kind, cardId }: { b: Block; kind: CardKind; cardId?: string }) {
  const { t, mode } = useTheme();
  const a = accent(kind, mode);
  switch (b.type) {
    case 'heading':
      return <Serif size={26}>{b.text}</Serif>;
    case 'text':
      return (
        <T size={17} color={t.body} style={{ lineHeight: 27 }}>
          {b.text}
        </T>
      );
    case 'code':
      return (
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: mode === 'light' ? t.card : t.codeBg, borderWidth: 1, borderColor: t.cardLine }}>
          <Mono>{b.code}</Mono>
        </View>
      );
    case 'callout':
      return (
        <View style={{ flexDirection: 'row', gap: 14, padding: 18, borderRadius: 18, backgroundColor: a.wash, borderWidth: 1, borderColor: a.soft }}>
          <View style={{ marginTop: 2 }}>
            <Icon name="bulb" size={20} color={a.color} />
          </View>
          <T size={15} style={{ flex: 1, lineHeight: 23 }}>
            {b.label && <T w={600} size={15}>{`${b.label}. `}</T>}
            {b.text}
          </T>
        </View>
      );
    case 'diagram':
      return (
        <Panel gap={10}>
          {b.title && <Serif size={22}>{b.title}</Serif>}
          {b.rows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.faint, width: 14 }}>{i + 1}</Text>
              <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.codeBg }}>
                <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: t.text }}>{r.code}</Text>
              </View>
              <Icon name="arrow" size={20} color={t.faint} />
              {r.label ? (
                <View style={{ width: 86, borderRadius: 10, borderWidth: 1, borderColor: a.line, overflow: 'hidden', alignItems: 'center' }}>
                  <View style={{ alignSelf: 'stretch', backgroundColor: a.color, paddingVertical: 3 }}>
                    <T w={600} size={11} color={t.card} style={{ textAlign: 'center' }}>
                      {r.label}
                    </T>
                  </View>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 13, paddingVertical: 8, color: t.text }}>{r.value}</Text>
                </View>
              ) : (
                <View style={{ width: 86, height: 52, borderRadius: 10, backgroundColor: t.doneBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: t.doneFg }}>{r.value}</Text>
                </View>
              )}
            </View>
          ))}
          {b.caption && (
            <T size={13} color={t.muted} style={{ lineHeight: 19, marginTop: 6 }}>
              {b.caption}
            </T>
          )}
        </Panel>
      );
    case 'chart':
      return <Chart b={b} kind={kind} />;
    case 'chessBoard':
      return (
        <Panel gap={12}>
          <ChessBoard fen={b.fen} size={264} highlight={b.highlight} arrows={b.arrows} orientation={b.orientation} accent={a.color} />
          {b.caption && (
            <T size={13} color={t.muted} style={{ textAlign: 'center' }}>
              {b.caption}
            </T>
          )}
        </Panel>
      );
    case 'quiz':
      return <Quiz b={b} kind={kind} />;
    case 'chessDrill':
      return <Drill b={b} kind={kind} />;
    case 'vocabReview':
      return <VocabReview b={b} kind={kind} cardId={cardId} />;
    case 'italianPhrase':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingLeft: 18, borderRadius: 18, backgroundColor: a.wash, borderWidth: 1, borderColor: a.line }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Serif italic size={28}>
              {b.it}
            </Serif>
            <T size={13} color={t.muted}>
              {b.en}
            </T>
            {b.note && (
              <T size={12} color={t.faint}>
                {b.note}
              </T>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play pronunciation of ${b.it}`}
            onPress={() => speakItalian(b.it)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: a.color, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="speaker" size={18} color={t.card} stroke={1.9} />
          </Pressable>
        </View>
      );
  }
}

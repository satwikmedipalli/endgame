import { Chess } from 'chess.js';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { G, Line, Polygon, SvgXml } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { PIECES } from './pieces';
import { T } from './ui';

const FILES = 'abcdefgh';

type Props = {
  fen: string;
  size?: number;
  /** Squares to tint, like "e4". */
  highlight?: string[];
  /** Arrows as from-to squares, like "g1f3". */
  arrows?: string[];
  /** 'b' draws the board from Black's side. */
  orientation?: 'w' | 'b';
  /** Kept for callers; arrows and highlights always use a contrasting amber. */
  accent?: string;
  /** Makes every square tappable (drills). */
  onSquare?: (square: string) => void;
  /** Per-square tint for drill feedback, e.g. { f3: '#9FD8A0' }. */
  marks?: Record<string, string>;
};

/** Every board is drawn from a FEN that chess.js accepts; anything else is refused. */
export function ChessBoard({ fen, size = 200, highlight = [], arrows = [], orientation = 'w', onSquare, marks = {} }: Props) {
  const { t } = useTheme();
  const board = useMemo(() => {
    try {
      return new Chess(fen).board();
    } catch {
      return null;
    }
  }, [fen]);
  if (!board) return <T color={t.muted}>This position failed validation, so it is not shown.</T>;

  const sq = size / 8;
  const flip = orientation === 'b';
  // Screen position (0–7, left to right / top to bottom) of a square.
  const at = (name: string) => {
    const f = FILES.indexOf(name[0]);
    const r = Number(name[1]);
    return { x: flip ? 7 - f : f, y: flip ? r - 1 : 8 - r };
  };
  const ranks = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flip ? FILES.split('').reverse() : FILES.split('');
  // Warm amber stands out on the lavender board in both themes (the chess accent itself would not).
  const tint = '#F0A030';

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ justifyContent: 'space-around' }}>
          {ranks.map((r) => (
            <T key={r} w={500} size={11} color={t.faint}>
              {r}
            </T>
          ))}
        </View>
        <View
          accessibilityRole="image"
          accessibilityLabel={`Chess position ${fen}`}
          style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: t.cardLine }}
        >
          {ranks.map((r, y) =>
            files.map((f, x) => {
              const name = f + r;
              const dark = (FILES.indexOf(f) + r) % 2 === 1;
              const cell = board[8 - r][FILES.indexOf(f)];
              const lit = marks[name] ?? (highlight.includes(name) ? tint : null);
              const Square = onSquare ? Pressable : View;
              return (
                <Square
                  key={name}
                  accessibilityLabel={onSquare ? name : undefined}
                  onPress={onSquare ? () => onSquare(name) : undefined}
                  style={{ position: 'absolute', left: x * sq, top: y * sq, width: sq, height: sq, backgroundColor: dark ? t.boardDark : t.boardLight }}
                >
                  {lit && <View style={{ position: 'absolute', inset: 0, backgroundColor: lit, opacity: 0.5 }} />}
                  {cell && <SvgXml xml={PIECES[cell.color + cell.type.toUpperCase()]} width={sq} height={sq} />}
                </Square>
              );
            }),
          )}
          {arrows.length > 0 && (
            <Svg width={size} height={size} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
              {arrows.map((a, i) => {
                const from = at(a.slice(0, 2));
                const to = at(a.slice(2, 4));
                const [x1, y1, x2, y2] = [(from.x + 0.5) * sq, (from.y + 0.5) * sq, (to.x + 0.5) * sq, (to.y + 0.5) * sq];
                const len = Math.hypot(x2 - x1, y2 - y1) || 1;
                const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
                const head = sq * 0.42;
                // Shaft stops at the arrow head; the head is a triangle pointing at the target square's centre.
                const [bx, by] = [x2 - ux * head, y2 - uy * head];
                const w = sq * 0.3;
                return (
                  <G key={i}>
                    <Line x1={x1} y1={y1} x2={bx} y2={by} stroke={tint} strokeWidth={sq * 0.16} strokeLinecap="round" opacity={0.85} />
                    <Polygon points={`${x2},${y2} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}`} fill={tint} opacity={0.85} />
                  </G>
                );
              })}
            </Svg>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', width: size, marginLeft: 14 }}>
        {files.map((f) => (
          <T key={f} w={500} size={11} color={t.faint} style={{ flex: 1, textAlign: 'center' }}>
            {f}
          </T>
        ))}
      </View>
    </View>
  );
}

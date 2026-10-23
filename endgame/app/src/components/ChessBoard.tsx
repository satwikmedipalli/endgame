import { Chess } from 'chess.js';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { T } from './ui';

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';
// U+FE0E keeps iOS from drawing the pieces as emoji.
const TEXT_STYLE = '\uFE0E';

export function ChessBoard({ fen, size = 200, highlight = [], accent }: { fen: string; size?: number; highlight?: string[]; accent?: string }) {
  const { t } = useTheme();
  const board = useMemo(() => {
    try {
      return new Chess(fen).board();
    } catch {
      return null;
    }
  }, [fen]);
  if (!board) return <T color={t.muted}>This position failed validation, so it is not shown.</T>;

  const sq = (size - 2) / 8;
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ justifyContent: 'space-around' }}>
          {[8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
            <T key={r} w={500} size={11} color={t.faint}>
              {r}
            </T>
          ))}
        </View>
        <View
          accessibilityRole="image"
          accessibilityLabel={`Chess position ${fen}`}
          style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: t.cardLine }}
        >
          {board.flatMap((row, ri) =>
            row.map((cell, fi) => {
              const name = FILES[fi] + (8 - ri);
              const dark = (fi + (8 - ri)) % 2 === 1;
              const lit = highlight.includes(name);
              return (
                <View
                  key={name}
                  style={{
                    width: sq,
                    height: sq,
                    backgroundColor: dark ? t.boardDark : t.boardLight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {lit && <View style={{ position: 'absolute', inset: 0, backgroundColor: accent ?? '#E8B86D', opacity: 0.45 }} />}
                  {cell && (
                    <Text
                      style={{
                        fontSize: sq * 0.8,
                        lineHeight: sq * 0.9,
                        color: cell.color === 'w' ? '#FFFFFF' : '#1A1726',
                        textShadowColor: cell.color === 'w' ? '#1A1726' : 'rgba(255,255,255,0.4)',
                        textShadowRadius: 2,
                      }}
                    >
                      {GLYPH[cell.type] + TEXT_STYLE}
                    </Text>
                  )}
                </View>
              );
            }),
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', width: size, marginLeft: 14 }}>
        {FILES.split('').map((f) => (
          <T key={f} w={500} size={11} color={t.faint} style={{ flex: 1, textAlign: 'center' }}>
            {f}
          </T>
        ))}
      </View>
    </View>
  );
}

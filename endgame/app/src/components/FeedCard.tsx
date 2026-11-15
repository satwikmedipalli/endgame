import { Pressable, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { Card } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { accent, KIND_LABEL } from '@/theme/tokens';
import { speakItalian } from './Blocks';
import { ChessBoard } from './ChessBoard';
import { Icon } from './Icon';
import { CSS_SCROLL, egRole } from './feedMotion';
import { DoneButton, OutlineButton, Serif, T } from './ui';

const INSET = 16;
const BOTTOM = 40;

type Props = {
  card: Card;
  index: number;
  pageH: number;
  scrollY: SharedValue<number>;
  newsLeft: number;
  showHint: boolean;
  onOpen: () => void;
  onDone: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onClearNews: () => void;
};

function easeInOut(p: number) {
  'worklet';
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/**
 * One page of the feed. The card you leave pins in place, shrinks and dims
 * while the next card slides up over it (same motion as the design canvas).
 */
export function FeedCard({ card, index, pageH, scrollY, newsLeft, showHint, onOpen, onDone, onSkip, onUndo, onClearNews }: Props) {
  const { t, mode } = useTheme();
  const a = accent(card.kind, mode);
  const cardH = pageH - INSET - BOTTOM;
  const pin = pageH - 30;

  // These bail out when CSS drives the motion (web), so no JS runs per frame there.
  const cardStyle = useAnimatedStyle(() => {
    if (CSS_SCROLL) return {};
    const y = scrollY.value;
    const leave = Math.min(1, Math.max(0, (y - index * pageH) / pageH));
    const enter = Math.min(1, Math.max(0, (index * pageH - y) / pageH));
    return {
      transform: [{ translateY: leave * pin }, { scale: 1 - 0.1 * easeInOut(leave) - 0.07 * enter }],
    };
  });
  const dimStyle = useAnimatedStyle(() =>
    CSS_SCROLL ? {} : { opacity: interpolate(scrollY.value, [index * pageH, (index + 1) * pageH], [0, 0.78], Extrapolation.CLAMP) },
  );
  const innerStyle = useAnimatedStyle(() => {
    if (CSS_SCROLL) return {};
    const enter = Math.min(1, Math.max(0, (index * pageH - scrollY.value) / pageH));
    const k = Math.min(1, enter / 0.75);
    return { opacity: 1 - 0.85 * k, transform: [{ translateY: 56 * k }] };
  });

  const cleared = card.status !== 'open';
  const statusLabel =
    card.status === 'done' ? 'Done' : card.kind === 'news' ? 'Skipped (scrolled past)' : 'Skipped · back another day';
  const num = String(index + 1).padStart(2, '0');

  return (
    <View {...egRole('page')} style={{ height: pageH, zIndex: index + 1 }}>
      <Animated.View
        {...egRole('card')}
        style={[
          {
            position: 'absolute',
            top: INSET,
            left: INSET,
            right: INSET,
            height: cardH,
            borderRadius: 28,
            backgroundColor: t.card,
            borderWidth: 1,
            borderColor: t.cardLine,
            overflow: 'hidden',
            transformOrigin: 'top',
            shadowColor: t.shadow,
            shadowOpacity: 1,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 24 },
          },
          cardStyle,
        ]}
      >
        <Animated.View {...egRole('inner')} style={[{ flex: 1, padding: 22, paddingBottom: 20 }, innerStyle]}>
          <View style={{ position: 'absolute', top: 0, left: 22, width: 96, height: 1, backgroundColor: a.color }} />
          <Serif size={120} color={a.color} style={{ position: 'absolute', right: 18, top: 6, opacity: 0.1, lineHeight: 120 }} aria-hidden>
            {num}
          </Serif>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 28, paddingLeft: 10, paddingRight: 12, borderRadius: 999, borderWidth: 1, borderColor: a.line }}>
              <Icon name={card.kind} size={15} color={a.color} stroke={1.7} />
              <T w={600} size={12} color={a.color} style={{ letterSpacing: 0.7, textTransform: 'uppercase' }}>
                {KIND_LABEL[card.kind]}
              </T>
            </View>
            <T w={500} size={13} color={t.muted}>
              {card.tag}
            </T>
          </View>

          {card.continued && (
            <View style={{ alignSelf: 'flex-start', marginTop: 14, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.chip }}>
              <T w={500} size={11} style={{ letterSpacing: 0.4 }}>
                Continued from yesterday
              </T>
            </View>
          )}

          <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
            <Serif size={36}>{card.title}</Serif>
            {!!card.hook && (
              <T size={16} color={t.muted} style={{ lineHeight: 24 }}>
                {card.hook}
              </T>
            )}

            {card.kind === 'news' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <View style={{ flexDirection: 'row' }}>
                  {t.dots.slice(0, Math.min(card.sources ?? 1, t.dots.length)).map((c, i) => (
                    <View key={c} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c, marginLeft: i ? -6 : 0, borderWidth: 2, borderColor: t.card }} />
                  ))}
                </View>
                <T size={13} color={t.muted}>
                  Covered by {card.sources ?? 1} {(card.sources ?? 1) === 1 ? 'source' : 'sources'}
                </T>
              </View>
            )}

            {card.preview?.fen && (
              <View style={{ marginTop: 10 }}>
                <ChessBoard fen={card.preview.fen} size={200} accent={a.color} />
              </View>
            )}

            {card.preview?.phrase && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6, padding: 16, paddingLeft: 18, borderRadius: 18, backgroundColor: a.wash, borderWidth: 1, borderColor: a.line }}>
                <View style={{ gap: 4, flex: 1 }}>
                  <Serif italic size={28}>
                    {card.preview.phrase.it}
                  </Serif>
                  <T size={13} color={t.muted}>
                    {card.preview.phrase.en}
                  </T>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Play pronunciation"
                  onPress={() => speakItalian(card.preview!.phrase!.it)}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: a.color, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="speaker" size={18} color={t.card} stroke={1.9} />
                </Pressable>
              </View>
            )}

            {card.kind === 'stocks' && (
              <T size={12} color={t.faint}>
                Education, not financial advice.
              </T>
            )}
          </View>

          {cleared ? (
            <View style={{ height: 114, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.cardLine }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={16} color={t.muted} stroke={2} />
                <T w={500} size={15} color={t.muted}>
                  {statusLabel}
                </T>
              </View>
              <OutlineButton label="Undo" height={44} size={13} onPress={onUndo} style={{ borderRadius: 12 }} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                onPress={onOpen}
                style={({ pressed }) => ({
                  height: 54,
                  borderRadius: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 18,
                  backgroundColor: a.wash,
                  borderWidth: 1,
                  borderColor: a.line,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <T w={600} size={16} color={a.color}>
                  {card.cta}
                </T>
                <Icon name="arrow" size={18} color={a.color} stroke={1.9} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <OutlineButton label="Skip" onPress={onSkip} style={{ flex: 1 }} />
                <DoneButton onPress={onDone} style={{ flex: 1 }} />
              </View>
              {card.kind === 'news' && newsLeft > 1 && (
                <Pressable accessibilityRole="button" onPress={onClearNews} hitSlop={8} style={{ alignSelf: 'center', paddingTop: 2 }}>
                  <T size={13} color={t.faint}>
                    Clear all {newsLeft} news
                  </T>
                </Pressable>
              )}
            </View>
          )}
        </Animated.View>
        <Animated.View {...egRole('dim')} pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg }, dimStyle]} />
      </Animated.View>

      {showHint && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Icon name="up" size={12} color={t.faint} stroke={2} />
          <T size={11} color={t.faint} style={{ letterSpacing: 0.9, textTransform: 'uppercase' }}>
            Swipe up
          </T>
        </View>
      )}
    </View>
  );
}

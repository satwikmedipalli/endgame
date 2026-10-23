import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { dayKey, progress } from '@/lib/feed';
import { supabase } from '@/lib/supabase';
import type { DayFeed } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { accent, fonts } from '@/theme/tokens';
import { SyncControl } from './SyncControl';
import { Dot, OutlineButton, Serif, T } from './ui';

function tomorrow() {
  const [y, m, d] = dayKey(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** "You're done for today." The king topples once the last card is cleared. */
export function DoneOverlay({ feed, onLookBack }: { feed: DayFeed; onLookBack: () => void }) {
  const { t, mode } = useTheme();
  const { done, skipped } = progress(feed);
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.value = withTiming(1, { duration: 900 });
  }, [shown]);

  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: 14 * (1 - shown.value) }] }));
  // Separate, slower timing for the king so it falls after the screen appears.
  const fall = useSharedValue(0);
  useEffect(() => {
    fall.value = withDelay(300, withTiming(1, { duration: 1400, easing: Easing.bezier(0.6, 0, 0.2, 1) }));
  }, [fall]);
  const kingFall = useAnimatedStyle(() => ({ transform: [{ rotate: `${-90 * fall.value}deg` }] }));

  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500, backgroundColor: t.bg, justifyContent: 'center', paddingHorizontal: 32, gap: 28 }, fade]}>
      <Animated.Text style={[{ alignSelf: 'flex-start', fontFamily: fonts.serif, fontSize: 64, lineHeight: 64, color: t.text, transformOrigin: '50% 85%' }, kingFall]} aria-hidden>
        {'♔︎'}
      </Animated.Text>
      <Animated.View style={[{ gap: 6 }, rise]}>
        <Serif size={46} style={{ lineHeight: 47 }}>
          You&apos;re done for today.
        </Serif>
        <Serif italic size={30} color={t.muted}>
          Close your phone.
        </Serif>
      </Animated.View>
      <View style={{ gap: 12, paddingTop: 22, borderTopWidth: 1, borderTopColor: t.cardLine }}>
        <T w={500} size={15} color={t.muted}>
          {done} done · {skipped} skipped
        </T>
        {feed.cards
          .filter((c) => c.status === 'done')
          .slice(0, 8)
          .map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Dot color={accent(c.kind, mode).color} />
              <T size={14} numberOfLines={1} style={{ flex: 1 }}>
                {c.title}
              </T>
            </View>
          ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <T size={12} color={t.faint} style={{ flex: 1 }}>
          Tomorrow&apos;s set arrives at your next Sync.
        </T>
        <OutlineButton label="Look back" height={44} size={13} onPress={onLookBack} style={{ borderRadius: 12 }} />
      </View>
      {supabase && <SyncControl day={tomorrow()} label="Prepare tomorrow" />}
    </Animated.View>
  );
}

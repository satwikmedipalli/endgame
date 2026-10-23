import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { DoneOverlay } from '@/components/DoneOverlay';
import { FeedCard } from '@/components/FeedCard';
import { FeedHeader } from '@/components/FeedHeader';
import { useFeedCss } from '@/components/feedMotion';
import { Icon } from '@/components/Icon';
import { Dot, Serif, T } from '@/components/ui';
import { progress } from '@/lib/feed';
import { takeAdvance } from '@/store/nav';
import { useFeed } from '@/store/FeedStore';
import { useTheme } from '@/theme/ThemeProvider';
import { accent } from '@/theme/tokens';

export default function Feed() {
  const { t, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { today, ready, mark, undo, opened, autoSkipBefore, clearNews } = useFeed();
  const [pageH, setPageH] = useState(0);
  const [current, setCurrent] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [lookBack, setLookBack] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const scrollY = useSharedValue(0);
  const lastIdx = useSharedValue(0);
  const ref = useAnimatedRef<Animated.ScrollView>();
  useFeedCss(pageH);

  const onIndex = useCallback((i: number) => {
    setCurrent(i);
    setScrolled(true);
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      if (pageH <= 0) return;
      const i = Math.round(e.contentOffset.y / pageH);
      if (i !== lastIdx.value) {
        lastIdx.value = i;
        scheduleOnRN(onIndex, i);
      }
    },
  });

  // Scrolling past a news card counts as Skip.
  useEffect(() => {
    if (current > 0) autoSkipBefore(current);
  }, [current, autoSkipBefore]);

  // Neighbours glide; long jumps (Clear all news, the end-page list) cut straight there.
  const scrollToIndex = useCallback(
    (i: number) => ref.current?.scrollTo({ y: i * pageH, animated: Math.abs(i - current) <= 1 }),
    [ref, pageH, current],
  );

  const stats = today ? progress(today) : null;
  const finished = !!stats?.finished;

  // Show the end screen a beat after the last card is cleared.
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(() => setShowDone(true), 700);
    return () => clearTimeout(id);
  }, [finished]);

  const advanceFrom = useCallback(
    (i: number) => setTimeout(() => scrollToIndex(i + 1), 220),
    [scrollToIndex],
  );

  useFocusEffect(
    useCallback(() => {
      const id = takeAdvance();
      if (!id || !today) return;
      const i = today.cards.findIndex((c) => c.id === id);
      if (i >= 0 && today.cards[i].status !== 'open') advanceFrom(i);
    }, [today, advanceFrom]),
  );

  if (!ready || !today) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const newsLeft = today.cards.filter((c) => c.kind === 'news' && c.status === 'open').length;
  const remaining = today.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.status === 'open');

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <FeedHeader feed={today} current={current} />
      <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setPageH(Math.round(e.nativeEvent.layout.height))}>
        {pageH > 0 && (
          <Animated.ScrollView
            ref={ref}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            decelerationRate="fast"
            overScrollMode="never"
            bounces={false}
          >
            {today.cards.map((card, i) => (
              <FeedCard
                key={card.id}
                card={card}
                index={i}
                pageH={pageH}
                scrollY={scrollY}
                newsLeft={newsLeft}
                showHint={i === 0 && !scrolled}
                onOpen={() => {
                  opened(card.id);
                  router.push({ pathname: '/card/[id]', params: { id: card.id } });
                }}
                onDone={() => {
                  mark(card.id, 'done');
                  advanceFrom(i);
                }}
                onSkip={() => {
                  mark(card.id, 'skip');
                  advanceFrom(i);
                }}
                onUndo={() => {
                  undo(card.id);
                  setShowDone(false);
                  setLookBack(false);
                }}
                onClearNews={() => {
                  clearNews();
                  const firstOther = today.cards.findIndex((c) => c.kind !== 'news');
                  if (firstOther >= 0) setTimeout(() => scrollToIndex(firstOther), 220);
                }}
              />
            ))}

            <View style={{ height: pageH, zIndex: 200, backgroundColor: t.bg, paddingVertical: 40, paddingHorizontal: 32, justifyContent: 'center', gap: 18 }}>
              <Serif size={40}>{finished ? 'All clear.' : 'Almost there.'}</Serif>
              <T size={16} color={t.muted} style={{ lineHeight: 24 }}>
                {finished
                  ? 'Every card is done or skipped.'
                  : `${remaining.length === 1 ? '1 card is' : `${remaining.length} cards are`} still open. The day ends when every card is done or skipped.`}
              </T>
              <View style={{ gap: 8 }}>
                {remaining.slice(0, 6).map(({ c, i }) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    onPress={() => scrollToIndex(i)}
                    style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine }}
                  >
                    <Dot color={accent(c.kind, mode).color} />
                    <T size={14} numberOfLines={1} style={{ flex: 1 }}>
                      {c.title}
                    </T>
                    <Icon name="up" size={16} color={t.text} stroke={1.9} />
                  </Pressable>
                ))}
                {remaining.length > 6 && (
                  <T size={13} color={t.faint}>
                    and {remaining.length - 6} more
                  </T>
                )}
              </View>
            </View>
          </Animated.ScrollView>
        )}
      </View>
      {finished && showDone && !lookBack && <DoneOverlay feed={today} onLookBack={() => setLookBack(true)} />}
    </View>
  );
}

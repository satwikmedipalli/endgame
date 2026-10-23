import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SyllabusPanel, useCourses } from '@/components/Syllabus';
import { TastePanels } from '@/components/Taste';
import { Dot, Serif, T } from '@/components/ui';
import { dayKey, prevDay, progress, streak } from '@/lib/feed';
import type { CardKind } from '@/lib/types';
import { useFeed } from '@/store/FeedStore';
import { useTheme } from '@/theme/ThemeProvider';
import { accent, KIND_LABEL } from '@/theme/tokens';

const COURSES: CardKind[] = ['code', 'stocks', 'chess', 'italian', 'history', 'watch', 'news'];

export default function Progress() {
  const { t, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { feeds } = useFeed();
  const courses = useCourses();
  const today = dayKey(new Date());
  const todayFeed = feeds[today];
  const p = todayFeed ? progress(todayFeed) : null;

  const last14: string[] = [];
  for (let d = today, i = 0; i < 14; i++, d = prevDay(d)) last14.unshift(d);

  // Lifetime done counts per course, across every stored day.
  const doneBy = new Map<CardKind, number>();
  for (const f of Object.values(feeds)) for (const c of f.cards) if (c.status === 'done') doneBy.set(c.kind, (doneBy.get(c.kind) ?? 0) + 1);

  const panel = { padding: 18, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine, gap: 14 } as const;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <ScreenHeader title="Progress" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={[panel, { flex: 1 }]}>
            <T size={13} color={t.muted}>
              Today
            </T>
            <Serif size={40}>
              {p ? `${p.cleared} / ${p.total}` : '—'}
            </Serif>
            <T size={13} color={t.muted}>
              {p ? `${p.done} done · ${p.skipped} skipped` : 'Not built yet'}
            </T>
          </View>
          <View style={[panel, { flex: 1 }]}>
            <T size={13} color={t.muted}>
              Streak
            </T>
            <Serif size={40}>{streak(feeds, today)}</Serif>
            <T size={13} color={t.muted}>
              finished days in a row
            </T>
          </View>
        </View>

        <View style={panel}>
          <T w={500} size={15}>
            Last 14 days
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 }}>
            {last14.map((d) => {
              const f = feeds[d];
              const pr = f ? progress(f) : null;
              const h = pr && pr.total ? Math.max(4, (pr.done / pr.total) * 90) : 4;
              return (
                <View
                  key={d}
                  accessibilityLabel={pr ? `${d}: ${pr.done} of ${pr.total} done` : `${d}: no feed`}
                  style={{ flex: 1, height: h, borderRadius: 3, backgroundColor: pr?.finished ? t.sqDone : pr ? t.sqSkip : t.sqIdle }}
                />
              );
            })}
          </View>
          <T size={12} color={t.faint}>
            Bar height is the share of cards marked DONE. Solid bars are finished days.
          </T>
        </View>

        {courses?.map((c) => <SyllabusPanel key={c.course} course={c} />)}
        <TastePanels />

        <View style={panel}>
          <T w={500} size={15}>
            Courses
          </T>
          {COURSES.map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Dot color={accent(k, mode).color} size={8} />
              <T size={15} style={{ flex: 1 }}>
                {KIND_LABEL[k]}
              </T>
              <T size={14} color={t.muted} style={{ fontVariant: ['tabular-nums'] }}>
                {doneBy.get(k) ?? 0} done
              </T>
            </View>
          ))}
          <T size={12} color={t.faint}>
            {courses?.length ? 'Chess and Italian progress arrive with their milestones.' : 'Syllabi appear here after your Mac\'s first Sync.'}
          </T>
        </View>
      </ScrollView>
    </View>
  );
}

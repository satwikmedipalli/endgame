import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { HOME } from '@/lib/sun';
import type { DayFeed } from '@/lib/types';
import { progress } from '@/lib/feed';
import { useTheme } from '@/theme/ThemeProvider';
import { accent } from '@/theme/tokens';
import { Icon } from './Icon';
import { Serif, T } from './ui';

export const HEADER_H = 120;

function IconButton({ label, onPress, children }: { label: string; onPress?: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 40, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
      {children}
    </Pressable>
  );
}

export function FeedHeader({ feed, current }: { feed: DayFeed; current: number }) {
  const { t, mode, pref, label, cyclePref } = useTheme();
  const { cleared, total } = progress(feed);
  let date = '';
  try {
    date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: HOME.tz });
  } catch {}
  const gap = total > 24 ? 2 : 4;

  return (
    <View style={{ height: HEADER_H, paddingTop: 14, paddingLeft: 16, paddingRight: 10, gap: 8, zIndex: 300 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Serif italic size={28}>
          Endgame
        </Serif>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T w={500} size={13} color={t.muted} style={{ marginRight: 4 }}>
            {date}
          </T>
          <Link href="/progress" asChild>
            <IconButton label="Progress">
              <Icon name="chart" size={18} color={t.muted} />
            </IconButton>
          </Link>
          <Link href="/settings" asChild>
            <IconButton label="Settings">
              <Icon name="sliders" size={18} color={t.muted} />
            </IconButton>
          </Link>
          <IconButton label={`Theme: ${pref}. Tap to change`} onPress={cyclePref}>
            <Icon name={pref === 'auto' ? 'auto' : pref === 'light' ? 'sun' : 'moon'} size={18} color={t.muted} />
          </IconButton>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap }} aria-hidden>
          {feed.cards.map((c, i) => {
            const isCur = i === current && c.status === 'open';
            return (
              <View
                key={c.id}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 2,
                  backgroundColor: c.status === 'done' ? t.sqDone : c.status === 'skip' ? 'transparent' : isCur ? t.sqCur : t.sqIdle,
                  borderWidth: c.status === 'skip' || isCur ? 1 : 0,
                  borderColor: c.status === 'skip' ? t.sqSkip : accent(c.kind, mode).color,
                }}
              />
            );
          })}
        </View>
        <T w={500} size={13} color={t.muted} style={{ fontVariant: ['tabular-nums'] }}>
          {cleared} / {total} cleared
        </T>
      </View>
      <T size={11} color={t.faint}>
        {label}
      </T>
    </View>
  );
}

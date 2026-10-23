import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { supabase } from '@/lib/supabase';
import type { WatchState } from '@/lib/types';
import { useFeed } from '@/store/FeedStore';
import { useTheme } from '@/theme/ThemeProvider';
import { accent, KIND_LABEL } from '@/theme/tokens';
import { Dot, T } from './ui';

type Row = { id: string; day: string; status: string; content: { title: string; tag: string }; watch: WatchState | null };
type Covered = { title: string; tag: string; day: string };
type Rated = { title: string; tag: string; rating: number; comment?: string };

/** History you finished and titles you rated, read from every stored day on Supabase. */
export function useTaste() {
  const { userId } = useFeed();
  const [state, setState] = useState<{ history: Covered[]; ratings: Rated[] } | null>(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    supabase
      .from('cards')
      .select('id, day, status, content, watch')
      .in('kind', ['history', 'watch'])
      .order('day', { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as Row[];
        const history = new Map<string, Covered>();
        const titles = new Map<string, Row>();
        for (const r of rows) {
          if (r.id.startsWith('history-') && r.status === 'done' && !history.has(r.id)) history.set(r.id, { title: r.content.title, tag: r.content.tag, day: r.day });
          if (!r.id.endsWith('-followup') && !titles.has(r.id)) titles.set(r.id, r);
        }
        const ratings: Rated[] = [];
        for (const r of rows) {
          if (!r.id.endsWith('-followup') || !r.watch?.rating) continue;
          const base = titles.get(r.id.replace(/-followup$/, ''));
          ratings.push({ title: base?.content.title ?? r.content.title, tag: r.content.tag, rating: r.watch.rating, comment: r.watch.comment });
        }
        setState({ history: [...history.values()], ratings });
      });
  }, [userId]);
  return state;
}

export function TastePanels() {
  const { t, mode } = useTheme();
  const taste = useTaste();
  if (!taste) return null;
  const panel = { padding: 18, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine, gap: 12 } as const;
  const head = (kind: 'history' | 'watch', label: string, count: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Dot color={accent(kind, mode).color} size={8} />
      <T w={500} size={15} style={{ flex: 1 }}>
        {label}
      </T>
      <T size={14} color={t.muted} style={{ fontVariant: ['tabular-nums'] }}>
        {count}
      </T>
    </View>
  );

  return (
    <>
      <View style={panel}>
        {head('history', 'History covered', `${taste.history.length}`)}
        {taste.history.length === 0 && (
          <T size={13} color={t.faint}>
            Stories you finish show up here. None will ever repeat.
          </T>
        )}
        {taste.history.slice(0, 30).map((h) => (
          <View key={h.title} style={{ gap: 2 }}>
            <T size={14}>{h.title}</T>
            <T size={12} color={t.faint}>
              {h.tag}
            </T>
          </View>
        ))}
      </View>

      <View style={panel}>
        {head('watch', `${KIND_LABEL.watch} ratings`, `${taste.ratings.length}`)}
        {taste.ratings.length === 0 && (
          <T size={13} color={t.faint}>
            Say yes to a pitch and you get a “Did you watch it?” card the next day. Ratings teach the picks your taste.
          </T>
        )}
        {taste.ratings.map((r) => (
          <View key={r.title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T size={14}>{r.title}</T>
              <T size={12} color={t.faint}>
                {r.tag}
                {r.comment ? ` · “${r.comment}”` : ''}
              </T>
            </View>
            <T w={600} size={15} color={accent('watch', mode).color} style={{ fontVariant: ['tabular-nums'] }}>
              {r.rating}/10
            </T>
          </View>
        ))}
      </View>
    </>
  );
}

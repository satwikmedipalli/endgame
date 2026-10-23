import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { pointerOf, type Course } from '@/lib/course';
import { dayKey } from '@/lib/feed';
import { supabase } from '@/lib/supabase';
import { useFeed } from '@/store/FeedStore';
import { useTheme } from '@/theme/ThemeProvider';
import { accent, KIND_LABEL } from '@/theme/tokens';
import { Dot, T } from './ui';

const ORDER = ['code', 'stocks', 'chess', 'italian'];

/** Stored syllabi, read straight from Supabase (the Mac writes them). */
export function useCourses() {
  const { userId } = useFeed();
  const [courses, setCourses] = useState<Course[] | null>(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    supabase
      .from('courses')
      .select('course, syllabus, summary')
      .in('course', ORDER)
      .then(({ data }) => setCourses(((data ?? []) as Course[]).filter((c) => c.syllabus?.length).sort((a, b) => ORDER.indexOf(a.course) - ORDER.indexOf(b.course))));
  }, [userId]);
  return courses;
}

/** Your Italian deck: words kept and how many are due today. */
function useVocab(on: boolean) {
  const [v, setV] = useState<{ words: number; due: number } | null>(null);
  useEffect(() => {
    const sb = supabase;
    if (!on || !sb) return;
    const count = (due?: string) => {
      const q = sb.from('vocab').select('id', { count: 'exact', head: true }).eq('lang', 'it');
      return due ? q.lte('due', due) : q;
    };
    Promise.all([count(), count(dayKey(new Date()))]).then(([all, due]) => setV({ words: all.count ?? 0, due: due.count ?? 0 }));
  }, [on]);
  return v;
}

export function SyllabusPanel({ course }: { course: Course }) {
  const { t, mode } = useTheme();
  const a = accent(course.course, mode);
  const [all, setAll] = useState(false);
  const here = pointerOf(course.syllabus);
  const total = course.syllabus.length;
  const unit = course.syllabus[Math.min(here, total - 1)]?.unit;
  const shown = all ? course.syllabus : course.syllabus.filter((tp) => tp.unit === unit);
  const notes = course.summary.split('\n').filter(Boolean).slice(-3);
  const vocab = useVocab(course.course === 'italian');

  return (
    <View style={{ padding: 18, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Dot color={a.color} size={8} />
        <T w={500} size={15} style={{ flex: 1 }}>
          {KIND_LABEL[course.course]}
        </T>
        <T size={14} color={t.muted} style={{ fontVariant: ['tabular-nums'] }}>
          {here >= total ? 'Finished' : `Lesson ${here + 1} of ${total}`}
        </T>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: t.sqIdle }}>
        <View style={{ width: `${(here / total) * 100}%`, height: 4, borderRadius: 2, backgroundColor: a.color }} />
      </View>
      {vocab && (
        <T size={14} color={t.body}>
          Level {unit} · {vocab.words} {vocab.words === 1 ? 'word' : 'words'} in your deck · {vocab.due} due today
        </T>
      )}

      <View style={{ gap: 2 }}>
        {shown.map((tp, i) => {
          const first = i === 0 || shown[i - 1].unit !== tp.unit;
          const isHere = course.syllabus[here]?.id === tp.id;
          return (
            <View key={tp.id}>
              {first && (
                <T w={600} size={13} color={a.color} style={{ marginTop: i ? 14 : 0, marginBottom: 6 }}>
                  {tp.unit}
                </T>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
                <T size={13} color={tp.doneAt ? a.color : t.faint} style={{ width: 16 }}>
                  {tp.doneAt ? '✓' : isHere ? '→' : '·'}
                </T>
                <T size={14} color={tp.doneAt ? t.muted : isHere ? t.text : t.body} w={isHere ? 600 : 400} style={{ flex: 1 }}>
                  {tp.title}
                </T>
                {isHere && (
                  <T size={12} color={a.color}>
                    You are here
                  </T>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <Pressable accessibilityRole="button" onPress={() => setAll((v) => !v)} style={{ paddingVertical: 4 }}>
        <T size={13} color={a.color}>
          {all ? 'Show the current unit only' : `Show the full syllabus (${total} lessons)`}
        </T>
      </Pressable>

      {notes.length > 0 && (
        <View style={{ gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.cardLine }}>
          <T w={500} size={13} color={t.muted}>
            Latest course notes
          </T>
          {notes.map((n, i) => (
            <T key={i} size={13} color={t.body} style={{ lineHeight: 19 }}>
              {n}
            </T>
          ))}
        </View>
      )}
    </View>
  );
}

import { useEffect, useState } from 'react';

import { pointerOf, type Course } from '@shared/course';
import { dayKey, prevDay, progress, streak } from '@shared/feed';
import type { CardKind, WatchState } from '@shared/types';
import { supabase } from '../lib';
import { useFeed } from '../store/Feed';
import { KIND_LABEL } from '../theme';

const ORDER = ['code', 'stocks', 'chess', 'italian'];
const KINDS: CardKind[] = ['code', 'stocks', 'chess', 'italian', 'history', 'watch', 'puzzle', 'news'];

/** Stored syllabi, read straight from Supabase (the helper writes them). */
function useCourses() {
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

function SyllabusPanel({ course }: { course: Course }) {
  const [all, setAll] = useState(false);
  const here = pointerOf(course.syllabus);
  const total = course.syllabus.length;
  const unit = course.syllabus[Math.min(here, total - 1)]?.unit;
  const shown = all ? course.syllabus : course.syllabus.filter((tp) => tp.unit === unit);
  const notes = course.summary.split('\n').filter(Boolean).slice(-3);
  const vocab = useVocab(course.course === 'italian');
  return (
    <section className="panel">
      <div className="row between">
        <h3 className="panel-title">{KIND_LABEL[course.course]}</h3>
        <span className="muted tabular">{here >= total ? 'Finished' : `Lesson ${here + 1} of ${total}`}</span>
      </div>
      <div className="meter">
        <span style={{ width: `${(here / total) * 100}%` }} />
      </div>
      {vocab && (
        <p className="small">
          Level {unit} · {vocab.words} {vocab.words === 1 ? 'word' : 'words'} in your deck · {vocab.due} due today
        </p>
      )}
      <ol className="syllabus">
        {shown.map((tp, i) => {
          const first = i === 0 || shown[i - 1].unit !== tp.unit;
          const isHere = course.syllabus[here]?.id === tp.id;
          return (
            <li key={tp.id}>
              {first && <h4>{tp.unit}</h4>}
              <span className={`topic${tp.doneAt ? ' done' : ''}${isHere ? ' here' : ''}`}>
                <span className="mark">{tp.doneAt ? '✓' : isHere ? '→' : '·'}</span>
                {tp.title}
                {isHere && <em>You are here</em>}
              </span>
            </li>
          );
        })}
      </ol>
      <button type="button" className="link" onClick={() => setAll((v) => !v)}>
        {all ? 'Show the current unit only' : `Show the full syllabus (${total} lessons)`}
      </button>
      {notes.length > 0 && (
        <div className="notes">
          <h4>Latest course notes</h4>
          {notes.map((n, i) => (
            <p key={i} className="small">
              {n}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

type Row = { id: string; day: string; status: string; content: { title: string; tag: string }; watch: WatchState | null };

function Taste() {
  const { userId } = useFeed();
  const [state, setState] = useState<{ history: { title: string; tag: string }[]; ratings: { title: string; tag: string; rating: number; comment?: string }[] } | null>(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    supabase
      .from('cards')
      .select('id, day, status, content, watch')
      .in('kind', ['history', 'watch'])
      .order('day', { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as Row[];
        const history = new Map<string, { title: string; tag: string }>();
        const titles = new Map<string, Row>();
        for (const r of rows) {
          if (r.id.startsWith('history-') && r.status === 'done' && !history.has(r.id)) history.set(r.id, { title: r.content.title, tag: r.content.tag });
          if (!r.id.endsWith('-followup') && !titles.has(r.id)) titles.set(r.id, r);
        }
        const ratings = rows
          .filter((r) => r.id.endsWith('-followup') && r.watch?.rating)
          .map((r) => ({ title: titles.get(r.id.replace(/-followup$/, ''))?.content.title ?? r.content.title, tag: r.content.tag, rating: r.watch!.rating!, comment: r.watch!.comment }));
        setState({ history: [...history.values()], ratings });
      });
  }, [userId]);
  if (!state) return null;
  return (
    <div className="panel-pair">
      <section className="panel">
        <div className="row between">
          <h3 className="panel-title">History covered</h3>
          <span className="muted tabular">{state.history.length}</span>
        </div>
        {state.history.length === 0 && <p className="faint small">Stories you finish show up here. None will ever repeat.</p>}
        {state.history.slice(0, 30).map((h) => (
          <p key={h.title} className="small">
            {h.title} <span className="faint">· {h.tag}</span>
          </p>
        ))}
      </section>
      <section className="panel">
        <div className="row between">
          <h3 className="panel-title">Watch ratings</h3>
          <span className="muted tabular">{state.ratings.length}</span>
        </div>
        {state.ratings.length === 0 && <p className="faint small">Say yes to a pitch and you get a “Did you watch it?” card the next day. Ratings teach the picks your taste.</p>}
        {state.ratings.map((r) => (
          <p key={r.title} className="small row between">
            <span>
              {r.title} <span className="faint">· {r.tag}{r.comment ? ` · “${r.comment}”` : ''}</span>
            </span>
            <b className="tabular">{r.rating}/10</b>
          </p>
        ))}
      </section>
    </div>
  );
}

export function Progress() {
  const { feeds } = useFeed();
  const courses = useCourses();
  const today = dayKey(new Date());
  const p = feeds[today] ? progress(feeds[today]) : null;
  const last14: string[] = [];
  for (let d = today, i = 0; i < 14; i++, d = prevDay(d)) last14.unshift(d);
  const doneBy = new Map<CardKind, number>();
  for (const f of Object.values(feeds)) for (const c of f.cards) if (c.status === 'done') doneBy.set(c.kind, (doneBy.get(c.kind) ?? 0) + 1);

  return (
    <div className="stack">
      <h1 className="sheet-title">Progress</h1>
      <div className="panel-pair">
        <section className="panel">
          <span className="muted small">Today</span>
          <span className="figure">{p ? `${p.cleared} / ${p.total}` : '—'}</span>
          <span className="muted small">{p ? `${p.done} done · ${p.skipped} skipped` : 'Not built yet'}</span>
        </section>
        <section className="panel">
          <span className="muted small">Streak</span>
          <span className="figure">{streak(feeds, today)}</span>
          <span className="muted small">finished days in a row</span>
        </section>
      </div>
      <section className="panel">
        <h3 className="panel-title">Last 14 days</h3>
        <div className="bars">
          {last14.map((d) => {
            const f = feeds[d];
            const pr = f ? progress(f) : null;
            const h = pr && pr.total ? Math.max(4, (pr.done / pr.total) * 90) : 4;
            return <span key={d} title={pr ? `${d}: ${pr.done} of ${pr.total} done` : `${d}: no paper`} className={pr?.finished ? 'full' : pr ? 'part' : ''} style={{ height: h }} />;
          })}
        </div>
        <p className="faint small">Bar height is the share of cards marked DONE. Solid bars are finished days.</p>
      </section>
      {courses?.map((c) => <SyllabusPanel key={c.course} course={c} />)}
      <Taste />
      <section className="panel">
        <h3 className="panel-title">All time</h3>
        {KINDS.map((k) => (
          <p key={k} className="row between small">
            <span>{KIND_LABEL[k]}</span>
            <span className="muted tabular">{doneBy.get(k) ?? 0} done</span>
          </p>
        ))}
      </section>
    </div>
  );
}

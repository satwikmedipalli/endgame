// Spaced repetition: SM-2 with four answers (Again / Hard / Good / Easy), as in Anki.
// Shared by the app (which records your answers) and the Mac (which schedules words).

export type Grade = 1 | 2 | 3 | 4;
export const GRADES: { grade: Grade; label: string }[] = [
  { grade: 1, label: 'Again' },
  { grade: 2, label: 'Hard' },
  { grade: 3, label: 'Good' },
  { grade: 4, label: 'Easy' },
];

export interface WordState {
  ease: number;
  /** Days until the next review. */
  interval: number;
  /** Successful reviews in a row. */
  reps: number;
  lapses: number;
  /** YYYY-MM-DD */
  due: string;
}

export const MIN_EASE = 1.3;
export const NEW_WORD: Omit<WordState, 'due'> = { ease: 2.5, interval: 0, reps: 0, lapses: 0 };

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The next state after answering on `day`. Pure. */
export function review(s: WordState, grade: Grade, day: string): WordState {
  let { ease, interval, reps, lapses } = s;
  if (grade === 1) {
    // Forgot: start over tomorrow, and the word gets a little harder for good.
    lapses++;
    reps = 0;
    interval = 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else {
    if (grade === 2) {
      interval = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
      ease = Math.max(MIN_EASE, ease - 0.15);
    } else if (grade === 3) {
      interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
    } else {
      interval = reps === 0 ? 3 : reps === 1 ? 6 : Math.round(interval * ease * 1.3);
      ease += 0.15;
    }
    reps++;
  }
  return { ease: Math.round(ease * 100) / 100, interval, reps, lapses, due: addDays(day, interval) };
}

/** Id for a word: its Italian, lowercased, accents kept. */
export const wordId = (it: string) =>
  it
    .toLowerCase()
    .replace(/[.,!?¿¡;:"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

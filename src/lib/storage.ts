import { TEST_MODE, dayNumber } from "./puzzles";

export interface PuzzleResult {
  /** Country ids guessed, in order (country puzzles). */
  guesses: string[];
  /** Pin location as [lng, lat] (pin puzzle). */
  pin?: [number, number];
  distanceKm?: number;
  solved: boolean;
  done: boolean;
  points: number;
}

/** One day's progress. Each game is independent; a finished game stays finished until the day changes. */
export interface DayState {
  day: string;
  results: PuzzleResult[];
  /** Test mode only: how many times each game has been replayed today (picks a fresh puzzle). */
  rounds: number[];
}

const PREFIX = "atlas-daily:v1:";

export const emptyResult = (): PuzzleResult => ({ guesses: [], solved: false, done: false, points: 0 });

export function loadDay(day: string, puzzleCount: number): DayState {
  const fresh = (): DayState => ({
    day,
    results: Array.from({ length: puzzleCount }, emptyResult),
    rounds: Array(puzzleCount).fill(0),
  });
  try {
    const raw = localStorage.getItem(PREFIX + day);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DayState>;
      if (parsed.results?.length === puzzleCount) {
        const rounds = parsed.rounds?.length === puzzleCount && TEST_MODE ? parsed.rounds : fresh().rounds;
        return { day, results: parsed.results, rounds };
      }
    }
  } catch {
    // Storage may be unavailable (private mode); fall through to a fresh day.
  }
  return fresh();
}

/** Test mode: forgets everything played on a day, including replays. */
export function clearDay(day: string): void {
  try {
    localStorage.removeItem(PREFIX + day);
  } catch {
    // Nothing stored to clear.
  }
}

/** Test mode: clears one game and moves it on to a new puzzle. */
export function replayGame(s: DayState, i: number): DayState {
  return {
    ...s,
    results: s.results.map((r, j) => (j === i ? emptyResult() : r)),
    rounds: s.rounds.map((r, j) => (j === i ? r + 1 : r)),
  };
}

export function saveDay(state: DayState): void {
  try {
    localStorage.setItem(PREFIX + state.day, JSON.stringify(state));
  } catch {
    // Non-fatal: the game still works for this session.
  }
}

export interface Stats {
  played: number;
  average: number;
  best: number;
  streak: number;
}

/** Aggregates every day stored in this browser on which at least one game was finished. */
export function loadStats(today: string): Stats {
  const scores = new Map<number, number>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const state = JSON.parse(localStorage.getItem(key) ?? "null") as DayState | null;
      if (!state || !state.results.some((r) => r.done)) continue;
      scores.set(dayNumber(state.day), state.results.reduce((s, r) => s + r.points, 0));
    }
  } catch {
    // Ignore unreadable storage.
  }

  const values = [...scores.values()];
  let streak = 0;
  let n = dayNumber(today);
  if (!scores.has(n)) n -= 1; // today not finished yet doesn't break the streak
  while (scores.has(n)) {
    streak++;
    n--;
  }

  return {
    played: values.length,
    average: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
    best: values.length ? Math.max(...values) : 0,
    streak,
  };
}

import { COUNTRIES, COUNTRY_BY_ID, Country, centerOf, getCountry } from "./countries";
import { bearing, compass, distanceKm } from "./geo";
import { seededRandom, shuffled } from "./random";
import { PLACES, Place } from "@/data/places";
import { DEDUCTIONS } from "@/data/deductions";

export const LAUNCH_DATE = "2026-10-18";
export type PuzzleKind = "shape" | "neighbors" | "pin" | "deduction";
type CountryKind = Exclude<PuzzleKind, "pin">;

/** Points for a correct answer on the 1st, 2nd, … guess. Its length is the number of guesses. */
export const ATTEMPT_POINTS: Record<CountryKind, readonly number[]> = {
  shape: [100, 60, 30],
  neighbors: [100, 60, 30],
  // One clue at the start, and one more revealed after each wrong guess.
  deduction: [100, 80, 60, 40, 20],
};

export interface Clue {
  text: string;
  test: (c: Country) => boolean;
  /** "Borders X, which lies to its …" — strong, so at most one per puzzle. */
  directional?: boolean;
}

export type Puzzle =
  | { kind: "shape"; answer: string }
  | { kind: "neighbors"; answer: string; clues: Clue[] }
  | { kind: "pin"; place: Place }
  | { kind: "deduction"; answer: string; clues: string[] };

export const PUZZLE_INFO: Record<PuzzleKind, { title: string; icon: string; skill: string }> = {
  shape: { title: "Find the Shape", icon: "🗺️", skill: "Country outlines" },
  neighbors: { title: "The Neighbors", icon: "🧭", skill: "Spatial reasoning" },
  pin: { title: "Where Do You Stand?", icon: "📍", skill: "Placing cities" },
  deduction: { title: "The Final Deduction", icon: "🔍", skill: "One clue at a time" },
};

// ---------------------------------------------------------------- dates

/** The current puzzle day, in UTC, so every player worldwide gets the same set. */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isDayKey(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function dayNumber(key: string): number {
  return Math.round((Date.parse(key) - Date.parse(LAUNCH_DATE)) / 86_400_000) + 1;
}

// ---------------------------------------------------------------- pools

/** Countries that are a fair guess: sovereign and big enough to see and click. */
const playable = (minArea: number) => COUNTRIES.filter((c) => c.independent && c.area >= minArea);

const SHAPE_POOL = playable(30_000).map((c) => c.id);
const NEIGHBOR_POOL = playable(20_000)
  .filter((c) => c.borders.length >= 2)
  .map((c) => c.id);
const UNIVERSE = COUNTRIES.filter((c) => c.independent);

/**
 * Walks a fixed shuffled order of the pool, one step per day, so answers don't repeat
 * until the pool is exhausted. Skips anything rejected (e.g. already used today).
 */
function pickForDay<T>(pool: readonly T[], seed: string, day: number, accept: (item: T) => boolean): T {
  const order = shuffled(pool, seededRandom(seed));
  const start = (((day - 1) % order.length) + order.length) % order.length;
  for (let i = 0; i < order.length; i++) {
    const item = order[(start + i) % order.length];
    if (accept(item)) return item;
  }
  throw new Error(`No acceptable item for ${seed}`);
}

// ---------------------------------------------------------------- neighbor clues

const regionLabel = (r: string) => (r === "Americas" ? "the Americas" : r);
const isLandlocked = (id: string) => COUNTRY_BY_ID.get(id)?.landlocked ?? false;

function candidateClues(t: Country, rand: () => number): { required: Clue[]; optional: Clue[] } {
  const required: Clue[] = [
    t.landlocked
      ? { text: "It is landlocked.", test: (c) => c.landlocked }
      : { text: "It has a coastline.", test: (c) => !c.landlocked },
  ];

  const optional: Clue[] = [];
  if (t.borders.some(isLandlocked)) {
    optional.push({ text: "It borders a landlocked country.", test: (c) => c.borders.some(isLandlocked) });
  } else {
    optional.push({
      text: "None of its neighbours is landlocked.",
      test: (c) => c.borders.length > 0 && !c.borders.some(isLandlocked),
    });
  }

  optional.push({ text: `It is in ${regionLabel(t.region)}.`, test: (c) => c.region === t.region });
  if (t.subregion !== t.region) {
    optional.push({ text: `It is in ${t.subregion}.`, test: (c) => c.subregion === t.subregion });
  }

  const n = t.borders.length;
  optional.push({
    text: n === 1 ? "It borders exactly one country." : `It borders exactly ${n} countries.`,
    test: (c) => c.borders.length === n,
  });

  if (Math.abs(t.lat) >= 3) {
    const north = t.lat > 0;
    optional.push({
      text: `Its centre lies ${north ? "north" : "south"} of the Equator.`,
      test: (c) => (north ? c.lat > 0 : c.lat < 0),
    });
  }

  if (t.area >= 1_000_000) {
    optional.push({ text: "It covers more than 1 million km².", test: (c) => c.area >= 1_000_000 });
  } else if (t.area < 100_000) {
    optional.push({ text: "It covers less than 100,000 km².", test: (c) => c.area < 100_000 });
  } else {
    optional.push({
      text: "It covers between 100,000 and 1 million km².",
      test: (c) => c.area >= 100_000 && c.area < 1_000_000,
    });
  }

  // "It borders X, which lies to its south" — a directional relationship with one neighbour.
  for (const nb of shuffled(t.borders, rand).slice(0, 3)) {
    const other = getCountry(nb);
    const dir = compass(bearing(centerOf(t), centerOf(other))).label;
    optional.push({
      text: `It borders ${other.name}, which lies to its ${DIRECTION_WORDS[dir]}.`,
      test: (c) => c.borders.includes(nb) && compass(bearing(centerOf(c), centerOf(other))).label === dir,
      directional: true,
    });
  }

  return { required, optional: shuffled(optional, rand) };
}

const DIRECTION_WORDS: Record<string, string> = {
  N: "north", NE: "northeast", E: "east", SE: "southeast",
  S: "south", SW: "southwest", W: "west", NW: "northwest",
};

/**
 * Greedily adds clues until only the target satisfies all of them. The first clues narrow
 * the field without giving it away (at least 3 candidates must survive them), so a typical
 * puzzle has four clues that only pin down the answer when combined.
 */
function buildNeighborClues(t: Country, rand: () => number): Clue[] | null {
  const { required, optional } = candidateClues(t, rand);
  const clues = [...required];
  let remaining = UNIVERSE.filter((c) => clues.every((cl) => cl.test(c)));
  let pool = [...optional];

  while (remaining.length > 1 && pool.length > 0 && clues.length < 6) {
    const scored = pool.map((cl) => ({ cl, left: remaining.filter(cl.test).length }));
    const useful = scored.filter((s) => s.left < remaining.length);
    if (useful.length === 0) break;
    const broad = clues.length < 3 ? useful.filter((s) => s.left >= 3 && !s.cl.directional) : [];
    const choices = broad.length ? broad : useful;
    const best = choices.reduce((a, b) => (b.left < a.left ? b : a));
    clues.push(best.cl);
    remaining = remaining.filter(best.cl.test);
    pool = pool.filter((cl) => cl !== best.cl && !(best.cl.directional && cl.directional));
  }

  if (remaining.length !== 1 || remaining[0].id !== t.id || clues.length < 3) return null;
  return clues;
}

// ---------------------------------------------------------------- daily set

/** Games in display order; a DayState's `results` and `rounds` follow the same order. */
export const PUZZLE_COUNT = 4;

/** True when .env sets TEST_MODE=true: finished games can be replayed straight away. */
export const TEST_MODE = process.env.TEST_MODE === "true";

/**
 * Builds the set for a day. `rounds` (test mode only) advances an individual game to a
 * later puzzle in its sequence, so a finished game can be replayed with a fresh one.
 */
export function dailyPuzzles(key: string, rounds: readonly number[] = [0, 0, 0, 0]): Puzzle[] {
  const day = dayNumber(key);
  const [shapeDay, neighborDay, pinDay, deductionDay] = rounds.map((r) => day + r);
  const used = new Set<string>();

  const shapeAnswer = pickForDay(SHAPE_POOL, "shape", shapeDay, () => true);
  used.add(shapeAnswer);

  const deduction = pickForDay(DEDUCTIONS, "deduction", deductionDay, (d) => !used.has(d.answer));
  used.add(deduction.answer);

  let neighborClues: Clue[] = [];
  const neighborAnswer = pickForDay(NEIGHBOR_POOL, "neighbors", neighborDay, (id) => {
    if (used.has(id)) return false;
    const clues = buildNeighborClues(getCountry(id), seededRandom(`${key}:${id}`));
    if (!clues) return false;
    neighborClues = clues;
    return true;
  });

  used.add(neighborAnswer);
  // Keep the pin away from today's country answers so one puzzle doesn't give away another.
  const place = pickForDay(PLACES, "pin", pinDay, (p) =>
    [...used].every((id) => distanceKm([p.lng, p.lat], centerOf(getCountry(id))) > 1500),
  );
  return [
    { kind: "shape", answer: shapeAnswer },
    { kind: "neighbors", answer: neighborAnswer, clues: neighborClues },
    { kind: "pin", place },
    { kind: "deduction", answer: deduction.answer, clues: deduction.clues },
  ];
}

/** Points for the pin puzzle: 100 for a bullseye, decaying with distance. */
export function pinPoints(km: number): number {
  return Math.max(0, Math.round(100 * Math.exp(-km / 800)));
}

export const MAX_SCORE = 400;

/** Start of the next puzzle day (UTC midnight), when every game refreshes. */
export function nextResetMs(now = Date.now()): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

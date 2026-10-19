"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import WorldMap, { CountryFeature, CountryMark, MapMarker } from "./WorldMap";
import PuzzlePanel from "./PuzzlePanel";
import Hub from "./Hub";
import {
  ATTEMPT_POINTS, MAX_SCORE, PUZZLE_COUNT, PUZZLE_INFO, TEST_MODE,
  dailyPuzzles, dayNumber, isDayKey, nextResetMs, pinPoints, todayKey,
} from "@/lib/puzzles";
import { distanceKm } from "@/lib/geo";
import { COUNTRY_BY_ID } from "@/lib/countries";
import { DayState, clearDay, loadDay, replayGame, saveDay } from "@/lib/storage";

export default function Game() {
  const [features, setFeatures] = useState<CountryFeature[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [fixedDay, setFixedDay] = useState(false);
  const [state, setState] = useState<DayState | null>(null);
  /** The open game, or null for the hub. Games can be opened in any order. */
  const [open, setOpen] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPin, setPendingPin] = useState<[number, number] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // The day is resolved on the client: ?date=YYYY-MM-DD replays a past set, otherwise today (UTC).
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("date");
    setFixedDay(isDayKey(param));
    setDay(isDayKey(param) ? param : todayKey());
  }, []);

  // At the daily reset every game refreshes, even if the tab was left open.
  useEffect(() => {
    if (!day || fixedDay) return;
    const id = setTimeout(() => {
      setOpen(null);
      setDay(todayKey());
    }, Math.max(1000, nextResetMs() - Date.now() + 1000));
    return () => clearTimeout(id);
  }, [day, fixedDay]);

  useEffect(() => {
    fetch("/data/world.json")
      .then((r) => r.json())
      .then((topo: Topology<{ countries: GeometryCollection }>) => {
        const fc = feature(topo, topo.objects.countries);
        setFeatures(fc.features as unknown as CountryFeature[]);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (day) setState(loadDay(day, PUZZLE_COUNT));
  }, [day]);

  const rounds = state?.rounds;
  const puzzles = useMemo(() => (day && rounds ? dailyPuzzles(day, rounds) : []), [day, rounds]);

  const update = useCallback((fn: (s: DayState) => DayState) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveDay(next);
      return next;
    });
  }, []);

  /** Test mode: replay a finished game with a fresh puzzle instead of waiting for the reset. */
  const replay = (i: number) => {
    setSelected(null);
    setPendingPin(null);
    update((s) => replayGame(s, i));
  };

  /** Test mode: wipe today's progress so every game starts over with its original puzzle. */
  const clearProgress = () => {
    if (!day || !window.confirm("Clear today's progress? All four games will start over.")) return;
    clearDay(day);
    setSelected(null);
    setPendingPin(null);
    setOpen(null);
    setState(loadDay(day, PUZZLE_COUNT));
  };

  const go = (i: number | null) => {
    setSelected(null);
    setPendingPin(null);
    setOpen(i);
  };

  const index = open ?? -1;
  const puzzle = open !== null ? puzzles[open] : undefined;
  const result = open !== null ? state?.results[open] : undefined;

  const confirm = () => {
    if (!puzzle || !result || result.done) return;
    if (puzzle.kind === "pin") {
      if (!pendingPin) return;
      const km = distanceKm(pendingPin, [puzzle.place.lng, puzzle.place.lat]);
      const points = pinPoints(km);
      update((s) => withResult(s, index, { guesses: [], pin: pendingPin, distanceKm: km, solved: points >= 50, done: true, points }));
      setPendingPin(null);
      return;
    }
    if (!selected || result.guesses.includes(selected)) return;
    const table = ATTEMPT_POINTS[puzzle.kind];
    const guesses = [...result.guesses, selected];
    const solved = selected === puzzle.answer;
    const done = solved || guesses.length >= table.length;
    const points = solved ? table[guesses.length - 1] : 0;
    update((s) => withResult(s, index, { guesses, solved, done, points }));
    setSelected(null);
  };

  // ------------------------------------------------------------ map props for the open game

  const marks = useMemo(() => {
    const m: Record<string, CountryMark> = {};
    if (!puzzle || !result || puzzle.kind === "pin") return m;
    for (const g of result.guesses) m[g] = g === puzzle.answer ? "correct" : "wrong";
    if (result.done && !result.solved) m[puzzle.answer] = "answer";
    if (selected && !result.done) m[selected] = "selected";
    return m;
  }, [puzzle, result, selected]);

  const markers = useMemo<MapMarker[]>(() => {
    if (puzzle?.kind !== "pin" || !result) return [];
    const pin = result.pin ?? pendingPin;
    const out: MapMarker[] = pin ? [{ coord: pin, kind: "guess" }] : [];
    if (result.done) out.push({ coord: [puzzle.place.lng, puzzle.place.lat], kind: "answer" });
    return out;
  }, [puzzle, result, pendingPin]);

  const line = puzzle?.kind === "pin" && result?.done && result.pin
    ? ([result.pin, [puzzle.place.lng, puzzle.place.lat]] as [[number, number], [number, number]])
    : undefined;

  const focus = useMemo(() => {
    if (!puzzle || !result?.done) return null;
    if (puzzle.kind === "pin") return { points: [result.pin!, [puzzle.place.lng, puzzle.place.lat] as [number, number]] };
    return { ids: [puzzle.answer] };
  }, [puzzle, result]);

  const onCountryClick = useCallback(
    (id: string) => {
      if (!result || result.done || result.guesses.includes(id) || !COUNTRY_BY_ID.has(id)) return;
      setSelected((cur) => (cur === id ? null : id));
    },
    [result],
  );

  // ------------------------------------------------------------ render

  if (loadError) return <div className="loading">Couldn&apos;t load the map. Please refresh.</div>;
  if (!features || !day || !state) return <div className="loading">Unfolding the atlas…</div>;

  const total = state.results.reduce((s, r) => s + r.points, 0);
  const mapMode = puzzle && !result?.done ? (puzzle.kind === "pin" ? "pin" : "country") : "none";
  const nextUnplayed = puzzles.findIndex((_, i) => i !== open && !state.results[i].done);

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => go(null)} aria-label="All games">
          <span className="logo" aria-hidden>◍</span>
          <span>
            <span className="brand-title">Atlas Daily</span>
            <small>
              #{dayNumber(day)} · {formatDay(day)}
              {TEST_MODE && <span className="test-badge">Test mode</span>}
            </small>
          </span>
        </button>
        <nav className="progress" aria-label="Games">
          {puzzles.map((p, i) => {
            const r = state.results[i];
            const cls = [r.done ? (r.points >= 50 ? "good" : r.points > 0 ? "ok" : "bad") : "", i === open ? "current" : ""].join(" ");
            return (
              <button key={i} type="button" className={cls} title={PUZZLE_INFO[p.kind].title} onClick={() => go(i)}>
                {PUZZLE_INFO[p.kind].icon}
              </button>
            );
          })}
        </nav>
        <div className="score" aria-label="Score">
          {total}
          <small>/{MAX_SCORE}</small>
        </div>
      </header>

      <main className="layout">
        <aside className="side">
          {puzzle && result ? (
            <PuzzlePanel
              key={open}
              puzzle={puzzle}
              result={result}
              features={features}
              selected={selected}
              pendingPin={pendingPin}
              onConfirm={confirm}
              onBack={() => go(null)}
              onNext={nextUnplayed >= 0 ? () => go(nextUnplayed) : undefined}
              onReplay={TEST_MODE ? () => replay(open!) : undefined}
            />
          ) : (
            <Hub day={day} puzzles={puzzles} state={state} onOpen={go} onClear={TEST_MODE ? clearProgress : undefined} />
          )}
        </aside>

        <WorldMap
          features={features}
          mode={mapMode}
          marks={marks}
          markers={markers}
          line={line}
          focus={focus}
          onCountryClick={onCountryClick}
          onMapClick={setPendingPin}
        />
      </main>
    </div>
  );
}

function withResult(s: DayState, i: number, r: DayState["results"][number]): DayState {
  return { ...s, results: s.results.map((x, j) => (j === i ? r : x)) };
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

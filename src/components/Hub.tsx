"use client";

import { useEffect, useState } from "react";
import { MAX_SCORE, PUZZLE_INFO, Puzzle, TEST_MODE, dayNumber } from "@/lib/puzzles";
import { formatKm } from "@/lib/geo";
import { getCountry } from "@/lib/countries";
import { loadStats, type DayState, type Stats } from "@/lib/storage";
import Countdown from "./Countdown";

export function shareText(day: string, puzzles: Puzzle[], state: DayState, url: string): string {
  const total = state.results.reduce((s, r) => s + r.points, 0);
  const lines = puzzles.map((p, i) => {
    const r = state.results[i];
    const icon = PUZZLE_INFO[p.kind].icon;
    if (!r.done) return `${icon} —`;
    if (p.kind === "pin") {
      const sq = r.points >= 80 ? "🟩" : r.points >= 50 ? "🟨" : r.points >= 20 ? "🟧" : "🟥";
      return `${icon} ${sq} ${formatKm(r.distanceKm ?? 0)}`;
    }
    const wrong = r.guesses.filter((g) => g !== p.answer).length;
    return `${icon} ${"🟥".repeat(wrong)}${r.solved ? "🟩" : ""}`;
  });
  return [`Atlas Daily #${dayNumber(day)} 🌍 ${total}/${MAX_SCORE}`, ...lines, url].join("\n");
}

interface Props {
  day: string;
  puzzles: Puzzle[];
  state: DayState;
  onOpen: (index: number) => void;
  /** Test mode only: wipes today's progress. */
  onClear?: () => void;
}

export default function Hub({ day, puzzles, state, onOpen, onClear }: Props) {
  const total = state.results.reduce((s, r) => s + r.points, 0);
  const finished = state.results.filter((r) => r.done).length;
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setStats(loadStats(day)), [day, finished]);

  const share = async () => {
    const text = shareText(day, puzzles, state, window.location.origin);
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // User cancelled the share sheet or clipboard was blocked; nothing to do.
    }
  };

  return (
    <section className="panel hub">
      <div>
        <p className="tagline">Discover the world, one puzzle at a time.</p>
        <p className="fineprint">
          Four games, played on the map, in any order. Each one is the same for everyone today and refreshes at
          midnight UTC.
        </p>
      </div>

      <ul className="games">
        {puzzles.map((p, i) => {
          const r = state.results[i];
          const info = PUZZLE_INFO[p.kind];
          const started = r.guesses.length > 0;
          return (
            <li key={i}>
              <button type="button" className={`game-card${r.done ? " done" : ""}`} onClick={() => onOpen(i)}>
                <span className="game-icon" aria-hidden>{info.icon}</span>
                <span className="game-text">
                  <strong>{info.title}</strong>
                  <small>
                    {r.done ? (
                      <>
                        {answerLabel(p, r.distanceKm)} · {TEST_MODE ? "open to replay" : <Countdown prefix="new in" />}
                      </>
                    ) : (
                      info.skill
                    )}
                  </small>
                </span>
                <span className={`game-status${r.done ? (r.points >= 50 ? " good" : r.points > 0 ? " ok" : " bad") : ""}`}>
                  {r.done ? `${r.points}` : started ? "Continue" : "Play"}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <div className="game-card soon" aria-disabled>
            <span className="game-icon" aria-hidden>⛰️</span>
            <span className="game-text">
              <strong>Read the Terrain</strong>
              <small>Coming soon</small>
            </span>
          </div>
        </li>
      </ul>

      <div className="today">
        <div className="score-big">
          <span>{total}</span>
          <small>/ {MAX_SCORE}</small>
        </div>
        <p className="score-word">
          {finished === puzzles.length ? verdict(total) : `${finished} of ${puzzles.length} games played today`}
        </p>
      </div>

      {finished > 0 && (
        <button type="button" className="btn primary" onClick={share}>
          {copied ? "Copied to clipboard ✓" : "Share today's result"}
        </button>
      )}

      {stats && stats.played > 0 && (
        <dl className="stats">
          <div><dt>Played</dt><dd>{stats.played}</dd></div>
          <div><dt>Streak</dt><dd>{stats.streak}</dd></div>
          <div><dt>Average</dt><dd>{stats.average}</dd></div>
          <div><dt>Best</dt><dd>{stats.best}</dd></div>
        </dl>
      )}

      <p className="center-note">
        <Countdown />
      </p>

      {onClear && (
        <button type="button" className="btn test" onClick={onClear}>
          Clear today&apos;s progress (test mode)
        </button>
      )}
    </section>
  );
}

function answerLabel(p: Puzzle, km?: number): string {
  if (p.kind === "pin") return `${p.place.city} · ${formatKm(km ?? 0)}`;
  return getCountry(p.answer).name;
}

function verdict(score: number): string {
  if (score >= 360) return "Master cartographer.";
  if (score >= 280) return "Seasoned explorer.";
  if (score >= 180) return "Steady navigator.";
  if (score >= 80) return "Finding your bearings.";
  return "Every atlas starts with a blank page.";
}

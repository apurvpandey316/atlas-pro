"use client";

import { COUNTRY_BY_ID, centerOf, getCountry } from "@/lib/countries";
import { bearing, compass, distanceKm, formatKm, formatLat, formatLng } from "@/lib/geo";
import { ATTEMPT_POINTS, PUZZLE_INFO, Puzzle } from "@/lib/puzzles";
import type { PuzzleResult } from "@/lib/storage";
import ShapeSilhouette from "./ShapeSilhouette";
import Countdown from "./Countdown";
import type { CountryFeature } from "./WorldMap";

interface Props {
  puzzle: Puzzle;
  result: PuzzleResult;
  features: CountryFeature[];
  selected: string | null;
  pendingPin: [number, number] | null;
  onConfirm: () => void;
  onBack: () => void;
  /** Opens the next unplayed game, if there is one. */
  onNext?: () => void;
  /** Test mode only: replays this game with a fresh puzzle. */
  onReplay?: () => void;
}

export default function PuzzlePanel(props: Props) {
  const { puzzle, result, onBack } = props;
  const info = PUZZLE_INFO[puzzle.kind];

  return (
    <section className="panel puzzle" aria-live="polite">
      <button type="button" className="back" onClick={onBack}>
        ← All games
      </button>
      <header className="puzzle-head">
        <h2>
          <span aria-hidden>{info.icon}</span> {info.title}
        </h2>
        <span className="skill">{info.skill}</span>
      </header>

      {puzzle.kind === "shape" && <ShapeBody {...props} puzzle={puzzle} />}
      {puzzle.kind === "neighbors" && <NeighborsBody puzzle={puzzle} result={result} />}
      {puzzle.kind === "pin" && <PinBody puzzle={puzzle} />}
      {puzzle.kind === "deduction" && <DeductionBody puzzle={puzzle} result={result} />}

      {puzzle.kind === "pin" ? <PinFooter {...props} /> : <CountryFooter {...props} />}
    </section>
  );
}

// ---------------------------------------------------------------- bodies

function ShapeBody({ puzzle, result, features }: Props & { puzzle: Extract<Puzzle, { kind: "shape" }> }) {
  const feature = features.find((f) => f.id === puzzle.answer);
  const country = getCountry(puzzle.answer);
  const wrong = result.guesses.filter((g) => g !== puzzle.answer).length;
  const showNeighbors = wrong >= 1 || result.done;
  const neighbors = showNeighbors ? features.filter((f) => f.id && country.borders.includes(f.id)) : [];

  return (
    <>
      <p className="prompt">Which country has this outline? Find it on the map.</p>
      {feature && <ShapeSilhouette feature={feature} neighbors={neighbors} />}
      {!result.done && wrong >= 1 && (
        <p className="hint">
          Hint: {country.borders.length ? "its neighbours are now outlined." : "it has no land neighbours."}
          {wrong >= 2 && <> It lies in <strong>{country.subregion}</strong>.</>}
        </p>
      )}
    </>
  );
}

function NeighborsBody({ puzzle, result }: { puzzle: Extract<Puzzle, { kind: "neighbors" }>; result: PuzzleResult }) {
  const last = result.guesses[result.guesses.length - 1];
  const lastCountry = last && last !== puzzle.answer ? COUNTRY_BY_ID.get(last) : undefined;
  return (
    <>
      <p className="prompt">One country matches every clue. Select it on the map.</p>
      <ol className="clues">
        {puzzle.clues.map((c, i) => {
          const failed = lastCountry && !c.test(lastCountry);
          return (
            <li key={i} className={failed ? "failed" : undefined}>
              {c.text}
              {failed && <span className="clue-flag"> ✗ not {lastCountry.name}</span>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function PinBody({ puzzle }: { puzzle: Extract<Puzzle, { kind: "pin" }> }) {
  return (
    <>
      <p className="prompt">Drop a pin as close as you can to this city.</p>
      <div className="target-city">
        <span className="target-label">Find</span>
        <span className="target-name">{puzzle.place.city}</span>
        <span className="target-country">{puzzle.place.country}</span>
      </div>
    </>
  );
}

function DeductionBody({ puzzle, result }: { puzzle: Extract<Puzzle, { kind: "deduction" }>; result: PuzzleResult }) {
  // One clue to start, one more after each wrong guess; everything once the game is over.
  const shown = result.done ? puzzle.clues.length : Math.min(puzzle.clues.length, result.guesses.length + 1);
  return (
    <>
      <p className="prompt">Deduce the country from the clues. Each wrong guess reveals another clue.</p>
      <ol className="clues">
        {puzzle.clues.map((c, i) =>
          i < shown ? (
            <li key={i} className={i === shown - 1 && !result.done && i > 0 ? "new" : undefined}>
              {c}
            </li>
          ) : (
            <li key={i} className="locked">Hidden clue</li>
          ),
        )}
      </ol>
    </>
  );
}

// ---------------------------------------------------------------- footers

function CountryFooter({ puzzle, result, selected, onConfirm, onBack, onNext, onReplay }: Props) {
  if (puzzle.kind === "pin") return null;
  const table = ATTEMPT_POINTS[puzzle.kind];
  const attemptsLeft = table.length - result.guesses.length;

  return (
    <div className="puzzle-foot">
      {result.guesses.length > 0 && (
        <ul className="guesses">
          {result.guesses.map((g, i) => (
            <GuessRow key={i} guess={g} answer={puzzle.answer} />
          ))}
        </ul>
      )}

      {result.done ? (
        <Outcome
          good={result.solved}
          title={result.solved ? `Correct — ${getCountry(puzzle.answer).name}!` : `It was ${getCountry(puzzle.answer).name}.`}
          points={result.points}
          onBack={onBack}
          onNext={onNext}
          onReplay={onReplay}
        />
      ) : (
        <>
          <div className="attempts">
            {table.map((_, i) => (
              <span key={i} className={`pip${i < result.guesses.length ? " used" : ""}`} />
            ))}
            <span>
              {attemptsLeft} {attemptsLeft === 1 ? "guess" : "guesses"} left · worth {table[result.guesses.length]} pts
            </span>
          </div>
          <button type="button" className="btn primary" disabled={!selected} onClick={onConfirm}>
            {selected ? "Lock in guess" : "Click a country on the map"}
          </button>
        </>
      )}
    </div>
  );
}

function GuessRow({ guess, answer }: { guess: string; answer: string }) {
  const g = getCountry(guess);
  if (guess === answer) {
    return (
      <li className="guess correct">
        <span>{g.name}</span>
        <span>✅</span>
      </li>
    );
  }
  const a = getCountry(answer);
  const km = distanceKm(centerOf(g), centerOf(a));
  const dir = compass(bearing(centerOf(g), centerOf(a)));
  const neighbour = g.borders.includes(answer);
  return (
    <li className="guess wrong">
      <span>{g.name}</span>
      <span className="guess-meta">
        {neighbour ? "neighbour! " : ""}
        {formatKm(km)} <span title={`Answer is ${dir.label}`}>{dir.arrow}</span>
      </span>
    </li>
  );
}

function PinFooter({ puzzle, result, pendingPin, onConfirm, onBack, onNext, onReplay }: Props) {
  if (puzzle.kind !== "pin") return null;
  if (result.done) {
    const { city, lat, lng } = puzzle.place;
    return (
      <div className="puzzle-foot">
        <Outcome
          good={result.points >= 50}
          title={`${formatKm(result.distanceKm ?? 0)} away`}
          detail={`${city} is at ${formatLat(lat)}, ${formatLng(lng)}.`}
          points={result.points}
          onBack={onBack}
          onNext={onNext}
          onReplay={onReplay}
        />
      </div>
    );
  }
  return (
    <div className="puzzle-foot">
      <div className="attempts">
        <span>One pin · up to 100 pts, fewer the farther you are</span>
      </div>
      <button type="button" className="btn primary" disabled={!pendingPin} onClick={onConfirm}>
        {pendingPin ? "Drop pin here" : "Click the map to place a pin"}
      </button>
    </div>
  );
}

function Outcome({
  good,
  title,
  detail,
  points,
  onBack,
  onNext,
  onReplay,
}: {
  good: boolean;
  title: string;
  detail?: string;
  points: number;
  onBack: () => void;
  onNext?: () => void;
  onReplay?: () => void;
}) {
  return (
    <div className={`outcome ${good ? "good" : "bad"}`}>
      <div>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
      <span className="points">+{points}</span>
      {onReplay ? (
        <button type="button" className="btn test" onClick={onReplay}>
          ↻ Play again with a new puzzle (test mode)
        </button>
      ) : (
        <p className="outcome-reset">
          <Countdown prefix="This game refreshes in" />
        </p>
      )}
      {onNext ? (
        <button type="button" className="btn primary" onClick={onNext} autoFocus>
          Play next game →
        </button>
      ) : null}
      <button type="button" className={`btn ${onNext ? "ghost" : "primary"}`} onClick={onBack} autoFocus={!onNext}>
        All games
      </button>
    </div>
  );
}

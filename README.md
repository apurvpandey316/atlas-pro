# Atlas Daily

A daily geography puzzle game: every day, every player gets the same set of puzzles, solved directly on an interactive world map. Next.js + TypeScript.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Add `?date=2026-10-25` to play any day's set.

## Puzzles (MVP)

The four games are independent. You can play them in any order from the hub, and leave and resume one mid-game. A finished game stays locked until the daily reset (midnight UTC).

| Game | Interaction | Scoring | Answers come from |
|------|-------------|---------|-------------------|
| Find the Shape | Click the country matching a silhouette | 3 guesses: 100 / 60 / 30 | Any sovereign country ≥ 30,000 km² |
| The Neighbors | Click the one country that fits every clue | 3 guesses: 100 / 60 / 30 | Clues generated from border/coast/region data, checked to be unique |
| Where Do You Stand? | Given a city name, drop a pin on it | Up to 100, decaying with distance | `src/data/places.ts` |
| The Final Deduction | Starts with one clue; each wrong guess reveals the next | 5 guesses: 100 / 80 / 60 / 40 / 20 | `src/data/deductions.ts` |
| Read the Terrain | Coming soon (needs relief imagery) | – | – |

Wrong country guesses show the distance and direction to the answer.

## How it fits together

- `scripts/build-data.mjs` builds the map (world-atlas 1:50m) and country facts (world-countries). It runs automatically before `dev` and `build`.
- `src/lib/puzzles.ts` picks the daily set. The date is in UTC and the generator is seeded, so everyone gets the same puzzles, and answers don't repeat until a pool runs out.
- `src/components/WorldMap.tsx` is the map: d3-geo for drawing plus d3-zoom for pan and zoom.
- Progress and stats are kept in `localStorage`.
- `npx tsx scripts/check-puzzles.ts` checks a year of daily sets and confirms every Neighbors puzzle has exactly one answer.

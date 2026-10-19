// Sanity check: generates a year of daily sets and verifies every one is solvable.
// Run with: npx tsx scripts/check-puzzles.ts
import { COUNTRIES, getCountry } from "../src/lib/countries";
import { dailyPuzzles } from "../src/lib/puzzles";
import { DEDUCTIONS } from "../src/data/deductions";

const start = Date.parse("2026-10-18");
const answers = new Map<string, number>();
let clueCounts: number[] = [];

for (let d = 0; d < 365; d++) {
  const key = new Date(start + d * 86_400_000).toISOString().slice(0, 10);
  const set = dailyPuzzles(key);
  const ids = set.flatMap((p) => ("answer" in p ? [p.answer] : []));
  if (new Set(ids).size !== ids.length) throw new Error(`${key}: duplicate answers ${ids}`);
  for (const p of set) {
    if (p.kind !== "neighbors") continue;
    const matches = COUNTRIES.filter((c) => c.independent && p.clues.every((cl) => cl.test(c)));
    if (matches.length !== 1 || matches[0].id !== p.answer) throw new Error(`${key}: ambiguous neighbors`);
    clueCounts.push(p.clues.length);
    answers.set(p.answer, (answers.get(p.answer) ?? 0) + 1);
    if (d < 4) console.log(key, getCountry(p.answer).name, p.clues.map((c) => c.text));
  }
}
console.log(`365 days OK · ${answers.size} distinct neighbor answers · clues/puzzle avg ${(clueCounts.reduce((a, b) => a + b, 0) / clueCounts.length).toFixed(2)}`);

for (const d of DEDUCTIONS) {
  const c = getCountry(d.answer);
  console.log(`${c.id} landlocked=${c.landlocked} borders=${c.borders.length} [${c.borders.join(",")}]`);
}

// Builds the game's geographic data from world-atlas (shapes) and world-countries (facts).
// Outputs:
//   public/data/world.json     – TopoJSON with geometry ids rewritten to ISO alpha-3 codes
//   src/data/countries.json    – compact country facts used to generate and check puzzles
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const topology = structuredClone(require("world-atlas/countries-50m.json"));
const countries = require("world-countries");

const byNumeric = new Map(countries.filter((c) => c.ccn3).map((c) => [c.ccn3, c]));

// Map features without a numeric id that should belong to a playable country.
const byName = { Kosovo: "UNK", Somaliland: "SOM", "N. Cyprus": "CYP" };

const onMap = new Set();
for (const g of topology.objects.countries.geometries) {
  const c = g.id ? byNumeric.get(g.id) : undefined;
  const id = c?.cca3 ?? byName[g.properties?.name] ?? null;
  g.id = id;
  g.properties = {};
  if (id) onMap.add(id);
}

const facts = countries
  .filter((c) => onMap.has(c.cca3))
  .map((c) => ({
    id: c.cca3,
    name: c.name.common,
    region: c.region,
    subregion: c.subregion || c.region,
    lat: c.latlng[0],
    lng: c.latlng[1],
    landlocked: c.landlocked,
    borders: c.borders.filter((b) => onMap.has(b)),
    area: Math.round(c.area),
    independent: c.independent === true || c.cca3 === "UNK",
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(join(root, "public", "data"), { recursive: true });
mkdirSync(join(root, "src", "data"), { recursive: true });
writeFileSync(join(root, "public", "data", "world.json"), JSON.stringify(topology));
writeFileSync(join(root, "src", "data", "countries.json"), JSON.stringify(facts, null, 1));

console.log(`atlas-daily data: ${facts.length} countries, ${onMap.size} mapped ids`);

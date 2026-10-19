"use client";

import { useMemo } from "react";
import type { MultiPolygon, Polygon } from "geojson";
import { geoArea, geoAzimuthalEqualArea, geoCentroid, geoDistance, geoPath } from "d3-geo";
import type { CountryFeature } from "./WorldMap";

const S = 260;

/**
 * Draws one country on its own, projected around its own centre so the outline isn't
 * distorted. Far-flung overseas territories are dropped so the main shape stays readable.
 * With `neighbors`, the surrounding countries are drawn faintly as a hint.
 */
export default function ShapeSilhouette({
  feature,
  neighbors = [],
}: {
  feature: CountryFeature;
  neighbors?: CountryFeature[];
}) {
  const { d, neighborDs } = useMemo(() => {
    const main = mainland(feature);
    const projection = geoAzimuthalEqualArea()
      .rotate([-geoCentroid(main)[0], -geoCentroid(main)[1]])
      .clipAngle(90)
      .fitExtent([[18, 18], [S - 18, S - 18]], main);
    const path = geoPath(projection);
    return { d: path(main) ?? "", neighborDs: neighbors.map((n) => path(n) ?? "") };
  }, [feature, neighbors]);

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="silhouette" role="img" aria-label="Mystery country outline">
      <defs>
        <clipPath id="silhouette-clip">
          <rect width={S} height={S} rx={14} />
        </clipPath>
      </defs>
      <g clipPath="url(#silhouette-clip)">
        <rect width={S} height={S} className="silhouette-bg" />
        {neighborDs.map((nd, i) => (
          <path key={i} d={nd} className="silhouette-neighbor" />
        ))}
        <path d={d} className="silhouette-shape" />
      </g>
    </svg>
  );
}

function mainland(f: CountryFeature): CountryFeature {
  if (f.geometry.type !== "MultiPolygon") return f;
  const polys = (f.geometry as MultiPolygon).coordinates.map((coordinates) => {
    const poly: Polygon = { type: "Polygon", coordinates };
    return { coordinates, area: geoArea(poly), centroid: geoCentroid(poly) };
  });
  const biggest = polys.reduce((a, b) => (b.area > a.area ? b : a));
  const kept = polys.filter(
    (p) => geoDistance(p.centroid, biggest.centroid) < 0.6 && p.area >= biggest.area * 0.001,
  );
  return { ...f, geometry: { type: "MultiPolygon", coordinates: kept.map((p) => p.coordinates) } };
}

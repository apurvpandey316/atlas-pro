"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, Geometry } from "geojson";
import { geoGraticule, geoNaturalEarth1, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, ZoomBehavior, ZoomTransform } from "d3-zoom";
import { formatLat, formatLng } from "@/lib/geo";

export type CountryFeature = Feature<Geometry, Record<string, never>> & { id: string | null };
export type CountryMark = "selected" | "wrong" | "correct" | "answer";

export interface MapMarker {
  coord: [number, number];
  kind: "guess" | "answer";
}

interface Props {
  features: CountryFeature[];
  /** "country": click countries · "pin": click anywhere to drop a pin · "none": read-only */
  mode: "country" | "pin" | "none";
  marks?: Record<string, CountryMark>;
  markers?: MapMarker[];
  line?: [[number, number], [number, number]];
  /** Points ([lng, lat]) or country ids to bring into view, e.g. after a reveal. */
  focus?: { ids?: string[]; points?: [number, number][] } | null;
  onCountryClick?: (id: string) => void;
  onMapClick?: (lngLat: [number, number]) => void;
}

const W = 1000;
const H = 520;
const MAX_ZOOM = 40;

export default function WorldMap({ features, mode, marks = {}, markers = [], line, focus, onCountryClick, onMapClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [cursor, setCursor] = useState<[number, number] | null>(null);

  const projection = useMemo(() => geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: "Sphere" }), []);
  const path = useMemo(() => geoPath(projection), [projection]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([[0, 0], [W, H]])
      .extent([[0, 0], [W, H]])
      .on("zoom", (e) => setT(e.transform));
    zoomRef.current = behavior;
    select(svg).call(behavior).on("dblclick.zoom", null);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  // Bring requested countries/points into view.
  const focusKey = JSON.stringify(focus ?? null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !zoomRef.current) return;
    if (!focus) {
      // A new puzzle starts from the whole world.
      select(svg).call(zoomRef.current.transform, zoomIdentity);
      return;
    }
    const boxes: [[number, number], [number, number]][] = [];
    for (const id of focus.ids ?? []) {
      const f = features.find((x) => x.id === id);
      if (f) boxes.push(path.bounds(f) as [[number, number], [number, number]]);
    }
    for (const p of focus.points ?? []) {
      const xy = projection(p);
      if (xy) boxes.push([xy as [number, number], xy as [number, number]]);
    }
    if (!boxes.length) return;
    const x0 = Math.min(...boxes.map((b) => b[0][0]));
    const y0 = Math.min(...boxes.map((b) => b[0][1]));
    const x1 = Math.max(...boxes.map((b) => b[1][0]));
    const y1 = Math.max(...boxes.map((b) => b[1][1]));
    const k = Math.min(8, 0.7 / Math.max((x1 - x0 + 30) / W, (y1 - y0 + 30) / H));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    select(svg).call(zoomRef.current.transform, zoomIdentity.translate(W / 2, H / 2).scale(Math.max(1, k)).translate(-cx, -cy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, features]);

  /** Converts a pointer event to [lng, lat], undoing the viewBox scale and the zoom. */
  const toLngLat = useCallback(
    (e: React.MouseEvent): [number, number] | null => {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return null;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      const [x, y] = t.invert([pt.x, pt.y]);
      const ll = projection.invert?.([x, y]);
      if (!ll || Number.isNaN(ll[0]) || Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) return null;
      // Points outside the sphere outline invert to junk; round-trip to reject them.
      const back = projection(ll);
      if (!back || Math.hypot(back[0] - x, back[1] - y) > 1) return null;
      return [ll[0], ll[1]];
    },
    [projection, t],
  );

  const handleClick = (e: React.MouseEvent) => {
    if (mode === "pin") {
      const ll = toLngLat(e);
      if (ll) onMapClick?.(ll);
    } else if (mode === "country") {
      const id = (e.target as Element).getAttribute?.("data-id");
      if (id) onCountryClick?.(id);
    }
  };

  const zoomBy = (factor: number) => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.scaleBy, factor);
  };
  const resetZoom = () => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  };

  const project = (c: [number, number]) => {
    const xy = projection(c);
    return xy ? t.apply(xy as [number, number]) : null;
  };

  return (
    <div className={`map-wrap mode-${mode}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="map"
        role="application"
        aria-label="World map"
        onClick={handleClick}
        onMouseMove={(e) => setCursor(toLngLat(e))}
        onMouseLeave={() => setCursor(null)}
      >
        <g transform={t.toString()}>
          <Base path={path} features={features} marks={marks} interactive={mode === "country"} />
          {line && (
            <path
              className="guess-line"
              d={path({ type: "LineString", coordinates: line }) ?? ""}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
        {markers.map((m, i) => {
          const xy = project(m.coord);
          if (!xy) return null;
          return (
            <g key={i} transform={`translate(${xy[0]},${xy[1]})`} className={`marker marker-${m.kind}`}>
              <circle r={9} className="marker-halo" />
              <circle r={4.5} className="marker-dot" />
            </g>
          );
        })}
      </svg>

      <div className="map-controls">
        <button type="button" onClick={() => zoomBy(1.8)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.8)} aria-label="Zoom out">−</button>
        <button type="button" onClick={resetZoom} aria-label="Reset view">⟲</button>
      </div>
      <div className="map-cursor" aria-hidden>
        {cursor ? `${formatLat(cursor[1])}, ${formatLng(cursor[0])}` : "Zoom with scroll or pinch · drag to pan"}
      </div>
    </div>
  );
}

const GRATICULE = geoGraticule().step([15, 15])();
const PARALLELS = [
  { lat: 0, cls: "equator" },
  { lat: 23.44, cls: "tropic" },
  { lat: -23.44, cls: "tropic" },
  { lat: 66.56, cls: "polar" },
  { lat: -66.56, cls: "polar" },
];

/** The static layers. Memoised so zooming only re-renders the outer transform. */
const Base = memo(function Base({
  path,
  features,
  marks,
  interactive,
}: {
  path: ReturnType<typeof geoPath>;
  features: CountryFeature[];
  marks: Record<string, CountryMark>;
  interactive: boolean;
}) {
  const ds = useMemo(() => features.map((f) => path(f) ?? ""), [features, path]);
  const parallels = useMemo(
    () =>
      PARALLELS.map((p) => ({
        cls: p.cls,
        d: path({ type: "LineString", coordinates: Array.from({ length: 361 }, (_, i) => [i - 180, p.lat]) }) ?? "",
      })),
    [path],
  );
  return (
    <>
      <path className="sphere" d={path({ type: "Sphere" }) ?? ""} />
      <path className="graticule" d={path(GRATICULE) ?? ""} vectorEffect="non-scaling-stroke" />
      {parallels.map((p, i) => (
        <path key={i} className={`parallel ${p.cls}`} d={p.d} vectorEffect="non-scaling-stroke" />
      ))}
      {features.map((f, i) => {
        const mark = f.id ? marks[f.id] : undefined;
        return (
          <path
            key={i}
            d={ds[i]}
            data-id={interactive && f.id ? f.id : undefined}
            className={`country${interactive && f.id ? " clickable" : ""}${mark ? ` ${mark}` : ""}`}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </>
  );
});

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import type { Site } from "@/types";
import texasGeoJson from "@/assets/texas.geo.json";
import { TIER_COLOR, radiusForCapacity, type ScoredSite } from "@/lib/scoring";
import { geoMercator } from "d3-geo";

const texasFeature = texasGeoJson as unknown as GeoJSON.Feature;
const texasGeo: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [texasFeature],
};

interface MapProps {
  sites: Site[];
  scoresById: Record<string, ScoredSite>;
  selectedId: string | null;
  onSelect: (siteId: string) => void;
}

const WIDTH = 800;
const HEIGHT = 700;

export function TexasMap({ sites, scoresById, selectedId, onSelect }: MapProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; site: Site; score: ScoredSite } | null>(null);

  // Build a projection fitted to Texas so we can project lat/lng to SVG coords.
  const projection = useMemo(() => {
    return geoMercator().fitExtent(
      [
        [20, 20],
        [WIDTH - 20, HEIGHT - 20],
      ],
      texasGeo,
    );
  }, []);

  return (
    <div className="relative h-full w-full">
      <ComposableMap
        projection={projection as never}
        width={WIDTH}
        height={HEIGHT}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={texasGeo}>
          {({ geographies }: { geographies: Array<GeoJSON.Feature> }) =>
            geographies.map((geo, i) => (
              <Geography
                key={i}
                geography={geo}
                style={{
                  default: {
                    fill: "var(--muted)",
                    stroke: "var(--border)",
                    strokeWidth: 1,
                    outline: "none",
                  },
                  hover: { fill: "var(--muted)", outline: "none" },
                  pressed: { fill: "var(--muted)", outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {sites.map((site) => {
          const score = scoresById[site.site_id];
          if (!score) return null;
          const projected = projection([site.longitude, site.latitude]);
          if (!projected) return null;
          const [cx, cy] = projected;
          const r = radiusForCapacity(site.capacity_mw);
          const color = TIER_COLOR[score.tier];
          const isSelected = selectedId === site.site_id;
          const isHover = hoverId === site.site_id;

          return (
            <g
              key={site.site_id}
              transform={`translate(${cx}, ${cy})`}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => {
                setHoverId(site.site_id);
                setTooltip({ x: cx, y: cy, site, score });
              }}
              onMouseLeave={() => {
                setHoverId(null);
                setTooltip(null);
              }}
              onClick={() => onSelect(site.site_id)}
            >
              {(isSelected || isHover) && (
                <circle r={r + 5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.55} />
              )}
              <circle
                r={r}
                fill={color}
                fillOpacity={0.85}
                stroke="white"
                strokeWidth={isSelected ? 2.5 : 1.25}
              />
            </g>
          );
        })}
      </ComposableMap>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: `${(tooltip.x / WIDTH) * 100}%`,
            top: `${(tooltip.y / HEIGHT) * 100}%`,
          }}
        >
          <div className="font-semibold text-popover-foreground">{tooltip.site.display_name}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>Zone</span>
            <span className="text-right text-foreground">{tooltip.site.load_zone}</span>
            <span>Capacity</span>
            <span className="text-right text-foreground">{tooltip.site.capacity_mw} MW</span>
            <span>Score</span>
            <span
              className="text-right font-semibold"
              style={{ color: TIER_COLOR[tooltip.score.tier] }}
            >
              {tooltip.score.composite}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

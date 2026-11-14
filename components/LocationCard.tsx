"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  BookmarkSimpleIcon,
  CheckCircleIcon,
  CheckIcon,
  CrosshairIcon,
  DropIcon,
  MapPinIcon,
  NavigationArrowIcon,
  PathIcon,
  SparkleIcon,
  StackIcon,
  SunIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import {
  BackendPointScoreResponse,
  BackendRouteProperties,
  MarsFeatureKind,
  MarsGeoJSONFeature,
} from "@/types/mars";
import {
  type DistanceUnit,
  formatDistance,
  formatDuration,
  greatCircleKm,
  pointInGeometry,
  sampleRouteCoordinates,
} from "@/lib/geo";
import {
  getCentroid,
  getScoreAccent,
  getSurvivalMetrics,
  getVerdictLabel,
} from "@/lib/mars-scoring";
import { formatCoord, getVikingTilePreview } from "@/lib/mars-time";
import ScoreRing from "@/components/ScoreRing";

export type RouteSlot = "A" | "B";

interface LocationCardProps {
  feature: MarsGeoJSONFeature | null;
  allFeatures: MarsGeoJSONFeature[];
  backendScore?: BackendPointScoreResponse | null;
  isScoringLoading?: boolean;
  scoreError?: string | null;
  isSaved: boolean;
  pointA: MarsGeoJSONFeature | null;
  pointB: MarsGeoJSONFeature | null;
  pickingSlot: RouteSlot | null;
  routeDistanceKm: number | null;
  distanceUnit?: DistanceUnit;
  routeCoordinates?: [number, number][] | null;
  routeProperties?: BackendRouteProperties | null;
  isRouteLoading?: boolean;
  routeError?: string | null;
  onStartRouteFromHere: (feature: MarsGeoJSONFeature) => void;
  onStartNewRoute: () => void;
  onStartPickSlot: (slot: RouteSlot) => void;
  onClearRoute: () => void;
  onToggleSave: (id: string) => void;
  onClose: () => void;
}

const KIND_LABELS: Record<MarsFeatureKind, string> = {
  landing_site: "Landing Site",
  ice: "Water & Ice Site",
  hazard: "Hazard Zone",
  science_target: "Selected Location",
};

function getLatitudeZoneLabel(lat: number): string {
  const abs = Math.abs(lat);
  if (abs < 20) return "Equatorial zone";
  if (abs < 45) return "Mid-latitude zone";
  if (abs < 65) return "High-latitude zone";
  return "Polar region";
}

function buildBackendInsights(
  backendScore: BackendPointScoreResponse | null | undefined,
  fallback: ReturnType<typeof getSurvivalMetrics>
) {
  if (!backendScore) {
    return {
      pros: fallback.pros.slice(0, 3),
      risks: fallback.risks.slice(0, 3),
      resources: fallback.resources.slice(0, 3),
    };
  }

  const f = backendScore.properties.factors;
  const pros: string[] = [];
  const risks: string[] = [];
  const resources: string[] = [];

  if (f.slope?.value !== null && f.slope.value <= 5) {
    pros.push(`Low, flat plain (${f.slope.value.toFixed(1)}° slope)`);
  } else if (f.slope?.value !== null && f.slope.value > 12) {
    risks.push(`Steep local slope (${f.slope.value.toFixed(1)}°)`);
  }

  if (f.roughness?.value !== null && f.roughness.value <= 15) {
    pros.push(`Smooth regolith (${f.roughness.value.toFixed(1)} m roughness)`);
  } else if (f.roughness?.value !== null && f.roughness.value > 25) {
    risks.push(`Rough surface terrain (${f.roughness.value.toFixed(1)} m)`);
  }

  if (f.ice?.value !== null && f.ice.value >= 0.25) {
    pros.push("Possible buried water-ice signature");
    resources.push("Possible subsurface ice");
  } else {
    resources.push("Basaltic regolith");
  }

  if (f.thermal?.value !== null && f.thermal.value >= 0.5) {
    pros.push("Favorable solar & thermal stability");
  }
  if (!resources.includes("Solar energy")) {
    resources.push("Solar energy");
  }

  for (const hzId of backendScore.properties.hazard_ids ?? []) {
    risks.push(`Inside hazard zone (${hzId.replace(/^hz-/, "")})`);
  }

  if (backendScore.properties.data_flags?.includes("beyond_eva_radius")) {
    risks.push("Outside 10 km base EVA radius");
  }

  for (const p of fallback.pros) {
    if (pros.length < 2 && !pros.includes(p)) pros.push(p);
  }
  for (const r of fallback.risks) {
    if (risks.length < 2 && !risks.includes(r)) risks.push(r);
  }
  for (const res of fallback.resources) {
    if (resources.length < 2 && !resources.includes(res)) resources.push(res);
  }

  return {
    pros: pros.slice(0, 3),
    risks: risks.slice(0, 3),
    resources: resources.slice(0, 3),
  };
}

function ResourceIcon({ label }: { label: string }) {
  const lower = label.toLowerCase();
  if (
    lower.includes("ice") ||
    lower.includes("frost") ||
    lower.includes("water")
  ) {
    return <DropIcon weight="duotone" className="h-3 w-3 text-sky-400" />;
  }
  if (lower.includes("solar")) {
    return <SunIcon weight="duotone" className="h-3 w-3 text-amber-400" />;
  }
  return (
    <StackIcon weight="duotone" className="h-3 w-3 text-ares-accent-soft" />
  );
}

export default function LocationCard({
  feature,
  allFeatures,
  backendScore,
  isScoringLoading = false,
  scoreError = null,
  isSaved,
  pointA,
  pointB,
  pickingSlot,
  routeDistanceKm,
  distanceUnit = "km",
  routeCoordinates,
  routeProperties,
  isRouteLoading = false,
  routeError = null,
  onStartRouteFromHere,
  onStartNewRoute,
  onStartPickSlot,
  onClearRoute,
  onToggleSave,
  onClose,
}: LocationCardProps) {
  const [failedTileUrl, setFailedTileUrl] = useState<string | null>(null);

  const isRouteMode = Boolean(pointA || pointB || pickingSlot);
  const effectiveDistanceKm = routeProperties?.distance_km ?? routeDistanceKm;

  // Detect any hazard polygons intersected or approached along actual/geodesic path (±180° safe)
  const routeHazards = useMemo(() => {
    if (!pointA || !pointB) return [];
    const coordsA = getCentroid(pointA);
    const coordsB = getCentroid(pointB);
    const samplePoints =
      routeCoordinates && routeCoordinates.length >= 2
        ? routeCoordinates
        : sampleRouteCoordinates(coordsA, coordsB, 40);

    const hazards = allFeatures.filter((f) => f.properties.kind === "hazard");
    const matches: string[] = [];

    for (const hz of hazards) {
      const [hLon, hLat] = getCentroid(hz);
      const isPolygon =
        hz.geometry.type === "Polygon" || hz.geometry.type === "MultiPolygon";

      let hits = false;
      for (const [sLon, sLat] of samplePoints) {
        if (isPolygon && pointInGeometry(sLon, sLat, hz.geometry)) {
          hits = true;
          break;
        }
        if (
          greatCircleKm({ lon: sLon, lat: sLat }, { lon: hLon, lat: hLat }) <
          15
        ) {
          hits = true;
          break;
        }
      }
      if (hits) {
        matches.push(hz.properties.name);
      }
    }

    if (
      routeProperties?.max_slope_deg !== null &&
      routeProperties?.max_slope_deg !== undefined &&
      routeProperties.max_slope_deg > 15
    ) {
      matches.push(
        `Steep terrain slope along route (${routeProperties.max_slope_deg.toFixed(1)}° max)`
      );
    }

    return matches;
  }, [pointA, pointB, allFeatures, routeCoordinates, routeProperties]);

  // Nearest landing site for Location Features section
  const nearestLandingSite = useMemo(() => {
    if (!feature) return null;
    const [lon, lat] = getCentroid(feature);
    const sites = allFeatures.filter(
      (f) => f.properties.kind === "landing_site"
    );
    let best: { name: string; km: number } | null = null;
    for (const site of sites) {
      const [sLon, sLat] = getCentroid(site);
      const km = greatCircleKm({ lon, lat }, { lon: sLon, lat: sLat });
      if (!best || km < best.km) {
        best = { name: site.properties.name, km };
      }
    }
    return best;
  }, [feature, allFeatures]);

  // ============================================================================
  // MODE 2: ROUTE A -> B VIEW (Clean, intuitive route summary as in Photo 2)
  // ============================================================================
  if (isRouteMode) {
    const coordsA = pointA ? getCentroid(pointA) : null;
    const coordsB = pointB ? getCentroid(pointB) : null;

    const roverSols =
      effectiveDistanceKm !== null
        ? effectiveDistanceKm === 0
          ? 0
          : Math.max(1, Math.round((effectiveDistanceKm * 1000) / 200))
        : null;
    const crewedHours =
      effectiveDistanceKm !== null ? effectiveDistanceKm / 10 : null;
    const crewedDays =
      crewedHours !== null ? (crewedHours / 24).toFixed(1) : null;

    return (
      <aside
        aria-label="Route A to B Details"
        className="pointer-events-auto fixed top-[88px] right-5 z-[1000] flex max-h-[calc(100vh-186px)] w-[372px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-[#f06423]/60 bg-[#100806]/94 shadow-[0_22px_60px_rgba(0,0,0,0.85),0_0_28px_rgba(240,100,35,0.22)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-ares-accent uppercase">
              <PathIcon
                weight="duotone"
                className={`h-3.5 w-3.5 shrink-0 ${
                  isRouteLoading ? "animate-pulse" : ""
                }`}
              />
              <span>Route A → B</span>
            </div>

            <h2 className="mt-1.5 text-3xl leading-none font-bold tracking-tight text-white">
              {effectiveDistanceKm !== null
                ? formatDistance(effectiveDistanceKm, distanceUnit)
                : pickingSlot === "A"
                  ? "Select Point A"
                  : "Select Point B"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClearRoute}
            aria-label="Close route panel"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-ares-line bg-ares-raised/80 text-ares-mute transition-colors hover:border-ares-accent/50 hover:text-ares-text"
          >
            <XIcon weight="bold" className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
          {/* Coordinates A & B */}
          <div className="space-y-2 rounded-xl border border-ares-line/80 bg-ares-raised/45 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  A:{" "}
                </span>
                <span className="font-mono text-xs text-ares-text">
                  {coordsA
                    ? formatCoord(coordsA[1], coordsA[0])
                    : "Click map to choose Point A…"}
                </span>
                {pointA && (
                  <p className="truncate text-[11px] text-ares-mute">
                    {pointA.properties.name}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onStartPickSlot("A")}
                title="Pick Point A on map"
                className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors ${
                  pickingSlot === "A"
                    ? "border-emerald-400 bg-emerald-500/25 text-emerald-200"
                    : "border-ares-line bg-black/30 text-ares-mute hover:border-emerald-400/60 hover:text-emerald-300"
                }`}
              >
                <CrosshairIcon weight="duotone" className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="h-px w-full bg-ares-line/60" />

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono text-xs font-semibold text-ares-accent">
                  B:{" "}
                </span>
                <span className="font-mono text-xs text-ares-text">
                  {coordsB
                    ? formatCoord(coordsB[1], coordsB[0])
                    : "Click map to choose Point B…"}
                </span>
                {pointB && (
                  <p className="truncate text-[11px] text-ares-mute">
                    {pointB.properties.name}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onStartPickSlot("B")}
                title="Pick Point B on map"
                className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors ${
                  pickingSlot === "B"
                    ? "border-ares-accent bg-ares-accent/25 text-white"
                    : "border-ares-line bg-black/30 text-ares-mute hover:border-ares-accent hover:text-ares-accent"
                }`}
              >
                <CrosshairIcon weight="duotone" className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* TRIP Section */}
          {routeError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              Backend route engine fallback: {routeError}
            </div>
          )}

          {pointA && pointB && effectiveDistanceKm !== null ? (
            <>
              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold tracking-wider text-ares-mute uppercase">
                  Trip
                </h3>
                <ul className="space-y-1.5 text-xs leading-relaxed text-ares-text">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ares-accent" />
                    <span>
                      {routeProperties && routeProperties.steps > 2
                        ? "Terrain-aware least-cost path over MOLA grid"
                        : "Shortest path over the surface (great circle)"}
                    </span>
                  </li>
                  {roverSols !== null && (
                    <li className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ares-accent" />
                      <span>
                        ≈ {roverSols.toLocaleString("en-US")} sols at rover pace
                        (~200 m/sol)
                      </span>
                    </li>
                  )}
                  {crewedHours !== null && crewedDays !== null && (
                    <li className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ares-accent" />
                      <span>
                        {crewedHours >= 24
                          ? `≈ ${crewedDays} days for a crewed rover at 10 km/h`
                          : `≈ ${formatDuration(crewedHours)} (${crewedDays} days) for a crewed rover at 10 km/h`}
                      </span>
                    </li>
                  )}
                  {routeProperties?.max_slope_deg !== null &&
                    routeProperties?.max_slope_deg !== undefined && (
                      <li className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ares-accent" />
                        <span>
                          Max slope: {routeProperties.max_slope_deg.toFixed(1)}°
                          {routeProperties.elevation_gain_m !== null &&
                            ` · Elevation +${Math.round(routeProperties.elevation_gain_m)} m / -${Math.round(routeProperties.elevation_loss_m ?? 0)} m`}
                        </span>
                      </li>
                    )}
                </ul>
              </div>

              {/* HAZARDS Section */}
              <div className="space-y-2 border-t border-ares-line/70 pt-3.5">
                <h3
                  className={`text-[11px] font-semibold tracking-wider uppercase ${
                    routeHazards.length === 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  Hazards
                </h3>
                {routeHazards.length === 0 ? (
                  <ul className="space-y-1.5 text-xs text-ares-text">
                    <li className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <span>No known hazard zones on this path</span>
                    </li>
                  </ul>
                ) : (
                  <ul className="space-y-1.5 text-xs text-ares-text">
                    {routeHazards.map((hz, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                        <span>{hz}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-ares-accent/40 bg-ares-accent/10 px-3.5 py-3 text-xs text-ares-text">
              Click any marker or arbitrary point on the Mars map to set{" "}
              <strong>Point {pickingSlot ?? (!pointA ? "A" : "B")}</strong>.
            </div>
          )}

          {/* Note */}
          <p className="border-t border-ares-line/70 pt-3 text-[11px] leading-relaxed text-ares-mute">
            Terrain-aware routing evaluates MOLA elevation, local slope, and
            known orbital hazard polygons along the corridor.
          </p>

          {/* Actions: New route + Clear */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onStartNewRoute}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-ares-accent/60 bg-gradient-to-r from-[#5a2611] via-[#7c3214] to-[#5a2611] py-2.5 text-xs font-semibold text-white transition-all hover:border-ares-accent hover:brightness-110"
            >
              <NavigationArrowIcon weight="duotone" className="h-3.5 w-3.5" />
              <span>New route</span>
            </button>

            <button
              type="button"
              onClick={onClearRoute}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-ares-line bg-ares-raised/90 py-2.5 text-xs font-semibold text-ares-text transition-all hover:border-rose-400/60 hover:text-rose-300"
            >
              <ArrowCounterClockwiseIcon
                weight="bold"
                className="h-3.5 w-3.5"
              />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // ============================================================================
  // MODE 1: SINGLE POINT INSPECTION VIEW (Clean, intuitive as in Photo 1)
  // ============================================================================
  if (!feature) return null;

  const fallbackMetrics = getSurvivalMetrics(feature);
  const [lon, lat] = getCentroid(feature);
  const preview = getVikingTilePreview(lon, lat, 6);
  const showPreview = failedTileUrl !== preview.url;

  const activeScore =
    typeof backendScore?.properties.score === "number"
      ? backendScore.properties.score
      : fallbackMetrics.score;

  const activeElevation =
    backendScore?.properties.elevation_m !== undefined &&
    backendScore?.properties.elevation_m !== null
      ? backendScore.properties.elevation_m
      : fallbackMetrics.elevation_m;

  const verdict = backendScore
    ? getVerdictLabel(activeScore, backendScore.properties.excluded)
    : getVerdictLabel(activeScore);

  const verdictColor = getScoreAccent(activeScore);
  const insights = buildBackendInsights(backendScore, fallbackMetrics);
  const kindLabel =
    feature.properties.dataset_id === "ares_surface_probe"
      ? "Surface Point"
      : KIND_LABELS[feature.properties.kind] ?? "Selected Location";

  const missionSubtitle = feature.properties.mission
    ? `${feature.properties.mission}${
        feature.properties.landing_date
          ? ` (${feature.properties.landing_date.slice(0, 4)})`
          : ""
      }`
    : null;

  return (
    <aside
      aria-label="Selected Location Details"
      className="pointer-events-auto fixed top-[88px] right-5 z-[1000] flex max-h-[calc(100vh-186px)] w-[372px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-[#f06423]/60 bg-[#100806]/94 shadow-[0_22px_60px_rgba(0,0,0,0.85),0_0_28px_rgba(240,100,35,0.22)] backdrop-blur-xl"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ares-accent-soft uppercase">
            <MapPinIcon weight="duotone" className="h-3.5 w-3.5 shrink-0" />
            <span>{kindLabel}</span>
            {isScoringLoading && !scoreError && (
              <span className="ml-1 font-mono text-[10px] font-normal text-ares-mute lowercase">
                · scoring…
              </span>
            )}
            {scoreError && (
              <span
                title={scoreError}
                className="ml-1 font-mono text-[10px] font-normal text-amber-400 lowercase"
              >
                · offline heuristic
              </span>
            )}
          </div>
          <h2 className="mt-1 truncate text-xl leading-tight font-bold text-ares-text">
            {feature.properties.name}
          </h2>
          {missionSubtitle && (
            <p className="mt-0.5 text-xs text-ares-mute">{missionSubtitle}</p>
          )}
          <p className="mt-0.5 font-mono text-xs text-ares-mute tabular-nums">
            {formatCoord(lat, lon)}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close location panel"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-ares-line bg-ares-raised/80 text-ares-mute transition-colors hover:border-ares-accent/50 hover:text-ares-text"
        >
          <XIcon weight="bold" className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Card Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
        {/* NASA Viking Mosaic Banner */}
        <div className="relative h-24 w-full overflow-hidden rounded-xl border border-ares-line bg-ares-raised">
          {showPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={`Orbital view of ${feature.properties.name}`}
              onError={() => setFailedTileUrl(preview.url)}
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${preview.fx * 100}% ${preview.fy * 100}%`,
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-ares-mute">
              Orbital preview unavailable
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ares-panel/85 via-transparent to-transparent" />
          <span className="pointer-events-none absolute right-2.5 bottom-1.5 text-[10px] text-ares-mute">
            NASA Viking MDIM 2.1
          </span>
        </div>

        {/* Score Ring (0-100) + Verdict */}
        <div className="flex items-center gap-4 border-b border-ares-line/80 pb-4">
          <ScoreRing key={feature.properties.id} score={activeScore} />
          <div className="min-w-0">
            <div
              className="text-base leading-snug font-semibold"
              style={{ color: verdictColor }}
            >
              {verdict}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-ares-mute">
              Concept score, not a safety rating
            </p>
          </div>
        </div>

        {/* Advantages & Risks (2 clean columns) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-emerald-400 uppercase">
              <CheckCircleIcon
                weight="duotone"
                className="h-3.5 w-3.5 shrink-0"
              />
              <span>Advantages</span>
            </h4>
            <ul className="space-y-1.5 text-xs leading-snug text-ares-text">
              {insights.pros.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <CheckIcon
                    weight="bold"
                    className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-rose-400 uppercase">
              <WarningIcon
                weight="duotone"
                className="h-3.5 w-3.5 shrink-0"
              />
              <span>Risks</span>
            </h4>
            <ul className="space-y-1.5 text-xs leading-snug text-ares-text">
              {insights.risks.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <WarningIcon
                    weight="duotone"
                    className="mt-0.5 h-3 w-3 shrink-0 text-rose-400"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Resources */}
        <div className="border-t border-ares-line/70 pt-3.5">
          <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-amber-400 uppercase">
            <SparkleIcon weight="duotone" className="h-3.5 w-3.5 shrink-0" />
            <span>Resources</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {insights.resources.map((res, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ares-line bg-ares-raised px-2.5 py-1 text-[11px] text-ares-text"
              >
                <ResourceIcon label={res} />
                {res}
              </span>
            ))}
          </div>
        </div>

        {/* Location Features (as in Photo 1) */}
        <div className="border-t border-ares-line/70 pt-3.5">
          <h4 className="mb-2 text-[11px] font-semibold tracking-wider text-ares-mute uppercase">
            Location Features
          </h4>
          <ul className="space-y-1.5 text-xs leading-snug text-ares-text">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ares-accent-soft" />
              <span>{getLatitudeZoneLabel(lat)}</span>
            </li>
            {activeElevation !== null && (
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ares-accent-soft" />
                <span>
                  Elevation: {activeElevation > 0 ? "+" : ""}
                  {Math.round(activeElevation).toLocaleString("en-US")} m (MOLA)
                </span>
              </li>
            )}
            {nearestLandingSite && (
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ares-accent-soft" />
                <span>
                  Nearest landing site: {nearestLandingSite.name},{" "}
                  {formatDistance(nearestLandingSite.km, distanceUnit)}
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Action Buttons: Start route from here + Save Location */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => onStartRouteFromHere(feature)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-ares-accent bg-ares-accent py-2.5 text-xs font-bold text-[#140c07] shadow-[0_0_20px_rgba(240,100,35,0.35)] transition-all hover:brightness-110"
          >
            <NavigationArrowIcon weight="fill" className="h-3.5 w-3.5" />
            <span>Start route from here</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleSave(feature.properties.id)}
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold transition-all duration-150 ${
              isSaved
                ? "border-ares-accent/80 bg-ares-accent/20 text-white"
                : "border-ares-line bg-ares-raised/70 text-ares-text hover:border-ares-accent/60"
            }`}
          >
            <BookmarkSimpleIcon
              weight={isSaved ? "fill" : "duotone"}
              className="h-3.5 w-3.5"
            />
            <span>{isSaved ? "Location Saved" : "Save Location"}</span>
          </button>

          <p className="pt-1 text-[10.5px] leading-relaxed text-ares-mute">
            Scores use latitude, region elevation, distance to known ice and
            hazard zones. Data: NASA Mars Trek MOLA, landing-site coordinates,
            SWIM ice maps.
          </p>

          {feature.properties.source_ref &&
            feature.properties.source_ref.startsWith("http") && (
              <div className="flex justify-end text-[10px]">
                <a
                  href={feature.properties.source_ref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-ares-accent-soft hover:underline"
                >
                  <span>Source</span>
                  <ArrowSquareOutIcon weight="bold" className="h-2.5 w-2.5" />
                </a>
              </div>
            )}
        </div>
      </div>
    </aside>
  );
}

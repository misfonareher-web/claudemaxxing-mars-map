"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  BookmarkSimpleIcon,
  CaretDownIcon,
  CaretUpIcon,
  CrosshairIcon,
  NavigationArrowIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import {
  AresLayersIcon,
  AresPinIcon,
  AresRouteIcon,
  AresSunIcon,
  AresWarningIcon,
  AresWaterIcon,
} from "@/components/AresIcons";
import {
  BackendPointScoreResponse,
  BackendRouteProperties,
  EnvironmentSummary,
  MarsFeatureKind,
  MarsGeoJSONFeature,
} from "@/types/mars";
import {
  type DistanceUnit,
  formatDistance,
  greatCircleKm,
  pointInGeometry,
} from "@/lib/geo";
import {
  DEFAULT_DISCLAIMERS,
  DEFAULT_ROUTE_DISCLAIMERS,
  getCentroid,
  getScoreAccent,
  getSurvivalMetrics,
  getVerdictLabel,
} from "@/lib/mars-scoring";
import { formatCoord, getVikingTilePreview } from "@/lib/mars-time";
import { NO_TERRAIN, NO_ROUTE, terrainPreset, pointUnavailable } from "@/lib/terrain-availability";
import ScoreRing from "@/components/ScoreRing";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import {
  HazardCoverageCard,
  RadiationContextCard,
} from "@/components/EnvironmentContextCards";

export type RouteSlot = "A" | "B";

interface LocationCardProps {
  feature: MarsGeoJSONFeature | null;
  allFeatures: MarsGeoJSONFeature[];
  environment?: EnvironmentSummary | null;
  backendScore?: BackendPointScoreResponse | null;
  isScoringLoading?: boolean;
  scoreError?: string | null;
  isSaved: boolean;
  pointA: MarsGeoJSONFeature | null;
  pointB: MarsGeoJSONFeature | null;
  pickingSlot: RouteSlot | null;
  distanceUnit?: DistanceUnit;
  routeCoordinates?: [number, number][] | null;
  routeProperties?: BackendRouteProperties | null;
  routeDisclaimers?: string[] | null;
  isRouteLoading?: boolean;
  routeError?: string | null;
  onStartRouteFromHere: (feature: MarsGeoJSONFeature) => void;
  onSelectPresetRoute?: (
    presetId: "jezero" | "gale",
    mode: "from_base" | "demo"
  ) => void;
  onStartNewRoute: () => void;
  onStartPickSlot: (slot: RouteSlot) => void;
  onClearRoute: () => void;
  onToggleSave: (id: string) => void;
  onClose: () => void;
  mobileSheetExpanded?: boolean;
  onToggleMobileSheetExpanded?: () => void;
  hideOnMobilePicking?: boolean;
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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function formatExclusionReason(reason: string): string {
  if (reason === "beyond_eva_radius") {
    return "Outside 10 km base EVA radius (demo cutoff)";
  }
  if (reason === "slope_above_hard_max") {
    return "Slope above 25° demo exclusion threshold";
  }
  if (reason.startsWith("hazard:")) {
    return `Severe exclusion hazard (${reason.slice(7).replace(/^hz-/, "")})`;
  }
  return reason;
}

function buildBackendInsights(
  backendScore: BackendPointScoreResponse | null | undefined,
  fallback: ReturnType<typeof getSurvivalMetrics>
) {
  if (!backendScore?.properties?.factors) {
    return {
      pros: fallback.pros.slice(0, 3),
      risks: fallback.risks.slice(0, 3),
      resources: fallback.resources.slice(0, 3),
    };
  }

  const f = backendScore.properties.factors;
  const isExcluded = Boolean(backendScore.properties.excluded);
  const exclusionReasons = backendScore.properties.exclusion_reasons ?? [];
  const dataFlags = backendScore.properties.data_flags ?? [];
  const pros: string[] = [];
  const risks: string[] = [];
  const resources: string[] = [];

  for (const reason of exclusionReasons) {
    const label = formatExclusionReason(reason);
    if (!risks.includes(label)) risks.push(label);
  }
  if (
    !exclusionReasons.includes("beyond_eva_radius") &&
    dataFlags.includes("beyond_eva_radius")
  ) {
    risks.push(formatExclusionReason("beyond_eva_radius"));
  }

  const slopeVal = f.slope?.value;
  if (!isExcluded && isFiniteNumber(slopeVal) && slopeVal <= 5) {
    pros.push(`Low, flat plain (${slopeVal.toFixed(1)}° slope)`);
  } else if (isFiniteNumber(slopeVal) && slopeVal > 12) {
    risks.push(`Steep local slope (${slopeVal.toFixed(1)}°)`);
  }

  const roughVal = f.roughness?.value;
  if (isFiniteNumber(roughVal) && roughVal > 25) {
    risks.push(`Rough surface terrain (${roughVal.toFixed(1)} m)`);
  }

  const iceVal = f.ice?.value;
  if (isFiniteNumber(iceVal) && iceVal >= 0.25) {
    pros.push("Orbital water-ice proxy (context only)");
    resources.push("Orbital ice proxy (unverified)");
  }

  for (const hzId of backendScore.properties.hazard_ids ?? []) {
    const hzRisk = `Inside hazard zone (${hzId.replace(/^hz-/, "")})`;
    if (!risks.includes(hzRisk)) risks.push(hzRisk);
  }

  if (isExcluded && pros.length === 0) {
    pros.push("Telemetry sampled (constraint-excluded cell)");
  } else {
    for (const p of fallback.pros) {
      if (pros.length < 2 && !pros.includes(p)) pros.push(p);
    }
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
    return <AresWaterIcon className="h-3 w-3 text-sky-400" />;
  }
  if (lower.includes("solar")) {
    return <AresSunIcon className="h-3 w-3 text-amber-400" />;
  }
  return <AresLayersIcon className="h-3 w-3 text-ares-accent-soft" />;
}

function HudSidePanel({
  ariaLabel,
  mobileExpanded = false,
  hideOnMobile = false,
  children,
}: {
  ariaLabel: string;
  mobileExpanded?: boolean;
  hideOnMobile?: boolean;
  children: React.ReactNode;
}) {
  return (
    <aside
      aria-label={ariaLabel}
      className={`pointer-events-auto fixed inset-x-2.5 bottom-[calc(74px+env(safe-area-inset-bottom))] z-[1000] flex flex-col bg-[#f06423]/60 p-[1px] shadow-[0_22px_60px_rgba(0,0,0,0.85),0_0_28px_rgba(240,100,35,0.22)] backdrop-blur-xl transition-[max-height] duration-200 md:inset-x-auto md:top-[132px] md:right-4 md:bottom-auto md:w-[344px] md:max-h-[calc(100dvh-222px)] lg:top-[88px] lg:right-5 lg:w-[372px] lg:max-h-[calc(100vh-172px)] ${
        hideOnMobile ? "hidden md:flex" : "flex"
      } ${
        mobileExpanded
          ? "max-h-[calc(100dvh-158px)]"
          : "max-h-[min(46dvh,calc(100dvh-160px))]"
      }`}
      style={{
        clipPath:
          "polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)",
      }}
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#100806]/94"
        style={{
          clipPath:
            "polygon(13.5px 0, 100% 0, 100% calc(100% - 13.5px), calc(100% - 13.5px) 100%, 0 100%, 0 13.5px)",
        }}
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-1.5 h-1 w-9 shrink-0 bg-ares-accent/45 md:hidden"
        />
        {children}
      </div>
    </aside>
  );
}

/** Expand/collapse (mobile sheet) + close icon buttons with generous touch targets. */
function SheetWindowControls({
  expanded,
  onToggleExpand,
  onClose,
  closeLabel,
}: {
  expanded: boolean;
  onToggleExpand?: () => void;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="-mr-1.5 flex shrink-0 items-center gap-0.5 sm:-mr-1">
      {onToggleExpand && (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? "Collapse detail sheet" : "Expand detail sheet"}
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-ares-mute transition-colors hover:text-ares-text md:hidden"
        >
          {expanded ? (
            <CaretDownIcon weight="bold" className="h-4 w-4" />
          ) : (
            <CaretUpIcon weight="bold" className="h-4 w-4" />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="flex h-10 w-10 cursor-pointer items-center justify-center text-ares-mute transition-colors hover:text-ares-text sm:h-7 sm:w-7"
      >
        <XIcon weight="bold" className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Square HUD bullet used across advantages, risks, trip metrics, hazards, and notes. */
function HudBullet({ variant = "hollow" }: { variant?: "hollow" | "accent" }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-[4px] h-2 w-2 shrink-0 ${
        variant === "accent"
          ? "bg-ares-accent"
          : "border border-ares-text/75 bg-transparent"
      }`}
    />
  );
}

/** Stacked route endpoint selector card for Point A or Point B. */
function RouteEndpointSlot({
  slot,
  point,
  coords,
  isPicking,
  onPick,
}: {
  slot: RouteSlot;
  point: MarsGeoJSONFeature | null;
  coords: [number, number] | null;
  isPicking: boolean;
  onPick: () => void;
}) {
  const title = point
    ? point.properties.dataset_id === "ares_surface_probe"
      ? "Surface Point"
      : point.properties.name
    : `Click map to choose Point ${slot}`;

  return (
    <button
      type="button"
      onClick={onPick}
      title={`Pick Point ${slot} on map`}
      aria-label={`Pick Point ${slot} on map`}
      className={`group flex w-full cursor-pointer items-center justify-between gap-3 rounded-none border px-3 py-2.5 text-left transition-colors ${
        isPicking
          ? "border-ares-accent bg-[#1c0d07]/85"
          : "border-ares-line/90 bg-[#170b07]/85 hover:border-ares-accent/55"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-ares-text/55 bg-black/25 text-xs font-bold text-ares-text">
          {slot}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight font-semibold text-ares-text">
            {title}
          </p>
          {coords && (
            <p className="mt-0.5 font-mono text-[11px] leading-tight text-ares-mute tabular-nums">
              {formatCoord(coords[1], coords[0])}
            </p>
          )}
        </div>
      </div>
      <CrosshairIcon
        weight="regular"
        className={`h-4 w-4 shrink-0 transition-colors ${
          isPicking
            ? "text-ares-text"
            : "text-ares-text/80 group-hover:text-ares-accent"
        }`}
      />
    </button>
  );
}

export default function LocationCard({
  feature,
  allFeatures,
  environment = null,
  backendScore,
  isScoringLoading = false,
  scoreError = null,
  isSaved,
  pointA,
  pointB,
  pickingSlot,
  distanceUnit = "km",
  routeCoordinates,
  routeProperties,
  routeDisclaimers,
  isRouteLoading = false,
  routeError = null,
  onStartRouteFromHere,
  onSelectPresetRoute,
  onStartNewRoute,
  onStartPickSlot,
  onClearRoute,
  onToggleSave,
  onClose,
  mobileSheetExpanded,
  onToggleMobileSheetExpanded,
  hideOnMobilePicking = false,
}: LocationCardProps) {
  const [failedTileUrl, setFailedTileUrl] = useState<string | null>(null);
  const [localExpanded, setLocalExpanded] = useState(false);
  const isSheetExpanded = mobileSheetExpanded ?? localExpanded;
  const toggleSheetExpanded =
    onToggleMobileSheetExpanded ?? (() => setLocalExpanded((prev) => !prev));

  const isRouteMode = Boolean(pointA || pointB || pickingSlot);
  const routePresetA = pointA ? terrainPreset(...getCentroid(pointA)) : null;
  const routePresetB = pointB ? terrainPreset(...getCentroid(pointB)) : null;
  const routeUnavailable = Boolean(pointA && pointB &&
    (!routePresetA || !routePresetB || routePresetA.id !== routePresetB.id ||
      pointUnavailable(...getCentroid(pointA)) || pointUnavailable(...getCentroid(pointB)) ||
      routeProperties?.unreachable_reason === "terrain_unavailable"));
  const isUnreachable = Boolean(
    pointA && pointB && routeProperties && routeProperties.reachable === false
  );
  const effectiveDistanceKm =
    !routeUnavailable && routeProperties?.reachable === true &&
    typeof routeProperties.distance_km === "number"
      ? routeProperties.distance_km
      : null;

  // Detect any hazard polygons intersected or approached along actual A* path (±180° safe)
  const routeHazards = useMemo(() => {
    if (
      !pointA ||
      !pointB ||
      isUnreachable ||
      !routeCoordinates ||
      routeCoordinates.length < 2
    ) {
      return [];
    }
    const samplePoints = routeCoordinates;

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
  }, [
    pointA,
    pointB,
    isUnreachable,
    allFeatures,
    routeCoordinates,
    routeProperties,
  ]);

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
  // MODE 2: ROUTE A -> B VIEW (Select Point B / Route Summary HUD)
  // ============================================================================
  if (isRouteMode) {
    const coordsA = pointA ? getCentroid(pointA) : null;
    const coordsB = pointB ? getCentroid(pointB) : null;
    const activeSlot: RouteSlot = pickingSlot ?? (!pointA ? "A" : "B");
    const hasComputedRoute = Boolean(
      pointA && pointB && effectiveDistanceKm !== null && !isUnreachable && !routeError
    );
    const isExtendedEvaRoute = Boolean(
      routeDisclaimers?.some((d) => d.includes("No local MOLA A* coverage"))
    );
    const isConditionalRoute = Boolean(
      isExtendedEvaRoute ||
        routeDisclaimers?.some((d) => d.includes("No local MOLA grid"))
    );
    const activeDisclaimers = routeDisclaimers?.length
      ? routeDisclaimers
      : DEFAULT_ROUTE_DISCLAIMERS;
    const trailingDisclaimers = hasComputedRoute
      ? activeDisclaimers.slice(1)
      : activeDisclaimers;

    const presetButtons: Array<{
      id: "jezero" | "gale";
      mode: "demo" | "from_base";
      label: string;
    }> = [
      { id: "jezero", mode: "demo", label: "Jezero Demo" },
      { id: "gale", mode: "demo", label: "Gale Demo" },
      { id: "jezero", mode: "from_base", label: "Pick in Jezero" },
      { id: "gale", mode: "from_base", label: "Pick in Gale" },
    ];

    return (
      <HudSidePanel
        ariaLabel="Route A to B Details"
        mobileExpanded={isSheetExpanded}
        hideOnMobile={hideOnMobilePicking}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-4 pt-2.5 pb-2 md:pt-3.5 md:pb-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-ares-accent uppercase">
              <AresRouteIcon
                className={`h-3.5 w-3.5 shrink-0 ${
                  isRouteLoading ? "animate-pulse" : ""
                }`}
              />
              <span>Route A → B</span>
            </div>

            <h2 className="mt-1 text-[24px] leading-none font-bold tracking-tight text-white tabular-nums sm:text-[28px]">
              {routeUnavailable ? "Route unavailable" : effectiveDistanceKm !== null
                ? formatDistance(effectiveDistanceKm, distanceUnit)
                : isUnreachable
                  ? "Route unreachable"
                  : routeError
                    ? "Route unavailable"
                    : pointA && pointB && isRouteLoading
                      ? "Computing…"
                      : `Select Point ${activeSlot}`}
            </h2>
          </div>

          <SheetWindowControls
            expanded={isSheetExpanded}
            onToggleExpand={toggleSheetExpanded}
            onClose={onClearRoute}
            closeLabel="Close route panel"
          />
        </div>

        {/* Scrollable Body */}
        <div
          key={
            pickingSlot
              ? `pick-${pickingSlot}`
              : `${pointA?.properties.id ?? "none"}-${pointB?.properties.id ?? "none"}`
          }
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3"
        >
          {/* Stacked Point A & Point B boxes */}
          <div className="space-y-2">
            <RouteEndpointSlot
              slot="A"
              point={pointA}
              coords={coordsA}
              isPicking={pickingSlot === "A"}
              onPick={() => onStartPickSlot("A")}
            />
            <RouteEndpointSlot
              slot="B"
              point={pointB}
              coords={coordsB}
              isPicking={pickingSlot === "B"}
              onPick={() => onStartPickSlot("B")}
            />
          </div>

          {/* Warning / Trip / Hazards / Picking Callout */}
          {routeUnavailable ? (
            <p className="text-xs text-amber-200">{NO_ROUTE}</p>
          ) : isUnreachable ? (
            <div className="flex items-start gap-2.5 rounded-none border border-rose-500/60 bg-rose-500/10 px-3.5 py-2.5 text-[12px] leading-snug text-rose-200">
              <AresWarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <span>
                {routeProperties?.message ||
                  "No passable route found between the selected endpoints."}
              </span>
            </div>
          ) : routeError ? (
            <div className="flex items-start gap-2.5 rounded-none border border-rose-500/60 bg-rose-500/10 px-3.5 py-2.5 text-[12px] leading-snug text-rose-300">
              <AresWarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <span>{routeError}</span>
            </div>
          ) : hasComputedRoute ? (
            <>
              {isConditionalRoute && (
                <div className="flex items-start gap-2.5 rounded-none border border-ares-accent/85 bg-[#1c0c06]/65 px-3.5 py-2.5 text-[12px] leading-snug text-ares-text">
                  <AresWarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-ares-text/90" />
                  <span>
                    {isExtendedEvaRoute
                      ? "Conditional planetary estimate (beyond 10 km MOLA A* EVA circle). Great-circle path without local terrain A* pathfinding."
                      : "Conditional planetary estimate (outside Jezero and Gale MOLA grids). Great-circle path without local terrain A* pathfinding."}
                  </span>
                </div>
              )}

              <div className="border-t border-ares-line/70 pt-3">
                <h3 className="mb-2 text-[10px] font-semibold tracking-wider text-ares-mute uppercase">
                  Trip
                </h3>
                <ul className="space-y-1.5 text-[12px] leading-snug text-ares-text">
                  <li className="flex items-start gap-2">
                    <HudBullet />
                    <span>
                      {isExtendedEvaRoute
                        ? "Conditional great-circle estimate beyond 10 km EVA circle"
                        : isConditionalRoute
                          ? "Conditional great-circle estimate, no local MOLA A* grid"
                          : "Terrain-aware least-cost path over MOLA grid"}
                    </span>
                  </li>
                  {isFiniteNumber(routeProperties?.max_slope_deg) && (
                    <li className="flex items-start gap-2">
                      <HudBullet />
                      <span>
                        Max slope {routeProperties.max_slope_deg.toFixed(1)}°
                        {isFiniteNumber(routeProperties.elevation_gain_m) &&
                          ` · elevation +${Math.round(routeProperties.elevation_gain_m)} m / -${Math.round(
                            isFiniteNumber(routeProperties.elevation_loss_m)
                              ? routeProperties.elevation_loss_m
                              : 0
                          )} m`}
                      </span>
                    </li>
                  )}
                </ul>
              </div>

              {/* HAZARDS Section */}
              <div className="border-t border-ares-line/70 pt-3">
                <h3
                  className={`mb-2 text-[10px] font-semibold tracking-wider uppercase ${
                    routeHazards.length === 0
                      ? "text-ares-mute"
                      : "text-ares-accent"
                  }`}
                >
                  Hazards
                </h3>
                {routeHazards.length === 0 ? (
                  <ul className="space-y-1.5 text-[12px] leading-snug text-ares-text">
                    <li className="flex items-start gap-2">
                      <HudBullet />
                      <span>No known hazard zones on this path</span>
                    </li>
                  </ul>
                ) : (
                  <ul className="space-y-1.5 text-[12px] leading-snug text-ares-text">
                    {routeHazards.map((hz, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <HudBullet variant="accent" />
                        <span>{hz}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {activeDisclaimers[0] && (
                  <p className="mt-2.5 text-[11px] leading-snug text-ares-mute">
                    {activeDisclaimers[0]}
                  </p>
                )}
              </div>

              {environment?.hazard_coverage && (
                <HazardCoverageCard coverage={environment.hazard_coverage} />
              )}
            </>
          ) : pointA && pointB && isRouteLoading ? (
            <div className="flex items-start gap-2.5 rounded-none border border-ares-accent/85 bg-[#1c0c06]/65 px-3.5 py-2.5 text-[12px] leading-snug text-ares-text">
              <AresRouteIcon className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-ares-accent" />
              <span>Calculating terrain-aware route…</span>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-none border border-ares-accent/85 bg-[#1c0c06]/65 px-3.5 py-2.5 text-[12px] leading-snug text-ares-text">
              <AresPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-ares-text/85" />
              <span>
                Click any marker or arbitrary point on the map to set Point{" "}
                {activeSlot}.
              </span>
            </div>
          )}

          {/* Quick Preset Routes inside MOLA Grids (Jezero & Gale) */}
          {onSelectPresetRoute &&
            (routeError || isUnreachable || pickingSlot || !pointA || !pointB) && (
              <div className="border-t border-ares-line/70 pt-3">
                <h3 className="mb-2 text-[10px] font-semibold tracking-wider text-ares-mute uppercase">
                  Preset Routes (MOLA Grid)
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {presetButtons.map((preset) => (
                    <button
                      key={`${preset.id}-${preset.mode}`}
                      type="button"
                      onClick={() => onSelectPresetRoute(preset.id, preset.mode)}
                      className="cursor-pointer rounded-none border border-ares-line/90 bg-[#170b07]/85 px-2.5 py-2 text-[11.5px] font-semibold text-ares-text transition-colors hover:border-ares-accent/70 hover:text-white"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* Disclaimers */}
          {trailingDisclaimers.length > 0 && (
            <ul className="space-y-1.5 border-t border-ares-line/70 pt-3 pb-1 text-[11px] leading-snug text-ares-mute">
              {trailingDisclaimers.map((disclaimer, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <HudBullet />
                  <span>{disclaimer}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sticky Actions Footer: New route + Clear */}
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-ares-line/70 bg-[#100806]/96 px-4 pt-2.5 pb-4">
          <button
            type="button"
            onClick={onStartNewRoute}
            className="flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-none border border-ares-accent/75 bg-ares-accent/15 py-2 text-xs font-semibold text-white transition-colors hover:bg-ares-accent/25 sm:min-h-0"
          >
            <NavigationArrowIcon weight="duotone" className="h-3.5 w-3.5" />
            <span>New route</span>
          </button>

          <button
            type="button"
            onClick={onClearRoute}
            className="flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-none border border-ares-line/90 bg-[#170b07]/85 py-2 text-xs font-semibold text-ares-text transition-colors hover:border-rose-400/60 hover:text-rose-300 sm:min-h-0"
          >
            <ArrowCounterClockwiseIcon
              weight="bold"
              className="h-3.5 w-3.5"
            />
            <span>Clear</span>
          </button>
        </div>
      </HudSidePanel>
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

  const unavailable = pointUnavailable(lon, lat, backendScore);
  const noTerrain = unavailable === NO_TERRAIN;
  const activeScore = !unavailable &&
    typeof backendScore?.properties.score === "number"
      ? backendScore.properties.score
      : null;

  const activeElevation = noTerrain ? null : isFiniteNumber(backendScore?.properties?.elevation_m)
    ? backendScore.properties.elevation_m
    : fallbackMetrics.elevation_m;

  const isPendingScore =
    isScoringLoading && activeScore === null && !scoreError;
  const verdict = isPendingScore
    ? "Calculating suitability score…"
    : backendScore?.properties
      ? getVerdictLabel(activeScore, backendScore.properties.excluded)
      : getVerdictLabel(activeScore);

  const verdictColor = isPendingScore
    ? "#b5a394"
    : getScoreAccent(activeScore);
  const exclusionSummary =
    backendScore?.properties?.excluded &&
    (backendScore.properties.exclusion_reasons?.length ?? 0) > 0
      ? backendScore.properties.exclusion_reasons
          .map(formatExclusionReason)
          .join(" · ")
      : null;
  const insights = buildBackendInsights(backendScore, fallbackMetrics);
  const isSurfaceProbe = feature.properties.dataset_id === "ares_surface_probe";
  const kindLabel = isSurfaceProbe
    ? "Surface Point"
    : KIND_LABELS[feature.properties.kind] ?? "Selected Location";
  const headingTitle = isSurfaceProbe ? "Surface Point" : feature.properties.name;

  const comparisonSuffix = " (comparison only)";
  const hasComparisonSuffix = verdict.endsWith(comparisonSuffix);
  const verdictMain = hasComparisonSuffix
    ? verdict.slice(0, -comparisonSuffix.length)
    : verdict;
  const verdictSub = hasComparisonSuffix ? "(comparison only)" : null;

  const scoreNoteText = backendScore?.meta.label ??
    "Conditional heuristic EVA suitability index (0–100)";

  const missionSubtitle = feature.properties.mission
    ? `${feature.properties.mission}${
        feature.properties.landing_date
          ? ` (${feature.properties.landing_date.slice(0, 4)})`
          : ""
      }`
    : null;

  return (
    <HudSidePanel
      ariaLabel="Selected Location Details"
      mobileExpanded={isSheetExpanded}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-2.5 pb-2 md:pt-3.5 md:pb-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-semibold tracking-wider text-ares-accent-soft uppercase">
            <AresPinIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{kindLabel}</span>
            {isScoringLoading && !scoreError && (
              <span className="text-[10px] font-semibold text-ares-mute">
                · SCORING…
              </span>
            )}
            {scoreError && (
              <span
                title={scoreError}
                className="text-[10px] font-semibold text-amber-400"
              >
                · SCORE UNAVAILABLE
              </span>
            )}
          </div>
          <h2 className="mt-0.5 line-clamp-2 break-words text-[18px] leading-snug font-bold text-ares-text sm:text-[20px] sm:leading-tight">
            {headingTitle}
          </h2>
          {missionSubtitle && (
            <p className="mt-0.5 text-xs text-ares-mute">{missionSubtitle}</p>
          )}
          <p className="mt-0.5 font-mono text-[11.5px] text-ares-mute tabular-nums">
            {formatCoord(lat, lon)}
          </p>
        </div>

        <SheetWindowControls
          expanded={isSheetExpanded}
          onToggleExpand={toggleSheetExpanded}
          onClose={onClose}
          closeLabel="Close location panel"
        />
      </div>

      {/* Scrollable Card Body */}
      <div
        key={feature.properties.id}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3"
      >
        {/* NASA Viking Mosaic Banner */}
        <div className="relative h-[56px] w-full overflow-hidden rounded-none border border-ares-line bg-ares-raised sm:h-[84px]">
          {showPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={`Orbital view of ${headingTitle}`}
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
          <span className="pointer-events-none absolute right-2 bottom-1 text-[9.5px] text-ares-mute sm:right-2.5 sm:bottom-1.5 sm:text-[10px]">
            Terrain image · NASA Viking MDIM 2.1
          </span>
        </div>

        {/* Score Ring (0-100) + Verdict */}
        {unavailable ? <p className="text-sm text-amber-200">{unavailable}</p> : (
        <div className="flex items-center gap-3.5 border-b border-ares-line/80 pb-3">
          <ScoreRing key={feature.properties.id} score={activeScore} />
          <div className="min-w-0">
            <div
              className="text-[16.5px] leading-tight font-bold"
              style={{ color: verdictColor }}
            >
              {verdictMain}
            </div>
            {verdictSub && (
              <div className="mt-0.5 text-[13px] leading-tight font-semibold text-ares-text">
                {verdictSub}
              </div>
            )}
            <p className="mt-1 text-[11px] leading-snug text-ares-mute">
              {scoreNoteText.replace(" (0–100)", "")}
              {scoreNoteText.includes("(0–100)") && (
                <span className="whitespace-nowrap"> (0–100)</span>
              )}
            </p>
            {exclusionSummary && (
              <p className="mt-1 text-[10.5px] leading-snug text-rose-300/90">
                {exclusionSummary}
              </p>
            )}
            {scoreError && activeScore === null && (
              <p className="mt-1 text-[10.5px] leading-snug text-amber-300/90">
                {scoreError}
              </p>
            )}
          </div>
        </div>

        )}

        {!unavailable && backendScore && activeScore !== null && (
          <ScoreBreakdown
            key={`breakdown-${feature.properties.id}`}
            backendScore={backendScore}
            allFeatures={allFeatures}
          />
        )}

        {environment?.hazard_coverage && !unavailable && (
          <HazardCoverageCard
            key={environment.preset_id}
            coverage={environment.hazard_coverage}
          />
        )}

        {/* Advantages & Risks (1 column on phones, 2 columns >= sm) */}
        {!noTerrain && <div className="grid grid-cols-1 gap-3 border-b border-ares-line/70 pb-3 sm:grid-cols-2 sm:gap-3.5">
          {insights.pros.length > 0 && <div>
            <h4 className="mb-1.5 text-[10px] font-semibold tracking-wider text-ares-mute uppercase">
              Advantages
            </h4>
            <ul className="space-y-1.5 text-[11.5px] leading-snug text-ares-text">
              {insights.pros.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <HudBullet />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>}

          <div>
            <h4 className="mb-1.5 text-[10px] font-semibold tracking-wider text-ares-accent uppercase">
              Risks
            </h4>
            <ul className="space-y-1.5 text-[11.5px] leading-snug text-ares-text">
              {insights.risks.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <HudBullet variant="accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>}

        {/* Resources */}
        {!noTerrain && insights.resources.length > 0 && <div className="border-b border-ares-line/70 pb-3">
          <h4 className="mb-2 text-[10px] font-semibold tracking-wider text-ares-mute uppercase">
            Resources
          </h4>
          <div className="flex flex-wrap gap-2">
            {insights.resources.map((res, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-none border border-ares-line bg-ares-raised/65 px-2.5 py-1 text-[11px] text-ares-text"
              >
                <ResourceIcon label={res} />
                {res}
              </span>
            ))}
          </div>
        </div>}

        {environment?.radiation_context && !unavailable && (
          <RadiationContextCard radiation={environment.radiation_context} />
        )}

        {/* Location Features & Disclaimers */}
        <div className="space-y-3 border-t border-ares-line/60 pt-3 pb-1">
          <div>
            <h4 className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-ares-mute uppercase">
              Location Features
            </h4>
            <ul className="space-y-1 text-[11.5px] leading-snug text-ares-text">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-ares-accent-soft" />
                <span>{getLatitudeZoneLabel(lat)}</span>
              </li>
              {activeElevation !== null && (
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-ares-accent-soft" />
                  <span>
                    Elevation: {activeElevation > 0 ? "+" : ""}
                    {Math.round(activeElevation).toLocaleString("en-US")} m (MOLA)
                  </span>
                </li>
              )}
              {nearestLandingSite && (
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-ares-accent-soft" />
                  <span>
                    Nearest landing site: {nearestLandingSite.name},{" "}
                    {formatDistance(nearestLandingSite.km, distanceUnit)}
                  </span>
                </li>
              )}
            </ul>
          </div>

          <ul className="space-y-1 text-[10px] leading-relaxed text-ares-mute">
            {(backendScore?.meta.disclaimers?.length
              ? backendScore.meta.disclaimers
              : DEFAULT_DISCLAIMERS
            ).map((disclaimer, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 bg-ares-mute/70" />
                <span>{disclaimer}</span>
              </li>
            ))}
          </ul>

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

      {/* Sticky Primary Action Buttons Footer */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-ares-line/70 bg-[#100806]/96 px-4 pt-2.5 pb-4">
        <button
          type="button"
          onClick={() => onStartRouteFromHere(feature)}
          className="flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-none bg-ares-accent py-2 text-xs font-bold text-[#140c07] shadow-[0_0_20px_rgba(240,100,35,0.3)] transition-all hover:brightness-110 sm:min-h-0"
          style={{
            clipPath:
              "polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px)",
          }}
        >
          <NavigationArrowIcon weight="fill" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Route from here</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleSave(feature.properties.id)}
          className={`flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-none border py-1.5 text-xs font-semibold transition-all duration-150 sm:min-h-0 ${
            isSaved
              ? "border-ares-accent/80 bg-ares-accent/20 text-white"
              : "border-ares-line bg-ares-raised/65 text-ares-text hover:border-ares-accent/60"
          }`}
        >
          <BookmarkSimpleIcon
            weight={isSaved ? "fill" : "duotone"}
            className="h-3.5 w-3.5 shrink-0"
          />
          <span className="truncate">
            {isSaved ? "Location saved" : "Save location"}
          </span>
        </button>
      </div>
    </HudSidePanel>
  );
}

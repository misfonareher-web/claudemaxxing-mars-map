"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import type {
  AppTab,
  BackendPointScoreResponse,
  BackendRouteProperties,
  BackendRouteResponse,
  CommsStatus,
  EnvironmentSummary,
  MarsFeatureKind,
  MarsGeoJSONFeature,
  MissionPreset,
  ScoringProfileId,
} from "@/types/mars";
import { type DistanceUnit } from "@/lib/geo";
import {
  buildApiUrl,
  findPresetForPoint,
  getCentroid,
} from "@/lib/mars-scoring";
import { getSafePresetZoom } from "@/lib/mars-layers";
import { formatCoord } from "@/lib/mars-time";
import Header from "@/components/Header";
import LayersPanel from "@/components/LayersPanel";
import LocationCard, { type RouteSlot } from "@/components/LocationCard";
import BottomNavBar from "@/components/BottomNavBar";
import CommsStatusBar from "@/components/CommsStatusBar";
import SettingsView from "@/components/SettingsView";

const MarsMap = dynamic(() => import("@/components/MarsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0d0704]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-ares-accent border-t-transparent" />
        <span className="font-mono text-xs tracking-widest text-ares-mute uppercase">
          Initializing Ares Cartography...
        </span>
      </div>
    </div>
  ),
});

const STORAGE_KEY_SAVED = "ares_mars_saved_locations_v1";

function computeEnvMeanTemp(env?: EnvironmentSummary): number {
  const summaryMean = env?.summary?.air_temp_c?.mean;
  if (typeof summaryMean === "number" && Number.isFinite(summaryMean)) {
    return summaryMean;
  }
  const series = env?.series ?? [];
  const samples: number[] = [];
  for (const pt of series) {
    if (
      typeof pt.air_temp_min_c === "number" &&
      typeof pt.air_temp_max_c === "number"
    ) {
      samples.push((pt.air_temp_min_c + pt.air_temp_max_c) / 2);
    }
  }
  if (samples.length > 0) {
    return samples.reduce((acc, v) => acc + v, 0) / samples.length;
  }
  return -63;
}

export interface MarsExplorerProps {
  features: MarsGeoJSONFeature[];
  presets: MissionPreset[];
  commsStatus: CommsStatus;
  environments: {
    jezero: EnvironmentSummary;
    gale: EnvironmentSummary;
  };
}

export default function MarsExplorer({
  features,
  presets,
  commsStatus,
  environments,
}: MarsExplorerProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("map");
  const [activeBasemapKey, setActiveBasemapKey] = useState<string>("viking");
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("km");
  const scoringProfile: ScoringProfileId = "balanced";
  const [visibleKinds, setVisibleKinds] = useState<
    Record<MarsFeatureKind, boolean>
  >({
    ice: true,
    hazard: true,
    science_target: true,
    landing_site: true,
  });

  // Function 1: Selected location for inspection (open by default on right side)
  const [selectedFeature, setSelectedFeature] =
    useState<MarsGeoJSONFeature | null>(
      () =>
        features.find((f) => f.properties.id === "ls-msl") ??
        features[0] ??
        null
    );

  // Function 2: Arbitrary Point A -> Point B routing (displayed in right-hand card)
  const [routePointA, setRoutePointA] = useState<MarsGeoJSONFeature | null>(
    null
  );
  const [routePointB, setRoutePointB] = useState<MarsGeoJSONFeature | null>(
    null
  );
  const [pickingRouteSlot, setPickingRouteSlot] = useState<RouteSlot | null>(
    null
  );

  const [flyToTarget, setFlyToTarget] = useState<{
    center: [number, number]; // [lon, lat]
    zoom: number;
    seq: number;
  } | null>(null);

  const [savedIds, setSavedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_SAVED);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  // Backend scoring state for Selected Location (Function 1)
  const [scoreCache, setScoreCache] = useState<{
    key: string;
    data: BackendPointScoreResponse;
  } | null>(null);
  const [scoreErrorState, setScoreErrorState] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [markerScores, setMarkerScores] = useState<
    Record<string, number | null>
  >({});

  // Backend routing state for Point A -> Point B (Function 2)
  const [routeCache, setRouteCache] = useState<{
    key: string;
    coords: [number, number][] | null;
    properties: BackendRouteProperties;
    disclaimers?: string[];
  } | null>(null);
  const [routeErrorState, setRouteErrorState] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const selectedPointPreset = useMemo(() => {
    if (!selectedFeature) return null;
    const [lon, lat] = getCentroid(selectedFeature);
    return findPresetForPoint(lon, lat, presets);
  }, [selectedFeature, presets]);

  const currentScoreKey = useMemo(() => {
    if (!selectedFeature) return null;
    const [lon, lat] = getCentroid(selectedFeature);
    const presetPart = selectedPointPreset?.id ?? "global";
    return `${lon.toFixed(5)}:${lat.toFixed(5)}:${presetPart}:${scoringProfile}`;
  }, [selectedFeature, selectedPointPreset, scoringProfile]);

  const backendScore =
    currentScoreKey && scoreCache?.key === currentScoreKey
      ? scoreCache.data
      : null;
  const scoreError =
    currentScoreKey && scoreErrorState?.key === currentScoreKey
      ? scoreErrorState.message
      : null;
  const isScoringLoading = Boolean(
    currentScoreKey && !backendScore && !scoreError
  );

  const routePresets = useMemo(() => {
    if (!routePointA || !routePointB) return null;
    const [fromLon, fromLat] = getCentroid(routePointA);
    const [toLon, toLat] = getCentroid(routePointB);
    return {
      presetA: findPresetForPoint(fromLon, fromLat, presets),
      presetB: findPresetForPoint(toLon, toLat, presets),
    };
  }, [routePointA, routePointB, presets]);

  const activeRoutePreset =
    routePresets &&
    routePresets.presetA &&
    routePresets.presetB &&
    routePresets.presetA.id === routePresets.presetB.id
      ? routePresets.presetA
      : null;
  const activeRoutePresetId = activeRoutePreset?.id ?? "global";

  const currentRouteKey = useMemo(() => {
    if (!routePointA || !routePointB) return null;
    const [fromLon, fromLat] = getCentroid(routePointA);
    const [toLon, toLat] = getCentroid(routePointB);
    return `${fromLon.toFixed(5)},${fromLat.toFixed(5)}->${toLon.toFixed(5)},${toLat.toFixed(5)}:${activeRoutePresetId}:${scoringProfile}`;
  }, [routePointA, routePointB, activeRoutePresetId, scoringProfile]);

  const backendRouteProperties =
    currentRouteKey && routeCache?.key === currentRouteKey
      ? routeCache.properties
      : null;
  const backendRouteCoords =
    currentRouteKey &&
    routeCache?.key === currentRouteKey &&
    routeCache.properties.reachable === true
      ? routeCache.coords
      : null;
  const backendRouteDisclaimers =
    currentRouteKey && routeCache?.key === currentRouteKey
      ? (routeCache.disclaimers ?? null)
      : null;
  const routeError =
    currentRouteKey && routeErrorState?.key === currentRouteKey
      ? routeErrorState.message
      : null;
  const isRouteLoading = Boolean(
    currentRouteKey && !backendRouteProperties && !routeError
  );

  // Pre-fetch landing-site scores (preset MOLA grid for Jezero/Gale, conditional global estimate elsewhere)
  useEffect(() => {
    const controller = new AbortController();
    const candidates = features.filter(
      (feature) =>
        feature.geometry.type === "Point" &&
        feature.properties.kind === "landing_site"
    );

    if (candidates.length === 0) return () => controller.abort();

    Promise.allSettled(
      candidates.map(async (feature) => {
        const [lon, lat] = getCentroid(feature);
        const preset = findPresetForPoint(lon, lat, presets);
        const params = new URLSearchParams({
          lon: String(lon),
          lat: String(lat),
          preset: preset?.id ?? "global",
          profile: scoringProfile,
        });
        const res = await fetch(
          buildApiUrl(`/api/score/point?${params.toString()}`),
          { signal: controller.signal }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as BackendPointScoreResponse;
        return [feature.properties.id, data.properties.score ?? null] as const;
      })
    ).then((results) => {
      if (controller.signal.aborted) return;
      const updates: Record<string, number | null> = {};
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          const [id, score] = result.value;
          updates[id] = score;
        }
      }
      if (Object.keys(updates).length > 0) {
        setMarkerScores((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => controller.abort();
  }, [features, presets, scoringProfile]);

  // Fetch backend point score whenever selectedFeature or scoringProfile changes
  useEffect(() => {
    if (!selectedFeature || !currentScoreKey) return;

    const [lon, lat] = getCentroid(selectedFeature);
    const controller = new AbortController();
    const params = new URLSearchParams({
      lon: String(lon),
      lat: String(lat),
      preset: selectedPointPreset?.id ?? "global",
      profile: scoringProfile,
    });

    fetch(buildApiUrl(`/api/score/point?${params.toString()}`), {
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (payload && typeof payload.error === "string" && payload.error) ||
              `HTTP ${res.status}`
          );
        }
        return payload as BackendPointScoreResponse;
      })
      .then((data: BackendPointScoreResponse) => {
        setScoreErrorState(null);
        setScoreCache({ key: currentScoreKey, data });
        setMarkerScores((prev) => ({
          ...prev,
          [selectedFeature.properties.id]: data.properties.score ?? null,
        }));
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Point scoring error:", err);
          setScoreErrorState({
            key: currentScoreKey,
            message: err instanceof Error ? err.message : "Score unavailable",
          });
        }
      });

    return () => controller.abort();
  }, [selectedFeature, selectedPointPreset, scoringProfile, currentScoreKey]);

  // Fetch backend route whenever both Point A and Point B are set
  useEffect(() => {
    if (!routePointA || !routePointB || !currentRouteKey) {
      return;
    }

    const [fromLon, fromLat] = getCentroid(routePointA);
    const [toLon, toLat] = getCentroid(routePointB);
    const controller = new AbortController();

    fetch(buildApiUrl("/api/route"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: [fromLon, fromLat],
        to: [toLon, toLat],
        preset: activeRoutePresetId,
        profile: scoringProfile,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (payload && typeof payload.error === "string" && payload.error) ||
              `HTTP ${res.status}`
          );
        }
        return payload as BackendRouteResponse;
      })
      .then((data: BackendRouteResponse) => {
        const firstFeature = data.features?.[0];
        if (!firstFeature) {
          setRouteErrorState({
            key: currentRouteKey,
            message: "Empty route response",
          });
          return;
        }
        setRouteErrorState(null);
        setRouteCache({
          key: currentRouteKey,
          coords: firstFeature.geometry?.coordinates ?? null,
          properties: firstFeature.properties,
          disclaimers: data.meta?.disclaimers,
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Route computation error:", err);
          setRouteErrorState({
            key: currentRouteKey,
            message: err instanceof Error ? err.message : "Route error",
          });
        }
      });

    return () => controller.abort();
  }, [
    routePointA,
    routePointB,
    activeRoutePresetId,
    scoringProfile,
    currentRouteKey,
  ]);

  const handleToggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
      try {
        window.localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const handleToggleKind = useCallback((kind: MarsFeatureKind) => {
    setVisibleKinds((prev) => ({
      ...prev,
      [kind]: !prev[kind],
    }));
  }, []);

  // Saved features list (including custom/probed points if saved during session)
  const savedFeatures = useMemo(() => {
    const pool = [...features];
    for (const extra of [selectedFeature, routePointA, routePointB]) {
      if (
        extra &&
        !pool.some((f) => f.properties.id === extra.properties.id)
      ) {
        pool.push(extra);
      }
    }
    return pool.filter((f) => savedIds.includes(f.properties.id));
  }, [features, savedIds, selectedFeature, routePointA, routePointB]);

  // Unified handler when a user clicks an existing feature marker or selects a point
  const applySelectedOrPickedFeature = useCallback(
    (feature: MarsGeoJSONFeature, shouldFly = false) => {
      if (pickingRouteSlot === "A") {
        setRoutePointA(feature);
        setSelectedFeature(feature);
        setPickingRouteSlot((prev) =>
          prev === "A" ? (routePointB ? null : "B") : null
        );
      } else if (pickingRouteSlot === "B") {
        setRoutePointB(feature);
        setSelectedFeature(feature);
        setPickingRouteSlot(null);
      } else {
        setSelectedFeature(feature);
      }

      if (shouldFly) {
        const center = getCentroid(feature);
        const matchedPreset = findPresetForPoint(center[0], center[1], presets);
        setFlyToTarget((prev) => ({
          center,
          zoom: matchedPreset
            ? getSafePresetZoom(matchedPreset.default_zoom, activeBasemapKey)
            : 4.5,
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
    },
    [pickingRouteSlot, routePointB, presets, activeBasemapKey]
  );

  const handleSelectFeature = useCallback(
    (feature: MarsGeoJSONFeature) => {
      applySelectedOrPickedFeature(feature, true);
      setActiveTab("map");
    },
    [applySelectedOrPickedFeature]
  );

  // Clicking any arbitrary point on the Mars map
  const handleSelectPoint = useCallback(
    ({ lon, lat }: { lon: number; lat: number }) => {
      const id = `probe-${lat.toFixed(3)}-${lon.toFixed(3)}`;
      const coordLabel = formatCoord(lat, lon);
      const customFeature: MarsGeoJSONFeature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lon, lat],
        },
        properties: {
          id,
          kind: "science_target",
          name: `Surface Point (${coordLabel})`,
          description:
            "Arbitrary surface coordinates analyzed in real time by the ARES backend multi-criteria terrain & habitability engine.",
          dataset_id: "ares_surface_probe",
          preset_ids: [],
          confidence: "medium",
          caveat:
            "Evaluated dynamically from MOLA elevation, slope, roughness, and orbital thermal/ice datasets.",
          source_ref: "ARES Backend Engine (/api/score/point)",
        },
      };
      applySelectedOrPickedFeature(customFeature, false);
    },
    [applySelectedOrPickedFeature]
  );

  const handleSelectPresetRoute = useCallback(
    (presetId: "jezero" | "gale", mode: "from_base" | "demo") => {
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) return;
      const baseFeature =
        features.find((f) => f.properties.id === preset.base_point.id) ?? null;

      setRouteErrorState(null);
      setRouteCache(null);
      setFlyToTarget((prev) => ({
        center: preset.center,
        zoom: getSafePresetZoom(preset.default_zoom, activeBasemapKey),
        seq: (prev?.seq ?? 0) + 1,
      }));
      setActiveTab("map");

      if (!baseFeature) return;

      if (mode === "demo") {
        const targetId = preset.science_target_ids?.[0];
        const targetFeature = targetId
          ? (features.find((f) => f.properties.id === targetId) ?? null)
          : null;
        if (targetFeature) {
          setRoutePointA(baseFeature);
          setRoutePointB(targetFeature);
          setPickingRouteSlot(null);
          setSelectedFeature(targetFeature);
          return;
        }
      }

      setRoutePointA(baseFeature);
      setRoutePointB(null);
      setPickingRouteSlot("B");
      setSelectedFeature(baseFeature);
    },
    [presets, features, activeBasemapKey]
  );

  const handleSelectPreset = useCallback(
    (presetId: string | null) => {
      setActiveTab("map");
      if (!presetId) {
        setFlyToTarget((prev) => ({
          center: [15, 70],
          zoom: 2.25,
          seq: (prev?.seq ?? 0) + 1,
        }));
        return;
      }
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) return;

      const baseFeature =
        features.find((f) => f.properties.id === preset.base_point.id) ?? null;
      if (baseFeature) {
        setSelectedFeature(baseFeature);
      }
      setRoutePointA(null);
      setRoutePointB(null);
      setPickingRouteSlot(null);
      setRouteCache(null);
      setRouteErrorState(null);
      setFlyToTarget((prev) => ({
        center: preset.center,
        zoom: getSafePresetZoom(preset.default_zoom, activeBasemapKey),
        seq: (prev?.seq ?? 0) + 1,
      }));
    },
    [presets, features, activeBasemapKey]
  );

  // "Start route from here" inside LocationCard: sets current point as A and waits for B
  const handleStartRouteFromHere = useCallback(
    (feature: MarsGeoJSONFeature) => {
      const [lon, lat] = getCentroid(feature);
      const matchedPreset = findPresetForPoint(lon, lat, presets);
      setRoutePointA(feature);
      setRoutePointB(null);
      setRouteCache(null);
      setPickingRouteSlot("B");
      if (matchedPreset) {
        setFlyToTarget((prev) => ({
          center: [lon, lat],
          zoom: getSafePresetZoom(matchedPreset.default_zoom, activeBasemapKey),
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
    },
    [presets, activeBasemapKey]
  );

  // "New route" inside Route A -> B card: clears A & B and starts picking A then B
  const handleStartNewRoute = useCallback(() => {
    setRoutePointA(null);
    setRoutePointB(null);
    setRouteCache(null);
    setPickingRouteSlot("A");
  }, []);

  const handleStartPickSlot = useCallback((slot: RouteSlot) => {
    setPickingRouteSlot((prev) => (prev === slot ? null : slot));
  }, []);

  // Bottom bar "Start Navigation" button
  const handleStartNavigation = useCallback(() => {
    if (routePointA && !routePointB) {
      setPickingRouteSlot("B");
      return;
    }
    if (selectedFeature) {
      const [lon, lat] = getCentroid(selectedFeature);
      const matchedPreset = findPresetForPoint(lon, lat, presets);
      setRoutePointA(selectedFeature);
      setRoutePointB(null);
      setRouteCache(null);
      setPickingRouteSlot("B");
      if (matchedPreset) {
        setFlyToTarget((prev) => ({
          center: [lon, lat],
          zoom: getSafePresetZoom(matchedPreset.default_zoom, activeBasemapKey),
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
      return;
    }
    setPickingRouteSlot("A");
  }, [routePointA, routePointB, selectedFeature, presets, activeBasemapKey]);

  // "Clear" / "End Navigation" button
  const handleClearRoute = useCallback(() => {
    setRoutePointA(null);
    setRoutePointB(null);
    setPickingRouteSlot(null);
    setRouteCache(null);
    setRouteErrorState(null);
  }, []);

  const handleResetView = useCallback(() => {
    setFlyToTarget((prev) => ({
      center: [15, 70],
      zoom: 2.25,
      seq: (prev?.seq ?? 0) + 1,
    }));
    setActiveTab("map");
  }, []);

  const activePresetId =
    activeRoutePreset?.id ?? selectedPointPreset?.id ?? null;
  const activeEnvKey = activePresetId === "gale" ? "gale" : "jezero";
  const avgTempC = useMemo(
    () => computeEnvMeanTemp(environments[activeEnvKey]),
    [environments, activeEnvKey]
  );
  const solNumber = environments[activeEnvKey]?.sol_range?.[1] ?? 1846;
  const showRightCard = Boolean(
    selectedFeature || routePointA || routePointB || pickingRouteSlot
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ares-bg select-none">
      {/* Top HUD Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        avgTempC={avgTempC}
        solNumber={solNumber}
      />

      {/* Base 2D Map Layer (isolated stacking context so vignette stays behind HUD) */}
      <div className="relative z-0 h-full w-full">
        <MarsMap
          features={features}
          presets={presets}
          activeBasemapKey={activeBasemapKey}
          visibleKinds={visibleKinds}
          selectedFeature={selectedFeature}
          markerScores={markerScores}
          routePointA={routePointA}
          routePointB={routePointB}
          routeCoordinates={backendRouteCoords}
          flyToTarget={flyToTarget}
          onSelectFeature={handleSelectFeature}
          onSelectPoint={handleSelectPoint}
        />

        {/* Subtle warm vignette around screen edges */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              "radial-gradient(circle at center, transparent 58%, rgba(12, 5, 2, 0.65) 100%)",
          }}
        />
      </div>

      {/* Map Mode HUD Overlays */}
      {activeTab === "map" && (
        <>
          {/* Left Layers Window (Mission Presets + Survival Essentials + NASA Mars Trek Basemap) */}
          <LayersPanel
            presets={presets}
            activePresetId={activePresetId}
            onSelectPreset={handleSelectPreset}
            activeBasemapKey={activeBasemapKey}
            onSelectBasemap={setActiveBasemapKey}
            visibleKinds={visibleKinds}
            onToggleKind={handleToggleKind}
          />

          {/* Active Route Picking Banner */}
          {pickingRouteSlot && (
            <div className="pointer-events-none fixed top-24 left-1/2 z-[1000] -translate-x-1/2">
              <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-ares-accent/80 bg-[#1a0c06]/95 px-5 py-2 text-xs font-semibold text-white shadow-[0_0_25px_rgba(255,107,43,0.4)] backdrop-blur-md">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    pickingRouteSlot === "A"
                      ? "bg-emerald-500 text-black"
                      : "bg-ares-accent text-black"
                  }`}
                >
                  {pickingRouteSlot}
                </span>
                <span>
                  Click any location or point on the map to set{" "}
                  <strong>Point {pickingRouteSlot}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setPickingRouteSlot(null)}
                  className="ml-1 cursor-pointer rounded-full border border-white/20 px-2 py-0.5 text-[10px] text-ares-mute hover:border-white/50 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Right Panel: Switches cleanly between Selected Location and Route A -> B */}
          {showRightCard && (
            <LocationCard
              feature={selectedFeature}
              allFeatures={features}
              backendScore={backendScore}
              isScoringLoading={isScoringLoading}
              scoreError={scoreError}
              isSaved={
                selectedFeature
                  ? savedIds.includes(selectedFeature.properties.id)
                  : false
              }
              pointA={routePointA}
              pointB={routePointB}
              pickingSlot={pickingRouteSlot}
              distanceUnit={distanceUnit}
              routeCoordinates={backendRouteCoords}
              routeProperties={backendRouteProperties}
              routeDisclaimers={backendRouteDisclaimers}
              isRouteLoading={isRouteLoading}
              routeError={routeError}
              onStartRouteFromHere={handleStartRouteFromHere}
              onSelectPresetRoute={handleSelectPresetRoute}
              onStartNewRoute={handleStartNewRoute}
              onStartPickSlot={handleStartPickSlot}
              onClearRoute={handleClearRoute}
              onToggleSave={handleToggleSave}
              onClose={() => {
                if (routePointA || routePointB || pickingRouteSlot) {
                  handleClearRoute();
                } else {
                  setSelectedFeature(null);
                }
              }}
            />
          )}

          {/* Bottom-Left Communications Delay & Relay Status Bar */}
          <CommsStatusBar commsStatus={commsStatus} />

          {/* Bottom-Right Navigation Bar ("Start Navigation" -> "End Navigation" when 2 points are chosen) */}
          <BottomNavBar
            selectedFeature={selectedFeature}
            pointA={routePointA}
            pointB={routePointB}
            distanceUnit={distanceUnit}
            routeProperties={backendRouteProperties}
            isRouteLoading={isRouteLoading}
            onStartNavigation={handleStartNavigation}
            onEndNavigation={handleClearRoute}
          />
        </>
      )}

      {/* Settings Mode Overlay */}
      {activeTab === "settings" && (
        <SettingsView
          distanceUnit={distanceUnit}
          onChangeDistanceUnit={setDistanceUnit}
          savedFeatures={savedFeatures}
          onJumpToFeature={handleSelectFeature}
          onResetView={handleResetView}
        />
      )}
    </div>
  );
}

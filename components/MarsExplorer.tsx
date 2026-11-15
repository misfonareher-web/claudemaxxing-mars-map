"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { AresPinIcon } from "@/components/AresIcons";
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
  SavedLocationEntry,
  SavedLocationItem,
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
import { pointUnavailable } from "@/lib/terrain-availability";
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
          Initializing AreoPath Cartography...
        </span>
      </div>
    </div>
  ),
});

const STORAGE_KEY_SAVED = "ares_mars_saved_locations_v1";

function extractApiError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const errField = (payload as { error?: unknown }).error;
    if (typeof errField === "string" && errField.trim()) {
      return errField;
    }
    if (errField && typeof errField === "object") {
      const msg = (errField as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) {
        return msg;
      }
    }
  }
  return `HTTP ${status}`;
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

  // Function 1: Selected location for inspection (closed by default until user picks a point)
  const [selectedFeature, setSelectedFeature] =
    useState<MarsGeoJSONFeature | null>(null);

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
  const [manualPresetId, setManualPresetId] = useState<string | null>(null);
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
  const [desktopLayersCollapsed, setDesktopLayersCollapsed] = useState(false);
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);
  const [pickingPresetsOpen, setPickingPresetsOpen] = useState(false);
  const [commsExpanded, setCommsExpanded] = useState(false);

  const [savedEntries, setSavedEntries] = useState<SavedLocationEntry[]>([]);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY_SAVED);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const fallbackDate = new Date().toISOString();
            const entries: SavedLocationEntry[] = [];
            for (const item of parsed) {
              if (typeof item === "string") {
                entries.push({ id: item, savedAt: fallbackDate, score: null });
              } else if (
                item &&
                typeof item === "object" &&
                typeof (item as SavedLocationEntry).id === "string"
              ) {
                const entry = item as SavedLocationEntry;
                entries.push({
                  id: entry.id,
                  savedAt:
                    typeof entry.savedAt === "string"
                      ? entry.savedAt
                      : fallbackDate,
                  score:
                    typeof entry.score === "number" &&
                    Number.isFinite(entry.score)
                      ? entry.score
                      : null,
                  ...(entry.feature ? { feature: entry.feature } : {}),
                });
              }
            }
            setSavedEntries(entries);
          }
        }
      } catch {
        // Ignore storage errors
      }
    });
  }, []);

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
    if (!selectedFeature || !selectedPointPreset) return null;
    const [lon, lat] = getCentroid(selectedFeature);
    const presetPart = selectedPointPreset.id;
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
  const activeRoutePresetId = activeRoutePreset?.id;

  const currentRouteKey = useMemo(() => {
    if (!routePointA || !routePointB || !activeRoutePresetId) return null;
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

  // Pre-fetch landing-site scores (preset MOLA grid for Jezero/Gale, unavailable elsewhere)
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
        if (!preset) return null;
        const params = new URLSearchParams({
          lon: String(lon),
          lat: String(lat),
          preset: preset.id,
          profile: scoringProfile,
        });
        const res = await fetch(
          buildApiUrl(`/api/score/point?${params.toString()}`),
          { signal: controller.signal }
        );
        if (!res.ok) return null;
        const data = (await res.json().catch(() => null)) as
          | BackendPointScoreResponse
          | null;
        if (!data || typeof data !== "object" || !data.properties) return null;
        return [feature.properties.id, pointUnavailable(lon, lat, data) ? null : data.properties.score ?? null] as const;
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
    if (!selectedFeature || !selectedPointPreset || !currentScoreKey) return;

    const featureId = selectedFeature.properties.id;
    const [lon, lat] = getCentroid(selectedFeature);
    const controller = new AbortController();
    const params = new URLSearchParams({
      lon: String(lon),
      lat: String(lat),
      preset: selectedPointPreset.id,
      profile: scoringProfile,
    });

    fetch(buildApiUrl(`/api/score/point?${params.toString()}`), {
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(extractApiError(payload, res.status));
        }
        if (
          !payload ||
          typeof payload !== "object" ||
          !("properties" in payload) ||
          !payload.properties ||
          typeof payload.properties !== "object"
        ) {
          throw new Error("Invalid point scoring payload");
        }
        return payload as BackendPointScoreResponse;
      })
      .then((data: BackendPointScoreResponse) => {
        if (controller.signal.aborted) return;
        setScoreErrorState(null);
        setScoreCache({ key: currentScoreKey, data });
        setMarkerScores((prev) => ({
          ...prev,
          [featureId]: pointUnavailable(lon, lat, data) ? null : data.properties.score ?? null,
        }));
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        console.error("Point scoring error:", err);
        setScoreErrorState({
          key: currentScoreKey,
          message: err instanceof Error ? err.message : "Score unavailable",
        });
      });

    return () => controller.abort();
  }, [selectedFeature, selectedPointPreset, scoringProfile, currentScoreKey]);

  // Fetch backend route whenever both Point A and Point B are set
  useEffect(() => {
    if (!routePointA || !routePointB || !activeRoutePresetId || !currentRouteKey) {
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
          throw new Error(extractApiError(payload, res.status));
        }
        if (
          !payload ||
          typeof payload !== "object" ||
          !Array.isArray((payload as BackendRouteResponse).features)
        ) {
          throw new Error("Invalid route response payload");
        }
        return payload as BackendRouteResponse;
      })
      .then((data: BackendRouteResponse) => {
        if (controller.signal.aborted) return;
        const firstFeature = data.features?.[0];
        if (!firstFeature || !firstFeature.properties) {
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
        if (controller.signal.aborted || err?.name === "AbortError") return;
        console.error("Route computation error:", err);
        setRouteErrorState({
          key: currentRouteKey,
          message: err instanceof Error ? err.message : "Route error",
        });
      });

    return () => controller.abort();
  }, [
    routePointA,
    routePointB,
    activeRoutePresetId,
    scoringProfile,
    currentRouteKey,
  ]);

  const handleToggleSave = useCallback(
    (id: string) => {
      setSavedEntries((prev) => {
        const exists = prev.some((item) => item.id === id);
        let next: SavedLocationEntry[];
        if (exists) {
          next = prev.filter((item) => item.id !== id);
        } else {
          const matchedFeature =
            [selectedFeature, routePointA, routePointB, ...features].find(
              (f): f is MarsGeoJSONFeature =>
                Boolean(f && f.properties.id === id)
            ) ?? null;
          const activeScore =
            selectedFeature?.properties.id === id
              ? backendScore?.properties.score
              : undefined;
          const resolvedScore =
            matchedFeature && pointUnavailable(...getCentroid(matchedFeature),
              selectedFeature?.properties.id === id ? backendScore : null) ? null :
            typeof activeScore === "number"
              ? activeScore
              : typeof markerScores[id] === "number"
                ? markerScores[id]
                : typeof matchedFeature?.properties.score === "number"
                  ? matchedFeature.properties.score
                  : null;
          const isProbe =
            matchedFeature?.properties.dataset_id === "ares_surface_probe";

          next = [
            {
              id,
              savedAt: new Date().toISOString(),
              score: resolvedScore,
              ...(isProbe && matchedFeature ? { feature: matchedFeature } : {}),
            },
            ...prev,
          ];
        }
        try {
          window.localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
    },
    [
      selectedFeature,
      routePointA,
      routePointB,
      features,
      backendScore,
      markerScores,
    ]
  );

  const handleToggleKind = useCallback((kind: MarsFeatureKind) => {
    setVisibleKinds((prev) => ({
      ...prev,
      [kind]: !prev[kind],
    }));
  }, []);

  const savedIdSet = useMemo(
    () => new Set(savedEntries.map((entry) => entry.id)),
    [savedEntries]
  );

  // Saved features list with score & date metadata (persisting custom probes across selection & reload)
  const savedLocations = useMemo(() => {
    const pool = [...features];
    for (const extra of [selectedFeature, routePointA, routePointB]) {
      if (
        extra &&
        !pool.some((f) => f.properties.id === extra.properties.id)
      ) {
        pool.push(extra);
      }
    }
    const items: SavedLocationItem[] = [];
    for (const entry of savedEntries) {
      const feature =
        pool.find((f) => f.properties.id === entry.id) ?? entry.feature;
      if (!feature) continue;
      const activeScore =
        selectedFeature?.properties.id === entry.id
          ? backendScore?.properties.score
          : undefined;
      const markerScore = markerScores[entry.id];
      const score =
        pointUnavailable(...getCentroid(feature),
          selectedFeature?.properties.id === entry.id ? backendScore : null) ? null :
        typeof activeScore === "number"
          ? activeScore
          : typeof markerScore === "number"
            ? markerScore
            : typeof entry.score === "number"
              ? entry.score
              : typeof feature.properties.score === "number"
                ? feature.properties.score
                : null;
      items.push({
        feature,
        score,
        savedAt: entry.savedAt,
      });
    }
    return items;
  }, [
    features,
    savedEntries,
    selectedFeature,
    routePointA,
    routePointB,
    markerScores,
    backendScore,
  ]);

  // Unified handler when a user clicks an existing feature marker or selects a point
  const applySelectedOrPickedFeature = useCallback(
    (feature: MarsGeoJSONFeature, shouldFly = false) => {
      const center = getCentroid(feature);
      const matchedPreset = findPresetForPoint(center[0], center[1], presets);
      setManualPresetId(matchedPreset?.id ?? null);

      if (pickingRouteSlot === "A") {
        setRoutePointA(feature);
        setSelectedFeature(feature);
        setPickingPresetsOpen(false);
        setMobileSheetExpanded(false);
        setPickingRouteSlot((prev) =>
          prev === "A" ? (routePointB ? null : "B") : null
        );
      } else if (pickingRouteSlot === "B") {
        setRoutePointB(feature);
        setSelectedFeature(feature);
        setPickingPresetsOpen(false);
        setMobileSheetExpanded(false);
        setPickingRouteSlot(null);
      } else {
        setSelectedFeature(feature);
        setMobileSheetExpanded(false);
      }
      setMobileLayersOpen(false);

      if (shouldFly) {
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
      const id = `probe-${lat.toFixed(4)}-${lon.toFixed(4)}`;
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
            "Point coordinates queried against AreoPath local MOLA terrain grids (Jezero and Gale presets).",
          dataset_id: "ares_surface_probe",
          preset_ids: [],
          confidence: "medium",
          caveat:
            "Evaluated on ~460 m MOLA terrain grids when inside Jezero or Gale; outside those presets no local grid is loaded.",
          source_ref: "AreoPath Backend Engine (/api/score/point)",
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

      setManualPresetId(preset.id);
      setRouteErrorState(null);
      setRouteCache(null);
      setPickingPresetsOpen(false);
      setMobileSheetExpanded(false);
      setMobileLayersOpen(false);
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
      setPickingPresetsOpen(false);
      setMobileSheetExpanded(false);
      setMobileLayersOpen(false);
      if (!presetId) {
        setManualPresetId(null);
        setSelectedFeature(null);
        setRoutePointA(null);
        setRoutePointB(null);
        setPickingRouteSlot(null);
        setRouteCache(null);
        setRouteErrorState(null);
        setFlyToTarget((prev) => ({
          center: [15, 70],
          zoom: 2.25,
          seq: (prev?.seq ?? 0) + 1,
        }));
        return;
      }
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) return;

      setManualPresetId(preset.id);
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
      setPickingPresetsOpen(false);
      setMobileLayersOpen(false);
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
    setPickingPresetsOpen(false);
    setMobileLayersOpen(false);
    setPickingRouteSlot("A");
  }, []);

  const handleStartPickSlot = useCallback((slot: RouteSlot) => {
    setPickingPresetsOpen(false);
    setMobileLayersOpen(false);
    setPickingRouteSlot((prev) => (prev === slot ? null : slot));
  }, []);

  // Bottom bar "Start Navigation" button
  const handleStartNavigation = useCallback(() => {
    setPickingPresetsOpen(false);
    setMobileLayersOpen(false);
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
    setPickingPresetsOpen(false);
    setMobileSheetExpanded(false);
    setRouteCache(null);
    setRouteErrorState(null);
  }, []);

  const handleResetView = useCallback(() => {
    setManualPresetId(null);
    setSelectedFeature(null);
    handleClearRoute();
    setFlyToTarget((prev) => ({
      center: [15, 70],
      zoom: 2.25,
      seq: (prev?.seq ?? 0) + 1,
    }));
    setActiveTab("map");
  }, [handleClearRoute]);

  const activePresetId = routePointA || routePointB || pickingRouteSlot
    ? (activeRoutePreset?.id ?? null)
    : selectedFeature ? (selectedPointPreset?.id ?? null) : manualPresetId;
  const activeEnvironment =
    activePresetId === "jezero"
      ? environments.jezero
      : activePresetId === "gale"
        ? environments.gale
        : null;
  const showRightCard = Boolean(
    selectedFeature || routePointA || routePointB || pickingRouteSlot
  );
  const mobileSheetVisible = Boolean(
    showRightCard && (!pickingRouteSlot || pickingPresetsOpen)
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ares-bg select-none supports-[height:100dvh]:h-dvh">
      {/* Top HUD Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        environment={activeEnvironment}
      />

      {/* Base 2D Map Layer (isolated stacking context so vignette stays behind HUD) */}
      <div
        inert={activeTab === "settings"}
        aria-hidden={activeTab === "settings"}
        className="relative z-0 h-full w-full"
      >
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
          mobileSheetOpen={mobileSheetVisible}
          tabletRightOpen={showRightCard}
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
            mobileOpen={mobileLayersOpen}
            onMobileOpenChange={setMobileLayersOpen}
            desktopCollapsed={desktopLayersCollapsed}
            onDesktopCollapsedChange={setDesktopLayersCollapsed}
            hideMobileTrigger={Boolean(pickingRouteSlot)}
          />

          {/* Default Inspect Hint Banner (Desktop top bar + Mobile/Tablet non-blocking bottom pill) */}
          {!showRightCard && !pickingRouteSlot && (
            <>
              <div className="pointer-events-none fixed top-[88px] right-5 z-[900] hidden lg:block xl:right-auto xl:left-1/2 xl:-translate-x-1/2">
                <div
                  className="bg-[#f06423]/40 p-[1px] shadow-[0_14px_36px_rgba(0,0,0,0.75)] backdrop-blur-md"
                  style={{
                    clipPath:
                      "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
                  }}
                >
                  <div
                    className="flex items-center gap-2.5 bg-[#120906]/92 px-5 py-2.5 text-[13px] font-medium tracking-[0.01em] whitespace-nowrap text-[#f5ece4]"
                    style={{
                      clipPath:
                        "polygon(11.5px 0, 100% 0, 100% calc(100% - 11.5px), calc(100% - 11.5px) 100%, 0 100%, 0 11.5px)",
                    }}
                  >
                    <AresPinIcon className="h-4 w-4 shrink-0 text-[#f5ece4]" />
                    <span>
                      Click any location or point on the map to inspect it.
                    </span>
                  </div>
                </div>
              </div>

              {!mobileLayersOpen && !commsExpanded && (
                <div className="pointer-events-none fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 flex justify-center lg:hidden">
                  <div className="flex items-center gap-2 border border-ares-accent/35 bg-[#120906]/88 px-3.5 py-1.5 text-[11.5px] font-medium text-[#f5ece4] shadow-[0_10px_28px_rgba(0,0,0,0.75)] backdrop-blur-md">
                    <AresPinIcon className="h-3.5 w-3.5 shrink-0 text-ares-accent-soft" />
                    <span>Tap any marker or map point to inspect</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Active Route Picking Banner (always z-[1020] on top so never buried behind cards) */}
          {pickingRouteSlot && (
            <div className="pointer-events-none fixed inset-x-3 top-[78px] z-[1020] flex justify-center md:inset-x-auto md:top-[88px] md:left-1/2 md:-translate-x-1/2">
              <div
                className="pointer-events-auto w-full bg-ares-accent/80 p-[1px] shadow-[0_0_25px_rgba(255,107,43,0.4)] backdrop-blur-md md:w-auto"
                style={{
                  clipPath:
                    "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
                }}
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-2 bg-[#1a0c06]/95 px-3.5 py-2 text-xs font-semibold text-white md:flex-nowrap md:gap-3 md:px-5"
                  style={{
                    clipPath:
                      "polygon(11.5px 0, 100% 0, 100% calc(100% - 11.5px), calc(100% - 11.5px) 100%, 0 100%, 0 11.5px)",
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-none text-[11px] font-bold ${
                        pickingRouteSlot === "A"
                          ? "bg-emerald-500 text-black"
                          : "bg-ares-accent text-black"
                      }`}
                    >
                      {pickingRouteSlot}
                    </span>
                    <span className="leading-snug md:whitespace-nowrap">
                      <span className="md:hidden">
                        Tap map for <strong>Point {pickingRouteSlot}</strong>
                      </span>
                      <span className="hidden md:inline">
                        Click any location or point on the map to set{" "}
                        <strong>Point {pickingRouteSlot}</strong>
                      </span>
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPickingPresetsOpen((prev) => !prev)}
                      className={`min-h-[36px] cursor-pointer rounded-none border px-2.5 py-1 text-[11px] font-semibold transition-colors md:hidden ${
                        pickingPresetsOpen
                          ? "border-ares-accent bg-ares-accent/20 text-white"
                          : "border-ares-line bg-black/30 text-ares-text hover:border-ares-accent/60"
                      }`}
                    >
                      {pickingPresetsOpen ? "Hide list" : "Presets"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPickingRouteSlot(null);
                        setPickingPresetsOpen(false);
                      }}
                      className="min-h-[36px] cursor-pointer rounded-none border border-white/25 px-3 py-1 text-[11px] text-ares-mute hover:border-white/50 hover:text-white md:min-h-0 md:px-2 md:py-0.5 md:text-[10px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Right Panel (Desktop) / Bottom Sheet (Mobile) */}
          {showRightCard && (
            <LocationCard
              feature={selectedFeature}
              allFeatures={features}
              environment={activeEnvironment}
              backendScore={backendScore}
              isScoringLoading={isScoringLoading}
              scoreError={scoreError}
              isSaved={
                selectedFeature
                  ? savedIdSet.has(selectedFeature.properties.id)
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
                  setMobileSheetExpanded(false);
                }
              }}
              mobileSheetExpanded={mobileSheetExpanded}
              onToggleMobileSheetExpanded={() =>
                setMobileSheetExpanded((prev) => !prev)
              }
              hideOnMobilePicking={Boolean(
                pickingRouteSlot && !pickingPresetsOpen
              )}
            />
          )}

          {/* Communications Delay & Telemetry Status Bar (Bottom-Left desktop / Top-Right pill mobile & tablet) */}
          <CommsStatusBar
            commsStatus={commsStatus}
            environment={activeEnvironment}
            hideCompactPill={Boolean(pickingRouteSlot || mobileLayersOpen)}
            onExpandChange={setCommsExpanded}
          />

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
          savedLocations={savedLocations}
          onJumpToFeature={handleSelectFeature}
          onRemoveSaved={handleToggleSave}
          onResetView={handleResetView}
        />
      )}
    </div>
  );
}

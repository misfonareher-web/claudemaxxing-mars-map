"use client";

import { pointUnavailable } from "@/lib/terrain-availability";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AresFlagIcon,
  AresFlaskIcon,
  AresWaterIcon,
} from "@/components/AresIcons";
import {
  MarsFeatureKind,
  MarsGeoJSONFeature,
  MissionPreset,
} from "@/types/mars";
import {
  getMarsTrekTileUrl,
  MARS_BASEMAP_LAYERS,
  MarsBasemapLayer,
} from "@/lib/mars-layers";
import { KM_PER_DEG_LAT, normalizeLon } from "@/lib/geo";
import { getCentroid, getScoreAccent } from "@/lib/mars-scoring";

export interface MarsMapProps {
  features: MarsGeoJSONFeature[];
  presets: MissionPreset[];
  activeBasemapKey: string;
  visibleKinds: Record<MarsFeatureKind, boolean>;
  selectedFeature: MarsGeoJSONFeature | null;
  markerScores?: Record<string, number | null>;
  routePointA?: MarsGeoJSONFeature | null;
  routePointB?: MarsGeoJSONFeature | null;
  routeCoordinates?: [number, number][] | null; // multi-vertex [lon, lat][]
  flyToTarget: {
    center: [number, number]; // [lon, lat]
    zoom: number;
    seq: number;
  } | null;
  onSelectFeature: (feature: MarsGeoJSONFeature) => void;
  onSelectPoint?: (coords: { lon: number; lat: number }) => void;
  mobileSheetOpen?: boolean;
  tabletRightOpen?: boolean;
}

const VERTICAL_BOUNDS = L.latLngBounds(
  L.latLng(-90, -1_000_000),
  L.latLng(90, 1_000_000)
);
const WORLD_LNG_OFFSETS = [-360, 0, 360] as const;

function shiftCoords(coords: unknown, offsetLng: number): unknown {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    return [coords[0] + offsetLng, coords[1], ...coords.slice(2)];
  }
  return coords.map((item) => shiftCoords(item, offsetLng));
}

function shiftFeatureLng(
  feature: MarsGeoJSONFeature,
  offsetLng: number
): GeoJSON.GeoJsonObject {
  if (offsetLng === 0) return feature as unknown as GeoJSON.GeoJsonObject;
  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: shiftCoords(feature.geometry.coordinates, offsetLng),
    },
  } as unknown as GeoJSON.GeoJsonObject;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch] ?? ch
  );
}

/**
 * Compute minimum Leaflet EPSG:4326 zoom so the 2:1 Mars raster (256px tall at z=0)
 * always covers 100% of the viewport height with zero top/bottom black borders,
 * while longitude wraps infinitely around Mars.
 */
function computeCoverMinZoom(el: HTMLElement): number {
  const h = Math.max(el.clientHeight, 320);
  const zH = Math.log2(h / 256);
  // Step up slightly (0.05) to guarantee pixel coverage against rounding
  return Math.max(1.5, Math.ceil((zH + 0.05) * 4) / 4);
}

function getMarkerPalette(kind: MarsFeatureKind, isSelected: boolean) {
  if (kind === "landing_site") {
    return {
      ring: isSelected ? "#fff9eb" : "#fe7f2d",
      bg: isSelected ? "rgba(254, 127, 45, 0.38)" : "rgba(36, 23, 20, 0.94)",
      labelColor: "#fff9eb",
    };
  }
  if (kind === "science_target") {
    return {
      ring: isSelected ? "#fff9eb" : "#fbbf24",
      bg: isSelected ? "rgba(251, 191, 36, 0.28)" : "rgba(36, 23, 20, 0.94)",
      labelColor: "#fff9eb",
    };
  }
  return {
    ring: isSelected ? "#fff9eb" : "#38bdf8",
    bg: isSelected ? "rgba(56, 189, 248, 0.28)" : "rgba(22, 26, 32, 0.94)",
    labelColor: "#fff9eb",
  };
}

function createPointDivIcon(
  feature: MarsGeoJSONFeature,
  isSelected: boolean,
  resolvedScore: number | null
): L.DivIcon {
  const { kind, name } = feature.properties;
  const palette = getMarkerPalette(kind, isSelected);
  const size = kind === "landing_site" ? 34 : 28;

  const iconSvg = renderToStaticMarkup(
    kind === "landing_site" ? (
      <AresFlagIcon size={17} color={palette.ring} />
    ) : kind === "science_target" ? (
      <AresFlaskIcon size={15} color={palette.ring} />
    ) : (
      <AresWaterIcon size={15} color={palette.ring} />
    )
  );

  const shortName = escapeHtml(name.replace(/ \(.*\)$/, ""));
  const showScoreBadge = kind === "landing_site" || isSelected;
  const scoreBadge = showScoreBadge
    ? typeof resolvedScore === "number"
      ? `<span class="ml-1.5 font-mono text-[10px] font-semibold" style="color:${getScoreAccent(
          resolvedScore
        )}">${resolvedScore}</span>`
      : `<span class="ml-1.5 font-mono text-[10px] font-medium" style="color:#bbb0a5">score unavailable</span>`
    : "";

  return L.divIcon({
    className: "mars-custom-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div class="group relative flex items-center justify-center cursor-pointer" style="width:${size}px;height:${size}px;">
        ${
          isSelected
            ? `<span class="ares-pulse absolute inset-0 rounded-none" style="border: 1.5px solid ${palette.ring};"></span>`
            : ""
        }
        <span class="absolute inset-0 rounded-none transition-transform duration-150 group-hover:scale-110"
              style="background:${palette.bg}; border: 1.5px solid ${palette.ring}; box-shadow: 0 4px 14px rgba(0,0,0,0.55);"></span>
        <span class="relative z-10 flex items-center justify-center">${iconSvg}</span>
        <div class="mars-marker-label ${isSelected ? "is-selected" : ""} pointer-events-none ${
          kind === "landing_site" || isSelected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        } absolute left-1/2 top-full mt-1.5 -translate-x-1/2 max-w-[132px] truncate rounded-none px-1.5 py-0.5 text-[10px] font-medium transition-opacity duration-150 sm:left-full sm:top-1/2 sm:mt-0 sm:ml-2 sm:max-w-none sm:-translate-x-0 sm:-translate-y-1/2 sm:whitespace-nowrap sm:px-2 sm:text-[11px]"
             style="background: rgba(36, 23, 20, 0.95); color:${palette.labelColor}; border: 1px solid rgba(255, 249, 235, 0.16); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <span>${shortName}</span>${scoreBadge ? ` ${scoreBadge}` : ""}
        </div>
      </div>
    `,
  });
}

function createRouteEndpointDivIcon(
  badge: "A" | "B",
  label: string,
  mobilePlacement: "above" | "below" = "below"
): L.DivIcon {
  const accent = badge === "A" ? "#34d399" : "#fe7f2d";
  const bg =
    badge === "A" ? "rgba(18, 42, 33, 0.95)" : "rgba(36, 23, 20, 0.95)";
  const safeLabel = escapeHtml(label.replace(/ \(.*\)$/, ""));
  const mobilePosClass =
    mobilePlacement === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5";

  return L.divIcon({
    className: "mars-custom-marker",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `
      <div class="relative flex items-center justify-center cursor-pointer" style="width:34px;height:34px;">
        <span class="ares-pulse absolute inset-0 rounded-none" style="border: 1.5px solid ${accent};"></span>
        <span class="absolute inset-0 rounded-none" style="background:${bg}; border: 2px solid ${accent}; box-shadow: 0 0 16px ${accent}70;"></span>
        <span class="relative z-10 font-mono text-[13px] font-bold" style="color:#fff9eb">${badge}</span>
        <div class="mars-marker-label is-selected pointer-events-none absolute left-1/2 ${mobilePosClass} -translate-x-1/2 max-w-[144px] truncate rounded-none px-1.5 py-0.5 text-[10px] font-semibold sm:bottom-auto sm:left-full sm:top-1/2 sm:mt-0 sm:mb-0 sm:ml-2 sm:max-w-none sm:-translate-x-0 sm:-translate-y-1/2 sm:whitespace-nowrap sm:px-2 sm:text-[11px]"
             style="background: rgba(36, 23, 20, 0.96); color:#fff9eb; border: 1px solid ${accent}88; box-shadow: 0 4px 12px rgba(0,0,0,0.6);">
          <span style="color:${accent}">Point ${badge}:</span> <span>${safeLabel}</span>
        </div>
      </div>
    `,
  });
}

export default function MarsMap({
  features,
  presets,
  activeBasemapKey,
  visibleKinds,
  selectedFeature,
  markerScores,
  routePointA,
  routePointB,
  routeCoordinates,
  flyToTarget,
  onSelectFeature,
  onSelectPoint,
  mobileSheetOpen = false,
  tabletRightOpen = false,
}: MarsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomControlRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const mobileSheetOpenRef = useRef(mobileSheetOpen);
  const tabletRightOpenRef = useRef(tabletRightOpen);
  const [zoomMetrics, setZoomMetrics] = useState({
    zoom: 2.25,
    minZoom: 1.5,
    maxZoom: 10,
  });

  const callbacksRef = useRef({
    onSelectFeature,
    onSelectPoint,
  });

  useEffect(() => {
    callbacksRef.current = {
      onSelectFeature,
      onSelectPoint,
    };
    mobileSheetOpenRef.current = mobileSheetOpen;
    tabletRightOpenRef.current = tabletRightOpen;
  });

  // Initialize Leaflet map in EPSG:4326 with vertical bounds clamp & infinite horizontal wrap
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const minZoom = computeCoverMinZoom(el);

    const map = L.map(el, {
      crs: L.CRS.EPSG4326,
      center: [15, 70],
      zoom: Math.max(minZoom, 2.25),
      minZoom,
      maxZoom: 10,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
      wheelDebounceTime: 40,
      worldCopyJump: true,
      maxBounds: VERTICAL_BOUNDS,
      maxBoundsViscosity: 1.0,
      bounceAtZoomLimits: false,
      zoomControl: false,
      attributionControl: false,
    });

    const overlayGroup = L.layerGroup().addTo(map);

    const syncZoomMetrics = () => {
      setZoomMetrics({
        zoom: map.getZoom(),
        minZoom: map.getMinZoom(),
        maxZoom: map.getMaxZoom(),
      });
    };

    const handleZoomEnd = () => {
      pendingZoomRef.current = null;
      syncZoomMetrics();
    };

    const handleResize = () => {
      pendingZoomRef.current = null;
      map.stop();
      map.invalidateSize({ animate: false });
      const nextMin = computeCoverMinZoom(el);
      map.setMinZoom(nextMin);
      if (map.getZoom() < nextMin) {
        map.setZoom(nextMin, { animate: false });
      }
      map.panInsideBounds(VERTICAL_BOUNDS, { animate: false });
      syncZoomMetrics();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(el);
    map.on("zoom", syncZoomMetrics);
    map.on("zoomend", handleZoomEnd);
    map.on("resize", syncZoomMetrics);
    Promise.resolve().then(() => {
      if (mapRef.current === map) {
        syncZoomMetrics();
      }
    });

    map.on("click", (e: L.LeafletMouseEvent) => {
      callbacksRef.current.onSelectPoint?.({
        lat: Math.max(-90, Math.min(90, e.latlng.lat)),
        lon: normalizeLon(e.latlng.lng),
      });
    });

    mapRef.current = map;
    overlayGroupRef.current = overlayGroup;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      overlayGroupRef.current = null;
    };
  }, []);

  // Mount & switch NASA Mars Trek basemap (retain previous layer until next loads to avoid flicker)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layerCfg: MarsBasemapLayer =
      MARS_BASEMAP_LAYERS.find((l) => l.key === activeBasemapKey) ??
      MARS_BASEMAP_LAYERS[0];

    const prevLayer = tileLayerRef.current;

    const nextTileLayer = L.tileLayer(getMarsTrekTileUrl(layerCfg), {
      minZoom: 0,
      maxZoom: 10,
      maxNativeZoom: layerCfg.maxNativeZoom,
      noWrap: false,
      keepBuffer: 4,
      updateWhenZooming: false,
      updateWhenIdle: true,
    }).addTo(map);

    nextTileLayer.bringToBack();
    if (prevLayer) {
      prevLayer.bringToBack();
    }
    tileLayerRef.current = nextTileLayer;

    let removed = false;
    const cleanupPrev = () => {
      if (removed) return;
      removed = true;
      if (prevLayer && map.hasLayer(prevLayer)) {
        map.removeLayer(prevLayer);
      }
    };

    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    if (prevLayer) {
      nextTileLayer.once("load", cleanupPrev);
      fallbackTimer = setTimeout(cleanupPrev, 1500);
    }

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      nextTileLayer.off("load", cleanupPrev);
      cleanupPrev();
    };
  }, [activeBasemapKey]);

  // Prevent zoom HUD clicks and scrolls from propagating to the Leaflet map
  useEffect(() => {
    const panel = zoomControlRef.current;
    if (!panel) return;
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
  }, []);

  // Camera flyTo (always fly to nearest horizontal world copy; shift upward on mobile above sheet)
  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !flyToTarget) return;
    const [lon, lat] = flyToTarget.center;
    const currentLng = map.getCenter().lng;
    const nearestLon = lon + Math.round((currentLng - lon) / 360) * 360;
    const clampedZoom = Math.min(
      map.getMaxZoom(),
      Math.max(map.getMinZoom(), flyToTarget.zoom)
    );
    let targetLat = lat;
    let targetLon = nearestLon;
    if (el && typeof window !== "undefined" && clampedZoom >= 3.5) {
      const vw = window.innerWidth;
      if (vw < 768 && mobileSheetOpenRef.current) {
        const projected = map.project([lat, nearestLon], clampedZoom);
        const offsetPt = L.point(
          projected.x,
          projected.y + Math.round(el.clientHeight * 0.19)
        );
        const shifted = map.unproject(offsetPt, clampedZoom);
        targetLat = Math.max(-85, Math.min(85, shifted.lat));
      } else if (vw >= 768 && vw < 1024 && tabletRightOpenRef.current) {
        const projected = map.project([lat, nearestLon], clampedZoom);
        const offsetPt = L.point(projected.x + 174, projected.y);
        const shifted = map.unproject(offsetPt, clampedZoom);
        targetLon = shifted.lng;
      }
    }
    pendingZoomRef.current = null;
    map.stop();
    map.flyTo([targetLat, targetLon], clampedZoom, {
      duration: 0.75,
      easeLinearity: 0.25,
    });
  }, [flyToTarget]);

  const handleStepZoom = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const minZ = map.getMinZoom();
    const maxZ = map.getMaxZoom();
    const base = pendingZoomRef.current ?? map.getZoom();
    const clamped = Math.min(
      maxZ,
      Math.max(minZ, Math.round((base + delta) * 4) / 4)
    );
    map.stop();
    pendingZoomRef.current = clamped;
    map.setZoom(clamped, { animate: true });
  }, []);

  const handleResetZoom = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const resetZoom = Math.min(
      map.getMaxZoom(),
      Math.max(map.getMinZoom(), 2.25)
    );
    const currentLng = map.getCenter().lng;
    const nearestLon = 70 + Math.round((currentLng - 70) / 360) * 360;
    pendingZoomRef.current = null;
    map.stop();
    map.flyTo([15, nearestLon], resetZoom, {
      duration: 0.65,
      easeLinearity: 0.25,
    });
  }, []);

  // Render GeoJSON overlays, EVA rings & active navigation route
  useEffect(() => {
    const group = overlayGroupRef.current;
    if (!group) return;

    group.clearLayers();

    // Preset MOLA grid bboxes & 10 km EVA rings (wrapped across world copies)
    presets.forEach((preset) => {
      const [w, s, e, n] = preset.bbox;
      const latRadius = preset.eva_max_radius_km / KM_PER_DEG_LAT;
      const lonRadius =
        latRadius /
        Math.max(0.2, Math.cos((preset.base_point.lat * Math.PI) / 180));

      WORLD_LNG_OFFSETS.forEach((offsetLng) => {
        L.rectangle(
          [
            [s, w + offsetLng],
            [n, e + offsetLng],
          ],
          {
            color: "#ff9f5a",
            weight: 1.2,
            dashArray: "2 4",
            fillColor: "#ff9f5a",
            fillOpacity: 0.03,
            opacity: 0.55,
            interactive: false,
          }
        ).addTo(group);

        const pts: [number, number][] = [];
        for (let i = 0; i <= 64; i++) {
          const theta = (i / 64) * Math.PI * 2;
          pts.push([
            preset.base_point.lat + Math.sin(theta) * latRadius,
            preset.base_point.lon + offsetLng + Math.cos(theta) * lonRadius,
          ]);
        }

        L.polyline(pts, {
          color: "#fe7f2d",
          weight: 1.5,
          dashArray: "5 6",
          opacity: 0.75,
          interactive: false,
        }).addTo(group);
      });
    });

    // Polygon & MultiPolygon layers (hazards: steep_slope + sand_dunes, ice bands)
    features.forEach((feature) => {
      const { kind, id, hazard_kind, severity } = feature.properties;
      if (!visibleKinds[kind] || feature.geometry.type === "Point") return;

      const isSelected = selectedFeature?.properties.id === id;
      const isDunes = hazard_kind === "sand_dunes";

      const style: L.PathOptions =
        kind === "hazard"
          ? isDunes
            ? {
                color: "#f59e0b",
                weight: isSelected ? 2.5 : 1.5,
                dashArray: "4 3",
                fillColor: "#f59e0b",
                fillOpacity: isSelected ? 0.36 : 0.2,
              }
            : {
                color: severity && severity >= 3 ? "#ef4444" : "#fe7f2d",
                weight: isSelected ? 2.5 : 1.5,
                fillColor: severity && severity >= 3 ? "#ef4444" : "#fe7f2d",
                fillOpacity: isSelected ? 0.4 : 0.22,
              }
          : {
              color: "#38bdf8",
              weight: isSelected ? 2 : 1,
              dashArray: "4 4",
              fillColor: "#38bdf8",
              fillOpacity: isSelected ? 0.22 : 0.1,
            };

      WORLD_LNG_OFFSETS.forEach((offsetLng) => {
        L.geoJSON(shiftFeatureLng(feature, offsetLng), {
          style: () => style,
          onEachFeature: (_f, layer) => {
            layer.on("click", (e) => {
              L.DomEvent.stopPropagation(e);
              callbacksRef.current.onSelectFeature(feature);
            });
          },
        }).addTo(group);
      });
    });

    // Active navigation route path (multi-vertex A* path, wrapped; no straight-line fallback)
    const activeCoords: [number, number][] | null =
      routeCoordinates && routeCoordinates.length >= 2
        ? routeCoordinates
        : null;

    if (activeCoords && activeCoords.length >= 2) {
      // Unwrap consecutive longitudes so lines crossing ±180° stay continuous
      const unwrapped: [number, number][] = [activeCoords[0]];
      for (let i = 1; i < activeCoords.length; i++) {
        const prevLon = unwrapped[i - 1][0];
        const [curLon, curLat] = activeCoords[i];
        const delta = ((((curLon - prevLon + 540) % 360) + 360) % 360) - 180;
        unwrapped.push([prevLon + delta, curLat]);
      }

      WORLD_LNG_OFFSETS.forEach((offsetLng) => {
        const latLngs: [number, number][] = unwrapped.map(([lon, lat]) => [
          lat,
          lon + offsetLng,
        ]);

        // Soft outer glow
        L.polyline(latLngs, {
          color: "#fe7f2d",
          weight: 7,
          opacity: 0.3,
          interactive: false,
        }).addTo(group);

        // Crisp inner dashed path
        L.polyline(latLngs, {
          color: "#ffaf70",
          weight: 3,
          dashArray: "8 7",
          opacity: 0.96,
          interactive: false,
        }).addTo(group);
      });
    }

    // Point markers (wrapped across world copies), including any custom clicked point
    const pointFeatures =
      selectedFeature &&
      selectedFeature.geometry.type === "Point" &&
      !features.some((f) => f.properties.id === selectedFeature.properties.id)
        ? [...features, selectedFeature]
        : features;

    pointFeatures.forEach((feature) => {
      const { kind, id, dataset_id } = feature.properties;
      const isRouteEndpoint =
        routePointA?.properties.id === id || routePointB?.properties.id === id;
      if (isRouteEndpoint) return;

      const isCustom =
        id.startsWith("probe-") ||
        id.startsWith("custom-point-") ||
        dataset_id === "ares_surface_probe";
      if (!isCustom && (!visibleKinds[kind] || feature.geometry.type !== "Point")) {
        return;
      }

      const [lon, lat] = getCentroid(feature);
      const isSelected = selectedFeature?.properties.id === id;
      const resolvedScore =
        pointUnavailable(lon, lat) ? null :
        id in (markerScores ?? {}) ? markerScores![id] : feature.properties.score ?? null;
      const markerIcon = createPointDivIcon(feature, isSelected, resolvedScore);
      const zIndexOffset =
        (isSelected ? 400 : 0) +
        (kind === "landing_site"
          ? 300
          : kind === "science_target"
            ? 200
            : 100);

      WORLD_LNG_OFFSETS.forEach((offsetLng) => {
        L.marker([lat, lon + offsetLng], {
          icon: markerIcon,
          zIndexOffset,
        })
          .on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            callbacksRef.current.onSelectFeature(feature);
          })
          .addTo(group);
      });
    });

    // Dedicated Point A and Point B route markers (separate northern/southern labels on mobile)
    const endpoints: { badge: "A" | "B"; feat: MarsGeoJSONFeature; lat: number; lon: number }[] = [];
    if (routePointA) {
      const [lon, lat] = getCentroid(routePointA);
      endpoints.push({ badge: "A", feat: routePointA, lat, lon });
    }
    if (routePointB) {
      const [lon, lat] = getCentroid(routePointB);
      endpoints.push({ badge: "B", feat: routePointB, lat, lon });
    }

    endpoints.forEach(({ badge, feat, lat, lon }) => {
      let mobilePlacement: "above" | "below" = "below";
      if (endpoints.length === 2) {
        const other = endpoints.find((ep) => ep.badge !== badge);
        if (other && (lat > other.lat || (lat === other.lat && badge === "B"))) {
          mobilePlacement = "above";
        }
      }
      const icon = createRouteEndpointDivIcon(
        badge,
        feat.properties.name,
        mobilePlacement
      );
      WORLD_LNG_OFFSETS.forEach((offsetLng) => {
        L.marker([lat, lon + offsetLng], {
          icon,
          zIndexOffset: 900 + (badge === "B" ? 10 : 0),
        })
          .on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            callbacksRef.current.onSelectFeature(feat);
          })
          .addTo(group);
      });
    });
  }, [
    features,
    presets,
    visibleKinds,
    selectedFeature,
    markerScores,
    routePointA,
    routePointB,
    routeCoordinates,
  ]);

  const overviewZoom = Math.max(zoomMetrics.minZoom, 2.25);
  const safeZoom = Number.isFinite(zoomMetrics.zoom)
    ? zoomMetrics.zoom
    : overviewZoom;
  const scalePercent = Math.round(Math.pow(2, safeZoom - overviewZoom) * 100);
  const canZoomIn = safeZoom < zoomMetrics.maxZoom - 0.05;
  const canZoomOut = safeZoom > zoomMetrics.minZoom + 0.05;
  const isAtOverview = Math.abs(safeZoom - overviewZoom) < 0.1;

  return (
    <>
      <div
        className={`absolute inset-0 z-0 ${mobileSheetOpen ? "mars-sheet-open" : ""}`}
      >
        {/* Keep static className on Leaflet mount node so React never strips runtime .leaflet-container classes */}
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <div
        ref={zoomControlRef}
        aria-label="Map zoom controls"
        className="fixed top-[128px] right-2.5 z-[940] flex w-[42px] flex-col items-center divide-y divide-[rgba(255,249,235,0.16)] rounded-none border border-[rgba(255,249,235,0.16)] bg-ares-panel/95 text-ares-text shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md select-none sm:right-3 sm:w-[46px] md:top-[132px] md:right-auto md:bottom-auto md:left-3 lg:top-[88px] lg:left-[284px]"
      >
        <button
          type="button"
          onClick={() => handleStepZoom(0.5)}
          disabled={!canZoomIn}
          aria-label="Zoom in"
          title="Zoom in (+)"
          className="flex h-[40px] w-full cursor-pointer items-center justify-center rounded-none text-[22px] leading-none font-normal text-ares-mute transition hover:bg-ares-raised hover:text-ares-text active:bg-ares-raised disabled:cursor-not-allowed disabled:opacity-35 sm:h-[44px] sm:text-[24px]"
        >
          +
        </button>

        <button
          type="button"
          onClick={handleResetZoom}
          aria-label={isAtOverview ? "Zoom at 100% overview" : "Reset zoom to 100% overview"}
          title={
            isAtOverview
              ? `Zoom z${zoomMetrics.zoom.toFixed(2)} (100%)`
              : `Zoom z${zoomMetrics.zoom.toFixed(2)} — click to reset to 100%`
          }
          className={`flex h-[40px] w-full cursor-pointer items-center justify-center rounded-none font-sans text-[12px] font-medium tabular-nums transition sm:h-[44px] ${
            isAtOverview
              ? "text-ares-mute hover:bg-ares-raised hover:text-ares-text"
              : "bg-[rgba(254,127,45,0.13)] text-ares-accent hover:bg-[rgba(254,127,45,0.22)]"
          }`}
        >
          {scalePercent}%
        </button>

        <button
          type="button"
          onClick={() => handleStepZoom(-0.5)}
          disabled={!canZoomOut}
          aria-label="Zoom out"
          title="Zoom out (-)"
          className="flex h-[40px] w-full cursor-pointer items-center justify-center rounded-none text-[22px] leading-none font-normal text-ares-mute transition hover:bg-ares-raised hover:text-ares-text active:bg-ares-raised disabled:cursor-not-allowed disabled:opacity-35 sm:h-[44px] sm:text-[24px]"
        >
          −
        </button>
      </div>
    </>
  );
}

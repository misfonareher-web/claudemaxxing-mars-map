import presetsConfig from "@/config/mission_presets.json";
import type { BackendPointScoreResponse, MissionPreset } from "@/types/mars";
import { findPresetForPoint } from "@/lib/mars-scoring";
import { greatCircleKm } from "@/lib/geo";

export const NO_TERRAIN = "No terrain grid here; EVA score unavailable";
export const NO_ROUTE = "Routes are planned only within 10 km of a base in Jezero or Gale";

export function terrainPreset(lon: number, lat: number) {
  return findPresetForPoint(lon, lat, presetsConfig.presets as MissionPreset[]);
}

export function pointUnavailable(lon: number, lat: number, score?: BackendPointScoreResponse | null): string | null {
  const preset = terrainPreset(lon, lat);
  if (!preset || score?.meta.preset_id === "global" || score?.properties.data_flags?.includes("terrain_unavailable")) return NO_TERRAIN;
  const distance = greatCircleKm({ lon, lat }, preset.base_point);
  if (distance > preset.eva_max_radius_km || score?.properties.exclusion_reasons?.includes("beyond_eva_radius") || score?.properties.data_flags?.includes("beyond_eva_radius")) {
    const km = score?.properties.factors?.base_distance?.value ?? distance;
    return `Outside demo EVA radius (${km.toFixed(1)} km from base; limit 10 km)`;
  }
  return null;
}

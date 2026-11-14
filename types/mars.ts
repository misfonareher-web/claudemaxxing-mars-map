export type MarsFeatureKind =
  | "landing_site"
  | "ice"
  | "hazard"
  | "science_target";

export type MarsConfidence = "high" | "medium" | "low";

export interface MarsFeatureProperties {
  id: string;
  kind: MarsFeatureKind;
  name: string;
  description: string;
  dataset_id: string;
  preset_ids: string[];
  confidence: MarsConfidence;
  caveat: string;
  source_ref: string;
  synthetic?: boolean;

  // Landing site fields (data/landing_sites.geojson)
  mission?: string;
  agency?: string;
  landing_date?: string;
  status?: "active" | "ended" | string;

  // Ice fields (data/ice.geojson)
  ice_metric?: string;
  ice_value?: number | null;
  depth_estimate_m?: number | null;

  // Hazard fields (data/hazards.geojson)
  hazard_kind?: string;
  severity?: number;
  derived?: boolean;

  // Science target fields (data/science_targets.geojson)
  priority?: number;
  science_goal?: string;

  // Survival score & breakdown fields (populated by Sanya's scoring script or frontend heuristic)
  score?: number; // 0-100 survival score
  elevation_m?: number;
  slope_deg?: number;
  pros?: string[];
  risks?: string[];
  resources?: string[];
}

export type MarsGeometry =
  | {
      type: "Point";
      coordinates: [number, number]; // [lon, lat]
    }
  | {
      type: "Polygon";
      coordinates: [number, number][][];
    }
  | {
      type: "MultiPolygon";
      coordinates: [number, number][][][];
    };

export interface MarsGeoJSONFeature {
  type: "Feature";
  geometry: MarsGeometry;
  properties: MarsFeatureProperties;
}

export interface MarsGeoJSONCollection {
  type: "FeatureCollection";
  crs_note?: string;
  dataset_ids?: string[];
  features: MarsGeoJSONFeature[];
}

export interface MissionPreset {
  id: string;
  name: string;
  mission: string;
  status: string;
  scenario: string;
  bbox: [number, number, number, number]; // [min_lon, min_lat, max_lon, max_lat]
  center: [number, number]; // [lon, lat]
  default_zoom: number;
  base_point: {
    id: string;
    name: string;
    lon: number;
    lat: number;
  };
  eva_max_radius_km: number;
  science_target_ids: string[];
  environment_dataset_id: string;
}

export interface EnvironmentSeriesPoint {
  sol: number;
  air_temp_min_c?: number;
  air_temp_max_c?: number;
  ground_temp_min_c?: number;
  ground_temp_max_c?: number;
  pressure_mean_pa?: number;
  relative_humidity_mean_pct?: number;
}

export interface EnvironmentSummary {
  preset_id: string;
  dataset_id: string;
  station: { name: string; lon: number; lat: number };
  sol_range: [number, number];
  summary: {
    air_temp_c: { min: number; max: number; mean: number | null };
    pressure_pa: { min: number; max: number; mean: number | null };
    relative_humidity_pct?: { min: number; max: number; mean: number | null };
    ground_temp_max_c?: { min: number; max: number; mean: number | null };
  };
  series?: EnvironmentSeriesPoint[];
  caveat: string;
}

export type AppTab = "map" | "settings";

export type ScoringProfileId =
  | "balanced"
  | "safety_first"
  | "science_first"
  | "resource_first";

export type ScoringFactorKey =
  | "slope"
  | "roughness"
  | "thermal"
  | "ice"
  | "science"
  | "base_distance";

export interface ScoringFactorBreakdown {
  value: number | null;
  units: string;
  subscore: number | null;
  weight: number;
  contribution: number;
  available: boolean;
}

export interface BackendPointScoreResponse {
  type: "Feature";
  id: string;
  geometry: {
    type: "Polygon" | "Point";
    coordinates: unknown;
  };
  properties: {
    cell_id: string;
    row?: number;
    col?: number;
    center: [number, number]; // [lon, lat]
    elevation_m?: number | null;
    score: number | null;
    excluded: boolean;
    exclusion_reasons: string[];
    factors: Record<ScoringFactorKey, ScoringFactorBreakdown>;
    hazard_ids: string[];
    data_flags: string[];
  };
  meta: {
    preset_id: string;
    profile: ScoringProfileId;
    weights: Record<ScoringFactorKey, number>;
    effective_weights: Record<ScoringFactorKey, number>;
    methodology_version: string;
    label: string;
    disclaimers: string[];
    datasets: string[];
    data_flags: string[];
  };
}

export interface BackendRouteProperties {
  distance_km: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  max_slope_deg: number | null;
  mean_score: number | null;
  steps: number;
  reachable: boolean;
}

export interface BackendRouteResponse {
  type: "FeatureCollection";
  crs_note: string;
  meta: {
    preset_id: string;
    profile: ScoringProfileId;
    label: string;
    disclaimers: string[];
    data_flags: string[];
  };
  features: {
    type: "Feature";
    geometry: {
      type: "LineString";
      coordinates: [number, number][]; // [lon, lat][]
    } | null;
    properties: BackendRouteProperties;
  }[];
}


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

export interface MissionRecord {
  id: string;
  name: string;
  agency: string;
  mission_type: string;
  launch_date: string;
  landing_date?: string;
  end_date?: string | null;
  status: string;
  landing_site_id?: string;
  instruments: string[];
  key_results: {
    text: string;
    source_url: string;
  }[];
  source_url: string;
  dataset_id: string;
}

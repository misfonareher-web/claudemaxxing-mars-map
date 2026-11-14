export type MarsCategory = "landing_site" | "ice" | "hazard";

export interface MarsPointProperties {
  name: string;
  category: MarsCategory;
  year?: number;
  mission?: string;
  elevation_m?: number;
  score: number; // 0-100 survival score
  pros: string[];
  risks: string[];
  resources: string[];
  source?: string;
}

export interface MarsGeoJSONFeature {
  type: "Feature";
  id?: string;
  geometry: {
    type: "Point" | "Polygon";
    coordinates: [number, number] | [number, number][][]; // [lon, lat]
  };
  properties: MarsPointProperties;
}

export interface MarsGeoJSONCollection {
  type: "FeatureCollection";
  features: MarsGeoJSONFeature[];
}


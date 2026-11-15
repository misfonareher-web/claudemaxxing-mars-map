import { MarsGeoJSONFeature, MissionPreset } from "@/types/mars";

export const DEFAULT_DISCLAIMERS: string[] = [
  "The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.",
  "Absence of a mapped hazard does not mean the terrain is safe.",
  "Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.",
];

export const DEFAULT_ROUTE_DISCLAIMERS: string[] = [
  "The route is a heuristic least-cost path on a coarse grid, not a validated traverse plan.",
  ...DEFAULT_DISCLAIMERS,
];

export function buildApiUrl(apiPath: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return apiPath;
  return `${base}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
}

export function findPresetForPoint(
  lon: number,
  lat: number,
  presets: MissionPreset[]
): MissionPreset | null {
  for (const preset of presets) {
    const [w, s, e, n] = preset.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) {
      return preset;
    }
  }
  return null;
}

export interface SurvivalMetrics {
  score: number | null;
  verdict: string;
  elevation_m: number | null;
  summary: string;
  pros: string[];
  risks: string[];
  resources: string[];
}

const KNOWN_SITE_METRICS: Record<string, Partial<SurvivalMetrics>> = {
  "ls-mars2020": {
    elevation_m: -2500,
    summary:
      "Ancient lake-delta basin with hydrated clay minerals, low-altitude atmosphere, and near-equatorial solar geometry.",
    pros: [
      "Ancient water evidence",
      "Low elevation (-2.5 km)",
      "Near-equatorial solar",
    ],
    risks: [
      "Steep delta scarps",
      "Séítah sand dunes",
      "Context-only ice proxy",
    ],
    resources: ["Hydrated clay minerals"],
  },
  "ls-msl": {
    elevation_m: -4500,
    summary:
      "Deep equatorial crater basin with dense atmosphere, hydrated sulfates, and multi-year REMS rover weather records.",
    pros: [
      "Dense atmosphere (-4.5 km)",
      "Equatorial solar geometry",
      "Bound water in sulfates",
    ],
    risks: [
      "Bagnold dune fields",
      "Steep Mount Sharp slopes",
      "Abrasive ventifacts",
    ],
    resources: ["Clay & sulfate beds", "Dense CO2 air"],
  },
  "ls-insight": {
    elevation_m: -2655,
    summary:
      "Flat equatorial plains in Elysium Planitia offering smooth landing terrain and deep regolith.",
    pros: [
      "Flat landing terrain",
      "Equatorial sunlight",
      "Deep regolith layer",
    ],
    risks: [
      "Solar dust buildup",
      "Scarce near-surface ice",
      "Open wind exposure",
    ],
    resources: ["Unconsolidated regolith"],
  },
  "ls-phoenix": {
    elevation_m: -4100,
    summary:
      "Northern permafrost plains where shallow water ice was observed beneath the regolith.",
    pros: [
      "Observed shallow ice",
      "Low northern basin",
      "Flat polygon plains",
    ],
    risks: [
      "Polar winter darkness",
      "Extreme cold (-100°C+)",
      "CO2 frost burial",
    ],
    resources: ["Shallow water ice", "Dense CO2 air"],
  },
  "ls-zhurong": {
    elevation_m: -4000,
    summary:
      "Southern Utopia Planitia volcanic-sedimentary plains with low elevation and regional neutron proxy context.",
    pros: [
      "Deep basin air density",
      "Smooth volcanic plains",
      "Low northern elevation",
    ],
    risks: [
      "Winter dust storms",
      "Lower winter solar angle",
      "Seasonal frost",
    ],
    resources: ["Regional hydrogen proxy", "Basaltic plains"],
  },
  "ls-viking1": {
    elevation_m: -3600,
    summary:
      "Low-lying Chryse Planitia outflow basin with proven landing history and sub-tropical solar conditions.",
    pros: [
      "Low basin elevation",
      "Balanced latitude (22°N)",
      "Ancient flood deposits",
    ],
    risks: [
      "Scattered rock fields",
      "Limited ice evidence",
      "Regional dust events",
    ],
    resources: ["Iron-rich regolith"],
  },
  "ls-viking2": {
    elevation_m: -4500,
    summary:
      "Deep northern Utopia Planitia site with seasonal water-ice frost and thick atmospheric column.",
    pros: [
      "Very low elevation (-4.5 km)",
      "Seasonal frost observations",
    ],
    risks: [
      "Cold mid-latitude winters",
      "Angular boulder fields",
      "Reduced winter sunlight",
    ],
    resources: ["Seasonal frost", "Dense CO2 air"],
  },
  "ls-pathfinder": {
    elevation_m: -3680,
    summary:
      "Ares Vallis outflow channel confluence delivering diverse crustal rocks at low elevation.",
    pros: [
      "Low elevation (-3.7 km)",
      "Strong solar irradiance",
      "Diverse flood geology",
    ],
    risks: [
      "Rocky uneven ridges",
      "Frequent dust devils",
      "Limited local water",
    ],
    resources: ["Diverse mineral suite"],
  },
  "ls-spirit": {
    elevation_m: -1940,
    summary:
      "Gusev Crater plains containing ancient hydrothermal silica deposits and dust-devil wind cleaning.",
    pros: [
      "Hydrothermal silica beds",
      "Low-latitude solar flux",
      "Wind-cleaned panels",
    ],
    risks: [
      "Loose sulfate sand traps",
      "Higher crater elevation",
      "Rocky Columbia Hills",
    ],
    resources: ["Amorphous silica"],
  },
  "ls-opportunity": {
    elevation_m: -1400,
    summary:
      "Flat equatorial Meridiani Planum plains rich in hematite and water-altered sulfate bedrock.",
    pros: [
      "Ultra-flat plains",
      "Peak equatorial solar",
      "Water-formed sulfates",
    ],
    risks: [
      "Higher elevation (-1.4 km)",
      "Global dust storms",
      "Low bulk ground ice",
    ],
    resources: ["Hematite & sulfates"],
  },
};

export function getCentroid(feature: MarsGeoJSONFeature): [number, number] {
  const geom = feature.geometry;
  if (geom.type === "Point") {
    return geom.coordinates;
  }
  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0] ?? [];
    if (ring.length === 0) return [0, 0];
    const sum = ring.reduce(
      (acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat],
      [0, 0]
    );
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  if (geom.type === "MultiPolygon") {
    const ring = geom.coordinates[0]?.[0] ?? [];
    if (ring.length === 0) return [0, 0];
    const sum = ring.reduce(
      (acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat],
      [0, 0]
    );
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  return [0, 0];
}

export function getScoreAccent(score: number | null | undefined): string {
  if (score === null || score === undefined) return "#7c685e";
  if (score >= 70) return "#34d399";
  if (score >= 50) return "#f06423";
  return "#ef4444";
}

export function getVerdictLabel(
  score: number | null | undefined,
  excluded?: boolean
): string {
  if (score === null || score === undefined) return "Score unavailable";
  if (excluded) return "Excluded — Outside EVA / Terrain Constraints";
  if (score >= 70) return "Higher relative suitability (comparison only)";
  if (score >= 50) return "Moderate relative suitability (comparison only)";
  if (score >= 32) return "Lower relative suitability (comparison only)";
  return "Low relative suitability (comparison only)";
}

export function getSurvivalMetrics(
  feature: MarsGeoJSONFeature
): SurvivalMetrics {
  const props = feature.properties;
  const known = KNOWN_SITE_METRICS[props.id];
  const [, lat] = getCentroid(feature);
  const absLat = Math.abs(lat);
  const score = props.score ?? null;

  if (known) {
    return {
      score,
      verdict: getVerdictLabel(score),
      elevation_m: props.elevation_m ?? known.elevation_m ?? null,
      summary: known.summary ?? props.description,
      pros: props.pros ?? known.pros ?? [],
      risks: props.risks ?? known.risks ?? [],
      resources: props.resources ?? known.resources ?? [],
    };
  }

  if (props.kind === "hazard") {
    const isDunes = props.hazard_kind === "sand_dunes";
    const sev = props.severity ?? 2;
    return {
      score,
      verdict: getVerdictLabel(score),
      elevation_m: props.elevation_m ?? null,
      summary: props.description,
      pros: props.pros ?? [
        isDunes ? "Aeolian morphology study area" : "Exposed bedrock strata",
        "Mapped orbital hazard unit",
      ],
      risks: props.risks ?? [
        isDunes
          ? "Loose sand wheel sinkage & entrapment"
          : `Steep MOLA slope (Severity ${sev}/3)`,
        isDunes ? "Abrasive windblown sand" : "Landing & rover instability",
      ],
      resources: props.resources ?? [
        isDunes ? "Aeolian basalt sand" : "Exposed mineral outcrops",
      ],
    };
  }

  if (props.kind === "ice") {
    return {
      score,
      verdict: getVerdictLabel(score),
      elevation_m: props.elevation_m ?? null,
      summary: props.description,
      pros: props.pros ?? [
        "Water/hydrogen detection",
        props.depth_estimate_m
          ? `Shallow ice (~${props.depth_estimate_m} m)`
          : "Orbital hydrogen proxy",
      ],
      risks: props.risks ?? [
        absLat > 50
          ? `Extreme polar cold (${lat.toFixed(1)}°)`
          : "Coarse orbital footprint",
        "Presence ≠ extractability",
      ],
      resources: props.resources ?? [
        props.ice_metric ?? "Hydrogen proxy",
        "Atmospheric CO2",
      ],
    };
  }

  if (props.kind === "science_target") {
    return {
      score,
      verdict: getVerdictLabel(score),
      elevation_m: props.elevation_m ?? null,
      summary: props.science_goal ?? props.description,
      pros: props.pros ?? [
        `Priority ${props.priority ?? 1} science site`,
        "Within preset scenario bbox",
      ],
      risks: props.risks ?? [
        "Slope hazards on approach",
        "Rough rocky outcrops",
      ],
      resources: props.resources ?? [
        "Hydrated sediments",
      ],
    };
  }

  return {
    score,
    verdict: getVerdictLabel(score),
    elevation_m: props.elevation_m ?? null,
    summary: props.description,
    pros: props.pros ?? [props.description],
    risks: props.risks ?? [props.caveat],
    resources: props.resources ?? [],
  };
}

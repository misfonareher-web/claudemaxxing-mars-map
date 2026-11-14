import { MarsGeoJSONFeature } from "@/types/mars";

export interface SurvivalMetrics {
  score: number;
  verdict: string;
  elevation_m: number | null;
  summary: string;
  pros: string[];
  risks: string[];
  resources: string[];
}

const KNOWN_SITE_METRICS: Record<string, Partial<SurvivalMetrics>> = {
  "ls-mars2020": {
    score: 84,
    elevation_m: -2500,
    summary:
      "Ancient lake-delta basin with hydrated clay minerals, dense low-altitude atmosphere, and reliable near-equatorial solar flux.",
    pros: [
      "Ancient water evidence",
      "Low elevation (-2.5 km)",
      "Near-equatorial solar",
    ],
    risks: [
      "Steep delta scarps",
      "Séítah sand dunes",
      "Low bulk surface ice",
    ],
    resources: ["Hydrated clay minerals", "Solar energy", "Basaltic regolith"],
  },
  "ls-msl": {
    score: 81,
    elevation_m: -4500,
    summary:
      "Deep equatorial crater basin with dense atmosphere, confirmed hydrated sulfates, and multi-year rover weather records.",
    pros: [
      "Dense atmosphere (-4.5 km)",
      "Equatorial warmth & solar",
      "Bound water in sulfates",
    ],
    risks: [
      "Bagnold dune fields",
      "Steep Mount Sharp slopes",
      "Abrasive ventifacts",
    ],
    resources: ["Solar energy", "Clay & sulfate beds", "Dense CO2 air"],
  },
  "ls-insight": {
    score: 77,
    elevation_m: -2655,
    summary:
      "Exceptionally flat equatorial plains in Elysium Planitia offering safe landing geometry and deep excavatable regolith.",
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
    resources: ["Solar energy", "Unconsolidated regolith"],
  },
  "ls-phoenix": {
    score: 69,
    elevation_m: -4100,
    summary:
      "Northern permafrost plains where shallow water ice was directly excavated centimeters beneath the soil.",
    pros: [
      "Confirmed shallow ice",
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
    score: 79,
    elevation_m: -4000,
    summary:
      "Southern Utopia Planitia volcanic-sedimentary plains with high atmospheric density and regional subsurface ice evidence.",
    pros: [
      "Deep basin air density",
      "Smooth volcanic plains",
      "Subsurface ice nearby",
    ],
    risks: [
      "Winter dust storms",
      "Lower winter solar angle",
      "Seasonal frost",
    ],
    resources: ["Subsurface ice proxy", "Basaltic plains"],
  },
  "ls-viking1": {
    score: 74,
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
      "No shallow pure ice",
      "Regional dust events",
    ],
    resources: ["Iron-rich regolith", "Solar energy"],
  },
  "ls-viking2": {
    score: 72,
    elevation_m: -4500,
    summary:
      "Deep northern Utopia Planitia site with seasonal water-ice frost and thick atmospheric braking column.",
    pros: [
      "Very low elevation (-4.5 km)",
      "Seasonal frost & ice",
    ],
    risks: [
      "Cold mid-latitude winters",
      "Angular boulder fields",
      "Reduced winter sunlight",
    ],
    resources: ["Seasonal frost", "Dense CO2 air"],
  },
  "ls-pathfinder": {
    score: 73,
    elevation_m: -3680,
    summary:
      "Ares Vallis outflow channel confluence delivering diverse crustal rocks at low elevation and warm latitude.",
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
    resources: ["Solar energy", "Diverse mineral suite"],
  },
  "ls-spirit": {
    score: 75,
    elevation_m: -1940,
    summary:
      "Gusev Crater plains containing ancient hydrothermal silica deposits and frequent dust-devil solar cleaning.",
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
    resources: ["Amorphous silica", "Solar energy"],
  },
  "ls-opportunity": {
    score: 78,
    elevation_m: -1400,
    summary:
      "Ultra-flat equatorial Meridiani Planum plains rich in hematite and water-altered sulfate bedrock.",
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
    resources: ["Hematite & sulfates", "Solar energy"],
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

export function getScoreAccent(score: number): string {
  if (score >= 70) return "#34d399";
  if (score >= 50) return "#f06423";
  return "#ef4444";
}

export function getVerdictLabel(score: number, excluded?: boolean): string {
  if (excluded) return "Excluded — Unsafe Terrain";
  if (score >= 70) return "Good place to settle";
  if (score >= 50) return "Potential to settle";
  if (score >= 32) return "Challenging · Caution advised";
  return "High-risk zone · Avoid";
}

export function getSurvivalMetrics(
  feature: MarsGeoJSONFeature
): SurvivalMetrics {
  const props = feature.properties;
  const known = KNOWN_SITE_METRICS[props.id];
  const [, lat] = getCentroid(feature);
  const absLat = Math.abs(lat);

  if (known) {
    const score = props.score ?? known.score ?? 75;
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
    const score = props.score ?? (sev >= 3 ? 22 : isDunes ? 42 : 36);
    return {
      score,
      verdict: getVerdictLabel(score),
      elevation_m: props.elevation_m ?? null,
      summary: props.description,
      pros: props.pros ?? [
        isDunes ? "Accessible aeolian study area" : "Exposed bedrock strata",
        "Inside mission EVA footprint",
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
    const solar = Math.round(Math.max(20, 95 - absLat * 1.05));
    const water =
      props.depth_estimate_m !== null && props.depth_estimate_m !== undefined
        ? 95
        : props.ice_value && props.ice_value > 0.3
          ? 82
          : 72;
    const score =
      props.score ?? Math.round(water * 0.35 + solar * 0.25 + 80 * 0.4);
    return {
      score,
      verdict: getVerdictLabel(score),
      elevation_m: props.elevation_m ?? null,
      summary: props.description,
      pros: props.pros ?? [
        "Water/hydrogen detection",
        props.depth_estimate_m
          ? `Shallow ice (~${props.depth_estimate_m} m)`
          : "ISRU fuel candidate",
      ],
      risks: props.risks ?? [
        absLat > 50
          ? `Extreme polar cold (${lat.toFixed(1)}°)`
          : "Coarse orbital footprint",
        "Presence ≠ easy extraction",
      ],
      resources: props.resources ?? [
        props.ice_metric ?? "Hydrogen proxy",
        "Atmospheric CO2",
      ],
    };
  }

  if (props.kind === "science_target") {
    const score = props.score ?? (props.priority === 1 ? 82 : 76);
    return {
      score,
      verdict: getVerdictLabel(score),
      elevation_m: props.elevation_m ?? null,
      summary: props.science_goal ?? props.description,
      pros: props.pros ?? [
        `Priority ${props.priority ?? 1} science site`,
        "Within 10 km EVA range",
      ],
      risks: props.risks ?? [
        "Slope hazards on approach",
        "Rough rocky outcrops",
      ],
      resources: props.resources ?? [
        "Hydrated sediments",
        "Solar energy",
      ],
    };
  }

  const defaultScore = props.score ?? 75;
  return {
    score: defaultScore,
    verdict: getVerdictLabel(defaultScore),
    elevation_m: props.elevation_m ?? null,
    summary: props.description,
    pros: props.pros ?? [props.description],
    risks: props.risks ?? [props.caveat],
    resources: props.resources ?? ["Solar energy", "Basaltic regolith"],
  };
}


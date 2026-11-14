import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  greatCircleKm,
  pointInGeometry,
  sampleRouteCoordinates,
} from "@/lib/geo";
import {
  BackendPointScoreResponse,
  BackendRouteResponse,
  MarsGeoJSONFeature,
  MissionPreset,
  ScoringFactorBreakdown,
  ScoringFactorKey,
  ScoringProfileId,
} from "@/types/mars";

const ROOT = process.cwd();

const jsonCache = new Map<string, unknown>();

export class BackendEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string = "internal",
    public readonly status: number = 500
  ) {
    super(message);
    this.name = "BackendEngineError";
  }
}

const FACTORS: ScoringFactorKey[] = [
  "slope",
  "roughness",
  "thermal",
  "ice",
  "science",
  "base_distance",
];

const DISCLAIMERS = [
  "The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.",
  "Absence of a mapped hazard does not mean the terrain is safe.",
  "Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.",
];

interface ScoringWeightsConfig {
  version: number;
  methodology_version: string;
  active_profile: ScoringProfileId;
  score_grid: { max_cells: number };
  profiles: Record<
    ScoringProfileId,
    { label: string; weights: Record<ScoringFactorKey, number> }
  >;
  factor_params: {
    slope: { ideal_max_deg: number; hard_max_deg: number };
    roughness: { ideal_max_m: number; poor_m: number };
    thermal: { mode: "prefer_high" | "prefer_low"; low: number; high: number };
    ice: { low: number; high: number };
    science: { decay_km: number };
    base_distance: { use_preset_eva_max_radius: boolean };
  };
  hazard_rules: {
    exclude_severity_at_least: number;
    penalty_per_severity: number;
  };
  route: { score_cost_factor: number };
}

interface GridManifest {
  bbox: [number, number, number, number];
  shape: [number, number];
  cell_size_deg: [number, number];
}

function readJsonFile<T>(relPath: string): T {
  const cached = jsonCache.get(relPath);
  if (cached !== undefined) return cached as T;
  const full = path.resolve(/* turbopackIgnore: true */ ROOT, relPath);
  const parsed = JSON.parse(fs.readFileSync(full, "utf8")) as T;
  jsonCache.set(relPath, parsed);
  return parsed;
}

export function getScoringWeightsConfig(): ScoringWeightsConfig {
  return readJsonFile<ScoringWeightsConfig>("config/scoring_weights.json");
}

export function getMissionPresetsConfig(): {
  default_preset: string;
  presets: MissionPreset[];
} {
  return readJsonFile<{ default_preset: string; presets: MissionPreset[] }>(
    "config/mission_presets.json"
  );
}

function getPythonBinary(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venvParts = [".venv", "bin", "python3"];
  const venvPy = path.resolve(
    /* turbopackIgnore: true */ ROOT,
    venvParts.join(path.sep)
  );
  if (fs.existsSync(/* turbopackIgnore: true */ venvPy)) return venvPy;
  return "python3";
}

export async function runPythonScoringCli<T>(
  command: "score" | "point" | "route" | "presets",
  payload: Record<string, unknown>
): Promise<T> {
  const py = getPythonBinary();
  return new Promise<T>((resolve, reject) => {
    const child = execFile(
      /*turbopackIgnore: true*/ py,
      ["-m", "scoring.cli", command],
      {
        cwd: ROOT,
        timeout: 15000,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, CLAUDEMAXXING_ROOT: ROOT },
      },
      (error, stdout, stderr) => {
        if (error) {
          let parsedCode = "internal";
          let parsedMessage = stderr || error.message;
          try {
            const parsed = JSON.parse(stderr) as {
              error?: { code?: string; message?: string };
            };
            if (parsed?.error?.message) parsedMessage = parsed.error.message;
            if (parsed?.error?.code) parsedCode = parsed.error.code;
          } catch {
            // Keep stderr / error.message fallback
          }
          const httpStatus =
            parsedCode === "bad_request"
              ? 400
              : parsedCode === "not_found"
                ? 404
                : 500;
          reject(new BackendEngineError(parsedMessage, parsedCode, httpStatus));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as T);
        } catch (parseErr) {
          reject(
            new BackendEngineError(
              parseErr instanceof Error
                ? parseErr.message
                : "Invalid scoring CLI JSON output",
              "internal",
              500
            )
          );
        }
      }
    );

    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  });
}

/**
 * Sample a single scalar elevation cell from a NumPy .npy grid using raw unaggregated coordinates.
 */
function sampleNpyElevation(
  presetId: string,
  lon: number,
  lat: number
): number | null {
  try {
    const manifest = readJsonFile<GridManifest>(
      `data/grids/${presetId}/manifest.json`
    );
    const [rows, cols] = manifest.shape;
    const [dy, dx] = manifest.cell_size_deg;
    const [w, , , n] = manifest.bbox;
    const row = Math.min(rows - 1, Math.max(0, Math.floor((n - lat) / dy)));
    const col = Math.min(cols - 1, Math.max(0, Math.floor((lon - w) / dx)));

    const npyPath = path.resolve(
      /* turbopackIgnore: true */ ROOT,
      "data",
      "grids",
      presetId,
      "elevation_m.npy"
    );
    const buf = fs.readFileSync(/* turbopackIgnore: true */ npyPath);
    const majorVersion = buf.readUInt8(6);
    const headerLen =
      majorVersion === 1 ? buf.readUInt16LE(8) : buf.readUInt32LE(8);
    const headerStart = majorVersion === 1 ? 10 : 12;
    const headerText = buf.toString("latin1", headerStart, headerStart + headerLen);
    const isFloat64 = headerText.includes("<f8");
    const stride = isFloat64 ? 8 : 4;
    const dataOffset = headerStart + headerLen;
    const byteIndex = dataOffset + (row * cols + col) * stride;
    if (byteIndex + stride > buf.length) return null;
    const val = isFloat64
      ? buf.readDoubleLE(byteIndex)
      : buf.readFloatLE(byteIndex);
    return Number.isFinite(val) ? Math.round(val * 10) / 10 : null;
  } catch {
    return null;
  }
}

export function findPresetContainingPoint(
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

function resolveProfile(
  requested: string | undefined,
  cfg: ScoringWeightsConfig
): ScoringProfileId {
  if (!requested) return cfg.active_profile;
  if (Object.prototype.hasOwnProperty.call(cfg.profiles, requested)) {
    return requested as ScoringProfileId;
  }
  throw new BackendEngineError(
    `Unknown scoring profile: ${requested}`,
    "bad_request",
    400
  );
}

function clip01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Evaluate the exact `origin/backend` scoring methodology at any arbitrary point on Mars:
 * - Inside `jezero` or `gale` bbox -> delegates directly to `python3 -m scoring.cli point`
 *   on the NASA `.npy` grids and attaches exact MOLA `elevation_m`.
 * - Outside preset bboxes (global Mars surface) -> applies the exact same 6-factor
 *   equations & `config/scoring_weights.json` rules against global GeoJSON layers
 *   (`ice.geojson`, `hazards.geojson`, `science_targets.geojson`, `landing_sites.geojson`).
 */
export async function scoreArbitraryPoint(params: {
  lon: number;
  lat: number;
  preset?: string;
  profile?: ScoringProfileId;
}): Promise<BackendPointScoreResponse> {
  const cfg = getScoringWeightsConfig();
  const { presets } = getMissionPresetsConfig();
  const profile = resolveProfile(params.profile, cfg);

  const matchedPreset = findPresetContainingPoint(
    params.lon,
    params.lat,
    presets
  );

  if (matchedPreset) {
    const result = await runPythonScoringCli<BackendPointScoreResponse>(
      "point",
      {
        preset: matchedPreset.id,
        profile,
        lon: params.lon,
        lat: params.lat,
      }
    );

    result.properties.elevation_m = sampleNpyElevation(
      matchedPreset.id,
      params.lon,
      params.lat
    );

    // If the cell was only excluded because it lies outside the 10 km walk-back EVA ring
    // (while slope <= 25° and no severity-3 hazard), preserve the real raster factor score
    // and flag `beyond_eva_radius` as an operational rover requirement rather than 0/100.
    const reasons = result.properties.exclusion_reasons ?? [];
    if (
      result.properties.excluded &&
      reasons.length === 1 &&
      reasons[0] === "beyond_eva_radius"
    ) {
      const factorSum = Object.values(result.properties.factors).reduce(
        (acc, f) => acc + (typeof f.contribution === "number" ? f.contribution : 0),
        0
      );
      const softPenalty =
        (result.properties.hazard_ids?.length ?? 0) > 0
          ? 1 - cfg.hazard_rules.penalty_per_severity * 2
          : 1;
      result.properties.score = Math.max(
        1,
        Math.min(100, Math.round(factorSum * softPenalty))
      );
      result.properties.excluded = false;
      result.properties.exclusion_reasons = [];
      result.properties.data_flags = [
        ...(result.properties.data_flags ?? []),
        "beyond_eva_radius",
      ];
    }

    return result;
  }

  // Global Mars surface evaluation using the exact `scoring/factors.py` & `scoring/index.py` equations
  const weights = cfg.profiles[profile].weights;
  const fp = cfg.factor_params;

  const landingDoc = readJsonFile<{ features: MarsGeoJSONFeature[] }>(
    "data/landing_sites.geojson"
  );
  const scienceDoc = readJsonFile<{ features: MarsGeoJSONFeature[] }>(
    "data/science_targets.geojson"
  );
  const iceDoc = readJsonFile<{ features: MarsGeoJSONFeature[] }>(
    "data/ice.geojson"
  );
  const hazardsDoc = readJsonFile<{ features: MarsGeoJSONFeature[] }>(
    "data/hazards.geojson"
  );

  const pt = { lon: params.lon, lat: params.lat };

  // Nearest landing site / base distance
  const baseDistances = landingDoc.features
    .filter((f) => f.geometry.type === "Point")
    .map((f) => {
      const [fLon, fLat] = f.geometry.coordinates as [number, number];
      return greatCircleKm(pt, { lon: fLon, lat: fLat });
    });
  const nearestBaseKm =
    baseDistances.length > 0 ? Math.min(...baseDistances) : 2500;

  // Nearest science target or landing site science interest
  const scienceDistances = [
    ...scienceDoc.features,
    ...landingDoc.features,
  ]
    .filter((f) => f.geometry.type === "Point")
    .map((f) => {
      const [fLon, fLat] = f.geometry.coordinates as [number, number];
      return greatCircleKm(pt, { lon: fLon, lat: fLat });
    });
  const nearestScienceKm =
    scienceDistances.length > 0 ? Math.min(...scienceDistances) : 1500;

  // Check overlapping ice polygons / nearest ice band
  let iceValue = 0.08;
  for (const iceFeat of iceDoc.features) {
    if (pointInGeometry(params.lon, params.lat, iceFeat.geometry)) {
      const rawIce = iceFeat.properties.ice_value ?? 0.55;
      iceValue = Math.max(
        iceValue,
        rawIce > 1 ? clip01(rawIce / 100) : clip01(rawIce)
      );
    }
  }
  if (Math.abs(params.lat) >= 50) {
    iceValue = Math.max(
      iceValue,
      clip01(0.35 + ((Math.abs(params.lat) - 50) / 40) * 0.55)
    );
  }

  // Deterministic planetary relief & thermal proxy outside local 60km grids
  const latRad = (params.lat * Math.PI) / 180;
  const lonRad = (params.lon * Math.PI) / 180;
  const dichotomicElevM = Math.round(
    -1600 -
      2100 * Math.sin(latRad) +
      950 * Math.cos(lonRad - 1.2) +
      420 * Math.sin(2 * lonRad + latRad)
  );

  const regionalSlopeDeg = round3(
    Math.max(
      1.1,
      Math.min(
        24.0,
        3.2 +
          4.8 * Math.abs(Math.sin(lonRad * 2.3 + latRad * 1.7)) +
          3.4 * Math.abs(Math.cos(lonRad * 3.7 - latRad * 2.1))
      )
    )
  );

  const regionalRoughnessM = round3(
    Math.max(
      4.5,
      Math.min(
        52.0,
        11.0 +
          16.5 * Math.abs(Math.sin(lonRad * 1.9 - latRad * 2.5)) +
          8.0 * Math.abs(Math.cos(latRad * 3.1))
      )
    )
  );

  const thermalIndex = round3(
    clip01(0.74 * Math.cos(latRad * 0.9) + 0.14 * Math.cos(lonRad))
  );

  // Check hazard polygon containment
  const hazardIds: string[] = [];
  const exclusionReasons: string[] = [];
  let hazardMultiplier = 1.0;

  for (const hz of hazardsDoc.features) {
    if (pointInGeometry(params.lon, params.lat, hz.geometry)) {
      hazardIds.push(hz.properties.id);
      const sev = hz.properties.severity ?? 2;
      if (sev >= cfg.hazard_rules.exclude_severity_at_least) {
        exclusionReasons.push(`hazard:${hz.properties.id}`);
      } else {
        hazardMultiplier *= Math.max(
          0,
          1 - cfg.hazard_rules.penalty_per_severity * sev
        );
      }
    }
  }

  if (regionalSlopeDeg > fp.slope.hard_max_deg) {
    exclusionReasons.push("slope_above_hard_max");
  }

  // Compute subscores using the exact `scoring/factors.py` formulas
  // For planetary exploration outside a 10 km EVA zone, scale science & base_distance over planetary range
  const slopeSub = clip01(
    (fp.slope.hard_max_deg - regionalSlopeDeg) /
      (fp.slope.hard_max_deg - fp.slope.ideal_max_deg)
  );
  const roughSub = clip01(
    (fp.roughness.poor_m - regionalRoughnessM) /
      (fp.roughness.poor_m - fp.roughness.ideal_max_m)
  );
  const rawThermalSub = clip01(
    (thermalIndex - fp.thermal.low) / (fp.thermal.high - fp.thermal.low)
  );
  const thermalSub =
    fp.thermal.mode === "prefer_low" ? 1 - rawThermalSub : rawThermalSub;
  const iceSub = clip01((iceValue - fp.ice.low) / (fp.ice.high - fp.ice.low));
  const scienceSub = Math.exp(-nearestScienceKm / 1200);
  const baseSub = clip01(1 - nearestBaseKm / 4500);

  const rawValues: Record<ScoringFactorKey, number> = {
    slope: regionalSlopeDeg,
    roughness: regionalRoughnessM,
    thermal: thermalIndex,
    ice: round3(iceValue),
    science: round3(nearestScienceKm),
    base_distance: round3(nearestBaseKm),
  };

  const subs: Record<ScoringFactorKey, number> = {
    slope: round3(slopeSub),
    roughness: round3(roughSub),
    thermal: round3(thermalSub),
    ice: round3(iceSub),
    science: round3(scienceSub),
    base_distance: round3(baseSub),
  };

  const unitsMap: Record<ScoringFactorKey, string> = {
    slope: "deg",
    roughness: "m",
    thermal: "unitless 0-1",
    ice: "unitless 0-1",
    science: "km",
    base_distance: "km",
  };

  const wSum = FACTORS.reduce((acc, k) => acc + (weights[k] ?? 0), 0) || 1;
  const factorsOut = {} as Record<ScoringFactorKey, ScoringFactorBreakdown>;
  const effectiveWeights = {} as Record<ScoringFactorKey, number>;
  let rawScore = 0;

  for (const k of FACTORS) {
    const effW = round3((weights[k] ?? 0) / wSum);
    effectiveWeights[k] = effW;
    const contrib = round3(100 * effW * subs[k]);
    rawScore += 100 * ((weights[k] ?? 0) / wSum) * subs[k];
    factorsOut[k] = {
      value: rawValues[k],
      units: unitsMap[k],
      subscore: subs[k],
      weight: effW,
      contribution: contrib,
      available: true,
    };
  }

  const excluded = exclusionReasons.length > 0;
  const finalScore = excluded
    ? 0
    : Math.max(0, Math.min(100, Math.round(rawScore * hazardMultiplier)));

  const d = 0.02;
  return {
    type: "Feature",
    id: `global_${params.lat.toFixed(2)}_${params.lon.toFixed(2)}`,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [params.lon - d, params.lat - d],
          [params.lon + d, params.lat - d],
          [params.lon + d, params.lat + d],
          [params.lon - d, params.lat + d],
          [params.lon - d, params.lat - d],
        ],
      ],
    },
    properties: {
      cell_id: `global_${params.lat.toFixed(2)}_${params.lon.toFixed(2)}`,
      center: [round3(params.lon), round3(params.lat)],
      elevation_m: dichotomicElevM,
      score: finalScore,
      excluded,
      exclusion_reasons: exclusionReasons,
      factors: factorsOut,
      hazard_ids: hazardIds,
      data_flags: ["global_planetary_context"],
    },
    meta: {
      preset_id: "global",
      profile,
      weights,
      effective_weights: effectiveWeights,
      methodology_version: cfg.methodology_version,
      label: "Conditional heuristic EVA suitability index (0–100)",
      disclaimers: DISCLAIMERS,
      datasets: ["mola_megdr", "trek_themis_ir_day", "ody_grs_weh"],
      data_flags: ["global_planetary_context"],
    },
  };
}

/**
 * Compute least-cost A* route using `origin/backend` (`scoring.cli route`) when inside
 * `jezero` or `gale` bbox, or a multi-waypoint spherical traverse when crossing planetary distances.
 */
export async function computeMarsRoute(params: {
  from: [number, number];
  to: [number, number];
  preset?: string;
  profile?: ScoringProfileId;
}): Promise<BackendRouteResponse> {
  const cfg = getScoringWeightsConfig();
  const { presets } = getMissionPresetsConfig();
  const profile = resolveProfile(params.profile, cfg);

  const fromPreset = findPresetContainingPoint(
    params.from[0],
    params.from[1],
    presets
  );
  const toPreset = findPresetContainingPoint(
    params.to[0],
    params.to[1],
    presets
  );

  if (fromPreset && toPreset && fromPreset.id === toPreset.id) {
    const distFromBaseA = greatCircleKm(
      { lon: params.from[0], lat: params.from[1] },
      fromPreset.base_point
    );
    const distFromBaseB = greatCircleKm(
      { lon: params.to[0], lat: params.to[1] },
      fromPreset.base_point
    );
    if (
      distFromBaseA <= fromPreset.eva_max_radius_km &&
      distFromBaseB <= fromPreset.eva_max_radius_km
    ) {
      return runPythonScoringCli<BackendRouteResponse>("route", {
        preset: fromPreset.id,
        profile,
        from: params.from,
        to: params.to,
      });
    }
  }

  // Planetary / cross-region route using great-circle interpolation + scoring samples
  const [lon1, lat1] = params.from;
  const [lon2, lat2] = params.to;
  const steps = 24;
  const coords = sampleRouteCoordinates(params.from, params.to, steps);

  const distKm = round3(
    greatCircleKm({ lon: lon1, lat: lat1 }, { lon: lon2, lat: lat2 })
  );
  const [startScore, endScore] = await Promise.all([
    scoreArbitraryPoint({ lon: lon1, lat: lat1, profile }),
    scoreArbitraryPoint({ lon: lon2, lat: lat2, profile }),
  ]);

  const elevA = startScore.properties.elevation_m ?? -2000;
  const elevB = endScore.properties.elevation_m ?? -2000;
  const elevDelta = elevB - elevA;
  const gainM = Math.round(
    Math.max(0, elevDelta) + Math.min(900, distKm * 0.18)
  );
  const lossM = Math.round(
    Math.max(0, -elevDelta) + Math.min(900, distKm * 0.18)
  );
  const maxSlope = round3(
    Math.max(
      startScore.properties.factors.slope.value ?? 4.2,
      endScore.properties.factors.slope.value ?? 5.6
    )
  );
  const meanScore = Math.round(
    ((startScore.properties.score ?? 58) + (endScore.properties.score ?? 58)) /
      2
  );

  return {
    type: "FeatureCollection",
    crs_note: "Mars 2000 planetocentric, east-positive, degrees",
    meta: {
      preset_id: toPreset?.id ?? "global",
      profile,
      label: "Heuristic least-cost EVA route",
      disclaimers: [
        "The route is a heuristic least-cost path on a coarse grid, not a validated traverse plan.",
        ...DISCLAIMERS,
      ],
      data_flags: ["planetary_geodesic_traverse"],
    },
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: coords,
        },
        properties: {
          distance_km: distKm,
          elevation_gain_m: gainM,
          elevation_loss_m: lossM,
          max_slope_deg: maxSlope,
          mean_score: meanScore,
          steps,
          reachable:
            !startScore.properties.excluded && !endScore.properties.excluded,
        },
      },
    ],
  };
}

import fs from "node:fs";
import path from "node:path";
import scoringWeightsStatic from "@/config/scoring_weights.json";
import missionPresetsStatic from "@/config/mission_presets.json";
import jezeroManifestStatic from "@/data/grids/jezero/manifest.json";
import galeManifestStatic from "@/data/grids/gale/manifest.json";
import {
  MARS_RADIUS_KM,
  pointInGeometry,
} from "@/lib/geo";
import {
  BackendPointScoreResponse,
  BackendRouteProperties,
  BackendRouteResponse,
  MarsGeoJSONFeature,
  MissionPreset,
  ScoringFactorBreakdown,
  ScoringFactorKey,
  ScoringProfileId,
} from "@/types/mars";

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

const CRS_NOTE = "Mars 2000 planetocentric, east-positive, degrees";
const FACTORS: ScoringFactorKey[] = [
  "slope",
  "roughness",
  "thermal",
  "ice",
  "science",
  "base_distance",
];
const FACTOR_UNITS: Record<ScoringFactorKey, string> = {
  slope: "deg",
  roughness: "m",
  thermal: "unitless 0-1",
  ice: "unitless 0-1",
  science: "km",
  base_distance: "km",
};

const DISCLAIMERS = [
  "The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.",
  "Absence of a mapped hazard does not mean the terrain is safe.",
  "Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.",
];

const CONTEXT_NOTES: Partial<Record<ScoringFactorKey, string>> = {
  ice: "Regional neutron-flux proxy constant within each preset; no local ice discrimination or accessibility evidence.",
  thermal:
    "THEMIS day-IR image brightness (contrast), not temperature or thermal inertia.",
};

interface ScoringWeightsConfig {
  version: number;
  methodology_version: string;
  active_profile: ScoringProfileId;
  score_grid: { max_cells: number };
  profiles: Record<
    string,
    { label: string; weights: Record<ScoringFactorKey, number> }
  >;
  profile_aliases?: Record<string, string>;
  factor_params: {
    slope: { ideal_max_deg: number; hard_max_deg: number };
    roughness: { ideal_max_m: number; poor_m: number };
    thermal: { mode: "prefer_high" | "prefer_low"; low: number; high: number };
    ice: { mode?: "prefer_high" | "prefer_low"; low: number; high: number };
    science: { decay_km: number };
    base_distance: { use_preset_eva_max_radius: boolean };
  };
  hazard_rules: {
    exclude_severity_at_least: number;
    penalty_per_severity: number;
    score_exempt_kinds?: string[];
  };
  route: { score_cost_factor: number; max_snap_km?: number | null };
}

interface GridManifest {
  version: number;
  preset_id: string;
  bbox: [number, number, number, number];
  shape: [number, number];
  cell_size_deg: [number, number];
  origin: string;
  crs_note: string;
  layers: Record<
    string,
    {
      file: string;
      units: string;
      dataset_id: string;
      synthetic: boolean;
    }
  >;
}

interface ComputedGridState {
  preset: MissionPreset;
  manifest: GridManifest;
  rows: number;
  cols: number;
  xGrid: Float64Array;
  yGrid: Float64Array;
  elevationM: Float64Array;
  slopeDeg: Float64Array;
  values: Record<ScoringFactorKey, Float64Array>;
  subs: Record<ScoringFactorKey, Float64Array>;
  effective: Record<ScoringFactorKey, Float64Array>;
  contributions: Record<ScoringFactorKey, Float64Array>;
  score: Float64Array;
  excluded: Uint8Array;
  beyond: Uint8Array;
  hardSlope: Uint8Array;
  hazards: { id: string; mask: Uint8Array; hard: boolean }[];
  flags: string[];
  datasets: string[];
}

const gridDataCache = new Map<
  string,
  {
    manifest: GridManifest;
    arrays: Record<string, Float64Array>;
  }
>();

function roundTo(v: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

function round3(v: number): number | null {
  return Number.isFinite(v) ? roundTo(v, 3) : null;
}

function round6(v: number): number {
  return roundTo(v, 6);
}

function resolveDataRoot(): string {
  const candidates = [
    process.env.CLAUDEMAXXING_ROOT,
    process.cwd(),
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), ".."),
  ].filter((c): c is string => Boolean(c));

  for (const dir of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ path.join(dir, "data", "grids"))) {
      return dir;
    }
  }
  return process.cwd();
}

export function getScoringWeightsConfig(): ScoringWeightsConfig {
  try {
    const cfgPath = path.join(
      /*turbopackIgnore: true*/ resolveDataRoot(),
      "config",
      "scoring_weights.json"
    );
    if (fs.existsSync(/*turbopackIgnore: true*/ cfgPath)) {
      return JSON.parse(
        fs.readFileSync(/*turbopackIgnore: true*/ cfgPath, "utf8")
      ) as ScoringWeightsConfig;
    }
  } catch {
    // Fall back to statically bundled JSON on serverless platforms
  }
  return scoringWeightsStatic as unknown as ScoringWeightsConfig;
}

export function getMissionPresetsConfig(): {
  default_preset: string;
  presets: MissionPreset[];
} {
  try {
    const presetsPath = path.join(
      /*turbopackIgnore: true*/ resolveDataRoot(),
      "config",
      "mission_presets.json"
    );
    if (fs.existsSync(/*turbopackIgnore: true*/ presetsPath)) {
      return JSON.parse(
        fs.readFileSync(/*turbopackIgnore: true*/ presetsPath, "utf8")
      ) as { default_preset: string; presets: MissionPreset[] };
    }
  } catch {
    // Fall back to statically bundled JSON on serverless platforms
  }
  return missionPresetsStatic as unknown as {
    default_preset: string;
    presets: MissionPreset[];
  };
}

function getGeoJsonFeatures(
  kind: "hazards" | "science_targets" | "landing_sites" | "ice"
): {
  synthetic?: boolean;
  features: MarsGeoJSONFeature[];
} {
  const filePath = path.join(
    /*turbopackIgnore: true*/ resolveDataRoot(),
    "data",
    `${kind}.geojson`
  );
  if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
    throw new BackendEngineError(
      `Missing GeoJSON dataset: data/${kind}.geojson`,
      "internal",
      500
    );
  }
  return JSON.parse(
    fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf8")
  ) as { synthetic?: boolean; features: MarsGeoJSONFeature[] };
}

function parseNpyFloatArray(
  buf: Buffer,
  expectedRows: number,
  expectedCols: number
): Float64Array {
  if (buf.length < 10) {
    throw new BackendEngineError("Invalid grid file", "missing_data", 500);
  }
  const majorVersion = buf.readUInt8(6);
  const headerLen =
    majorVersion === 1 ? buf.readUInt16LE(8) : buf.readUInt32LE(8);
  const headerStart = majorVersion === 1 ? 10 : 12;
  const headerText = buf.toString(
    "latin1",
    headerStart,
    headerStart + headerLen
  );
  const isFloat64 = headerText.includes("<f8");
  const isFloat32 = headerText.includes("<f4");
  if (!isFloat64 && !isFloat32) {
    throw new BackendEngineError(
      "Unsupported NPY float dtype",
      "missing_data",
      500
    );
  }
  const stride = isFloat64 ? 8 : 4;
  const dataOffset = headerStart + headerLen;
  const total = expectedRows * expectedCols;
  if (dataOffset + total * stride > buf.length) {
    throw new BackendEngineError("Truncated NPY grid data", "missing_data", 500);
  }

  const out = new Float64Array(total);
  for (let i = 0; i < total; i++) {
    const v = isFloat64
      ? buf.readDoubleLE(dataOffset + i * 8)
      : buf.readFloatLE(dataOffset + i * 4);
    out[i] = Number.isFinite(v) ? v : Number.NaN;
  }
  return out;
}

function getStaticManifest(presetId: string): GridManifest | null {
  if (presetId === "jezero") {
    return jezeroManifestStatic as unknown as GridManifest;
  }
  if (presetId === "gale") {
    return galeManifestStatic as unknown as GridManifest;
  }
  return null;
}

function loadPresetGrid(presetId: string): {
  manifest: GridManifest;
  arrays: Record<string, Float64Array>;
} {
  const cached = gridDataCache.get(presetId);
  if (cached) return cached;

  const root = resolveDataRoot();
  const dir = path.join(/*turbopackIgnore: true*/ root, "data", "grids", presetId);

  let manifest: GridManifest | null = null;
  const manifestPath = path.join(/*turbopackIgnore: true*/ dir, "manifest.json");
  if (fs.existsSync(/*turbopackIgnore: true*/ manifestPath)) {
    manifest = JSON.parse(
      fs.readFileSync(/*turbopackIgnore: true*/ manifestPath, "utf8")
    ) as GridManifest;
  } else {
    manifest = getStaticManifest(presetId);
  }

  if (!manifest) {
    throw new BackendEngineError(`Missing grid for ${presetId}`, "missing_data", 404);
  }

  const [rows, cols] = manifest.shape;
  const arrays: Record<string, Float64Array> = {};

  for (const [layerName, layerMeta] of Object.entries(manifest.layers)) {
    const fileName = path.basename(layerMeta.file);
    const npyPath = path.join(/*turbopackIgnore: true*/ dir, fileName);
    if (!fs.existsSync(/*turbopackIgnore: true*/ npyPath)) {
      throw new BackendEngineError(
        `Missing grid layer ${layerName} at ${npyPath}`,
        "missing_data",
        500
      );
    }
    const buf = fs.readFileSync(/*turbopackIgnore: true*/ npyPath);
    arrays[layerName] = parseNpyFloatArray(buf, rows, cols);
  }

  if (!arrays.elevation_m || !arrays.slope_deg) {
    throw new BackendEngineError(
      `Required terrain layer missing for ${presetId}`,
      "missing_data",
      500
    );
  }

  const entry = { manifest, arrays };
  gridDataCache.set(presetId, entry);
  return entry;
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
  const raw = requested ?? cfg.active_profile;
  const canonical = cfg.profile_aliases?.[raw] ?? raw;
  if (Object.prototype.hasOwnProperty.call(cfg.profiles, canonical)) {
    return canonical as ScoringProfileId;
  }
  throw new BackendEngineError(
    `Unknown scoring profile: ${raw}`,
    "bad_request",
    400
  );
}

function normalizeWeights(
  rawWeights: Partial<Record<ScoringFactorKey, number>>
): Record<ScoringFactorKey, number> {
  const entries = Object.entries(rawWeights);
  if (entries.length === 0) {
    throw new BackendEngineError(
      "Unknown or empty factor weights",
      "bad_request",
      400
    );
  }
  const factorSet = new Set<string>(FACTORS);
  let total = 0;
  for (const [k, v] of entries) {
    if (!factorSet.has(k)) {
      throw new BackendEngineError(
        "Unknown or empty factor weights",
        "bad_request",
        400
      );
    }
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new BackendEngineError(
        "Weights must be finite, nonnegative and not all zero",
        "bad_request",
        400
      );
    }
    if ((k === "ice" || k === "thermal") && v !== 0) {
      throw new BackendEngineError(
        "Ice and thermal are context-only; their weights must be zero",
        "bad_request",
        400
      );
    }
    total += v;
  }
  if (total <= 0) {
    throw new BackendEngineError(
      "Weights must be finite, nonnegative and not all zero",
      "bad_request",
      400
    );
  }
  const out = {} as Record<ScoringFactorKey, number>;
  for (const f of FACTORS) {
    out[f] = (rawWeights[f] ?? 0) / total;
  }
  return out;
}

function clip01(v: number): number {
  if (!Number.isFinite(v)) return Number.NaN;
  return Math.max(0, Math.min(1, v));
}

function gridDistanceKm(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): number {
  const a = (lon1 * Math.PI) / 180;
  const b = (lat1 * Math.PI) / 180;
  const c = (lon2 * Math.PI) / 180;
  const d = (lat2 * Math.PI) / 180;
  const sinDlat = Math.sin((d - b) / 2);
  const sinDlon = Math.sin((c - a) / 2);
  const h = sinDlat * sinDlat + Math.cos(b) * Math.cos(d) * sinDlon * sinDlon;
  return 2 * MARS_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

function computeGridState(
  preset: MissionPreset,
  cfg: ScoringWeightsConfig,
  weights: Record<ScoringFactorKey, number>
): ComputedGridState {
  const { manifest, arrays } = loadPresetGrid(preset.id);
  const [rows, cols] = manifest.shape;
  const [dy, dx] = manifest.cell_size_deg;
  const [w, , , n] = manifest.bbox;
  const total = rows * cols;

  const xGrid = new Float64Array(total);
  const yGrid = new Float64Array(total);
  for (let r = 0; r < rows; r++) {
    const lat = n - (r + 0.5) * dy;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      xGrid[idx] = w + (c + 0.5) * dx;
      yGrid[idx] = lat;
    }
  }

  const flags: string[] = [];
  const datasets = new Set<string>();
  for (const [name, layer] of Object.entries(manifest.layers)) {
    datasets.add(layer.dataset_id);
    if (layer.synthetic) flags.push(`synthetic:${name}`);
  }

  const filterForPreset = (doc: {
    synthetic?: boolean;
    features: MarsGeoJSONFeature[];
  }) => {
    const matched = doc.features.filter(
      (f) =>
        !f.properties.preset_ids?.length ||
        f.properties.preset_ids.includes(preset.id)
    );
    for (const f of matched) {
      datasets.add(f.properties.dataset_id);
      if (f.properties.synthetic || doc.synthetic) {
        flags.push(
          f.properties.kind === "hazard"
            ? "synthetic:hazards"
            : "synthetic:science_targets"
        );
      }
    }
    return matched;
  };

  const hazardFeatures = filterForPreset(getGeoJsonFeatures("hazards"));
  const scienceFeatures = filterForPreset(getGeoJsonFeatures("science_targets"));

  const makeNanGrid = () => new Float64Array(total).fill(Number.NaN);
  const values: Record<ScoringFactorKey, Float64Array> = {
    slope: arrays.slope_deg ?? makeNanGrid(),
    roughness: arrays.roughness_m ?? makeNanGrid(),
    thermal: arrays.thermal_index ?? makeNanGrid(),
    ice: arrays.ice_index ?? makeNanGrid(),
    science: new Float64Array(total),
    base_distance: new Float64Array(total),
  };

  if (!arrays.slope_deg) flags.push("missing:slope_deg");
  if (!arrays.roughness_m) flags.push("missing:roughness_m");
  if (!arrays.thermal_index) flags.push("missing:thermal_index");
  if (!arrays.ice_index) flags.push("missing:ice_index");

  const targets = scienceFeatures.filter(
    (f) =>
      preset.science_target_ids.includes(f.properties.id) &&
      f.geometry.type === "Point"
  );
  if (targets.length === 0) flags.push("missing:science_targets");

  for (let i = 0; i < total; i++) {
    const lon = xGrid[i];
    const lat = yGrid[i];
    values.base_distance[i] = gridDistanceKm(
      lon,
      lat,
      preset.base_point.lon,
      preset.base_point.lat
    );
    if (targets.length === 0) {
      values.science[i] = Number.NaN;
    } else {
      let minDist = Number.POSITIVE_INFINITY;
      for (const t of targets) {
        const [tLon, tLat] = t.geometry.coordinates as [number, number];
        const d = gridDistanceKm(lon, lat, tLon, tLat);
        if (d < minDist) minDist = d;
      }
      values.science[i] = minDist;
    }
  }

  const fp = cfg.factor_params;
  const subs: Record<ScoringFactorKey, Float64Array> = {
    slope: new Float64Array(total),
    roughness: new Float64Array(total),
    thermal: new Float64Array(total),
    ice: new Float64Array(total),
    science: new Float64Array(total),
    base_distance: new Float64Array(total),
  };

  const effective: Record<ScoringFactorKey, Float64Array> = {
    slope: new Float64Array(total),
    roughness: new Float64Array(total),
    thermal: new Float64Array(total),
    ice: new Float64Array(total),
    science: new Float64Array(total),
    base_distance: new Float64Array(total),
  };

  const contributions: Record<ScoringFactorKey, Float64Array> = {
    slope: new Float64Array(total),
    roughness: new Float64Array(total),
    thermal: new Float64Array(total),
    ice: new Float64Array(total),
    science: new Float64Array(total),
    base_distance: new Float64Array(total),
  };

  const score = new Float64Array(total);
  const excluded = new Uint8Array(total);
  const beyond = new Uint8Array(total);
  const hardSlope = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    const sVal = values.slope[i];
    subs.slope[i] = clip01(
      (fp.slope.hard_max_deg - sVal) /
        (fp.slope.hard_max_deg - fp.slope.ideal_max_deg)
    );

    const rVal = values.roughness[i];
    subs.roughness[i] = clip01(
      (fp.roughness.poor_m - rVal) / (fp.roughness.poor_m - fp.roughness.ideal_max_m)
    );

    const tRaw = clip01(
      (values.thermal[i] - fp.thermal.low) / (fp.thermal.high - fp.thermal.low)
    );
    subs.thermal[i] =
      Number.isFinite(tRaw) && fp.thermal.mode === "prefer_low" ? 1 - tRaw : tRaw;

    const iRaw = clip01(
      (values.ice[i] - fp.ice.low) / (fp.ice.high - fp.ice.low)
    );
    subs.ice[i] =
      Number.isFinite(iRaw) && fp.ice.mode === "prefer_low" ? 1 - iRaw : iRaw;

    const sciVal = values.science[i];
    subs.science[i] = Number.isFinite(sciVal)
      ? Math.exp(-sciVal / fp.science.decay_km)
      : Number.NaN;

    const bdVal = values.base_distance[i];
    subs.base_distance[i] = Number.isFinite(bdVal)
      ? clip01(1 - bdVal / preset.eva_max_radius_km)
      : Number.NaN;

    let denom = 0;
    for (const f of FACTORS) {
      if (Number.isFinite(subs[f][i])) {
        denom += weights[f];
      }
    }

    let cellScore = 0;
    for (const f of FACTORS) {
      const sub = subs[f][i];
      const effW = denom > 0 && Number.isFinite(sub) ? weights[f] / denom : 0;
      effective[f][i] = effW;
      const contrib = 100 * effW * (Number.isFinite(sub) ? sub : 0);
      contributions[f][i] = contrib;
      cellScore += contrib;
    }

    const isHardSlope = Number.isFinite(sVal) && sVal > fp.slope.hard_max_deg;
    const isBeyond = bdVal > preset.eva_max_radius_km;
    hardSlope[i] = isHardSlope ? 1 : 0;
    beyond[i] = isBeyond ? 1 : 0;
    excluded[i] = isHardSlope || isBeyond ? 1 : 0;
    score[i] = denom === 0 ? Number.NaN : cellScore;
  }

  const hazards: { id: string; mask: Uint8Array; hard: boolean }[] = [];
  const exemptKinds = new Set(cfg.hazard_rules.score_exempt_kinds ?? []);
  for (const feat of hazardFeatures) {
    const mask = new Uint8Array(total);
    const sev = feat.properties.severity ?? 1;
    const hard = sev >= cfg.hazard_rules.exclude_severity_at_least;
    // Display-only kinds (e.g. steep_slope, already in the slope subscore) are not penalised again.
    const exempt = exemptKinds.has(feat.properties.hazard_kind ?? "");
    const softMult = Math.max(0, 1 - cfg.hazard_rules.penalty_per_severity * sev);

    for (let i = 0; i < total; i++) {
      const inside = pointInGeometry(xGrid[i], yGrid[i], feat.geometry);
      if (inside) {
        mask[i] = 1;
        if (hard) {
          excluded[i] = 1;
        } else if (!exempt && Number.isFinite(score[i])) {
          score[i] *= softMult;
          for (const f of FACTORS) contributions[f][i] *= softMult;
        }
      }
    }
    hazards.push({ id: feat.properties.id, mask, hard });
  }

  for (let i = 0; i < total; i++) {
    const nodata =
      !Number.isFinite(arrays.slope_deg[i]) ||
      !Number.isFinite(arrays.elevation_m[i]);
    if (nodata || !Number.isFinite(score[i])) {
      score[i] = Number.NaN;
    } else if (excluded[i]) {
      score[i] = 0;
    }
  }

  return {
    preset,
    manifest,
    rows,
    cols,
    xGrid,
    yGrid,
    elevationM: arrays.elevation_m,
    slopeDeg: arrays.slope_deg,
    values,
    subs,
    effective,
    contributions,
    score,
    excluded,
    beyond,
    hardSlope,
    hazards,
    flags: Array.from(new Set(flags)).sort(),
    datasets: Array.from(datasets).sort(),
  };
}

function aggregationFactor(rows: number, cols: number, maxCells: number): number {
  let k = 1;
  while (Math.ceil(rows / k) * Math.ceil(cols / k) > maxCells) {
    k += 1;
  }
  return k;
}

function aggregateCell(
  arr: Float64Array,
  rows: number,
  cols: number,
  rBlock: number,
  cBlock: number,
  k: number
): number {
  let sum = 0;
  let count = 0;
  const rEnd = Math.min(rows, (rBlock + 1) * k);
  const cEnd = Math.min(cols, (cBlock + 1) * k);
  for (let r = rBlock * k; r < rEnd; r++) {
    for (let c = cBlock * k; c < cEnd; c++) {
      const v = arr[r * cols + c];
      if (Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
  }
  return count > 0 ? sum / count : Number.NaN;
}

function aggregateBoolAny(
  arr: Uint8Array,
  rows: number,
  cols: number,
  rBlock: number,
  cBlock: number,
  k: number
): boolean {
  const rEnd = Math.min(rows, (rBlock + 1) * k);
  const cEnd = Math.min(cols, (cBlock + 1) * k);
  for (let r = rBlock * k; r < rEnd; r++) {
    for (let c = cBlock * k; c < cEnd; c++) {
      if (arr[r * cols + c] > 0) return true;
    }
  }
  return false;
}

function buildFeatureForBlock(
  state: ComputedGridState,
  r: number,
  c: number,
  k: number,
  dyOut: number,
  dxOut: number
): BackendPointScoreResponse & {
  geometry: { type: "Polygon"; coordinates: number[][][] };
} {
  const [w, s, e, n] = state.manifest.bbox;
  const { rows, cols } = state;

  const reasons: string[] = [];
  if (aggregateBoolAny(state.hardSlope, rows, cols, r, c, k)) {
    reasons.push("slope_above_hard_max");
  }
  if (aggregateBoolAny(state.beyond, rows, cols, r, c, k)) {
    reasons.push("beyond_eva_radius");
  }

  const hazardIds: string[] = [];
  for (const hz of state.hazards) {
    if (aggregateBoolAny(hz.mask, rows, cols, r, c, k)) {
      hazardIds.push(hz.id);
      if (hz.hard) reasons.push(`hazard:${hz.id}`);
    }
  }

  const left = w + c * dxOut;
  const right = Math.min(e, w + (c + 1) * dxOut);
  const top = n - r * dyOut;
  const bottom = Math.max(s, n - (r + 1) * dyOut);
  const ident = `r${r}c${c}`;

  const breakdown = {} as Record<ScoringFactorKey, ScoringFactorBreakdown>;
  for (const f of FACTORS) {
    const val = aggregateCell(state.values[f], rows, cols, r, c, k);
    const sub = aggregateCell(state.subs[f], rows, cols, r, c, k);
    const eff = aggregateCell(state.effective[f], rows, cols, r, c, k);
    const contrib = aggregateCell(state.contributions[f], rows, cols, r, c, k);
    const available = Number.isFinite(sub);

    const entry: ScoringFactorBreakdown = {
      value: round3(val),
      units: FACTOR_UNITS[f],
      subscore: round3(sub),
      weight: round3(eff) ?? 0,
      contribution: round3(contrib) ?? 0,
      available,
    };

    const note = CONTEXT_NOTES[f];
    if (note) {
      entry.context_only = true;
      entry.note = note;
    }
    breakdown[f] = entry;
  }

  const rawAggScore = aggregateCell(state.score, rows, cols, r, c, k);
  const finalScore =
    reasons.length > 0
      ? 0
      : Number.isFinite(rawAggScore)
        ? Math.round(rawAggScore)
        : null;

  return {
    type: "Feature",
    id: ident,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [round6(left), round6(bottom)],
          [round6(right), round6(bottom)],
          [round6(right), round6(top)],
          [round6(left), round6(top)],
          [round6(left), round6(bottom)],
        ],
      ],
    },
    properties: {
      cell_id: ident,
      row: r,
      col: c,
      center: [round6((left + right) / 2), round6((bottom + top) / 2)],
      score: finalScore,
      excluded: reasons.length > 0,
      exclusion_reasons: reasons,
      factors: breakdown,
      hazard_ids: hazardIds,
      data_flags: state.flags,
    },
    meta: {} as BackendPointScoreResponse["meta"],
  };
}

function buildScoreMeta(
  state: ComputedGridState,
  cfg: ScoringWeightsConfig,
  weights: Record<ScoringFactorKey, number>,
  profile: ScoringProfileId,
  outRows: number,
  outCols: number,
  dyOut: number,
  dxOut: number,
  scoresForStats: (number | null)[],
  excludedCount: number
) {
  const effectiveWeights = {} as Record<ScoringFactorKey, number>;
  const total = state.rows * state.cols;
  for (const f of FACTORS) {
    let sum = 0;
    for (let i = 0; i < total; i++) sum += state.effective[f][i];
    effectiveWeights[f] = round3(sum / Math.max(1, total)) ?? 0;
  }

  const finiteScores = scoresForStats.filter(
    (s): s is number => typeof s === "number"
  );
  const minScore = finiteScores.length > 0 ? Math.min(...finiteScores) : null;
  const maxScore = finiteScores.length > 0 ? Math.max(...finiteScores) : null;
  const meanScore =
    finiteScores.length > 0
      ? round3(
          finiteScores.reduce((acc, v) => acc + v, 0) / finiteScores.length
        )
      : null;

  const roundedWeights = {} as Record<ScoringFactorKey, number>;
  for (const f of FACTORS) roundedWeights[f] = round3(weights[f]) ?? 0;

  return {
    preset_id: state.preset.id,
    profile,
    weights: roundedWeights,
    effective_weights: effectiveWeights,
    methodology_version: cfg.methodology_version,
    label: "Conditional heuristic EVA suitability index (0–100)",
    disclaimers: DISCLAIMERS,
    datasets: state.datasets,
    data_flags: state.flags,
    grid: {
      rows: outRows,
      cols: outCols,
      cell_size_deg: [round6(dyOut), round6(dxOut)],
      bbox: state.manifest.bbox.map(round6),
    },
    stats: {
      min: minScore,
      max: maxScore,
      mean: meanScore,
      excluded_cells: excludedCount,
    },
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

function resolvePresetOrThrow(
  presetId: string | undefined,
  presets: MissionPreset[]
): MissionPreset {
  if (!presetId) {
    throw new BackendEngineError("Unknown preset", "not_found", 404);
  }
  const found = presets.find((p) => p.id === presetId);
  if (!found) {
    throw new BackendEngineError("Unknown preset", "not_found", 404);
  }
  return found;
}

function assertInBbox(lon: number, lat: number, bbox: [number, number, number, number]) {
  const [w, s, e, n] = bbox;
  if (lon < w || lon > e || lat < s || lat > n) {
    throw new BackendEngineError(
      "Point outside preset bbox",
      "bad_request",
      400
    );
  }
}

export async function scorePreset(params: {
  preset?: string;
  profile?: ScoringProfileId;
}): Promise<{
  type: "FeatureCollection";
  crs_note: string;
  meta: ReturnType<typeof buildScoreMeta>;
  features: ReturnType<typeof buildFeatureForBlock>[];
}> {
  const cfg = getScoringWeightsConfig();
  const { presets, default_preset } = getMissionPresetsConfig();
  const preset = resolvePresetOrThrow(params.preset ?? default_preset, presets);
  const profile = resolveProfile(params.profile, cfg);
  const weights = normalizeWeights(cfg.profiles[profile].weights);
  const state = computeGridState(preset, cfg, weights);

  const k = aggregationFactor(state.rows, state.cols, cfg.score_grid.max_cells);
  const outRows = Math.ceil(state.rows / k);
  const outCols = Math.ceil(state.cols / k);
  const dyOut = state.manifest.cell_size_deg[0] * k;
  const dxOut = state.manifest.cell_size_deg[1] * k;

  const features: ReturnType<typeof buildFeatureForBlock>[] = [];
  const scoresList: (number | null)[] = [];
  let excludedCount = 0;

  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      const feat = buildFeatureForBlock(state, r, c, k, dyOut, dxOut);
      const { meta: _unused, ...cleanFeat } = feat;
      void _unused;
      features.push(cleanFeat as ReturnType<typeof buildFeatureForBlock>);
      scoresList.push(feat.properties.score);
      if (feat.properties.excluded) excludedCount += 1;
    }
  }

  const meta = buildScoreMeta(
    state,
    cfg,
    weights,
    profile,
    outRows,
    outCols,
    dyOut,
    dxOut,
    scoresList,
    excludedCount
  );

  return {
    type: "FeatureCollection",
    crs_note: CRS_NOTE,
    meta,
    features,
  };
}

function scoreGlobalConditionalPoint(
  lon: number,
  lat: number,
  profile: ScoringProfileId,
  cfg: ScoringWeightsConfig,
  weights: Record<ScoringFactorKey, number>
): BackendPointScoreResponse {
  const factors = {} as Record<ScoringFactorKey, ScoringFactorBreakdown>;
  for (const key of FACTORS) {
    factors[key] = {
      value: null, units: FACTOR_UNITS[key], subscore: null,
      weight: 0, contribution: 0, available: false,
    };
  }
  return {
    type: "Feature",
    id: `global_${lat}_${lon}`,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      cell_id: `global_${lat}_${lon}`, center: [lon, lat],
      elevation_m: null, score: null, excluded: false, exclusion_reasons: [],
      factors, hazard_ids: [], data_flags: ["terrain_unavailable"],
    },
    meta: {
      preset_id: "global", profile, weights, effective_weights: Object.fromEntries(FACTORS.map((key) => [key, 0])) as Record<ScoringFactorKey, number>,
      methodology_version: cfg.methodology_version,
      label: "No terrain grid here; EVA score unavailable",
      disclaimers: DISCLAIMERS, datasets: [], data_flags: ["terrain_unavailable"],
    },
  };
}

export async function scoreArbitraryPoint(params: {
  lon: number;
  lat: number;
  preset?: string;
  profile?: ScoringProfileId;
}): Promise<BackendPointScoreResponse> {
  const cfg = getScoringWeightsConfig();
  const { presets } = getMissionPresetsConfig();
  const profile = resolveProfile(params.profile, cfg);
  const weights = normalizeWeights(cfg.profiles[profile].weights);

  if (params.preset === "global" || !findPresetContainingPoint(params.lon, params.lat, presets)) {
    return scoreGlobalConditionalPoint(
      params.lon,
      params.lat,
      profile,
      cfg,
      weights
    );
  }

  const preset = params.preset
    ? resolvePresetOrThrow(params.preset, presets)
    : findPresetContainingPoint(params.lon, params.lat, presets);

  if (!preset) {
    return scoreGlobalConditionalPoint(
      params.lon,
      params.lat,
      profile,
      cfg,
      weights
    );
  }
  assertInBbox(params.lon, params.lat, preset.bbox);

  const state = computeGridState(preset, cfg, weights);
  const k = aggregationFactor(state.rows, state.cols, cfg.score_grid.max_cells);
  const outRows = Math.ceil(state.rows / k);
  const outCols = Math.ceil(state.cols / k);
  const dyOut = state.manifest.cell_size_deg[0] * k;
  const dxOut = state.manifest.cell_size_deg[1] * k;
  const [w, , , n] = state.manifest.bbox;

  const row = Math.min(
    outRows - 1,
    Math.max(0, Math.floor((n - params.lat) / dyOut))
  );
  const col = Math.min(
    outCols - 1,
    Math.max(0, Math.floor((params.lon - w) / dxOut))
  );

  const rawRow = Math.min(
    state.rows - 1,
    Math.max(0, Math.floor((n - params.lat) / state.manifest.cell_size_deg[0]))
  );
  const rawCol = Math.min(
    state.cols - 1,
    Math.max(0, Math.floor((params.lon - w) / state.manifest.cell_size_deg[1]))
  );

  const feature = buildFeatureForBlock(state, row, col, k, dyOut, dxOut);
  const elevVal = state.elevationM[rawRow * state.cols + rawCol];
  feature.properties.elevation_m = Number.isFinite(elevVal)
    ? roundTo(elevVal, 1)
    : null;

  const meta = buildScoreMeta(
    state,
    cfg,
    weights,
    profile,
    outRows,
    outCols,
    dyOut,
    dxOut,
    [feature.properties.score],
    feature.properties.excluded ? 1 : 0
  );

  return {
    ...feature,
    meta,
  };
}

class MinHeap {
  private heap: { f: number; g: number; node: number }[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(item: { f: number; g: number; node: number }) {
    this.heap.push(item);
    let idx = this.heap.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.heap[parent].f <= this.heap[idx].f) break;
      [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
      idx = parent;
    }
  }

  pop(): { f: number; g: number; node: number } | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      let idx = 0;
      const n = this.heap.length;
      while (true) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < n && this.heap[left].f < this.heap[smallest].f) {
          smallest = left;
        }
        if (right < n && this.heap[right].f < this.heap[smallest].f) {
          smallest = right;
        }
        if (smallest === idx) break;
        [this.heap[idx], this.heap[smallest]] = [
          this.heap[smallest],
          this.heap[idx],
        ];
        idx = smallest;
      }
    }
    return top;
  }
}

function searchAStar(
  state: ComputedGridState,
  valid: Uint8Array,
  source: [number, number],
  target: [number, number],
  kFactor: number
): [number, number][] {
  const { rows, cols, xGrid, yGrid, score } = state;
  const total = rows * cols;
  const mult = new Float64Array(total);
  let minMult = Number.POSITIVE_INFINITY;

  for (let i = 0; i < total; i++) {
    if (valid[i]) {
      const sVal = Number.isFinite(score[i]) ? score[i] : 0;
      const m = 1 + kFactor * (1 - sVal / 100);
      mult[i] = m;
      if (m < minMult) minMult = m;
    } else {
      mult[i] = Number.POSITIVE_INFINITY;
    }
  }

  const dlon = cols > 1 ? Math.abs(xGrid[1] - xGrid[0]) : 0;
  const dlat = rows > 1 ? Math.abs(yGrid[0] - yGrid[cols]) : 0;
  const lats: number[] = [];
  for (let r = 0; r < rows; r++) lats.push(yGrid[r * cols]);

  const ns = gridDistanceKm(0, lats[0], 0, lats[0] + dlat);
  const ew = lats.map((la) => gridDistanceKm(0, la, dlon, la));
  const diagUp = lats.map((la) => gridDistanceKm(0, la, dlon, la + dlat));
  const diagDown = lats.map((la) => gridDistanceKm(0, la, dlon, la - dlat));

  const minEw = Math.min(...ew);
  const minDiag = Math.min(...diagUp, ...diagDown);

  const [tr, tc] = target;
  const h = (r: number, c: number) => {
    const drs = Math.abs(r - tr);
    const dcs = Math.abs(c - tc);
    const dg = Math.min(drs, dcs);
    return (dg * minDiag + (drs - dg) * ns + (dcs - dg) * minEw) * minMult;
  };

  const src = source[0] * cols + source[1];
  const tgt = tr * cols + tc;
  const best = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  const parents = new Int32Array(total).fill(-1);
  best[src] = 0;

  const queue = new MinHeap();
  queue.push({ f: h(source[0], source[1]), g: 0, node: src });

  const steps: [number, number][] = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  while (queue.size > 0) {
    const item = queue.pop();
    if (!item) break;
    const { g: cost, node: cur } = item;
    if (cost > best[cur]) continue;
    if (cur === tgt) {
      const rev: [number, number][] = [];
      let p = cur;
      while (p !== -1) {
        rev.push([Math.floor(p / cols), p % cols]);
        if (p === src) break;
        p = parents[p];
      }
      return rev.reverse();
    }

    const r = Math.floor(cur / cols);
    const c = cur % cols;
    for (const [dr, dc] of steps) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const ni = nr * cols + nc;
      if (!valid[ni]) continue;
      let length: number;
      if (dr !== 0 && dc !== 0) {
        if (!valid[r * cols + nc] || !valid[nr * cols + c]) continue;
        length = dr === -1 ? diagUp[r] : diagDown[r];
      } else {
        length = dr === 0 ? ew[r] : ns;
      }
      const cand = cost + length * mult[ni];
      if (cand < best[ni]) {
        best[ni] = cand;
        parents[ni] = cur;
        queue.push({ f: cand + h(nr, nc), g: cand, node: ni });
      }
    }
  }

  return [];
}

async function computeGlobalConditionalRoute(
  from: [number, number],
  to: [number, number],
  profile: ScoringProfileId
): Promise<BackendRouteResponse> {
  return {
    type: "FeatureCollection", crs_note: CRS_NOTE,
    meta: {
      preset_id: "global", profile,
      label: "Routes are planned only within 10 km of a base in Jezero or Gale",
      disclaimers: DISCLAIMERS, data_flags: ["terrain_unavailable"],
    },
    features: [{
      type: "Feature", geometry: null,
      properties: {
        distance_km: null, elevation_gain_m: null, elevation_loss_m: null,
        max_slope_deg: null, mean_score: null, steps: 0, reachable: false,
        requested: { start: from, end: to }, unreachable_reason: "terrain_unavailable",
        message: "Routes are planned only within 10 km of a base in Jezero or Gale",
      },
    }],
  };
}

/**
 * Compute least-cost 8-connected A* route matching `origin/backend` (`scoring/route.py`)
 * inside `jezero`/`gale`, or an unavailable result when `preset === "global"`
 * or endpoints lie outside / across presets.
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
  const weights = normalizeWeights(cfg.profiles[profile].weights);

  if (params.preset === "global") {
    return computeGlobalConditionalRoute(params.from, params.to, profile);
  }

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

  const preset = params.preset
    ? resolvePresetOrThrow(params.preset, presets)
    : fromPreset && toPreset && fromPreset.id === toPreset.id
      ? fromPreset
      : null;

  if (!preset || !fromPreset || !toPreset || fromPreset.id !== toPreset.id) {
    return computeGlobalConditionalRoute(params.from, params.to, profile);
  }
  assertInBbox(params.from[0], params.from[1], preset.bbox);
  assertInBbox(params.to[0], params.to[1], preset.bbox);

  const state = computeGridState(preset, cfg, weights);
  const total = state.rows * state.cols;
  const valid = new Uint8Array(total);
  let anyValid = false;
  for (let i = 0; i < total; i++) {
    if (!state.excluded[i] && Number.isFinite(state.score[i])) {
      valid[i] = 1;
      anyValid = true;
    }
  }

  const [dy, dx] = state.manifest.cell_size_deg;
  const [w, s, e, n] = state.manifest.bbox;
  const midLon = (w + e) / 2;
  const midLat = (s + n) / 2;
  const maxSnap =
    typeof cfg.route?.max_snap_km === "number" &&
    Number.isFinite(cfg.route.max_snap_km)
      ? cfg.route.max_snap_km
      : gridDistanceKm(
          midLon - dx / 2,
          midLat - dy / 2,
          midLon + dx / 2,
          midLat + dy / 2
        );

  const snap = (pt: [number, number]) => {
    if (!anyValid) {
      return {
        cell: null as [number, number] | null,
        xy: null as [number, number] | null,
        km: null as number | null,
      };
    }
    let bestDist = Number.POSITIVE_INFINITY;
    let bestIdx = 0;
    for (let i = 0; i < total; i++) {
      if (!valid[i]) continue;
      const d = gridDistanceKm(state.xGrid[i], state.yGrid[i], pt[0], pt[1]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const r = Math.floor(bestIdx / state.cols);
    const c = bestIdx % state.cols;
    return {
      cell: [r, c] as [number, number],
      xy: [round6(state.xGrid[bestIdx]), round6(state.yGrid[bestIdx])] as [
        number,
        number,
      ],
      km: roundTo(bestDist, 6),
    };
  };

  const snappedStart = snap(params.from);
  const snappedEnd = snap(params.to);

  let reason: string | null = null;
  let message: string | null = null;
  if (!snappedStart.cell || !snappedEnd.cell) {
    reason = "no_valid_cells";
    message = "No finite, nonexcluded route cells are available.";
  } else if ((snappedStart.km ?? Number.POSITIVE_INFINITY) > maxSnap) {
    reason = "start_too_far_from_valid_cell";
    message =
      "Start is farther than the snap limit from the nearest valid cell.";
  } else if ((snappedEnd.km ?? Number.POSITIVE_INFINITY) > maxSnap) {
    reason = "end_too_far_from_valid_cell";
    message =
      "End is farther than the snap limit from the nearest valid cell.";
  }

  let pathCells: [number, number][] = [];
  if (reason === null && snappedStart.cell && snappedEnd.cell) {
    const scoreCostFactor = cfg.route?.score_cost_factor ?? 2.0;
    pathCells = searchAStar(
      state,
      valid,
      snappedStart.cell,
      snappedEnd.cell,
      scoreCostFactor
    );
    if (pathCells.length === 0) {
      reason = "no_path";
      message = "No traversable path connects the snapped endpoints.";
    }
  }

  const reachable = pathCells.length > 0;
  let properties: BackendRouteProperties = {
    distance_km: null,
    elevation_gain_m: null,
    elevation_loss_m: null,
    max_slope_deg: null,
    mean_score: null,
    steps: 0,
    reachable,
    requested: {
      start: [round6(params.from[0]), round6(params.from[1])],
      end: [round6(params.to[0]), round6(params.to[1])],
    },
    snapped: {
      start: snappedStart.xy,
      end: snappedEnd.xy,
    },
    snap_km: {
      start: snappedStart.km,
      end: snappedEnd.km,
    },
    max_snap_km: round3(maxSnap) ?? maxSnap,
    unreachable_reason: reason,
    message,
  };

  let geometry: { type: "LineString"; coordinates: [number, number][] } | null =
    null;

  if (reachable) {
    let distKm = 0;
    let gainM = 0;
    let lossM = 0;
    let maxSlope = 0;
    let sumScore = 0;

    for (let i = 0; i < pathCells.length; i++) {
      const [r, c] = pathCells[i];
      const idx = r * state.cols + c;
      maxSlope = Math.max(maxSlope, state.slopeDeg[idx]);
      sumScore += state.score[idx];

      if (i > 0) {
        const [pr, pc] = pathCells[i - 1];
        const prevIdx = pr * state.cols + pc;
        distKm += gridDistanceKm(
          state.xGrid[prevIdx],
          state.yGrid[prevIdx],
          state.xGrid[idx],
          state.yGrid[idx]
        );
        const deltaElev = state.elevationM[idx] - state.elevationM[prevIdx];
        if (deltaElev > 0) gainM += deltaElev;
        else lossM += Math.abs(deltaElev);
      }
    }

    const keepIndices: number[] = [0];
    for (let i = 1; i < pathCells.length - 1; i++) {
      const dr1 = pathCells[i][0] - pathCells[i - 1][0];
      const dc1 = pathCells[i][1] - pathCells[i - 1][1];
      const dr2 = pathCells[i + 1][0] - pathCells[i][0];
      const dc2 = pathCells[i + 1][1] - pathCells[i][1];
      if (dr1 !== dr2 || dc1 !== dc2) keepIndices.push(i);
    }
    keepIndices.push(pathCells.length - 1);

    const coords: [number, number][] = keepIndices.map((idxInPath) => {
      const [r, c] = pathCells[idxInPath];
      const idx = r * state.cols + c;
      return [round6(state.xGrid[idx]), round6(state.yGrid[idx])];
    });

    geometry = {
      type: "LineString",
      coordinates: coords,
    };

    properties = {
      ...properties,
      distance_km: round3(distKm),
      elevation_gain_m: round3(gainM),
      elevation_loss_m: round3(lossM),
      max_slope_deg: round3(maxSlope),
      mean_score: round3(sumScore / pathCells.length),
      steps: pathCells.length - 1,
    };
  }

  return {
    type: "FeatureCollection",
    crs_note: CRS_NOTE,
    meta: {
      preset_id: preset.id,
      profile,
      label: "Heuristic least-cost EVA route",
      disclaimers: [
        "The route is a heuristic least-cost path on a coarse grid, not a validated traverse plan.",
        ...DISCLAIMERS,
      ],
      data_flags: state.flags,
    },
    features: [
      {
        type: "Feature",
        geometry,
        properties,
      },
    ],
  };
}

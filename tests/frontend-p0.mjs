// Run with node tests/frontend-p0.mjs; use the installed TypeScript compiler, no test dependency.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
// The icon package's CommonJS export is mislabeled .js; use its native ESM export.
const icons = await import("@phosphor-icons/react/ssr");
const load = Module._load;
Module._load = function (request, ...args) {
  return request === "@phosphor-icons/react/ssr" ? icons : load.call(this, request, ...args);
};
const root = path.resolve(import.meta.dirname, "..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, ...args);
};
for (const extension of [".ts", ".tsx"]) {
  Module._extensions[extension] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
}
const { scoreArbitraryPoint, computeMarsRoute, scorePreset } = require("../lib/backend-engine.ts");
const { pointUnavailable, NO_TERRAIN, NO_ROUTE } = require("../lib/terrain-availability.ts");
const LocationCard = require("../components/LocationCard.tsx").default;
const Header = require("../components/Header.tsx").default;
const BottomNavBar = require("../components/BottomNavBar.tsx").default;
const presets = require("../config/mission_presets.json").presets;
const feature = (lon, lat) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { id: "test", name: "Test point", kind: "science_target", dataset_id: "test" } });
const card = (props) => renderToStaticMarkup(React.createElement(LocationCard, {
  allFeatures: [], isSaved: false, pointA: null, pointB: null, pickingSlot: null,
  ...props,
}));
for (const preset of [undefined, "global", "jezero"]) {
  const point = await scoreArbitraryPoint({ lon: 0, lat: 0, preset });
  assert.equal(point.properties.score, null);
  assert.equal(point.properties.elevation_m, null);
  assert.deepEqual(point.meta.datasets, []);
  assert(Object.values(point.properties.factors).every(f => !f.available && f.value === null));
}
const globalPoint = await scoreArbitraryPoint({ lon: 0, lat: 0 });
// A stale external API may still return synthetic values: coordinate guard wins.
const html = card({ feature: feature(0, 0), backendScore: {
  ...globalPoint, properties: { ...globalPoint.properties, score: 88, elevation_m: 123 },
} });
assert(html.includes(NO_TERRAIN));
assert(!html.includes('role="meter"'));
assert(!html.includes("Advantages") && !html.includes("Resources") && !html.includes("Elevation:"));
for (const endpoints of [[[0, 0], [1, 1]], [presets[0].center, presets[1].center]]) {
  const route = await computeMarsRoute({ from: endpoints[0], to: endpoints[1] });
  assert.equal(route.features[0].geometry, null);
  assert.equal(route.features[0].properties.reachable, false);
  for (const metric of ["distance_km", "mean_score", "max_slope_deg", "elevation_gain_m"]) {
    assert.equal(route.features[0].properties[metric], null);
  }
  const routeHtml = card({ pointA: feature(...endpoints[0]), pointB: feature(...endpoints[1]),
    routeProperties: { distance_km: 999, reachable: true, max_slope_deg: 4, elevation_gain_m: 20 } });
  assert(routeHtml.includes(NO_ROUTE));
  // Arkadii's SVG icon paths contain "999"; check visible text, not path coordinates.
  const routeText = routeHtml.replace(/<[^>]*>/g, " ");
  for (const text of ["No known hazard", "Max slope", "elevation +", "sols at rover", "999"])
    assert(!routeText.includes(text), `Unexpected route text: ${text}`);
}
for (const preset of presets) {
  const { lon, lat } = preset.base_point;
  assert.equal(pointUnavailable(lon, lat), null);
  assert.match(pointUnavailable(preset.bbox[0], preset.bbox[1]), /^Outside demo EVA radius/);
  const distantHtml = card({ feature: feature(preset.bbox[0], preset.bbox[1]) });
  assert(distantHtml.includes("Outside demo EVA radius (") && !distantHtml.includes('role="meter"'));
  const distantRoute = card({ pointA: feature(lon, lat), pointB: feature(preset.bbox[0], preset.bbox[1]),
    routeProperties: { reachable: true, distance_km: 999 } });
  assert(distantRoute.includes(NO_ROUTE) && !distantRoute.replace(/<[^>]*>/g, " ").includes("999"));
  const score = await scoreArbitraryPoint({ lon, lat });
  assert.equal(typeof score.properties.score, "number");
  const excluded = { ...score, properties: { ...score.properties, score: 0,
    exclusion_reasons: ["beyond_eva_radius"],
    factors: { ...score.properties.factors, base_distance: { value: 12.3 } } } };
  const excludedHtml = card({ feature: feature(lon, lat), backendScore: excluded });
  assert(excludedHtml.includes("Outside demo EVA radius (12.3 km from base; limit 10 km)"));
  assert(!excludedHtml.includes('role="meter"') && !excludedHtml.includes("Excluded"));
  const flagged = { ...excluded, properties: { ...excluded.properties, exclusion_reasons: [], data_flags: ["beyond_eva_radius"] } };
  assert(card({ feature: feature(lon, lat), backendScore: flagged }).includes("Outside demo EVA radius (12.3 km from base; limit 10 km)"));
  const regularHtml = card({ feature: feature(lon, lat), backendScore: score });
  assert(regularHtml.includes('role="meter"'));
  const steep = { ...score, properties: { ...score.properties, excluded: true,
    exclusion_reasons: ["slope_above_hard_max"] } };
  assert(card({ feature: feature(lon, lat), backendScore: steep }).includes("Slope above 25° demo exclusion threshold"));
  const routeProps = { pointA: feature(lon, lat), pointB: feature(lon, lat),
    routeProperties: { reachable: true, distance_km: 6, max_slope_deg: 4, elevation_gain_m: 20 } };
  const routeText = card(routeProps).replace(/<[^>]*>/g, " ");
  assert(routeText.includes("Max slope 4.0") && routeText.includes("6.0 km"));
  assert(!/sols|m\/sol|km\/h|crewed rover/.test(routeText));
  const navText = renderToStaticMarkup(React.createElement(BottomNavBar, routeProps)).replace(/<[^>]*>/g, " ");
  assert(navText.includes("6.0 km") && !/min|\bh\b/.test(navText));
  for (const text of ["Favorable solar & thermal stability", "Smooth regolith", "Basaltic regolith", "Solar energy"]) assert(!regularHtml.includes(text));
  const environment = { preset_id: preset.id, summary: { air_temp_c: { min: -80, max: -10, mean: null } }, sol_range: [1, 2] };
  const headerHtml = renderToStaticMarkup(React.createElement(Header, { activeTab: "map", environment }));
  assert(headerHtml.includes(preset.id === "gale" ? "Gale \u00b7 Curiosity REMS \u00b7 historical" : "Jezero \u00b7 Perseverance MEDA \u00b7 historical"));
  assert(headerHtml.includes("Min -80") && headerHtml.includes("Max -10") && !headerHtml.includes("Avg."));
}
const emptySections = card({ feature: { ...feature(...presets[0].center),
  properties: { ...feature(...presets[0].center).properties, pros: [], resources: [] } } });
assert(!emptySections.includes("Advantages") && !emptySections.includes("Resources"));
const noWeather = renderToStaticMarkup(React.createElement(Header, { activeTab: "map" }));
assert(!noWeather.includes("historical") && !noWeather.includes("Min ") && !noWeather.includes("Mars Sol"));
console.log("PASS: global engine/card/route guards, both preset radius paths, supported labels, historical min/max weather.");

// Python and TS engines agree cell by cell; derived steep_slope polygons are display-only
// (the slope subscore already ramps 5-25 deg) and contributions include soft hazard multipliers.
const { spawnSync } = await import("node:child_process");
for (const preset of presets) {
  const python = spawnSync(process.env.PYTHON ?? "python", ["-m", "scoring.cli", "score"], {
    cwd: root, input: JSON.stringify({ preset: preset.id, profile: "balanced" }), encoding: "utf8", maxBuffer: 1 << 28 });
  assert.equal(python.status, 0, python.error?.message ?? python.stderr);
  const py = JSON.parse(python.stdout);
  const tsScore = await scorePreset({ preset: preset.id, profile: "balanced" });
  assert.equal(tsScore.meta.methodology_version, py.meta.methodology_version);
  assert.equal(tsScore.features.length, py.features.length);
  let steepCells = 0;
  tsScore.features.forEach((f, i) => {
    const p = f.properties;
    assert.equal(p.score, py.features[i].properties.score, `${preset.id} ${p.cell_id}`);
    if (p.hazard_ids.some(id => id.endsWith("-slope-2"))) steepCells += 1;
    if (!p.excluded && p.hazard_ids.every(id => id.endsWith("-slope-2"))) {
      const sum = Object.values(p.factors).reduce((s, x) => s + (x.contribution ?? 0), 0);
      assert(Math.abs(sum - p.score) <= 0.51, `${preset.id} ${p.cell_id}: ${sum} vs ${p.score}`);
    }
  });
  assert(steepCells > 0, `${preset.id} has steep_slope cells`);
}
console.log("PASS: Python and TS scores match on both presets; steep_slope polygons do not penalise.");

// Exercise Explorer's request effects without a browser or additional test dependency.
let stateIndex = 0;
let stateOverrides = {};
let effects = [];
const hookReact = { ...React,
  useState: (initial) => [stateOverrides[stateIndex++] ?? initial, () => {}],
  useMemo: (fn) => fn(), useCallback: (fn) => fn,
  useEffect: (fn) => effects.push(fn),
};
const previousLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "react") return hookReact;
  if (request === "next/dynamic") return () => () => null;
  return previousLoad.call(this, request, ...args);
};
const Explorer = require("../components/MarsExplorer.tsx").default;
Module._load = previousLoad;
const originalFetch = globalThis.fetch;
const requests = [];
const findComponent = (node, type) => {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;
  return React.Children.toArray(node.props.children).map(child => findComponent(child, type)).find(Boolean);
};
globalThis.fetch = async (url, options) => {
  requests.push([String(url), options]);
  return { ok: true, json: async () => ({ ...globalPoint, features: [{ geometry: null,
    properties: { reachable: false } }] }) };
};
try {
  for (const [a, b, expected] of [
    [[0, 0], [1, 1], null],
    [presets[0].center, presets[1].center, null],
    ...presets.map(p => [p.center, p.center, p.id]),
  ]) {
    stateIndex = 0;
    // Selected feature, route A, route B: useState slots in Explorer.
    stateOverrides = { 4: feature(...a), 5: feature(...a), 6: feature(...b) };
    effects = [];
    requests.length = 0;
    const tree = Explorer({ features: [], presets, environments: {}, commsStatus: {} });
    const nav = findComponent(tree, BottomNavBar);
    const location = findComponent(tree, LocationCard);
    if (!expected) assert.equal(nav.props.isRouteLoading, false);
    if (a[0] === 0) assert.equal(location.props.isScoringLoading, false);
    const cleanups = effects.map(fn => fn());
    await new Promise(resolve => setImmediate(resolve));
    const routeRequests = requests.filter(([url]) => url.endsWith("/api/route"));
    assert.equal(routeRequests.length, expected ? 1 : 0);
    if (expected) assert.equal(JSON.parse(routeRequests[0][1].body).preset, expected);
    const pointRequests = requests.filter(([url]) => url.includes("/api/score/point?"));
    assert.equal(pointRequests.length, a[0] === 0 ? 0 : 1);
    assert(requests.every(([url, options]) => !url.includes("global") && !options?.body?.includes("global")));
    cleanups.forEach(fn => fn?.());
  }
  stateIndex = 0;
  stateOverrides = {};
  effects = [];
  requests.length = 0;
  const sites = [[0, 0], ...presets.map(p => p.center)].map(coords => {
    const site = feature(...coords);
    site.properties.kind = "landing_site";
    return site;
  });
  Explorer({ features: sites, presets, environments: {}, commsStatus: {} });
  const cleanups = effects.map(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests.map(([url]) => new URL(url, "http://localhost").searchParams.get("preset")).sort(), ["gale", "jezero"]);
  cleanups.forEach(fn => fn?.());
} finally {
  globalThis.fetch = originalFetch;
}
console.log("PASS: Explorer skips unsupported point, route and marker requests; Jezero/Gale requests preserved; route time estimates removed; demo slope wording.");

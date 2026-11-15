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
const { scoreArbitraryPoint, computeMarsRoute } = require("../lib/backend-engine.ts");
const { pointUnavailable, NO_TERRAIN, NO_ROUTE } = require("../lib/terrain-availability.ts");
const LocationCard = require("../components/LocationCard.tsx").default;
const Header = require("../components/Header.tsx").default;
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

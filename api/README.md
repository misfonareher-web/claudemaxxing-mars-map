# Backend

Copy `.env.example` to `.env` and replace the DB password before running
`docker compose -p ares up --build -d`. HTTP defaults to loopback port 8080;
override HTTP_PORT in your local .env. For VPS HTTPS, see [DEPLOY.md](../docs/DEPLOY.md).
SCORING_CMD accepts a JSON argv array, defaulting to `["python3","-m","scoring.cli"]`.
Run tests with `php api/tests/run.php`.
On Windows, set `PYTHONIOENCODING=utf-8` for the scoring subprocess so PHP receives UTF-8 JSON.

Examples: `curl localhost:8080/api/health`, `curl localhost:8080/api/presets`,
`curl localhost:8080/api/layers`, `curl "localhost:8080/api/score?preset=jezero"`.

The map uses locally vendored Leaflet with EPSG4326 tile layout. Scores and routes require the scoring stream; missing datasets remain visibly unavailable.

Browser access is controlled in the PHP front controller by `CORS_ALLOWED_ORIGINS`,
a comma-separated list of exact origins (scheme + hostname + optional port, no trailing slash).
Unset/empty means no cross-origin access; `.env.example` lists the Netlify demo and a VPS
placeholder to replace. No wildcard or credentials are enabled. Allowed origins receive
`Access-Control-Allow-Origin` on successful and error JSON responses; all PHP responses
vary by Origin. OPTIONS returns 204 with methods GET, POST, OPTIONS and header Content-Type.
Proxy-generated errors (for example nginx 502 while PHP is down) are outside this PHP policy.
CORS is browser access control, not authentication or a restriction on non-browser callers.
Next.js can either proxy its API handlers to this HTTPS service using a server-side base URL,
or call it directly from an allowed browser origin. This stack serves `web/`, not Next.js.

`GET /api/score/point` may omit `preset`: it is inferred when the coordinates fit exactly
one configured bbox. `POST /api/route` may omit it when **both** endpoints fit the same
unique bbox. Bbox edges are inclusive. Outside, mixed-region or ambiguous coordinates
return 400 (`Point outside the supported regions: jezero, gale` with an explanatory suffix).
Malformed coordinates return 400. An explicitly supplied preset always wins and retains
its existing validation, including rejection of coordinates outside that preset.
`GET /api/score` and `/api/environment` still require an explicit preset.

Other endpoints:

```sh
curl 'localhost:8080/api/features?preset=jezero&kind=ice'
curl 'localhost:8080/api/score/point?preset=jezero&lon=77.45&lat=18.44'
curl 'localhost:8080/api/environment?preset=jezero'
curl localhost:8080/api/provenance
curl -H 'Content-Type: application/json' -d '{"preset":"jezero","from":[77.45,18.44],"to":[77.40,18.50]}' localhost:8080/api/route
```

Weights are a URL-encoded JSON object with nonnegative values (each at most 100) and
positive sum; allowed keys come from `config/scoring_weights.json`. Weights are relative:
the API normalises them to sum 1 and rounds to two decimals before scoring and caching. Profiles and coordinates are
validated against the configured presets. Methodology 0.2.0 profiles are
`balanced`, `safety_first`, `science_first`, and `terrain_first` ("Terrain and proximity").
Legacy `profile=resource_first` resolves to `terrain_first` before cache-key generation;
score, point and route responses report the canonical `meta.profile`.
Ice and thermal are context only: nonzero custom weights for either return HTTP 400.
Both remain in score/point `properties.factors` with weight/contribution zero,
`context_only: true`, and a `note`; raw values, subscores and availability remain.
`meta.methodology_version` is now `0.2.0` on score/point responses. Coordinates are east-positive Mars
longitude/latitude, not Earth coordinates.

`POST /api/route` returns the Python GeoJSON FeatureCollection unchanged. Its route
feature properties include `distance_km`, `elevation_gain_m`, `elevation_loss_m`,
`max_slope_deg`, `mean_score`, `steps` (grid edges), and `reachable`. Added endpoint
fields are `requested: {start: [lon,lat], end: [lon,lat]}`,
`snapped: {start: [lon,lat]|null, end: [lon,lat]|null}` (nearest valid cell centers),
`snap_km: {start: number|null, end: number|null}`, and `max_snap_km: number`.
`eva_max_radius_km` and `base_distance_km: {start: number, end: number}` report
the preset EVA radius and requested endpoint distances from its base, in km.
The radius comes from `config/mission_presets.json`.
Coordinates use east-positive Mars degrees; distances use the Mars haversine.
The default limit is one grid-cell diagonal measured at the grid bbox midpoint
(about 0.63 km in Jezero and 0.64 km in Gale). Set `route.max_snap_km` in
`config/scoring_weights.json` to a finite nonnegative number to override it;
an absent or null value uses the diagonal. This is not a request parameter.

An over-limit endpoint returns a normal route response with `reachable: false`,
`geometry: null`, null distance/elevation/slope/score metrics, and `steps: 0`.
`unreachable_reason` is `start_too_far_from_valid_cell`,
`end_too_far_from_valid_cell`, `beyond_eva_radius`, `no_valid_cells`, or `no_path`, with a human-readable
`message`. An endpoint that exceeds the snap limit and is itself outside the EVA
radius reports `beyond_eva_radius`, for example "Start is 12.1 km from base; EVA limit is 10 km."
No valid cells takes precedence, followed by start rejection, then end rejection.
Both fields are null on success. When both endpoints exceed the limit,
the start reason takes precedence. Nearest candidate centers and snap distances
remain reported even when rejected; they are null only when no valid cells exist.
Endpoints accepted within the limit can still be disconnected (`no_path`).
Bbox validation still applies after preset inference: points outside the preset
bbox remain bad requests. Reachability describes a coarse heuristic grid path,
not a validated EVA traverse.

Point scores already report radius exclusions through `properties.excluded: true`
and `properties.exclusion_reasons` containing `beyond_eva_radius`; the cell distance
is in `properties.factors.base_distance.value` (km). These describe the returned
grid cell, rather than the exact requested coordinates.

The API skips its PostgreSQL score cache when the database is down and reads
vector files directly. Cache keys include the canonical request, methodology version and the size and
modification time of config, scoring code, hazard/science vectors and the preset's grid files.
Each cache write prunes rows older than one day and keeps at most the newest 200. Feature loading at container startup uses upserts;
missing files are skipped. Never use `docker compose down -v` on the VPS: it deletes DB state.

The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.
Absence of a mapped hazard does not mean the terrain is safe.
Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.

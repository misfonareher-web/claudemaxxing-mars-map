# Backend

Run `docker compose up --build -d`. HTTP defaults to port 8080; override HTTP_PORT in your local .env.
SCORING_CMD accepts a JSON argv array, defaulting to `["python3","-m","scoring.cli"]`.
Run tests with `php api/tests/run.php`.

Examples: `curl localhost:8080/api/health`, `curl localhost:8080/api/presets`,
`curl localhost:8080/api/layers`, `curl "localhost:8080/api/score?preset=jezero"`.

The map uses locally vendored Leaflet with EPSG4326 tile layout. Scores and routes require the scoring stream; missing datasets remain visibly unavailable.

Other endpoints:

```sh
curl 'localhost:8080/api/features?preset=jezero&kind=ice'
curl 'localhost:8080/api/score/point?preset=jezero&lon=77.45&lat=18.44'
curl 'localhost:8080/api/environment?preset=jezero'
curl localhost:8080/api/provenance
curl -H 'Content-Type: application/json' -d '{"preset":"jezero","from":[77.45,18.44],"to":[77.40,18.50]}' localhost:8080/api/route
```

Weights are a URL-encoded JSON object with nonnegative values and positive sum;
allowed keys come from `config/scoring_weights.json`. Profiles and coordinates are
validated against the configured presets. Coordinates are east-positive Mars
longitude/latitude, not Earth coordinates.

`POST /api/route` returns the Python GeoJSON FeatureCollection unchanged. Its route
feature properties include `distance_km`, `elevation_gain_m`, `elevation_loss_m`,
`max_slope_deg`, `mean_score`, `steps` (grid edges), and `reachable`. Added endpoint
fields are `requested: {start: [lon,lat], end: [lon,lat]}`,
`snapped: {start: [lon,lat]|null, end: [lon,lat]|null}` (nearest valid cell centers),
`snap_km: {start: number|null, end: number|null}`, and `max_snap_km: number`.
Coordinates use east-positive Mars degrees; distances use the Mars haversine.
The default limit is one grid-cell diagonal measured at the grid bbox midpoint
(about 0.63 km in Jezero and 0.64 km in Gale). Set `route.max_snap_km` in
`config/scoring_weights.json` to a finite nonnegative number to override it;
an absent or null value uses the diagonal. This is not a request parameter.

An over-limit endpoint returns a normal route response with `reachable: false`,
`geometry: null`, null distance/elevation/slope/score metrics, and `steps: 0`.
`unreachable_reason` is `start_too_far_from_valid_cell`,
`end_too_far_from_valid_cell`, `no_valid_cells`, or `no_path`, with a human-readable
`message`. Both fields are null on success. When both endpoints exceed the limit,
the start reason takes precedence. Nearest candidate centers and snap distances
remain reported even when rejected; they are null only when no valid cells exist.
Endpoints accepted within the limit can still be disconnected (`no_path`).
The request format and bbox validation are unchanged: points outside the preset
bbox remain bad requests. Reachability describes a coarse heuristic grid path,
not a validated EVA traverse.

The API skips its PostgreSQL score cache when the database is down and reads
vector files directly. Cache keys include the canonical request and config/grid
manifest modification times. Feature loading at container startup uses upserts;
missing files are skipped. Run `docker compose down -v` to discard demo DB state.

The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.
Absence of a mapped hazard does not mean the terrain is safe.
Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.

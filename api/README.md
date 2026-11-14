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

The API skips its PostgreSQL score cache when the database is down and reads
vector files directly. Cache keys include the canonical request and config/grid
manifest modification times. Feature loading at container startup uses upserts;
missing files are skipped. Run `docker compose down -v` to discard demo DB state.

The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.
Absence of a mapped hazard does not mean the terrain is safe.
Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.

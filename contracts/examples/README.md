# Contract examples

Canonical, illustrative payload shapes for the contracts in `ARCHITECTURE.md` §6–§8. Values are examples,
not data. Tests should check that real outputs have the same keys and value types. Read-only for streams.

- `score.example.json` — `scoring.cli score` / `GET /api/score`
- `route.example.json` — `scoring.cli route` / `POST /api/route`
- `route.unreachable.example.json` — same route response when the end is too far from a valid cell
- `features.example.geojson` — `data/*.geojson` / `GET /api/features`
- `manifest.example.json` — `data/grids/<preset>/manifest.json`
- `environment.example.json` — `data/environment/<preset>.json` / `GET /api/environment`
- `error.example.json` — CLI stderr and API error body

The route examples are computed from committed Jezero data with the balanced
profile, rather than illustrative numbers. Regenerate with `python -m scoring.cli route`
and stdin `{"preset":"jezero","from":[77.4508,18.4447],"to":[77.401,18.498]}`
for the reachable example, or `{"preset":"jezero","from":[77.4508,18.4447],"to":[77.2,18.25]}`
for the unreachable example. Endpoint metadata includes `requested`, `snapped`,
`snap_km`, and `max_snap_km`; rejected nearest candidates are still reported.
`unreachable_reason` and `message` are null on success. Failure reasons are
`start_too_far_from_valid_cell`, `end_too_far_from_valid_cell`, `no_valid_cells`,
and `no_path`; geometry and route metrics are null, with zero steps, on failure.

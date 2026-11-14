# Contract examples

Canonical, illustrative payload shapes for the contracts in `ARCHITECTURE.md` §6–§8. Values are examples,
not data. Tests should check that real outputs have the same keys and value types. Read-only for streams.

- `score.example.json` — `scoring.cli score` / `GET /api/score`
- `route.example.json` — `scoring.cli route` / `POST /api/route`
- `features.example.geojson` — `data/*.geojson` / `GET /api/features`
- `manifest.example.json` — `data/grids/<preset>/manifest.json`
- `environment.example.json` — `data/environment/<preset>.json` / `GET /api/environment`
- `error.example.json` — CLI stderr and API error body

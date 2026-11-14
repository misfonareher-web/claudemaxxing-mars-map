# ARES — Mars data (branch `data`)

NASA Space Apps 2026 · *Interplanetary Survival Guide: Martian Map* · team Claudemaxxing.

Готовые данные для карты, маршрутов и графиков: рельеф, уклоны, тепловой ИК, лёд, опасности,
места посадок, история миссий, атмосфера (MEDA/REMS) и текстура Марса для режима сферы.
Все наборы — из архивов NASA (PDS, Mars Trek), с источником и ограничениями в `data/provenance.json`.

## Conventions

- Mars 2000 sphere, R = 3 396 190 m; **planetocentric latitude, east-positive longitude in [-180, 180]**.
- GeoJSON coordinates are `[lon, lat]` (on Mars, not WGS84). BBoxes are `[min_lon, min_lat, max_lon, max_lat]`.
- Great-circle distance: `d = 2R·asin(√(sin²(Δφ/2) + cos φ1 cos φ2 sin²(Δλ/2)))`; 1 km = 0.621371 mi.
- UTF-8 JSON, no NaN (missing = `null`).

## Files

| Path | What | Use it for |
|---|---|---|
| `config/mission_presets.json` | Presets (Jezero / Perseverance, Gale / Curiosity): bbox, center, zoom, base point, science targets | Region selector, initial view |
| `data/grids/<preset>/manifest.json` + `*.npy` | float32 grids over the preset bbox (row 0 = north, col 0 = west): `elevation_m`, `slope_deg`, `roughness_m`, `thermal_index` (0–1), `ice_index` (0–1) | Pathfinding (A* on slope/elevation), heatmaps |
| `data/landing_sites.geojson` | 10 landing sites (Viking 1/2, Pathfinder, Spirit, Opportunity, Phoenix, Curiosity, InSight, Perseverance, Zhurong), each with `source_ref` | Map markers |
| `data/missions.json` | 12 missions: dates, instruments, key results with source links, `landing_site_id` | DB table "previous missions", info cards |
| `data/science_targets.geojson` | EVA science targets per preset | Route destinations |
| `data/hazards.geojson` | MOLA steep-slope zones (severity 2/3; `hazard_kind: steep_slope`) plus two cited sand-dune outlines (severity 2; `hazard_kind: sand_dunes`) | Hazard overlay |
| `data/ice.geojson` | Regional neutron-spectrometer ice proxy per preset + global ice context (Odyssey GRS, ice scarps, polar cap, Phoenix) | Ice overlay |
| `data/environment/jezero.json` | Mars 2020 **MEDA**: 49 sampled sols (10–1846): air temp min/max + local time, pressure, humidity | Atmosphere charts |
| `data/environment/gale.json` | MSL **REMS**: 49 sampled sols (10–4810): air temp, ground temp (max), pressure, humidity | Atmosphere charts |
| `data/textures/mars_global_2k.jpg` | 2048×1024 equirectangular MOLA relief, lon -180..180 | Globe / sphere mode |
| `data/provenance.json`, `docs/DATA_PROVENANCE.md` | Source, mission, instrument, date, coverage, resolution, units, format, processing, limitations for every dataset | Credits / submission |
| `contracts/*.example.*` | Small example payloads of the formats above | Parser tests |

Grid cell `(r, c)` center: `lon = min_lon + (c + 0.5)·dlon`, `lat = max_lat − (r + 0.5)·dlat` (`cell_size_deg = [dlat, dlon]`).
Load in Python: `numpy.load('data/grids/jezero/slope_deg.npy', allow_pickle=False)`.

Mars Trek WMTS basemaps (EPSG:4326-style, 2×1 tiles at z=0):
`https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg` and
`https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018/1.0.0/default/default028mm/{z}/{y}/{x}.png`.

## Limitations (show these in the UI)

- Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.
- Absence of a mapped hazard does not mean the terrain is safe.
- MOLA cells are ~463 m: slopes are smoothed; boulders, ripples and small craters are not resolved.
- `thermal_index` is relative THEMIS image brightness, not temperature or thermal inertia.
- Weather series are historical point measurements at a moving rover, not current regional conditions.
- If a 0–100 index is built on this data, it is a conditional heuristic methodology for comparison, not a safety certification or a validated model.

## Rebuild

Python ≥ 3.11 with NumPy and Pillow (`pip install -r requirements.txt`), plus `curl`.

```
python -m etl.build --all       # download from NASA archives (cached in data/raw/, ignored by git)
python -m etl.validate          # contract + plausibility checks
python -m unittest discover -s etl/tests
```

`config/scoring_weights.json` is read only for the slope thresholds that define hazard severity.

## Backend (branch `backend`)

nginx + PHP 8 (FPM) + PostgreSQL in Docker; PHP calls the Python scoring engine.

```sh
docker compose up --build -d          # http://localhost:8080 (override with HTTP_PORT)
docker compose exec -T api php api/tests/run.php
python -m pytest tests etl/tests -q
```

- PHP → Python: `proc_open(python3 -m scoring.cli <score|point|route>)`, JSON request on stdin, JSON on stdout; exit 2 → HTTP 400, 3 → 404, 20 s timeout. PostgreSQL caches scores and stores features; the API falls back to files if the DB is down.
- Endpoints: `GET /api/health`, `/api/presets`, `/api/layers`, `/api/provenance`, `/api/features?preset=&kind=`, `/api/environment?preset=`, `/api/score?preset=&profile=&weights=`, `/api/score/point?preset=&lon=&lat=`, `POST /api/route` `{"preset":"jezero","from":[lon,lat],"to":[lon,lat]}`. Details: `api/README.md`; request/response examples: `contracts/examples/`.
- Scoring method and limits: `scoring/METHODOLOGY.md`. Hazards with severity ≥ the configured threshold are excluded; lower severities (e.g. the `sand_dunes` outlines) are penalized.
- `web/` is a minimal Leaflet test client for the API (nginx serves it at `/`). It is not the team's frontend.

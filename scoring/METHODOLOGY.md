# Conditional heuristic EVA methodology

This is a conditional comparison of coarse terrain cells, not a validated model or safety certification. Resolution hides local obstacles; thermal brightness and ice evidence are context only; weights and mission scenarios remain team decisions.

The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.
Absence of a mapped hazard does not mean the terrain is safe.
Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.

Weights are normalized to sum to one. At each cell unavailable factors have zero effective weight and remaining weights are renormalized. Contributions are 100 times effective weight times subscore. Sum contributions, apply each overlapping lower-severity hazard multiplier (to the score and to every contribution), round to the nearest integer. Exclusions override with zero. Required terrain nodata yields null and cannot be traversed.

Parameters come unchanged from config/scoring_weights.json. Slope is one through 5 degrees, falls linearly to zero at 25 degrees, and excludes above 25. Roughness is one through 10 m and zero at 60 m. For context display only, thermal scales linearly from 0.2 to 0.8 and ice from zero to one; neither contributes to suitability. These normalized context values are not physiological limits. Science is exp(-nearest selected target distance / 3 km); base proximity is max(0, 1-distance/preset EVA radius). The seeded radius is 10 km. Hazards at severity 3 exclude; others multiply by 1-0.15*severity, except kinds listed in `hazard_rules.score_exempt_kinds`, which are display-only. All parameters and profiles can be changed in the existing JSON keys; request weights replace the profile weights, unspecified factors become zero. Nonzero ice/thermal request weights are rejected by both Python and the API; zero entries remain valid.

Methodology version **0.2.0** removes ice and thermal from every shipped profile, then proportionally renormalizes slope, roughness, science and base distance. Values are rounded to three decimals, with the rounding residue assigned to the largest weight so each row sums exactly to 1.000.

Methodology version **0.2.1** stops penalising slope twice. The derived `steep_slope` polygons (`hz-jezero-slope-2`, `hz-gale-slope-2`) mark every cell between `ideal_max_deg` (5°) and `hard_max_deg` (25°), exactly where the slope subscore already ramps down, so their severity-2 multiplier (×0.70) created a ~30% score cliff just past 5° (a 5.44° Gale cell scored 38 instead of 55). They stay on the map but are listed in `hazard_rules.score_exempt_kinds`; mapped hazards such as `sand_dunes` are still penalised. Soft multipliers now also scale each cell's contributions, so the factor breakdown sums to the score.

| Profile | Slope | Roughness | Thermal | Ice | Science | Base distance |
|---|---:|---:|---:|---:|---:|---:|
| balanced | 0.428 | 0.143 | 0 | 0 | 0.286 | 0.143 |
| safety_first | 0.529 | 0.235 | 0 | 0 | 0.059 | 0.177 |
| science_first | 0.235 | 0.059 | 0 | 0 | 0.588 | 0.118 |
| terrain_first | 0.445 | 0.111 | 0 | 0 | 0.222 | 0.222 |

`resource_first` is retained only as an input alias of `terrain_first`, labeled "Terrain and proximity": slope dominates, with equal science and base proximity weights. A "near base" label would overstate the emphasis on distance. Score, point and route responses report the canonical `meta.profile`, including when the alias is requested. The web test client lists the canonical profile.

Ice is a regional neutron-flux suppression proxy, constant within each committed equatorial preset (Jezero 0.1223212406, Gale 0.3720560074), not a measured local ice concentration or accessible deposit. It cannot distinguish local EVA cells. Its former nonzero weight added a region-dependent offset and could affect hazard-penalized rankings and routing tradeoffs. Real mid-latitude ice evidence such as SWIM is future work requiring suitable spatial evidence and interpretation; it is not a substitute equatorial score input today.

Thermal is rendered THEMIS **day-IR image brightness**, sampled from Mars Trek tile pixels (`etl/sources/themis_trek.py`): image contrast, not temperature or thermal inertia. Brighter pixels have no demonstrated suitability benefit. Calibrated night IR / thermal inertia is future work; no replacement product is silently swapped in. The legacy normalization parameters remain solely to compute displayed context subscores.

Both factors remain in every cell's `properties.factors` explanation with the raw value, normalized subscore, availability, `weight: 0`, `contribution: 0`, `context_only: true` and an explanatory `note`. Missing context values remain unavailable and flagged without changing the score denominator. The same fields appear in point responses. The contract example is a single-feature excerpt of real Jezero balanced CLI output; its metadata grid and statistics describe the full output. Numbers are generated by `python -m scoring.cli score`, not manually illustrated. Contributions include any soft hazard multiplier and sum to the final score before rounding, except in excluded cells.

Compute on the data grid, then block nan-mean numeric fields using the smallest integer block factor satisfying max_cells. Partial edge blocks are clipped to the bbox. Any exclusion in a block conservatively excludes that output cell; hazard IDs and exclusion reasons are unioned. Effective weights in metadata are the mean of per-cell weights. Cell factors retain their local weights. Nodata in individual factors is unavailable per cell. Missing vectors are flagged, not interpreted as evidence of safety. Polygon ray casting uses the usual half-open edge convention; hole interiors are excluded.

Routing uses 8-connected A* with spherical edge distances and destination cell cost distance*(1+k*(1-score/100)). The heuristic lower-bounds travel cost using the greatest available score. Diagonal moves cannot cross blocked corners. Endpoints inside the bbox snap to the nearest finite, nonexcluded cell by spherical distance. Disconnected components yield null geometry and reachable false; no valid cells also yields unreachable. A coincident snapped endpoint produces a two-position zero-length line. Elevation gain/loss and route summaries use the full unsimplified path; output drops collinear grid directions. Route thresholds and score-cost factor come from config.

Endpoint snapping is limited to one cell diagonal, measured with the Mars haversine at the grid bbox midpoint (about 0.63 km in Jezero and 0.64 km in Gale). `route.max_snap_km` in config/scoring_weights.json overrides this with a finite nonnegative distance; absent or null uses the diagonal. An endpoint beyond the limit makes the route unreachable with null geometry and metrics (steps remains zero), an explicit reason and message. Requested coordinates, nearest valid cell centers, snap distances and the limit are always reported, including rejected candidates; centers and distances are null if no valid cells exist. Disconnected accepted endpoints report `no_path`.

Runtime imports are restricted to the standard library and NumPy. Fixtures are generated only under temporary directories. Python 3.11/NumPy 1.24 compatibility is by API selection; actual runtime verification is reported separately.

## Committed-data demo (0.1.0 -> 0.2.0)

Recomputed using `python -m scoring.cli` on the committed grids and targets from `team/backend` at `0b13aad`. Max is the returned grid maximum; base is the returned point score at the configured base. Route statistics describe the snapped grid path, not the exact requested-coordinate traverse. Scores are heuristic and not probabilities; a higher revised score does not establish improved physical safety.

| Preset / balanced primary route | Max before -> after | Base before -> after | Distance km before -> after | Gain m before -> after | Max slope (deg) before -> after |
|---|---:|---:|---:|---:|---:|
| Jezero / Delta front | 79 -> 96 | 51 -> 62 | 4.236 -> 4.236 | 145.553 -> 145.553 | 3.963 -> 3.963 |
| Gale / Pahrump Hills | 77 -> 88 | 65 -> 75 | 6.062 -> 6.062 | 68.851 -> 68.851 | 2.612 -> 2.612 |

| Profile (0.2.0) | Jezero max / base | Gale max / base |
|---|---:|---:|
| balanced | 96 / 62 | 88 / 75 |
| safety_first | 98 / 68 | 95 / 95 |
| science_first | 94 / 54 | 87 / 50 |
| terrain_first | 96 / 64 | 85 / 81 |

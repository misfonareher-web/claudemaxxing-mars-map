# Conditional heuristic EVA methodology

This is a conditional comparison of coarse terrain cells, not a validated model or safety certification. Resolution hides local obstacles; thermal brightness and ice evidence are context only; weights and mission scenarios remain team decisions.

The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.
Absence of a mapped hazard does not mean the terrain is safe.
Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.

Weights are normalized to sum to one. At each cell unavailable factors have zero effective weight and remaining weights are renormalized. Contributions are 100 times effective weight times subscore. Sum contributions, apply each overlapping lower-severity hazard multiplier, round to the nearest integer. Exclusions override with zero. Required terrain nodata yields null and cannot be traversed.

Parameters come unchanged from config/scoring_weights.json. Slope is one through 5 degrees, falls linearly to zero at 25 degrees, and excludes above 25. Roughness is one through 10 m and zero at 60 m. For context display only, thermal scales linearly from 0.2 to 0.8 and ice from zero to one; neither contributes to suitability. These normalized context values are not physiological limits. Science is exp(-nearest selected target distance / 3 km); base proximity is max(0, 1-distance/preset EVA radius). The seeded radius is 10 km. Hazards at severity 3 exclude; others multiply by 1-0.15*severity, except kinds listed in `hazard_rules.score_exempt_kinds` (`steep_slope`), which are already scored by the slope subscore. All parameters and profiles can be changed in the existing JSON keys; request weights replace the profile weights, unspecified factors become zero. Nonzero ice/thermal request weights are rejected by both Python and the API; zero entries remain valid.

Methodology version **0.2.0** removes ice and thermal from every shipped profile, then proportionally renormalizes slope, roughness, science and base distance. Values are rounded to three decimals, with the rounding residue assigned to the largest weight so each row sums exactly to 1.000.

Methodology version **0.2.1** stops penalising slope twice: the derived severity-2 `steep_slope` outlines (`hz-jezero-slope-2`, `hz-gale-slope-2`, every cell with 5° < slope ≤ 25°) no longer apply the ×0.70 soft penalty, because the slope subscore already ramps from 5° to 25°. Previously a cell just past 5° dropped about 30% (Gale r3c51 at 5.44°: 38 -> 55; Jezero r42c17 at 5.44°: 40 -> 57, balanced). The outlines are still listed in `hazard_ids`. Other soft hazards, including the derived `sand_dunes` envelopes, are still penalised. Per-cell contributions are now scaled by the soft-hazard multiplier so they sum to the score.

| Profile | Slope | Roughness | Thermal | Ice | Science | Base distance |
|---|---:|---:|---:|---:|---:|---:|
| balanced | 0.428 | 0.143 | 0 | 0 | 0.286 | 0.143 |
| safety_first | 0.529 | 0.235 | 0 | 0 | 0.059 | 0.177 |
| science_first | 0.235 | 0.059 | 0 | 0 | 0.588 | 0.118 |
| terrain_first | 0.445 | 0.111 | 0 | 0 | 0.222 | 0.222 |

`resource_first` is retained only as an input alias of `terrain_first`, labeled "Terrain and proximity": slope dominates, with equal science and base proximity weights. A "near base" label would overstate the emphasis on distance. Score, point and route responses report the canonical `meta.profile`, including when the alias is requested. The web test client lists the canonical profile.

Ice is a regional neutron-flux suppression proxy, constant within each committed equatorial preset (Jezero 0.1223212406, Gale 0.3720560074), not a measured local ice concentration or accessible deposit. It cannot distinguish local EVA cells. Its former nonzero weight added a region-dependent offset and could affect hazard-penalized rankings and routing tradeoffs. Real mid-latitude ice evidence such as SWIM is future work requiring suitable spatial evidence and interpretation; it is not a substitute equatorial score input today.

Thermal is rendered THEMIS **day-IR image brightness**, sampled from Mars Trek tile pixels (`etl/sources/themis_trek.py`): image contrast, not temperature or thermal inertia. Brighter pixels have no demonstrated suitability benefit. Calibrated night IR / thermal inertia is future work; no replacement product is silently swapped in. The legacy normalization parameters remain solely to compute displayed context subscores.

Both factors remain in every cell's `properties.factors` explanation with the raw value, normalized subscore, availability, `weight: 0`, `contribution: 0`, `context_only: true` and an explanatory `note`. Missing context values remain unavailable and flagged without changing the score denominator. The same fields appear in point responses. The contract example is a single-feature excerpt of real Jezero balanced CLI output; its metadata grid and statistics describe the full output. Numbers are generated by `python -m scoring.cli score`, not manually illustrated. Contributions include the soft-hazard multiplier and sum to the final score before rounding, except in excluded cells.

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

## Score explanation

For finite, non-excluded native cells, `score = pre_hazard_score × hazard_multiplier`,
rounded to the nearest integer. `pre_hazard_score` is the sum of the unrounded
factor contributions before the multiplier on the 0–100 scale, reported to one decimal;
returned contributions are already multiplied, so they sum to the unrounded score.
`hazard_multiplier` is the product of all non-excluding hazard penalty factors,
reported to three decimals (1.0 without penalties). `hazard_penalties` lists each
applied hazard's `id`, `severity` and `factor`; excluding hazards are not penalties.
The displayed rounded inputs reconstruct the integer score within ±1.

At Pahrump Hills (137.3775, -4.6627), Gale cell r21c23 has pre-hazard contributions
42.800 + 12.177 + 26.311 + 6.061 ≈ 87.35, displayed as `pre_hazard_score: 87.3`.
The severity-2 `hz-gale-bagnold-dunes` penalty has factor 0.700, so
87.3 × 0.700 ≈ 61.1 and the returned score is 61 (the returned contributions sum to ≈ 61.1).

Exclusion independently overrides the score with zero; it is never represented
as a multiplier. Excluded cells retain their finite pre-hazard sum and any soft
penalties. Required terrain nodata or no available weighted factors gives a null
pre-hazard score wherever the native score is null.

When block aggregation is required (factor k > 1), pre-hazard scores use the
same finite native-score population as the score's nan-mean. Multipliers are the
arithmetic mean of native cell multipliers; penalties are unioned once per hazard
covering any native cell, with its original factor. The union's factors must not
be multiplied to reconstruct the block multiplier: hazards can cover different
subsets. Mean(pre × multiplier) generally differs from mean(pre) × mean(multiplier),
so the reconstruction invariant applies only to native cells. Any exclusion in
a block still overrides its returned score to zero. These fields describe the
block's components without changing existing score aggregation or exclusions.
Routes expose a path mean_score only, so have no per-cell explanation fields.

## Relief is counted more than once

Relief enters through slope and roughness (and, before 0.2.1, also through derived slope hazards). The slope subscore
falls linearly from 1 at 5° to 0 at 25°; slopes above 25° are excluded.
`etl/sources/features.py` dissolves cells with slope >5° and ≤25° into the
severity-2 `hz-jezero-slope-2` / `hz-gale-slope-2` outlines; up to 0.2.0 they added a ×0.70 penalty,
since 0.2.1 `steep_slope` is score-exempt, so the means below are equal.
Roughness is the edge-padded 3×3 elevation population standard deviation, not
variability after removing a fitted slope, so it also penalises smooth inclined terrain.

| Preset | Slope-outline cells / all | Pearson slope–roughness | Balanced mean with / without slope outline |
|---|---:|---:|---:|
| Jezero | 637 / 4118 | 0.992 | 24.289 / 24.289 |
| Gale | 1366 / 2704 | 0.993 | 25.972 / 25.972 |

Correlation uses all finite native pairs; means use unrounded finite native scores,
including excluded zeros. The counterfactual removes only the named outline;
all other hazards, factors and exclusions stay in place. A smooth north–south 10°
plane at native spacing has interior roughness 66.211 m (Jezero), 65.645 m (Gale):
`std = north–south spacing × tan(10°) × sqrt(2/3)`. Both exceed the 60 m zero-subscore
threshold: roughness subscore is 0, despite no small-scale bumps.
This demo model choice penalises steep terrain strongly. It is not a calibrated
traversability model; separating these relief channels is future redesign work.

## Hazards are sampled at cell centres

`scoring/geo.py` evaluates outlines only at native cell centres, not at the queried
point or over the cell area. Counts below cover each preset's entire native grid.

| Preset / outline ID | Centre inside | Square touches/intersects |
|---|---:|---:|
| Jezero / hz-jezero-slope-2 | 637 | 1029 |
| Jezero / hz-jezero-seitah | 18 | 42 |
| Gale / hz-gale-slope-2 | 1366 | 1519 |
| Gale / hz-gale-bagnold-dunes | 271 | 359 |

Centre counts use the scorer's ray casting. Square counts use Shapely closed
polygon/rectangle intersection, including edges and vertices; lattice coordinates
within 1e-10 of an integer are snapped to remove grid-boundary roundoff.
Partly covered edge cells may get no penalty; a point just outside an outline can
be penalised through its cell centre. Pahrump Hills (137.3775, -4.6627) is about
0.185 km outside the Bagnold envelope, but cell r21c23's centre is about 0.056 km
inside: displayed score 61 = round(87.3 × 0.70). Distances use the nearest envelope
boundary in a local equirectangular projection on the scorer's Mars sphere.
Fractional coverage is future work. Reproduce both tables and the plane/point
checks with `python -m scripts.methodology_numbers` (NumPy and Shapely required).

# Calculate a Mars EVA comparison score

School / introductory college physics and astronomy · 25–35 minutes · calculator with exp(x).

**Goals:** normalize measurements; calculate weighted sums and penalties; distinguish measurements, assumptions and missing evidence. This heuristic index is not a probability of safety. Teacher: distribute the activity first, then reveal the key. Intended as two compact pages; print layout has not been rendered.

## Activity — page 1

Actual displayed API values, captured 15 Nov 2026, approximately 15:13 UTC / 17:13 Kyiv; balanced profile, methodology 0.2.0. Inputs describe coarse MOLA-derived cells, not foot-scale terrain. Distances use cell centres.

| Location | Query longitude, latitude | Cell ID | Cell-centre longitude, latitude |
|---|---|---|---|
| Bradbury Landing | 137.4417, −4.5895 | r11c31 | 137.442308, −4.588462 |
| Pahrump Hills | 137.3775, −4.6627 | r21c23 | 137.380769, −4.665385 |

Each entry below is **input / API subscore / API contribution**. Contributions are pre-hazard score points.

| Factor (units) | Weight | Bradbury: input / s / contribution | Pahrump: input / s / contribution |
|---|---:|---:|---:|
| Slope (°) | 0.428 | 0.695 / 1 / 42.800 | 2.612 / 1 / 42.800 |
| Roughness: 3×3 elevation SD (m) | 0.143 | 3.978 / 1 / 14.300 | 17.422 / 0.852 / 12.177 |
| Nearest science-target distance (km) | 0.286 | 5.833 / 0.143 / 4.092 | 0.250 / 0.920 / 26.311 |
| Hypothetical-base distance (km) | 0.143 | 0.071 / 0.993 / 14.198 | 5.761 / 0.424 / 6.061 |
| Day-IR brightness (unitless) | 0 | 0.471 / 0.451 / 0 | 0.627 / 0.712 / 0 |
| Regional neutron ice proxy (unitless) | 0 | 0.372 / 0.372 / 0 | 0.372 / 0.372 / 0 |
| Hazard multiplier M | — | 1.000; no penalty | 0.700; Bagnold, severity 2 |

All factors are available; neither cell is excluded. Brightness is not temperature; the regional ice proxy does not measure accessible ice. Both are context only, with zero weight.

**Rules:** `clip(x) = min(1, max(0, x))`.

- Slope: `s = clip((25 − slope_deg)/20)`; full subscore through 5°, zero at 25°; above 25° excluded.
- Roughness: `s = clip((60 − roughness_m)/50)`; full through 10 m, zero from 60 m. This is elevation variability, not rock height.
- Science: `s = exp(−distance_km/3)` to the nearest configured target.
- Base: `s = clip(1 − distance_km/10)`; 10 km is a demo assumption.

For these native cells: **`pre = 100 × Σ(w × s)`; `score = round(pre × M)`**. A severity-2 multiplier is `1 − 0.15×2 = 0.70`; overlaps multiply. Generally, missing factors are dropped and available weights renormalized. Required elevation/slope nodata is untraversable; exclusions independently override scores with zero.

1. Check that weights sum to 1. Calculate subscores, retaining six decimals internally.
2. Multiply each by its weight and 100; sum the four contributions.
3. Apply M, round only at the end, and predict which cell finishes higher.
4. Compare with the [Bradbury API](https://celc0r-realm.lol/api/score/point?lon=137.4417&lat=-4.5895&preset=gale&profile=balanced), [Pahrump API](https://celc0r-realm.lol/api/score/point?lon=137.3775&lat=-4.6627&preset=gale&profile=balanced), then select those coordinates on the [map](https://celc0r-realm.lol) in Gale/balanced. Check profile and version if results differ.
5. In the map's point card, open **How is this score calculated?**: it lists the same factor / value / subscore / weight / points and the line `pre × M = score` for any selected cell.

---

## Teacher key and discussion — page 2

**Bradbury:** API contributions sum to `42.800 + 14.300 + 4.092 + 14.198 = 75.390`. Reported pre = **75.4**, M = **1**, final = **75**.

**Pahrump:** `42.800 + 12.177 + 26.311 + 6.061 = 87.349`. Reported pre = **87.3**, M = **0.7**; `87.3 × 0.70 = 61.11 → 61`. The hazard penalty reverses the pre-hazard ordering.

**Precision check:** recomputing from displayed raw inputs gives pre ≈75.390632 and 87.352348; applying M gives **75 and 61**, exactly matching the API integers. Using displayed subscores gives 75.3897 and 87.3588, also yielding **75 and 61**. The backend uses unrounded values; API inputs/subscores/contributions are rounded separately to three decimals, pre to one. Thus 87.352348 would display as 87.4, but the backend's full-precision pre displays as 87.3: do not "correct" it. We reproduce the integers, not exact hidden intermediate values. Native-cell explanation fields generally reconstruct within ±1; aggregated blocks need not follow this identity. Python rounding uses ties to even; neither example is a tie.

**Spatial caveat:** Pahrump's waypoint is about 0.185 km outside the approximate dune envelope, but its cell centre is inside. The penalty is not evidence of dunes at the waypoint. Boundaries have hundreds of metres of uncertainty. Bradbury's nonzero base distance likewise reflects its cell centre.

**Three discussion questions (suggested answers):**

1. **Double the slope weight: what changes?** Renormalize `(0.856, 0.143, 0.286, 0.143)` by dividing by 1.428. Both cells have slope s = 1, so `new_pre = (old_pre + 42.8)/1.428`. Contribution totals give ≈82.766 and 91.140; final scores become **83 and 64** after existing penalties. This is a classroom counterfactual, not a live custom-weight check or proof of greater safety.
2. **Does "not assessed" mean safe?** No: only two of eight hazard types are assessed. Missing rocks, cliffs or radiation assessments remain unknown even with a high score. Assessed categories also have coverage limits.
3. **Does the 10 km circle guarantee a safe return?** No: radial distance omits route detours, return travel, fieldwork, suit performance and reserves. Coarse cells miss local obstacles.

**Кратко по-русски:** ученики получают реальные входные данные двух клеток, вручную считают взвешенную сумму и применяют штраф за опасность. Bradbury — **75**, Pahrump — **61** после ×0,70 (штраф за дюны Bagnold). Штраф меняет порядок: до штрафа Pahrump выше. Штраф назначается по центру клетки, а не по самой точке Pahrump. Это сравнительный индекс, а не оценка безопасности.

Sources: [`scoring/METHODOLOGY.md`](../../scoring/METHODOLOGY.md), `scoring/{factors.py,index.py}`, [`config/scoring_weights.json`](../../config/scoring_weights.json). Saved API responses: [Bradbury](bradbury_api.json), [Pahrump](pahrump_api.json), [capture manifest](api_capture_manifest.json). Arithmetic checked; printed pagination not verified.

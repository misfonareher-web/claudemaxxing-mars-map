# Weather contract changes (MEDA / REMS)

Version 1 remains compatible: no existing fields were removed or renamed. API and frontend continue to consume `series`, `summary`, `sol_range` and the original scalar names. New metadata must be shown alongside values before making full-sol or EVA claims.

| Added field | Meaning |
|---|---|
| `sampling.{first_sol,last_sol,step}` | Scheduled subset, including missing scheduled rows; last_sol is the schedule ceiling, not necessarily an observed sol. |
| `missing_sols[] = {sol,reason}` | Scheduled sols with no usable air/pressure row, including missing boundary sols. Never interpolated. |
| `statistic_labels.{extrema,mean,relative_humidity_min}` | Observed-sample extrema, equal-weight mean of available per-sol sample means, explicit RH minimum estimator. |
| `field_caveats.{coverage,air_temp_c,relative_humidity_pct,quality,legacy_filter?}` | Field-specific limitations, including legacy filtering and unavailable statistics. |
| `series[].observations.{air,pressure,rh}.{n_samples,ltst_span}` | Retained sample count per field; first/last accepted LTST with sol prefix when available. Null means unavailable, never zero or an inferred full-sol span. |
| `series[].samples_air` (MEDA) | Existing cache count now retained in output; same count as observations.air.n_samples. |
| `series[].air_temp_mean_c` | Sample arithmetic mean when newly reduced; null in old cache, not midpoint of extrema. |
| `series[].relative_humidity_min_pct` | Observed minimum when newly reduced; null in old cache. |
| `series[].partial_coverage` | True when MEDA ATS count <3600; null otherwise (unknown, never a claim of completeness). |
| `series[].quality_note` | Explains the partial-coverage rule or unknown coverage. |

Existing `summary.notes` now says observed samples. Summary air mean uses equal weights over available per-sol air means; legacy caches leave it null. Summary RH min uses observed minima only if all RH-bearing rows retain minima; otherwise it retains the legacy minimum of per-sol means and explicitly labels that estimator. RH max remains maximum observed maximum. Summary RH mean remains equal-weight mean of available per-sol means. These are not time-weighted climatological statistics. In a mixed old/new cache, the RH minimum deliberately uses the conservative legacy estimator rather than silently dropping rows lacking minima.

The count threshold is a conservative warning for MEDA ~1 Hz ATS: fewer than 3600 retained samples cannot establish all-sol extrema. It flags sol 10 (2685 samples; minimum at 14:05:01 LTST). Counts >=3600 do not establish continuous or nighttime coverage. REMS has a different sampling cadence, so this threshold is not applied to REMS. No sol-specific override is used.

## Screening and source evidence

Air samples: 120?320 K (-153.15?46.85 C). Pressure: 100?1500 Pa. RH: 0?100%, inclusive of zero. These deliberately broad Mars surface bounds screen impossible/placeholder values without asserting calibrated accuracy. REMS ground brightness retains its existing 150?330 K screen; only ground maxima are published. All numeric screens reject NaN/infinity and placeholders -999 and +/-999999999. MEDA requires all three ATS channels to pass before averaging; invalid channels cannot enter the average.

The [REMS sol 10 RMD label](https://atmos.nmsu.edu/PDS/data/PDS4/msl_rems_bundle/data_calibrated/SOL_00001_00089/SOL00010/RME_398334213RMD00100000000_______PA.xml) declares -999. The directly checked [MEDA ATS sol 10](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0000_0089/sol_0010/WE__0010___________CAL_ATS_________________P01.xml), [PS sol 46](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0000_0089/sol_0046/WE__0046___________DER_PS__________________P01.xml) and [RHS sol 46](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0000_0089/sol_0046/WE__0046___________DER_RHS_________________P03.xml) labels contain no Special_Constants declarations. The large MEDA placeholder is excluded defensively from the earlier reducer; it is not represented as a verified label constant. The RHS label explains RH before sol 63 was removed as unreliable; this accounts for missing early RH, not whole missing sols.

## Offline verification, 2026-11-14

The shared cache contains reduced per-sol JSON only, not raw sample tables. No shared-cache file was modified and no large product was downloaded. MEDA RH uses the caveat case: "RH = 0 % samples may have been dropped by an earlier filter; RH statistics unverified". REMS already retained zero RH, so that specific caveat does not apply there. Both lack cached RH minima, air means and LTST spans. MEDA pressure/air retain a separate earlier-filter caveat. Newly fetched tables will produce counts/spans, air means and RH minima with the corrected filter.

All numbers below are **before = after**; the fix changes semantics and observability without pretending to reconstruct unavailable samples.

| Site | Retained sols / scheduled | Air min / max / mean C | Pressure min / max / mean Pa | RH legacy min / observed max / mean % |
|---|---|---|---|---|
| Jezero | 49 / 52 | -88.54 / -5.43 / null | 575.48 / 810.93 / 703.93 | 0.28 / 99.98 / 4.43 |
| Gale | 49 / 51 | -86.49 / 5.88 / null | 651.38 / 931.91 / 812.24 | 2.19 / 73.20 / 5.22 |

MEDA: 48 air, 48 pressure, 47 RH rows; retained air samples total 2,329,282 across 48 rows (previously present only in cache, now exposed). Pressure/RH sample counts unavailable. REMS: 49 rows for each field, all sample counts unavailable. All legacy LTST spans remain null. Gale ground maximum min/max/mean stays -13.09 / 16.93 / null C.

Missing Jezero sols: 1126, 1558, 1666. Sol 1558 has a truncated retrieval error in cache; other causes unknown. Missing Gale sols: 202, 874, causes unknown. Partial flag true: Jezero 10 only. All other coverage flags are null.

Validation: `python -m etl.build --all --offline`, `python -m etl.validate` (0 errors), `python -m pytest -q etl/tests` (26 passed). Generated data outputs are intentionally excluded from the commit; teammates must rebuild before deployment. Validation still accepts legacy products without the additive metadata so the restored committed data and existing tests remain compatible. When metadata is present, its scheduled complement must exactly match missing_sols.

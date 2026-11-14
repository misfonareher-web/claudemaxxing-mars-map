"""Observed-sample weather semantics; no full-sol coverage is implied."""
import math
import re

# Broad Mars surface screening bounds, not instrument accuracy guarantees.
RANGES = {'air': (120, 320), 'ground': (150, 330), 'pressure': (100, 1500), 'rh': (0, 100)}
# REMS RMD declares -999; exclude the MEDA legacy placeholder defensively too.
SENTINELS = {-999.0, -999999999.0, 999999999.0}


def valid(value, field):
    lo, hi = RANGES[field]
    return math.isfinite(value) and value not in SENTINELS and lo <= value <= hi


def observations(values, times):
    # Retain sol prefixes so a midnight crossing remains interpretable.
    timed = [t for t in times if re.fullmatch(r'\d+ \d{2}:\d{2}:\d{2}(?:\.\d+)?', t)]
    span = [timed[0], timed[-1]] if len(timed) == len(values) and timed else None
    return dict(n_samples=len(values), ltst_span=span)


def enrich(row, meda=False):
    coverage = row.setdefault('observations', {})
    for field in ('air', 'pressure', 'rh'):
        coverage.setdefault(field, dict(n_samples=row.get('samples_air') if field == 'air' else None, ltst_span=None))
    row.setdefault('air_temp_mean_c', None)
    row.setdefault('relative_humidity_min_pct', None)
    # A sufficient warning for MEDA ~1 Hz ATS, never proof of completeness.
    count = coverage['air']['n_samples']
    partial = True if meda and count is not None and count < 3600 else None
    row['partial_coverage'] = partial
    row['quality_note'] = ('Fewer than 3600 valid ATS samples: insufficient to establish full-sol extrema.'
                           if partial else 'Full-sol coverage unknown; counts or extrema times cannot establish continuous coverage.')
    return row


def statistics(rows, low, high, mean=None):
    def values(key):
        return [r[key] for r in rows if key and r.get(key) is not None]
    lo, hi, mm = values(low), values(high), values(mean)
    return dict(min=min(lo) if lo else None, max=max(hi) if hi else None,
                mean=round(sum(mm) / len(mm), 2) if mm else None)


def metadata(rows, cached, first, last, step, meda=False):
    present = {r['sol'] for r in rows}
    absent = {s['sol']: s for s in cached}
    missing = [dict(sol=s, reason='Source retrieval failed (error recorded in cached summary; cause truncated)' if absent.get(s, {}).get('error') else 'No usable air or pressure in cached summary; archive absence versus retrieval failure unknown')
               for s in range(first, last + 1, step) if s not in present]
    legacy_rh = any(r.get('relative_humidity_mean_pct') is not None and r.get('relative_humidity_min_pct') is None for r in rows)
    caveats = dict(coverage='Counts are retained observations per field. Null counts/spans were not cached; extrema times cannot reconstruct coverage.',
                   air_temp_c='Null air means were not cached; extrema cannot reconstruct a mean.',
                   quality='Instrument confidence flags not applied; no rover-heating correction. Historical sensor-local data, no forecast or safe EVA window. Wind/dust/UV/ionizing radiation unavailable.',
                   relative_humidity_pct='RH is local to sensor temperature. ' + ('Observed RH minimum unavailable in reduced cache; summary min remains the minimum of per-sol means.' if legacy_rh else 'Extrema are over retained samples.'))
    if meda and legacy_rh:
        caveats['relative_humidity_pct'] += ' RH = 0 % samples may have been dropped by an earlier filter; RH statistics unverified.'
    if meda and any('observations' not in s for s in cached if 'air_temp_min_c' in s):
        caveats['legacy_filter'] = 'Cached MEDA air/pressure statistics predate physical screening; sample-level validation is unavailable offline.'
    return dict(sampling=dict(first_sol=first, last_sol=last, step=step), missing_sols=missing,
                statistic_labels=dict(extrema='Observed min/max over n_samples retained observations, not full-sol extrema.',
                                      mean='Equal-weight mean of available per-sol sample means; not time-weighted.',
                                      relative_humidity_min='minimum_of_per_sol_means' if legacy_rh else 'minimum_of_observed_minima'),
                field_caveats=caveats)

"""Mars 2020 MEDA multi-sol daily summaries (Jezero).

Air temperature: calibrated ATS (mean of ATS_LOCAL_TEMP1..3, K -> C).
Pressure: derived PS (PRESSURE, Pa). Humidity: derived RHS (LOCAL_RELATIVE_HUMIDITY, %).
Each sampled sol's COMPLETE CSV is streamed once, reduced to daily statistics, and only
the reduced summary is cached under data/raw/meda/ so offline rebuilds need no CSVs.
"""
import csv
import io
import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT_URL = 'https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/'
SOL_STEP = 36
SOL_FIRST, SOL_LAST = 10, 1850
NODATA = 999999999.0
UA = 'claudemaxxing-etl/0.1'
CURL = 'curl.exe' if os.name == 'nt' else 'curl'

PROVENANCE = dict(
    dataset_id='meda_derived_daily', title='Mars 2020 MEDA daily summaries (sampled sols)', mission='Mars 2020', instrument='MEDA (ATS, PS, RHS)',
    data_type='environment', source_url=ROOT_URL, temporal_coverage=f'Sols {SOL_FIRST}-{SOL_LAST}, every {SOL_STEP}th sol where archived',
    spatial_coverage='Perseverance rover location (moves along its traverse in Jezero crater)', resolution='One row per sampled sol (daily min/max/mean of ~1 Hz samples)',
    units='degC; Pa; percent RH', format='PDS4 CSV (calibrated ATS; derived PS, RHS) reduced to JSON',
    processing='Complete per-sol CSVs streamed; air temperature = mean of ATS_LOCAL_TEMP1-3 per sample (K-273.15); pressure from derived PS; local RH from derived RHS; values <=0 or >=999999999 treated as missing; daily min/max/mean; LTST of min/max air temperature recorded.',
    limitations=['ATS sensors sit about 1 m above ground near the rover; readings can include rover thermal contamination and are not free-stream atmospheric temperature.',
                 'RHS relative humidity is local to the sensor temperature, not near-surface ambient RH.',
                 'Wind (WS) omitted: very large files at the archive download rate and documented sensor damage periods.',
                 'Historical point data at a moving rover; not current conditions and not representative of the whole region.'],
    license='NASA PDS public domain', synthetic=False, used_for=['environment charts'])


def _get(url, timeout=180):
    return subprocess.run([CURL, '--fail', '--location', '--max-time', str(timeout), '--retry', '2', '-sS', '-A', UA, url],
                          check=True, capture_output=True).stdout


def _listing(url):
    return re.findall(r'href="([^"?/][^"?]*)"', _get(url, 60).decode('utf-8', 'replace'))


def _sol_dir(kind, sol, ranges):
    for r in ranges:
        a, b = map(int, re.findall(r'\d+', r))
        if a <= sol <= b:
            return f'{ROOT_URL}{kind}/{r}sol_{sol:04d}/'
    return None


def _reduce(text, columns, combine):
    vals, ltst = [], []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            x = [float(row[c]) for c in columns]
        except (KeyError, ValueError, TypeError):
            continue
        x = [v for v in x if 0 < abs(v) < NODATA]
        if len(x) != len(columns):
            continue
        vals.append(combine(x)); ltst.append(row.get('LTST', ''))
    return vals, ltst


def _summarise_sol(sol, cal_ranges, der_ranges):
    out = dict(sol=sol)
    cal = _sol_dir('data_calibrated_env', sol, cal_ranges)
    der = _sol_dir('data_derived_env', sol, der_ranges)
    files = {}
    for base in (cal, der):
        if base:
            try:
                files.update({f: base + f for f in _listing(base) if f.upper().endswith('.CSV')})
            except subprocess.CalledProcessError:
                pass
    pick = lambda key: next((u for f, u in sorted(files.items()) if key in f), None)
    ats, ps, rhs = pick('CAL_ATS_'), pick('DER_PS_'), pick('DER_RHS_')
    if ats:
        v, t = _reduce(_get(ats, 900).decode('utf-8', 'replace'), ['ATS_LOCAL_TEMP1', 'ATS_LOCAL_TEMP2', 'ATS_LOCAL_TEMP3'], lambda x: sum(x) / len(x) - 273.15)
        if v:
            i, j = v.index(min(v)), v.index(max(v))
            out.update(air_temp_min_c=round(min(v), 2), air_temp_max_c=round(max(v), 2), air_temp_min_ltst=t[i].split(' ')[-1], air_temp_max_ltst=t[j].split(' ')[-1], samples_air=len(v))
    if ps:
        v, _ = _reduce(_get(ps, 600).decode('utf-8', 'replace'), ['PRESSURE'], lambda x: x[0])
        if v:
            out.update(pressure_mean_pa=round(sum(v) / len(v), 2), pressure_min_pa=round(min(v), 2), pressure_max_pa=round(max(v), 2))
    if rhs:
        v, _ = _reduce(_get(rhs, 600).decode('utf-8', 'replace'), ['LOCAL_RELATIVE_HUMIDITY'], lambda x: x[0])
        v = [x for x in v if x <= 100]
        if v:
            out.update(relative_humidity_mean_pct=round(sum(v) / len(v), 2), relative_humidity_max_pct=round(max(v), 2))
    out['sources'] = [u for u in (ats, ps, rhs) if u]
    return out


def fetch(raw_dir, offline=False, force=False):
    cache = Path(raw_dir) / 'meda'
    cache.mkdir(parents=True, exist_ok=True)
    sols = list(range(SOL_FIRST, SOL_LAST + 1, SOL_STEP))
    todo = [s for s in sols if force or not (cache / f'sol_{s:04d}.json').exists()]
    if todo and offline:
        raise FileNotFoundError(f'Offline cache miss for MEDA sols {todo[:5]}...')
    if todo:
        cal_ranges = [r for r in _listing(ROOT_URL + 'data_calibrated_env/') if r.startswith('sol_')]
        der_ranges = [r for r in _listing(ROOT_URL + 'data_derived_env/') if r.startswith('sol_')]

        def work(sol):
            try:
                summary = _summarise_sol(sol, cal_ranges, der_ranges)
            except subprocess.CalledProcessError as exc:
                summary = dict(sol=sol, error=str(exc)[:200])
            (cache / f'sol_{sol:04d}.json').write_text(json.dumps(summary), encoding='utf-8')
            print('MEDA sol', sol, {k: summary.get(k) for k in ('air_temp_min_c', 'air_temp_max_c', 'pressure_mean_pa')}, flush=True)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(work, todo))
    return [cache / f'sol_{s:04d}.json' for s in sols]


def build(preset, files):
    rows = []
    for path in files:
        s = json.loads(Path(path).read_text(encoding='utf-8'))
        if 'air_temp_min_c' not in s and 'pressure_mean_pa' not in s:
            continue
        rows.append({k: v for k, v in s.items() if k not in ('sources', 'error', 'samples_air')})
    if len(rows) < 10:
        raise ValueError(f'Too few MEDA sols with data: {len(rows)}')
    rows.sort(key=lambda r: r['sol'])

    def stat(key_min, key_max=None, key_mean=None):
        lo = [r[key_min] for r in rows if key_min in r]
        hi = [r[key_max or key_min] for r in rows if (key_max or key_min) in r]
        mean = [r[key_mean] for r in rows if key_mean and key_mean in r]
        return dict(min=min(lo) if lo else None, max=max(hi) if hi else None, mean=round(sum(mean) / len(mean), 2) if mean else None)
    return dict(version=1, preset_id=preset['id'], dataset_id='meda_derived_daily',
                station=dict(name='Perseverance / MEDA', lon=preset['base_point']['lon'], lat=preset['base_point']['lat']),
                sol_range=[rows[0]['sol'], rows[-1]['sol']],
                summary=dict(air_temp_c=stat('air_temp_min_c', 'air_temp_max_c'), pressure_pa=stat('pressure_min_pa', 'pressure_max_pa', 'pressure_mean_pa'),
                             relative_humidity_pct=stat('relative_humidity_mean_pct', 'relative_humidity_max_pct', 'relative_humidity_mean_pct'),
                             notes=f'{len(rows)} sampled sols (every {SOL_STEP}th sol {SOL_FIRST}-{SOL_LAST}); complete daily files; ATS mean of sensors 1-3; no rover-heating correction.'),
                series=rows,
                caveat='Point measurements at the rover location during the listed sols; not current conditions and not representative of the whole region. Station coordinates are the landing site; the rover has since traversed several kilometres.',
                synthetic=False)

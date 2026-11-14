"""MSL Curiosity REMS multi-sol daily summaries (Gale) from calibrated MODRDR (RMD) tables.

Fields used: AMBIENT_TEMP (K), BRIGHTNESS_TEMP (ground, K), PRESSURE (Pa), LOCAL_RELATIVE_HUMIDITY (%).
Each sampled sol's COMPLETE table is streamed once and reduced; only the reduced summary is cached
under data/raw/rems/ so offline rebuilds need no tables.
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from etl.sources.weather import valid, observations, enrich, statistics, metadata
import subprocess
from etl.sources.environment import _get, _listing

ROOT_URL = 'https://atmos.nmsu.edu/PDS/data/PDS4/msl_rems_bundle/data_calibrated/'
SOL_STEP = 96
SOL_FIRST, SOL_LAST = 10, 4810
MISSING = -999.0

PROVENANCE = dict(
    dataset_id='rems_derived_daily', title='MSL REMS daily summaries (sampled sols)', mission='Mars Science Laboratory', instrument='REMS (ATS, GTS, PS, HS)',
    data_type='environment', source_url='https://atmos.nmsu.edu/PDS/data/PDS4/msl_rems_bundle/', temporal_coverage=f'Sols {SOL_FIRST}-{SOL_LAST}, every {SOL_STEP}th sol where archived',
    spatial_coverage='Curiosity rover location (traversing from Bradbury Landing up Mount Sharp)', resolution='One row per sampled sol (daily min/max/mean)',
    units='degC; Pa; percent RH', format='PDS4 calibrated MODRDR (RMD) tables reduced to JSON',
    processing='Complete per-sol RMD tables streamed; AMBIENT_TEMP and BRIGHTNESS_TEMP K-273.15; PRESSURE Pa; LOCAL_RELATIVE_HUMIDITY %; -999 treated as missing; finite air 120-320 K, ground 150-330 K, pressure 100-1500 Pa, RH 0-100 percent; legacy cache caveats in environment JSON; daily min/max/mean.',
    limitations=['REMS air temperature is measured on the mast booms about 1.6 m above ground and can include rover thermal effects.',
                 'REMS wind sensor was damaged at landing; wind is omitted.',
                 'Ground temperature is GTS infrared brightness temperature of a small patch beside the rover; only the daily maximum is published because unfiltered nighttime minima reach the sensor floor (about -170 C), which is not physical.',
                 'Historical point data at a moving rover; not current conditions and not representative of the whole region.'],
    license='NASA PDS public domain', synthetic=False, used_for=['environment charts'])


def _columns(label_text):
    names = re.findall(r'<name>([^<]+)</name>', label_text)
    return names[names.index('TIMESTAMP'):] if 'TIMESTAMP' in names else []


def _summarise(sol, ranges):
    out = dict(sol=sol, observations={})
    folder = None
    for r in ranges:
        a, b = map(int, re.findall(r'\d+', r))
        if a <= sol <= b:
            folder = f'{ROOT_URL}{r}SOL{sol:05d}/'
    if not folder:
        return out
    try:
        files = _listing(folder)
    except subprocess.CalledProcessError:
        return out
    label = next((f for f in files if 'RMD' in f and f.endswith('.xml')), None)
    if not label:
        return out
    cols = _columns(_get(folder + label, 120).decode('utf-8', 'replace'))
    idx = {name: cols.index(name) for name in ('LTST', 'AMBIENT_TEMP', 'BRIGHTNESS_TEMP', 'PRESSURE', 'LOCAL_RELATIVE_HUMIDITY') if name in cols}
    table = _get(folder + label[:-4] + '.TAB', 1200).decode('utf-8', 'replace')
    series = {k: [] for k in idx if k != 'LTST'}
    ltst = []
    for line in table.splitlines():
        parts = [p.strip().strip('"') for p in line.split(',')]
        if len(parts) < len(cols):
            continue
        for k in series:
            try:
                v = float(parts[idx[k]])
            except ValueError:
                v = MISSING
            series[k].append(v)
        ltst.append(parts[idx['LTST']] if 'LTST' in idx else '')
    good = lambda k, field: [(v, t) for v, t in zip(series.get(k, []), ltst) if valid(v, field)]
    air = good('AMBIENT_TEMP', 'air')
    if air:
        (vmin, tmin), (vmax, tmax) = min(air), max(air)
        out.update(air_temp_min_c=round(vmin - 273.15, 2), air_temp_max_c=round(vmax - 273.15, 2), air_temp_min_ltst=tmin.split(' ')[-1], air_temp_max_ltst=tmax.split(' ')[-1], air_temp_mean_c=round(sum(v for v, _ in air) / len(air) - 273.15, 2))
        out['observations']['air'] = observations([v for v, _ in air], [t for _, t in air])
    ground = good('BRIGHTNESS_TEMP', 'ground')
    if ground:
        out.update(ground_temp_min_c=round(min(ground)[0] - 273.15, 2), ground_temp_max_c=round(max(ground)[0] - 273.15, 2))
    pres = [v for v, _ in good('PRESSURE', 'pressure')]
    if pres:
        pairs = good('PRESSURE', 'pressure')
        out['observations']['pressure'] = observations(pres, [t for _, t in pairs])
        out.update(pressure_mean_pa=round(sum(pres) / len(pres), 2), pressure_min_pa=round(min(pres), 2), pressure_max_pa=round(max(pres), 2))
    rh = [v for v, _ in good('LOCAL_RELATIVE_HUMIDITY', 'rh')]
    if rh:
        pairs = good('LOCAL_RELATIVE_HUMIDITY', 'rh')
        out['observations']['rh'] = observations(rh, [t for _, t in pairs])
        out.update(relative_humidity_min_pct=round(min(rh), 2), relative_humidity_mean_pct=round(sum(rh) / len(rh), 2), relative_humidity_max_pct=round(max(rh), 2))
    out['source'] = folder + label[:-4] + '.TAB'
    return out


def fetch(raw_dir, offline=False, force=False):
    cache = Path(raw_dir) / 'rems'
    cache.mkdir(parents=True, exist_ok=True)
    sols = list(range(SOL_FIRST, SOL_LAST + 1, SOL_STEP))
    todo = [s for s in sols if force or not (cache / f'sol_{s:05d}.json').exists()]
    if todo and offline:
        raise FileNotFoundError(f'Offline cache miss for REMS sols {todo[:5]}...')
    if todo:
        ranges = [r for r in _listing(ROOT_URL) if r.startswith('SOL_')]

        def work(sol):
            try:
                s = _summarise(sol, ranges)
            except subprocess.CalledProcessError as exc:
                s = dict(sol=sol, error=str(exc)[:200])
            (cache / f'sol_{sol:05d}.json').write_text(json.dumps(s), encoding='utf-8')
            print('REMS sol', sol, {k: s.get(k) for k in ('air_temp_min_c', 'air_temp_max_c', 'pressure_mean_pa')}, flush=True)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(work, todo))
    return [cache / f'sol_{s:05d}.json' for s in sols]


def build(preset, files):
    rows = []
    cached = []
    for path in files:
        s = json.loads(Path(path).read_text(encoding='utf-8'))
        cached.append(s)
        if 'air_temp_min_c' not in s and 'pressure_mean_pa' not in s:
            continue
        rows.append(enrich({k: v for k, v in s.items() if k not in ('source', 'error', 'ground_temp_min_c')}))
    if len(rows) < 10:
        raise ValueError(f'Too few REMS sols with data: {len(rows)}')
    rows.sort(key=lambda r: r['sol'])

    stat = lambda a, b, m=None: statistics(rows, a, b, m)
    meta = metadata(rows, cached, SOL_FIRST, SOL_LAST, SOL_STEP, meda=False)
    rh_min = 'relative_humidity_mean_pct' if meta['statistic_labels']['relative_humidity_min'] == 'minimum_of_per_sol_means' else 'relative_humidity_min_pct'
    return dict(version=1, preset_id=preset['id'], dataset_id='rems_derived_daily',
                station=dict(name='Curiosity / REMS', lon=preset['base_point']['lon'], lat=preset['base_point']['lat']),
                sol_range=[rows[0]['sol'], rows[-1]['sol']],
                summary=dict(air_temp_c=stat('air_temp_min_c', 'air_temp_max_c', 'air_temp_mean_c'), ground_temp_max_c=stat('ground_temp_max_c', 'ground_temp_max_c'),
                             pressure_pa=stat('pressure_min_pa', 'pressure_max_pa', 'pressure_mean_pa'),
                             relative_humidity_pct=stat(rh_min, 'relative_humidity_max_pct', 'relative_humidity_mean_pct'),
                             notes=f'{len(rows)} sampled sols (every {SOL_STEP}th sol {SOL_FIRST}-{SOL_LAST}); observed samples only; no rover-heating correction.'),
                series=rows,
                caveat='Point measurements at the rover location during the listed sols; not current conditions and not representative of the whole region. Station coordinates are Bradbury Landing; the rover has since climbed Mount Sharp.',
                synthetic=False, **meta)

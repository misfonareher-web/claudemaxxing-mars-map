"""Fetch predicted Mars line-of-sight passes and Earth–Mars light time (stdlib only)."""
import argparse
import csv
import datetime as dt
import io
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
START = dt.datetime(2026, 11, 15, tzinfo=dt.timezone.utc)
END = dt.datetime(2026, 11, 23, tzinfo=dt.timezone.utc)
CAVEAT = ('Predicted line-of-sight windows from JPL Horizons orbit ephemerides (elevation >= 10 deg). '
          'Not the operational relay schedule: real sessions are planned by mission teams and depend on DSN and orbiter availability.')
ORBITERS = [
    dict(id='MRO', command='-74', coverage_note='Prediction coverage ends 2026-11-30 12:48 UTC.'),
    dict(id='TGO', command='-143', coverage_note='Long-term prediction coverage to 2039.'),
    dict(id='ODY', command='-53', coverage_note='Prediction coverage to 2027-01-26.'),
]
COMMON = dict(MAKE_EPHEM='YES', EPHEM_TYPE='OBSERVER', CSV_FORMAT='YES', TIME_DIGITS='MINUTES')
PASS_QUERY = dict(COMMON, COMMAND='{orbiter_command}', CENTER='coord@499', COORD_TYPE='GEODETIC',
                  SITE_COORD='{-east_lon},{lat},0', QUANTITIES='4', ANG_FORMAT='DEG',
                  START_TIME='{day} 00:00', STOP_TIME='{next_day} 00:00', STEP_SIZE='1 m')
LIGHT_QUERY = dict(COMMON, COMMAND='499', CENTER='500@399', QUANTITIES='21',
                   START_TIME='2026-11-14 00:00', STOP_TIME='2026-12-31 00:00', STEP_SIZE='1 d')
PROVENANCE = dict(
    dataset_id='jpl_horizons_relay_passes', title='Predicted orbiter visibility and Earth–Mars light time',
    mission='MRO / ESA TGO / Mars Odyssey', instrument='JPL Horizons orbit ephemerides',
    data_type='communications_geometry', source_url=API,
    temporal_coverage='Passes: 2026-11-15 to 2026-11-23 UTC; light time: 2026-11-14 to 2026-12-31 UTC',
    spatial_coverage='Jezero and Gale preset base points; Earth geocenter to Mars center',
    resolution='1 minute pass samples; daily light time', units='UTC, minutes, degrees, km', format='JSON',
    processing='Topocentric elevation >=10 degrees; contiguous samples, no interpolation; distance = light time * c.',
    limitations=[CAVEAT, 'MAVEN excluded: prediction coverage ends March 2026.',
                 'Pass endpoints quantized to one minute; boundary passes may be clipped.'],
    license='JPL Horizons public ephemerides', synthetic=False, used_for=['communications context'])


def utc(value):
    return value.isoformat(timespec='seconds').replace('+00:00', 'Z')


def rows(result, column):
    """Check the named column before interpreting numeric CSV fields."""
    if '$$SOE' not in result or '$$EOE' not in result:
        raise ValueError('Horizons returned no ephemeris: ' + result[-1000:])
    header, body = result.split('$$SOE', 1)
    headings = next((next(csv.reader([line])) for line in reversed(header.splitlines())
                     if 'Date__(UT)__HR:MN' in line), None)
    if headings is None or column not in [h.strip() for h in headings]:
        raise ValueError('Unexpected Horizons columns: ' + str(headings))
    index = [h.strip() for h in headings].index(column)
    parsed = []
    for row in csv.reader(io.StringIO(body.split('$$EOE')[0].strip())):
        stamp = dt.datetime.strptime(row[0].strip(), '%Y-%b-%d %H:%M').replace(tzinfo=dt.timezone.utc)
        value = float(row[index])
        if not math.isfinite(value):
            raise ValueError('Non-finite ephemeris value')
        parsed.append((stamp, value))
    if not parsed:
        raise ValueError('Empty ephemeris')
    return parsed


def detect_passes(samples, orbiter, mask=10, min_duration_min=1):
    """Passes are runs of consecutive 1-minute samples at or above the mask; single-sample grazes (0 min) are dropped."""
    passes = []
    current = []
    def finish():
        if current and (current[-1][0]-current[0][0]).total_seconds()/60 >= min_duration_min:
            peak = max(current, key=lambda row: row[1])
            passes.append(dict(orbiter=orbiter, start=utc(current[0][0]), end=utc(current[-1][0]),
                               duration_min=(current[-1][0]-current[0][0]).total_seconds()/60,
                               max_elevation_deg=peak[1], time_of_max=utc(peak[0])))
        current.clear()
    previous = None
    for stamp, elevation in samples:
        if previous is not None and stamp-previous != dt.timedelta(minutes=1):
            raise ValueError('Pass samples must be consecutive unique minutes')
        if not -90 <= elevation <= 90:
            raise ValueError('Invalid elevation')
        if elevation >= mask:
            current.append((stamp, elevation))
        else:
            finish()
        previous = stamp
    finish()
    return passes


def fetch(query):
    params = dict(format='json', **{key: "'"+value+"'" for key, value in query.items()})
    with urllib.request.urlopen(API+'?'+urllib.parse.urlencode(params), timeout=120) as response:
        payload = json.load(response)
    if payload.get('error'):
        raise ValueError(payload['error'])
    time.sleep(0.25)
    return payload['result']


def self_test():
    fixture = '''Date__(UT)__HR:MN, , , Azi_(a-app), Elev_(a-app),
$$SOE
2026-Nov-17 00:00, , , 0,9,
2026-Nov-17 00:01, , , 0,10,
2026-Nov-17 00:02, , , 0,74,
2026-Nov-17 00:03, , , 0,9,
2026-Nov-17 00:04, , , 0,11,
$$EOE'''
    passes = detect_passes(rows(fixture, 'Elev_(a-app)'), 'ODY')
    assert len(passes) == 1 and passes[0]['duration_min'] == 1
    assert passes[0]['max_elevation_deg'] == 74 and passes[0]['time_of_max'].endswith('00:02:00Z')
    light = 'Date__(UT)__HR:MN, , , 1-way_down_LT,\n$$SOE\n2026-Nov-15 00:00, , ,10.9435,\n$$EOE'
    assert rows(light, '1-way_down_LT')[0][1] == 10.9435


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print('Relay self-test passed')
        return
    sites = {}
    for preset in json.loads((ROOT/'config/mission_presets.json').read_text(encoding='utf-8'))['presets']:
        base = preset['base_point']
        passes = []
        for orbiter in ORBITERS:
            samples = {}
            day = START
            while day < END:
                following = day + dt.timedelta(days=1)
                query = dict(PASS_QUERY, COMMAND=orbiter['command'], SITE_COORD=f"{-base['lon']},{base['lat']},0",
                             START_TIME=day.strftime('%Y-%m-%d 00:00'), STOP_TIME=following.strftime('%Y-%m-%d 00:00'))
                result = rows(fetch(query), 'Elev_(a-app)')
                if len(result) != 1441 or result[0][0] != day or result[-1][0] != following:
                    raise ValueError('Incomplete daily pass ephemeris')
                samples.update(result)
                print(preset['id'], orbiter['id'], day.date(), flush=True)
                day = following
            passes.extend(detect_passes(sorted(samples.items()), orbiter['id']))
        sites[preset['id']] = dict(name='Jezero' if preset['id']=='jezero' else 'Gale',
                                  base_point=base, passes=sorted(passes, key=lambda p: p['start']))
    light = rows(fetch(LIGHT_QUERY), '1-way_down_LT')
    if len(light) != 48 or light[0][0].date().isoformat() != '2026-11-14' or light[-1][0].date().isoformat() != '2026-12-31':
        raise ValueError('Incomplete daily light-time table')
    table = [dict(date=stamp.date().isoformat(), one_way_min=value, distance_km=round(value*60*299792.458)) for stamp,value in light]
    check = next(row for row in table if row['date']=='2026-11-15')
    assert abs(check['one_way_min']-10.94)<0.01 and abs(check['distance_km']-196849012)<1000, check
    product = dict(dataset_id=PROVENANCE['dataset_id'], generated_at_utc=utc(dt.datetime.now(dt.timezone.utc)),
                   source=API, query_templates=dict(orbiter=PASS_QUERY, light_time=LIGHT_QUERY),
                   elevation_mask_deg=10, window=dict(start=utc(START), end=utc(END)), orbiters=ORBITERS,
                   excluded_orbiters=[dict(id='MAVEN', command='-202', note='Prediction coverage ends March 2026; excluded.')],
                   sampling_note='Endpoints are first/last above-mask samples, inclusive; duration is their elapsed time. No interpolation. Window-boundary passes may be clipped.',
                   sites=sites, daily_light_time=table, caveat=CAVEAT)
    (ROOT/'data/relay_passes.json').write_text(json.dumps(product, indent=2, allow_nan=False)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()

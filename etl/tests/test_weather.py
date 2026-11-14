import json
import pytest
from etl.sources import environment, rems
from etl.sources.weather import valid, statistics, enrich, observations
from etl.validate import validate_environment


@pytest.mark.parametrize('field,good,bad', [
    ('rh', [0, 10, 100], [-1, 101]),
    ('air', [120, 220, 320], [-220, 0, 119, 321]),
    ('pressure', [100, 700, 1500], [-700, 0, 99, 1501]),
])
def test_ranges(field, good, bad):
    assert all(valid(v, field) for v in good)
    assert not any(valid(v, field) for v in bad + [-999, -999999999, 999999999, float('nan'), float('inf')])


def test_meda_reducer():
    text = 'LTST,LOCAL_RELATIVE_HUMIDITY\n0010 01:00:00,0\n0010 02:00:00,10\n0010 03:00:00,-1\n0010 04:00:00,-999\n0010 05:00:00,999999999\n'
    v, t = environment._reduce(text, ['LOCAL_RELATIVE_HUMIDITY'], lambda x: x[0])
    assert v == [0, 10]
    assert observations(v, t) == dict(n_samples=2, ltst_span=['0010 01:00:00', '0010 02:00:00'])
    v, _ = environment._reduce('ATS_LOCAL_TEMP1,ATS_LOCAL_TEMP2,ATS_LOCAL_TEMP3\n200,-999,210\n200,210,220', ['ATS_LOCAL_TEMP1', 'ATS_LOCAL_TEMP2', 'ATS_LOCAL_TEMP3'], lambda x: sum(x)/3)
    assert v == [210]


@pytest.mark.parametrize('module', [environment, rems])
@pytest.mark.parametrize('legacy', [True, False])
def test_build_semantics(tmp_path, module, legacy):
    files = []
    for i in range(11):
        row = dict(sol=module.SOL_FIRST+i*module.SOL_STEP)
        if i != 2:
            row.update(air_temp_min_c=-80, air_temp_max_c=-20, samples_air=2685 if i == 0 else 80000,
                       pressure_min_pa=600, pressure_mean_pa=700, pressure_max_pa=800,
                       relative_humidity_mean_pct=10, relative_humidity_max_pct=20)
            if not legacy:
                row.update(relative_humidity_min_pct=0, air_temp_mean_c=-50)
        p = tmp_path / f'{i}.json'; p.write_text(json.dumps(row)); files.append(p)
    env = module.build(dict(id='test', base_point=dict(lon=0, lat=0)), files)
    assert env['summary']['relative_humidity_pct'] == dict(min=10 if legacy else 0, max=20, mean=10)
    assert env['summary']['air_temp_c']['mean'] == (None if legacy else -50)
    assert module.SOL_FIRST+2*module.SOL_STEP in [m['sol'] for m in env['missing_sols']]
    assert env['series'][0]['partial_coverage'] == (True if module is environment else None)
    assert env['series'][1]['partial_coverage'] is None
    assert env['series'][0]['observations']['pressure']['n_samples'] is None
    caveat = env['field_caveats']['relative_humidity_pct']
    assert ('RH statistics unverified' in caveat) == (legacy and module is environment)
    assert validate_environment(env) == []
    env['series'][0]['pressure_mean_pa'] = 900
    assert any('order' in e for e in validate_environment(env))
    env['series'][0]['relative_humidity_mean_pct'] = -1
    assert any('physical' in e for e in validate_environment(env))
    env['missing_sols'] = []
    assert any('missing_sols' in e for e in validate_environment(env))


def test_rems_reduction(monkeypatch):
    cols = ['TIMESTAMP', 'LTST', 'AMBIENT_TEMP', 'BRIGHTNESS_TEMP', 'PRESSURE', 'LOCAL_RELATIVE_HUMIDITY']
    label = ''.join(f'<name>{c}</name>' for c in cols)
    table = '\n'.join(['0,0010 01:00:00,200,220,600,0', '1,0010 02:00:00,220,230,800,10', '2,0010 03:00:00,-999,-999,-999,-999'])
    monkeypatch.setattr(rems, '_listing', lambda _: ['testRMD.xml'])
    monkeypatch.setattr(rems, '_get', lambda url, timeout: (label if url.endswith('.xml') else table).encode())
    row = rems._summarise(10, ['SOL_00001_00089/'])
    assert row['relative_humidity_min_pct'] == 0
    assert row['relative_humidity_mean_pct'] == 5
    assert row['air_temp_mean_c'] == -63.15
    assert row['observations']['rh']['n_samples'] == 2


def test_no_coverage_invented():
    row = enrich(dict(sol=10))
    assert row['observations']['air'] == dict(n_samples=None, ltst_span=None)
    assert row['partial_coverage'] is None
    assert observations([1], ['14:05:01'])['ltst_span'] is None


def test_meda_new_reduction(monkeypatch):
    tables = {
        'CAL_ATS_test.CSV': 'LTST,ATS_LOCAL_TEMP1,ATS_LOCAL_TEMP2,ATS_LOCAL_TEMP3\n0010 01:00:00,200,210,220\n0010 02:00:00,210,220,230\n0010 03:00:00,200,-999,220',
        'DER_PS_test.CSV': 'LTST,PRESSURE\n0010 01:00:00,600\n0010 02:00:00,-999\n0010 03:00:00,800',
        'DER_RHS_test.CSV': 'LTST,LOCAL_RELATIVE_HUMIDITY\n0010 01:00:00,0\n0010 02:00:00,10\n0010 03:00:00,-1',
    }
    monkeypatch.setattr(environment, '_listing', lambda _: list(tables))
    monkeypatch.setattr(environment, '_get', lambda url, timeout: tables[url.rsplit('/', 1)[-1]].encode())
    row = environment._summarise_sol(10, ['sol_0000_0089/'], ['sol_0000_0089/'])
    assert row['relative_humidity_min_pct'] == 0
    assert row['relative_humidity_mean_pct'] == 5
    assert row['air_temp_mean_c'] == -58.15
    assert row['pressure_mean_pa'] == 700
    assert row['observations']['rh']['n_samples'] == 2
    assert row['observations']['air']['ltst_span'] == ['0010 01:00:00', '0010 02:00:00']

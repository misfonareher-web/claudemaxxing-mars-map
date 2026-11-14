import copy
import json
from pathlib import Path

import numpy as np
import pytest

from scoring import cli, config, grid, index, route

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture(params=['jezero', 'gale'])
def mission(request, monkeypatch):
    monkeypatch.setenv('CLAUDEMAXXING_ROOT', str(REPO))
    root, missions, cfg = config.load()
    preset = next(p for p in missions['presets'] if p['id'] == request.param)
    state = index.compute(root, preset, cfg, config.weights(cfg['profiles']['balanced']['weights']))
    base = [preset['base_point']['lon'], preset['base_point']['lat']]
    targets = config.read(root / 'data/science_targets.geojson')['features']
    target = next(f['geometry']['coordinates'] for f in targets
                  if f['properties']['id'] == preset['science_target_ids'][0])
    return state, preset, cfg, base, target


def feature(mission, start=None, end=None, cfg=None):
    state, preset, default_cfg, base, target = mission
    return route.response(state, preset, cfg if cfg is not None else default_cfg,
                          'balanced', start if start is not None else base,
                          end if end is not None else target)['features'][0]


def assert_unreachable(f, reason):
    p = f['properties']
    assert not p['reachable'] and f['geometry'] is None
    assert p['unreachable_reason'] == reason and p['message']
    assert all(p[k] is None for k in ('distance_km', 'elevation_gain_m',
               'elevation_loss_m', 'max_slope_deg', 'mean_score'))
    assert p['steps'] == 0
    assert {'requested', 'snapped', 'snap_km', 'max_snap_km'} <= p.keys()
    json.dumps(f, allow_nan=False)


@pytest.mark.parametrize('endpoint', ['start', 'end'])
def test_southwest_corner_rejected(mission, endpoint):
    _, preset, _, base, _ = mission
    corner = preset['bbox'][:2]
    f = feature(mission, **{endpoint: corner})
    assert_unreachable(f, 'beyond_eva_radius')
    p = f['properties']
    expected = 8.2420450713 if preset['id'] == 'jezero' else 13.3429185526
    assert p['snap_km'][endpoint] == pytest.approx(expected, abs=1e-6)
    assert p['requested'][endpoint] == corner
    assert p['snapped'][endpoint] is not None


def test_demo_routes_unchanged(mission):
    _, preset, _, base, target = mission
    p = feature(mission)['properties']
    expected = ((4.2358642942785565, 145.552734375, 3.963078498840332)
                if preset['id'] == 'jezero' else
                # methodology 0.2.0 (ice/thermal weight 0): Gale path shifts by ~28 m vs 0.1.0 (6.062109 km)
                (6.062136926945228, 68.8505859375, 2.611703872680664))
    assert p['reachable']
    assert (p['distance_km'], p['elevation_gain_m'], p['max_slope_deg']) == pytest.approx(expected)
    assert 0.5 < p['max_snap_km'] < 0.7
    assert all(0 < d < p['max_snap_km'] for d in p['snap_km'].values())
    assert p['requested'] == dict(start=base, end=target)
    assert p['unreachable_reason'] is None and p['message'] is None
    for endpoint in ('start', 'end'):
        assert p['snap_km'][endpoint] == pytest.approx(float(grid.distance(
            *p['requested'][endpoint], *p['snapped'][endpoint])))
    # Coordinate metadata must retain the same precision as the geometry on the wire.
    cleaned = cli.clean(feature(mission))['properties']
    assert cleaned['requested']['start'] == base
    assert cleaned['snapped']['end'] == [round(v, 6) for v in p['snapped']['end']]


def test_cell_center_and_override(mission):
    state, _, cfg, _, _ = mission
    r, c = np.argwhere(~state['excluded'] & np.isfinite(state['score']))[0]
    center = [float(state['x'][r, c]), float(state['y'][r, c])]
    custom = copy.deepcopy(cfg)
    custom['route']['max_snap_km'] = 0
    p = feature(mission, center, center, custom)['properties']
    assert p['reachable'] and p['snap_km'] == dict(start=0.0, end=0.0)
    assert p['max_snap_km'] == 0.0 and type(p['max_snap_km']) is float
    assert p['snapped'] == dict(start=center, end=center)
    custom['route']['max_snap_km'] = None
    assert feature(mission, cfg=custom) == feature(mission)
    custom['route']['max_snap_km'] = 20
    assert feature(mission, end=mission[1]['bbox'][:2], cfg=custom)['properties']['reachable']


def test_no_valid_cells_and_no_path(mission):
    state, _, _, _, _ = mission
    valid = ~state['excluded'] & np.isfinite(state['score'])
    first, last = np.argwhere(valid)[[0, -1]]
    points = [[float(state['x'][r, c]), float(state['y'][r, c])] for r, c in (first, last)]
    state['excluded'] = np.ones_like(state['excluded'])
    f = feature(mission)
    assert_unreachable(f, 'no_valid_cells')
    assert f['properties']['snapped'] == dict(start=None, end=None)
    assert f['properties']['snap_km'] == dict(start=None, end=None)
    for r, c in (first, last):
        state['excluded'][r, c] = False
    assert_unreachable(feature(mission, *points), 'no_path')


@pytest.mark.parametrize('value', [-1, True, '1', float('inf'), float('nan')])
def test_invalid_snap_config(tmp_path, monkeypatch, value):
    directory = tmp_path / 'config'
    directory.mkdir()
    cfg = config.read(REPO / 'config/scoring_weights.json')
    cfg['route']['max_snap_km'] = value
    (directory / 'scoring_weights.json').write_text(json.dumps(cfg))
    (directory / 'mission_presets.json').write_text(
        (REPO / 'config/mission_presets.json').read_text(encoding='utf-8'), encoding='utf-8')
    monkeypatch.setenv('CLAUDEMAXXING_ROOT', str(tmp_path))
    with pytest.raises(config.Error, match='Invalid configuration'):
        config.load()

from pathlib import Path

import numpy as np
import pytest

from scoring import cli, config, grid, index, route


@pytest.fixture(params=['jezero', 'gale'])
def mission(request, monkeypatch):
    monkeypatch.setenv('CLAUDEMAXXING_ROOT', str(Path(__file__).resolve().parents[1]))
    root, missions, cfg = config.load()
    preset = next(p for p in missions['presets'] if p['id'] == request.param)
    state = index.compute(root, preset, cfg, config.weights(cfg['profiles']['balanced']['weights']))
    base = [preset['base_point']['lon'], preset['base_point']['lat']]
    outside = ([base[0] + .215, base[1]] if request.param == 'jezero'
               else [base[0], base[1] - .205])
    cli.point(outside, preset['bbox'])
    return state, preset, cfg, base, outside


@pytest.mark.parametrize('endpoint', ['start', 'end'])
def test_beyond_eva_radius(mission, endpoint):
    state, preset, cfg, base, outside = mission
    points = dict(start=base, end=base)
    points[endpoint] = outside
    result = route.response(state, preset, cfg, 'balanced', **points)
    feature = result['features'][0]
    p = feature['properties']
    expected = float(grid.distance(*outside, *base))
    assert expected == pytest.approx(12.1, abs=.1)
    assert p['unreachable_reason'] == 'beyond_eva_radius'
    assert p['message'] == f'{endpoint.title()} is {expected:.1f} km from base; EVA limit is 10 km.'
    assert p['eva_max_radius_km'] == 10
    assert p['base_distance_km'][endpoint] == pytest.approx(expected)
    assert p['snap_km'][endpoint] > p['max_snap_km']
    assert not p['reachable'] and feature['geometry'] is None
    assert p['steps'] == 0
    assert all(p[k] is None for k in ('distance_km', 'elevation_gain_m',
               'elevation_loss_m', 'max_slope_deg', 'mean_score'))


def test_inside_radius_and_old_snap_failure(mission):
    state, preset, cfg, base, _ = mission
    p = route.response(state, preset, cfg, 'balanced', base, base)['features'][0]['properties']
    assert p['reachable'] and p['unreachable_reason'] is None and p['message'] is None
    assert p['base_distance_km'] == dict(start=0, end=0)
    cfg['route']['max_snap_km'] = 0
    for endpoint in ('start', 'end'):
        r, c = np.argwhere(~state['excluded'] & np.isfinite(state['score']))[0]
        center = [float(state['x'][r, c]), float(state['y'][r, c])]
        points = dict(start=center, end=center)
        points[endpoint] = base
        p = route.response(state, preset, cfg, 'balanced', **points)['features'][0]['properties']
        assert p['unreachable_reason'] == endpoint + '_too_far_from_valid_cell'


def test_reason_precedence(mission):
    state, preset, cfg, base, outside = mission
    p = route.response(state, preset, cfg, 'balanced', outside, outside)['features'][0]['properties']
    assert p['message'].startswith('Start is ')
    cfg['route']['max_snap_km'] = 0
    p = route.response(state, preset, cfg, 'balanced', base, outside)['features'][0]['properties']
    assert p['unreachable_reason'] == 'start_too_far_from_valid_cell'
    state['excluded'][:] = True
    p = route.response(state, preset, cfg, 'balanced', outside, outside)['features'][0]['properties']
    assert p['unreachable_reason'] == 'no_valid_cells'
    assert p['base_distance_km']['start'] > p['eva_max_radius_km']


def test_point_score_already_explains_radius_exclusion(mission):
    _, preset, _, _, outside = mission
    p = cli.execute('point', dict(preset=preset['id'], lon=outside[0], lat=outside[1]))['properties']
    assert p['score'] == 0 and p['excluded']
    assert 'beyond_eva_radius' in p['exclusion_reasons']
    assert p['factors']['base_distance']['value'] > 10

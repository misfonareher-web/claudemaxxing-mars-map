"""Additive score explanations, including native and aggregated semantics."""
from copy import deepcopy
from pathlib import Path
import math

import numpy as np
import pytest
from scoring import cli, config, geo, grid, index

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture
def inputs(monkeypatch):
    monkeypatch.setenv('CLAUDEMAXXING_ROOT', str(REPO))
    return config.load()


def old_score(root, preset, cfg, weights, state):
    """Recompute the previous formula without using the new explanation arrays."""
    denominator = sum(weights[f] * np.isfinite(state['subs'][f]) for f in config.FACTORS)
    score = sum(100 * np.divide(weights[f] * np.isfinite(state['subs'][f]), denominator,
                               out=np.zeros(denominator.shape), where=denominator > 0)
                * np.nan_to_num(state['subs'][f]) for f in config.FACTORS)
    excluded = ((state['values']['slope'] > cfg['factor_params']['slope']['hard_max_deg'])
                | (state['values']['base_distance'] > preset['eva_max_radius_km']))
    for feature in config.read(root / 'data/hazards.geojson')['features']:
        p = feature['properties']
        if p['preset_ids'] and preset['id'] not in p['preset_ids']:
            continue
        mask = geo.contains(state['x'], state['y'], feature['geometry'])
        if p['severity'] >= cfg['hazard_rules']['exclude_severity_at_least']:
            excluded |= mask
        elif p.get('hazard_kind') not in cfg['hazard_rules']['score_exempt_kinds']:
            score *= np.where(mask, max(0, 1 - cfg['hazard_rules']['penalty_per_severity'] * p['severity']), 1)
    nodata = ~np.isfinite(state['arrays']['slope_deg']) | ~np.isfinite(state['arrays']['elevation_m'])
    return np.where(nodata | (denominator == 0), np.nan, np.where(excluded, 0, score))


def test_pahrump_point(inputs):
    p = cli.clean(cli.execute('point', dict(preset='gale', lon=137.3775, lat=-4.6627)))['properties']
    assert p['cell_id'] == 'r21c23'
    assert p['score'] == 61
    assert p['pre_hazard_score'] == pytest.approx(87.35, abs=.06)
    assert p['hazard_multiplier'] == .7
    assert p['hazard_penalties'] == [dict(id='hz-gale-bagnold-dunes', severity=2, factor=.7)]


@pytest.mark.parametrize('preset_id', ['jezero', 'gale'])
def test_all_cells_and_old_formula(inputs, preset_id):
    root, missions, cfg = inputs
    preset = next(p for p in missions['presets'] if p['id'] == preset_id)
    for profile, settings in cfg['profiles'].items():
        weights = config.weights(settings['weights'])
        state = index.compute(root, preset, cfg, weights)
        old = old_score(root, preset, cfg, weights, state)
        np.testing.assert_array_equal(state['score'], old)
        assert grid.factor(state['manifest']['shape'], cfg['score_grid']['max_cells']) == 1
        result = cli.clean(index.response(state, preset, cfg, weights, profile))
        no_hazards = 0
        for feature in result['features']:
            p = feature['properties']
            r, c = p['row'], p['col']
            expected = 0 if p['excluded'] else int(round(old[r,c])) if np.isfinite(old[r,c]) else None
            assert p['score'] == expected
            assert p['hazard_multiplier'] == pytest.approx(math.prod(h['factor'] for h in p['hazard_penalties']), abs=.001)
            if p['score'] is None:
                assert p['pre_hazard_score'] is None
            elif not p['excluded']:
                assert abs(round(p['pre_hazard_score'] * p['hazard_multiplier']) - p['score']) <= 1
            if not p['hazard_ids']:
                no_hazards += 1
                assert p['hazard_multiplier'] == 1.0
                assert p['hazard_penalties'] == []
        assert no_hazards > 0


@pytest.mark.parametrize('preset_id', ['jezero', 'gale'])
def test_aggregated_fields(inputs, preset_id):
    root, missions, cfg = inputs
    preset = next(p for p in missions['presets'] if p['id'] == preset_id)
    cfg = deepcopy(cfg)
    cfg['score_grid']['max_cells'] = 200
    weights = config.weights(cfg['profiles']['balanced']['weights'])
    state = index.compute(root, preset, cfg, weights)
    k = grid.factor(state['manifest']['shape'], cfg['score_grid']['max_cells'])
    assert k > 1
    old = grid.aggregate(old_score(root, preset, cfg, weights, state), k)
    result = index.response(state, preset, cfg, weights, 'balanced')
    for feature in result['features']:
        p = feature['properties']
        r, c = p['row'], p['col']
        sl = np.s_[r*k:(r+1)*k, c*k:(c+1)*k]
        pre = state['pre_hazard_score'][sl]
        expected_pre = round(float(np.nanmean(pre)), 1) if np.isfinite(pre).any() else None
        assert p['pre_hazard_score'] == expected_pre
        assert p['hazard_multiplier'] == pytest.approx(float(np.mean(state['hazard_multiplier'][sl])), abs=.000500001)
        assert p['hazard_penalties'] == [dict(h, factor=round(h['factor'], 3)) for h, mask in state['hazard_penalties'] if mask[sl].any()]
        assert p['score'] == (0 if p['excluded'] else int(round(old[r,c])) if np.isfinite(old[r,c]) else None)


def test_overlap_exclusion_and_nodata(inputs, monkeypatch):
    root, missions, cfg = inputs
    preset = missions['presets'][0]
    manifest, arrays = grid.load(root, preset['id'])
    arrays = {k: v.copy() for k, v in arrays.items()}
    arrays['elevation_m'][0, 0] = np.nan
    monkeypatch.setattr(grid, 'load', lambda *args: (manifest, arrays))
    w, s, e, n = preset['bbox']
    hazards = [dict(geometry=dict(type='Polygon', coordinates=[[[w,s],[e,s],[e,n],[w,n],[w,s]]]),
                    properties=dict(id='test-' + str(severity), severity=severity, preset_ids=[], dataset_id='test'))
               for severity in (1, 2, 3)]
    original_read = index.read
    monkeypatch.setattr(index, 'read', lambda path: dict(features=hazards) if path.name == 'hazards.geojson' else original_read(path))
    weights = config.weights(cfg['profiles']['balanced']['weights'])
    state = index.compute(root, preset, cfg, weights)
    result = cli.clean(index.response(state, preset, cfg, weights, 'balanced'))
    assert result['features'][0]['properties']['pre_hazard_score'] is None
    finite = next(f['properties'] for f in result['features'] if f['properties']['pre_hazard_score'] is not None)
    assert finite['score'] == 0
    assert 'hazard:test-3' in finite['exclusion_reasons']
    assert finite['hazard_multiplier'] == .595
    assert finite['hazard_penalties'] == [dict(id='test-1', severity=1, factor=.85), dict(id='test-2', severity=2, factor=.7)]
    cfg = deepcopy(cfg)
    cfg['hazard_rules']['penalty_per_severity'] = .5
    state = index.compute(root, preset, cfg, weights)
    assert np.all(state['hazard_multiplier'] == 0)

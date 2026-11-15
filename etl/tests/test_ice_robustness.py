import json
import warnings
from pathlib import Path

import numpy as np
import pytest

from etl.sources import features, ice

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def neutron_grid(monkeypatch):
    table = np.zeros((2880, 3))
    table[:, :2] = [180, 80]
    table[:, 2] = 100
    table[:4] = [[0, 0, 0], [1, 0, 25], [2, 0, 50], [3, 0, 100]]
    monkeypatch.setattr(ice.np, 'loadtxt', lambda *a, **kw: table)
    monkeypatch.setattr(ice, 'centers', lambda bbox: (np.arange(4), np.array([0])))
    return ice.build({'bbox': [0, 0, 4, 1]}, ['band1', 'band2'])


def test_zero_neutron_bins_are_missing(neutron_grid):
    assert np.isnan(neutron_grid[0, 0])


def test_neutron_normalization(neutron_grid):
    np.testing.assert_allclose(neutron_grid[0, 1:], [.75, .5, 0])
    assert neutron_grid.dtype == np.float32


def ice_feature_mean(grid):
    preset = json.loads((ROOT / 'config/mission_presets.json').read_text())['presets'][0]
    pid = preset['id']
    output = features.build([preset], {pid: np.zeros_like(grid)},
                            {'ideal_max_deg': 10, 'hard_max_deg': 25}, {pid: grid})
    return output['ice']['features'][0]['properties']['ice_value']


@pytest.mark.parametrize('values, expected', [([np.nan, .2, .4, .6], .4),
                                             ([np.inf, .2, -.0, -np.inf], .1)])
def test_feature_mean_uses_only_finite_values(values, expected):
    assert ice_feature_mean(np.array(values).reshape(2, 2)) == pytest.approx(expected)


def test_all_nan_mean_is_nan_without_warning():
    with warnings.catch_warnings():
        warnings.simplefilter('error', RuntimeWarning)
        assert np.isnan(ice_feature_mean(np.full((2, 2), np.nan)))


def test_committed_ice_values_match_recomputed_means():
    output = json.loads((ROOT / 'data/ice.geojson').read_text())
    for pid in ('jezero', 'gale'):
        grid = np.load(ROOT / 'data/grids' / pid / 'ice_index.npy', allow_pickle=False)
        assert np.isfinite(grid).all()
        value = next(f['properties']['ice_value'] for f in output['features']
                     if f['properties']['id'] == 'ice-' + pid + '-neutrons')
        assert ice_feature_mean(grid) == value == float(np.mean(grid))

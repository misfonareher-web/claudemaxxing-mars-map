"""Independent topology and exact cell coverage checks (Shapely is test-only)."""
import json
from pathlib import Path

import numpy as np
import pytest

shapely = pytest.importorskip('shapely')
from shapely.geometry import shape
from etl.grid import centers
from etl.sources.features import build, slope_polygons

ROOT = Path(__file__).resolve().parents[2]


def check(mask, west=77.2, north=18.7, dx=.02, dy=.03):
    geometry = shape(dict(type='MultiPolygon', coordinates=slope_polygons(mask, west, north, dx, dy)))
    assert geometry.is_valid, shapely.is_valid_reason(geometry)
    assert geometry.area == pytest.approx(int(mask.sum())*dx*dy)
    x, y = np.meshgrid(west+(np.arange(mask.shape[1])+.5)*dx,
                       north-(np.arange(mask.shape[0])+.5)*dy)
    np.testing.assert_array_equal(shapely.contains_xy(geometry,x,y), mask)
    for polygon in geometry.geoms:
        assert polygon.exterior.is_ccw
        for ring in [polygon.exterior, *polygon.interiors]:
            if ring != polygon.exterior:
                assert not ring.is_ccw
            points = list(ring.coords)
            assert points[0] == points[-1]
            for a,b,c in zip(points,points[1:],points[2:]):
                assert a != b
                assert not ((a[0] == b[0] == c[0]) or (a[1] == b[1] == c[1]))
    return geometry


@pytest.mark.parametrize('mask', [
    [[1]], [[1,0],[1,1]], [[1,1,1],[1,0,1],[1,1,1]],
    [[1,0,1],[0,1,0],[1,0,1]], [[1,0,0],[0,0,1]],
    [[1,1,1],[1,1,1]], [[1,1,1],[1,0,1],[0,1,1]], [[0]],
])
def test_synthetic(mask):
    check(np.array(mask, dtype=bool))


def test_all_small_masks_and_seeded_larger_masks():
    for bits in range(512):
        check(np.array([(bits >> i) & 1 for i in range(9)],dtype=bool).reshape(3,3))
    rng = np.random.default_rng(42)
    for _ in range(100):
        check(rng.random((10,10)) < .65)
    nested = np.ones((9,9), dtype=bool)
    nested[1:8,1:8] = False
    nested[3:6,3:6] = True
    nested[4,4] = False
    check(nested)


@pytest.mark.parametrize('ident,expected', [('jezero',637),('gale',1366)])
def test_real_slope_features(ident,expected):
    folder = ROOT/'data/grids'/ident
    if not (folder/'slope_deg.npy').exists():
        pytest.skip('Committed slope grid missing')
    preset = next(p for p in json.loads((ROOT/'config/mission_presets.json').read_text())['presets'] if p['id']==ident)
    thresholds = json.loads((ROOT/'config/scoring_weights.json').read_text())['factor_params']['slope']
    slope = np.load(folder/'slope_deg.npy',allow_pickle=False)
    hazards = build([preset],{ident:slope},thresholds,{ident:np.zeros_like(slope)})['hazards']['features']
    x,y = np.meshgrid(*centers(preset['bbox']))
    steep = [f for f in hazards if f['properties']['hazard_kind']=='steep_slope']
    assert len(steep) == 1
    for feature in hazards:
        assert shape(feature['geometry']).is_valid
    mask = (slope>thresholds['ideal_max_deg']) & (slope<=thresholds['hard_max_deg'])
    assert mask.sum() == expected
    assert not np.any(slope>thresholds['hard_max_deg'])
    np.testing.assert_array_equal(shapely.contains_xy(shape(steep[0]['geometry']),x,y),mask)
    assert steep[0]['properties']['id'] == f'hz-{ident}-slope-2'
    assert steep[0]['properties']['severity'] == 2

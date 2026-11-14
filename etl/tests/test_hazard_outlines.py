"""Regression checks for curated overview outlines; no GIS runtime required."""
import json
from pathlib import Path

import numpy as np
import pytest

from etl.sources.features import build

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])


def on_segment(p, a, b):
    return (cross(a, b, p) == 0 and min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= p[1] <= max(a[1], b[1]))


def covers(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if on_segment(point, a, b):
            return True
        if (a[1] > y) != (b[1] > y):
            if x < a[0] + (y-a[1])*(b[0]-a[0])/(b[1]-a[1]):
                inside = not inside
    return inside


def test_point_in_polygon():
    ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]
    assert covers([1, 1], ring)
    assert covers([0, 1], ring)
    assert not covers([3, 1], ring)


@pytest.mark.parametrize('fid,preset_id,vertex_count', [
    ('hz-jezero-seitah', 'jezero', 33),
    ('hz-gale-bagnold-dunes', 'gale', 52),
])
def test_hazard_outline(fid, preset_id, vertex_count):
    presets = read('config/mission_presets.json')['presets']
    preset = next(p for p in presets if p['id'] == preset_id)
    curated = {f['properties']['id']: f for f in read('etl/sources/hazard_outlines.geojson')['features']}
    generated = read('data/hazards.geojson')
    matches = [f for f in generated['features'] if f['properties']['id'] == fid]
    assert len(matches) == 1
    f = matches[0]
    assert f == curated[fid]
    props = f['properties']
    assert props['kind'] == 'hazard' and props['hazard_kind'] == 'sand_dunes'
    assert props['severity'] == 2 and props['derived'] is True and props['synthetic'] is False
    assert props['preset_ids'] == [preset_id]
    assert props['dataset_id'] in generated['dataset_ids']
    assert 'Absence of a mapped hazard does not mean the terrain is safe.' in props['caveat']
    assert f['geometry']['type'] == 'Polygon'
    assert len(f['geometry']['coordinates']) == 1
    ring = f['geometry']['coordinates'][0]
    assert len(ring) == vertex_count + 1 and ring[0] == ring[-1]
    assert len({tuple(p) for p in ring[:-1]}) == vertex_count
    w, s, e, n = preset['bbox']
    assert all(w <= x <= e and s <= y <= n for x, y in ring)
    assert sum(cross(ring[0], a, b) for a, b in zip(ring, ring[1:])) > 0
    edges = list(zip(ring, ring[1:]))
    for i, (a, b) in enumerate(edges):
        for j in range(i+2, len(edges)):
            if i == 0 and j == len(edges)-1:
                continue
            c, d = edges[j]
            assert not (on_segment(a, c, d) or on_segment(b, c, d)
                        or on_segment(c, a, b) or on_segment(d, a, b))
            assert not (cross(a, b, c)*cross(a, b, d) < 0
                        and cross(c, d, a)*cross(c, d, b) < 0)
    base = preset['base_point']
    assert not covers([base['lon'], base['lat']], ring)
    if preset_id == 'gale':
        target = next(f for f in read('data/science_targets.geojson')['features']
                      if f['properties']['id'] == 'st-gale-pahrump-hills')
        assert target['geometry']['coordinates'] == [137.3775, -4.6627]
        assert target['properties']['confidence'] == 'high'
        assert not covers(target['geometry']['coordinates'], ring)
    # Exercise ETL preset filtering without the download cache or a full rebuild.
    result = build([preset], {preset_id: np.zeros((1, 1))},
                   dict(ideal_max_deg=5, hard_max_deg=25), {preset_id: np.zeros((1, 1))})
    assert result['hazards']['features'] == [curated[fid]]

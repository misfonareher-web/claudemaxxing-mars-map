"""Lock the committed-data counts and examples behind the disclosures."""
import numpy as np
import pytest

from scripts.methodology_numbers import measure, touching_cells


@pytest.fixture(scope='module')
def numbers():
    return measure()


@pytest.mark.parametrize('preset,total,counts,correlation,means,plane', [
    ('jezero', 4118, {'hz-jezero-slope-2': (637, 1029),
                     'hz-jezero-seitah': (18, 42)},
     .992, (23.609, 24.289), 66.211),
    ('gale', 2704, {'hz-gale-slope-2': (1366, 1519),
                   'hz-gale-bagnold-dunes': (271, 359)},
     .993, (24.145, 25.972), 65.645),
])
def test_preset_disclosures(numbers, preset, total, counts, correlation, means, plane):
    actual = numbers['presets'][preset]
    assert actual['total_cells'] == actual['finite_pairs'] == total
    assert actual['hazards'] == {k: dict(centres=c, touching=t) for k, (c, t) in counts.items()}
    assert actual['slope_roughness_pearson'] == pytest.approx(correlation, abs=.0005)
    assert actual['mean_with_slope_outline'] == pytest.approx(means[0], abs=.0005)
    assert actual['mean_without_slope_outline'] == pytest.approx(means[1], abs=.0005)
    assert actual['plane_slope_deg'] == pytest.approx(10)
    assert actual['plane_roughness_m'] == pytest.approx(plane, abs=.0005)
    assert actual['plane_roughness_subscore'] == 0


def test_pahrump_disclosure(numbers):
    point = numbers['pahrump']
    assert point['location'] == [137.3775, -4.6627]
    assert point['cell_id'] == 'r21c23'
    assert not point['point_inside'] and point['centre_inside']
    assert point['point_boundary_distance_km'] == pytest.approx(.185, abs=.0005)
    assert point['centre_boundary_distance_km'] == pytest.approx(.056, abs=.0005)
    assert point['pre_hazard_score'] == 87.3
    assert point['hazard_multiplier'] == .7
    assert point['score'] == round(point['pre_hazard_score'] * point['hazard_multiplier']) == 61


def test_touching_includes_edges_vertices_and_respects_holes():
    manifest = dict(shape=[5, 5], cell_size_deg=[1, 1], bbox=[0, 0, 5, 5])
    polygon = dict(type='Polygon', coordinates=[
        [[1, 1], [4, 1], [4, 4], [1, 4], [1, 1]],
        [[1.5, 1.5], [1.5, 3.5], [3.5, 3.5], [3.5, 1.5], [1.5, 1.5]]])
    # All cells touch the shell, but the central cell lies entirely in the hole.
    assert touching_cells(polygon, manifest) == 24
    polygon['coordinates'] = [polygon['coordinates'][0]]
    assert touching_cells(polygon, manifest) == np.prod(manifest['shape'])

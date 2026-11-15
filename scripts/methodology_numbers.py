"""Reproduce disclosures: python -m scripts.methodology_numbers (NumPy, Shapely).

Read committed inputs directly; never write grids/config or change scoring code.
"""
import json
from pathlib import Path
from unittest.mock import patch

import numpy as np
from shapely import transform
from shapely.geometry import Point, box, shape

from etl.grid import RADIUS_M, terrain
from scoring import config, factors, geo, grid, index
from scoring.cli import execute

ROOT = Path(__file__).resolve().parents[1]


def boundary_distance_km(geometry, lon, lat):
    """Local equirectangular Mars-sphere distance to the envelope boundary."""
    def project(coordinates):
        return np.column_stack((
            grid.RADIUS_KM * np.deg2rad(coordinates[:, 0] - lon) * np.cos(np.deg2rad(lat)),
            grid.RADIUS_KM * np.deg2rad(coordinates[:, 1] - lat)))
    return transform(shape(geometry), project).boundary.distance(Point(0, 0))


def touching_cells(geometry, manifest):
    """Closed rectangle intersection, including shared edges and vertices."""
    dy, dx = manifest['cell_size_deg']
    west, _, _, north = manifest['bbox']

    def lattice(coordinates):
        x = (coordinates[:, 0] - west) / dx
        y = (north - coordinates[:, 1]) / dy
        # Remove roundoff at lattice edges so exact boundary touches count.
        return np.column_stack((np.where(abs(x - np.rint(x)) < 1e-10, np.rint(x), x),
                                np.where(abs(y - np.rint(y)) < 1e-10, np.rint(y), y)))

    polygon = transform(shape(geometry), lattice)
    assert polygon.is_valid, 'Invalid hazard geometry'
    return sum(polygon.intersects(box(c, r, c + 1, r + 1))
               for r in range(manifest['shape'][0])
               for c in range(manifest['shape'][1]))


def measure():
    cfg = config.read(ROOT / 'config/scoring_weights.json')
    missions = config.read(ROOT / 'config/mission_presets.json')
    hazards = config.read(ROOT / 'data/hazards.geojson')
    weights = config.weights(cfg['profiles']['balanced']['weights'])
    result = {'parameters': cfg['factor_params'], 'hazard_rules': cfg['hazard_rules'],
              'presets': {}}
    for preset in missions['presets']:
        ident = preset['id']
        state = index.compute(ROOT, preset, cfg, weights)
        manifest, arrays = state['manifest'], state['arrays']
        slope_id = f'hz-{ident}-slope-2'
        outlines = {}
        for feature in hazards['features']:
            props = feature['properties']
            if props['preset_ids'] and ident not in props['preset_ids']:
                continue
            outlines[props['id']] = {
                'centres': int(geo.contains(state['x'], state['y'], feature['geometry']).sum()),
                'touching': touching_cells(feature['geometry'], manifest)}

        def without_slope(path):
            document = config.read(path)
            if Path(path).name == 'hazards.geojson':
                document['features'] = [f for f in document['features']
                                        if f['properties']['id'] != slope_id]
            return document

        # Re-run the production computation with only this outline removed in memory.
        with patch.object(index, 'read', side_effect=without_slope):
            without = index.compute(ROOT, preset, cfg, weights)
        finite = np.isfinite(arrays['slope_deg']) & np.isfinite(arrays['roughness_m'])
        assert np.array_equal(np.isfinite(state['score']), np.isfinite(without['score']))
        assert np.array_equal(state['excluded'], without['excluded'])
        params = cfg['factor_params']['slope']
        derived = ((arrays['slope_deg'] > params['ideal_max_deg']) &
                   (arrays['slope_deg'] <= params['hard_max_deg']))
        slope_mask = next(mask for name, mask, _ in state['hazards'] if name == slope_id)
        assert np.array_equal(derived, slope_mask)

        # Smooth north-south plane on the preset's native spacing; interior only.
        dy_m = RADIUS_M * np.deg2rad(manifest['cell_size_deg'][0])
        plane = np.broadcast_to(np.arange(manifest['shape'][0])[:, None] *
                                dy_m * np.tan(np.deg2rad(10)), manifest['shape'])
        plane_slope, plane_roughness = terrain(plane, manifest['bbox'])
        assert np.isclose(plane_roughness[1, 1], dy_m * np.tan(np.deg2rad(10)) * np.sqrt(2/3))
        result['presets'][ident] = {
            'total_cells': state['score'].size, 'finite_pairs': int(finite.sum()),
            'slope_roughness_pearson': float(np.corrcoef(arrays['slope_deg'][finite],
                                                       arrays['roughness_m'][finite])[0, 1]),
            'mean_with_slope_outline': float(np.nanmean(state['score'])),
            'mean_without_slope_outline': float(np.nanmean(without['score'])),
            'hazards': outlines,
            'plane_slope_deg': float(plane_slope[1, 1]),
            'plane_roughness_m': float(plane_roughness[1, 1]),
            'plane_roughness_subscore': float(factors.roughness(
                plane_roughness, cfg['factor_params']['roughness'])[1, 1])}

    targets = config.read(ROOT / 'data/science_targets.geojson')['features']
    location = next(f['geometry']['coordinates'] for f in targets
                    if f['properties']['id'] == 'st-gale-pahrump-hills')
    point = execute('point', dict(preset='gale', lon=location[0], lat=location[1]))
    props = point['properties']
    envelope = next(f['geometry'] for f in hazards['features']
                    if f['properties']['id'] == 'hz-gale-bagnold-dunes')
    result['pahrump'] = dict(location=location, cell_id=props['cell_id'],
                             centre=props['center'], score=props['score'],
                             pre_hazard_score=props['pre_hazard_score'],
                             hazard_multiplier=props['hazard_multiplier'],
                             contributions={k: v['contribution'] for k, v in props['factors'].items()})
    for name, (lon, lat) in [('point', location), ('centre', props['center'])]:
        result['pahrump'][name + '_inside'] = bool(geo.contains(lon, lat, envelope))
        result['pahrump'][name + '_boundary_distance_km'] = boundary_distance_km(envelope, lon, lat)
    return result


if __name__ == '__main__':
    print(json.dumps(measure(), indent=2, allow_nan=False))

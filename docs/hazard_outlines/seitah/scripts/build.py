"""Run with python -I scripts/build.py; dependencies live in scripts/vendor."""
from pathlib import Path
import hashlib
import json
import math
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/vendor'))
import shapefile
from shapely import make_valid
from shapely.affinity import affine_transform
from shapely.geometry import Point, Polygon, box, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

RADIUS = 3396190.0
DEG = 180 / (math.pi * RADIUS)
SEED = [77.441, 18.439]  # Selects the mapped dune complex west of the landing site.
LANDING = [77.4508, 18.4447]
TOLERANCE = 150.0  # Native equirectangular map meters; <=150 ground meters here.
SOURCE = 'https://doi.org/10.1007/s11214-020-00739-x'

reader = shapefile.Reader(str(next((ROOT / 'raw/stack_gis').glob('*.shp'))))
records = reader.records()
selected = []
for index, record in enumerate(records):
    if (record['BedrkUName'] == 'Crater floor fractured 1'
            and record['SurfUName'] == 'Aeolian bedforms, large'):
        geom = make_valid(shape(reader.shape(index).__geo_interface__))
        selected.append((index, record.as_dict(), geom))

merged = unary_union([g for _, _, g in selected])
seed = Point(SEED[0] / DEG, SEED[1] / DEG)
parts = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
matches = [g for g in parts if g.covers(seed)]
assert len(matches) == 1, 'Selection must identify exactly one connected mapped complex'
original = matches[0]
exterior = Polygon(original.exterior)  # Regional zone includes intervening bedrock islands.
simplified = exterior.simplify(TOLERANCE, preserve_topology=True)
geographic = affine_transform(simplified, [DEG, 0, 0, DEG, 0, 0])
preset = box(77.2, 18.25, 77.75, 18.7)
clipped = geographic.intersection(preset)
assert clipped.geom_type == 'Polygon'
polygon = orient(clipped, sign=1.0)
landing = Point(*LANDING)
ring = list(polygon.exterior.coords)
assert polygon.is_valid and not polygon.is_empty
assert ring[0] == ring[-1] and polygon.exterior.is_ccw
assert 10 <= len(ring) - 1 <= 40
assert preset.covers(polygon)
assert not polygon.covers(landing), 'Landing must remain outside the hazard zone'
assert all(-180 <= x <= 180 and -90 <= y <= 90 for x, y in ring)

feature = {
    'type': 'Feature',
    'properties': {
        'id': 'hz-jezero-seitah',
        'name': 'Séítah dune complex (approximate)',
        'description': 'Large sand dunes and intervening ridges in the Séítah dune complex can impede rover mobility and create an entrapment hazard.',
        'hazard_kind': 'sand_dunes',
        'severity': 2,
        'confidence': 'medium',
        'source_ref': SOURCE,
        'caveat': 'Absence of a mapped hazard does not mean the terrain is safe. The outline is a simplified exterior of connected published large-aeolian-bedform polygons over Séítah-associated bedrock, including internal bedrock islands and adjoining dune tongues, with estimated overview-scale uncertainty of 250–500 m; it is not for navigation.'
    },
    'geometry': mapping(polygon)
}
(ROOT / 'seitah.geojson').write_text(json.dumps(feature, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
contributors = [{'record_index_zero_based': i, **rec}
                for i, rec, g in selected if g.intersection(original).area > 0.01]
report = {
    'source_archive_sha256': hashlib.sha256((ROOT / 'raw/stack_gis.zip').read_bytes()).hexdigest(),
    'source_record_count': len(records),
    'filter_record_count': len(selected),
    'connected_component_count': len(parts),
    'seed_lon_lat': SEED,
    'contributors': contributors,
    'original_component_bounds_degrees': [v * DEG for v in original.bounds],
    'original_component_area_native_m2': original.area,
    'original_exterior_area_native_m2': exterior.area,
    'filled_hole_count': len(original.interiors),
    'simplification_tolerance_native_m': TOLERANCE,
    'exterior_hausdorff_native_m': exterior.boundary.hausdorff_distance(simplified.boundary),
    'bbox': list(polygon.bounds),
    'distinct_vertices': len(ring) - 1,
    'ring_positions_including_closure': len(ring),
    'clip_changed_geometry': not geographic.equals(clipped),
    'landing_outside': not polygon.covers(landing),
    'landing_distance_native_m': simplified.distance(Point(LANDING[0] / DEG, LANDING[1] / DEG)),
    'valid': polygon.is_valid,
    'counterclockwise': polygon.exterior.is_ccw,
    'area_native_m2': simplified.area,
    'coordinate_conversion': 'lon=x/R*180/pi; lat=y/R*180/pi; R=3396190 m; longitude wrapped to [-180,180] (already in range)'
}
(ROOT / 'raw/validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'contributors'}, indent=2))

import json
from pathlib import Path

from etl.sources import context

ROOT = Path(__file__).resolve().parents[2]


def test_environment_files_carry_current_context():
    for preset in ('jezero', 'gale'):
        env = json.loads((ROOT / 'data/environment' / f'{preset}.json').read_text(encoding='utf-8'))
        assert {k: env[k] for k in context.for_preset(preset)} == context.for_preset(preset)


def test_radiation_card_is_gale_only_context():
    jez, gale = context.radiation_context('jezero'), context.radiation_context('gale')
    assert gale['measured_here'] and not jez['measured_here'] and 'site_note' in jez
    assert gale['value'] == 0.64 and gale['unit'] == 'mSv/day' and gale['in_score'] is False
    assert 'not a safety limit' in gale['caveat']


def test_hazard_coverage_marks_only_two_assessed():
    rows = context.hazard_coverage('gale')['rows']
    assert [r['hazard'] for r in rows if r['status'] == 'assessed'] == ['steep_slope', 'sand_dunes']
    assert {r['hazard'] for r in rows if r['status'] == 'not_assessed'} >= {'crater_rims', 'boulders_rocks', 'scarps_cliffs', 'loose_regolith', 'dust_storms', 'radiation_dose'}


def test_provenance_lists_rad_record():
    ids = [r['dataset_id'] for r in json.loads((ROOT / 'data/provenance.json').read_text(encoding='utf-8'))['datasets']]
    assert ids.count('msl_rad_surface_dose') == 1

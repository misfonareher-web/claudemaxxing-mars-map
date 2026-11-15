import json
from pathlib import Path

from etl.build import write_json
from etl.sources import catalog
from etl.validate import validate

ROOT = Path(__file__).resolve().parents[2]


def test_committed_missions_match_catalog(tmp_path):
    output = tmp_path / 'missions.json'
    write_json(output, dict(version=1, missions=catalog.MISSIONS))
    # Compare text with normalised newlines: write_text emits CRLF on Windows.
    norm = lambda b: b.replace(b'\r\n', b'\n')
    assert norm(output.read_bytes()) == norm((ROOT / 'data/missions.json').read_bytes())
    assert len(catalog.MISSIONS) == 13
    assert len({m['id'] for m in catalog.MISSIONS}) == 13


def test_mro_and_zhurong_records():
    missions = {m['id']: m for m in catalog.MISSIONS}
    mro = missions['mars-reconnaissance-orbiter']
    assert mro['mission_type'] == 'orbiter'
    assert (mro['launch_date'], mro['landing_date']) == ('2005-08-12', '2006-03-10')
    assert {'HiRISE', 'CTX', 'SHARAD'} <= set(mro['instruments'])
    zhurong = missions['tianwen-1-zhurong']
    assert zhurong['status'] == 'status not confirmed'
    assert zhurong['end_date'] is None
    assert zhurong['dataset_id'] == 'cnsa_mission_records'
    sites = json.loads((ROOT / 'data/landing_sites.geojson').read_text(encoding='utf-8'))
    site = next(f for f in sites['features'] if f['properties']['id'] == zhurong['landing_site_id'])
    assert site['properties']['status'] == zhurong['status']
    assert not validate()

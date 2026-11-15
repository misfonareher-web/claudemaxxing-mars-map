import json
import re
from pathlib import Path

import pytest

from etl.sources import context

ROOT = Path(__file__).resolve().parents[2]
KEYS = ('dust_season_context', 'ice_isru_context')


@pytest.mark.parametrize('preset', ['jezero', 'gale'])
def test_environment_has_current_context(preset):
    env = json.loads((ROOT / 'data/environment' / f'{preset}.json').read_text(encoding='utf-8'))
    expected = context.for_preset(preset)
    assert {k: env[k] for k in expected} == expected
    for key in KEYS:
        card = env[key]
        assert card['in_score'] is False
        assert card['title'] and card['summary'] and card['caveat']
        assert all(s['label'] and s['url'].startswith('https://') for s in card['sources'])


def test_dust_is_seasonal_context_without_tau_values():
    card = context.dust_season_context()
    assert card['caveat'] == ('No dust opacity (tau) data are ingested; this is seasonal context only, '
                              'not a forecast and not part of the score.')
    assert 'Ls 180-360' in card['summary'] and 'not every year' in card['summary']
    # Check content separately from source URLs, which can contain numeric identifiers.
    text = ' '.join(card[k] for k in ('title', 'summary', 'caveat'))
    assert not re.search(r'(?:tau|opacity)\s*(?:[=:~]|is|of)?\s*\d', text, re.I)
    assert not any(isinstance(v, (int, float)) and not isinstance(v, bool) for v in card.values())


def test_ice_notes_do_not_imply_local_resources():
    for preset, latitude, separation in [('jezero', '~18 N', '17 degrees'), ('gale', '~5 S', '40 degrees')]:
        card = context.ice_isru_context(preset)
        assert latitude in card['site_note'] and separation in card['site_note']
        assert '~35 N' in card['site_note']
        assert 'not local ice' in card['caveat']
        assert 'Nothing here indicates extractable water at Jezero or Gale' in card['caveat']
    assert 'site_note' not in context.ice_isru_context('unknown')


def test_provenance_records_match_curated_sources():
    records = json.loads((ROOT / 'data/provenance.json').read_text(encoding='utf-8'))['datasets']
    docs = (ROOT / 'docs/DATA_PROVENANCE.md').read_text(encoding='utf-8')
    for expected in (context.PROVENANCE_DUST, context.PROVENANCE_ICE_ISRU):
        matches = [r for r in records if r['dataset_id'] == expected['dataset_id']]
        assert len(matches) == 1
        assert {k: matches[0][k] for k in expected} == expected
        assert expected['title'] in docs and expected['source_url'] in docs

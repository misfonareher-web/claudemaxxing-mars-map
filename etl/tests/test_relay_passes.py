"""Offline fixtures for Horizons CSV parsing and sampled pass boundaries."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('relay_passes', Path(__file__).resolve().parents[1]/'sources/relay_passes.py')
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)


class RelayPassTests(unittest.TestCase):
    def test_inline_fixture(self):
        relay.self_test()

    def test_midnight_and_mask(self):
        start = dt.datetime(2026, 11, 16, 23, 59, tzinfo=dt.timezone.utc)
        passes = relay.detect_passes([(start+dt.timedelta(minutes=i), value)
                                     for i, value in enumerate([10, 20, 10, 9])], 'MRO')
        self.assertEqual(len(passes), 1)
        self.assertEqual(passes[0]['duration_min'], 2)
        self.assertEqual(passes[0]['time_of_max'], '2026-11-17T00:00:00Z')
        self.assertEqual(relay.detect_passes([(start, 9)], 'TGO'), [])

    def test_invalid_response_and_columns(self):
        for value in ('No ephemeris', 'Date__(UT)__HR:MN,wrong,\n$$SOE\n2026-Nov-17 00:00,10,\n$$EOE'):
            with self.assertRaises(ValueError):
                relay.rows(value, 'Elev_(a-app)')

    def test_missing_sample_rejected(self):
        start = relay.START
        with self.assertRaises(ValueError):
            relay.detect_passes([(start, 10), (start+dt.timedelta(minutes=2), 20)], 'MRO')

    def test_committed_regression_and_provenance(self):
        product = json.loads((relay.ROOT/'data/relay_passes.json').read_text(encoding='utf-8'))
        expected = {
            'MRO': [('10:05', '10:09'), ('11:57', '11:59'), ('22:25', '22:30')],
            'TGO': [('09:43', '09:50'), ('11:42', '11:49'), ('22:41', '22:49')],
            'ODY': [('01:43', '01:55'), ('12:50', '12:57'), ('14:47', '14:55')],
        }
        passes = product['sites']['jezero']['passes']
        for orbiter, windows in expected.items():
            actual = [(p['start'][11:16], p['end'][11:16]) for p in passes
                      if p['orbiter'] == orbiter and p['start'].startswith('2026-11-17')]
            self.assertEqual(actual, windows)
        peak = next(p['max_elevation_deg'] for p in passes if p['start'] == '2026-11-17T01:43:00Z')
        self.assertEqual(round(peak), 74)
        self.assertEqual(len(product['daily_light_time']), 48)
        light = next(p for p in product['daily_light_time'] if p['date'] == '2026-11-15')
        self.assertAlmostEqual(light['one_way_min'], 10.94, places=2)
        self.assertLess(abs(light['distance_km'] - 196849012), 1000)
        provenance = json.loads((relay.ROOT/'data/provenance.json').read_text(encoding='utf-8'))
        record = next(r for r in provenance['datasets'] if r['dataset_id'] == product['dataset_id'])
        self.assertEqual({k: v for k, v in record.items() if k != 'access_date'}, relay.PROVENANCE)


if __name__ == '__main__':
    unittest.main()

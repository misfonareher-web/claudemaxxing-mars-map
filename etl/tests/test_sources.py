import unittest
from etl.sources.mola import layout
from etl.sources.features import build
class SourceTests(unittest.TestCase):
 def test_reject_layout(self):
  with self.assertRaises(ValueError):layout('LINES = 1')
 def test_empty_features(self):
  result=build([],{},dict(ideal_max_deg=5,hard_max_deg=25),{})
  self.assertEqual(len(result['landing_sites']['features']),8)
  ids=[f['properties']['id'] for f in result['landing_sites']['features']]
  self.assertEqual(len(ids),len(set(ids)))

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from etl.validate import ROOT, validate
class ValidatorTests(unittest.TestCase):
 def test_committed_products(self):
  self.assertEqual(validate(),[])
 def test_bad_manifest(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   shutil.copytree(ROOT/'config',root/'config')
   shutil.copytree(ROOT/'data',root/'data',ignore=shutil.ignore_patterns('raw'))
   p=root/'data/grids/jezero/manifest.json';m=json.loads(p.read_text());m['shape']=[1,1];p.write_text(json.dumps(m))
   self.assertTrue(any('shape' in e for e in validate(root)))

 def test_bad_texture(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   shutil.copytree(ROOT/'config',root/'config')
   shutil.copytree(ROOT/'data',root/'data',ignore=shutil.ignore_patterns('raw'))
   from PIL import Image
   Image.new('RGB',(8,4)).save(root/'data/textures/mars_global_2k.jpg')
   self.assertIn('Invalid globe texture',validate(root))

 def test_bad_mission(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   shutil.copytree(ROOT/'config',root/'config')
   shutil.copytree(ROOT/'data',root/'data',ignore=shutil.ignore_patterns('raw'))
   p=root/'data/missions.json';m=json.loads(p.read_text(encoding='utf-8'));m['missions'][0]['landing_site_id']='ls-nowhere';m['missions'][1]['key_results'][0]['source_url']='';p.write_text(json.dumps(m),encoding='utf-8')
   errors=validate(root)
   self.assertTrue(any('unknown landing_site_id' in e for e in errors))

 def test_landing_sites_cited(self):
  sites=json.loads((ROOT/'data/landing_sites.geojson').read_text(encoding='utf-8'))['features']
  ids={f['properties']['id'] for f in sites}
  self.assertIn('ls-zhurong',ids)
  for f in sites:
   lon,lat=f['geometry']['coordinates']
   self.assertTrue(-180<=lon<=180 and -90<=lat<=90)
   self.assertTrue(f['properties']['source_ref'].startswith('http'))
  opp=[f for f in sites if f['properties']['id']=='ls-opportunity'][0]['geometry']['coordinates']
  self.assertAlmostEqual(opp[0],-5.5266,places=3)


def test_dataset_joins(tmp_path):
 from etl.validate import dataset_join_errors
 documents = {
  'config/layers.json': {'basemaps': [{'dataset_id': 'missing-basemap'}]},
  'config/mission_presets.json': {'environment_dataset_id': 'missing-preset-env'},
  'data/grids/demo/manifest.json': {'layers': {'slope': {'dataset_id': 'missing-grid'}}},
  'data/hazards.geojson': {'dataset_ids': ['missing-collection'], 'features': [{'properties': {'dataset_id': 'missing-feature'}}]},
  'data/missions.json': {'missions': [{'dataset_id': 'missing-mission'}]},
  'data/environment/demo.json': {'dataset_id': 'missing-env'},
 }
 for filename, value in documents.items():
  path = tmp_path/filename
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(value), encoding='utf-8')
 errors = dataset_join_errors(tmp_path, set())
 assert len(errors) == 7
 for name in ('basemap', 'preset-env', 'grid', 'collection', 'feature', 'mission', 'env'):
  assert any(repr('missing-'+name) in error for error in errors)
 ids = {'missing-'+name for name in ('basemap', 'preset-env', 'grid', 'collection', 'feature', 'mission', 'env')}
 assert dataset_join_errors(tmp_path, ids) == []
 # Raw source metadata is not an ARES dataset-reference contract.
 raw = tmp_path/'data/raw'
 raw.mkdir()
 (raw/'source.json').write_text('{"dataset_id": "external-source"}')
 assert dataset_join_errors(tmp_path, ids) == []
 assert dataset_join_errors(tmp_path, ids - {'missing-basemap'}) == [
  "config/layers.json/basemaps/0/dataset_id: unknown dataset_id 'missing-basemap'"]
 (tmp_path/'config/layers.json').unlink()
 assert dataset_join_errors(tmp_path, ids - {'missing-basemap'}) == []

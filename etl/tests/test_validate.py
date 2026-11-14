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

 def test_polygon_topology(self):
  from unittest.mock import patch
  from etl.validate import load
  cases = [
   ([[[0,0],[1,0],[1,1],[0,1]]], 'Unclosed polygon'),
   ([[[0,0],[1,0],[0,0]]], 'Unclosed polygon'),
   ([[[0,0],[1,0],[1,0],[1,1],[0,1],[0,0]]], 'Repeated consecutive polygon point'),
   ([[[0,0],[0,1],[1,1],[1,0],[0,0]]], 'Incorrect polygon orientation'),
   ([[[0,0],[2,0],[2,2],[0,2],[0,0]], [[.5,.5],[1,.5],[1,1],[.5,1],[.5,.5]]], 'Incorrect polygon orientation'),
  ]
  for rings, message in cases:
   with self.subTest(message=message, rings=rings):
    def altered(path):
     document = load(path)
     if path.name == 'hazards.geojson':
      document['features'][0]['geometry'] = dict(type='Polygon', coordinates=rings)
     return document
    with patch('etl.validate.load', side_effect=altered):
     self.assertIn(message, validate())

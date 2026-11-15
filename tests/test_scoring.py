import ast
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import numpy as np
from scoring import cli, config, factors, grid, geo, index

REPO = Path(__file__).resolve().parents[1]

class ScoringTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(REPO/'config',self.root/'config')
        self.env = patch.dict(os.environ,CLAUDEMAXXING_ROOT=str(self.root))
        self.env.start()
        self.addCleanup(self.env.stop)
        self.fixture(8)

    def fixture(self,n):
        p = self.root/'data/grids/jezero'
        p.mkdir(parents=True,exist_ok=True)
        missions = json.loads((self.root/'config/mission_presets.json').read_text())
        preset = missions['presets'][0]
        lon,lat = preset['base_point']['lon'],preset['base_point']['lat']
        bbox = [lon-.01,lat-.01,lon+.01,lat+.01]
        preset['bbox'],preset['center'] = bbox,[lon,lat]
        (self.root/'config/mission_presets.json').write_text(json.dumps(missions))
        layers = {}
        for name,value in [('elevation_m',0),('slope_deg',3.2),('roughness_m',14),('thermal_index',.55),('ice_index',.1)]:
            np.save(p/(name+'.npy'),np.full((n,n),value,dtype=np.float32))
            layers[name] = dict(file=name+'.npy',dataset_id='fixture',units='test',synthetic=True)
        (p/'manifest.json').write_text(json.dumps(dict(shape=[n,n],bbox=bbox,cell_size_deg=[.02/n,.02/n],origin='north_west',layers=layers)))
        for name in ('hazards','science_targets'):
            features = [] if name=='hazards' else [dict(type='Feature',geometry=dict(type='Point',coordinates=[lon,lat]),properties=dict(id=preset['science_target_ids'][0],preset_ids=['jezero'],dataset_id='fixture',synthetic=True))]
            (self.root/'data'/(name+'.geojson')).write_text(json.dumps(dict(type='FeatureCollection',features=features)))
        self.preset = preset

    def run_cli(self,command,request):
        return subprocess.run([sys.executable,'-m','scoring.cli',command],input=json.dumps(request),capture_output=True,text=True,cwd=REPO)

    def shape(self,actual,example):
        if example is None: return
        if isinstance(example,dict):
            self.assertEqual(set(actual),set(example))
            for k in example: self.shape(actual[k],example[k])
        elif isinstance(example,list):
            self.assertIsInstance(actual,list)
            if example:
                for item in actual: self.shape(item,example[0])
        elif isinstance(example,(float,int)) and not isinstance(example,bool): self.assertIsInstance(actual,(int,float))
        else: self.assertIsInstance(actual,type(example))

    def test_score_contract(self):
        process = self.run_cli('score',dict(preset='jezero'))
        self.assertEqual(process.returncode,0,process.stderr)
        result = json.loads(process.stdout)
        self.shape(result,json.loads((REPO/'contracts/examples/score.example.json').read_text()))
        self.assertTrue(set(index.DISCLAIMERS)<=set(result['meta']['disclaimers']))
        for f in result['features']:
            p = f['properties']
            self.assertIsInstance(p['score'],int)
            self.assertLessEqual(abs(sum(v['contribution'] for v in p['factors'].values())-p['score']),.51)

    def test_route_contract(self):
        b = self.preset['base_point']
        result = self.run_cli('route',dict(preset='jezero',**{'from':[b['lon'],b['lat']],'to':[b['lon']+.009,b['lat']+.009]}))
        self.assertEqual(result.returncode,0,result.stderr)
        self.shape(json.loads(result.stdout),json.loads((REPO/'contracts/examples/route.example.json').read_text()))

    def test_errors(self):
        for request in ({},{'preset':'foo'},{'preset':'jezero','weights':{'foo':1}},{'preset':'jezero','weights':{'slope':-1}},{'preset':'jezero','weights':{'slope':0}}):
            process = self.run_cli('score',request)
            self.assertEqual(process.returncode,2)
            self.assertEqual(process.stdout,'')
            self.shape(json.loads(process.stderr),json.loads((REPO/'contracts/examples/error.example.json').read_text()))

    def test_profile_weights_and_context(self):
        from decimal import Decimal
        _, _, cfg = config.load()
        for profile in cfg['profiles']:
            with self.subTest(profile=profile):
                w = cfg['profiles'][profile]['weights']
                self.assertEqual(sum(Decimal(str(v)) for v in w.values()), Decimal('1'))
                self.assertEqual(w['ice'], 0)
                self.assertEqual(w['thermal'], 0)
                result = cli.execute('score', dict(preset='jezero', profile=profile))
                self.assertEqual(result['meta']['methodology_version'], '0.2.1')
                for feature in result['features']:
                    for name in ('ice', 'thermal'):
                        factor = feature['properties']['factors'][name]
                        self.assertTrue(factor['context_only'])
                        self.assertTrue(factor['note'])
                        self.assertTrue(factor['available'])
                        self.assertEqual(factor['weight'], 0)
                        self.assertEqual(factor['contribution'], 0)

    def test_context_values_do_not_affect_score(self):
        root, _, cfg = config.load()
        for profile, data in cfg['profiles'].items():
            with self.subTest(profile=profile):
                w = config.weights(data['weights'])
                before = index.compute(root, self.preset, cfg, w)
                for value in (0.0, 1.0, np.nan):
                    for name in ('ice_index', 'thermal_index'):
                        np.save(root/'data/grids/jezero'/(name+'.npy'), np.full((8,8), value, dtype=np.float32))
                    after = index.compute(root, self.preset, cfg, w)
                    np.testing.assert_array_equal(before['score'], after['score'])

    def test_resource_alias(self):
        b = self.preset['base_point']
        for command, extra in [('score', {}), ('point', dict(lon=b['lon'], lat=b['lat'])),
                               ('route', {'from':[b['lon'],b['lat']], 'to':[b['lon']+.009,b['lat']+.009]})]:
            alias = cli.execute(command, dict(preset='jezero', profile='resource_first', **extra))
            canonical = cli.execute(command, dict(preset='jezero', profile='terrain_first', **extra))
            self.assertEqual(alias['meta']['profile'], 'terrain_first')
            alias['meta'].pop('generated_at', None)
            canonical['meta'].pop('generated_at', None)
            self.assertEqual(alias, canonical)

    def test_custom_context_weights_rejected(self):
        for name in ('ice', 'thermal'):
            with self.subTest(factor=name), self.assertRaisesRegex(config.Error, 'context-only'):
                config.weights({'slope': 1, name: .1})
        self.assertEqual(config.weights({'slope': 1, 'ice': 0, 'thermal': 0})['slope'], 1)

    def test_factors(self):
        _,_,c = config.load()
        for name,values in [('slope',[5,25,30]),('roughness',[10,60,80])]:
            np.testing.assert_allclose(getattr(factors,name)(np.array(values),c['factor_params'][name]),[1,0,0])
        for name in ('thermal','ice'):
            p = c['factor_params'][name]
            np.testing.assert_allclose(getattr(factors,name)(np.array([p['low'],p['high'],p['high']+1]),p),[0,1,1])
        self.assertEqual(factors.science(0,{'decay_km':3}),1)
        self.assertEqual(factors.base_distance(20,{'eva_max_radius_km':10}),0)

    def test_grid_geometry(self):
        self.assertEqual(grid.factor((5,7),6),3)
        self.assertEqual(grid.aggregate(np.ones((5,7)),3).shape,(2,3))
        self.assertAlmostEqual(float(grid.distance(0,0,90,0)),np.pi*grid.RADIUS_KM/2)
        ring = [[0,0],[4,0],[4,4],[0,4],[0,0]]
        hole = [[1,1],[3,1],[3,3],[1,3],[1,1]]
        np.testing.assert_array_equal(geo.contains(np.array([.5,2,5]),np.array([.5,2,5]),dict(type='Polygon',coordinates=[ring,hole])),[True,False,False])

    def test_missing_and_exclusions(self):
        path = self.root/'data/grids/jezero/manifest.json'
        m = json.loads(path.read_text())
        del m['layers']['thermal_index']
        path.write_text(json.dumps(m))
        result = cli.execute('score',{'preset':'jezero'})
        self.assertIn('missing:thermal_index',result['meta']['data_flags'])
        self.assertEqual(result['meta']['effective_weights']['thermal'],0)
        np.save(path.parent/'slope_deg.npy',np.full((8,8),30,dtype=np.float32))
        result = cli.execute('score',{'preset':'jezero'})
        self.assertTrue(all(f['properties']['score']==0 and 'slope_above_hard_max' in f['properties']['exclusion_reasons'] for f in result['features']))

    def test_config_and_imports(self):
        config.load()
        self.assertAlmostEqual(sum(config.weights({'slope':2,'roughness':1}).values()),1)
        for path in (REPO/'scoring').glob('*.py'):
            for node in ast.walk(ast.parse(path.read_text(encoding='utf-8-sig'))):
                names = [a.name for a in node.names] if isinstance(node,ast.Import) else [node.module] if isinstance(node,ast.ImportFrom) and not node.level else []
                for name in names: self.assertIn(name.split('.')[0],set(sys.stdlib_module_names)|{'numpy'})

    def test_performance(self):
        self.fixture(64)
        start = time.perf_counter()
        cli.execute('score',{'preset':'jezero'})
        elapsed = time.perf_counter()-start
        print('64x64 score seconds:',round(elapsed,4))
        self.assertLess(elapsed,2)
    def test_route_performance(self):
        self.fixture(512)
        b = self.preset['base_point']
        start = time.perf_counter()
        cli.execute('route',{'preset':'jezero','from':[b['lon']-.009,b['lat']-.009],'to':[b['lon']+.009,b['lat']+.009]})
        elapsed = time.perf_counter()-start
        print('512x512 route seconds:',round(elapsed,4))
        self.assertLess(elapsed,3)

    @unittest.skipUnless(os.environ.get('CLAUDEMAXXING_REAL_DATA')=='1','opt-in real data')
    def test_real_data(self):
        with patch.dict(os.environ,CLAUDEMAXXING_ROOT=str(REPO)):
            _,missions,_ = config.load()
            for p in missions['presets']:
                if (REPO/'data/grids'/p['id']/'manifest.json').exists(): cli.execute('score',{'preset':p['id']})
    def test_hazard_penalty(self):
        baseline = cli.execute('score',{'preset':'jezero'})['features'][0]['properties']['score']
        w,s,e,n = self.preset['bbox']
        hazard = dict(type='Feature',geometry=dict(type='Polygon',coordinates=[[[w,s],[e,s],[e,n],[w,n],[w,s]]]),properties=dict(id='hz-test',preset_ids=['jezero'],dataset_id='fixture',severity=2))
        path = self.root/'data/hazards.geojson'
        path.write_text(json.dumps(dict(features=[hazard])))
        result = cli.execute('score',{'preset':'jezero'})
        self.assertLessEqual(abs(result['features'][0]['properties']['score']-baseline*.7),1)
        hazard['properties']['severity'] = 3
        path.write_text(json.dumps(dict(features=[hazard])))
        result = cli.execute('score',{'preset':'jezero'})
        self.assertIn('hazard:hz-test',result['features'][0]['properties']['exclusion_reasons'])

    def test_score_exempt_hazard_kinds(self):
        np.save(self.root/'data/grids/jezero/slope_deg.npy',np.full((8,8),12,dtype=np.float32))
        baseline = cli.execute('score',{'preset':'jezero'})['features'][0]['properties']
        w,s,e,n = self.preset['bbox']
        path = self.root/'data/hazards.geojson'
        for kind,factor in (('steep_slope',1),('sand_dunes',.7)):
            with self.subTest(kind=kind):
                hazard = dict(type='Feature',geometry=dict(type='Polygon',coordinates=[[[w,s],[e,s],[e,n],[w,n],[w,s]]]),properties=dict(id='hz-'+kind,preset_ids=['jezero'],dataset_id='fixture',severity=2,hazard_kind=kind,derived=True))
                path.write_text(json.dumps(dict(features=[hazard])))
                p = cli.clean(cli.execute('score',{'preset':'jezero'}))['features'][0]['properties']
                self.assertEqual(p['hazard_ids'],['hz-'+kind])
                self.assertLessEqual(abs(p['score']-baseline['score']*factor),1)
                self.assertEqual(p['hazard_multiplier'],factor)
                self.assertLessEqual(abs(sum(v['contribution'] for v in p['factors'].values())-p['score']),.51)
                if kind == 'steep_slope':
                    self.assertEqual(p['score'],baseline['score'])
                    self.assertEqual(p['hazard_penalties'],[])

    def test_real_steep_slope_outlines_do_not_change_score(self):
        with patch.dict(os.environ,CLAUDEMAXXING_ROOT=str(REPO)):
            root,missions,cfg = config.load()
            original = index.read
            def without(path):
                document = original(path)
                if Path(path).name == 'hazards.geojson':
                    document['features'] = [f for f in document['features'] if f['properties'].get('hazard_kind') != 'steep_slope']
                return document
            for preset in missions['presets']:
                with self.subTest(preset=preset['id']):
                    w = config.weights(cfg['profiles']['balanced']['weights'])
                    state = index.compute(root,preset,cfg,w)
                    slope_ids = [f['properties']['id'] for f in original(root/'data/hazards.geojson')['features'] if f['properties'].get('hazard_kind') == 'steep_slope' and preset['id'] in f['properties']['preset_ids']]
                    self.assertTrue(slope_ids)
                    self.assertTrue(any(mask.any() for ident,mask,_ in state['hazards'] if ident in slope_ids))
                    with patch.object(index,'read',side_effect=without):
                        removed = index.compute(root,preset,cfg,w)
                    np.testing.assert_array_equal(state['score'],removed['score'])
                    np.testing.assert_array_equal(state['hazard_multiplier'],removed['hazard_multiplier'])

    def test_point_and_missing_data(self):
        b = self.preset['base_point']
        f = cli.execute('point',dict(preset='jezero',lon=b['lon'],lat=b['lat']))
        self.assertEqual(f['type'],'Feature')
        self.assertIn('meta',f)
        (self.root/'data/grids/jezero/manifest.json').unlink()
        with self.assertRaises(config.Error) as caught:
            cli.execute('score',{'preset':'jezero'})
        self.assertEqual(caught.exception.status,3)
    def test_unreachable_and_nodata(self):
        p = self.root/'data/grids/jezero'
        a = np.full((8,8),30,dtype=np.float32)
        np.save(p/'slope_deg.npy',a)
        b = self.preset['base_point']
        result = cli.execute('route',{'preset':'jezero','from':[b['lon'],b['lat']],'to':[b['lon'],b['lat']]})
        self.assertFalse(result['features'][0]['properties']['reachable'])
        self.assertIsNone(result['features'][0]['geometry'])
        np.save(p/'slope_deg.npy',np.full((8,8),np.nan,dtype=np.float32))
        result = cli.clean(cli.execute('score',{'preset':'jezero'}))
        self.assertTrue(all(f['properties']['score'] is None for f in result['features']))
        json.dumps(result,allow_nan=False)

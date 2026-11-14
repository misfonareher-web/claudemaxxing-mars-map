"""Fail closed when committed data do not meet the DATA contract."""
import json
import os
from pathlib import Path
import numpy as np
from etl.grid import definition, CRS_NOTE

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    def reject(value):
        raise ValueError('Non-finite JSON: '+value)
    return json.loads(path.read_text(encoding='utf-8'), parse_constant=reject)


def dataset_join_errors(root, ids):
    """Check all product/config references, including optional backend layers."""
    errors = []

    def check(value, location):
        if isinstance(value, dict):
            for key, item in value.items():
                path = location + '/' + key
                if key == 'dataset_id' or key.endswith('_dataset_id'):
                    if not isinstance(item, str) or item not in ids:
                        errors.append(f'{path}: unknown dataset_id {item!r}')
                elif key == 'dataset_ids':
                    if not isinstance(item, list):
                        errors.append(f'{path}: dataset_ids must be a list')
                    else:
                        for index, dataset_id in enumerate(item):
                            if not isinstance(dataset_id, str) or dataset_id not in ids:
                                errors.append(f'{path}/{index}: unknown dataset_id {dataset_id!r}')
                else:
                    check(item, path)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                check(item, location + '/' + str(index))

    for folder in ('data', 'config'):
        for directory, subdirs, files in os.walk(root/folder):
            subdirs[:] = [name for name in subdirs if name != 'raw']
            for name in sorted(files):
                path = Path(directory)/name
                if path == root/'data/provenance.json' or path.suffix not in ('.json', '.geojson'):
                    continue
                try:
                    check(load(path), path.relative_to(root).as_posix())
                except (OSError, ValueError) as exc:
                    errors.append(f'{path.relative_to(root)}: {exc}')
    return errors


def validate(root=ROOT):
    errors = []
    def require(condition, message):
        if not condition:
            errors.append(message)
    presets = load(root/'config/mission_presets.json')['presets']
    try:
        records = load(root/'data/provenance.json')['datasets']
        ids = {record['dataset_id'] for record in records}
        provenance = {r['dataset_id']:r for r in records}
        require(len(ids)==len(records),'Duplicate dataset IDs')
        require(len({r['mission'] for r in records if r['synthetic'] is False}) >= 3, 'Need real data from at least three missions')
        for record in records:
            for key in ['dataset_id','title','mission','instrument','data_type','source_url','access_date','temporal_coverage','spatial_coverage','resolution','units','format','processing','limitations','license','synthetic','used_for']:
                require(key in record, 'Provenance missing '+key)
    except (OSError, ValueError, KeyError) as exc:
        errors.append('Provenance: '+str(exc))
        ids = set()
    errors.extend(dataset_join_errors(root, ids))
    for preset in presets:
        try:
            folder = root/'data/grids'/preset['id']
            manifest = load(folder/'manifest.json')
            shape, size = definition(preset['bbox'])
            require(manifest['bbox'] == preset['bbox'], 'Bbox differs from config')
            require(manifest['shape'] == list(shape), 'Incorrect grid shape')
            require(manifest['cell_size_deg'] == list(size), 'Incorrect cell sizes')
            require(manifest['origin'] == 'north_west' and manifest['crs_note'] == CRS_NOTE, 'Incorrect coordinate convention')
            for name in ['elevation_m','slope_deg','roughness_m','thermal_index','ice_index']:
                require(name in manifest['layers'], preset['id']+': missing '+name)
            for name, layer in manifest['layers'].items():
                require(layer['dataset_id'] in ids, 'Unknown dataset '+layer['dataset_id'])
                require(layer['synthetic'] == provenance.get(layer['dataset_id'],{}).get('synthetic'), 'Layer provenance synthetic mismatch')
                require(type(layer['synthetic']) is bool, 'synthetic must be boolean')
                require(Path(layer['file']).name == layer['file'], 'Unsafe array path')
                array = np.load(folder/layer['file'],allow_pickle=False)
                require(array.shape == shape and array.dtype == np.float32, 'Invalid array '+name)
                require(np.any(np.isfinite(array)), 'Empty grid '+name)
                require(not np.any(np.isinf(array)), 'Infinite grid values')
                if name.endswith('_index'):
                    require(np.all((array[np.isfinite(array)] >= 0) & (array[np.isfinite(array)] <= 1)), 'Index outside 0-1')
        except (OSError, ValueError, KeyError) as exc:
            errors.append(preset['id']+': '+str(exc))
    all_features = {}
    for filename in ['landing_sites','science_targets','ice','hazards']:
        try:
            collection = load(root/'data'/ (filename+'.geojson'))
            require(collection['type'] == 'FeatureCollection' and collection['crs_note'] == CRS_NOTE, 'Invalid collection '+filename)
            for feature in collection['features']:
                properties = feature['properties']
                require(properties['id'] not in all_features, 'Duplicate feature ID')
                all_features[properties['id']] = feature
                require(properties['confidence'] in ['high','medium','low'], 'Invalid confidence')
                require(type(properties.get('synthetic',False)) is bool, 'Invalid synthetic flag')
                require(set(properties['preset_ids']) <= {p['id'] for p in presets}, 'Unknown feature preset')
                geometry = feature['geometry']
                require(geometry['type'] in ['Point','Polygon','MultiPolygon'], 'Invalid geometry type')
                def coordinates(value):
                    if len(value)==2 and all(isinstance(v,(float,int)) for v in value):
                        require(-180 <= value[0] <= 180 and -90 <= value[1] <= 90, 'Invalid coordinates')
                    else:
                        for part in value: coordinates(part)
                coordinates(geometry['coordinates'])
                kind=properties['kind']
                require(kind=={'landing_sites':'landing_site','science_targets':'science_target','ice':'ice','hazards':'hazard'}[filename], 'Wrong feature kind')
                extra={'landing_site':['mission','agency','landing_date','status'],'science_target':['priority','science_goal'],'ice':['ice_metric','ice_value','depth_estimate_m'],'hazard':['hazard_kind','severity','derived']}
                for key in extra[kind]: require(key in properties,'Missing kind property '+key)
                if kind=='science_target': require(properties['priority'] in [1,2,3], 'Invalid priority')
                if geometry['type'] in ['Polygon','MultiPolygon']:
                    polygons=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
                    for polygon in polygons:
                        for ring in polygon:
                            require(len(ring)>=4 and ring[0]==ring[-1], 'Unclosed polygon')
                if properties['kind']=='ice':
                    require('Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.' in properties['caveat'], 'Missing ice caveat')
                if properties['kind']=='hazard':
                    require('Absence of a mapped hazard does not mean the terrain is safe.' in properties['caveat'], 'Missing hazard caveat')
                    require(properties['severity'] in [1,2,3] and type(properties['derived']) is bool, 'Invalid hazard')
                for key in ['id','kind','name','description','dataset_id','preset_ids','confidence','caveat','source_ref']:
                    require(key in properties, 'Missing feature property '+key)
                require(properties['dataset_id'] in ids, 'Unknown feature dataset')
        except (OSError, ValueError, KeyError) as exc:
            errors.append(filename+': '+str(exc))
    for preset in presets:
        for fid in [preset['base_point']['id']]+preset['science_target_ids']:
            require(fid in all_features, 'Missing configured feature '+fid)
            if fid in all_features:
                lon,lat=all_features[fid]['geometry']['coordinates']
                w,s,e,n=preset['bbox']
                require(w<=lon<=e and s<=lat<=n, 'Configured feature outside bbox')
    for preset in presets:
      if not preset.get('environment_dataset_id'):
        continue
      try:
        env=load(root/'data/environment'/(preset['id']+'.json'))
        require(env['dataset_id']==preset['environment_dataset_id'] and env['dataset_id'] in ids and env['synthetic'] is False,'Invalid environment provenance '+preset['id'])
        require(10<=len(env['series'])<=1000,'Invalid environment series length '+preset['id'])
        sols=[row['sol'] for row in env['series']]
        require(all(a<b for a,b in zip(sols,sols[1:])),'Environment sols not strictly increasing')
        for row in env['series']:
            for key,lo,hi in [('air_temp_min_c',-140,40),('air_temp_max_c',-140,40),('ground_temp_min_c',-150,50),('ground_temp_max_c',-150,50),('pressure_mean_pa',400,1300),('relative_humidity_mean_pct',0,100),('relative_humidity_max_pct',0,100)]:
                if key in row:
                    require(isinstance(row[key],(int,float)) and lo<=row[key]<=hi, f"{preset['id']} sol {row['sol']}: {key} out of range")
            if 'air_temp_min_c' in row and 'air_temp_max_c' in row:
                require(row['air_temp_min_c']<=row['air_temp_max_c'],'Invalid environment values')
      except (OSError,ValueError,KeyError) as exc:
        errors.append('Environment: '+str(exc))
    try:
        from PIL import Image
        texture = root/'data/textures/mars_global_2k.jpg'
        require(texture.stat().st_size <= 1500000, 'Texture exceeds 1.5 MB')
        with Image.open(texture) as image:
            require(image.size == (2048, 1024) and image.format == 'JPEG', 'Invalid globe texture')
            image.verify()
        require('trek_mola_globe' in ids, 'Missing texture provenance')
    except (OSError, ValueError) as exc:
        errors.append('Texture: '+str(exc))
    try:
        import datetime
        missions = load(root/'data/missions.json')
        require(missions.get('version') == 1 and missions.get('missions'), 'missions.json empty or wrong version')
        site_ids = {f['properties']['id'] for f in load(root/'data/landing_sites.geojson')['features']}
        seen = set()
        for m in missions['missions']:
            for key in ('id', 'name', 'agency', 'mission_type', 'launch_date', 'landing_date', 'end_date', 'status', 'landing_site_id', 'instruments', 'key_results', 'source_url', 'dataset_id'):
                require(key in m, f"mission {m.get('id')}: missing {key}")
            require(m['id'] not in seen, 'duplicate mission '+m['id']); seen.add(m['id'])
            require(m['mission_type'] in ('lander', 'rover', 'helicopter', 'orbiter'), m['id']+': bad mission_type')
            require(m['status'] in ('active', 'ended', 'failed'), m['id']+': bad status')
            for key in ('launch_date', 'landing_date', 'end_date'):
                if m[key] is not None:
                    datetime.date.fromisoformat(m[key])
            require(m['landing_site_id'] is None or m['landing_site_id'] in site_ids, m['id']+': unknown landing_site_id')
            require(m['dataset_id'] in ids, m['id']+': dataset_id not in provenance')
            require(m['key_results'] and all(r.get('text') and str(r.get('source_url', '')).startswith('http') for r in m['key_results']), m['id']+': key_results need text and source_url')
            require(str(m['source_url']).startswith('http'), m['id']+': bad source_url')
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append('Missions: '+str(exc))
    return errors


def main():
    errors = validate()
    for error in errors:
        print(error)
    print(f'Validation: {len(errors)} error(s)')
    raise SystemExit(bool(errors))


if __name__ == '__main__':
    main()

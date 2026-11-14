import json
import math
import sys
import numpy as np
from . import config, index, route
from .config import Error

def point(value, bbox):
    if not isinstance(value,(list,tuple)) or len(value)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in value): raise Error('Expected finite lon/lat pair')
    w,s,e,n = bbox
    if not (w <= value[0] <= e and s <= value[1] <= n): raise Error('Point outside preset bbox')
    return value

def execute(command, request):
    if not isinstance(request,dict): raise Error('Request must be an object')
    if command not in ('score','point','route','presets'): raise Error('Unknown command')
    root, missions, cfg = config.load()
    if command == 'presets': return {k:missions[k] for k in ('presets','default_preset')}
    preset = next((p for p in missions['presets'] if p['id']==request.get('preset')),None)
    if preset is None: raise Error('Unknown preset','not_found')
    profile = request.get('profile',cfg['active_profile'])
    if not isinstance(profile,str) or profile not in cfg['profiles']: raise Error('Unknown profile')
    weights = config.weights(request.get('weights',cfg['profiles'][profile]['weights']))
    if command == 'point': location = point([request.get('lon'),request.get('lat')],preset['bbox'])
    if command == 'route':
        start,end = point(request.get('from'),preset['bbox']),point(request.get('to'),preset['bbox'])
    state = index.compute(root,preset,cfg,weights)
    if command == 'route': return route.response(state,preset,cfg,profile,start,end)
    result = index.response(state,preset,cfg,weights,profile)
    if command == 'point':
        g = result['meta']['grid']
        dy,dx = g['cell_size_deg']
        row = min(g['rows']-1,max(0,int((g['bbox'][3]-location[1])/dy)))
        col = min(g['cols']-1,max(0,int((location[0]-g['bbox'][0])/dx)))
        feature = result['features'][row*g['cols']+col]
        feature['meta'] = result['meta']
        return feature
    return result

def clean(value, coordinate=False):
    if isinstance(value,dict): return {k:clean(v,k in ('coordinates','center','bbox','cell_size_deg')) for k,v in value.items()}
    if isinstance(value,(list,tuple)): return [clean(v,coordinate) for v in value]
    if isinstance(value,(float,np.floating)): return round(float(value),6 if coordinate else 3) if math.isfinite(value) else None
    if isinstance(value,np.integer): return int(value)
    return value

def main():
    try:
        if len(sys.argv)!=2: raise Error('Expected one command')
        try: request = json.load(sys.stdin)
        except ValueError as exc: raise Error('Invalid JSON: '+str(exc))
        result = clean(execute(sys.argv[1],request))
        print(json.dumps(result,ensure_ascii=False,allow_nan=False))
        return 0
    except Error as exc:
        error,status = dict(code=exc.code,message=str(exc)),exc.status
    except Exception as exc:
        error,status = dict(code='internal',message=str(exc)),1
    print(json.dumps(dict(error=error),ensure_ascii=False,allow_nan=False),file=sys.stderr)
    return status

if __name__ == '__main__':
    sys.exit(main())

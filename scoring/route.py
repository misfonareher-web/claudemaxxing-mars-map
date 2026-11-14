import heapq
import math
import numpy as np
from .grid import RADIUS_KM, distance
from .index import CRS, DISCLAIMERS

def response(state, preset, config, profile, start, end):
    scores = state['score']
    valid = ~state['excluded'] & np.isfinite(scores)
    rows, cols = scores.shape
    dy, dx = state['manifest']['cell_size_deg']
    w, s, e, n = state['manifest']['bbox']
    lon, lat = (w+e)/2, (s+n)/2
    max_snap = config.get('route', {}).get('max_snap_km')
    if max_snap is None:
        max_snap = distance(lon-dx/2, lat-dy/2, lon+dx/2, lat+dy/2)
    max_snap = float(max_snap)
    def snap(point):
        if not np.any(valid):
            return None, None, None
        d = np.where(valid, distance(state['x'],state['y'],*point), np.inf)
        cell = np.unravel_index(np.argmin(d), d.shape)
        return cell, [float(state['x'][cell]), float(state['y'][cell])], float(d[cell])
    source, start_xy, start_km = snap(start)
    target, end_xy, end_km = snap(end)
    reason, message = None, None
    if source is None:
        reason, message = 'no_valid_cells', 'No finite, nonexcluded route cells are available.'
    elif start_km > max_snap:
        reason, message = 'start_too_far_from_valid_cell', 'Start is farther than the snap limit from the nearest valid cell.'
    elif end_km > max_snap:
        reason, message = 'end_too_far_from_valid_cell', 'End is farther than the snap limit from the nearest valid cell.'
    path = []
    if reason is None:
        k = config.get('route',{}).get('score_cost_factor',2.0)
        path = _search(valid, scores, state['y'][:,0], abs(float(state['x'][0,1]-state['x'][0,0])) if cols > 1 else 0.0,
                       abs(float(state['y'][0,0]-state['y'][1,0])) if rows > 1 else 0.0, source, target, k)
        if not path:
            reason, message = 'no_path', 'No traversable path connects the snapped endpoints.'
    properties = dict(distance_km=None,elevation_gain_m=None,elevation_loss_m=None,max_slope_deg=None,mean_score=None,steps=0,reachable=bool(path))
    properties.update(requested=dict(start=[float(v) for v in start], end=[float(v) for v in end]),
                      snapped=dict(start=start_xy, end=end_xy), snap_km=dict(start=start_km, end=end_km),
                      max_snap_km=max_snap, unreachable_reason=reason, message=message)
    geometry = None
    if path:
        rr,cc = np.array(path).T
        x,y = state['x'][rr,cc],state['y'][rr,cc]
        changes = np.diff(state['arrays']['elevation_m'][rr,cc])
        properties.update(distance_km=float(np.sum(distance(x[:-1],y[:-1],x[1:],y[1:]))),elevation_gain_m=float(changes[changes>0].sum()),elevation_loss_m=float(abs(changes[changes<0].sum())),max_slope_deg=float(np.max(state['arrays']['slope_deg'][rr,cc])),mean_score=float(np.mean(scores[rr,cc])),steps=len(path)-1)
        keep = [0]+[i for i in range(1,len(path)-1) if (path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]) != (path[i+1][0]-path[i][0],path[i+1][1]-path[i][1])]+[len(path)-1]
        geometry = dict(type='LineString',coordinates=[[float(x[i]),float(y[i])] for i in keep])
    return dict(type='FeatureCollection',crs_note=CRS,meta=dict(preset_id=preset['id'],profile=profile,label='Heuristic least-cost EVA route',disclaimers=['The route is a heuristic least-cost path on a coarse grid, not a validated traverse plan.']+DISCLAIMERS,data_flags=state['flags']),features=[dict(type='Feature',geometry=geometry,properties=properties)])



def _gc(lat1, lat2, dlon):
    """Great-circle distance (km) between two points dlon degrees apart in longitude."""
    a, b, d = math.radians(lat1), math.radians(lat2), math.radians(dlon)
    h = math.sin((b-a)/2)**2 + math.cos(a)*math.cos(b)*math.sin(d/2)**2
    return 2 * RADIUS_KM * math.asin(math.sqrt(min(1.0, max(0.0, h))))

def _search(valid, scores, lats, dlon, dlat, source, target, k):
    """8-connected A* on a regular lon/lat grid; edge lengths depend only on the row latitude."""
    rows, cols = valid.shape
    ok = valid.ravel().tolist()
    mult = np.where(valid, 1 + k*(1 - np.nan_to_num(scores)/100), np.inf).ravel().tolist()
    lats = [float(v) for v in lats]
    ns = _gc(lats[0], lats[0]+dlat, 0.0)
    ew = [_gc(la, la, dlon) for la in lats]
    diag = {-1: [_gc(la, la+dlat, dlon) for la in lats], 1: [_gc(la, la-dlat, dlon) for la in lats]}
    min_mult = min(m for m, v in zip(mult, ok) if v)
    min_ew = min(ew); min_diag = min(min(diag[-1]), min(diag[1]))
    tr, tc = int(target[0]), int(target[1])
    def h(r, c):
        drs, dcs = abs(r-tr), abs(c-tc)
        dg = min(drs, dcs)
        return (dg*min_diag + (drs-dg)*ns + (dcs-dg)*min_ew) * min_mult
    src = int(source[0])*cols + int(source[1]); tgt = tr*cols + tc
    best = {src: 0.0}; parents = {}
    queue = [(h(int(source[0]), int(source[1])), 0.0, src)]
    steps = ((-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1))
    while queue:
        _, cost, cur = heapq.heappop(queue)
        if cost > best.get(cur, math.inf): continue
        if cur == tgt:
            out = [cur]
            while out[-1] != src: out.append(parents[out[-1]])
            return [divmod(i, cols) for i in reversed(out)]
        r, c = divmod(cur, cols)
        for dr, dc in steps:
            nr, nc = r+dr, c+dc
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols: continue
            ni = nr*cols + nc
            if not ok[ni]: continue
            if dr and dc:
                if not ok[r*cols+nc] or not ok[nr*cols+c]: continue
                length = diag[dr][r]
            else:
                length = ew[r] if dr == 0 else ns
            cand = cost + length*mult[ni]
            if cand < best.get(ni, math.inf):
                best[ni] = cand; parents[ni] = cur
                heapq.heappush(queue, (cand + h(nr, nc), cand, ni))
    return []

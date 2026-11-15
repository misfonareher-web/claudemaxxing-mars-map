from datetime import datetime, timezone
import numpy as np
from . import factors, grid, geo
from .config import FACTORS, read

CRS = 'Mars 2000 planetocentric, east-positive, degrees'
DISCLAIMERS = ['The 0–100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.', 'Absence of a mapped hazard does not mean the terrain is safe.', 'Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.']
LAYERS = dict(zip(FACTORS[:4], ('slope_deg', 'roughness_m', 'thermal_index', 'ice_index')))
CONTEXT_NOTES = {
    'ice': 'Regional neutron-flux proxy constant within each preset; no local ice discrimination or accessibility evidence.',
    'thermal': 'THEMIS day-IR image brightness (contrast), not temperature or thermal inertia.',
}
UNITS = ('deg', 'm', 'unitless 0-1', 'unitless 0-1', 'km', 'km')

def compute(root, preset, config, weights):
    m, arrays = grid.load(root, preset['id'])
    x, y = grid.centers(m)
    shape = x.shape
    flags = []
    datasets = set()
    for name, layer in m['layers'].items():
        datasets.add(layer['dataset_id'])
        if layer.get('synthetic'):
            flags.append('synthetic:' + name)
    vectors = {}
    for name in ('hazards', 'science_targets'):
        path = root / 'data' / (name + '.geojson')
        if not path.exists():
            flags.append('missing:' + name)
            vectors[name] = []
            continue
        document = read(path)
        vectors[name] = [f for f in document['features'] if not f['properties']['preset_ids'] or preset['id'] in f['properties']['preset_ids']]
        for f in vectors[name]:
            datasets.add(f['properties']['dataset_id'])
            if f['properties'].get('synthetic') or document.get('synthetic'):
                flags.append('synthetic:' + name)
    values = {f: arrays.get(layer, np.full(shape, np.nan)) for f, layer in LAYERS.items()}
    for f, layer in LAYERS.items():
        if layer not in arrays:
            flags.append('missing:' + layer)
    base = preset['base_point']
    values['base_distance'] = grid.distance(x, y, base['lon'], base['lat'])
    targets = [f for f in vectors['science_targets'] if f['properties']['id'] in preset['science_target_ids'] and f['geometry']['type'] == 'Point']
    values['science'] = np.minimum.reduce([grid.distance(x, y, *f['geometry']['coordinates']) for f in targets]) if targets else np.full(shape, np.nan)
    if not targets:
        flags.append('missing:science_targets')
    subs = {}
    for f in FACTORS:
        params = config['factor_params'][f].copy()
        if f == 'base_distance':
            params['eva_max_radius_km'] = preset['eva_max_radius_km']
        subs[f] = getattr(factors, f)(values[f], params)
    denominator = sum(weights[f]*np.isfinite(subs[f]) for f in FACTORS)
    effective = {f: np.divide(weights[f]*np.isfinite(subs[f]), denominator, out=np.zeros(shape), where=denominator>0) for f in FACTORS}
    contributions = {f: 100*effective[f]*np.nan_to_num(subs[f]) for f in FACTORS}
    score = sum(contributions.values())
    excluded = values['slope'] > config['factor_params']['slope']['hard_max_deg']
    beyond = values['base_distance'] > preset['eva_max_radius_km']
    excluded |= beyond
    hazards = []
    exempt = set(config['hazard_rules'].get('score_exempt_kinds', []))
    for feature in vectors['hazards']:
        mask = geo.contains(x, y, feature['geometry'])
        p = feature['properties']
        hard = p['severity'] >= config['hazard_rules']['exclude_severity_at_least']
        if hard:
            excluded |= mask
        elif p.get('hazard_kind') not in exempt:
            # Display-only kinds (e.g. steep_slope, already in the slope subscore) are not penalised again.
            multiplier = np.where(mask, max(0, 1-config['hazard_rules']['penalty_per_severity']*p['severity']), 1)
            score = score*multiplier
            contributions = {f: c*multiplier for f, c in contributions.items()}
        hazards.append((p['id'], mask, hard))
    # Required terrain nodata cannot establish traversability.
    nodata = ~np.isfinite(arrays['slope_deg']) | ~np.isfinite(arrays['elevation_m'])
    score = np.where(nodata | (denominator == 0), np.nan, np.where(excluded, 0, score))
    return dict(manifest=m, arrays=arrays, values=values, subs=subs, effective=effective, contributions=contributions, score=score, excluded=excluded, beyond=beyond, hazards=hazards, flags=sorted(set(flags)), datasets=sorted(datasets), x=x, y=y)

def response(state, preset, config, weights, profile):
    m = state['manifest']
    k = grid.factor(m['shape'], config['score_grid']['max_cells'])
    scores = grid.aggregate(state['score'], k)
    rows, cols = scores.shape
    aggregated = {group: {f: grid.aggregate(a, k) for f,a in state[group].items()} for group in ('values','subs','effective','contributions')}
    dy, dx = m['cell_size_deg']
    w,s,e,n = m['bbox']
    hard_slope = grid.aggregate((state['values']['slope'] > config['factor_params']['slope']['hard_max_deg']).astype(float),k) > 0
    beyond = grid.aggregate(state['beyond'].astype(float),k) > 0
    hazards = [(ident, grid.aggregate(mask.astype(float),k)>0, hard) for ident,mask,hard in state['hazards']]
    available = {f: np.isfinite(aggregated['subs'][f]).tolist() for f in FACTORS}
    aggregated = {g:{f:a.tolist() for f,a in fields.items()} for g,fields in aggregated.items()}
    features = []
    for r in range(rows):
        for c in range(cols):
            sl = np.s_[r*k:min((r+1)*k,m['shape'][0]), c*k:min((c+1)*k,m['shape'][1])]
            reasons = []
            if hard_slope[r,c]: reasons.append('slope_above_hard_max')
            if beyond[r,c]: reasons.append('beyond_eva_radius')
            ids = []
            for ident, mask, hard in hazards:
                if mask[r,c]:
                    ids.append(ident)
                    if hard: reasons.append('hazard:' + ident)
            left, right = w+c*k*dx, min(e,w+(c+1)*k*dx)
            top, bottom = n-r*k*dy, max(s,n-(r+1)*k*dy)
            ident = 'r%dc%d' % (r,c)
            breakdown = {}
            for f,units in zip(FACTORS, UNITS):
                is_available = available[f][r][c]
                breakdown[f] = dict(value=aggregated['values'][f][r][c], units=units, subscore=aggregated['subs'][f][r][c], weight=aggregated['effective'][f][r][c], contribution=aggregated['contributions'][f][r][c], available=is_available)
                if f in CONTEXT_NOTES:
                    breakdown[f].update(context_only=True, note=CONTEXT_NOTES[f])
            score = scores[r,c]
            features.append(dict(type='Feature', id=ident, geometry=dict(type='Polygon', coordinates=[[[left,bottom],[right,bottom],[right,top],[left,top],[left,bottom]]]), properties=dict(cell_id=ident,row=r,col=c,center=[(left+right)/2,(bottom+top)/2],score=0 if reasons else int(round(score)) if np.isfinite(score) else None,excluded=bool(reasons),exclusion_reasons=reasons,factors=breakdown,hazard_ids=ids,data_flags=state['flags'])))
    finite = [f['properties']['score'] for f in features if f['properties']['score'] is not None]
    meta = dict(preset_id=preset['id'],profile=profile,weights=weights,effective_weights={f:float(np.mean(state['effective'][f])) for f in FACTORS},methodology_version=config['methodology_version'],label='Conditional heuristic EVA suitability index (0–100)',disclaimers=DISCLAIMERS,datasets=state['datasets'],data_flags=state['flags'],grid=dict(rows=rows,cols=cols,cell_size_deg=[dy*k,dx*k],bbox=m['bbox']),stats=dict(min=min(finite) if finite else None,max=max(finite) if finite else None,mean=float(np.mean(finite)) if finite else None,excluded_cells=sum(f['properties']['excluded'] for f in features)),generated_at=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'))
    return dict(type='FeatureCollection',crs_note=CRS,meta=meta,features=features)

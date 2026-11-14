import numpy as np

def slope(value, params):
    return np.clip((params['hard_max_deg']-value)/(params['hard_max_deg']-params['ideal_max_deg']), 0, 1)

def roughness(value, params):
    return np.clip((params['poor_m']-value)/(params['poor_m']-params['ideal_max_m']), 0, 1)

def thermal(value, params):
    result = np.clip((value-params['low'])/(params['high']-params['low']), 0, 1)
    return 1-result if params.get('mode') == 'prefer_low' else result

def ice(value, params):
    return thermal(value, params)

def science(value, params):
    return np.exp(-value/params['decay_km'])

def base_distance(value, params):
    return np.clip(1-value/params['eva_max_radius_km'], 0, 1)

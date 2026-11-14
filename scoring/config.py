import json
import math
import os
from pathlib import Path

FACTORS = ('slope', 'roughness', 'thermal', 'ice', 'science', 'base_distance')

class Error(Exception):
    def __init__(self, message, code='bad_request', status=2):
        super().__init__(message)
        self.code, self.status = code, status

def read(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except FileNotFoundError:
        raise Error('Missing file: ' + str(path), 'missing_data', 3)
    except (ValueError, OSError) as exc:
        raise Error(str(exc), 'internal', 1)

def weights(value):
    if not isinstance(value, dict) or not value or set(value) - set(FACTORS):
        raise Error('Unknown or empty factor weights')
    if any(isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) or v < 0 for v in value.values()) or sum(value.values()) <= 0:
        raise Error('Weights must be finite, nonnegative and not all zero')
    if any(value.get(f, 0) != 0 for f in ('ice', 'thermal')):
        raise Error('Ice and thermal are context-only; their weights must be zero')
    total = sum(value.values())
    return {f: value.get(f, 0) / total for f in FACTORS}

def load():
    root = Path(os.environ.get('CLAUDEMAXXING_ROOT', Path(__file__).resolve().parents[1]))
    missions = read(root / 'config/mission_presets.json')
    config = read(root / 'config/scoring_weights.json')
    try:
        for profile in config['profiles'].values():
            weights(profile['weights'])
        assert config['active_profile'] in config['profiles']
        assert config['score_grid']['max_cells'] > 0
        for p in missions['presets']:
            w, s, e, n = p['bbox']
            assert -180 <= w < e <= 180 and -90 <= s < n <= 90
            assert w <= p['center'][0] <= e and s <= p['center'][1] <= n
            assert w <= p['base_point']['lon'] <= e and s <= p['base_point']['lat'] <= n
            assert p['eva_max_radius_km'] > 0
        assert missions['default_preset'] in [p['id'] for p in missions['presets']]
        params = config['factor_params']
        assert params['slope']['hard_max_deg'] > params['slope']['ideal_max_deg']
        assert params['roughness']['poor_m'] > params['roughness']['ideal_max_m']
        for f in ('thermal', 'ice'):
            assert params[f]['high'] > params[f]['low']
        assert params['science']['decay_km'] > 0
        assert params['thermal'].get('mode') in ('prefer_high','prefer_low')
        assert config['hazard_rules']['exclude_severity_at_least'] > 0
        assert 0 <= config['hazard_rules']['penalty_per_severity'] <= 1
        assert math.isfinite(config.get('route',{}).get('score_cost_factor',2.0)) and config.get('route',{}).get('score_cost_factor',2.0) >= 0
        max_snap = config.get('route', {}).get('max_snap_km')
        assert max_snap is None or (not isinstance(max_snap, bool) and isinstance(max_snap, (int, float)) and math.isfinite(max_snap) and max_snap >= 0)
    except (KeyError, TypeError, AssertionError, Error) as exc:
        raise Error('Invalid configuration: ' + str(exc), 'internal', 1)
    return root, missions, config

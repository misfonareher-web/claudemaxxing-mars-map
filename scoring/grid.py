import numpy as np
from .config import Error, read

RADIUS_KM = 3396.190

def distance(lon, lat, lon2, lat2):
    a, b, c, d = map(np.radians, (lon, lat, lon2, lat2))
    h = np.sin((d-b)/2)**2 + np.cos(b)*np.cos(d)*np.sin((c-a)/2)**2
    return 2 * RADIUS_KM * np.arcsin(np.sqrt(np.clip(h, 0, 1)))

def centers(manifest):
    rows, cols = manifest['shape']
    dy, dx = manifest['cell_size_deg']
    w, s, e, n = manifest['bbox']
    return np.meshgrid(w+(np.arange(cols)+.5)*dx, n-(np.arange(rows)+.5)*dy)

def factor(shape, maximum):
    k = 1
    while ((shape[0]+k-1)//k)*((shape[1]+k-1)//k) > maximum:
        k += 1
    return k

def aggregate(a, k):
    rows, cols = a.shape
    padded = np.full((((rows+k-1)//k)*k, ((cols+k-1)//k)*k), np.nan)
    padded[:rows, :cols] = a
    blocks = padded.reshape(padded.shape[0]//k, k, padded.shape[1]//k, k)
    count = np.isfinite(blocks).sum(axis=(1,3))
    return np.divide(np.nansum(blocks, axis=(1,3)), count, out=np.full(count.shape, np.nan), where=count>0)

def load(root, preset):
    directory = root / 'data/grids' / preset
    m = read(directory / 'manifest.json')
    arrays = {}
    try:
        rows, cols = m['shape']
        assert 0 < rows <= 512 and 0 < cols <= 512
        assert m['origin'] == 'north_west'
        assert all(v > 0 for v in m['cell_size_deg'])
        for name, layer in m['layers'].items():
            path = (directory / layer['file']).resolve()
            assert path.parent == directory.resolve()
            a = np.load(path, allow_pickle=False)
            assert a.shape == (rows, cols) and a.dtype.kind == 'f'
            arrays[name] = np.where(np.isfinite(a), a, np.nan)
        for name in ('elevation_m', 'slope_deg'):
            if name not in arrays:
                raise Error('Required layer missing: ' + name, 'missing_data', 3)
    except (ValueError, AssertionError, KeyError, OSError) as exc:
        raise Error('Invalid grid: ' + str(exc), 'missing_data', 3)
    return m, arrays

import numpy as np

def ring_mask(x, y, ring):
    inside = np.zeros(np.shape(x), dtype=bool)
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if a[1] == b[1]:
            continue
        cross = ((a[1] > y) != (b[1] > y)) & (x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])
        inside ^= cross
    return inside

def contains(x, y, geometry):
    result = np.zeros(np.shape(x), dtype=bool)
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else []
    for polygon in polygons:
        mask = ring_mask(x, y, polygon[0])
        for hole in polygon[1:]:
            mask &= ~ring_mask(x, y, hole)
        result |= mask
    return result

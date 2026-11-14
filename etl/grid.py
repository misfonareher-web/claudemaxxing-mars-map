"""Grid geometry uses north-first rows and the Mars 2000 sphere."""
import math
import numpy as np

RADIUS_M = 3396190.0
CRS_NOTE = 'Mars 2000 planetocentric, east-positive, degrees'


def wrap_lon(lon):
    return (np.asarray(lon) + 180) % 360 - 180


def definition(bbox):
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError('Expected non-wrapping Mars bbox')
    rows = min(512, math.ceil((north - south) * 128))
    cols = min(512, math.ceil((east - west) * 128))
    return (rows, cols), ((north - south) / rows, (east - west) / cols)


def centers(bbox):
    shape, (dy, dx) = definition(bbox)
    return (bbox[0] + (np.arange(shape[1]) + .5) * dx,
            bbox[3] - (np.arange(shape[0]) + .5) * dy)


def sample(array, rows, cols, method='bilinear'):
    rows, cols = np.broadcast_arrays(rows, cols)
    if np.any(rows < 0) or np.any(cols < 0) or np.any(rows > array.shape[0]-1) or np.any(cols > array.shape[1]-1):
        raise ValueError('Sampling outside source grid')
    if method == 'nearest':
        return array[np.rint(rows).astype(int), np.rint(cols).astype(int)].astype(np.float32)
    if method != 'bilinear':
        raise ValueError('Unknown sampling method')
    r, c = np.floor(rows).astype(int), np.floor(cols).astype(int)
    r1, c1 = np.minimum(r+1, array.shape[0]-1), np.minimum(c+1, array.shape[1]-1)
    fy, fx = rows-r, cols-c
    values = np.stack([array[r,c], array[r,c1], array[r1,c], array[r1,c1]])
    weights = np.stack([(1-fy)*(1-fx), (1-fy)*fx, fy*(1-fx), fy*fx])
    # Zero-weight missing neighbours must not contaminate exact source centers.
    return np.sum(np.where(weights == 0, 0, values * weights), axis=0).astype(np.float32)


def terrain(elevation, bbox):
    _, (dlat, dlon) = definition(bbox)
    _, lat = centers(bbox)
    dy = RADIUS_M * np.deg2rad(dlat)
    dx = RADIUS_M * np.cos(np.deg2rad(lat))[:,None] * np.deg2rad(dlon)
    gy, gx = np.gradient(elevation.astype(float))
    slope = np.rad2deg(np.arctan(np.hypot(gy/dy, gx/dx)))
    padded = np.pad(elevation, 1, mode='edge')
    windows = np.lib.stride_tricks.sliding_window_view(padded, (3,3))
    roughness = np.std(windows.astype(float), axis=(-2,-1))
    return slope.astype(np.float32), roughness.astype(np.float32)

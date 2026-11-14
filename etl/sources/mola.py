"""MOLA MEGDR 128 pixels/degree median topography, PDS3."""
import re
import numpy as np
from etl.download import fetch as download
from etl.grid import centers, sample

BASE = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/'
PROVENANCE = dict(dataset_id='mola_megdr', title='MOLA MEGDR median topography', mission='Mars Global Surveyor', instrument='MOLA', data_type='elevation', source_url=BASE, temporal_coverage='1997-09-15 to 2001-06-30', spatial_coverage='Global; selected 128 pixels/degree tiles', resolution='1/128 degree, approximately 463 m north-south', units='m above GMM3 areoid', format='PDS3 detached label and big-endian int16 IMG', processing='Bilinear sampling at exact target cell centers; spherical gradient slope; edge-padded 3x3 elevation population standard deviation.', limitations=['Coarse altimetry smooths boulders and local slopes.', 'MEGDR includes interpolated bins; equatorial profile gaps can reach 12 km.'], license='NASA PDS public domain', synthetic=False, used_for=['elevation', 'slope', 'roughness', 'hazards'])


def fetch(raw_dir, preset, offline=False, force=False):
    west, south, east, north = preset['bbox']
    lon = int((west % 360) // 90) * 90
    top = 44 if south >= 0 and north <= 44 else 0 if south >= -44 and north <= 0 else None
    if top is None or east % 360 > lon + 90:
        raise ValueError('MOLA reader currently requires bbox within one equatorial tile')
    name = f'megt{top:02d}n{lon:03d}hb'
    label = download(BASE+name+'.lbl', raw_dir, offline, force)
    text = label.read_text()
    rows, cols, resolution, top, left = layout(text)
    lat = centers(preset['bbox'])[1]
    first = max(0, int(np.floor((top-lat.max())*resolution-.5)))
    last = min(rows, int(np.floor((top-lat.min())*resolution-.5))+2)
    image = download(BASE+name+'.img', raw_dir, offline, force, (first*cols*2,last*cols*2-1))
    return label, image, first


def layout(text):
    def field(name):
        match = re.search(r'^\s*'+name+r'\s*=\s*([-+\d.]+)', text, re.M)
        if not match:
            raise ValueError('Missing MOLA field '+name)
        return float(match[1])
    rows, cols = int(field('LINES')), int(field('LINE_SAMPLES'))
    if 'MSB_INTEGER' not in text or field('SAMPLE_BITS') != 16 or field('RECORD_BYTES') != cols*2:
        raise ValueError('Unexpected MOLA binary layout')
    return rows, cols, field('MAP_RESOLUTION'), field('MAXIMUM_LATITUDE'), field('WESTERNMOST_LONGITUDE')


def build(preset, files):
    label, image, first = files
    rows, cols, resolution, top, left = layout(label.read_text())
    if image.stat().st_size % (cols*2):
        raise ValueError('Truncated MOLA rows')
    values = np.fromfile(image, dtype='>i2').reshape(-1,cols)
    lon, lat = centers(preset['bbox'])
    rr = (top-lat)*resolution-.5-first
    cc = (lon % 360-left)*resolution-.5
    return sample(values, rr[:,None], cc[None,:])

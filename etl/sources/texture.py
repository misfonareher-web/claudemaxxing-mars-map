"""Global Mars Trek color shaded relief for globe context."""
from PIL import Image
from etl.download import fetch

BASE = 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/'
PROVENANCE = dict(dataset_id='trek_mola_globe', title='Mars Trek MOLA color shaded relief', mission='Mars Global Surveyor', instrument='MOLA', data_type='texture', source_url=BASE+'WMTSCapabilities.xml', temporal_coverage='MGS mapping mission', spatial_coverage='Global', resolution='2048 x 1024; zoom 2', units='rendered RGB', format='JPEG', processing='Stitch 8 x 4 zoom-2 JPEG tiles without resampling; north at top, east-positive longitude -180 at left to +180 at right.', limitations=['Color encodes elevation and shaded relief; not true-color surface imagery.'], license='NASA/JPL-Caltech/GSFC, Mars Trek', synthetic=False, used_for=['globe context'])


def build(raw_dir, output, offline=False, force=False):
    image = Image.new('RGB', (2048, 1024))
    for y in range(4):
        for x in range(8):
            path = fetch(BASE+f'default/default028mm/2/{y}/{x}.jpg', raw_dir, offline, force)
            with Image.open(path) as tile:
                if tile.size != (256, 256):
                    raise ValueError('Unexpected globe tile dimensions')
                image.paste(tile.convert('RGB'), (x*256, y*256))
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, quality=90, optimize=True)
    if output.stat().st_size > 1500000:
        raise ValueError('Globe texture exceeds 1.5 MB')

"""Mars Trek THEMIS rendered brightness; never a temperature measurement."""
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from etl.download import fetch as download
from etl.grid import centers
BASE='https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018/1.0.0/'
PROVENANCE=dict(dataset_id='trek_themis_ir_day',title='THEMIS Day IR controlled mosaic',mission='Mars Odyssey',instrument='THEMIS',data_type='thermal_ir',source_url=BASE+'WMTSCapabilities.xml',temporal_coverage='Multi-observation mosaic, October 2018 release',spatial_coverage='65S to 65N',resolution='100 m source; WMTS zoom 9',units='relative rendered brightness / 255',format='WMTS PNG',processing='Nearest rendered grayscale pixel at target centers divided by 255; transparent pixels become nodata.',limitations=['Relative display brightness, not temperature or thermal inertia; illumination and surface texture affect values.'],license='NASA public domain',synthetic=False,used_for=['thermal'])
def fetch(raw_dir,preset,offline=False,force=False):
 root=ET.parse(download(BASE+'WMTSCapabilities.xml',raw_dir,offline,force)).getroot()
 ns={'w':'http://www.opengis.net/wmts/1.0','o':'http://www.opengis.net/ows/1.1'}
 matrices=root.findall('.//w:TileMatrix',ns)
 m=max(matrices,key=lambda m:int(m.find('o:Identifier',ns).text));z=int(m.find('o:Identifier',ns).text)
 size=int(m.find('w:TileWidth',ns).text)
 lon,lat=centers(preset['bbox']);x=((lon+180)/(180/2**z)*size).astype(int);y=((90-lat)/(180/2**z)*size).astype(int)
 tiles={}
 for ty in np.unique(y//size):
  for tx in np.unique(x//size):tiles[int(ty),int(tx)]=download(BASE+f'default/default028mm/{z}/{ty}/{tx}.png',raw_dir,offline,force)
 return x,y,size,tiles

def build(preset,files):
 x,y,size,tiles=files
 result=np.full((len(y),len(x)),np.nan,dtype=np.float32)
 for (ty,tx),path in tiles.items():
  image=Image.open(path).convert('RGBA'); a=np.asarray(image)
  if image.size!=(size,size):raise ValueError('Unexpected tile size')
  rr=np.flatnonzero(y//size==ty);cc=np.flatnonzero(x//size==tx)
  pixels=a[(y[rr]%size)[:,None],(x[cc]%size)[None,:]]
  result[np.ix_(rr,cc)]=np.where(pixels[:,:,3]>0,pixels[:,:,:3].mean(axis=2)/255,np.nan)
 return result

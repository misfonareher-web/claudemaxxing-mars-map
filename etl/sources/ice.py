"""Coarse Odyssey epithermal-neutron suppression proxy, not ice abundance."""
import numpy as np
from etl.download import fetch as download
from etl.grid import centers
BASE='https://pds-geosciences.wustl.edu/ody/urn-nasa-pds-odyssey_grs_special/data/ns_epithermal_020917.'
PROVENANCE=dict(dataset_id='ody_ns_epithermal',title='Odyssey NS epithermal neutron flux',mission='Mars Odyssey',instrument='Neutron Spectrometer',data_type='water_ice',source_url=BASE+'tab',temporal_coverage='First 25.7 mapping days, 2002',spatial_coverage='Global',resolution='0.5 degree bins; instrument footprint much larger; latitude-band subset -5.5..-3.5 and 17.5..19.5 degrees',units='relative neutron suppression 0-1',format='PDS ASCII table',processing='Nearest 0.5-degree bin; index=clip(1-flux/maximum flux in downloaded latitude bands,0,1).',limitations=['Neutron suppression is a hydrogen-sensitive comparison proxy, not water fraction or confirmation of ice; composition also affects neutrons.','Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.'],license='NASA PDS public domain',synthetic=False,used_for=['ice'])
def fetch(raw_dir,offline=False,force=False):
 label=download(BASE+'lbl',raw_dir,offline,force)
 if 'EPITHERMAL NEUTRON FLUX' not in label.read_text():raise ValueError('Unexpected NS label')
 return [download(BASE+'tab',raw_dir,offline,force,(r0*720*26,r1*720*26-1)) for r0,r1 in [(169,173),(215,219)]]
def build(preset,path):
 a=np.concatenate([np.loadtxt(p,delimiter=',') for p in path])
 if a.shape!=(5760,3) or not np.all(np.isfinite(a)):raise ValueError('Invalid NS table')
 lon,lat=centers(preset['bbox']);result=np.empty((len(lat),len(lon)),np.float32)
 for r,y in enumerate(lat):
  for c,x in enumerate(lon):
   d=((a[:,0]-x%360+180)%360-180)**2+(a[:,1]-y)**2
   result[r,c]=np.clip(1-a[np.argmin(d),2]/a[:,2].max(),0,1) if a[np.argmin(d),2]>0 else np.nan
 return result

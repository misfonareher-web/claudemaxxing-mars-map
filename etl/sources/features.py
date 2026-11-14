"""Small cited approximate feature catalog and slope row-run polygons."""
import json
from pathlib import Path
import numpy as np
from etl.grid import CRS_NOTE, definition
from etl.sources import catalog
DISCLAIMER='Absence of a mapped hazard does not mean the terrain is safe.'
ICE='Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.'
SOURCE='https://science.nasa.gov/mars/'
PROVENANCE=dict(dataset_id='mission_features',title='Mars landing sites and science targets',mission='NASA Mars exploration',instrument='Published mission maps',data_type='landing_sites',source_url='https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Landing_Sites.htm',temporal_coverage='1976-2021 landings; historical rover maps',spatial_coverage='Mars mission locations',resolution='Point coordinates as published (2-6 decimals)',units='degrees',format='GeoJSON',processing='Landing sites transcribed from the PDS Geosciences ODE landing-site table or peer-reviewed papers (per-feature source_ref) and converted to east-positive -180..180; science targets digitized approximately from cited NASA images and maps.',limitations=['Science-target positions are approximate.','Coordinates are not suitable for navigation.'],license='NASA public domain',synthetic=False,used_for=['base_distance','science','map context'])
def feature(id,kind,name,coords,presets,**extra):
 return dict(type='Feature',geometry=dict(type='Point',coordinates=coords),properties=dict(id=id,kind=kind,name=name,description=name,dataset_id='mission_features',preset_ids=presets,confidence='low',caveat='Approximate hand-transcribed coordinates from published mission context maps.',source_ref=SOURCE,synthetic=False,**extra))
def collection(features):
 return dict(type='FeatureCollection',crs_note=CRS_NOTE,dataset_ids=sorted({f['properties']['dataset_id'] for f in features}),features=features)
def build(presets,slopes,thresholds,ice_grids):
 land=[];science=[];hazards=[];frozen=[]
 for id,name,mission,agency,date,status,lat,lon,src,conf,note in catalog.LANDING_SITES:
  f=feature(id,'landing_site',name,[catalog.east180(lon),lat],[],mission=mission,agency=agency,landing_date=date,status=status)
  f['properties'].update(dataset_id='cnsa_mission_records' if agency=='CNSA' else 'mission_features',confidence=conf,source_ref=src,caveat=note+' Planetocentric latitude; longitude converted from 0-360 E to east-positive -180..180. Not for navigation.')
  land.append(f)
 for p in presets:
  id=p['id'];b=p['base_point'];src,mission,date=catalog.BASE_SOURCES[b['id']]
  f=feature(b['id'],'landing_site',b['name'],[b['lon'],b['lat']],[id],mission=mission,agency='NASA',landing_date=date,status='active')
  f['properties'].update(confidence='high',source_ref=src,caveat='Historical landing-site coordinates (planetocentric, east-positive), copied from config/mission_presets.json; used as a stand-in for a hypothetical habitat in the EVA demo, not an existing crew habitat.')
  land.append(f)
  for target in p['science_target_ids']:
   name,lon,lat,conf,src,cav,goal=catalog.SCIENCE_TARGETS[target]
   f=feature(target,'science_target',name,[lon,lat],[id],priority=1,science_goal=goal)
   f['properties'].update(description=goal,confidence=conf,source_ref=src,caveat=cav)
   science.append(f)
  shape,(dy,dx)=definition(p['bbox']);west,south,east,north=p['bbox']
  for severity,mask in [(2,(slopes[id]>thresholds['ideal_max_deg'])&(slopes[id]<=thresholds['hard_max_deg'])),(3,slopes[id]>thresholds['hard_max_deg'])]:
   polygons=[]
   for r,row in enumerate(mask):
    edges=np.diff(np.r_[False,row,False].astype(int));starts=np.flatnonzero(edges==1);ends=np.flatnonzero(edges==-1)
    for c,end in zip(starts,ends):
     x0,x1=west+c*dx,west+end*dx;y1,y0=north-r*dy,north-(r+1)*dy
     polygons.append([[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]])
   if polygons:
    f=feature(f'hz-{id}-slope-{severity}','hazard','Coarse MOLA slope',[0,0],[id],hazard_kind='steep_slope',severity=severity,derived=True);f['geometry']=dict(type='MultiPolygon',coordinates=polygons);f['properties'].update(dataset_id='mola_megdr',caveat=DISCLAIMER,source_ref='https://pds-geosciences.wustl.edu/missions/mgs/mola.html');hazards.append(f)
  f=feature('ice-'+id+'-neutrons','ice','Regional neutron suppression context',[b['lon'],b['lat']],[id],ice_metric='relative neutron suppression',ice_value=float(np.mean(ice_grids[id])),depth_estimate_m=None);f['properties'].update(dataset_id='ody_ns_epithermal',caveat=ICE+' Coarse hydrogen-sensitive evidence; not proof of ice.',source_ref='https://pds-geosciences.wustl.edu/missions/odyssey/grsspecial.html');frozen.append(f)
 for id,name,geom,metric,depth,src,conf,cav in catalog.ICE_CONTEXT:
  f=feature(id,'ice',name,[0,0],[],ice_metric=metric,ice_value=None,depth_estimate_m=depth);f['geometry']=geom
  f['properties'].update(dataset_id='ice_literature',confidence=conf,source_ref=src,caveat=ICE+' '+cav);frozen.append(f)
 preset_ids={p['id'] for p in presets}
 outlines=json.loads(Path(__file__).with_name('hazard_outlines.geojson').read_text(encoding='utf-8'))
 hazards.extend(f for f in outlines['features'] if preset_ids.intersection(f['properties']['preset_ids']))
 return dict(landing_sites=collection(land),science_targets=collection(science),hazards=collection(hazards),ice=collection(frozen))

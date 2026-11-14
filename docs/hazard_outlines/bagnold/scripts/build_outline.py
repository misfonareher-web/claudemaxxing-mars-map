"""Build the hand-traced overview envelope; run with python -I scripts/build_outline.py."""
import sys,pathlib,json,math,hashlib
B=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(B/'scripts/_deps'))
import numpy as np
from shapely.geometry import Polygon,Point,box,mapping
from shapely.geometry.polygon import orient
from PIL import Image,ImageDraw
m=json.loads((B/'raw/tile_manifest.json').read_text());n=2**m['zoom']
def exact(x,y):
 return [(m['x0']*256+x)/(n*256)*360-180,math.degrees(math.atan(math.sinh(math.pi*(1-2*(m['y0']*256+y)/(n*256)))))]
# Three tile-grid control points: pixel coordinates are measured from the mosaic upper left.
cp=[{'pixel':p,'lonlat':exact(*p)} for p in [[0,0],[1536,0],[0,1280]]]
A=np.array([[*p['pixel'],1] for p in cp]);coeff=np.linalg.solve(A,np.array([p['lonlat'] for p in cp]))
def affine(x,y):return (np.array([x,y,1])@coeff).tolist()
def pixel(lon,lat):return np.linalg.solve(coeff[:2].T,np.array([lon,lat])-coeff[2]).tolist()
# Manually traced visible dark-dune/sand envelope on raw/ctx_grid.png; includes inter-dune gaps.
vertices=[[0,1170],[120,1050],[200,990],[280,940],[350,875],[440,810],[525,760],[565,705],[610,655],[650,640],[680,600],[725,570],[755,570],[790,545],[835,500],[890,470],[920,435],[960,405],[1005,375],[1045,370],[1080,340],[1125,330],[1170,310],[1220,260],[1250,240],[1245,210],[1280,190],[1280,140],[1335,135],[1360,110],[1350,180],[1310,240],[1285,285],[1240,315],[1210,365],[1160,385],[1120,430],[1080,490],[1030,520],[990,550],[950,575],[905,600],[865,640],[820,665],[780,700],[730,720],[670,750],[600,790],[540,840],[480,885],[425,940],[350,980],[280,1040],[200,1090],[120,1150],[0,1240]]
poly=orient(Polygon([affine(*p) for p in vertices]).intersection(box(137.2,-4.9,137.6,-4.5)),sign=1)
poly=Polygon([[round(x,7),round(y,7)] for x,y in poly.exterior.coords]);poly=orient(poly,sign=1)
props={'id':'hz-gale-bagnold-dunes','name':'Bagnold Dunes (approximate overview envelope)','description':'Loose active dune sand can cause wheel slip, sinkage, and loss of rover mobility.','hazard_kind':'sand_dunes','severity':2,'confidence':'medium','source_ref':'https://mars.nasa.gov/maps/location/api/configure/get?mission=MSL','caveat':'Absence of a mapped hazard does not mean the terrain is safe. This generalized envelope was manually traced from NASA MMGIS CTX tiles using a three-control-point affine transform, includes intervening bedrock gaps, and has estimated boundary uncertainty of 200-500 m, locally about 1 km; it is for overview display only.'}
f={'type':'Feature','properties':props,'geometry':mapping(poly)}
(B/'bagnold.geojson').write_text(json.dumps(f,indent=2)+'\n',encoding='utf-8')
waypoints=json.loads((B/'raw/MSL_waypoints.json').read_text())['features']
checks=[]
for sol in [3,1181,1183,1192,1194,1196,1216,1221,1243,1646,1648]:
 for p in waypoints:
  if p['properties']['sol']==sol:
   xy=p['geometry']['coordinates'][:2];inside=poly.covers(Point(xy));checks.append({'sol':sol,'lonlat':xy,'covered':inside});assert inside==(sol!=3),(sol,xy)
assert not poly.covers(Point(137.4417,-4.5895))
assert poly.is_valid and poly.exterior.is_ccw
assert poly.exterior.coords[0]==poly.exterior.coords[-1]
assert box(137.2,-4.9,137.6,-4.5).covers(poly)
assert 10<=len(poly.exterior.coords)-1<=60
assert props['caveat'].count('Absence of a mapped hazard does not mean the terrain is safe.')==1
# Compare affine latitude with exact tile inverse over the full raster.
residual=max(abs(affine(0,y)[1]-exact(0,y)[1]) for y in range(1281))*math.pi/180*3396190
report={'bbox':list(poly.bounds),'parts':1,'distinct_vertices':len(poly.exterior.coords)-1,'positions_including_closure':len(poly.exterior.coords),'control_points':cp,'affine_rows_x_y_1_to_lon_lat':coeff.tolist(),'max_affine_vs_inverse_error_m':residual,'checks':checks,'source_pixel_vertices':vertices}
(B/'raw/digitization.json').write_text(json.dumps(report,indent=2)+'\n')
im=Image.open(B/'raw/ctx_mosaic.png').convert('RGBA');overlay=Image.new('RGBA',im.size);d=ImageDraw.Draw(overlay);pts=[pixel(x,y) for x,y in poly.exterior.coords];d.polygon([tuple(p) for p in pts],fill=(255,170,0,75));d.line([tuple(p) for p in pts],fill=(255,100,0,255),width=3)
for p in checks:
 x,y=pixel(*p['lonlat']);d.ellipse((x-4,y-4,x+4,y+4),fill='cyan');d.text((x+7,y),str(p['sol']),fill='cyan')
Image.alpha_composite(im,overlay).convert('RGB').save(B/'raw/outline_check.png')
print(json.dumps({k:v for k,v in report.items() if k not in ['source_pixel_vertices','checks']},indent=2));print('All geometry and waypoint assertions passed.')

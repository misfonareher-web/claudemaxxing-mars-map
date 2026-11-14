const $=id=>document.getElementById(id);
export function createMap(){
const map=L.map('map',{crs:L.CRS.EPSG4326}).setView([0,0],1),control=L.control.layers().addTo(map);
map.on('mousemove',e=>{$('coords').textContent=`${e.latlng.lng.toFixed(4)}° E / ${e.latlng.lat.toFixed(4)}° · Mars 2000`;});
const scale=L.control({position:'bottomleft'});scale.onAdd=()=>{const d=L.DomUtil.create('div','leaflet-bar');d.style.cssText='background:white;color:black;padding:6px';map.on('moveend zoomend',()=>{const a=map.containerPointToLatLng([0,map.getSize().y/2]),b=map.containerPointToLatLng([100,map.getSize().y/2]);d.textContent='100 px = '+(3396.19*Math.abs(b.lng-a.lng)*Math.PI/180*Math.cos(a.lat*Math.PI/180)).toFixed(2)+' km';});return d;};scale.addTo(map);
return {map,control};}

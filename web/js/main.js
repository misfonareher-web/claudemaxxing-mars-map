import {requestRoute} from './route.js';
import {overlayColors} from './layers.js';
import {scoreStyle} from './score.js';
import {createMap} from './map.js';
import {panel} from './provenance.js';
import {showCard} from './card.js';
import {api} from './api.js';
const $=id=>document.getElementById(id);
let weights={},settings,timer;
function sliders(){weights={...settings.profiles[$('profile').value].weights};$('weights').replaceChildren();for(const k of Object.keys(weights)){const label=document.createElement('label'),input=document.createElement('input'),out=document.createElement('output');label.textContent=k+' ';input.type='range';input.min=0;input.max=1;input.step=.01;input.value=weights[k];input.oninput=()=>{weights[k]=Number(input.value);const sum=Object.values(weights).reduce((a,b)=>a+b,0);for(const el of $('weights').querySelectorAll('output'))el.textContent=sum?Math.round(weights[el.dataset.key]/sum*100)+'%':'0%';clearTimeout(timer);timer=setTimeout(refresh,300);};out.dataset.key=k;out.textContent=Math.round(weights[k]*100)+'%';label.append(input,out);$('weights').append(label);} }
$('reset').onclick=()=>{sliders();refresh();};
$('opacity').oninput=()=>map.eachLayer(l=>{if(l instanceof L.TileLayer)l.setOpacity(Number($('opacity').value));});
const {map,control}=createMap();let presets,score,overlays=[],points=null,route;
async function refresh(){$('card').replaceChildren();points=null;if(route){map.removeLayer(route);route=null;}const id=$('preset').value,p=presets.find(p=>p.id===id),b=p.bbox;map.fitBounds([[b[1],b[0]],[b[3],b[2]]]);$('status').textContent=p.status+' · '+p.scenario+' · Loading…';if(score)map.removeLayer(score);for(const l of overlays){map.removeLayer(l);control.removeLayer(l);}overlays=[];
try{const f=await api('features?preset='+id);for(const [kind,color]of Object.entries(overlayColors)){const l=L.geoJSON({...f,features:f.features.filter(f=>f.properties.kind===kind)},{style:{color},pointToLayer:(f,ll)=>L.circleMarker(ll,{color})}).addTo(map);control.addOverlay(l,kind);overlays.push(l);}const s=await api('score?preset='+id+'&profile='+$('profile').value+'&weights='+encodeURIComponent(JSON.stringify(weights)));score=L.geoJSON(s,{style:scoreStyle,onEachFeature:(f,l)=>l.on('click',()=>{showCard(f,s.meta);})}).addTo(map);$('status').textContent=p.status+' · '+p.scenario+' · '+(s.meta.data_flags??[]).join(', ');}catch(e){$('status').textContent=p.status+' | '+p.scenario+' | No data for this preset yet: '+e.message;}
for(const k of ['environment','provenance'])api(k+(k==='environment'?'?preset='+id:'')).then(j=>panel(k,j)).catch(e=>$(k).textContent=e.message);}
$('route').onclick=()=>{points=[];$('status').textContent='Click start, then end';};map.on('click',async e=>{if(!points)return;points.push([e.latlng.lng,e.latlng.lat]);if(points.length<2)return;const selected=points;points=null;try{const r=await requestRoute($('preset').value,$('profile').value,weights,selected);if(route)map.removeLayer(route);route=L.geoJSON(r).addTo(map);$('card').textContent=JSON.stringify(r,null,2);}catch(e){$('status').textContent=e.message;}});
try{const [p,l]=await Promise.all([api('presets'),api('layers')]);presets=p.presets;for(const v of presets){const o=document.createElement('option');o.value=v.id;o.textContent=v.name;$('preset').append(o);}$('preset').value=p.default_preset;for(const [i,v]of l.basemaps.entries()){const t=L.tileLayer(v.url_template,{maxNativeZoom:v.max_native_zoom,maxZoom:15,attribution:v.attribution});control.addBaseLayer(t,v.title);if(!i)t.addTo(map);}$('preset').onchange=refresh;settings=await (await fetch('/config/scoring_weights.json')).json();sliders();$('profile').onchange=()=>{sliders();refresh();};await refresh();}catch(e){$('status').textContent=e.message;}





const baseButton=document.createElement('button');baseButton.textContent='Route from preset base';baseButton.onclick=()=>{const p=presets.find(p=>p.id===$('preset').value);points=[[p.base_point.lon,p.base_point.lat]];$('status').textContent='Click route destination';};$('route').after(baseButton);

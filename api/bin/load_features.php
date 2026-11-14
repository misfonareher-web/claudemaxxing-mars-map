<?php
require dirname(__DIR__).'/src/App.php';
$c=null; for($i=0;$i<30&&!$c;$i++){ $c=db(); if(!$c) sleep(1); }
if(!$c) { error_log('load_features: DB unreachable after 30 retries'); exit(0); }
// Mirror data/*.geojson exactly: upsert every feature, then delete rows no longer in the files.
$c->beginTransaction();
$s=$c->prepare('INSERT INTO features VALUES (?,?,ARRAY(SELECT jsonb_array_elements_text(?::jsonb)),?::jsonb,?::jsonb,?,?,?,?) ON CONFLICT(id) DO UPDATE SET properties=excluded.properties,geometry=excluded.geometry,kind=excluded.kind,preset_ids=excluded.preset_ids,min_lon=excluded.min_lon,min_lat=excluded.min_lat,max_lon=excluded.max_lon,max_lat=excluded.max_lat');
$ids=[];
foreach(glob(root().'/data/*.geojson') as $file) foreach(readJson($file)['features'] as $f) {
 $p=$f['properties']; $xs=[];$ys=[]; $walk=function($a)use(&$walk,&$xs,&$ys){if(is_numeric($a[0]??null)){$xs[]=$a[0];$ys[]=$a[1];}else foreach($a as $v)$walk($v);}; $walk($f['geometry']['coordinates']);
 $s->execute([$p['id'],$p['kind'],json_encode($p['preset_ids']),json_encode($p),json_encode($f['geometry']),min($xs),min($ys),max($xs),max($ys)]);
 $ids[]=$p['id'];
}
if($ids){ $c->prepare('DELETE FROM features WHERE NOT (id = ANY(ARRAY(SELECT jsonb_array_elements_text(?::jsonb))))')->execute([json_encode($ids)]); }
$c->commit();

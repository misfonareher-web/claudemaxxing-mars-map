<?php
ini_set('display_errors','0');
final class ApiError extends RuntimeException { public function __construct(public int $status,string $message) { parent::__construct($message); } }
function root(): string { return getenv('CLAUDEMAXXING_ROOT') ?: dirname(__DIR__,2); }
function readJson(string $path): array { if (!is_file($path)) throw new ApiError(404,'Data unavailable'); return json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR); }
function db(): ?PDO { try { return new PDO(getenv('DB_DSN') ?: 'pgsql:host=db;dbname=mars;connect_timeout=2',getenv('DB_USER') ?: 'mars',getenv('DB_PASSWORD') ?: '',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); } catch(Throwable $e) { error_log('db(): ' . $e->getMessage()); return null; } }
function corsHeaders(?string $origin): array {
 $headers=['Vary'=>'Origin','Access-Control-Allow-Methods'=>'GET, POST, OPTIONS','Access-Control-Allow-Headers'=>'Content-Type'];
 $allowed=array_map('trim',explode(',',getenv('CORS_ALLOWED_ORIGINS') ?: ''));
 if($origin!==null && $origin!=='' && $origin!=='*' && in_array($origin,$allowed,true)) $headers['Access-Control-Allow-Origin']=$origin;
 return $headers;
}
function validate(array $q,string $cmd): array {
 $presets=readJson(root().'/config/mission_presets.json')['presets'];
 if(!array_key_exists('preset',$q) && in_array($cmd,['point','route'],true)) {
  $points=$cmd==='point'?[[$q['lon']??null,$q['lat']??null]]:[$q['from']??null,$q['to']??null];
  foreach($points as $point) {
   if(!is_array($point)||!array_is_list($point)||count($point)!==2) throw new ApiError(400,'Invalid coordinate');
   foreach($point as $n) if(!is_numeric($n)||!is_finite((float)$n)) throw new ApiError(400,'Invalid coordinate');
  }
  $matches=[];
  foreach($presets as $v) {
   [$a,$b,$c,$d]=$v['bbox']; $inside=true;
   foreach($points as [$x,$y]) if($x<$a||$x>$c||$y<$b||$y>$d) $inside=false;
   if($inside) $matches[]=$v['id'];
  }
  if(count($matches)!==1) throw new ApiError(400,'Point outside the supported regions: '.implode(', ',array_column($presets,'id')).' (coordinates must fit exactly one region)');
  $q['preset']=$matches[0];
 }
 $p=null; foreach($presets as $v) if (($q['preset']??null)===$v['id']) $p=$v;
 if (!$p) throw new ApiError(400,'Unknown preset');
 $cfg=readJson(root().'/config/scoring_weights.json'); $out=['preset'=>$p['id']];
 if(isset($q['profile']) && is_string($q['profile'])) $q['profile']=$cfg['profile_aliases'][$q['profile']]??$q['profile'];
 if(isset($q['profile'])) { if(!is_string($q['profile'])||!isset($cfg['profiles'][$q['profile']])) throw new ApiError(400,'Unknown profile'); $out['profile']=$q['profile']; }
 if(isset($q['weights'])) { $v=is_string($q['weights'])?json_decode($q['weights'],true):$q['weights']; if(!is_array($v)||!$v||array_is_list($v)) throw new ApiError(400,'Invalid weights'); foreach($v as $k=>$n) if(!isset($cfg['factor_params'][$k])||!is_numeric($n)||!is_finite((float)$n)||$n<0) throw new ApiError(400,'Invalid weight'); if(array_sum($v)<=0) throw new ApiError(400,'Zero weights'); foreach(['ice','thermal'] as $f) if(($v[$f]??0)!=0) throw new ApiError(400,'Ice and thermal are context-only; their weights must be zero'); ksort($v); $out['weights']=$v; }
 $coord=function($v)use($p){ if(!is_array($v)||!array_is_list($v)||count($v)!==2) throw new ApiError(400,'Invalid coordinate'); foreach($v as $n) if(!is_numeric($n)||!is_finite((float)$n)) throw new ApiError(400,'Invalid coordinate'); [$x,$y]=array_map('floatval',$v); [$a,$b,$c,$d]=$p['bbox']; if($x<$a||$x>$c||$y<$b||$y>$d) throw new ApiError(400,'Coordinate outside preset'); return [$x,$y]; };
 if($cmd==='point') [$out['lon'],$out['lat']]=$coord([$q['lon']??null,$q['lat']??null]);
 if($cmd==='route') foreach(['from','to'] as $k) $out[$k]=$coord($q[$k]??null);
 return $out;
}
function scoring(string $cmd,array $q): array {
 $argv=getenv('SCORING_CMD')?json_decode(getenv('SCORING_CMD'),true,512,JSON_THROW_ON_ERROR):['python3','-m','scoring.cli'];
 if(!is_array($argv)||!array_is_list($argv)||!$argv) throw new RuntimeException('SCORING_CMD must be a JSON argv array');
 $argv[]=$cmd; $proc=proc_open($argv,[['pipe','r'],['pipe','w'],['pipe','w']],$pipes,root()); if(!is_resource($proc)) throw new ApiError(503,'Scoring unavailable');
 fwrite($pipes[0],json_encode($q,JSON_THROW_ON_ERROR)); fclose($pipes[0]); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $out=''; $err=''; $start=microtime(true);
 do { $out.=stream_get_contents($pipes[1]); $err.=stream_get_contents($pipes[2]); $s=proc_get_status($proc); if(!$s['running']) break; if(microtime(true)-$start>20) { proc_terminate($proc,9); fclose($pipes[1]); fclose($pipes[2]); proc_close($proc); throw new ApiError(503,'Scoring timeout'); } usleep(10000); }while(true);
 $out.=stream_get_contents($pipes[1]); $err.=stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]); proc_close($proc);
 if($s['exitcode']!==0) throw new ApiError([2=>400,3=>404][$s['exitcode']]??500,json_decode($err,true)['error']['message']??'Scoring unavailable');
 return json_decode($out,true,512,JSON_THROW_ON_ERROR);
}
function features(array $q,?array $files=null): array {
 if(isset($q['kind'])&&!in_array($q['kind'],['landing_site','ice','hazard','science_target'],true)) throw new ApiError(400,'Unknown kind');
 if(isset($q['preset'])) validate(['preset'=>$q['preset']],'score');
 $all=[]; $c=$files===null?db():null;
 if($c) try { foreach($c->query('SELECT properties,geometry FROM features') as $row) $all[]=['type'=>'Feature','properties'=>json_decode($row['properties'],true),'geometry'=>json_decode($row['geometry'],true)]; } catch(Throwable $e) { $c=null; }
 if(!$c) foreach($files??glob(root().'/data/*.geojson') as $file) $all=array_merge($all,readJson($file)['features']);
 return ['type'=>'FeatureCollection','crs_note'=>'Mars 2000 planetocentric, east-positive, degrees','dataset_ids'=>array_values(array_unique(array_column(array_column($all,'properties'),'dataset_id'))),'features'=>array_values(array_filter($all,fn($f)=>(!isset($q['kind'])||$q['kind']===$f['properties']['kind'])&&(!isset($q['preset'])||!$f['properties']['preset_ids']||in_array($q['preset'],$f['properties']['preset_ids'],true))))];
}
function dispatch(string $method,string $path,array $q): array {
 if($method==='GET') switch($path) {
 case '/api/health': return ['status'=>'ok','db'=>db()!==null,'python'=>is_executable('/usr/bin/python3'),'version'=>'0.1.0'];
 case '/api/presets': return readJson(root().'/config/mission_presets.json');
 case '/api/layers': return readJson(root().'/config/layers.json');
 case '/api/features': return features($q);
 case '/api/provenance': return readJson(root().'/data/provenance.json');
 case '/api/environment': $v=validate($q,'score'); return readJson(root().'/data/environment/'.$v['preset'].'.json');
 }
 $cmd=match([$method,$path]) { ['GET','/api/score']=>'score',['GET','/api/score/point']=>'point',['POST','/api/route']=>'route',default=>throw new ApiError(404,'Unknown route') };
 $v=validate($q,$cmd); $c=$cmd==='score'?db():null;
 $files=array_merge(glob(root().'/config/*.json'),[root().'/data/grids/'.$v['preset'].'/manifest.json']);
 $key=hash('sha256',json_encode([$v,array_map(fn($f)=>is_file($f)?filemtime($f):null,$files)]));
 if($c) try { $s=$c->prepare('SELECT payload FROM score_cache WHERE cache_key=?'); $s->execute([$key]); if($hit=$s->fetchColumn()) return json_decode($hit,true); } catch(Throwable $e) { $c=null; }
 $result=scoring($cmd,$v);
 if($c) try { $s=$c->prepare('INSERT INTO score_cache(cache_key,payload) VALUES (?,?::jsonb) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,created_at=now()'); $s->execute([$key,json_encode($result)]); } catch(Throwable $e) { error_log('Cache unavailable'); }
 return $result;
}

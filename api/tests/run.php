<?php
require dirname(__DIR__).'/src/App.php';
function check($v) { if (!$v) throw new RuntimeException('Check failed'); }
check(isset(dispatch('GET','/api/presets',[])['presets']));
check(count(features(['kind'=>'ice'],[__DIR__.'/fixtures/features.geojson'])['features'])===1);
try { dispatch('GET','/unknown',[]); throw new RuntimeException('Expected 404'); } catch(ApiError $e) { check($e->status===404); }
foreach ([['preset'=>'../bad'],['preset'=>'jezero','weights'=>'{"slope":-1}'],['preset'=>'jezero','weights'=>'{"foo":1}']] as $q) {
 try { validate($q,'score'); throw new RuntimeException('Expected validation error'); } catch(ApiError $e) { check($e->status===400); }
}
foreach (['balanced','safety_first','science_first','terrain_first','resource_first'] as $profile) {
 $v=validate(['preset'=>'jezero','profile'=>$profile],'score');
 check($v['profile']===($profile==='resource_first'?'terrain_first':$profile));
}
check(validate(['preset'=>'jezero','weights'=>['slope'=>1,'ice'=>0,'thermal'=>0]],'score')['weights']['ice']===0.0);
foreach (['ice','thermal'] as $f) {
 try { validate(['preset'=>'jezero','weights'=>['slope'=>1,$f=>.1]],'score'); throw new RuntimeException('Expected context weight error'); } catch(ApiError $e) { check($e->status===400); }
}
try { validate(['preset'=>'jezero','profile'=>'unknown'],'score'); throw new RuntimeException('Expected profile error'); } catch(ApiError $e) { check($e->status===400); }
putenv('SCORING_CMD='.json_encode([PHP_BINARY,__DIR__.'/fixtures/fake.php']));
// Weights are canonicalised (relative, sum 1, 2 decimals) so equivalent requests share one cache key.
$w=fn($weights)=>validate(['preset'=>'jezero','weights'=>$weights],'score');
check($w(['slope'=>1,'science'=>1])===$w(['slope'=>2,'science'=>2]));
check($w(['slope'=>1,'science'=>1])['weights']===['base_distance'=>0.0,'ice'=>0.0,'roughness'=>0.0,'science'=>0.5,'slope'=>0.5,'thermal'=>0.0]);
check($w(['slope'=>'1','science'=>'3'])===$w(['slope'=>1,'science'=>3.0]));
check($w('{"slope":"1","science":3}')===$w(['science'=>3,'slope'=>1,'roughness'=>0]));
check($w(['slope'=>0.30001,'science'=>0.7])===$w(['slope'=>0.30002,'science'=>0.7]));
check(cacheKey($w(['slope'=>1,'science'=>1]))===cacheKey($w(['slope'=>2,'science'=>2])));
check(cacheKey($w(['slope'=>1,'science'=>1]))!==cacheKey($w(['slope'=>1,'science'=>2])));
check(cacheKey(['preset'=>'jezero'])!==cacheKey(['preset'=>'gale']));
check(validate(['preset'=>'jezero','weights'=>['slope'=>100]],'score')['weights']['slope']===1.0);
foreach([['slope'=>100.5],['slope'=>1,'science'=>'1e6'],['slope'=>1e308]] as $weights) {
 try { $w($weights); throw new RuntimeException('Expected weight bound error'); } catch(ApiError $e) { check($e->status===400); }
}
[$expire,$cap]=scoreCachePruneSql(200);
check(str_contains($expire,"created_at < now() - interval '1 day'") && str_starts_with($expire,'DELETE FROM score_cache'));
check(str_contains($cap,'ORDER BY created_at DESC') && str_ends_with($cap,'OFFSET 200)') && str_ends_with(scoreCachePruneSql(-5)[1],'OFFSET 0)'));
// Optional: exercise the pruning and cache path against a real PostgreSQL (TEST_DB_DSN, e.g. in CI or a throwaway container).
if(getenv('TEST_DB_DSN')) {
 $pg=new PDO(getenv('TEST_DB_DSN'),getenv('DB_USER')?:'mars',getenv('DB_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
 $pg->exec('DROP TABLE IF EXISTS score_cache'); $pg->exec(file_get_contents(dirname(__DIR__,2).'/docker/postgres/init.sql'));
 foreach([true,false] as $indexed) {
  if(!$indexed) $pg->exec('DROP INDEX score_cache_created_at_idx');
  $pg->exec('TRUNCATE score_cache');
  $pg->exec("INSERT INTO score_cache(cache_key,payload,created_at) SELECT 'k'||i,'{}'::jsonb,now()-i*interval '1 second' FROM generate_series(1,250) i");
  $pg->exec("INSERT INTO score_cache(cache_key,payload,created_at) VALUES ('old','{}'::jsonb,now()-interval '2 days'),('null','{}'::jsonb,NULL)");
  pruneScoreCache($pg,200);
  check((int)$pg->query('SELECT count(*) FROM score_cache')->fetchColumn()===200);
  check($pg->query("SELECT array_agg(cache_key ORDER BY created_at DESC)::text FROM score_cache")->fetchColumn()==='{'.implode(',',array_map(fn($i)=>'k'.$i,range(1,200))).'}');
 }
 // End to end: equivalent weights hit one row; each insert prunes.
 $pg->exec('TRUNCATE score_cache'); $pg->exec("INSERT INTO score_cache(cache_key,payload,created_at) VALUES ('old','{}'::jsonb,now()-interval '2 days')");
 $oldDsn=getenv('DB_DSN'); putenv('DB_DSN='.getenv('TEST_DB_DSN'));
 try {
  dispatch('GET','/api/score',['preset'=>'jezero','weights'=>'{"slope":1,"science":1}']);
  check(dispatch('GET','/api/score',['preset'=>'jezero','weights'=>['slope'=>'2','science'=>2.0]])['type']==='FeatureCollection');
  check($pg->query('SELECT array_agg(cache_key)::text FROM score_cache')->fetchColumn()==='{'.cacheKey($w(['slope'=>1,'science'=>1])).'}');
 } finally { putenv($oldDsn===false?'DB_DSN':'DB_DSN='.$oldDsn); }
 $pg->exec('DROP TABLE score_cache'); echo "API PostgreSQL cache tests passed\n";
}
check(scoring('score',['preset'=>'jezero'])['type']==='FeatureCollection');
foreach ([2=>400,3=>404,1=>500] as $exit=>$status) {
 putenv('FAKE_EXIT='.$exit);
 try { scoring('score',['preset'=>'jezero']); throw new RuntimeException('Expected CLI failure'); } catch(ApiError $e) { check($e->status===$status); }
}
putenv('FAKE_EXIT');
try { validate(['preset'=>'jezero','lon'=>0,'lat'=>0],'point'); throw new RuntimeException('Expected bounds error'); } catch(ApiError $e) { check($e->status===400); }
// Inference uses inclusive bboxes and requires both route endpoints in one region.
foreach([['jezero',77.4508,18.4447],['gale',137.4417,-4.5895],['jezero',77.2,18.25]] as [$id,$lon,$lat]) {
 check(validate(['lon'=>$lon,'lat'=>$lat],'point')['preset']===$id);
 check(validate(['from'=>[$lon,$lat],'to'=>[$lon,$lat]],'route')['preset']===$id);
}
foreach([
 ['point',['lon'=>0,'lat'=>0]],
 ['point',['lon'=>'NaN','lat'=>18.44]],
 ['point',['lat'=>18.44]],
 ['route',['from'=>[77.45,18.44],'to'=>[137.44,-4.59]]],
 ['route',['from'=>[77.45,18.44],'to'=>[0,0]]],
 ['route',['from'=>[77.45,18.44]]],
 ['point',['preset'=>'gale','lon'=>77.45,'lat'=>18.44]],
 ['point',['preset'=>'bad','lon'=>77.45,'lat'=>18.44]],
 ['point',['preset'=>null,'lon'=>77.45,'lat'=>18.44]],
 ['score',[]]
] as [$cmd,$q]) {
 try { validate($q,$cmd); throw new RuntimeException('Expected validation error'); } catch(ApiError $e) { check($e->status===400); }
}
try { validate(['lon'=>0,'lat'=>0],'point'); } catch(ApiError $e) { check(str_contains($e->getMessage(),'Point outside the supported regions: jezero, gale')); }
// Overlapping configured regions cannot silently select the first preset.
$temp=sys_get_temp_dir().'/ares-'.bin2hex(random_bytes(6)); mkdir($temp.'/config',0777,true);
$presets=readJson(root().'/config/mission_presets.json'); $presets['presets'][1]['bbox']=$presets['presets'][0]['bbox'];
file_put_contents($temp.'/config/mission_presets.json',json_encode($presets)); $oldRoot=getenv('CLAUDEMAXXING_ROOT');
try {
 putenv('CLAUDEMAXXING_ROOT='.$temp);
 foreach(['point'=>['lon'=>77.45,'lat'=>18.44],'route'=>['from'=>[77.45,18.44],'to'=>[77.45,18.44]]] as $cmd=>$q) {
  try { validate($q,$cmd); throw new RuntimeException('Expected ambiguous region error'); } catch(ApiError $e) { check($e->status===400); }
 }
} finally { putenv($oldRoot===false?'CLAUDEMAXXING_ROOT':'CLAUDEMAXXING_ROOT='.$oldRoot); unlink($temp.'/config/mission_presets.json'); rmdir($temp.'/config'); rmdir($temp); }
$oldCors=getenv('CORS_ALLOWED_ORIGINS');
putenv('CORS_ALLOWED_ORIGINS'); check(!isset(corsHeaders('https://ares-claudemaxxing.netlify.app')['Access-Control-Allow-Origin']));
putenv('CORS_ALLOWED_ORIGINS= https://ares-claudemaxxing.netlify.app ,https://api.example.com,*');
check(corsHeaders('https://api.example.com')['Access-Control-Allow-Origin']==='https://api.example.com');
foreach([null,'','*','https://evil.example','https://api.example.com.evil','https://api.example.com/'] as $origin) check(!isset(corsHeaders($origin)['Access-Control-Allow-Origin']));
// Exercise the front controller over HTTP, including its JSON error paths.
$socket=stream_socket_server('tcp://127.0.0.1:0',$errno,$error); check($socket!==false);
$address=stream_socket_get_name($socket,false); fclose($socket);
putenv('FAKE_EXIT=1');
$log=tmpfile(); $server=proc_open([PHP_BINARY,'-S',$address,dirname(__DIR__).'/public/index.php'],[['pipe','r'],$log,$log],$pipes);
check(is_resource($server));
try {
 for($i=0;$i<100;$i++) { $ready=@stream_socket_client('tcp://'.$address,$errno,$error,.05); if($ready) { fclose($ready); break; } usleep(20000); }
 foreach([
  ['OPTIONS','/api/route','{',204],
  ['GET','/api/presets','',200],
  ['GET','/api/score/point?lon=0&lat=0','',400],
  ['GET','/missing','',404],
  ['POST','/api/route','{',400],
  ['GET','/api/score/point?lon=77.45&lat=18.44','',500]
 ] as [$method,$path,$body,$status]) {
  $context=stream_context_create(['http'=>['method'=>$method,'header'=>"Origin: https://api.example.com\r\nContent-Type: application/json",'content'=>$body,'ignore_errors'=>true,'timeout'=>10]]);
  $response=file_get_contents('http://'.$address.$path,false,$context);
  check(str_contains($http_response_header[0],' '.$status.' '));
  check(in_array('Access-Control-Allow-Origin: https://api.example.com',$http_response_header,true));
  check(in_array('Vary: Origin',$http_response_header,true));
  check(in_array('Access-Control-Allow-Methods: GET, POST, OPTIONS',$http_response_header,true));
  check(in_array('Access-Control-Allow-Headers: Content-Type',$http_response_header,true));
  check(!str_contains(implode("\n",$http_response_header),'Access-Control-Allow-Credentials'));
  if($status===204) check($response==='');
 }
 $response=file_get_contents('http://'.$address.'/api/presets',false,stream_context_create(['http'=>['header'=>'Origin: https://evil.example']]));
 check(!str_contains(implode("\n",$http_response_header),'Access-Control-Allow-Origin:'));
} finally { putenv('FAKE_EXIT'); proc_terminate($server); fclose($pipes[0]); proc_close($server); fclose($log); putenv($oldCors===false?'CORS_ALLOWED_ORIGINS':'CORS_ALLOWED_ORIGINS='.$oldCors); }
echo "API tests passed\n";

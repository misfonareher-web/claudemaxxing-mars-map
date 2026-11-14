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
check(validate(['preset'=>'jezero','weights'=>['slope'=>1,'ice'=>0,'thermal'=>0]],'score')['weights']['ice']===0);
foreach (['ice','thermal'] as $f) {
 try { validate(['preset'=>'jezero','weights'=>['slope'=>1,$f=>.1]],'score'); throw new RuntimeException('Expected context weight error'); } catch(ApiError $e) { check($e->status===400); }
}
try { validate(['preset'=>'jezero','profile'=>'unknown'],'score'); throw new RuntimeException('Expected profile error'); } catch(ApiError $e) { check($e->status===400); }
putenv('SCORING_CMD='.json_encode([PHP_BINARY,__DIR__.'/fixtures/fake.php']));
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

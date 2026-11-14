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
echo "API tests passed\n";

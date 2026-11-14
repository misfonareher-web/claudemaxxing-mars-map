<?php
require dirname(__DIR__).'/src/App.php';
try {
 $method=$_SERVER['REQUEST_METHOD']; $q=$_GET;
 if($method==='POST') { $body=file_get_contents('php://input',false,null,0,65537); if(strlen($body)>65536) throw new ApiError(400,'Request too large'); $q=json_decode($body,true,512,JSON_THROW_ON_ERROR); if(!is_array($q)||array_is_list($q)) throw new ApiError(400,'Expected JSON object'); }
 $result=dispatch($method,parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH),$q);
 header('Content-Type: '.(isset($result['type'])?'application/geo+json':'application/json').'; charset=utf-8'); echo json_encode($result,JSON_THROW_ON_ERROR);
} catch(Throwable $e) { $status=$e instanceof ApiError?$e->status:($e instanceof JsonException?400:500); http_response_code($status); header('Content-Type: application/json; charset=utf-8'); if($status===500) error_log((string)$e); echo json_encode(['error'=>['code'=>[400=>'bad_request',404=>'not_found',503=>'unavailable'][$status]??'internal','message'=>$status===500?'Internal error':$e->getMessage()]]); }

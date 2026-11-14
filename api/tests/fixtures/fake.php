<?php
if (getenv('FAKE_EXIT')) { fwrite(STDERR,json_encode(['error'=>['message'=>'fixture error']])); exit((int)getenv('FAKE_EXIT')); }
echo file_get_contents(dirname(__DIR__,3).'/contracts/examples/score.example.json');

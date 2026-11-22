<?php
// استاب تشخیصی ۳ — مقایسهٔ ماسک‌شدهٔ DATABASE_URL پروسه با .env + فایل استارت LSNODE؛ خودحذف
header('Content-Type: application/json');
$K = 'wJ4Nf8Qv2Xc6Tk9M';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); exit; }
function sh($c, $t=10){ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); if(!is_resource($p)) return 'proc_open disabled'; stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){ $o.=fread($s,4096);} if(!proc_get_status($p)['running'])break; } proc_close($p); return $o; }
function fields($url) {
    if (!preg_match('#^postgres[a-z]+://([^:/@]+):([^@]*)@([^:/]+):(\d+)/([^?]+)#', $url, $m)) return ['scheme_prefix' => substr($url, 0, 12)];
    return ['user' => $m[1], 'pw_sha1' => sha1($m[2]), 'pw_len' => strlen($m[2]), 'host' => $m[3], 'port' => $m[4], 'db' => $m[5]];
}
$envFile = '/home/epqoisdl/noor-system/.env';
$envDsn = '';
foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $ln) {
    if (strpos($ln, 'DATABASE_URL=') === 0) { $envDsn = trim(substr($ln, 13)); break; }
}
$o = ['env_file_dsn' => fields($envDsn)];
foreach (glob('/proc/[0-9]*/') ?: [] as $pd) {
    $cwd = @readlink($pd . 'cwd');
    if ($cwd && strpos($cwd, 'noor-system') !== false) {
        $env = (string)@file_get_contents($pd . 'environ');
        foreach (explode("\0", $env) as $kv) {
            if (strpos($kv, 'DATABASE_URL=') === 0) $o['proc_dsn'] = fields(substr($kv, 13));
            if (strpos($kv, 'LSNODE_STARTUP_FILE=') === 0) $o['lsnode_startup'] = substr($kv, 20);
            if (strpos($kv, 'CL_APP_ROOT=') === 0) $o['cl_app_root'] = substr($kv, 12);
        }
        break;
    }
}
$o['dsd_equal'] = isset($o['proc_dsn']) ? ($o['env_file_dsn'] == $o['proc_dsn']) : null;
$o['df'] = trim(sh("df -h /home/epqoisdl 2>&1 | tail -1", 5));
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);

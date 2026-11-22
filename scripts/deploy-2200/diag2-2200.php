<?php
// استاب تشخیصی ۲ — پروسهٔ next-server: cmdline/cwd/environ(فقط کلیدها)/wrapper؛ خودحذف
header('Content-Type: application/json');
$K = 'tR9Xm4Kp7Vb2Nw6Q';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); exit; }
function sh($c, $t=10){ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); if(!is_resource($p)) return 'proc_open disabled'; stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){ $o.=fread($s,4096);} if(!proc_get_status($p)['running'])break; } proc_close($p); return $o; }
$o = [];
$found = [];
foreach (glob('/proc/[0-9]*/') ?: [] as $pd) {
    $cwd = @readlink($pd . 'cwd');
    if ($cwd && strpos($cwd, '/noor-system') !== false) {
        $comm = @file_get_contents($pd . 'comm');
        $pid = basename(rtrim($pd, '/'));
        $found[] = ['pid' => $pid, 'comm' => trim((string)$comm), 'cwd' => $cwd,
                    'cmdline' => str_replace("\0", ' ', (string)@file_get_contents($pd . 'cmdline'))];
        $env = (string)@file_get_contents($pd . 'environ');
        $keys = [];
        $hasDb = false; $dbHost = null;
        foreach (explode("\0", $env) as $kv) {
            if ($kv === '') continue;
            $eq = strpos($kv, '=');
            if ($eq === false) continue;
            $k = substr($kv, 0, $eq);
            $keys[] = $k;
            if ($k === 'DATABASE_URL') { $hasDb = true; $dbHost = substr($kv, 0, 22); }
        }
        $found[0]['env_keys'] = $keys;
        $found[0]['has_DATABASE_URL'] = $hasDb;
        $found[0]['db_url_prefix'] = $dbHost;
        break;
    }
}
$o['procs'] = $found;
$w = '/home/epqoisdl/noor-system/server.js';
$o['wrapper_md5'] = is_file($w) ? md5_file($w) : 'missing';
$o['wrapper_head'] = is_file($w) ? substr((string)file_get_contents($w), 0, 300) : '';
$o['app_ls'] = array_slice(explode("\n", trim(sh("ls -a /home/epqoisdl/noor-system 2>&1 | head -30", 8))), 0, 30);
$o['env_keys'] = [];
foreach (file('/home/epqoisdl/noor-system/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $ln) {
    $eq = strpos($ln, '=');
    if ($eq > 0 && $ln[0] !== '#') $o['env_keys'][] = substr($ln, 0, $eq);
}
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);

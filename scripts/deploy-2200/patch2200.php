<?php
// استاب پچ ۲.۲۲۰.۰ — لودرهای env در wrapper و standalone: مقدار .env باید بر
// تزریق exec-time LiteSpeed غلبه کند (skip-rule → override)؛ سپس ری‌استارت؛ خودحذف
header('Content-Type: application/json');
$K = 'mC8Rv3Yn5Zb7Pd1W';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); exit; }
function sh($c, $t=12){ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); if(!is_resource($p)) return 'proc_open disabled'; stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){ $o.=fread($s,4096);} if(!proc_get_status($p)['running'])break; } proc_close($p); return $o; }
$H = '/home/epqoisdl';
$files = [$H . '/noor-system/server.js', $H . '/noor-system/.next/standalone/server.js'];
$o = [];
foreach ($files as $f) {
    if (!is_file($f)) { $o[basename(dirname($f)) . '/' . basename($f)] = 'missing'; continue; }
    $c = (string)file_get_contents($f);
    @copy($f, $f . '.prepatch-2200');
    $n = str_replace('process.env[m[1]] === undefined', 'true', $c, $cnt);
    if ($cnt > 0 && @file_put_contents($f, $n) !== false) {
        $o[basename(dirname($f)) . '/' . basename($f)] = ['patched' => $cnt, 'md5_after' => md5_file($f), 'size' => filesize($f)];
    } else {
        $o[basename(dirname($f)) . '/' . basename($f)] = ['patched' => 0, 'error' => 'write-fail-or-no-match', 'md5' => md5_file($f)];
    }
}
$cmd = "for p in /proc/[0-9]*/; do cwd=\$(readlink \${p}cwd 2>/dev/null); case \"\$cwd\" in */noor-system*) comm=\$(cat \${p}comm 2>/dev/null); case \"\$comm\" in next-server*) kill -9 \$(basename \$p) 2>/dev/null && echo \"killed \$(basename \$p)\";; esac;; esac; done";
$o['kill'] = trim((string)sh($cmd, 12));
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);

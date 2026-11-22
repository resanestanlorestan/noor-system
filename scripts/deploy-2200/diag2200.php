<?php
// استاب تشخیصی دیتابیس ۲.۲۲۰.۰ — بدون چاپ گذرواژه؛ خودحذف
header('Content-Type: application/json');
$K = 'dG5Qw8Zk3Lr7Yc1H';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); exit; }
function sh($c, $t=10){ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); if(!is_resource($p)) return 'proc_open disabled'; stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){ $o.=fread($s,4096);} if(!proc_get_status($p)['running'])break; } proc_close($p); return $o; }
$o = [];
$envFile = '/home/epqoisdl/noor-system/.env';
$dsn = '';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $ln) {
        if (strpos($ln, 'DATABASE_URL=') === 0) { $dsn = trim(substr($ln, 13)); break; }
    }
}
$m = preg_match('#^[a-z]+://([^:/@]+):([^@]*)@([^:/]+):(\d+)/(.+)$#', $dsn, $mm);
$o['dsn'] = $m ? ['scheme' => strtok($dsn, ':'), 'user' => $mm[1], 'host' => $mm[3], 'port' => $mm[4], 'db' => $mm[5]] : 'parse-fail len=' . strlen($dsn);
if ($m) {
    $user = $mm[1]; $pass = $mm[2]; $host = $mm[3]; $port = $mm[4]; $db = $mm[5];
    try {
        $pdo = new PDO("pgsql:host={$host};port={$port};dbname={$db}", $user, $pass, [PDO::ATTR_TIMEOUT => 8, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $q = $pdo->query('select count(*) from app_users');
        $o['pdo'] = ['ok' => true, 'app_users' => (int)$q->fetchColumn()];
        $v = $pdo->query('select version()')->fetchColumn();
        $o['pdo']['server'] = substr((string)$v, 0, 40);
    } catch (Throwable $e) {
        $o['pdo'] = ['ok' => false, 'error' => $e->getMessage()];
    }
} else {
    $o['pdo'] = ['ok' => false, 'error' => 'dsn parse fail'];
}
$o['procs'] = trim(sh("ps aux 2>/dev/null | grep -E 'postgres|next-server' | grep -v grep | awk '{print \\$11, \\$12, \\$13}' | head -6", 8));
$o['pg_isready'] = trim(sh("pg_isready -h 127.0.0.1 -p 5432 2>&1 || pg_isready -h {$o['dsn']['host']} -p {$o['dsn']['port']} 2>&1", 8));
$o['df'] = trim(sh("df -h /home/epqoisdl 2>&1 | tail -1", 5));
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);

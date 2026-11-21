<?php
// استاب یک‌بارمصرف ۲.۱۹.۰ — افزودن Job کرون کلاس‌ها به crontab؛ بلافاصله پس از وریفای حذف می‌شود.
// توکن فقط به‌صورت SHA-256 در این فایل ذخیره شده است. اجرای دستور با proc_open (shell_exec روی این هاست معطل است).
$t = $_GET['t'] ?? '';
$expected = 'fe4104b10500092d66611242070d9c9fc75439e3209747b875482d9554423a8f';
if (!hash_equals($expected, hash('sha256', $t))) { http_response_code(404); echo 'not found'; exit; }
function sh($c, $t=15){ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){ $o.=fread($s,4096);} if(!proc_get_status($p)['running'])break; } proc_close($p); return $o; }

$entry = '23 * * * * /bin/bash /home/epqoisdl/classes-cron.sh >/dev/null 2>&1';
$count = trim(sh('crontab -l 2>/dev/null | grep -c "classes-cron.sh"'));
if ($count !== '0') {
    echo "ALREADY_PRESENT($count)\n";
} else {
    sh("(crontab -l 2>/dev/null; echo '23 * * * * /bin/bash /home/epqoisdl/classes-cron.sh >/dev/null 2>&1') | crontab -");
    echo "ADD_RC: " . trim(sh('crontab -l 2>/dev/null | grep -c "classes-cron.sh"')) . "\n";
}
echo "---crontab(classes)---\n" . sh('crontab -l 2>/dev/null | grep "classes-cron.sh"');
echo "---test-run---\n" . substr(sh('/bin/bash /home/epqoisdl/classes-cron.sh', 45), 0, 300) . "\n";
echo "---log---\n" . substr(sh('tail -2 /home/epqoisdl/classes-cron.log 2>/dev/null'), 0, 300);

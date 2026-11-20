<?php
// گیرندهٔ تکه‌های zip ۲.۱۸.۷ — الگوی rc2186.php + گیت توکن ساده (k=)
header('Content-Type: application/json');
$K = '__TOKEN__';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); echo '{"error":"bad token"}'; exit; }
$T = '/home/epqoisdl/noor-slim-2.19.0.zip';
$S = '/home/epqoisdl/public_html/.up2187.json';
$state = @file_exists($S) ? json_decode(@file_get_contents($S), true) : ['received' => 0, 'bytes' => 0];
if (isset($_GET['status'])) { echo json_encode($state); exit; }
if (isset($_GET['reset'])) { @unlink($T); @unlink($S); echo '{"reset":true}'; exit; }
$in = json_decode(@file_get_contents('php://input'), true);
if (!$in || !isset($in['seq'], $in['b64'])) { echo json_encode(['error' => 'bad body']); exit; }
$raw = base64_decode($in['b64'], true);
if ($raw === false) { echo json_encode(['error' => 'bad b64', 'seq' => $in['seq']]); exit; }
if ((int)$in['seq'] !== (int)($state['received'] ?? 0) + 1) { echo json_encode(['error' => 'seq out of order', 'expected' => ($state['received'] ?? 0) + 1, 'got' => $in['seq']]); exit; }
$ok = @file_put_contents($T, $raw, FILE_APPEND);
if ($ok === false) { echo json_encode(['error' => 'write failed', 'seq' => $in['seq']]); exit; }
$state['received'] = (int)$in['seq'];
$state['bytes'] = (int)$state['bytes'] + strlen($raw);
@file_put_contents($S, json_encode($state));
echo json_encode($state);

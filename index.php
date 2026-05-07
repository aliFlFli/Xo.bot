<?php
require_once 'vendor/autoload.php';

use EFive\Bale\Api;

// توکن رباتت رو اینجا بذار
$token = "1883321723:4moQIWyjqy-pHE9f0MYcDkiOLrg3CtVsvU4";

$bale = new Api($token);

// اگه ربات پیغام دریافت کرد
$update = json_decode(file_get_contents('php://input'), true);

if (isset($update['message'])) {
    $chat_id = $update['message']['chat']['id'];
    $text = $update['message']['text'];
    
    // فقط یه پیغام ساده برگردون
    $response = $bale->sendMessage([
        'chat_id' => $chat_id,
        'text' => "سلام! ربات تست کار می‌کنه. پیغام شما: " . $text
    ]);
}
?>

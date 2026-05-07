const { BaleBot } = require('node-bale-sdk');
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const bot = new BaleBot(token);

console.log('🤖 ربات در حال روشن شدن...');

// وقتی ربات آماده شد
bot.on('ready', () => {
    console.log('✅ ربات با موفقیت روشن شد!');
    console.log('📡 منتظر پیام‌ها هستم...');
});

// وقتی پیام میاد
bot.on('message', (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.text;
    
    console.log(`📩 پیام جدید از ${chatId}: ${text}`);
    
    // فقط یه جواب ساده برگردون
    bot.sendMessage(chatId, `سلام! پیام شما رسید: ${text}`);
});

// اگه خطایی پیش اومد
bot.on('error', (err) => {
    console.error('❌ خطا:', err);
});

// استارت ربات
bot.start()
    .then(() => console.log('🚀 ربات استارت خورد!'))
    .catch(console.error);

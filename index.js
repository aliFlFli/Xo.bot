const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;

console.log('🤖 ربات در حال راه‌اندازی...');

// دریافت پیام‌ها با روش Polling
let lastUpdateId = 0;

async function getUpdates() {
    try {
        const response = await axios.post(`${API_URL}/getUpdates`, {
            offset: lastUpdateId + 1,
            timeout: 30
        });
        
        for (const update of response.data.result) {
            lastUpdateId = update.update_id;
            
            if (update.message && update.message.text) {
                const chatId = update.message.chat.id;
                const text = update.message.text;
                
                console.log(`📩 پیام از ${chatId}: ${text}`);
                
                await axios.post(`${API_URL}/sendMessage`, {
                    chat_id: chatId,
                    text: `✅ شما گفتید: ${text}`
                });
            }
        }
    } catch (error) {
        console.error('خطا:', error.message);
    }
}

// هر ۱ ثانیه یک بار چک کن
setInterval(getUpdates, 1000);

// برای اینکه Railway خوابش نبره
app.get('/', (req, res) => res.send('ربات آنلاین است'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ ربات روی پورت ${PORT} روشن شد!`);
    console.log('🚀 آماده دریافت پیام است...');
});

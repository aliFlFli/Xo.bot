const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;

console.log('🤖 ربات در حال راه‌اندازی...');

app.post('/webhook', async (req, res) => {
    try {
        const message = req.body.message;
        if (message && message.text) {
            const chatId = message.chat.id;
            const text = message.text;
            
            console.log(`📩 پیام دریافت شد: ${text}`);
            
            await axios.post(`${API_URL}/sendMessage`, {
                chat_id: chatId,
                text: `✅ پیام شما رسید: ${text}`
            });
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('❌ خطا:', error.message);
        res.sendStatus(500);
    }
});

app.get('/', (req, res) => {
    res.send('🤖 ربات آنلاین است!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ ربات روی پورت ${PORT} راه‌اندازی شد!`);
    console.log(`📡 آدرس وب‌هوک: https://your-app.railway.app/webhook`);
});

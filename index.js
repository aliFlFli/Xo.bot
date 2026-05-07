const axios = require('axios');
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;

console.log('🤖 ربات در حال روشن شدن...');

// Webhook receiver
app.post('/webhook', async (req, res) => {
    const message = req.body.message;
    if (message && message.text) {
        const chatId = message.chat.id;
        const text = message.text;
        
        console.log(`📩 پیام: ${text}`);
        
        // پاسخ دادن
        await axios.post(`${API_URL}/sendMessage`, {
            chat_id: chatId,
            text: `سلام! شما گفتید: ${text}`
        });
    }
    res.sendStatus(200);
});

// Keep alive
app.get('/', (req, res) => res.send('Bot is alive'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ ربات روی پورت ${PORT} روشن شد!`);
});

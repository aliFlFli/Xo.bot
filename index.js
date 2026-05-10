require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();

app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;

const API = `https://botapi.bale.ai/bot${TOKEN}`;

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Running');
});

async function sendMessage(chatId, text) {

    try {

        await axios.post(`${API}/sendMessage`, {
            chat_id: chatId,
            text
        });

    } catch (err) {

        console.log(err.response?.data || err.message);
    }
}

app.post('/', async (req, res) => {

    res.sendStatus(200);

    try {

        console.log(JSON.stringify(req.body, null, 2));

        const update = req.body;

        if (update.message) {

            const msg = update.message;

            const chatId = msg.chat.id;

            const text =
                msg.text ||
                msg.body ||
                '';

            if (text === '/start') {

                await sendMessage(
                    chatId,
                    '🎮 ربات روشنه'
                );
            }
        }

    } catch (err) {

        console.log(err.message);
    }
});

app.listen(PORT, () => {

    console.log(`Running on ${PORT}`);
});

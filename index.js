require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();

app.use(express.json());

// =========================
// CONFIG
// =========================

const TOKEN = process.env.BALE_TOKEN;

const API = `https://tapi.bale.ai/bot${TOKEN}`;

const PORT = process.env.PORT || 3000;

// =========================
// SEND MESSAGE
// =========================

async function sendMessage(chatId, text, keyboard = null) {
  try {
    const payload = {
      chat_id: chatId,
      text
    };

    if (keyboard) {
      payload.reply_markup = {
        inline_keyboard: keyboard
      };
    }

    await axios.post(`${API}/sendMessage`, payload);

  } catch (err) {
    console.log('SEND ERROR:', err.response?.data || err.message);
  }
}

// =========================
// START COMMAND
// =========================

async function handleStart(chatId) {
  await sendMessage(
    chatId,
    'سلام 👋\nربات تست بله با موفقیت اجرا شد.',
    [
      [
        {
          text: '🎮 تست دکمه',
          callback_data: 'test_button'
        }
      ]
    ]
  );
}

// =========================
// CALLBACK HANDLER
// =========================

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const data = callback.data;

  if (data === 'test_button') {
    await sendMessage(chatId, '✅ دکمه با موفقیت کار کرد!');
  }
}

// =========================
// WEBHOOK
// =========================

app.post('/webhook', async (req, res) => {

  const update = req.body;

  console.log(JSON.stringify(update, null, 2));

  try {

    // =====================
    // MESSAGE
    // =====================

    if (update.message) {

      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === '/start') {
        await handleStart(chatId);
      } else {
        await sendMessage(chatId, `📩 پیام شما:\n${text}`);
      }
    }

    // =====================
    // CALLBACK QUERY
    // =====================

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    }

  } catch (err) {
    console.log('WEBHOOK ERROR:', err.message);
  }

  res.sendStatus(200);
});

// =========================
// ROOT
// =========================

app.get('/', (req, res) => {
  res.send('Bale Bot Running ✅');
});

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

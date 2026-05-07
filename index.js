require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// =========================
// CONFIG
// =========================

const TOKEN = process.env.BALE_TOKEN;
const PORT = process.env.PORT || 3000;

// مهم: Railway URL
const BASE_URL = process.env.BASE_URL; 
// مثلا: https://your-app.up.railway.app

const API = `https://tapi.bale.ai/bot${TOKEN}`;
const WEBHOOK_PATH = '/webhook';

// =========================
// ERROR HANDLING (خیلی مهم)
// =========================

process.on('uncaughtException', (err) => {
  console.log('🔥 CRASH:', err);
});

process.on('unhandledRejection', (err) => {
  console.log('🔥 PROMISE ERROR:', err);
});

// =========================
// SEND MESSAGE
// =========================

async function sendMessage(chatId, text, keyboard = null) {
  try {
    const payload = { chat_id: chatId, text };

    if (keyboard) {
      payload.reply_markup = { inline_keyboard: keyboard };
    }

    await axios.post(`${API}/sendMessage`, payload);

  } catch (err) {
    console.log('SEND ERROR:', err.response?.data || err.message);
  }
}

// =========================
// START HANDLER
// =========================

async function handleStart(chatId) {
  await sendMessage(
    chatId,
    'سلام 👋\nربات بله با موفقیت اجرا شد 🚀',
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
// CALLBACK
// =========================

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const data = callback.data;

  if (data === 'test_button') {
    await sendMessage(chatId, '✅ دکمه کار کرد!');
  }
}

// =========================
// WEBHOOK ENDPOINT
// =========================

app.post(WEBHOOK_PATH, async (req, res) => {
  const update = req.body;

  try {
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === '/start') {
        await handleStart(chatId);
      } else {
        await sendMessage(chatId, `📩 پیام شما:\n${text}`);
      }
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    }

  } catch (err) {
    console.log('WEBHOOK ERROR:', err.message);
  }

  res.sendStatus(200);
});

// =========================
// HEALTH CHECK
// =========================

app.get('/', (req, res) => {
  res.send('🤖 Bale Bot Running OK');
});

// =========================
// SET WEBHOOK AUTOMATIC
// =========================

async function setWebhook() {
  try {
    const url = `${BASE_URL}${WEBHOOK_PATH}`;

    const res = await axios.post(`${API}/setWebhook`, {
      url
    });

    console.log('✅ Webhook set:', res.data);

  } catch (err) {
    console.log('❌ Webhook error:', err.response?.data || err.message);
  }
}

// =========================
// START SERVER
// =========================

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  if (!BASE_URL) {
    console.log('⚠️ BASE_URL is not set!');
  } else {
    await setWebhook();
  }
});

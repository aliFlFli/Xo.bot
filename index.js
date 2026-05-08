require('dotenv').config();

const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

// ================= CONFIG =================

const TOKEN = process.env.BOT_TOKEN;
const API = `https://tapi.bale.ai/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;

// ================= DB =================

const db = new Database('bot.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  coins INTEGER DEFAULT 100,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0
)
`).run();

// ================= USER =================

function getUser(id) {
  let user = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);

  if (!user) {
    db.prepare(`INSERT INTO users (id) VALUES (?)`).run(id);
    user = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
  }

  return user;
}

// ================= UI =================

function mainMenu() {
  return {
    inline_keyboard: [
      [
        { text: '🎮 بازی جدید', callback_data: 'new_game' }
      ],
      [
        { text: '💰 کیف پول', callback_data: 'wallet' },
        { text: '📊 آمار', callback_data: 'stats' }
      ]
    ]
  };
}

// ================= SEND =================

async function sendMessage(chat_id, text, keyboard = null) {
  try {
    await axios.post(`${API}/sendMessage`, {
      chat_id,
      text,
      reply_markup: keyboard
    });
  } catch (e) {
    console.log("SEND ERROR:", e.message);
  }
}

async function editMessage(chat_id, message_id, text, keyboard = null) {
  try {
    await axios.post(`${API}/editMessageText`, {
      chat_id,
      message_id,
      text,
      reply_markup: keyboard
    });
  } catch (e) {}
}

// ================= WEBHOOK =================

app.post('/webhook', async (req, res) => {

  res.sendStatus(200); // خیلی مهم

  const update = req.body;

  try {

    // ================= START =================
    if (update.message && update.message.text === '/start') {

      const user = getUser(update.message.from.id);

      return sendMessage(
        update.message.chat.id,
        `🎮 ربات مین‌روب حرفه‌ای

💰 سکه: ${user.coins}
🏆 برد: ${user.wins}
💀 باخت: ${user.losses}`,
        mainMenu()
      );
    }

    // ================= CALLBACK =================
    if (update.callback_query) {

      const cb = update.callback_query;
      const data = cb.data;

      const chatId = cb.message.chat.id;
      const msgId = cb.message.message_id;

      const user = getUser(cb.from.id);

      // WALLET
      if (data === 'wallet') {
        return editMessage(
          chatId,
          msgId,
          `💰 موجودی شما:

${user.coins} سکه 🪙`,
          mainMenu()
        );
      }

      // STATS
      if (data === 'stats') {
        return editMessage(
          chatId,
          msgId,
          `📊 آمار شما:

🏆 برد: ${user.wins}
💀 باخت: ${user.losses}`,
          mainMenu()
        );
      }

      // NEW GAME
      if (data === 'new_game') {
        return editMessage(
          chatId,
          msgId,
          `🎮 بازی هنوز کامل اضافه نشده 😄

در نسخه بعدی فعال میشه`,
          mainMenu()
        );
      }
    }

  } catch (e) {
    console.log("ERROR:", e.message);
  }
});

// ================= HEALTH =================

app.get('/', (req, res) => {
  res.send('OK');
});

// ================= START =================

app.listen(PORT, async () => {

  console.log("🚀 Server Running On", PORT);

  try {
    await axios.get(`${API}/setWebhook`, {
      params: {
        url: `${process.env.WEBHOOK_URL}/webhook`
      }
    });

    console.log("✅ Webhook Set");
  } catch (e) {
    console.log("❌ Webhook Error:", e.message);
  }
});

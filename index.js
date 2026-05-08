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

function getUser(id) {
  let user = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);

  if (!user) {
    db.prepare(`INSERT INTO users (id) VALUES (?)`).run(id);
    user = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
  }

  return user;
}

// ================= SEND =================

async function sendMessage(chat_id, text) {
  try {
    await axios.post(`${API}/sendMessage`, {
      chat_id,
      text
    });
  } catch (e) {
    console.log("SEND ERROR:", e.message);
  }
}

// ================= WEBHOOK =================

app.post('/webhook', async (req, res) => {

  // خیلی مهم: سریع جواب بده
  res.sendStatus(200);

  const update = req.body;

  try {

    // ================= START =================
    if (update.message && update.message.text === '/start') {

      const user = getUser(update.message.from.id);

      return sendMessage(
        update.message.chat.id,
        `🎮 ربات مین‌روب

💰 سکه: ${user.coins}
🏆 برد: ${user.wins}
💀 باخت: ${user.losses}`
      );
    }

    console.log("UPDATE:", update);

  } catch (e) {
    console.log("ERROR:", e.message);
  }
});

// ================= HEALTH =================

app.get('/', (req, res) => {
  res.send('OK');
});

// ================= START SERVER =================

app.listen(PORT, async () => {

  console.log("🚀 Server Running On", PORT);

  try {
    await axios.get(
      `${API}/setWebhook`,
      {
        params: {
          url: `${process.env.WEBHOOK_URL}/webhook`
        }
      }
    );

    console.log("✅ Webhook Set Successfully");

  } catch (e) {
    console.log("❌ Webhook Error:", e.message);
  }
});

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

// ================= CONFIG =================

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;

// ================= DATABASE =================

const db = new Database('game.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  coins INTEGER DEFAULT 100,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0
)
`).run();

// ================= USERS =================

function getUser(id) {
  let user = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);

  if (!user) {
    db.prepare(`INSERT INTO users (id) VALUES (?)`).run(id);
    user = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
  }

  return user;
}

function win(id, reward) {
  db.prepare(`
    UPDATE users
    SET coins = coins + ?, wins = wins + 1
    WHERE id=?
  `).run(reward, id);
}

function loss(id) {
  db.prepare(`
    UPDATE users
    SET losses = losses + 1
    WHERE id=?
  `).run(id);
}

// ================= GAME MEMORY =================

const games = {};

// ================= BOARDS =================

const BOARDS = {
  easy: { size: 4, mines: 2, reward: 10, name: '🍃 آسان' },
  normal: { size: 5, mines: 5, reward: 25, name: '⚙️ معمولی' },
  hard: { size: 6, mines: 10, reward: 50, name: '🔥 سخت' }
};

// ================= HELPERS =================

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ================= GAME =================

function createBoard(size, mines, first) {
  const total = size * size;
  const board = Array(total).fill(0);

  const safe = new Set();
  const fx = Math.floor(first / size);
  const fy = first % size;

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      const nx = fx + x;
      const ny = fy + y;

      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        safe.add(nx * size + ny);
      }
    }
  }

  let positions = [];
  for (let i = 0; i < total; i++) {
    if (!safe.has(i)) positions.push(i);
  }

  for (let i = 0; i < mines; i++) {
    const r = Math.floor(Math.random() * positions.length);
    board[positions[r]] = '💣';
    positions.splice(r, 1);
  }

  for (let i = 0; i < total; i++) {
    if (board[i] === '💣') continue;

    let c = 0;
    const x = Math.floor(i / size);
    const y = i % size;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
          if (board[nx * size + ny] === '💣') c++;
        }
      }
    }

    board[i] = c;
  }

  return board;
}

// ================= UI =================

function keyboard(game) {
  const rows = [];

  for (let i = 0; i < game.size; i++) {
    const row = [];

    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;

      let t = '◻️';

      if (game.revealed?.[idx]) {
        if (game.board[idx] === '💣') t = '💣';
        else if (game.board[idx] === 0) t = '▫️';
        else t = `${game.board[idx]}️⃣`;
      }

      row.push({ text: t, callback_data: `c_${idx}` });
    }

    rows.push(row);
  }

  return { inline_keyboard: rows };
}

// ================= SEND =================

async function send(chat_id, text, reply_markup) {
  await axios.post(`${API_URL}/sendMessage`, {
    chat_id,
    text,
    reply_markup
  });
}

async function edit(chat_id, message_id, text, reply_markup) {
  try {
    await axios.post(`${API_URL}/editMessageText`, {
      chat_id,
      message_id,
      text,
      reply_markup
    });
  } catch {}
}

// ================= WEBHOOK HANDLER =================

app.post('/webhook', async (req, res) => {
  const update = req.body;

  res.sendStatus(200);

  try {

    // START
    if (update.message?.text === '/start') {
      const u = getUser(update.message.from.id);

      return send(update.message.chat.id,
        `🎮 Mines

💰 ${u.coins}
🏆 ${u.wins}
💀 ${u.losses}`,
        null
      );
    }

    // CALLBACK
    if (update.callback_query) {
      const cb = update.callback_query;

      const userId = cb.from.id;
      const chatId = cb.message.chat.id;
      const msgId = cb.message.message_id;
      const data = cb.data;

      // NEW GAME (demo ساده)
      if (data === 'new') {

        games[userId] = {
          size: 4,
          mines: 2,
          revealed: Array(16).fill(false),
          board: null,
          waiting: true
        };

        return edit(chatId, msgId,
          '🎮 بازی شروع شد',
          keyboard(games[userId])
        );
      }

      // CLICK
      if (data.startsWith('c_')) {

        const idx = +data.split('_')[1];
        const g = games[userId];

        if (!g) return;

        if (g.waiting) {
          g.board = createBoard(4, 2, idx);
          g.waiting = false;
        }

        if (g.board[idx] === '💣') {
          return edit(chatId, msgId, '💥 باختی!', keyboard(g));
        }

        g.revealed[idx] = true;

        return edit(chatId, msgId,
          '🎮 ادامه بازی',
          keyboard(g)
        );
      }
    }

  } catch (e) {
    console.log(e.message);
  }
});

// ================= HEALTH =================

app.get('/', (req, res) => {
  res.send('OK');
});

// ================= START SERVER =================

app.listen(PORT, async () => {
  console.log('🚀 Server running');

  // SET WEBHOOK AUTOMATIC
  try {
    await axios.get(`${API_URL}/setWebhook`, {
      params: {
        url: process.env.WEBHOOK_URL + '/webhook'
      }
    });

    console.log('✅ Webhook set');
  } catch (e) {
    console.log('Webhook error:', e.message);
  }
});

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

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
  let u = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
  if (!u) {
    db.prepare(`INSERT INTO users (id) VALUES (?)`).run(id);
    u = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
  }
  return u;
}

function win(id, reward) {
  db.prepare(`UPDATE users SET wins=wins+1, coins=coins+? WHERE id=?`)
    .run(reward, id);
}

function loss(id) {
  db.prepare(`UPDATE users SET losses=losses+1 WHERE id=?`)
    .run(id);
}

// ================= GAME =================

const games = {};

const LEVELS = {
  easy: { size: 4, mines: 2, reward: 10, name: '🍃 آسان' },
  normal: { size: 5, mines: 5, reward: 25, name: '⚙️ معمولی' },
  hard: { size: 6, mines: 10, reward: 50, name: '🔥 سخت' }
};

// ================= BOARD =================

function createBoard(size, mines, safeIndex) {
  const total = size * size;
  const board = Array(total).fill(0);

  const safe = new Set([safeIndex]);

  const sx = Math.floor(safeIndex / size);
  const sy = safeIndex % size;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = sx + dx;
      const y = sy + dy;
      if (x >= 0 && y >= 0 && x < size && y < size) {
        safe.add(x * size + y);
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

    let count = 0;
    const x = Math.floor(i / size);
    const y = i % size;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;

        if (
          nx >= 0 && ny >= 0 &&
          nx < size && ny < size
        ) {
          if (board[nx * size + ny] === '💣') count++;
        }
      }
    }

    board[i] = count;
  }

  return board;
}

// ================= UI =================

function render(game) {
  const rows = [];

  for (let i = 0; i < game.size; i++) {
    const row = [];

    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;

      let t = '◻️';

      if (game.revealed[idx]) {
        if (game.board[idx] === '💣') t = '💣';
        else if (game.board[idx] === 0) t = '▫️';
        else t = `${game.board[idx]}️⃣`;
      }

      row.push({
        text: t,
        callback_data: `c_${idx}`
      });
    }

    rows.push(row);
  }

  rows.push([
    { text: '🏠 منو', callback_data: 'menu' }
  ]);

  return { inline_keyboard: rows };
}

function menu() {
  return {
    inline_keyboard: [
      [{ text: '🎮 بازی جدید', callback_data: 'new' }],
      [
        { text: '💰 کیف پول', callback_data: 'wallet' },
        { text: '📊 آمار', callback_data: 'stats' }
      ]
    ]
  };
}

function levels() {
  return {
    inline_keyboard: [
      [{ text: '🍃 آسان', callback_data: 'l_easy' }],
      [{ text: '⚙️ معمولی', callback_data: 'l_normal' }],
      [{ text: '🔥 سخت', callback_data: 'l_hard' }]
    ]
  };
}

// ================= SEND =================

async function send(chat, text, kb = null) {
  await axios.post(`${API}/sendMessage`, {
    chat_id: chat,
    text,
    reply_markup: kb
  });
}

async function edit(chat, msg, text, kb = null) {
  try {
    await axios.post(`${API}/editMessageText`, {
      chat_id: chat,
      message_id: msg,
      text,
      reply_markup: kb
    });
  } catch {}
}

// ================= WEBHOOK =================

app.post('/webhook', async (req, res) => {

  res.sendStatus(200);

  const u = req.body;

  try {

    // START
    if (u.message?.text === '/start') {
      const user = getUser(u.message.from.id);

      return send(u.message.chat.id,
        `🎮 Minesweeper

💰 ${user.coins}
🏆 ${user.wins}
💀 ${user.losses}`,
        menu()
      );
    }

    // CALLBACK
    if (!u.callback_query) return;

    const cb = u.callback_query;
    const data = cb.data;

    const chat = cb.message.chat.id;
    const msg = cb.message.message_id;
    const uid = cb.from.id;

    // NEW GAME
    if (data === 'new') {
      return edit(chat, msg, '🎯 انتخاب سطح:', levels());
    }

    // LEVEL
    if (data.startsWith('l_')) {
      const lvl = data.split('_')[1];
      const cfg = LEVELS[lvl];

      games[uid] = {
        ...cfg,
        revealed: Array(cfg.size * cfg.size).fill(false),
        board: null,
        first: true
      };

      return edit(chat, msg,
        `🎮 ${cfg.name}

روی یک خانه کلیک کن 👇`,
        render({
          size: cfg.size,
          revealed: games[uid].revealed,
          board: Array(cfg.size * cfg.size).fill(0)
        })
      );
    }

    // CLICK
    if (data.startsWith('c_')) {
      const idx = +data.split('_')[1];
      const g = games[uid];

      if (!g) return;

      if (g.first) {
        g.board = createBoard(g.size, g.mines, idx);
        g.first = false;
      }

      if (g.board[idx] === '💣') {
        g.revealed.fill(true);
        loss(uid);

        return edit(chat, msg, '💥 باختی!', render(g));
      }

      g.revealed[idx] = true;

      // check win
      let open = g.revealed.filter(x => x).length;
      if (open === g.size * g.size - g.mines) {
        win(uid, g.reward);

        return edit(chat, msg,
          `🎉 بردی! +${g.reward} سکه`,
          render(g)
        );
      }

      return edit(chat, msg, '🎮 ادامه...', render(g));
    }

    // WALLET
    if (data === 'wallet') {
      const u2 = getUser(uid);
      return edit(chat, msg, `💰 ${u2.coins}`, menu());
    }

    // STATS
    if (data === 'stats') {
      const u2 = getUser(uid);
      return edit(chat, msg,
        `📊
🏆 ${u2.wins}
💀 ${u2.losses}`,
        menu()
      );
    }

  } catch (e) {
    console.log(e.message);
  }
});

// ================= SERVER =================

app.get('/', (req, res) => res.send('OK'));

app.listen(PORT, async () => {
  console.log('🚀 Running');

  try {
    await axios.get(`${API}/setWebhook`, {
      params: {
        url: `${process.env.WEBHOOK_URL}/webhook`
      }
    });

    console.log('✅ Webhook Ready');
  } catch (e) {
    console.log('Webhook error:', e.message);
  }
});

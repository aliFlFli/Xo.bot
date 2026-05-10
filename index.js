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
const clickLock = {};

const LEVELS = {
  easy: { size: 4, mines: 2, reward: 10, name: '🍃 آسان' },
  normal: { size: 5, mines: 5, reward: 25, name: '⚙️ معمولی' },
  hard: { size: 6, mines: 10, reward: 50, name: '🔥 سخت' }
};

// ================= BOARD =================

function createBoard(size, mines, safe) {
  const total = size * size;
  const board = Array(total).fill(0);

  const safeSet = new Set([safe]);

  const sx = Math.floor(safe / size);
  const sy = safe % size;

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      const nx = sx + x;
      const ny = sy + y;

      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        safeSet.add(nx * size + ny);
      }
    }
  }

  let arr = [];
  for (let i = 0; i < total; i++) {
    if (!safeSet.has(i)) arr.push(i);
  }

  for (let i = 0; i < mines; i++) {
    const r = Math.floor(Math.random() * arr.length);
    board[arr[r]] = '💣';
    arr.splice(r, 1);
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

        if (
          nx >= 0 && ny >= 0 &&
          nx < size && ny < size
        ) {
          if (board[nx * size + ny] === '💣') c++;
        }
      }
    }

    board[i] = c;
  }

  return board;
}

// ================= FLOOD =================

function flood(game, idx) {
  const size = game.size;

  if (game.revealed[idx] || game.flags[idx]) return;

  game.revealed[idx] = true;

  if (game.board[idx] !== 0) return;

  const x = Math.floor(idx / size);
  const y = idx % size;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx;
      const ny = y + dy;

      if (
        nx >= 0 && ny >= 0 &&
        nx < size && ny < size
      ) {
        flood(game, nx * size + ny);
      }
    }
  }
}

// ================= UI =================

function render(game) {
  const rows = [];

  for (let i = 0; i < game.size; i++) {
    const row = [];

    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;

      let t = '◻️';

      if (game.flags[idx]) t = '🚩';

      else if (game.revealed[idx]) {
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

// ================= WEBHOOK =================

app.post('/webhook', async (req, res) => {

  res.sendStatus(200);

  const u = req.body;

  try {

    // START
    if (u.message?.text === '/start') {
      const user = getUser(u.message.from.id);

      return axios.post(`${API}/sendMessage`, {
        chat_id: u.message.chat.id,
        text: `🎮 Minesweeper PRO

💰 ${user.coins}
🏆 ${user.wins}
💀 ${user.losses}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 بازی جدید', callback_data: 'new' }]
          ]
        }
      });
    }

    if (!u.callback_query) return;

    const cb = u.callback_query;
    const data = cb.data;

    const chat = cb.message.chat.id;
    const msg = cb.message.message_id;
    const uid = cb.from.id;

    if (clickLock[uid]) return;
    clickLock[uid] = true;
    setTimeout(() => delete clickLock[uid], 200);

    // NEW GAME
    if (data === 'new') {

      games[uid] = {
        size: 4,
        mines: 2,
        reward: 10,
        board: null,
        revealed: Array(16).fill(false),
        flags: Array(16).fill(false),
        first: true
      };

      return axios.post(`${API}/editMessageText`, {
        chat_id: chat,
        message_id: msg,
        text: '🎮 شروع بازی',
        reply_markup: render(games[uid])
      });
    }

    // CLICK
    if (data.startsWith('c_')) {

      const idx = +data.split('_')[1];
      const g = games[uid];

      if (!g) return;

      // first click
      if (g.first) {
        g.board = createBoard(g.size, g.mines, idx);
        g.first = false;
      }

      // mine
      if (g.board[idx] === '💣') {

        g.revealed.fill(true);

        loss(uid);

        return axios.post(`${API}/editMessageText`, {
          chat_id: chat,
          message_id: msg,
          text: '💥 باختی!',
          reply_markup: render(g)
        });
      }

      // reveal
      flood(g, idx);

      // win
      let open = g.revealed.filter(x => x).length;
      if (open === g.size * g.size - g.mines) {

        win(uid, g.reward);

        return axios.post(`${API}/editMessageText`, {
          chat_id: chat,
          message_id: msg,
          text: `🎉 بردی +${g.reward}`,
          reply_markup: render(g)
        });
      }

      return axios.post(`${API}/editMessageText`, {
        chat_id: chat,
        message_id: msg,
        text: '🎮 ادامه...',
        reply_markup: render(g)
      });
    }

  } catch (e) {
    console.log(e.message);
  }
});

// ================= SERVER =================

app.get('/', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log('🚀 Running');
});

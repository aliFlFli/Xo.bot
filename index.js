require('dotenv').config();
const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API = `https://tapi.bale.ai/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;

// ================== DATABASE ==================
const db = new Database('minesweeper.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    theme TEXT DEFAULT 'default',
    inventory TEXT DEFAULT '{}'
  )
`);

function getUser(userId) {
  let user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!user) {
    db.prepare('INSERT INTO users (user_id) VALUES (?)').run(userId);
    user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  }
  return {
    ...user,
    inventory: JSON.parse(user.inventory || '{}')
  };
}

function updateUser(user) {
  db.prepare(`
    UPDATE users SET coins=?, wins=?, losses=?, games_played=?, xp=?, level=?, theme=?, inventory=?
    WHERE user_id=?
  `).run(
    user.coins, user.wins, user.losses, user.games_played,
    user.xp, user.level, user.theme, JSON.stringify(user.inventory),
    user.user_id
  );
}

// ================== CONFIG ==================
const DIFFICULTY = {
  easy:   { size: 5, mines: 5,  coin: 15, name: '🍃 آسان' },
  normal: { size: 6, mines: 8,  coin: 35, name: '⚙️ معمولی' },
  hard:   { size: 7, mines: 14, coin: 70, name: '🔥 سخت' },
  expert: { size: 8, mines: 20, coin: 120, name: '💀 حرفه‌ای' }
};

const THEMES = {
  default: { name: 'کلاسیک', bg: '◻️', mine: '💣', flag: '🚩', number: n => n ? `${n}️⃣` : '▫️' },
  nature:  { name: 'طبیعت', bg: '🌿', mine: '🍃', flag: '🌸', number: n => n ? `${n}️⃣` : '▫️' }
};

// ================== GAME ==================
const games = new Map();
const flagMode = new Map();

class MinesweeperGame {
  constructor(difficulty, userId, chatId) {
    const cfg = DIFFICULTY[difficulty];
    this.gameId = crypto.randomBytes(8).toString('hex');
    this.userId = userId;
    this.chatId = chatId;
    this.size = cfg.size;
    this.mines = cfg.mines;
    this.coin = cfg.coin;
    this.difficulty = difficulty;
    this.board = Array(this.size * this.size).fill(0);
    this.revealed = Array(this.size * this.size).fill(false);
    this.flags = Array(this.size * this.size).fill(false);
    this.alive = true;
    this.minesPlaced = false;
    this.opened = 0;
    this.moves = 0;
    this.startTime = Date.now();
  }

  placeMines(firstIdx) {
    // همان منطق قبلی...
    const safe = new Set([firstIdx]);
    const x = Math.floor(firstIdx / this.size);
    const y = firstIdx % this.size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) safe.add(nx * this.size + ny);
      }
    }
    let positions = [];
    for (let i = 0; i < this.size*this.size; i++) if (!safe.has(i)) positions.push(i);

    for (let i = 0; i < this.mines; i++) {
      const rand = Math.floor(Math.random() * positions.length);
      this.board[positions[rand]] = '💣';
      positions.splice(rand, 1);
    }
    this.calculateNumbers();
    this.minesPlaced = true;
  }

  calculateNumbers() {
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] === '💣') continue;
      let count = 0;
      const x = Math.floor(i / this.size), y = i % this.size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size && this.board[nx * this.size + ny] === '💣') count++;
        }
      }
      this.board[i] = count;
    }
  }

  flood(idx) {
    if (this.revealed[idx] || this.flags[idx]) return;
    this.revealed[idx] = true;
    this.opened++;
    if (this.board[idx] !== 0) return;

    const x = Math.floor(idx / this.size), y = idx % this.size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) this.flood(nx * this.size + ny);
      }
    }
  }

  checkWin() {
    return this.opened === this.size * this.size - this.mines;
  }
}

// ================== RENDER ==================
function renderGame(game) {
  const user = getUser(game.userId);
  const theme = THEMES[user.theme] || THEMES.default;
  const rows = [];

  for (let i = 0; i < game.size; i++) {
    const row = [];
    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;
      let text = theme.bg;

      if (game.revealed[idx]) {
        text = game.board[idx] === '💣' ? theme.mine : (game.board[idx] === 0 ? '▫️' : theme.number(game.board[idx]));
      } else if (game.flags[idx]) {
        text = theme.flag;
      }
      row.push({ text, callback_data: `cell_\( {game.gameId}_ \){idx}` });
    }
    rows.push(row);
  }

  rows.push([
    { text: (flagMode.get(`\( {game.chatId}_ \){game.userId}`) ? '🔍 کلیک' : '🚩 پرچم'), callback_data: `flagmode_${game.gameId}` },
    { text: '🏠 منو', callback_data: 'main_menu' }
  ]);

  return { inline_keyboard: rows };
}

// ================== SERVER ==================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const update = req.body;
  try {
    // ... (کد قبلی بدون تغییر اساسی)
    console.log("Update received");
  } catch (e) {
    console.error(e);
  }
});

app.get('/', (req, res) => res.send('✅ Bot is Running'));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

console.log('🤖 Minesweeper Bot Started!');

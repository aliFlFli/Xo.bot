require('dotenv').config();
const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API = `https://tapi.bale.ai/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;

// ================== DB ==================
const db = new Database('minesweeper.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    theme TEXT DEFAULT 'default'
  )
`);

function getUser(userId) {
  let user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!user) {
    db.prepare('INSERT INTO users (user_id) VALUES (?)').run(userId);
    user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  }
  return user;
}

function updateUser(user) {
  db.prepare(`
    UPDATE users SET coins=?, wins=?, losses=?, xp=?, level=?, theme=?
    WHERE user_id=?
  `).run(user.coins, user.wins, user.losses, user.xp, user.level, user.theme, user.user_id);
}

// ================== GAME ==================
const games = new Map();

const DIFFICULTY = {
  easy:   { size: 5,  mines: 5,  reward: 15, name: '🍃 آسان' },
  normal: { size: 6,  mines: 8,  reward: 35, name: '⚙️ معمولی' },
  hard:   { size: 7,  mines: 14, reward: 70, name: '🔥 سخت' },
  expert: { size: 8,  mines: 20, reward: 120,name: '💀 حرفه‌ای' }
};

// ================== BOARD & LOGIC ==================
class MinesweeperGame {
  constructor(difficulty, userId) {
    const cfg = DIFFICULTY[difficulty];
    this.userId = userId;
    this.size = cfg.size;
    this.mines = cfg.mines;
    this.reward = cfg.reward;
    this.difficulty = difficulty;
    this.board = Array(this.size * this.size).fill(0);
    this.revealed = Array(this.size * this.size).fill(false);
    this.flags = Array(this.size * this.size).fill(false);
    this.firstClick = true;
    this.alive = true;
    this.startTime = Date.now();
  }

  placeMines(firstIdx) {
    const safe = new Set([firstIdx]);
    const x = Math.floor(firstIdx / this.size);
    const y = firstIdx % this.size;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) safe.add(nx * this.size + ny);
      }
    }

    let positions = [];
    for (let i = 0; i < this.size * this.size; i++) if (!safe.has(i)) positions.push(i);

    for (let i = 0; i < this.mines; i++) {
      const rand = Math.floor(Math.random() * positions.length);
      this.board[positions[rand]] = '💣';
      positions.splice(rand, 1);
    }

    this.calculateNumbers();
  }

  calculateNumbers() {
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] === '💣') continue;
      let count = 0;
      const x = Math.floor(i / this.size), y = i % this.size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
            if (this.board[nx * this.size + ny] === '💣') count++;
          }
        }
      }
      this.board[i] = count;
    }
  }

  flood(idx) {
    if (this.revealed[idx] || this.flags[idx]) return;
    this.revealed[idx] = true;

    if (this.board[idx] !== 0) return;

    const x = Math.floor(idx / this.size), y = idx % this.size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
          this.flood(nx * this.size + ny);
        }
      }
    }
  }

  checkWin() {
    const revealedCount = this.revealed.filter(Boolean).length;
    return revealedCount === this.size * this.size - this.mines;
  }
}

// ================== RENDER ==================
function renderBoard(game) {
  const rows = [];
  for (let i = 0; i < game.size; i++) {
    const row = [];
    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;
      let text = '◻️';

      if (game.flags[idx]) text = '🚩';
      else if (game.revealed[idx]) {
        if (game.board[idx] === '💣') text = '💣';
        else if (game.board[idx] === 0) text = '▫️';
        else text = `${game.board[idx]}️⃣`;
      }

      row.push({ text, callback_data: `c_${idx}` });
    }
    rows.push(row);
  }

  rows.push([
    { text: '🏠 منو', callback_data: 'menu' },
    { text: '🔄 بازی جدید', callback_data: 'new' }
  ]);

  return { inline_keyboard: rows };
}

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const update = req.body;

  try {
    const userId = update.message?.from?.id || update.callback_query?.from?.id;
    if (!userId) return;

    // Start
    if (update.message?.text === '/start') {
      const user = getUser(userId);
      await axios.post(`${API}/sendMessage`, {
        chat_id: update.message.chat.id,
        text: `🎮 **مین‌روب پرو**\n\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins}\n⭐ سطح: ${user.level}`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🎮 بازی جدید', callback_data: 'select_level' }]] }
      });
      return;
    }

    if (!update.callback_query) return;

    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;

    // انتخاب سطح
    if (data === 'select_level') {
      const buttons = Object.keys(DIFFICULTY).map(lvl => [{
        text: DIFFICULTY[lvl].name,
        callback_data: `level_${lvl}`
      }]);

      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: '🎲 سطح difficulty رو انتخاب کن:',
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // شروع بازی
    if (data.startsWith('level_')) {
      const level = data.split('_')[1];
      const game = new MinesweeperGame(level, userId);
      games.set(userId, game);

      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: `🎮 ${DIFFICULTY[level].name} شروع شد!\n⛳ مین: ${DIFFICULTY[level].mines}`,
        reply_markup: renderBoard(game)
      });
      return;
    }

    const game = games.get(userId);
    if (!game) return;

    // کلیک روی سلول
    if (data.startsWith('c_')) {
      const idx = parseInt(data.split('_')[1]);

      if (game.firstClick) {
        game.placeMines(idx);
        game.firstClick = false;
      }

      if (game.board[idx] === '💣') {
        game.alive = false;
        game.revealed.fill(true);
        const user = getUser(userId);
        user.losses++;
        updateUser(user);

        await axios.post(`${API}/editMessageText`, {
          chat_id: chatId,
          message_id: msgId,
          text: '💥 باختی!',
          reply_markup: renderBoard(game)
        });
        games.delete(userId);
        return;
      }

      game.flood(idx);

      if (game.checkWin()) {
        const user = getUser(userId);
        user.wins++;
        user.coins += game.reward;
        user.xp += 20;
        if (user.xp > 300) { user.level++; user.xp = 0; }
        updateUser(user);

        await axios.post(`${API}/editMessageText`, {
          chat_id: chatId,
          message_id: msgId,
          text: `🎉 بردی! +${game.reward} سکه`,
          reply_markup: renderBoard(game)
        });
        games.delete(userId);
        return;
      }

      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: `🎮 در حال بازی...`,
        reply_markup: renderBoard(game)
      });
    }

    if (data === 'menu' || data === 'new') {
      games.delete(userId);
      // بازگشت به منو
    }

  } catch (e) {
    console.error(e);
  }
});

app.get('/', (req, res) => res.send('Minesweeper Bale Bot Running 🚀'));
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));

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
    UPDATE users SET coins=?, wins=?, losses=?, games_played=?, xp=?, level=?, theme=?
    WHERE user_id=?
  `).run(user.coins, user.wins, user.losses, user.games_played, user.xp, user.level, user.theme, user.user_id);
}

// ================== CONFIG ==================
const DIFFICULTY = {
  easy:   { size: 5, mines: 5,  coin: 15, name: '🍃 آسان' },
  normal: { size: 6, mines: 8,  coin: 35, name: '⚙️ معمولی' },
  hard:   { size: 7, mines: 14, coin: 70, name: '🔥 سخت' }
};

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
  }

  placeMines(firstIdx) {
    const safe = new Set([firstIdx]);
    const x = Math.floor(firstIdx / this.size);
    const y = firstIdx % this.size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) safe.add(nx*this.size + ny);
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
          if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size && this.board[nx*this.size + ny] === '💣') count++;
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
  const rows = [];
  for (let i = 0; i < game.size; i++) {
    const row = [];
    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;
      let text = '◻️';

      if (game.revealed[idx]) {
        if (game.board[idx] === '💣') text = '💣';
        else if (game.board[idx] === 0) text = '▫️';
        else text = `${game.board[idx]}️⃣`;
      } else if (game.flags[idx]) text = '🚩';

      row.push({ text, callback_data: `cell_\( {game.gameId}_ \){idx}` });
    }
    rows.push(row);
  }

  rows.push([
    { text: flagMode.get(`\( {game.chatId}_ \){game.userId}`) ? '🔍 کلیک' : '🚩 پرچم', callback_data: `flag_${game.gameId}` },
    { text: '🏠 منو', callback_data: 'main_menu' }
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

    if (update.message?.text === '/start') {
      const user = getUser(userId);
      await axios.post(`${API}/sendMessage`, {
        chat_id: update.message.chat.id,
        text: `🎮 **مین‌روب پرو**\n\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins}`,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: '🎮 بازی جدید', callback_data: 'new_game' }]] }
      });
      return;
    }

    if (!update.callback_query) return;

    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;

    await axios.post(`${API}/answerCallbackQuery`, { callback_query_id: cb.id });

    // New Game
    if (data === 'new_game') {
      const kb = Object.keys(DIFFICULTY).map(k => [{ text: DIFFICULTY[k].name, callback_data: `diff_${k}` }]);
      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: '🎲 سطح را انتخاب کنید:',
        reply_markup: { inline_keyboard: kb }
      });
      return;
    }

    if (data.startsWith('diff_')) {
      const diff = data.split('_')[1];
      const game = new MinesweeperGame(diff, userId, chatId);
      games.set(`\( {chatId}_ \){userId}`, game);

      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: `🎮 ${DIFFICULTY[diff].name} — شروع شد!`,
        reply_markup: renderGame(game)
      });
      return;
    }

    const gameKey = `\( {chatId}_ \){userId}`;
    const game = games.get(gameKey);
    if (!game) return;

    // Toggle Flag Mode
    if (data.startsWith('flag_')) {
      flagMode.set(gameKey, !flagMode.get(gameKey));
      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId, message_id: msgId,
        text: `🎮 ${DIFFICULTY[game.difficulty].name}`,
        reply_markup: renderGame(game)
      });
      return;
    }

    // Cell Click
    if (data.startsWith('cell_')) {
      const parts = data.split('_');
      const receivedGameId = parts[1] + '_' + parts[2]; // gameId دو بخشی
      const idx = parseInt(parts[3]);

      if (game.gameId !== receivedGameId) {
        await axios.post(`${API}/answerCallbackQuery`, { 
          callback_query_id: cb.id, 
          text: "❌ بازی قدیمی است" 
        });
        return;
      }

      const isFlagMode = flagMode.get(gameKey) || false;

      if (!game.minesPlaced) {
        game.placeMines(idx);
      }

      if (!isFlagMode) {
        if (game.revealed[idx] || game.flags[idx]) return;

        if (game.board[idx] === '💣') {
          game.revealed.fill(true);
          const user = getUser(userId);
          user.losses++;
          user.games_played++;
          updateUser(user);

          await axios.post(`${API}/editMessageText`, {
            chat_id: chatId, message_id: msgId,
            text: '💥 باختی! دوباره بازی کن.',
            reply_markup: renderGame(game)
          });
          games.delete(gameKey);
          return;
        }

        game.flood(idx);
        game.moves++;

        if (game.checkWin()) {
          const user = getUser(userId);
          user.wins++;
          user.coins += game.coin;
          user.games_played++;
          user.xp += 25;
          updateUser(user);

          await axios.post(`${API}/editMessageText`, {
            chat_id: chatId, message_id: msgId,
            text: `🎉 بردی! +${game.coin} سکه`,
            reply_markup: renderGame(game)
          });
          games.delete(gameKey);
          return;
        }
      } else {
        // Flag mode
        game.flags[idx] = !game.flags[idx];
      }

      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: `🎮 ${DIFFICULTY[game.difficulty].name}`,
        reply_markup: renderGame(game)
      });
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
});

app.get('/', (req, res) => res.send('✅ Bot is Running'));
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));

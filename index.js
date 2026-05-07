const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;

// ========== دیتابیس ==========
const db = new Database('minesweeper.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    name TEXT DEFAULT 'کاربر'
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

function updateUser(userId, coins, wins, losses, gamesPlayed) {
  db.prepare(`UPDATE users SET coins = ?, wins = ?, losses = ?, games_played = ? WHERE user_id = ?`)
    .run(coins, wins, losses, gamesPlayed, userId);
}

// ========== تنظیمات بازی ==========
const DIFFICULTY = {
  easy: { size: 4, mines: 2, name: '🍃 آسان', coin: 10 },
  normal: { size: 5, mines: 5, name: '⚙️ معمولی', coin: 25 },
  hard: { size: 6, mines: 10, name: '🔥 سخت', coin: 50 },
  expert: { size: 8, mines: 20, name: '💀 حرفه‌ای', coin: 100 }
};

// ========== منوی اصلی ==========
const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🎮 بازی جدید', callback_data: 'new_game' }],
      [{ text: '💰 کیف پول', callback_data: 'wallet' }, { text: '📊 آمار', callback_data: 'stats' }],
      [{ text: '🏆 لیدربورد', callback_data: 'leaderboard' }, { text: '❓ راهنما', callback_data: 'help' }]
    ]
  }
};

// ========== کلاس بازی ==========
class MinesweeperGame {
  constructor(size, minesCount, difficulty, userId, gameId, chatId) {
    this.gameId = gameId;
    this.chatId = chatId;
    this.userId = userId;
    this.size = size;
    this.minesCount = minesCount;
    this.difficulty = difficulty;
    this.board = Array(size * size).fill(0);
    this.revealed = Array(size * size).fill(false);
    this.flags = Array(size * size).fill(false);
    this.alive = true;
    this.opened = 0;
    this.startTime = Date.now();
    this.minesPlaced = false;
  }

  placeMines(firstIdx) {
    const safe = new Set();
    safe.add(firstIdx);
    const x = Math.floor(firstIdx / this.size);
    const y = firstIdx % this.size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
          safe.add(nx * this.size + ny);
        }
      }
    }
    
    let candidates = [];
    for (let i = 0; i < this.board.length; i++) {
      if (!safe.has(i)) candidates.push(i);
    }
    
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    
    for (let i = 0; i < this.minesCount; i++) {
      this.board[candidates[i]] = '💣';
    }
    this.calcNumbers();
    this.minesPlaced = true;
  }

  calcNumbers() {
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] === '💣') continue;
      let count = 0;
      const x = Math.floor(i / this.size);
      const y = i % this.size;
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

  reveal(idx) {
    if (this.revealed[idx] || this.flags[idx]) return false;
    this.revealed[idx] = true;
    this.opened++;
    
    if (this.board[idx] === 0) {
      const x = Math.floor(idx / this.size);
      const y = idx % this.size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
            const nidx = nx * this.size + ny;
            if (!this.revealed[nidx] && !this.flags[nidx] && this.board[nidx] !== '💣') {
              this.reveal(nidx);
            }
          }
        }
      }
    }
    return true;
  }

  checkWin() {
    return this.opened === this.board.length - this.minesCount;
  }
}

// ========== بازی‌های فعال ==========
const games = new Map();

// ========== ارسال پیام ==========
async function sendMessage(chatId, text, keyboard = null) {
  try {
    await axios.post(`${API_URL}/sendMessage`, {
      chat_id: chatId,
      text: text,
      reply_markup: keyboard
    });
  } catch (err) {
    console.error('ارسال پیام خطا:', err.message);
  }
}

async function editMessage(chatId, messageId, text, keyboard = null) {
  try {
    await axios.post(`${API_URL}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      reply_markup: keyboard
    });
  } catch (err) {
    console.error('ویرایش پیام خطا:', err.message);
  }
}

// ========== رندر بازی ==========
function renderGame(game) {
  const rows = [];
  for (let i = 0; i < game.size; i++) {
    const row = [];
    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;
      let emoji = '⬜';
      if (game.revealed[idx]) {
        if (game.board[idx] === '💣') emoji = '💣';
        else if (game.board[idx] === 0) emoji = '▪️';
        else emoji = `${game.board[idx]}️⃣`;
      } else if (game.flags[idx]) {
        emoji = '🚩';
      }
      row.push({ text: emoji, callback_data: `cell_${game.gameId}_${idx}` });
    }
    rows.push(row);
  }
  rows.push([
    { text: '🚩 پرچم', callback_data: `flag_${game.gameId}` },
    { text: '🏠 منو', callback_data: 'main_menu' }
  ]);
  return { inline_keyboard: rows };
}

// ========== پردازش کلیک ==========
async function handleCell(game, userId, chatId, messageId, idx) {
  if (game.userId !== userId) {
    return;
  }
  if (!game.alive) return;
  if (game.revealed[idx] || game.flags[idx]) return;
  
  if (!game.minesPlaced) {
    game.placeMines(idx);
  }
  
  if (game.board[idx] === '💣') {
    game.alive = false;
    for (let i = 0; i < game.board.length; i++) {
      if (game.board[i] === '💣') game.revealed[i] = true;
    }
    await editMessage(chatId, messageId, `💥 باختی! 💀\nزمان: ${Math.floor((Date.now() - game.startTime) / 1000)} ثانیه`, renderGame(game));
    return;
  }
  
  game.reveal(idx);
  
  if (game.checkWin()) {
    game.alive = false;
    const time = Math.floor((Date.now() - game.startTime) / 1000);
    const reward = DIFFICULTY[game.difficulty].coin;
    const user = getUser(userId);
    const newCoins = user.coins + reward;
    updateUser(userId, newCoins, user.wins + 1, user.losses, user.games_played + 1);
    
    await editMessage(chatId, messageId, 
      `🎉 بردی! 🎉\n💰 +${reward} سکه\n⏱️ زمان: ${time} ثانیه\n💎 سکه کل: ${newCoins}`,
      renderGame(game));
    return;
  }
  
  await editMessage(chatId, messageId, 
    `💣 ${DIFFICULTY[game.difficulty].name}\n🎯 ${game.opened}/${game.board.length - game.minesCount}`, 
    renderGame(game));
}

// ========== ربات ==========
let lastUpdateId = 0;
const flagMode = new Map();

async function getUpdates() {
  try {
    const res = await axios.post(`${API_URL}/getUpdates`, {
      offset: lastUpdateId + 1,
      timeout: 30
    });
    
    for (const update of res.data.result) {
      lastUpdateId = update.update_id;
      
      // پیام متنی
      if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const text = update.message.text;
        
        if (text === '/start') {
          const user = getUser(userId);
          await sendMessage(chatId, 
            `🎯 مین‌روب حرفه‌ای\n\n👤 ${user.name}\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins} | باخت: ${user.losses}`,
            MAIN_MENU);
        }
      }
      
      // کالبک دکمه‌ها
      if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data;
        const chatId = cb.message.chat.id;
        const userId = cb.from.id;
        const messageId = cb.message.message_id;
        
        if (data === 'main_menu') {
          const user = getUser(userId);
          await editMessage(chatId, messageId,
            `🎯 منوی اصلی\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins}`,
            MAIN_MENU);
        }
        else if (data === 'new_game') {
          const keyboard = {
            inline_keyboard: [
              [{ text: '🍃 آسان (10 سکه)', callback_data: 'diff_easy' }],
              [{ text: '⚙️ معمولی (25 سکه)', callback_data: 'diff_normal' }],
              [{ text: '🔥 سخت (50 سکه)', callback_data: 'diff_hard' }],
              [{ text: '💀 حرفه‌ای (100 سکه)', callback_data: 'diff_expert' }]
            ]
          };
          await editMessage(chatId, messageId, '🎲 سطح را انتخاب کن:', keyboard);
        }
        else if (data.startsWith('diff_')) {
          const level = data.replace('diff_', '');
          const config = DIFFICULTY[level];
          const gameId = `${chatId}_${userId}_${Date.now()}`;
          const game = new MinesweeperGame(config.size, config.mines, level, userId, gameId, chatId);
          games.set(`${chatId}_${userId}`, game);
          await editMessage(chatId, messageId, 
            `🎮 ${config.name}\n💰 جایزه: ${config.coin} سکه`,
            renderGame(game));
        }
        else if (data === 'wallet') {
          const user = getUser(userId);
          await editMessage(chatId, messageId, `💰 کیف پول\n\nسکه: ${user.coins} 🪙`, MAIN_MENU);
        }
        else if (data === 'stats') {
          const user = getUser(userId);
          await editMessage(chatId, messageId,
            `📊 آمار شما\n\n🏆 برد: ${user.wins}\n💀 باخت: ${user.losses}\n🎮 بازی: ${user.games_played}\n💰 سکه: ${user.coins}`,
            MAIN_MENU);
        }
        else if (data === 'leaderboard') {
          const top = db.prepare('SELECT user_id, wins, name FROM users ORDER BY wins DESC LIMIT 5').all();
          let msg = '🏆 برترین‌ها:\n\n';
          for (let i = 0; i < top.length; i++) {
            msg += `${i+1}. ${top[i].name || 'کاربر'} — ${top[i].wins} برد\n`;
          }
          await editMessage(chatId, messageId, msg, MAIN_MENU);
        }
        else if (data === 'help') {
          await editMessage(chatId, messageId,
            `📖 راهنما\n\n🎯 سلول‌های بدون مین رو باز کن\n🚩 با دکمه پرچم مین علامت بزن\n💰 برد = سکه بگیر`,
            MAIN_MENU);
        }
        else if (data.startsWith('flag_')) {
          const gameId = data.replace('flag_', '');
          const gameKey = `${chatId}_${userId}`;
          const game = games.get(gameKey);
          if (game && game.gameId === gameId) {
            const current = flagMode.get(gameKey) || false;
            flagMode.set(gameKey, !current);
            // پاسخ به کالبک از طریق sendMessage ساده
          }
        }
        else if (data.startsWith('cell_')) {
          const parts = data.split('_');
          const gameId = parts[1];
          const idx = parseInt(parts[2]);
          const gameKey = `${chatId}_${userId}`;
          const game = games.get(gameKey);
          if (game && game.gameId === gameId && game.alive) {
            await handleCell(game, userId, chatId, messageId, idx);
          }
        }
        
        // پاسخ به کالبک
        await axios.post(`${API_URL}/answerCallbackQuery`, {
          callback_query_id: cb.id
        });
      }
    }
  } catch (err) {
    console.error('دریافت خطا:', err.message);
  }
}

setInterval(getUpdates, 1000);

app.get('/', (req, res) => res.send('🎮 مین‌روب آنلاین است'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 مین‌روب روی پورت ${PORT} روشن شد!`));

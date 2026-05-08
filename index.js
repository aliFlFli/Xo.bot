import { Bale } from 'bale-telegram';
import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// ================== CONFIG ==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const MAX_ACTIVE_GAMES = 1000;

const DIFFICULTY = {
  easy: { size: 4, mines: 2, name: '🍃 آسان', coin: 10 },
  normal: { size: 5, mines: 5, name: '⚙️ معمولی', coin: 25 },
  hard: { size: 6, mines: 10, name: '🔥 سخت', coin: 50 },
  expert: { size: 8, mines: 20, name: '💀 حرفه‌ای', coin: 100 }
};

const THEMES = {
  default: { name: 'کلاسیک', bg: '⬜', mine: '💣', flag: '🚩' },
  nature: { name: 'طبیعت', bg: '🌿', mine: '🍃', flag: '🌸', price: 100 },
  neon: { name: 'نئون', bg: '🟩', mine: '💚', flag: '🚩', price: 200 }
};

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
    theme TEXT DEFAULT 'default',
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    inventory TEXT DEFAULT '{}'
  )
`);

function getUser(userId) {
  const row = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO users (user_id) VALUES (?)').run(userId);
    return {
      userId,
      coins: 100,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      theme: 'default',
      xp: 0,
      level: 1,
      inventory: {}
    };
  }
  return {
    userId: row.user_id,
    coins: row.coins,
    wins: row.wins,
    losses: row.losses,
    gamesPlayed: row.games_played,
    theme: row.theme,
    xp: row.xp,
    level: row.level,
    inventory: JSON.parse(row.inventory || '{}')
  };
}

function updateUser(user) {
  db.prepare(`
    UPDATE users SET 
      coins = ?, wins = ?, losses = ?, games_played = ?,
      theme = ?, xp = ?, level = ?, inventory = ?
    WHERE user_id = ?
  `).run(
    user.coins, user.wins, user.losses, user.gamesPlayed,
    user.theme, user.xp, user.level, JSON.stringify(user.inventory),
    user.userId
  );
}

// ================== GAME CLASS ==================
class MinesweeperGame {
  constructor(size, minesCount, difficulty, userId, gameId, chatId) {
    this.gameId = gameId;
    this.chatId = chatId;
    this.userId = userId;
    this.size = size;
    this.totalCells = size * size;
    this.minesCount = minesCount;
    this.difficulty = difficulty;
    this.board = Array(this.totalCells).fill(0);
    this.revealed = Array(this.totalCells).fill(false);
    this.flags = Array(this.totalCells).fill(false);
    this.alive = true;
    this.opened = 0;
    this.startTime = Date.now();
    this.moves = 0;
    this.minesPlaced = false;
  }

  placeMinesAfterFirstClick(clickIdx) {
    const safeIndices = new Set();
    safeIndices.add(clickIdx);
    const x = Math.floor(clickIdx / this.size);
    const y = clickIdx % this.size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
          safeIndices.add(nx * this.size + ny);
        }
      }
    }
    
    const possibleMines = [];
    for (let i = 0; i < this.totalCells; i++) {
      if (!safeIndices.has(i)) possibleMines.push(i);
    }
    
    for (let i = possibleMines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [possibleMines[i], possibleMines[j]] = [possibleMines[j], possibleMines[i]];
    }
    
    for (let i = 0; i < this.minesCount && i < possibleMines.length; i++) {
      this.board[possibleMines[i]] = '💣';
    }
    
    this.calculateNumbers();
    this.minesPlaced = true;
  }

  calculateNumbers() {
    for (let i = 0; i < this.totalCells; i++) {
      if (this.board[i] === '💣') continue;
      let count = 0;
      const x = Math.floor(i / this.size);
      const y = i % this.size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
            if (this.board[nx * this.size + ny] === '💣') count++;
          }
        }
      }
      this.board[i] = count;
    }
  }

  revealEmpty(startIdx) {
    const queue = [startIdx];
    const visited = new Set();
    while (queue.length > 0) {
      const idx = queue.shift();
      if (visited.has(idx)) continue;
      if (this.revealed[idx] || this.flags[idx]) continue;
      visited.add(idx);
      this.revealed[idx] = true;
      this.opened++;
      if (this.board[idx] !== 0) continue;
      const x = Math.floor(idx / this.size);
      const y = idx % this.size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
            const neighborIdx = nx * this.size + ny;
            if (!this.revealed[neighborIdx] && !this.flags[neighborIdx] && this.board[neighborIdx] !== '💣') {
              queue.push(neighborIdx);
            }
          }
        }
      }
    }
  }

  revealAllMines() {
    for (let i = 0; i < this.totalCells; i++) {
      if (this.board[i] === '💣') this.revealed[i] = true;
    }
  }

  checkWin() {
    return this.opened === this.totalCells - this.minesCount;
  }

  getStats() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')} | 🎯 ${this.moves} حرکت`;
  }

  getTimeInSeconds() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

// ================== KEEP ALIVE ==================
const app = express();
app.get('/', (req, res) => res.send('🎮 Minesweeper Bale Bot is alive'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🌐 Server on', PORT));

// ================== BOT INIT ==================
const bot = new Bale(BOT_TOKEN);
const games = new Map();
const flagMode = new Map();

function generateGameId(chatId, userId) {
  return `${chatId}_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// ================== RENDER GAME ==================
function renderGame(game, gameOver = false) {
  const user = getUser(game.userId);
  const theme = THEMES[user.theme] || THEMES.default;
  
  let keyboard = [];
  
  for (let i = 0; i < game.size; i++) {
    const row = [];
    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;
      let display = theme.bg;
      
      if (game.revealed[idx]) {
        if (game.board[idx] === '💣') display = theme.mine;
        else if (game.board[idx] === 0) display = '▪️';
        else display = String(game.board[idx]);
      } else if (game.flags[idx]) {
        display = theme.flag;
      }
      
      row.push({ text: display, callback_data: `cell_${game.gameId}_${idx}` });
    }
    keyboard.push(row);
  }
  
  const controlRow = [];
  if (!gameOver && game.alive) {
    controlRow.push({ text: '🚩 Flag', callback_data: `flag_${game.gameId}` });
  }
  controlRow.push({ text: '🏠 منو', callback_data: 'main_menu' });
  keyboard.push(controlRow);
  
  return { reply_markup: { inline_keyboard: keyboard } };
}

// ================== MAIN MENU ==================
function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎮 بازی جدید', callback_data: 'new_game' }],
        [{ text: '🛒 فروشگاه', callback_data: 'shop' }, { text: '🎨 تم', callback_data: 'theme' }],
        [{ text: '🏆 آمار من', callback_data: 'stats' }, { text: '💰 کیف پول', callback_data: 'wallet' }],
        [{ text: '⭐ سطح من', callback_data: 'level_info' }]
      ]
    }
  };
}

// ================== BOT HANDLERS ==================
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const user = getUser(userId);
  
  if (msg.text === '/start') {
    await bot.sendMessage(
      msg.chat.id,
      `🎯 به ماین‌سوییپر خوش اومدی!\n\n👤 ${user.userId}\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins} | ${user.losses} باخت\n⭐ سطح: ${user.level}`,
      getMainMenu()
    );
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  const message = callbackQuery.message;
  const userId = callbackQuery.from.id;
  const chatId = message.chat.id;
  
  await bot.answerCallbackQuery(callbackQuery.id);
  
  // Main menu
  if (data === 'main_menu') {
    const user = getUser(userId);
    await bot.editMessageText(
      chatId,
      message.message_id,
      `🎯 منوی اصلی\n\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins}\n⭐ سطح: ${user.level}`,
      getMainMenu()
    );
    return;
  }
  
  // New game - choose difficulty
  if (data === 'new_game') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🍃 آسان (10 سکه)', callback_data: 'diff_easy' }],
          [{ text: '⚙️ معمولی (25 سکه)', callback_data: 'diff_normal' }],
          [{ text: '🔥 سخت (50 سکه)', callback_data: 'diff_hard' }],
          [{ text: '💀 حرفه‌ای (100 سکه)', callback_data: 'diff_expert' }],
          [{ text: '🔙 برگشت', callback_data: 'main_menu' }]
        ]
      }
    };
    await bot.editMessageText(chatId, message.message_id, '🎲 سطح سختی رو انتخاب کن:', keyboard);
    return;
  }
  
  // Start game with difficulty
  if (data.startsWith('diff_')) {
    const level = data.split('_')[1];
    const config = DIFFICULTY[level];
    
    if (games.size >= MAX_ACTIVE_GAMES) {
      await bot.answerCallbackQuery(callbackQuery.id, '❌ شلوغه! کمی صبر کن', true);
      return;
    }
    
    const gameId = generateGameId(chatId, userId);
    const game = new MinesweeperGame(config.size, config.mines, level, userId, gameId, chatId);
    const gameKey = `${chatId}_${userId}`;
    games.set(gameKey, game);
    
    await bot.editMessageText(
      chatId,
      message.message_id,
      `🎮 بازی ${config.name}\n💰 جایزه: ${config.coin} سکه\n${game.getStats()}`,
      renderGame(game, false)
    );
    return;
  }
  
  // Handle cell click
  if (data.startsWith('cell_')) {
    const parts = data.split('_');
    const gameId = parts[1] + '_' + parts[2];
    const idx = parseInt(parts[3]);
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(callbackQuery.id, '❌ بازی معتبر نیست!', true);
      return;
    }
    
    if (!game.alive) {
      await bot.answerCallbackQuery(callbackQuery.id, '❌ بازی تموم شده!', true);
      return;
    }
    
    if (game.userId !== userId) {
      await bot.answerCallbackQuery(callbackQuery.id, '❌ این بازی مال تو نیست!', true);
      return;
    }
    
    // Check flag mode
    const isFlag = flagMode.get(gameKey) || false;
    if (isFlag) {
      if (game.revealed[idx]) {
        await bot.answerCallbackQuery(callbackQuery.id, '❌ باز شده رو پرچم نمیشه زد', true);
        return;
      }
      game.flags[idx] = !game.flags[idx];
      await bot.editMessageText(
        chatId,
        message.message_id,
        `💣 ${DIFFICULTY[game.difficulty].name}\n${game.getStats()}`,
        renderGame(game, false)
      );
      await bot.answerCallbackQuery(callbackQuery.id, game.flags[idx] ? '🚩 پرچم زده شد' : '🔓 پرچم برداشته شد');
      return;
    }
    
    // Normal click
    if (game.revealed[idx]) {
      await bot.answerCallbackQuery(callbackQuery.id, '🔓 قبلا باز شده', true);
      return;
    }
    if (game.flags[idx]) {
      await bot.answerCallbackQuery(callbackQuery.id, '🚩 پرچم داره', true);
      return;
    }
    
    if (!game.minesPlaced) {
      game.placeMinesAfterFirstClick(idx);
    }
    
    game.moves++;
    
    if (game.board[idx] === '💣') {
      game.alive = false;
      game.revealAllMines();
      const user = getUser(userId);
      user.losses++;
      user.gamesPlayed++;
      updateUser(user);
      await bot.editMessageText(
        chatId,
        message.message_id,
        `💥 باختی! 💀\n\n${game.getStats()}`,
        renderGame(game, true)
      );
      await bot.answerCallbackQuery(callbackQuery.id, '💀 روی مین رفتی!', true);
      return;
    }
    
    game.revealEmpty(idx);
    
    if (game.checkWin()) {
      game.alive = false;
      const gameTime = game.getTimeInSeconds();
      let coinReward = DIFFICULTY[game.difficulty].coin;
      
      const user = getUser(userId);
      user.coins += coinReward;
      user.wins++;
      user.gamesPlayed++;
      user.xp += 20;
      
      const levelNames = ['', '🌱 تازه‌کار', '⭐ مبتدی', '🔰 آشنای حرفه', '🎯 ماهر', '🔥 حرفه‌ای', '💎 استاد', '👑 افسانه‌ای'];
      let levelUpMsg = '';
      if (user.xp >= user.level * 100) {
        user.level++;
        levelUpMsg = `\n🎉 **سطح ${user.level}** رسیدی! ${levelNames[user.level] || 'قهرمان'}\n💰 +50 سکه پاداش!\n`;
        user.coins += 50;
      }
      
      updateUser(user);
      
      await bot.editMessageText(
        chatId,
        message.message_id,
        `🎉 **بردی!** 🎉\n\n` +
        `⏱️ زمان: ${gameTime} ثانیه\n` +
        `💰 +${coinReward} سکه\n` +
        `✨ +20 XP${levelUpMsg}\n\n` +
        `📊 سکه: ${user.coins} | سطح: ${user.level}`,
        renderGame(game, true)
      );
      await bot.answerCallbackQuery(callbackQuery.id, '🏆 پیروزی!', true);
      return;
    }
    
    await bot.editMessageText(
      chatId,
      message.message_id,
      `💣 ${DIFFICULTY[game.difficulty].name}\n${game.getStats()}`,
      renderGame(game, false)
    );
    await bot.answerCallbackQuery(callbackQuery.id, '✅ باز شد');
    return;
  }
  
  // Flag mode toggle
  if (data.startsWith('flag_')) {
    const gameKey = `${chatId}_${userId}`;
    const current = flagMode.get(gameKey) || false;
    flagMode.set(gameKey, !current);
    await bot.answerCallbackQuery(callbackQuery.id, `${!current ? '🚩 حالت پرچم' : '🔍 حالت کلیک'} فعال شد`);
    return;
  }
  
  // Shop
  if (data === 'shop') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💣 مین‌شکن (50 سکه)', callback_data: 'buy_bomb_disabler' }],
          [{ text: '❤️ جان اضافه (75 سکه)', callback_data: 'buy_extra_life' }],
          [{ text: '🔦 مین‌یاب (120 سکه)', callback_data: 'buy_mine_detector' }],
          [{ text: '🧠 حسگر هوشمند (90 سکه)', callback_data: 'buy_smart_hint' }],
          [{ text: '🔙 برگشت', callback_data: 'main_menu' }]
        ]
      }
    };
    await bot.editMessageText(chatId, message.message_id, '🛒 فروشگاه آیتم‌ها:', keyboard);
    return;
  }
  
  // Buy items
  if (data.startsWith('buy_')) {
    const item = data.split('_')[1];
    const prices = { bomb_disabler: 50, extra_life: 75, mine_detector: 120, smart_hint: 90 };
    const price = prices[item];
    const user = getUser(userId);
    
    if (user.coins >= price) {
      user.coins -= price;
      user.inventory[item] = (user.inventory[item] || 0) + 1;
      updateUser(user);
      await bot.answerCallbackQuery(callbackQuery.id, '✅ خرید موفق!', true);
    } else {
      await bot.answerCallbackQuery(callbackQuery.id, '❌ سکه کافی نیست!', true);
    }
    
    const userUpdated = getUser(userId);
    await bot.editMessageText(
      chatId,
      message.message_id,
      `💰 سکه باقی‌مونده: ${userUpdated.coins}`,
      getMainMenu()
    );
    return;
  }
  
  // Stats
  if (data === 'stats') {
    const user = getUser(userId);
    const winRate = user.gamesPlayed > 0 ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) : 0;
    await bot.editMessageText(
      chatId,
      message.message_id,
      `📊 **آمار شما**\n\n` +
      `🎮 بازی‌ها: ${user.gamesPlayed}\n` +
      `🏆 برد: ${user.wins}\n` +
      `💀 باخت: ${user.losses}\n` +
      `💰 سکه: ${user.coins}\n` +
      `⭐ سطح: ${user.level}\n` +
      `✨ XP: ${user.xp}\n` +
      `📈 نرخ برد: ${winRate}%`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] } }
    );
    return;
  }
  
  // Wallet
  if (data === 'wallet') {
    const user = getUser(userId);
    await bot.editMessageText(
      chatId,
      message.message_id,
      `💰 کیف پول شما: ${user.coins} سکه`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] } }
    );
    return;
  }
  
  // Level info
  if (data === 'level_info') {
    const user = getUser(userId);
    const levelNames = ['', '🌱 تازه‌کار', '⭐ مبتدی', '🔰 آشنای حرفه', '🎯 ماهر', '🔥 حرفه‌ای', '💎 استاد', '👑 افسانه‌ای'];
    await bot.editMessageText(
      chatId,
      message.message_id,
      `⭐ **سطح ${user.level}** | ${levelNames[user.level] || 'قهرمان'}\n\n` +
      `✨ XP فعلی: ${user.xp}\n` +
      `📈 XP تا سطح بعد: ${user.level * 100 - user.xp}`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] } }
    );
    return;
  }
  
  // Theme menu
  if (data === 'theme') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎨 کلاسیک (رایگان)', callback_data: 'theme_default' }],
          [{ text: '🎨 طبیعت (100 سکه)', callback_data: 'theme_nature' }],
          [{ text: '🎨 نئون (200 سکه)', callback_data: 'theme_neon' }],
          [{ text: '🔙 برگشت', callback_data: 'main_menu' }]
        ]
      }
    };
    await bot.editMessageText(chatId, message.message_id, '🎨 انتخاب تم:', keyboard);
    return;
  }
  
  // Change theme
  if (data.startsWith('theme_')) {
    const themeName = data.split('_')[1];
    const user = getUser(userId);
    const themePrices = { default: 0, nature: 100, neon: 200 };
    
    if (user.coins >= themePrices[themeName]) {
      if (themePrices[themeName] > 0) {
        user.coins -= themePrices[themeName];
      }
      user.theme = themeName;
      updateUser(user);
      await bot.answerCallbackQuery(callbackQuery.id, `✅ تم ${THEMES[themeName].name} فعال شد!`, true);
    } else {
      await bot.answerCallbackQuery(callbackQuery.id, '❌ سکه کافی نیست!', true);
    }
    
    await bot.editMessageText(chatId, message.message_id, '🎨 تم تغییر کرد!', getMainMenu());
    return;
  }
});

// ================== ERROR HANDLING ==================
bot.on('error', (err) => {
  console.error('❌ خطا:', err);
});

// ================== LAUNCH ==================
console.log('🚀 ربات ماین‌سوییپر روی بله اجرا شد!');

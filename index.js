const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;

// ========== دیتابیس ساده (فایل JSON) ==========
const fs = require('fs');
const DB_FILE = 'data.json';

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: {}, games: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ========== تنظیمات بازی ==========
const BOARDS = {
  easy: { size: 4, mines: 2, name: '🍃 آسان', coin: 10 },
  normal: { size: 5, mines: 5, name: '⚙️ معمولی', coin: 25 },
  hard: { size: 6, mines: 10, name: '🔥 سخت', coin: 50 }
};

function createBoard(size, mines, firstClick) {
  const total = size * size;
  let board = Array(total).fill(0);
  
  // مین گذاری
  const safe = new Set();
  safe.add(firstClick);
  const x = Math.floor(firstClick / size);
  const y = firstClick % size;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        safe.add(nx * size + ny);
      }
    }
  }
  
  let positions = [];
  for (let i = 0; i < total; i++) if (!safe.has(i)) positions.push(i);
  for (let i = 0; i < mines; i++) {
    const rand = Math.floor(Math.random() * positions.length);
    board[positions[rand]] = '💣';
    positions.splice(rand, 1);
  }
  
  // اعداد
  for (let i = 0; i < total; i++) {
    if (board[i] === '💣') continue;
    let count = 0;
    const cx = Math.floor(i / size);
    const cy = i % size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          if (board[nx * size + ny] === '💣') count++;
        }
      }
    }
    board[i] = count;
  }
  
  return board;
}

// ========== رندر بازی ==========
function renderGame(board, revealed, flags, size) {
  const rows = [];
  for (let i = 0; i < size; i++) {
    const row = [];
    for (let j = 0; j < size; j++) {
      const idx = i * size + j;
      let char = '◻️';
      if (revealed[idx]) {
        if (board[idx] === '💣') char = '💣';
        else if (board[idx] === 0) char = '◽';
        else char = `${board[idx]}️⃣`;
      } else if (flags[idx]) {
        char = '🚩';
      }
      row.push({ text: char, callback_data: `open_${idx}` });
    }
    rows.push(row);
  }
  rows.push([
    { text: '🏠 منو', callback_data: 'menu' },
    { text: '🔄 جدید', callback_data: 'new' }
  ]);
  return { inline_keyboard: rows };
}

// ========== باز کردن سلول ==========
function revealCell(board, revealed, flags, size, idx) {
  if (revealed[idx] || flags[idx]) return false;
  if (board[idx] === '💣') return false;
  
  revealed[idx] = true;
  
  if (board[idx] === 0) {
    const x = Math.floor(idx / size);
    const y = idx % size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          const nidx = nx * size + ny;
          if (!revealed[nidx] && !flags[nidx] && board[nidx] !== '💣') {
            revealCell(board, revealed, flags, size, nidx);
          }
        }
      }
    }
  }
  return true;
}

function checkWin(board, revealed, mines, size) {
  let opened = 0;
  for (let i = 0; i < size * size; i++) {
    if (revealed[i]) opened++;
  }
  return opened === (size * size) - mines;
}

// ========== ارسال پیام ==========
async function send(chatId, text, keyboard = null) {
  try {
    await axios.post(`${API_URL}/sendMessage`, {
      chat_id: chatId,
      text: text,
      reply_markup: keyboard
    });
  } catch (e) { console.log(e.message); }
}

async function edit(chatId, msgId, text, keyboard = null) {
  try {
    await axios.post(`${API_URL}/editMessageText`, {
      chat_id: chatId,
      message_id: msgId,
      text: text,
      reply_markup: keyboard
    });
  } catch (e) { console.log(e.message); }
}

async function answer(cbId) {
  try {
    await axios.post(`${API_URL}/answerCallbackQuery`, { callback_query_id: cbId });
  } catch (e) {}
}

// ========== منو ==========
function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🎮 شروع بازی', callback_data: 'start_game' }],
      [{ text: '💰 سکه من', callback_data: 'my_coins' }],
      [{ text: '📊 آمار', callback_data: 'my_stats' }]
    ]
  };
}

// ========== پردازش ==========
let lastId = 0;
let gameStates = {}; // gameId -> { board, revealed, flags, size, mines, level, userId, startTime }

async function processUpdate(upd) {
  // پیام
  if (upd.message && upd.message.text === '/start') {
    const data = loadData();
    if (!data.users[upd.message.from.id]) {
      data.users[upd.message.from.id] = { coins: 100, wins: 0, losses: 0 };
      saveData(data);
    }
    const user = data.users[upd.message.from.id];
    await send(upd.message.chat.id, 
      `🎯 مین‌روب بله\n\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins}\n💀 باخت: ${user.losses}`,
      mainMenu());
    return;
  }
  
  // کالبک
  if (upd.callback_query) {
    const cb = upd.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const userId = cb.from.id;
    
    await answer(cb.id);
    
    if (data === 'menu') {
      const userData = loadData().users[userId] || { coins: 100, wins: 0, losses: 0 };
      await edit(chatId, msgId,
        `🎯 منوی اصلی\n💰 سکه: ${userData.coins}\n🏆 برد: ${userData.wins}`,
        mainMenu());
    }
    else if (data === 'start_game') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '🍃 آسان', callback_data: 'level_easy' }],
          [{ text: '⚙️ معمولی', callback_data: 'level_normal' }],
          [{ text: '🔥 سخت', callback_data: 'level_hard' }]
        ]
      };
      await edit(chatId, msgId, '🎲 سطح را انتخاب کن:', keyboard);
    }
    else if (data === 'my_coins') {
      const userData = loadData().users[userId] || { coins: 100 };
      await edit(chatId, msgId, `💰 سکه شما: ${userData.coins} 🪙`, mainMenu());
    }
    else if (data === 'my_stats') {
      const u = loadData().users[userId] || { wins: 0, losses: 0, coins: 100 };
      await edit(chatId, msgId, 
        `📊 آمار شما\n🏆 برد: ${u.wins}\n💀 باخت: ${u.losses}\n💰 سکه: ${u.coins}`,
        mainMenu());
    }
    else if (data.startsWith('level_')) {
      const level = data.replace('level_', '');
      const config = BOARDS[level];
      const gameId = `${chatId}_${userId}_${Date.now()}`;
      
      gameStates[gameId] = {
        size: config.size,
        mines: config.mines,
        level: level,
        userId: userId,
        board: null,
        revealed: Array(config.size * config.size).fill(false),
        flags: Array(config.size * config.size).fill(false),
        startTime: Date.now(),
        firstMove: true
      };
      
      // نمایش تخته خالی
      const dummyBoard = Array(config.size * config.size).fill(0);
      await edit(chatId, msgId,
        `🎮 ${config.name} | 💰 جایزه: ${config.coin}`,
        renderGame(dummyBoard, gameStates[gameId].revealed, gameStates[gameId].flags, config.size));
      
      // ذخیره gameId برای ادامه
      gameStates[gameId].messageId = msgId;
      gameStates[gameId].chatId = chatId;
    }
    else if (data.startsWith('open_')) {
      const idx = parseInt(data.replace('open_', ''));
      
      // پیدا کردن بازی فعال کاربر
      let currentGame = null;
      let currentGameId = null;
      for (let [gid, game] of Object.entries(gameStates)) {
        if (game.userId === userId && game.board !== null) {
          currentGame = game;
          currentGameId = gid;
          break;
        }
      }
      
      // اگه بازی تازه شروع شده
      if (!currentGame) {
        for (let [gid, game] of Object.entries(gameStates)) {
          if (game.userId === userId && game.firstMove === true) {
            currentGame = game;
            currentGameId = gid;
            const config = BOARDS[game.level];
            game.board = createBoard(config.size, config.mines, idx);
            game.firstMove = false;
            break;
          }
        }
      }
      
      if (!currentGame || currentGame.board === null) return;
      
      const config = BOARDS[currentGame.level];
      
      // چک مین
      if (currentGame.board[idx] === '💣') {
        // باخت
        const allData = loadData();
        if (!allData.users[userId]) allData.users[userId] = { coins: 100, wins: 0, losses: 0 };
        allData.users[userId].losses++;
        saveData(allData);
        
        // نمایش همه مین‌ها
        for (let i = 0; i < currentGame.board.length; i++) {
          if (currentGame.board[i] === '💣') currentGame.revealed[i] = true;
        }
        await edit(chatId, msgId,
          `💥 باختی! 💀\n⏱️ زمان: ${Math.floor((Date.now() - currentGame.startTime) / 1000)} ثانیه`,
          renderGame(currentGame.board, currentGame.revealed, currentGame.flags, currentGame.size));
        
        delete gameStates[currentGameId];
        return;
      }
      
      // باز کردن
      revealCell(currentGame.board, currentGame.revealed, currentGame.flags, currentGame.size, idx);
      
      // چک برد
      if (checkWin(currentGame.board, currentGame.revealed, currentGame.mines, currentGame.size)) {
        const reward = config.coin;
        const allData = loadData();
        if (!allData.users[userId]) allData.users[userId] = { coins: 100, wins: 0, losses: 0 };
        allData.users[userId].coins += reward;
        allData.users[userId].wins++;
        saveData(allData);
        
        await edit(chatId, msgId,
          `🎉 بردی! 🎉\n💰 +${reward} سکه\n⏱️ زمان: ${Math.floor((Date.now() - currentGame.startTime) / 1000)} ثانیه\n💎 موجودی: ${allData.users[userId].coins}`,
          renderGame(currentGame.board, currentGame.revealed, currentGame.flags, currentGame.size));
        
        delete gameStates[currentGameId];
        return;
      }
      
      // بروزرسانی تخته
      await edit(chatId, msgId,
        `💣 ${config.name}\n🎯 مرحله در حال پیشرفت...`,
        renderGame(currentGame.board, currentGame.revealed, currentGame.flags, currentGame.size));
    }
  }
}

// ========== پولینگ ==========
async function poll() {
  try {
    const res = await axios.post(`${API_URL}/getUpdates`, {
      offset: lastId + 1,
      timeout: 30
    });
    
    for (const upd of res.data.result) {
      await processUpdate(upd);
      if (upd.update_id > lastId) lastId = upd.update_id;
    }
  } catch(e) {}
}

setInterval(poll, 1500);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ربات روی پورت ${PORT} روشن شد!`));
app.get('/', (req, res) => res.send('ربات آنلاین است'));

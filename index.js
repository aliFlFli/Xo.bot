const express = require('express');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;

// ========== ذخیره lastId در فایل ==========
const OFFSET_FILE = 'offset.json';
function loadOffset() {
  try {
    return JSON.parse(fs.readFileSync(OFFSET_FILE, 'utf8')).lastId || 0;
  } catch {
    return 0;
  }
}
function saveOffset(lastId) {
  fs.writeFileSync(OFFSET_FILE, JSON.stringify({ lastId }));
}

let lastId = loadOffset();
console.log(`📌 آخرین offset: ${lastId}`);

// ========== دیتابیس JSON ==========
const DB_FILE = 'data.json';
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: {} };
  }
}
function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ========== تنظیمات ==========
const BOARDS = {
  easy: { size: 4, mines: 2, name: '🍃 آسان', coin: 10 },
  normal: { size: 5, mines: 5, name: '⚙️ معمولی', coin: 25 },
  hard: { size: 6, mines: 10, name: '🔥 سخت', coin: 50 }
};

// ========== توابع بازی ==========
function createBoard(size, mines, firstClick) {
  const total = size * size;
  let board = Array(total).fill(0);
  
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
  for (let i = 0; i < mines && positions.length > 0; i++) {
    const rand = Math.floor(Math.random() * positions.length);
    board[positions[rand]] = '💣';
    positions.splice(rand, 1);
  }
  
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

function revealCell(board, revealed, flags, size, idx) {
  if (revealed[idx] || flags[idx] || board[idx] === '💣') return false;
  
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

// ========== رندر ==========
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

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🎮 بازی جدید', callback_data: 'new_game' }],
      [{ text: '💰 کیف پول', callback_data: 'wallet' }, { text: '📊 آمار', callback_data: 'stats' }]
    ]
  };
}

// ========== ارسال ==========
async function sendMessage(chatId, text, keyboard = null) {
  try {
    await axios.post(`${API_URL}/sendMessage`, {
      chat_id: chatId,
      text: text,
      reply_markup: keyboard
    });
  } catch (e) {}
}

async function editMessage(chatId, msgId, text, keyboard = null) {
  try {
    await axios.post(`${API_URL}/editMessageText`, {
      chat_id: chatId,
      message_id: msgId,
      text: text,
      reply_markup: keyboard
    });
  } catch (e) {}
}

async function answerCallback(cbId) {
  try {
    await axios.post(`${API_URL}/answerCallbackQuery`, { callback_query_id: cbId });
  } catch (e) {}
}

// ========== حالت بازی ==========
let games = {}; // userId -> game data

// ========== پردازش ==========
async function processUpdate(update) {
  // پیام
  if (update.message && update.message.text === '/start') {
    const data = loadData();
    if (!data.users[update.message.from.id]) {
      data.users[update.message.from.id] = { coins: 100, wins: 0, losses: 0 };
      saveData(data);
    }
    const user = data.users[update.message.from.id];
    await sendMessage(update.message.chat.id,
      `🎯 مین‌روب\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins} | باخت: ${user.losses}`,
      mainMenu());
    return;
  }
  
  // کالبک
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const userId = cb.from.id;
    
    await answerCallback(cb.id);
    
    // منو
    if (data === 'menu') {
      const userData = loadData().users[userId] || { coins: 100, wins: 0, losses: 0 };
      await editMessage(chatId, msgId,
        `🎯 منوی اصلی\n💰 سکه: ${userData.coins}\n🏆 برد: ${userData.wins}`,
        mainMenu());
      delete games[userId];
    }
    // بازی جدید
    else if (data === 'new_game') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '🍃 آسان', callback_data: 'level_easy' }],
          [{ text: '⚙️ معمولی', callback_data: 'level_normal' }],
          [{ text: '🔥 سخت', callback_data: 'level_hard' }]
        ]
      };
      await editMessage(chatId, msgId, '🎲 سطح را انتخاب کن:', keyboard);
    }
    // کیف پول
    else if (data === 'wallet') {
      const userData = loadData().users[userId] || { coins: 100 };
      await editMessage(chatId, msgId, `💰 سکه شما: ${userData.coins} 🪙`, mainMenu());
    }
    // آمار
    else if (data === 'stats') {
      const u = loadData().users[userId] || { wins: 0, losses: 0, coins: 100 };
      await editMessage(chatId, msgId,
        `📊 آمار\n🏆 برد: ${u.wins}\n💀 باخت: ${u.losses}\n💰 سکه: ${u.coins}`,
        mainMenu());
    }
    // انتخاب سطح
    else if (data.startsWith('level_')) {
      const level = data.replace('level_', '');
      const config = BOARDS[level];
      
      games[userId] = {
        level: level,
        size: config.size,
        mines: config.mines,
        coin: config.coin,
        board: null,
        revealed: Array(config.size * config.size).fill(false),
        flags: Array(config.size * config.size).fill(false),
        startTime: Date.now(),
        waitingFirstClick: true
      };
      
      const dummyBoard = Array(config.size * config.size).fill(0);
      await editMessage(chatId, msgId,
        `🎮 ${config.name} | 🎁 ${config.coin} سکه\n◻️ کلیک کن شروع بشه!`,
        renderGame(dummyBoard, games[userId].revealed, games[userId].flags, config.size));
    }
    // باز کردن سلول
    else if (data.startsWith('open_')) {
      const idx = parseInt(data.replace('open_', ''));
      const game = games[userId];
      
      if (!game) {
        await editMessage(chatId, msgId, 'بازی یافت نشد! /start کن', mainMenu());
        return;
      }
      
      const config = BOARDS[game.level];
      
      // اولین کلیک - ساخت تخته
      if (game.waitingFirstClick) {
        game.board = createBoard(game.size, game.mines, idx);
        game.waitingFirstClick = false;
      }
      
      // برخورد با مین
      if (game.board[idx] === '💣') {
        const allData = loadData();
        if (!allData.users[userId]) allData.users[userId] = { coins: 100, wins: 0, losses: 0 };
        allData.users[userId].losses++;
        saveData(allData);
        
        for (let i = 0; i < game.board.length; i++) {
          if (game.board[i] === '💣') game.revealed[i] = true;
        }
        await editMessage(chatId, msgId,
          `💥 باختی!\n⏱️ ${Math.floor((Date.now() - game.startTime) / 1000)} ثانیه`,
          renderGame(game.board, game.revealed, game.flags, game.size));
        
        delete games[userId];
        return;
      }
      
      // باز کردن سلول
      revealCell(game.board, game.revealed, game.flags, game.size, idx);
      
      // چک برد
      if (checkWin(game.board, game.revealed, game.mines, game.size)) {
        const allData = loadData();
        if (!allData.users[userId]) allData.users[userId] = { coins: 100, wins: 0, losses: 0 };
        allData.users[userId].coins += game.coin;
        allData.users[userId].wins++;
        saveData(allData);
        
        await editMessage(chatId, msgId,
          `🎉 بردی! 🎉\n💰 +${game.coin} سکه\n⏱️ ${Math.floor((Date.now() - game.startTime) / 1000)} ثانیه\n💎 مجموع: ${allData.users[userId].coins}`,
          renderGame(game.board, game.revealed, game.flags, game.size));
        
        delete games[userId];
        return;
      }
      
      // بروزرسانی تخته
      await editMessage(chatId, msgId,
        `🎮 ${config.name} | ⏱️ ${Math.floor((Date.now() - game.startTime) / 1000)}s`,
        renderGame(game.board, game.revealed, game.flags, game.size));
    }
  }
}

// ========== پولینگ با تاخیر 2 ثانیه ==========
async function pollUpdates() {
  try {
    const res = await axios.post(`${API_URL}/getUpdates`, {
      offset: lastId + 1,
      timeout: 30
    });
    
    const updates = res.data.result;
    if (updates && updates.length > 0) {
      console.log(`📨 ${updates.length} آپدیت جدید`);
      for (const update of updates) {
        await processUpdate(update);
        if (update.update_id > lastId) {
          lastId = update.update_id;
          saveOffset(lastId);
        }
      }
    }
  } catch (err) {
    // بیصدا رد میشه
  }
}

// ========== سرور ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ربات روی پورت ${PORT} روشن شد`));
app.get('/', (req, res) => res.send('ربات آنلاین است'));

// پولینگ هر 2 ثانیه (کمتر از قبل = کمتر لگ)
setInterval(pollUpdates, 2000);
console.log('✅ ربات آماده است');

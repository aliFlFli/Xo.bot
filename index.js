require('dotenv').config();

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();

app.use(express.json());

// ================= CONFIG =================

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;

// ================= DATABASE =================

const db = new Database('game.db');

// USERS

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  coins INTEGER DEFAULT 100,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0
)
`).run();

// OFFSET

db.prepare(`
CREATE TABLE IF NOT EXISTS bot (
  key TEXT PRIMARY KEY,
  value TEXT
)
`).run();

// ================= OFFSET =================

function getOffset() {

  const row = db.prepare(`
    SELECT value FROM bot
    WHERE key = 'offset'
  `).get();

  return row ? Number(row.value) : 0;
}

function saveOffset(offset) {

  db.prepare(`
    INSERT OR REPLACE INTO bot
    (key, value)
    VALUES ('offset', ?)
  `).run(String(offset));
}

let lastUpdateId = getOffset();

// ================= USERS =================

function getUser(id) {

  let user = db.prepare(`
    SELECT * FROM users
    WHERE id = ?
  `).get(id);

  if (!user) {

    db.prepare(`
      INSERT INTO users
      (id)
      VALUES (?)
    `).run(id);

    user = db.prepare(`
      SELECT * FROM users
      WHERE id = ?
    `).get(id);
  }

  return user;
}

function addWin(id, reward) {

  db.prepare(`
    UPDATE users
    SET
      wins = wins + 1,
      coins = coins + ?
    WHERE id = ?
  `).run(reward, id);
}

function addLoss(id) {

  db.prepare(`
    UPDATE users
    SET losses = losses + 1
    WHERE id = ?
  `).run(id);
}

// ================= MEMORY =================

const games = {};
const clickLocks = {};

// ================= SETTINGS =================

const BOARDS = {

  easy: {
    size: 4,
    mines: 2,
    reward: 10,
    name: '🍃 آسان'
  },

  normal: {
    size: 5,
    mines: 5,
    reward: 25,
    name: '⚙️ معمولی'
  },

  hard: {
    size: 6,
    mines: 10,
    reward: 50,
    name: '🔥 سخت'
  }
};

// ================= HELPERS =================

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ================= GAME =================

function createBoard(size, mines, firstClick) {

  const total = size * size;

  const board = Array(total).fill(0);

  const safe = new Set();

  const fx = Math.floor(firstClick / size);
  const fy = firstClick % size;

  for (let dx = -1; dx <= 1; dx++) {

    for (let dy = -1; dy <= 1; dy++) {

      const nx = fx + dx;
      const ny = fy + dy;

      if (
        nx >= 0 &&
        nx < size &&
        ny >= 0 &&
        ny < size
      ) {
        safe.add(nx * size + ny);
      }
    }
  }

  const available = [];

  for (let i = 0; i < total; i++) {

    if (!safe.has(i)) {
      available.push(i);
    }
  }

  for (let i = 0; i < mines; i++) {

    const rand =
      Math.floor(Math.random() * available.length);

    const pos = available[rand];

    board[pos] = '💣';

    available.splice(rand, 1);
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
          nx >= 0 &&
          nx < size &&
          ny >= 0 &&
          ny < size
        ) {

          if (
            board[nx * size + ny] === '💣'
          ) {
            count++;
          }
        }
      }
    }

    board[i] = count;
  }

  return board;
}

function reveal(
  board,
  revealed,
  size,
  idx
) {

  if (revealed[idx]) return;

  revealed[idx] = true;

  if (board[idx] !== 0) return;

  const x = Math.floor(idx / size);
  const y = idx % size;

  for (let dx = -1; dx <= 1; dx++) {

    for (let dy = -1; dy <= 1; dy++) {

      const nx = x + dx;
      const ny = y + dy;

      if (
        nx >= 0 &&
        nx < size &&
        ny >= 0 &&
        ny < size
      ) {

        const ni = nx * size + ny;

        if (
          !revealed[ni] &&
          board[ni] !== '💣'
        ) {

          reveal(
            board,
            revealed,
            size,
            ni
          );
        }
      }
    }
  }
}

function checkWin(game) {

  let opened = 0;

  for (const r of game.revealed) {
    if (r) opened++;
  }

  return (
    opened ===
    game.size * game.size - game.mines
  );
}

// ================= UI =================

function mainMenu() {

  return {
    inline_keyboard: [

      [
        {
          text: '🎮 بازی جدید',
          callback_data: 'new'
        }
      ],

      [
        {
          text: '💰 کیف پول',
          callback_data: 'wallet'
        },

        {
          text: '📊 آمار',
          callback_data: 'stats'
        }
      ]
    ]
  };
}

function levelMenu() {

  return {
    inline_keyboard: [

      [
        {
          text: '🍃 آسان',
          callback_data: 'lv_easy'
        }
      ],

      [
        {
          text: '⚙️ معمولی',
          callback_data: 'lv_normal'
        }
      ],

      [
        {
          text: '🔥 سخت',
          callback_data: 'lv_hard'
        }
      ]
    ]
  };
}

function renderGame(game) {

  const rows = [];

  for (let i = 0; i < game.size; i++) {

    const row = [];

    for (let j = 0; j < game.size; j++) {

      const idx = i * game.size + j;

      let emoji = '◼️';

      if (game.revealed[idx]) {

        if (game.board[idx] === '💣') {
          emoji = '💣';
        }

        else if (game.board[idx] === 0) {
          emoji = '⬜';
        }

        else {
          emoji = `${game.board[idx]}️⃣`;
        }
      }

      row.push({
        text: emoji,
        callback_data: `o_${idx}`
      });
    }

    rows.push(row);
  }

  rows.push([
    {
      text: '🏠 منو',
      callback_data: 'menu'
    }
  ]);

  return {
    inline_keyboard: rows
  };
}

// ================= API =================

async function sendMessage(
  chatId,
  text,
  keyboard = null
) {

  try {

    await axios.post(
      `${API_URL}/sendMessage`,
      {
        chat_id: chatId,
        text,
        reply_markup: keyboard
      }
    );

  } catch (e) {

    console.log(
      'Send Error:',
      e.response?.data || e.message
    );
  }
}

async function editMessage(
  chatId,
  msgId,
  text,
  keyboard = null
) {

  try {

    await axios.post(
      `${API_URL}/editMessageText`,
      {
        chat_id: chatId,
        message_id: msgId,
        text,
        reply_markup: keyboard
      }
    );

  } catch (e) {

    const err =
      e.response?.data || e.message;

    if (
      JSON.stringify(err)
        .includes('not modified')
    ) return;

    console.log('Edit Error:', err);
  }
}

async function answerCallback(id) {

  try {

    await axios.post(
      `${API_URL}/answerCallbackQuery`,
      {
        callback_query_id: id
      }
    );

  } catch {}
}

// ================= HANDLER =================

async function handleUpdate(update) {

  // START

  if (
    update.message &&
    update.message.text === '/start'
  ) {

    const user =
      getUser(update.message.from.id);

    return sendMessage(

      update.message.chat.id,

      `🎮 مین روب حرفه‌ای

💰 سکه: ${user.coins}
🏆 برد: ${user.wins}
💀 باخت: ${user.losses}`,

      mainMenu()
    );
  }

  // CALLBACK

  if (!update.callback_query) return;

  const cb = update.callback_query;

  const userId = cb.from.id;

  const chatId = cb.message.chat.id;

  const msgId = cb.message.message_id;

  const data = cb.data;

  // ================= ANTI SPAM =================

  if (clickLocks[userId]) return;

  clickLocks[userId] = true;

  setTimeout(() => {
    delete clickLocks[userId];
  }, 350);

  // =================

  await answerCallback(cb.id);

  // MENU

  if (data === 'menu') {

    delete games[userId];

    const user = getUser(userId);

    return editMessage(

      chatId,
      msgId,

      `🏠 منوی اصلی

💰 سکه: ${user.coins}
🏆 برد: ${user.wins}
💀 باخت: ${user.losses}`,

      mainMenu()
    );
  }

  // NEW

  if (data === 'new') {

    return editMessage(
      chatId,
      msgId,
      '🎯 انتخاب سطح:',
      levelMenu()
    );
  }

  // WALLET

  if (data === 'wallet') {

    const user = getUser(userId);

    return editMessage(

      chatId,
      msgId,

      `💰 موجودی:

${user.coins} سکه 🪙`,

      mainMenu()
    );
  }

  // STATS

  if (data === 'stats') {

    const user = getUser(userId);

    return editMessage(

      chatId,
      msgId,

      `📊 آمار شما

🏆 برد: ${user.wins}
💀 باخت: ${user.losses}`,

      mainMenu()
    );
  }

  // LEVEL

  if (data.startsWith('lv_')) {

    const level =
      data.replace('lv_', '');

    const cfg = BOARDS[level];

    games[userId] = {

      level,

      size: cfg.size,

      mines: cfg.mines,

      reward: cfg.reward,

      board: null,

      waiting: true,

      createdAt: Date.now(),

      revealed: Array(
        cfg.size * cfg.size
      ).fill(false)
    };

    return editMessage(

      chatId,
      msgId,

      `🎮 ${cfg.name}

💰 جایزه: ${cfg.reward}

روی خونه‌ها کلیک کن 👇`,

      renderGame({

        size: cfg.size,

        board: Array(
          cfg.size * cfg.size
        ).fill(0),

        revealed: Array(
          cfg.size * cfg.size
        ).fill(false)
      })
    );
  }

  // OPEN

  if (data.startsWith('o_')) {

    const idx =
      parseInt(data.split('_')[1]);

    const game = games[userId];

    if (!game) return;

    if (game.revealed[idx]) return;

    // CREATE BOARD

    if (game.waiting) {

      game.board = createBoard(
        game.size,
        game.mines,
        idx
      );

      game.waiting = false;
    }

    // MINE

    if (game.board[idx] === '💣') {

      for (
        let i = 0;
        i < game.board.length;
        i++
      ) {

        if (
          game.board[i] === '💣'
        ) {

          game.revealed[i] = true;
        }
      }

      addLoss(userId);

      await editMessage(

        chatId,
        msgId,

        '💥 باختی!',

        renderGame(game)
      );

      delete games[userId];

      return;
    }

    // REVEAL

    reveal(
      game.board,
      game.revealed,
      game.size,
      idx
    );

    // WIN

    if (checkWin(game)) {

      addWin(
        userId,
        game.reward
      );

      await editMessage(

        chatId,
        msgId,

        `🎉 برنده شدی!

💰 +${game.reward} سکه`,

        renderGame(game)
      );

      delete games[userId];

      return;
    }

    // UPDATE

    return editMessage(

      chatId,
      msgId,

      '🎮 بازی در حال اجرا...',

      renderGame(game)
    );
  }
}

// ================= POLLING =================

let isPolling = false;

async function poll() {

  if (isPolling) return;

  isPolling = true;

  try {

    const res = await axios.post(

      `${API_URL}/getUpdates`,

      {
        offset: lastUpdateId + 1,
        timeout: 20
      },

      {
        timeout: 25000
      }
    );

    const updates =
      res.data.result || [];

    for (const update of updates) {

      if (
        update.update_id <=
        lastUpdateId
      ) continue;

      lastUpdateId =
        update.update_id;

      saveOffset(lastUpdateId);

      await handleUpdate(update);
    }

  } catch (e) {

    console.log(
      'Polling Error:',
      e.response?.data || e.message
    );

    await sleep(2000);

  } finally {

    isPolling = false;

    setTimeout(poll, 1000);
  }
}

// ================= CLEANUP =================

setInterval(() => {

  const now = Date.now();

  for (const userId in games) {

    if (
      now - games[userId].createdAt >
      30 * 60 * 1000
    ) {

      delete games[userId];
    }
  }

}, 60000);

// ================= SERVER =================

app.get('/', (req, res) => {
  res.send('Bot Online');
});

app.listen(PORT, () => {

  console.log(
    `🚀 Server Running ${PORT}`
  );
});

// ================= START =================

console.log('✅ Bot Started');

poll();

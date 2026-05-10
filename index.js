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
  let user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  if (!user) {
    db.prepare(`INSERT INTO users (id) VALUES (?)`).run(id);
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  }
  return user;
}

// ================= GAME STATE =================
const games = new Map(); // uid => game

const LEVELS = {
  easy:   { size: 5,  mines: 5,  reward: 15,  name: '🍃 آسان' },
  normal: { size: 6,  mines: 8,  reward: 35,  name: '⚙️ معمولی' },
  hard:   { size: 7,  mines: 14, reward: 70,  name: '🔥 سخت' }
};

// ================= BOARD CREATION =================
function createBoard(size, mines, firstClick) {
  const total = size * size;
  let board = Array(total).fill(0);
  const safeSet = new Set();

  // 3x3 اطراف اولین کلیک امن باشه
  const fx = Math.floor(firstClick / size);
  const fy = firstClick % size;

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      const nx = fx + x, ny = fy + y;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        safeSet.add(nx * size + ny);
      }
    }
  }

  let positions = [];
  for (let i = 0; i < total; i++) {
    if (!safeSet.has(i)) positions.push(i);
  }

  // قرار دادن مین‌ها
  for (let i = 0; i < mines; i++) {
    const rand = Math.floor(Math.random() * positions.length);
    board[positions[rand]] = '💣';
    positions.splice(rand, 1);
  }

  // شمارش اعداد
  for (let i = 0; i < total; i++) {
    if (board[i] === '💣') continue;
    let count = 0;
    const x = Math.floor(i / size), y = i % size;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && board[nx*size + ny] === '💣') {
          count++;
        }
      }
    }
    board[i] = count;
  }

  return board;
}

// ================= FLOOD FILL =================
function flood(game, idx) {
  if (game.revealed[idx] || game.flags[idx]) return;
  game.revealed[idx] = true;

  if (game.board[idx] !== 0) return;

  const size = game.size;
  const x = Math.floor(idx / size);
  const y = idx % size;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        flood(game, nx * size + ny);
      }
    }
  }
}

// ================= RENDER =================
function render(game) {
  const rows = [];
  const remainingMines = game.mines - game.flags.filter(Boolean).length;

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
    { text: `⛳ ${remainingMines}`, callback_data: 'noop' },
    { text: '🏠 منو', callback_data: 'menu' },
    { text: '🔄 دوباره', callback_data: 'new' }
  ]);

  return { inline_keyboard: rows };
}

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const update = req.body;

  try {
    if (update.message?.text === '/start') {
      const user = getUser(update.message.from.id);
      await axios.post(`${API}/sendMessage`, {
        chat_id: update.message.chat.id,
        text: `🎮 **مین‌روب پرو**\n\n💰 ${user.coins} سکه\n🏆 ${user.wins} برد\n💀 ${user.losses} باخت`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🎮 بازی جدید', callback_data: 'select_level' }]]
        }
      });
      return;
    }

    if (!update.callback_query) return;

    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const userId = cb.from.id;

    // Anti-spam
    if (games.has(userId) && games.get(userId).clickLock) return;
    if (games.has(userId)) games.get(userId).clickLock = true;

    // انتخاب سطح
    if (data === 'select_level') {
      const buttons = Object.keys(LEVELS).map(lvl => [{
        text: LEVELS[lvl].name,
        callback_data: `level_${lvl}`
      }]);

      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: ' difficulty سطح难度 رو انتخاب کن:',
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    // شروع بازی با سطح انتخابی
    if (data.startsWith('level_')) {
      const levelKey = data.split('_')[1];
      const level = LEVELS[levelKey];

      games.set(userId, {
        ...level,
        board: null,
        revealed: Array(level.size * level.size).fill(false),
        flags: Array(level.size * level.size).fill(false),
        first: true,
        clickLock: false
      });

      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: `🎮 ${level.name} — شروع شد!\n⛳ مین: ${level.mines}`,
        reply_markup: render(games.get(userId))
      });
      return;
    }

    const game = games.get(userId);
    if (!game) return;

    // کلیک روی خانه
    if (data.startsWith('c_')) {
      const idx = +data.split('_')[1];

      if (game.first) {
        game.board = createBoard(game.size, game.mines, idx);
        game.first = false;
      }

      // باخت
      if (game.board[idx] === '💣') {
        game.revealed.fill(true);
        // loss logic
        db.prepare(`UPDATE users SET losses = losses + 1 WHERE id = ?`).run(userId);

        await axios.post(`${API}/editMessageText`, {
          chat_id: chatId,
          message_id: msgId,
          text: '💥 باختی! دوباره سعی کن.',
          reply_markup: render(game)
        });
        games.delete(userId);
        return;
      }

      flood(game, idx);

      // چک برد
      const revealedCount = game.revealed.filter(Boolean).length;
      if (revealedCount === game.size * game.size - game.mines) {
        db.prepare(`UPDATE users SET wins = wins + 1, coins = coins + ? WHERE id = ?`)
          .run(game.reward, userId);

        await axios.post(`${API}/editMessageText`, {
          chat_id: chatId,
          message_id: msgId,
          text: `🎉 تبریک! بردی +${game.reward} سکه`,
          reply_markup: render(game)
        });
        games.delete(userId);
        return;
      }

      // ادامه بازی
      await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: `🎮 در حال بازی...`,
        reply_markup: render(game)
      });
    }

    // دکمه‌های دیگر
    if (data === 'menu' || data === 'new') {
      games.delete(userId);
      // برگشت به منو
    }

  } catch (err) {
    console.error(err);
  }
});

app.get('/', (req, res) => res.send('Minesweeper Bot Running 🚀'));
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));

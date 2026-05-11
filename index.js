require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ======================
// CONFIG
// ======================

const TOKEN = process.env.BOT_TOKEN;
const API = `https://tapi.bale.ai/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;

// ======================
// GAME DATA
// ======================

const games = {};

// ======================
// SEND MESSAGE
// ======================

async function sendMessage(chatId, text, keyboard = null) {
  try {
    await axios.post(`${API}/sendMessage`, {
      chat_id: chatId,
      text,
      reply_markup: keyboard
    });
  } catch (err) {
    console.log(err.response?.data || err.message);
  }
}

// ======================
// CREATE GAME
// ======================

function createBoard() {
  let cells = [];

  // 9 خونه
  for (let i = 0; i < 9; i++) {
    cells.push("safe");
  }

  // یک بمب
  const bombIndex = Math.floor(Math.random() * 9);
  cells[bombIndex] = "bomb";

  return cells;
}

// ======================
// KEYBOARD
// ======================

function gameKeyboard(userId) {
  const board = games[userId].board;
  const opened = games[userId].opened;

  let keyboard = {
    inline_keyboard: []
  };

  for (let row = 0; row < 3; row++) {
    let line = [];

    for (let col = 0; col < 3; col++) {
      let index = row * 3 + col;

      let text = "⬜";

      if (opened.includes(index)) {
        if (board[index] === "bomb") {
          text = "💣";
        } else {
          text = "✅";
        }
      }

      line.push({
        text,
        callback_data: `cell_${index}`
      });
    }

    keyboard.inline_keyboard.push(line);
  }

  return keyboard;
}

// ======================
// START GAME
// ======================

async function startGame(chatId, userId) {
  games[userId] = {
    board: createBoard(),
    opened: []
  };

  await sendMessage(
    chatId,
    "🎮 بازی مین‌روب شروع شد!\n\nیکی از خونه‌ها بمبه 💣",
    gameKeyboard(userId)
  );
}

// ======================
// WEBHOOK
// ======================

app.post('/', async (req, res) => {
  const update = req.body;

  try {

    // ======================
    // MESSAGE
    // ======================

    if (update.message) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const text = update.message.text;

      if (text === '/start') {
        await sendMessage(
          chatId,
          'سلام 👋\nبرای شروع بازی دستور /game را بزن'
        );
      }

      if (text === '/game') {
        await startGame(chatId, userId);
      }
    }

    // ======================
    // CALLBACK
    // ======================

    if (update.callback_query) {

      const query = update.callback_query;

      const userId = query.from.id;
      const chatId = query.message.chat.id;
      const data = query.data;

      if (!games[userId]) {
        return res.sendStatus(200);
      }

      const index = Number(data.split('_')[1]);

      if (games[userId].opened.includes(index)) {
        return res.sendStatus(200);
      }

      games[userId].opened.push(index);

      const board = games[userId].board;

      // باخت
      if (board[index] === "bomb") {

        await sendMessage(
          chatId,
          '💥 باختی!\nبمب رو پیدا کردی.',
          gameKeyboard(userId)
        );

        delete games[userId];

      } else {

        // برد
        if (games[userId].opened.length === 8) {

          await sendMessage(
            chatId,
            '🏆 بردی!\nهمه خونه‌ها سالم بودن.',
            gameKeyboard(userId)
          );

          delete games[userId];

        } else {

          await sendMessage(
            chatId,
            'ادامه بده 👀',
            gameKeyboard(userId)
          );
        }
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

// ======================
// RUN SERVER
// ======================

app.listen(PORT, () => {
  console.log(`BOT RUNNING ON ${PORT}`);
});

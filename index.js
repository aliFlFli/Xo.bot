require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();

app.use(express.json());

// ================= CONFIG =================

const TOKEN = process.env.BOT_TOKEN;
const API = `https://tapi.bale.ai/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;

// ================= GAME DATA =================

const games = {};

// ================= HOME =================

app.get('/', (req, res) => {
  res.send('Bot is running ✅');
});

// ================= SEND MESSAGE =================

async function sendMessage(chatId, text, keyboard = null) {
  try {

    const data = {
      chat_id: chatId,
      text: text
    };

    if (keyboard) {
      data.reply_markup = keyboard;
    }

    const res = await axios.post(`${API}/sendMessage`, data);

    console.log('MESSAGE SENT:', res.data);

  } catch (err) {

    console.log('SEND ERROR');

    if (err.response) {
      console.log(err.response.data);
    } else {
      console.log(err.message);
    }
  }
}

// ================= CREATE BOARD =================

function createBoard() {

  let board = [];

  for (let i = 0; i < 9; i++) {
    board.push('safe');
  }

  const bomb = Math.floor(Math.random() * 9);

  board[bomb] = 'bomb';

  return board;
}

// ================= KEYBOARD =================

function createKeyboard(userId) {

  const game = games[userId];

  let keyboard = {
    inline_keyboard: []
  };

  for (let row = 0; row < 3; row++) {

    let rowButtons = [];

    for (let col = 0; col < 3; col++) {

      const index = row * 3 + col;

      let text = '⬜';

      if (game.opened.includes(index)) {

        if (game.board[index] === 'bomb') {
          text = '💣';
        } else {
          text = '✅';
        }
      }

      rowButtons.push({
        text,
        callback_data: `cell_${index}`
      });
    }

    keyboard.inline_keyboard.push(rowButtons);
  }

  return keyboard;
}

// ================= START GAME =================

async function startGame(chatId, userId) {

  games[userId] = {
    board: createBoard(),
    opened: []
  };

  await sendMessage(
    chatId,
    '🎮 بازی شروع شد!\nیکی از خونه‌ها بمبه 💣',
    createKeyboard(userId)
  );
}

// ================= WEBHOOK =================

app.post('/', async (req, res) => {

  console.log('UPDATE:');
  console.log(JSON.stringify(req.body, null, 2));

  try {

    const update = req.body;

    // ================= MESSAGE =================

    if (update.message) {

      const message = update.message;

      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = message.text;

      console.log('MESSAGE:', text);

      // START

      if (text === '/start') {

        await sendMessage(
          chatId,
          'سلام 👋\nبرای شروع بازی دستور /game را بزن'
        );
      }

      // GAME

      if (text === '/game') {

        await startGame(chatId, userId);
      }
    }

    // ================= CALLBACK =================

    if (update.callback_query) {

      const query = update.callback_query;

      const userId = query.from.id;
      const chatId = query.message.chat.id;

      const data = query.data;

      console.log('CALLBACK:', data);

      if (!games[userId]) {
        return res.sendStatus(200);
      }

      const index = Number(data.split('_')[1]);

      if (games[userId].opened.includes(index)) {
        return res.sendStatus(200);
      }

      games[userId].opened.push(index);

      const board = games[userId].board;

      // ================= LOSE =================

      if (board[index] === 'bomb') {

        await sendMessage(
          chatId,
          '💥 باختی!',
          createKeyboard(userId)
        );

        delete games[userId];

      } else {

        // ================= WIN =================

        if (games[userId].opened.length >= 8) {

          await sendMessage(
            chatId,
            '🏆 بردی!',
            createKeyboard(userId)
          );

          delete games[userId];

        } else {

          await sendMessage(
            chatId,
            'ادامه بده 👀',
            createKeyboard(userId)
          );
        }
      }
    }

    res.sendStatus(200);

  } catch (err) {

    console.log('MAIN ERROR');

    if (err.response) {
      console.log(err.response.data);
    } else {
      console.log(err.message);
    }

    res.sendStatus(500);
  }
});

// ================= RUN =================

app.listen(PORT, () => {
  console.log(`BOT RUNNING ON ${PORT}`);
});

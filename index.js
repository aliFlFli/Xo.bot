require('dotenv').config();

const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

// ================= CONFIG =================

const TOKEN = process.env.BOT_TOKEN;
const API = `https://tapi.bale.ai/bot${TOKEN}`;

const PORT = process.env.PORT || 3000;

const db = new Database('database.db');

// ================= DATABASE =================

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100
)
`).run();

// ================= GAME STORAGE =================

const games = new Map();

// ================= FUNCTIONS =================

function getUser(userId) {
    let user = db.prepare(`
        SELECT * FROM users WHERE user_id = ?
    `).get(userId);

    if (!user) {
        db.prepare(`
            INSERT INTO users (user_id)
            VALUES (?)
        `).run(userId);

        user = {
            user_id: userId,
            coins: 100
        };
    }

    return user;
}

function updateCoins(userId, amount) {
    db.prepare(`
        UPDATE users
        SET coins = coins + ?
        WHERE user_id = ?
    `).run(amount, userId);
}

function generateBoard(size, mines) {
    const board = [];

    for (let y = 0; y < size; y++) {
        board[y] = [];

        for (let x = 0; x < size; x++) {
            board[y][x] = 0;
        }
    }

    let placed = 0;

    while (placed < mines) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);

        if (board[y][x] !== 'M') {
            board[y][x] = 'M';
            placed++;
        }
    }

    return board;
}

function createKeyboard(game) {
    const keyboard = [];

    for (let y = 0; y < game.size; y++) {
        const row = [];

        for (let x = 0; x < game.size; x++) {

            let text = '⬜';

            if (game.revealed[y][x]) {

                if (game.board[y][x] === 'M') {
                    text = '💣';
                } else {
                    text = '🟩';
                }
            }

            row.push({
                text,
                callback_data: `cell_${x}_${y}`
            });
        }

        keyboard.push(row);
    }

    return {
        inline_keyboard: keyboard
    };
}

async function sendMessage(chatId, text, keyboard = null) {

    await axios.post(`${API}/sendMessage`, {
        chat_id: chatId,
        text,
        reply_markup: keyboard
    });
}

async function editMessage(chatId, messageId, text, keyboard = null) {

    await axios.post(`${API}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: keyboard
    });
}

// ================= WEBHOOK =================

app.post('/', async (req, res) => {

    res.sendStatus(200);

    const update = req.body;

    // ================= MESSAGE =================

    if (update.message) {

        const msg = update.message;
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        const user = getUser(userId);

        // ===== START =====

        if (text === '/start') {

            return sendMessage(
                chatId,
                `🎮 به ربات مین‌روب خوش اومدی\n\n💰 سکه: ${user.coins}\n\n/startgame برای شروع`
            );
        }

        // ===== START GAME =====

        if (text === '/startgame') {

            if (user.coins < 10) {
                return sendMessage(chatId, '❌ سکه کافی نداری');
            }

            updateCoins(userId, -10);

            const game = {
                size: 4,
                mines: 3,
                board: generateBoard(4, 3),
                revealed: Array(4).fill().map(() => Array(4).fill(false)),
                safeCells: 13,
                opened: 0,
                messageId: null
            };

            games.set(userId, game);

            const sent = await axios.post(`${API}/sendMessage`, {
                chat_id: chatId,
                text: `💣 بازی شروع شد\n\n🎯 مین‌ها: 3\n💰 جایزه: 25 سکه`,
                reply_markup: createKeyboard(game)
            });

            game.messageId = sent.data.result.message_id;

            return;
        }
    }

    // ================= CALLBACK =================

    if (update.callback_query) {

        const query = update.callback_query;

        const data = query.data;

        const userId = query.from.id;
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        const game = games.get(userId);

        if (!game) return;

        const parts = data.split('_');

        const x = Number(parts[1]);
        const y = Number(parts[2]);

        if (game.revealed[y][x]) return;

        game.revealed[y][x] = true;

        // ===== BOMB =====

        if (game.board[y][x] === 'M') {

            for (let yy = 0; yy < game.size; yy++) {
                for (let xx = 0; xx < game.size; xx++) {

                    if (game.board[yy][xx] === 'M') {
                        game.revealed[yy][xx] = true;
                    }
                }
            }

            games.delete(userId);

            return editMessage(
                chatId,
                messageId,
                '💥 باختی!\n\n❌ مین منفجر شد',
                createKeyboard(game)
            );
        }

        game.opened++;

        // ===== WIN =====

        if (game.opened >= game.safeCells) {

            updateCoins(userId, 25);

            games.delete(userId);

            return editMessage(
                chatId,
                messageId,
                '🏆 بردی!\n\n💰 25 سکه گرفتی',
                createKeyboard(game)
            );
        }

        return editMessage(
            chatId,
            messageId,
            `🎮 بازی ادامه دارد\n\n✅ خانه‌های باز شده: ${game.opened}`,
            createKeyboard(game)
        );
    }
});

// ================= START SERVER =================

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});

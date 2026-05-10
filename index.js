require('dotenv').config();

const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

// ================= CONFIG =================

const TOKEN = process.env.BOT_TOKEN;

// API درست بله
const API = `https://tapi.bale.ai/bot${TOKEN}`;

const PORT = process.env.PORT || 3000;

// ================= DATABASE =================

const db = new Database('data.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100
)
`).run();

// ================= GAME STORAGE =================

const games = new Map();

// ================= USER =================

function getUser(id) {
    let user = db.prepare(`SELECT * FROM users WHERE user_id=?`).get(id);

    if (!user) {
        db.prepare(`INSERT INTO users (user_id, coins) VALUES (?,100)`).run(id);
        user = { user_id: id, coins: 100 };
    }

    return user;
}

function addCoins(id, amount) {
    db.prepare(`UPDATE users SET coins = coins + ? WHERE user_id=?`).run(amount, id);
}

// ================= BOARD =================

function createBoard(size, mines) {
    const board = Array.from({ length: size }, () =>
        Array(size).fill(0)
    );

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

// ================= KEYBOARD =================

function keyboard(game) {
    const kb = [];

    for (let y = 0; y < game.size; y++) {
        const row = [];

        for (let x = 0; x < game.size; x++) {

            let text = '⬜';

            if (game.open[y][x]) {
                text = game.board[y][x] === 'M' ? '💣' : '🟩';
            }

            row.push({
                text,
                callback_data: `c_${x}_${y}`
            });
        }

        kb.push(row);
    }

    return { inline_keyboard: kb };
}

// ================= SEND =================

async function sendMessage(chatId, text, kb) {
    try {
        await axios.post(`${API}/sendMessage`, {
            chat_id: chatId,
            text,
            reply_markup: kb
        });
    } catch (e) {
        console.log("SEND ERROR:", e.response?.data || e.message);
    }
}

// ================= HEALTH CHECK =================

app.get('/', (req, res) => {
    res.send('✅ Bot is running');
});

// ================= WEBHOOK =================

app.post('/', async (req, res) => {

    res.sendStatus(200);

    try {

        console.log("📦 UPDATE:");
        console.log(JSON.stringify(req.body, null, 2));

        const update = req.body;

        if (!update.message && !update.callback_query) return;

        // ================= MESSAGE =================

        if (update.message) {

            const msg = update.message;

            const chatId = msg.chat.id;
            const userId = msg.from.id;

            const text = msg.text || msg.body || '';

            const user = getUser(userId);

            // START
            if (text === '/start') {

                return sendMessage(chatId,
`🎮 مین‌روب بله

💰 سکه: ${user.coins}

/startgame شروع بازی
/leaderboard لیدربورد`
                );
            }

            // START GAME
            if (text === '/startgame') {

                if (user.coins < 10)
                    return sendMessage(chatId, '❌ سکه کافی نیست');

                addCoins(userId, -10);

                const game = {
                    size: 4,
                    mines: 3,
                    board: createBoard(4, 3),
                    open: Array.from({ length: 4 }, () =>
                        Array(4).fill(false)
                    ),
                    opened: 0,
                    safe: 13
                };

                games.set(userId, game);

                return sendMessage(
                    chatId,
`💣 بازی شروع شد

🎯 مین‌ها: 3
💰 جایزه: 25`
,
                    keyboard(game)
                );
            }
        }

        // ================= CALLBACK =================

        if (update.callback_query) {

            const q = update.callback_query;

            const userId = q.from.id;
            const chatId = q.message.chat.id;

            const game = games.get(userId);
            if (!game) return;

            const [_, x, y] = q.data.split('_');

            if (game.open[y][x]) return;

            game.open[y][x] = true;

            // BOMB
            if (game.board[y][x] === 'M') {

                games.delete(userId);

                return sendMessage(chatId, '💥 باختی!');
            }

            game.opened++;

            // WIN
            if (game.opened >= game.safe) {

                addCoins(userId, 25);

                games.delete(userId);

                return sendMessage(chatId, '🏆 بردی +25 سکه');
            }
        }

    } catch (err) {
        console.log("❌ ERROR:", err.message);
    }
});

// ================= START =================

app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 BOT RUNNING ON", PORT);
});

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

// ================= CONFIG =================

const TOKEN = process.env.BOT_TOKEN;
const API = `https://botapi.bale.ai/bot${TOKEN}`;
const PORT = process.env.PORT || 3000;

// ================= DATABASE =================

const db = new Database('data.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100
)
`).run();

// ================= GAME STORE =================

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

function topUsers() {
    return db.prepare(`SELECT * FROM users ORDER BY coins DESC LIMIT 10`).all();
}

// ================= BOARD =================

function createBoard(size, mines) {
    const board = Array.from({ length: size }, () => Array(size).fill(0));

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

async function send(chatId, text, kb) {
    try {
        await axios.post(`${API}/sendMessage`, {
            chat_id: chatId,
            text,
            reply_markup: kb
        });
    } catch (e) {
        console.log(e.response?.data || e.message);
    }
}

// ================= ROUTES =================

app.get('/', (req, res) => {
    res.send('Mines Bot Online');
});

app.post('/', async (req, res) => {

    res.sendStatus(200);

    try {

        const update = req.body;

        if (update.message) {

            const msg = update.message;
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const text = msg.text || '';

            const user = getUser(userId);

            // START
            if (text === '/start') {
                return send(chatId,
`🎮 مین‌روب

💰 سکه: ${user.coins}

/startgame شروع بازی
/leaderboard لیدربورد`
                );
            }

            // LEADERBOARD
            if (text === '/leaderboard') {

                const top = topUsers();

                let msg = '🏆 لیدربورد\n\n';

                top.forEach((u, i) => {
                    msg += `${i + 1}. ${u.user_id} - ${u.coins}\n`;
                });

                return send(chatId, msg);
            }

            // START GAME
            if (text === '/startgame') {

                if (user.coins < 10)
                    return send(chatId, '❌ سکه کافی نیست');

                addCoins(userId, -10);

                const game = {
                    size: 4,
                    mines: 3,
                    board: createBoard(4, 3),
                    open: Array.from({ length: 4 }, () => Array(4).fill(false)),
                    opened: 0,
                    safe: 13
                };

                games.set(userId, game);

                return send(chatId,
`💣 بازی شروع شد
🎯 3 مین
💰 جایزه 25`
, keyboard(game));
            }
        }

        // CALLBACK
        if (update.callback_query) {

            const q = update.callback_query;
            const userId = q.from.id;
            const chatId = q.message.chat.id;
            const msgId = q.message.message_id;

            const game = games.get(userId);
            if (!game) return;

            const [_, x, y] = q.data.split('_');

            if (game.open[y][x]) return;

            game.open[y][x] = true;

            // BOMB
            if (game.board[y][x] === 'M') {

                games.delete(userId);

                return send(chatId, '💥 باختی!');
            }

            game.opened++;

            // WIN
            if (game.opened >= game.safe) {

                addCoins(userId, 25);

                games.delete(userId);

                return send(chatId, '🏆 بردی +25 سکه');
            }

        }

    } catch (err) {
        console.log(err.message);
    }
});

// ================= START =================

app.listen(PORT, '0.0.0.0', () => {
    console.log('BOT RUNNING');
});

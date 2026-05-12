const express = require('express');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;

// ========== ذخیره offset (حل مشکل پیام تکراری) ==========
const OFFSET_FILE = 'offset.json';
function loadOffset() {
    try {
        return JSON.parse(fs.readFileSync(OFFSET_FILE, 'utf8')).offset || 0;
    } catch {
        return 0;
    }
}
function saveOffset(offset) {
    fs.writeFileSync(OFFSET_FILE, JSON.stringify({ offset }));
}
let lastOffset = loadOffset();

// ========== دیتابیس ساده ==========
const DB_FILE = 'db.json';
function loadDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
        return { users: {} };
    }
}
function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ========== تنظیمات بازی ==========
const LEVELS = {
    easy: { size: 4, mines: 2, name: '🍃 آسان', coin: 10 },
    normal: { size: 5, mines: 5, name: '⚙️ معمولی', coin: 25 },
    hard: { size: 6, mines: 10, name: '🔥 سخت', coin: 50 }
};

// ========== توابع بازی ==========
function createBoard(size, mines, first) {
    const total = size * size;
    const board = Array(total).fill(0);
    const safe = new Set([first]);
    const x = Math.floor(first / size);
    const y = first % size;
    for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size)
                safe.add(nx * size + ny);
        }
    let positions = [];
    for (let i = 0; i < total; i++) if (!safe.has(i)) positions.push(i);
    for (let i = 0; i < mines && positions.length; i++) {
        const r = Math.floor(Math.random() * positions.length);
        board[positions[r]] = '💣';
        positions.splice(r, 1);
    }
    for (let i = 0; i < total; i++) {
        if (board[i] === '💣') continue;
        let cnt = 0;
        const cx = Math.floor(i / size), cy = i % size;
        for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) {
                const nx = cx + dx, ny = cy + dy;
                if (nx >= 0 && nx < size && ny >= 0 && ny < size)
                    if (board[nx * size + ny] === '💣') cnt++;
            }
        board[i] = cnt;
    }
    return board;
}

function reveal(board, revealed, flags, size, idx) {
    if (revealed[idx] || flags[idx] || board[idx] === '💣') return false;
    revealed[idx] = true;
    if (board[idx] === 0) {
        const x = Math.floor(idx / size), y = idx % size;
        for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < size && ny >= 0 && ny < size)
                    reveal(board, revealed, flags, size, nx * size + ny);
            }
    }
    return true;
}

function checkWin(revealed, total, mines) {
    let opened = 0;
    for (let i = 0; i < total; i++) if (revealed[i]) opened++;
    return opened === total - mines;
}

// ========== صفحه کلیدها ==========
const mainKeyboard = {
    inline_keyboard: [
        [{ text: '🎮 بازی', callback_data: 'game' }],
        [{ text: '💰 سکه', callback_data: 'coins' }, { text: '📊 آمار', callback_data: 'stats' }]
    ]
};

const levelKeyboard = {
    inline_keyboard: [
        [{ text: '🍃 آسان', callback_data: 'lvl_easy' }],
        [{ text: '⚙️ معمولی', callback_data: 'lvl_normal' }],
        [{ text: '🔥 سخت', callback_data: 'lvl_hard' }]
    ]
};

function gameKeyboard(size, board, revealed, flags) {
    const rows = [];
    for (let i = 0; i < size; i++) {
        const row = [];
        for (let j = 0; j < size; j++) {
            const idx = i * size + j;
            let emoji = '⬜';
            if (revealed[idx]) {
                if (board[idx] === '💣') emoji = '💣';
                else if (board[idx] === 0) emoji = '▪️';
                else emoji = board[idx] + '️⃣';
            } else if (flags[idx]) emoji = '🚩';
            row.push({ text: emoji, callback_data: `open_${idx}` });
        }
        rows.push(row);
    }
    rows.push([{ text: '🏠 منو', callback_data: 'menu' }]);
    return { inline_keyboard: rows };
}

// ========== ارسال ==========
async function send(chatId, text, kb = null) {
    try {
        await axios.post(`${API_URL}/sendMessage`, { chat_id: chatId, text, reply_markup: kb });
    } catch (e) { console.log(e.message); }
}
async function edit(chatId, msgId, text, kb = null) {
    try {
        await axios.post(`${API_URL}/editMessageText`, { chat_id: chatId, message_id: msgId, text, reply_markup: kb });
    } catch (e) { console.log(e.message); }
}
async function answer(cbId) {
    try {
        await axios.post(`${API_URL}/answerCallbackQuery`, { callback_query_id: cbId });
    } catch (e) {}
}

// ========== وضعیت بازی ==========
let games = {};

// ========== پردازش درخواست ==========
async function handleUpdate(upd) {
    // پیام متنی
    if (upd.message && upd.message.text === '/start') {
        const db = loadDB();
        const uid = upd.message.from.id;
        if (!db.users[uid]) db.users[uid] = { coins: 100, wins: 0, losses: 0 };
        saveDB(db);
        await send(upd.message.chat.id,
            `🎯 مین‌روب\n💰 سکه: ${db.users[uid].coins}\n🏆 برد: ${db.users[uid].wins} | باخت: ${db.users[uid].losses}`,
            mainKeyboard);
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
        const db = loadDB();
        if (!db.users[userId]) db.users[userId] = { coins: 100, wins: 0, losses: 0 };
        // منو
        if (data === 'menu') {
            await edit(chatId, msgId,
                `🎯 منو\n💰 سکه: ${db.users[userId].coins}\n🏆 برد: ${db.users[userId].wins}`,
                mainKeyboard);
            delete games[userId];
        }
        // سکه
        else if (data === 'coins') {
            await edit(chatId, msgId, `💰 ${db.users[userId].coins} سکه`, mainKeyboard);
        }
        // آمار
        else if (data === 'stats') {
            await edit(chatId, msgId,
                `📊 آمار\n🏆 برد: ${db.users[userId].wins}\n💀 باخت: ${db.users[userId].losses}\n💰 سکه: ${db.users[userId].coins}`,
                mainKeyboard);
        }
        // شروع بازی
        else if (data === 'game') {
            await edit(chatId, msgId, '🎲 سطح را انتخاب کن:', levelKeyboard);
        }
        // انتخاب سطح
        else if (data.startsWith('lvl_')) {
            const lvl = data.split('_')[1];
            const cfg = LEVELS[lvl];
            games[userId] = {
                level: lvl,
                size: cfg.size,
                mines: cfg.mines,
                coin: cfg.coin,
                board: null,
                revealed: Array(cfg.size * cfg.size).fill(false),
                flags: Array(cfg.size * cfg.size).fill(false),
                start: Date.now(),
                first: true
            };
            await edit(chatId, msgId,
                `🎮 ${cfg.name} | 🎁 ${cfg.coin} سکه\n⬜ کلیک کن تا شروع شود`,
                gameKeyboard(cfg.size, [], games[userId].revealed, games[userId].flags));
        }
        // باز کردن سلول
        else if (data.startsWith('open_')) {
            const idx = parseInt(data.split('_')[1]);
            const g = games[userId];
            if (!g) {
                await edit(chatId, msgId, '❗ بازی تمام شد', mainKeyboard);
                return;
            }
            const cfg = LEVELS[g.level];
            // اولین حرکت
            if (g.first) {
                g.board = createBoard(g.size, g.mines, idx);
                g.first = false;
            }
            // برخورد با مین
            if (g.board[idx] === '💣') {
                db.users[userId].losses++;
                saveDB(db);
                for (let i = 0; i < g.board.length; i++)
                    if (g.board[i] === '💣') g.revealed[i] = true;
                await edit(chatId, msgId,
                    `💥 باختی!\n⏱️ ${Math.floor((Date.now() - g.start) / 1000)} ثانیه`,
                    gameKeyboard(g.size, g.board, g.revealed, g.flags));
                delete games[userId];
                return;
            }
            // باز کردن
            reveal(g.board, g.revealed, g.flags, g.size, idx);
            // برد
            if (checkWin(g.revealed, g.size * g.size, g.mines)) {
                db.users[userId].coins += g.coin;
                db.users[userId].wins++;
                saveDB(db);
                await edit(chatId, msgId,
                    `🎉 بردی!\n💰 +${g.coin} سکه\n⏱️ ${Math.floor((Date.now() - g.start) / 1000)} ثانیه`,
                    gameKeyboard(g.size, g.board, g.revealed, g.flags));
                delete games[userId];
                return;
            }
            // ادامه بازی
            await edit(chatId, msgId,
                `🎮 ${cfg.name} | ⏱️ ${Math.floor((Date.now() - g.start) / 1000)}s`,
                gameKeyboard(g.size, g.board, g.revealed, g.flags));
        }
    }
}

// ========== دریافت آپدیت ==========
let polling = false;
async function poll() {
    if (polling) return;
    polling = true;
    try {
        const res = await axios.post(`${API_URL}/getUpdates`, {
            offset: lastOffset + 1,
            timeout: 30
        });
        for (const upd of res.data.result) {
            await handleUpdate(upd);
            if (upd.update_id > lastOffset) lastOffset = upd.update_id;
        }
        if (res.data.result.length > 0) saveOffset(lastOffset);
    } catch (err) {}
    polling = false;
}
setInterval(poll, 2000);

// ========== راه‌اندازی ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ربات روی پورت ${PORT} آنلاین شد`));
app.get('/', (req, res) => res.send('ربات مین‌روب فعال است'));

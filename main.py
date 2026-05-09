from balethon import Bot
from balethon.objects import InlineKeyboard, InlineKeyboardButton
import random
import os
from dotenv import load_dotenv
import sqlite3

load_dotenv()

bot = Bot(os.getenv("BOT_TOKEN"))

# ===================== DATABASE =====================
conn = sqlite3.connect("minesweeper.db", check_same_thread=False)
cursor = conn.cursor()

cursor.execute('''
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0
)
''')
conn.commit()

def get_user(user_id):
    cursor.execute("SELECT * FROM users WHERE user_id=?", (user_id,))
    user = cursor.fetchone()
    if not user:
        cursor.execute("INSERT INTO users (user_id) VALUES (?)", (user_id,))
        conn.commit()
        return (user_id, 100, 0, 0, 0)
    return user

games = {}

class Game:
    def __init__(self, difficulty, user_id, chat_id):
        self.difficulty = difficulty
        self.size = 5 if difficulty == "easy" else 6 if difficulty == "normal" else 7
        self.mines = 5 if difficulty == "easy" else 8 if difficulty == "normal" else 14
        self.board = [0] * (self.size ** 2)
        self.revealed = [False] * (self.size ** 2)
        self.flags = [False] * (self.size ** 2)
        self.first_click = True
        self.user_id = user_id
        self.chat_id = chat_id

# ===================== RENDER =====================
def render_game(game):
    keyboard = []
    for i in range(game.size):
        row = []
        for j in range(game.size):
            idx = i * game.size + j
            text = "◻️"
            if game.revealed[idx]:
                text = "💣" if game.board[idx] == "💣" else "▫️" if game.board[idx] == 0 else f"{game.board[idx]}️⃣"
            elif game.flags[idx]:
                text = "🚩"
            row.append(InlineKeyboardButton(text, callback_data=f"cell_{idx}"))
        keyboard.append(row)
    
    keyboard.append([
        InlineKeyboardButton("🚩 پرچم", callback_data="toggle_flag"),
        InlineKeyboardButton("🏠 منو", callback_data="main_menu")
    ])
    return InlineKeyboard(keyboard)

# ===================== HANDLERS =====================
@bot.on_message()
async def handler(message):
    if message.text == "/start":
        user = get_user(message.from_user.id)
        await message.reply(
            f"🎮 **مین‌روب پرو**\n\n💰 سکه: {user[1]}\n🏆 برد: {user[2]}",
            reply_markup=InlineKeyboard([[
                InlineKeyboardButton("🎮 بازی جدید", callback_data="new_game")
            ]])
        )

@bot.on_callback_query()
async def callback_handler(callback):
    data = callback.data
    user_id = callback.from_user.id
    chat_id = callback.message.chat.id
    message_id = callback.message.message_id

    await callback.answer()

    if data == "new_game":
        kb = InlineKeyboard([
            [InlineKeyboardButton("🍃 آسان", callback_data="diff_easy")],
            [InlineKeyboardButton("⚙️ معمولی", callback_data="diff_normal")],
            [InlineKeyboardButton("🔥 سخت", callback_data="diff_hard")],
            [InlineKeyboardButton("🏠 منو", callback_data="main_menu")]
        ])
        await callback.edit_message("🎲 سطح را انتخاب کنید:", reply_markup=kb)

    elif data.startswith("diff_"):
        diff = data.split("_")[1]
        game = Game(diff, user_id, chat_id)
        games[user_id] = game
        await callback.edit_message(f"🎮 بازی {diff} شروع شد!", reply_markup=render_game(game))

    elif data == "toggle_flag":
        # فعلاً ساده
        await callback.answer("حالت پرچم بعداً اضافه میشه")

    elif data.startswith("cell_"):
        if user_id not in games:
            return
        game = games[user_id]
        idx = int(data.split("_")[1])

        if game.first_click:
            game.place_mines(idx)
            game.first_click = False

        # منطق کلیک اینجا نوشته میشه (بعداً کامل می‌کنیم)

        await callback.edit_message("در حال بازی...", reply_markup=render_game(game))

bot.run()

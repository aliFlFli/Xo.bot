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
    def __init__(self, difficulty, user_id):
        self.difficulty = difficulty
        self.size = 5 if difficulty == "easy" else 6 if difficulty == "normal" else 7
        self.mines = 5 if difficulty == "easy" else 8 if difficulty == "normal" else 14
        self.board = [0] * (self.size * self.size)
        self.revealed = [False] * (self.size * self.size)
        self.flags = [False] * (self.size * self.size)
        self.first_click = True
        self.user_id = user_id

    def place_mines(self, first_idx):
        safe = set([first_idx])
        x, y = divmod(first_idx, self.size)
        for dx in [-1,0,1]:
            for dy in [-1,0,1]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.size and 0 <= ny < self.size:
                    safe.add(nx * self.size + ny)
        
        positions = [i for i in range(self.size*self.size) if i not in safe]
        random.shuffle(positions)
        
        for i in range(self.mines):
            self.board[positions[i]] = "💣"
        self.calculate_numbers()

    def calculate_numbers(self):
        for i in range(len(self.board)):
            if self.board[i] == "💣": continue
            count = 0
            x, y = divmod(i, self.size)
            for dx in [-1,0,1]:
                for dy in [-1,0,1]:
                    if dx == 0 and dy == 0: continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.size and 0 <= ny < self.size and self.board[nx*self.size + ny] == "💣":
                        count += 1
            self.board[i] = count

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
    keyboard.append([InlineKeyboardButton("🏠 منو", callback_data="main_menu")])
    return InlineKeyboard(keyboard)

# ===================== BOT =====================
@bot.on_message()
async def on_message(message):
    if message.text == "/start":
        user = get_user(message.from_user.id)
        await message.reply(
            f"🎮 **مین‌روب پرو**\n\n💰 سکه: {user[1]}",
            reply_markup=InlineKeyboard([[InlineKeyboardButton("🎮 بازی جدید", callback_data="new_game")]])
        )

@bot.on_callback_query()
async def on_callback(callback):
    data = callback.data
    user_id = callback.from_user.id

    await callback.answer("✅")

    if data == "new_game":
        kb = InlineKeyboard([
            [InlineKeyboardButton("🍃 آسان", callback_data="diff_easy")],
            [InlineKeyboardButton("⚙️ معمولی", callback_data="diff_normal")],
            [InlineKeyboardButton("🔥 سخت", callback_data="diff_hard")]
        ])
        await callback.edit_message("🎲 سطح را انتخاب کنید:", reply_markup=kb)

    elif data.startswith("diff_"):
        diff = data.split("_")[1]
        game = Game(diff, user_id)
        games[user_id] = game
        await callback.edit_message(f"🎮 بازی {diff} شروع شد!", reply_markup=render_game(game))

bot.run()

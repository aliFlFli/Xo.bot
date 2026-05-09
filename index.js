from balethon import Bot
from balethon.objects import InlineKeyboard, InlineKeyboardButton
import random
import os
from dotenv import load_dotenv
import sqlite3

load_dotenv()

bot = Bot(os.getenv("BOT_TOKEN"))

# ===================== DATABASE =====================
conn = sqlite3.connect("minesweeper.db")
cursor = conn.cursor()
cursor.execute('''
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
)
''')
conn.commit()

def get_user(user_id):
    cursor.execute("SELECT * FROM users WHERE user_id=?", (user_id,))
    user = cursor.fetchone()
    if not user:
        cursor.execute("INSERT INTO users (user_id) VALUES (?)", (user_id,))
        conn.commit()
        return (user_id, 100, 0, 0)
    return user

# ===================== GAME =====================
games = {}

class Game:
    def __init__(self, difficulty, user_id):
        self.difficulty = difficulty
        self.size = 5 if difficulty == "easy" else 6
        self.mines = 5 if difficulty == "easy" else 8
        self.board = [0] * (self.size * self.size)
        self.revealed = [False] * (self.size * self.size)
        self.flags = [False] * (self.size * self.size)
        self.first_click = True
        self.user_id = user_id

    def place_mines(self, first_idx):
        # منطق امن کردن اطراف اولین کلیک
        safe = set([first_idx])
        x, y = divmod(first_idx, self.size)
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
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
                    if 0 <= nx < self.size and 0 <= ny < self.size:
                        if self.board[nx*self.size + ny] == "💣":
                            count += 1
            self.board[i] = count

# ===================== BOT =====================
@bot.on_message()
async def main_handler(message):
    if message.text == "/start":
        user = get_user(message.from_user.id)
        await message.reply(
            "🎮 **به مین‌روب خوش آمدی!**\n\n"
            f"💰 سکه: {user[1]}\n🏆 برد: {user[2]}",
            reply_markup=InlineKeyboard([
                [InlineKeyboardButton("🎮 بازی جدید", callback_data="new_game")]
            ])
        )

bot.run()

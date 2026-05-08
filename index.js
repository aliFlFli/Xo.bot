import asyncio
import sqlite3
import json
import random
import time
import re
from datetime import datetime
from aiobale import Bot, Dispatcher, types
from aiobale.filters import Command

# ================== CONFIG ==================
BOT_TOKEN = "1883321723:4moQIWyjqy-pHE9f0MYcDkiOLrg3CtVsvU4"
MAX_ACTIVE_GAMES = 1000
GAME_TIMEOUT = 3600000

DIFFICULTY = {
    'easy': {'size': 4, 'mines': 2, 'name': '🍃 آسان', 'coin': 10},
    'normal': {'size': 5, 'mines': 5, 'name': '⚙️ معمولی', 'coin': 25},
    'hard': {'size': 6, 'mines': 10, 'name': '🔥 سخت', 'coin': 50},
    'expert': {'size': 8, 'mines': 20, 'name': '💀 حرفه‌ای', 'coin': 100}
}

LEVELS = [
    (1, 0, '🌱 تازه‌کار', 0),
    (2, 50, '⭐ مبتدی', 5),
    (3, 120, '🔰 آشنای حرفه', 10),
    (4, 250, '🎯 ماهر', 15),
    (5, 500, '🔥 حرفه‌ای', 25),
    (6, 900, '💎 استاد', 40),
    (7, 1500, '👑 افسانه‌ای', 60),
    (8, 2500, '⚡ قهرمان', 85),
    (9, 4000, '🎖️ سوپراستار', 120),
    (10, 6000, '🏆 خدا', 200)
]

SHOP = {
    'bomb_disabler': {'name': '💣 مین‌شکن', 'price': 50, 'desc': 'یه مین رو نابود کن'},
    'extra_life': {'name': '❤️ جان اضافه', 'price': 75, 'desc': 'یه بار اشتباه کنی نمیمیری'},
    'mine_detector': {'name': '🔦 مین‌یاب', 'price': 120, 'desc': 'یک مین رو نشون میده'},
    'smart_hint': {'name': '🧠 حسگر هوشمند', 'price': 90, 'desc': 'بهترین خونه امن رو پیشنهاد میده'}
}

THEMES = {
    'default': {'name': 'کلاسیک', 'bg': '⬜', 'mine': '💣', 'flag': '🚩'},
    'nature': {'name': 'طبیعت', 'bg': '🌿', 'mine': '🍃', 'flag': '🌸'},
    'neon': {'name': 'نئون', 'bg': '🟩', 'mine': '💚', 'flag': '🚩', 'price': 200}
}

# ================== DATABASE ==================
conn = sqlite3.connect('minesweeper.db', check_same_thread=False)
cursor = conn.cursor()

cursor.execute('''
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    theme TEXT DEFAULT 'default',
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    inventory TEXT DEFAULT '{}'
)
''')
conn.commit()

def get_user(user_id):
    cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        cursor.execute("INSERT INTO users (user_id) VALUES (?)", (user_id,))
        conn.commit()
        return {'user_id': user_id, 'coins': 100, 'wins': 0, 'losses': 0, 'games_played': 0, 'theme': 'default', 'xp': 0, 'level': 1, 'inventory': '{}'}
    return {
        'user_id': row[0], 'coins': row[1], 'wins': row[2], 'losses': row[3],
        'games_played': row[4], 'theme': row[5], 'xp': row[6], 'level': row[7],
        'inventory': json.loads(row[8])
    }

def update_user(user):
    cursor.execute('''
        UPDATE users SET coins=?, wins=?, losses=?, games_played=?, theme=?, xp=?, level=?, inventory=?
        WHERE user_id=?
    ''', (user['coins'], user['wins'], user['losses'], user['games_played'],
          user['theme'], user['xp'], user['level'], json.dumps(user['inventory']), user['user_id']))
    conn.commit()

# ================== GAME CLASS ==================
class MinesweeperGame:
    def __init__(self, size, mines, difficulty, user_id, game_id, chat_id):
        self.game_id = game_id
        self.user_id = user_id
        self.chat_id = chat_id
        self.size = size
        self.mines_count = mines
        self.difficulty = difficulty
        self.board = [0] * (size * size)
        self.revealed = [False] * (size * size)
        self.flags = [False] * (size * size)
        self.alive = True
        self.moves = 0
        self.start_time = time.time()
        self.mines_placed = False
    
    def place_mines(self, first_idx):
        safe = set([first_idx])
        x, y = divmod(first_idx, self.size)
        for dx in [-1,0,1]:
            for dy in [-1,0,1]:
                nx, ny = x+dx, y+dy
                if 0 <= nx < self.size and 0 <= ny < self.size:
                    safe.add(nx * self.size + ny)
        all_indices = [i for i in range(self.size*self.size) if i not in safe]
        mine_positions = random.sample(all_indices, self.mines_count)
        for pos in mine_positions:
            self.board[pos] = -1
        self.calc_numbers()
        self.mines_placed = True
    
    def calc_numbers(self):
        for i in range(self.size * self.size):
            if self.board[i] == -1:
                continue
            count = 0
            x, y = divmod(i, self.size)
            for dx in [-1,0,1]:
                for dy in [-1,0,1]:
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < self.size and 0 <= ny < self.size:
                        if self.board[nx * self.size + ny] == -1:
                            count += 1
            self.board[i] = count
    
    def reveal(self, idx):
        if self.revealed[idx] or self.flags[idx]:
            return
        self.revealed[idx] = True
        if self.board[idx] == 0:
            x, y = divmod(idx, self.size)
            for dx in [-1,0,1]:
                for dy in [-1,0,1]:
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < self.size and 0 <= ny < self.size:
                        self.reveal(nx * self.size + ny)
    
    def win_check(self):
        revealed_safe = sum(1 for i in range(self.size*self.size) 
                           if self.revealed[i] and self.board[i] != -1)
        return revealed_safe == self.size*self.size - self.mines_count

# ================== BOT SETUP ==================
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(bot)
games = {}

def main_menu_keyboard():
    return types.InlineKeyboardMarkup(row_width=2, inline_keyboard=[
        [types.InlineKeyboardButton(text="🎮 بازی جدید", callback_data="new_game")],
        [types.InlineKeyboardButton(text="🛒 فروشگاه", callback_data="shop"),
         types.InlineKeyboardButton(text="🎨 تم", callback_data="theme")],
        [types.InlineKeyboardButton(text="🏆 امار من", callback_data="stats"),
         types.InlineKeyboardButton(text="💰 کیف پول", callback_data="wallet")],
        [types.InlineKeyboardButton(text="⭐ سطح من", callback_data="level_info")]
    ])

def render_game(game):
    user = get_user(game.user_id)
    theme = THEMES.get(user['theme'], THEMES['default'])
    keyboard = []
    for i in range(game.size):
        row = []
        for j in range(game.size):
            idx = i * game.size + j
            if game.revealed[idx]:
                if game.board[idx] == -1:
                    text = theme['mine']
                elif game.board[idx] == 0:
                    text = '▪️'
                else:
                    text = str(game.board[idx])
            elif game.flags[idx]:
                text = theme['flag']
            else:
                text = theme['bg']
            row.append(types.InlineKeyboardButton(text=text, callback_data=f"cell_{game.game_id}_{idx}"))
        keyboard.append(row)
    keyboard.append([types.InlineKeyboardButton(text="🚩 Flag", callback_data=f"flag_{game.game_id}")])
    keyboard.append([types.InlineKeyboardButton(text="🏠 منو", callback_data="main_menu")])
    return types.InlineKeyboardMarkup(inline_keyboard=keyboard)

# ================== HANDLERS ==================
@dp.message_handler(Command("start"))
async def start(message: types.Message):
    user = get_user(message.from_user.id)
    await message.reply(
        f"🎯 به ماین‌سوییپر خوش اومدی!\n💰 سکه: {user['coins']}\n🏆 برد: {user['wins']}\n⭐ سطح: {user['level']}",
        reply_markup=main_menu_keyboard()
    )

@dp.callback_query_handler(lambda c: c.data == "main_menu")
async def back_to_menu(callback: types.CallbackQuery):
    await callback.message.edit_text("منوی اصلی:", reply_markup=main_menu_keyboard())
    await callback.answer()

@dp.callback_query_handler(lambda c: c.data == "new_game")
async def choose_difficulty(callback: types.CallbackQuery):
    keyboard = types.InlineKeyboardMarkup(row_width=2, inline_keyboard=[
        [types.InlineKeyboardButton(text="🍃 آسان", callback_data="diff_easy"),
         types.InlineKeyboardButton(text="⚙️ معمولی", callback_data="diff_normal")],
        [types.InlineKeyboardButton(text="🔥 سخت", callback_data="diff_hard"),
         types.InlineKeyboardButton(text="💀 حرفه‌ای", callback_data="diff_expert")],
        [types.InlineKeyboardButton(text="🔙 برگشت", callback_data="main_menu")]
    ])
    await callback.message.edit_text("سطح سختی رو انتخاب کن:", reply_markup=keyboard)
    await callback.answer()

@dp.callback_query_handler(lambda c: c.data.startswith("diff_"))
async def start_game(callback: types.CallbackQuery):
    diff = callback.data.split("_")[1]
    config = DIFFICULTY[diff]
    game_id = f"{callback.from_user.id}_{int(time.time())}"
    game = MinesweeperGame(config['size'], config['mines'], diff, callback.from_user.id, game_id, callback.message.chat.id)
    games[game_id] = game
    await callback.message.edit_text(
        f"🎮 {config['name']} شروع شد!\n💰 جایزه: {config['coin']} سکه",
        reply_markup=render_game(game)
    )
    await callback.answer()

@dp.callback_query_handler(lambda c: re.match(r"cell_(\d+_\d+)_(\d+)", c.data))
async def handle_cell(callback: types.CallbackQuery):
    match = re.match(r"cell_(.+)_(\d+)", callback.data)
    game_id, idx = match.group(1), int(match.group(2))
    game = games.get(game_id)
    if not game or not game.alive:
        await callback.answer("❌ بازی تموم شده!", show_alert=True)
        return
    if game.user_id != callback.from_user.id:
        await callback.answer("❌ این بازی مال تو نیست!", show_alert=True)
        return
    
    if not game.mines_placed:
        game.place_mines(idx)
    
    if game.board[idx] == -1:
        game.alive = False
        await callback.message.edit_text("💥 باختی! روی مین رفتی 😢\nبا /start دوباره شروع کن")
        await callback.answer("💀 باختی", show_alert=True)
        return
    
    game.reveal(idx)
    if game.win_check():
        game.alive = False
        user = get_user(game.user_id)
        reward = DIFFICULTY[game.difficulty]['coin']
        user['coins'] += reward
        user['wins'] += 1
        user['games_played'] += 1
        user['xp'] += 20
        update_user(user)
        await callback.message.edit_text(f"🎉 بردی! {reward} سکه گرفتی!\n💰 سکه کل: {user['coins']}")
        await callback.answer("🏆 پیروزی!", show_alert=True)
        return
    
    await callback.message.edit_reply_markup(reply_markup=render_game(game))
    await callback.answer()

# ================== SHOP ==================
@dp.callback_query_handler(lambda c: c.data == "shop")
async def show_shop(callback: types.CallbackQuery):
    text = "🛒 فروشگاه:\n\n"
    for key, item in SHOP.items():
        text += f"{item['name']} - {item['price']} سکه\n   {item['desc']}\n\n"
    keyboard = types.InlineKeyboardMarkup(row_width=1, inline_keyboard=[
        [types.InlineKeyboardButton(text="💣 خرید مین‌شکن (50)", callback_data="buy_bomb_disabler")],
        [types.InlineKeyboardButton(text="❤️ خرید جان اضافه (75)", callback_data="buy_extra_life")],
        [types.InlineKeyboardButton(text="🔦 خرید مین‌یاب (120)", callback_data="buy_mine_detector")],
        [types.InlineKeyboardButton(text="🔙 برگشت", callback_data="main_menu")]
    ])
    await callback.message.edit_text(text, reply_markup=keyboard)
    await callback.answer()

@dp.callback_query_handler(lambda c: c.data.startswith("buy_"))
async def buy_item(callback: types.CallbackQuery):
    item = callback.data.split("_")[1]
    price = SHOP[item]['price']
    user = get_user(callback.from_user.id)
    if user['coins'] >= price:
        user['coins'] -= price
        user['inventory'][item] = user['inventory'].get(item, 0) + 1
        update_user(user)
        await callback.answer(f"✅ {SHOP[item]['name']} خریداری شد!", show_alert=True)
    else:
        await callback.answer("❌ سکه کافی نیست!", show_alert=True)
    await callback.message.edit_text("منوی اصلی:", reply_markup=main_menu_keyboard())

# ================== STATS ==================
@dp.callback_query_handler(lambda c: c.data == "stats")
async def show_stats(callback: types.CallbackQuery):
    user = get_user(callback.from_user.id)
    win_rate = (user['wins'] / user['games_played'] * 100) if user['games_played'] > 0 else 0
    await callback.message.edit_text(
        f"📊 آمار شما:\n\n"
        f"🎮 بازی‌ها: {user['games_played']}\n"
        f"🏆 برد: {user['wins']}\n"
        f"📉 باخت: {user['losses']}\n"
        f"💰 سکه: {user['coins']}\n"
        f"⭐ سطح: {user['level']}\n"
        f"✨ XP: {user['xp']}\n"
        f"📈 نرخ برد: {win_rate:.1f}%",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton(text="🔙 برگشت", callback_data="main_menu")]
        ])
    )
    await callback.answer()

@dp.callback_query_handler(lambda c: c.data == "wallet")
async def show_wallet(callback: types.CallbackQuery):
    user = get_user(callback.from_user.id)
    await callback.message.edit_text(
        f"💰 کیف پول شما: {user['coins']} سکه",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton(text="🔙 برگشت", callback_data="main_menu")]
        ])
    )
    await callback.answer()

# ================== LEVEL INFO ==================
@dp.callback_query_handler(lambda c: c.data == "level_info")
async def level_info(callback: types.CallbackQuery):
    user = get_user(callback.from_user.id)
    level_name = LEVELS[user['level']-1][2] if user['level'] <= len(LEVELS) else "قهرمان"
    next_xp = LEVELS[user['level']][1] if user['level'] < len(LEVELS) else user['xp']
    xp_needed = next_xp - user['xp']
    await callback.message.edit_text(
        f"⭐ سطح {user['level']}: {level_name}\n"
        f"✨ XP فعلی: {user['xp']}\n"
        f"📈 XP تا سطح بعد: {xp_needed}",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton(text="🔙 برگشت", callback_data="main_menu")]
        ])
    )
    await callback.answer()

# ================== RUN ==================
async def main():
    print("🚀 ربات ماین‌سوییپر روی بله اجرا شد!")
    await dp.start_polling()

if __name__ == "__main__":
    asyncio.run(main())

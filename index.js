// ================== PACKAGES ==================
const { BaleBot, Markup } = require('node-bale-sdk');
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
require('dotenv').config();

// ================== CONFIG ==================
const MAX_ACTIVE_GAMES = 1000;
const GAME_TIMEOUT = 3600000; // 1 ساعت

const DIFFICULTY = {
  easy: { size: 4, mines: 2, name: '🍃 آسان', coin: 10 },
  normal: { size: 5, mines: 5, name: '⚙️ معمولی', coin: 25 },
  hard: { size: 6, mines: 10, name: '🔥 سخت', coin: 50 },
  expert: { size: 8, mines: 20, name: '💀 حرفه‌ای', coin: 100 }
};

// ================== BLITZ CONFIG ==================
const BLITZ_CONFIG = {
  easy: { timeLimit: 120, timeBonus: 10, size: 4, mines: 2, coin: 20, name: '⚡ بلیتز آسان' },
  normal: { timeLimit: 180, timeBonus: 8, size: 5, mines: 5, coin: 50, name: '⚡ بلیتز معمولی' },
  hard: { timeLimit: 240, timeBonus: 6, size: 6, mines: 10, coin: 100, name: '⚡ بلیتز سخت' },
  expert: { timeLimit: 300, timeBonus: 5, size: 8, mines: 20, coin: 200, name: '⚡ بلیتز حرفه‌ای' }
};

// ================== LEVELING SYSTEM ==================
const LEVELS = [
  { level: 1, xp_needed: 0, name: '🌱 تازه‌کار', coin_bonus: 0 },
  { level: 2, xp_needed: 50, name: '⭐ مبتدی', coin_bonus: 5 },
  { level: 3, xp_needed: 120, name: '🔰 آشنای حرفه', coin_bonus: 10 },
  { level: 4, xp_needed: 250, name: '🎯 ماهر', coin_bonus: 15 },
  { level: 5, xp_needed: 500, name: '🔥 حرفه‌ای', coin_bonus: 25 },
  { level: 6, xp_needed: 900, name: '💎 استاد', coin_bonus: 40 },
  { level: 7, xp_needed: 1500, name: '👑 افسانه‌ای', coin_bonus: 60 },
  { level: 8, xp_needed: 2500, name: '⚡ قهرمان', coin_bonus: 85 },
  { level: 9, xp_needed: 4000, name: '🎖️ سوپراستار', coin_bonus: 120 },
  { level: 10, xp_needed: 6000, name: '🏆 خدا', coin_bonus: 200 }
];

// ================== DAILY QUESTS ==================
const DAILY_QUESTS = {
  play_3_games: { name: '🎮 ۳ بازی کن', desc: '۳ بازی انجام بده', target: 3, reward_coin: 50, reward_xp: 30, type: 'play_games' },
  win_2_games: { name: '🏆 ۲ برد', desc: '۲ بازی ببر', target: 2, reward_coin: 75, reward_xp: 50, type: 'wins' },
  expert_win: { name: '💀 برد حرفه‌ای', desc: 'یه بازی حرفه‌ای ببر', target: 1, reward_coin: 100, reward_xp: 75, type: 'expert_win' },
  blitz_win: { name: '⚡ برد بلیتز', desc: 'یه بازی بلیتز ببر', target: 1, reward_coin: 80, reward_xp: 60, type: 'blitz_win' },
  use_item: { name: '🧰 استفاده از آیتم', desc: 'از یک آیتم استفاده کن', target: 1, reward_coin: 40, reward_xp: 20, type: 'use_item' },
  streak_3: { name: '🔥 استریک ۳', desc: '۳ برد متوالی داشته باش', target: 3, reward_coin: 60, reward_xp: 40, type: 'streak' },
  mine_detector: { name: '🔦 مین‌یاب', desc: 'از مین‌یاب استفاده کن', target: 1, reward_coin: 50, reward_xp: 25, type: 'mine_detector' },
  shield_use: { name: '🛡️ سپر محافظ', desc: 'از سپر محافظ استفاده کن', target: 1, reward_coin: 50, reward_xp: 25, type: 'shield_use' }
};

// ================== THEMES ==================
const THEMES = {
  default: { name: 'کلاسیک', emoji: '⬜', price: 0, bg: '⬜', mine: '💣', flag: '🚩', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  nature: { name: 'طبیعت', emoji: '🌿', price: 0, bg: '🌿', mine: '🍃', flag: '🌸', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  neon: { name: 'نئون', emoji: '🟩', price: 200, bg: '🟩', mine: '💚', flag: '🚩', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  dark: { name: 'شب', emoji: '⬛', price: 150, bg: '⬛', mine: '💀', flag: '⚑', num: ['▪️', '❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽'] },
  gold: { name: 'طلایی', emoji: '🟨', price: 500, bg: '🟨', mine: '👑', flag: '⭐', num: ['▪️', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'] },
  candy: { name: 'شیرینی', emoji: '🩷', price: 300, bg: '🩷', mine: '🍬', flag: '🍭', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  ocean: { name: 'اقیانوسی', emoji: '💙', price: 250, bg: '💙', mine: '🐟', flag: '⚓', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  fire: { name: 'آتشی', emoji: '🧡', price: 350, bg: '🧡', mine: '🔥', flag: '⚡', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  matrix: { name: 'ماتریکس', emoji: '💚', price: 400, bg: '💚', mine: '🧪', flag: '💊', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  halloween: { name: 'هالووین', emoji: '🎃', price: 350, bg: '🧡', mine: '👻', flag: '🕸️', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  christmas: { name: 'کریسمس', emoji: '🎄', price: 350, bg: '❤️', mine: '🎁', flag: '⭐', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  space: { name: 'فضایی', emoji: '🚀', price: 450, bg: '🌌', mine: '🛸', flag: '🌍', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] },
  anime: { name: 'انیمه', emoji: '🌸', price: 400, bg: '🌸', mine: '⚔️', flag: '👑', num: ['▪️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'] }
};

// ================== KEEP ALIVE ==================
const app = express();
app.get('/', (req, res) => res.send('🎮 Minesweeper PRO v6.3 Bale is alive'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🌐 Server on', PORT));

// ================== DATABASE ==================
const db = new Database('minesweeper.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER DEFAULT 100,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    best_time INTEGER,
    achievements TEXT DEFAULT '[]',
    inventory TEXT DEFAULT '{}',
    best_streak INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    weekly_wins INTEGER DEFAULT 0,
    weekly_score INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    expert_wins INTEGER DEFAULT 0,
    name TEXT,
    theme TEXT DEFAULT 'default',
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    blitz_best_time INTEGER DEFAULT 0,
    blitz_wins INTEGER DEFAULT 0,
    daily_quests TEXT DEFAULT '[]',
    daily_quest_progress TEXT DEFAULT '{}',
    last_daily_reset TEXT,
    daily_streak INTEGER DEFAULT 0,
    last_daily_claim TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_themes (
    user_id INTEGER,
    theme_key TEXT,
    PRIMARY KEY (user_id, theme_key)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// Safe JSON parse
function safeJSONParse(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch (e) {
    console.error('JSON Parse Error:', e);
    return fallback;
  }
}

function getUser(userId) {
  const row = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO users (user_id, name) VALUES (?, ?)').run(userId, 'کاربر');
    return {
      userId,
      coins: 100,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      bestTime: null,
      achievements: [],
      inventory: {},
      bestStreak: 0,
      currentStreak: 0,
      weeklyWins: 0,
      weeklyScore: 0,
      totalScore: 0,
      expertWins: 0,
      name: 'کاربر',
      theme: 'default',
      xp: 0,
      level: 1,
      blitzBestTime: 0,
      blitzWins: 0,
      dailyQuests: [],
      dailyQuestProgress: {},
      lastDailyReset: null,
      dailyStreak: 0,
      lastDailyClaim: null
    };
  }
  return {
    userId: row.user_id,
    coins: row.coins,
    wins: row.wins,
    losses: row.losses,
    gamesPlayed: row.games_played,
    bestTime: row.best_time,
    achievements: safeJSONParse(row.achievements, []),
    inventory: safeJSONParse(row.inventory, {}),
    bestStreak: row.best_streak,
    currentStreak: row.current_streak,
    weeklyWins: row.weekly_wins,
    weeklyScore: row.weekly_score,
    totalScore: row.total_score,
    expertWins: row.expert_wins,
    name: row.name || 'کاربر',
    theme: row.theme || 'default',
    xp: row.xp || 0,
    level: row.level || 1,
    blitzBestTime: row.blitz_best_time || 0,
    blitzWins: row.blitz_wins || 0,
    dailyQuests: safeJSONParse(row.daily_quests, []),
    dailyQuestProgress: safeJSONParse(row.daily_quest_progress, {}),
    lastDailyReset: row.last_daily_reset,
    dailyStreak: row.daily_streak || 0,
    lastDailyClaim: row.last_daily_claim
  };
}

function updateUser(user) {
  db.prepare(`
    UPDATE users SET 
      coins = ?, 
      wins = ?, 
      losses = ?, 
      games_played = ?, 
      best_time = ?, 
      achievements = ?, 
      inventory = ?,
      best_streak = ?,
      current_streak = ?,
      weekly_wins = ?,
      weekly_score = ?,
      total_score = ?,
      expert_wins = ?,
      name = ?,
      theme = ?,
      xp = ?,
      level = ?,
      blitz_best_time = ?,
      blitz_wins = ?,
      daily_quests = ?,
      daily_quest_progress = ?,
      last_daily_reset = ?,
      daily_streak = ?,
      last_daily_claim = ?
    WHERE user_id = ?
  `).run(
    user.coins,
    user.wins,
    user.losses,
    user.gamesPlayed,
    user.bestTime,
    JSON.stringify(user.achievements),
    JSON.stringify(user.inventory),
    user.bestStreak,
    user.currentStreak,
    user.weeklyWins,
    user.weeklyScore,
    user.totalScore,
    user.expertWins,
    user.name,
    user.theme,
    user.xp,
    user.level,
    user.blitzBestTime,
    user.blitzWins,
    JSON.stringify(user.dailyQuests),
    JSON.stringify(user.dailyQuestProgress),
    user.lastDailyReset,
    user.dailyStreak,
    user.lastDailyClaim,
    user.userId
  );
}

// ================== DAILY QUESTS FUNCTIONS ==================
function resetDailyQuests(userId) {
  const user = getUser(userId);
  const today = new Date().toDateString();
  
  if (user.lastDailyReset === today) return;
  
  const questKeys = Object.keys(DAILY_QUESTS);
  const shuffled = [...questKeys];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selectedQuests = shuffled.slice(0, 3);
  
  user.dailyQuests = selectedQuests;
  user.dailyQuestProgress = {};
  user.lastDailyReset = today;
  updateUser(user);
}

function getUserDailyQuests(userId) {
  resetDailyQuests(userId);
  const user = getUser(userId);
  
  return user.dailyQuests.map(key => ({
    key,
    ...DAILY_QUESTS[key],
    progress: user.dailyQuestProgress[key] || 0
  }));
}

function updateQuestProgress(userId, type, amount = 1) {
  const user = getUser(userId);
  const today = new Date().toDateString();
  
  if (user.lastDailyReset !== today) return null;
  
  let completedQuests = [];
  let totalRewardCoin = 0;
  let totalRewardXp = 0;
  
  for (const key of user.dailyQuests) {
    const quest = DAILY_QUESTS[key];
    if ((user.dailyQuestProgress[key] || 0) >= quest.target) continue;
    
    let match = false;
    switch(quest.type) {
      case 'play_games': match = type === 'game_played'; break;
      case 'wins': match = type === 'win'; break;
      case 'expert_win': match = type === 'expert_win'; break;
      case 'blitz_win': match = type === 'blitz_win'; break;
      case 'use_item': match = type === 'use_item'; break;
      case 'streak': match = type === 'streak'; break;
      case 'mine_detector': match = type === 'mine_detector'; break;
      case 'shield_use': match = type === 'shield_use'; break;
    }
    
    if (match) {
      user.dailyQuestProgress[key] = (user.dailyQuestProgress[key] || 0) + amount;
      if (user.dailyQuestProgress[key] >= quest.target) {
        completedQuests.push(quest);
        totalRewardCoin += quest.reward_coin;
        totalRewardXp += quest.reward_xp;
      }
    }
  }
  
  if (completedQuests.length > 0) {
    user.coins += totalRewardCoin;
    updateUser(user);
    addXP(userId, totalRewardXp);
    return { completedQuests, totalRewardCoin, totalRewardXp };
  }
  
  updateUser(user);
  return null;
}

function claimDailyReward(userId) {
  const user = getUser(userId);
  const today = new Date().toDateString();
  
  if (user.lastDailyClaim === today) {
    return { claimed: false, message: '❌ امروز جایزه روزانه رو گرفتی!' };
  }
  
  let reward = 50;
  let streak = user.dailyStreak || 0;
  
  if (user.lastDailyClaim) {
    const lastClaim = new Date(user.lastDailyClaim);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (lastClaim.toDateString() === yesterday.toDateString()) {
      streak++;
    } else {
      streak = 1;
    }
  } else {
    streak = 1;
  }
  
  const streakBonus = Math.min(streak * 5, 50);
  reward += streakBonus;
  
  user.coins += reward;
  user.dailyStreak = streak;
  user.lastDailyClaim = today;
  updateUser(user);
  
  return { claimed: true, reward, streak, message: `✅ جایزه روزانه ${reward} سکه! (استریک: ${streak} روز)` };
}

// ================== BOT INIT ==================
const bot = new BaleBot(process.env.BOT_TOKEN);
const games = new Map();
const flagMode = new Map();

function generateGameId(chatId, userId) {
  return `${chatId}_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function cleanupOldGames() {
  const now = Date.now();
  let deleted = 0;
  for (let [key, game] of games.entries()) {
    if (now - game.startTime > GAME_TIMEOUT) {
      games.delete(key);
      deleted++;
    }
  }
  for (let [key, value] of flagMode.entries()) {
    if (!games.has(key)) flagMode.delete(key);
  }
  if (deleted > 0) console.log(`🧹 Cleaned up ${deleted} old games`);
}

setInterval(cleanupOldGames, 600000);

// ================== MAIN MENU BUTTONS ==================
function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎮 حالت عادی', callback_data: 'new_game' },
          { text: '⚡ بلیتز', callback_data: 'blitz_mode' }
        ],
        [
          { text: '📅 ماموریت‌ها', callback_data: 'daily_quests' },
          { text: '🎁 جایزه روزانه', callback_data: 'daily_reward' }
        ],
        [
          { text: '🛒 فروشگاه', callback_data: 'shop_menu' },
          { text: '🎨 تم‌ها', callback_data: 'settings_menu' },
          { text: '💰 کیف پول', callback_data: 'wallet' }
        ],
        [
          { text: '🏆 لیدربورد', callback_data: 'leaderboard_menu' },
          { text: '🏆 دستاوردها', callback_data: 'achievements' },
          { text: '📊 آمار من', callback_data: 'my_stats' }
        ],
        [
          { text: '⭐ سطح من', callback_data: 'level_info' },
          { text: '❓ راهنما', callback_data: 'help' }
        ]
      ]
    }
  };
}

// ================== LEVELING FUNCTIONS ==================
function addXP(userId, amount) {
  const user = getUser(userId);
  user.xp += amount;
  let levelUpMsg = '';
  
  for (let i = user.level; i < LEVELS.length; i++) {
    const nextLevel = LEVELS[i];
    if (user.xp >= nextLevel.xp_needed) {
      user.level = nextLevel.level;
      levelUpMsg += `\n🎉 **سطح ${nextLevel.level}** رسیدی! ${nextLevel.name}\n💰 +${nextLevel.coin_bonus} سکه پاداش سطح!\n`;
      user.coins += nextLevel.coin_bonus;
    } else {
      break;
    }
  }
  
  updateUser(user);
  return levelUpMsg;
}

function getCurrentLevelInfo(xp) {
  let currentLevel = LEVELS[0];
  let nextLevel = LEVELS[1];
  
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp_needed) {
      currentLevel = LEVELS[i];
      if (i + 1 < LEVELS.length) {
        nextLevel = LEVELS[i + 1];
      } else {
        nextLevel = { xp_needed: xp, name: 'حداکثر', coin_bonus: 0 };
      }
      break;
    }
  }
  
  const xpNeeded = nextLevel.xp_needed - xp;
  const xpCurrent = xp - currentLevel.xp_needed;
  const xpMax = nextLevel.xp_needed - currentLevel.xp_needed;
  const progress = xpMax > 0 ? (xpCurrent / xpMax) * 100 : 100;
  
  return { currentLevel, nextLevel, xpNeeded, progress, xpCurrent, xpMax };
}

// ================== LEADERBOARD ==================
function getLeaderboard(type, stat) {
  let sql = '';
  switch(stat) {
    case 'wins':
      sql = 'SELECT user_id, wins, name FROM users ORDER BY wins DESC LIMIT 10';
      break;
    case 'streak':
      sql = 'SELECT user_id, best_streak, name FROM users ORDER BY best_streak DESC LIMIT 10';
      break;
    case 'score_all':
      sql = 'SELECT user_id, total_score, name FROM users ORDER BY total_score DESC LIMIT 10';
      break;
    case 'score_weekly':
      sql = 'SELECT user_id, weekly_score, name FROM users ORDER BY weekly_score DESC LIMIT 10';
      break;
    case 'coins':
      sql = 'SELECT user_id, coins, name FROM users ORDER BY coins DESC LIMIT 10';
      break;
    case 'level':
      sql = 'SELECT user_id, level, name FROM users ORDER BY level DESC, xp DESC LIMIT 10';
      break;
    case 'blitz':
      sql = 'SELECT user_id, blitz_wins, name FROM users ORDER BY blitz_wins DESC LIMIT 10';
      break;
    case 'daily_streak':
      sql = 'SELECT user_id, daily_streak, name FROM users ORDER BY daily_streak DESC LIMIT 10';
      break;
  }
  return db.prepare(sql).all();
}

function updateStreak(userId, win) {
  const user = getUser(userId);
  let newStreak = 0;
  
  if (win) {
    newStreak = (user.currentStreak || 0) + 1;
    user.currentStreak = newStreak;
    if (newStreak > (user.bestStreak || 0)) {
      user.bestStreak = newStreak;
    }
    updateQuestProgress(userId, 'streak', newStreak);
  } else {
    user.currentStreak = 0;
  }
  
  updateUser(user);
  return newStreak;
}

function resetWeeklyStats() {
  const users = db.prepare('SELECT user_id FROM users').all();
  for (const user of users) {
    db.prepare('UPDATE users SET weekly_wins = 0, weekly_score = 0 WHERE user_id = ?').run(user.user_id);
  }
  console.log('📊 Weekly stats reset');
}

function checkWeeklyReset() {
  const now = new Date();
  const lastReset = db.prepare("SELECT value FROM settings WHERE key = 'last_weekly_reset'").get();
  const lastResetDate = lastReset ? new Date(lastReset.value) : null;
  
  if (!lastResetDate || (now.getDay() === 1 && now.getDate() !== lastResetDate.getDate())) {
    resetWeeklyStats();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_weekly_reset', ?)").run(now.toISOString());
  }
}

// ================== ACHIEVEMENTS ==================
const ACHIEVEMENTS = {
  FIRST_WIN: { name: '🏆 اولین برد', desc: 'اولین بازی رو ببر', coin: 50 },
  EXPERT: { name: '🎖️ حرفه‌ای', desc: 'سطح حرفه‌ای رو ببر', coin: 200 },
  SPEEDRUN: { name: '⚡ سرعت', desc: 'زیر ۳۰ ثانیه ببر', coin: 100 },
  PERFECT: { name: '💎 کامل', desc: 'بدون اشتباه ببر', coin: 150 },
  LUCKY: { name: '🍀 خوش شانس', desc: 'با ۱ حرکت ببر', coin: 500 },
  STREAK_5: { name: '🔥 استریک ۵', desc: '۵ بار پشت سر هم ببر', coin: 100 },
  STREAK_10: { name: '⚡ استریک ۱۰', desc: '۱۰ بار پشت سر هم ببر', coin: 250 },
  BLITZ_WIN: { name: '⚡ سلطان بلیتز', desc: 'یک بازی بلیتز ببر', coin: 150 },
  DAILY_STREAK_7: { name: '📅 هفته‌ای', desc: '۷ روز متوالی جایزه روزانه بگیری', coin: 200 },
  ALL_QUESTS: { name: '🎯 ماموریت‌کامل', desc: 'یک روز همه ماموریت‌ها رو انجام بده', coin: 150 }
};

function checkAchievement(userId, type, gameData = {}) {
  const user = getUser(userId);
  if (user.achievements.includes(type)) return false;
  
  let earned = false;
  switch(type) {
    case 'FIRST_WIN': earned = user.wins === 1; break;
    case 'EXPERT': earned = gameData.difficulty === 'expert'; break;
    case 'SPEEDRUN': earned = (gameData.time || 0) < 30; break;
    case 'PERFECT': earned = gameData.moves === gameData.safeCells; break;
    case 'LUCKY': earned = gameData.moves === 1; break;
    case 'STREAK_5': earned = (user.bestStreak || 0) >= 5; break;
    case 'STREAK_10': earned = (user.bestStreak || 0) >= 10; break;
    case 'BLITZ_WIN': earned = (user.blitzWins || 0) >= 1; break;
    case 'DAILY_STREAK_7': earned = (user.dailyStreak || 0) >= 7; break;
    case 'ALL_QUESTS': earned = gameData.allQuests || false; break;
  }
  
  if (earned) {
    user.achievements.push(type);
    user.coins += ACHIEVEMENTS[type].coin;
    updateUser(user);
    return ACHIEVEMENTS[type];
  }
  return false;
}

// ================== SHOP ==================
const SHOP = {
  bomb_disabler: { name: '💣 مین‌شکن', desc: 'یه مین رو نابود کن', price: 50 },
  extra_life: { name: '❤️ جان اضافه', desc: 'یه بار میتونی اشتباه کنی', price: 75 },
  mine_detector: { name: '🔦 مین‌یاب', desc: 'یک مین رو نشون میده', price: 120 },
  smart_hint: { name: '🧠 حسگر هوشمند', desc: 'بهترین خونه امن رو پیشنهاد میده', price: 90 },
  time_freeze: { name: '⏰ فریز زمان', desc: '+۳۰ ثانیه به زمان (فقط عادی)', price: 80 },
  double_reward: { name: '🔥 جایزه دوبرابر', desc: 'برد بعدی ×۲ سکه', price: 200 },
  shield: { name: '🛡️ سپر محافظ', desc: 'یک بار مرگ رو نجات میده', price: 150 }
};

// ================== BASE GAME CLASS ==================
class MinesweeperGame {
  constructor(size, minesCount, difficulty, userId, gameId, chatId) {
    this.gameId = gameId;
    this.chatId = chatId;
    this.userId = userId;
    this.size = size;
    this.totalCells = size * size;
    this.minesCount = minesCount;
    this.difficulty = difficulty;
    this.board = Array(this.totalCells).fill(0);
    this.revealed = Array(this.totalCells).fill(false);
    this.flags = Array(this.totalCells).fill(false);
    this.alive = true;
    this.opened = 0;
    this.startTime = Date.now();
    this.moves = 0;
    this.actualClicks = 0;
    this.flaggedCount = 0;
    this.extraLifeUsed = false;
    this.doubleRewardActive = false;
    this.shieldActive = false;
    this.isBlitz = false;
    this.processing = false;
    this.minesPlaced = false;
  }
  
  placeMinesAfterFirstClick(clickIdx) {
    const safeIndices = new Set();
    safeIndices.add(clickIdx);
    const x = Math.floor(clickIdx / this.size);
    const y = clickIdx % this.size;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
          safeIndices.add(nx * this.size + ny);
        }
      }
    }
    
    const possibleMines = [];
    for (let i = 0; i < this.totalCells; i++) {
      if (!safeIndices.has(i)) possibleMines.push(i);
    }
    
    for (let i = possibleMines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [possibleMines[i], possibleMines[j]] = [possibleMines[j], possibleMines[i]];
    }
    
    for (let i = 0; i < this.minesCount && i < possibleMines.length; i++) {
      this.board[possibleMines[i]] = '💣';
    }
    
    this.calculateNumbers();
    this.minesPlaced = true;
  }
  
  calculateNumbers() {
    for (let i = 0; i < this.totalCells; i++) {
      if (this.board[i] === '💣') continue;
      let count = 0;
      const x = Math.floor(i / this.size);
      const y = i % this.size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
            if (this.board[nx * this.size + ny] === '💣') count++;
          }
        }
      }
      this.board[i] = count;
    }
  }
  
  revealEmpty(startIdx) {
    const queue = [startIdx];
    const visited = new Set();
    while (queue.length > 0) {
      const idx = queue.shift();
      if (visited.has(idx)) continue;
      if (this.revealed[idx] || this.flags[idx]) continue;
      visited.add(idx);
      this.revealed[idx] = true;
      this.opened++;
      if (this.board[idx] !== 0) continue;
      const x = Math.floor(idx / this.size);
      const y = idx % this.size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
            const neighborIdx = nx * this.size + ny;
            if (!this.revealed[neighborIdx] && !this.flags[neighborIdx] && this.board[neighborIdx] !== '💣') {
              queue.push(neighborIdx);
            }
          }
        }
      }
    }
  }
  
  revealAllMines() {
    for (let i = 0; i < this.totalCells; i++) {
      if (this.board[i] === '💣') this.revealed[i] = true;
    }
  }
  
  disableMine(idx) {
    if (this.board[idx] === '💣') {
      this.board[idx] = 0;
      this.minesCount--;
      this.calculateNumbers();
      return true;
    }
    return false;
  }
  
  useMineDetector() {
    for (let i = 0; i < this.totalCells; i++) {
      if (this.board[i] === '💣' && !this.revealed[i] && !this.flags[i]) {
        return i;
      }
    }
    return -1;
  }
  
  useSmartHint() {
    for (let i = 0; i < this.totalCells; i++) {
      if (!this.revealed[i] && !this.flags[i] && this.board[i] !== '💣') {
        return i;
      }
    }
    return -1;
  }
  
  freezeTime() {
    this.startTime += 30000;
  }
  
  checkWin() {
    return this.opened === this.totalCells - this.minesCount;
  }
  
  getStats() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')} | 🎯 ${this.moves} حرکت | 🚩 ${this.flaggedCount}/${this.minesCount}`;
  }
  
  getTimeInSeconds() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

// ================== BLITZ GAME CLASS ==================
class BlitzGame extends MinesweeperGame {
  constructor(size, minesCount, difficulty, userId, gameId, chatId, timeLimit, timeBonus, blitzLevel) {
    super(size, minesCount, difficulty, userId, gameId, chatId);
    this.timeLimit = timeLimit;
    this.timeBonus = timeBonus;
    this.blitzLevel = blitzLevel;
    this.timeLeft = timeLimit;
    this.lastMoveTime = Date.now();
    this.isBlitz = true;
  }
  
  getTimeLeft() {
    const elapsed = Math.floor((Date.now() - this.lastMoveTime) / 1000);
    this.timeLeft = Math.max(0, this.timeLimit - elapsed);
    return this.timeLeft;
  }
  
  addTime() {
    this.timeLimit += this.timeBonus;
    this.lastMoveTime = Date.now();
  }
  
  getStats() {
    const timeLeft = this.getTimeLeft();
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')} ⏰ | 🎯 ${this.moves} حرکت | 🚩 ${this.flaggedCount}/${this.minesCount}`;
  }
}

// ================== RENDER GAME ==================
function renderGame(game, gameOver = false) {
  const user = getUser(game.userId);
  const theme = THEMES[user.theme] || THEMES.default;
  
  const rows = [];
  for (let i = 0; i < game.size; i++) {
    const row = [];
    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;
      let display = theme.bg;
      
      if (game.revealed[idx]) {
        if (game.board[idx] === '💣') display = theme.mine;
        else if (game.board[idx] === 0) display = '▪️';
        else display = theme.num[game.board[idx]] || '❓';
      } else if (game.flags[idx]) {
        display = theme.flag;
      }
      
      row.push({ text: display, callback_data: `cell_${game.gameId}_${idx}` });
    }
    rows.push(row);
  }
  
  const controlRow = [];
  if (!gameOver && game.alive) {
    if (game.isBlitz && game.getTimeLeft() <= 0) game.alive = false;
    if (game.alive) {
      controlRow.push({ text: '🔍 Auto', callback_data: `auto_${game.gameId}` });
      controlRow.push({ text: '🚩', callback_data: `flag_${game.gameId}` });
      controlRow.push({ text: '🧰 آیتم‌ها', callback_data: `items_${game.gameId}` });
    }
  }
  controlRow.push({ text: '🔄 New', callback_data: 'new_game' });
  controlRow.push({ text: '🏠 Menu', callback_data: 'main_menu' });
  rows.push(controlRow);
  
  return { reply_markup: { inline_keyboard: rows } };
}

// ================== UTILITY FUNCTIONS ==================
async function showMainMenu(ctx, userId) {
  const user = getUser(userId);
  const text = `🎯 منوی اصلی\n\n👤 ${user.name}\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins} | باخت: ${user.losses}\n🔥 استریک: ${user.currentStreak || 0}\n⭐ سطح ${user.level} | ${LEVELS[user.level-1]?.name || 'قهرمان'}\n🎨 تم: ${THEMES[user.theme].name}\n⚡ برد بلیتز: ${user.blitzWins || 0}\n📅 استریک روزانه: ${user.dailyStreak || 0} روز`;
  
  await bot.editMessageText(text, {
    chat_id: ctx.chat.id,
    message_id: ctx.message.message_id,
    ...getMainMenu()
  });
}

async function showSettings(ctx, userId) {
  const user = getUser(userId);
  const purchasedThemes = db.prepare('SELECT theme_key FROM user_themes WHERE user_id = ?').all(user.userId);
  const purchasedKeys = purchasedThemes.map(t => t.theme_key);
  
  let msg = `🎨 تم ها (${Object.keys(THEMES).length} تم)\n\n💰 سکه: ${user.coins}\n🎨 تم فعلی: ${THEMES[user.theme].name}\n\n📦 تم‌های موجود:\n\n`;
  
  const keyboardButtons = [];
  
  for (const [key, theme] of Object.entries(THEMES)) {
    const isOwned = purchasedKeys.includes(key) || key === 'default' || key === 'nature';
    const isActive = user.theme === key;
    
    msg += `${isActive ? '✅' : '🔘'} ${theme.name} `;
    msg += theme.price > 0 ? `💰 ${theme.price} سکه` : '🎁 رایگان';
    msg += `\n   ${theme.emoji} ${theme.bg} ${theme.mine} ${theme.flag}\n\n`;
  }
  
  for (const [key, theme] of Object.entries(THEMES)) {
    const isOwned = purchasedKeys.includes(key) || key === 'default' || key === 'nature';
    const isActive = user.theme === key;
    
    if (!isOwned && theme.price > 0) {
      keyboardButtons.push([{ text: `🎨 خرید ${theme.name} (${theme.price}🪙)`, callback_data: `buy_theme_${key}` }]);
    } else if (!isActive && (key !== 'default' && key !== 'nature')) {
      keyboardButtons.push([{ text: `🎨 فعال‌سازی ${theme.name}`, callback_data: `activate_theme_${key}` }]);
    }
  }
  
  keyboardButtons.push([{ text: '🔙 برگشت', callback_data: 'main_menu' }]);
  
  await bot.editMessageText(msg, {
    chat_id: ctx.chat.id,
    message_id: ctx.message.message_id,
    reply_markup: { inline_keyboard: keyboardButtons }
  });
}

// ================== DAILY QUESTS MENU ==================
async function showDailyQuests(ctx, userId) {
  const quests = getUserDailyQuests(userId);
  const user = getUser(userId);
  let msg = '📅 **ماموریت‌های روزانه**\n\n';
  
  let allCompleted = true;
  for (const quest of quests) {
    const completed = quest.progress >= quest.target;
    if (!completed) allCompleted = false;
    msg += `${completed ? '✅' : '⏳'} **${quest.name}**\n`;
    msg += `   📝 ${quest.desc}\n`;
    msg += `   📊 پیشرفت: ${quest.progress}/${quest.target}\n`;
    msg += `   🎁 جایزه: ${quest.reward_coin} سکه + ${quest.reward_xp} XP\n\n`;
  }
  
  if (allCompleted && quests.length > 0) {
    msg += `🎉 **همه ماموریت‌ها رو انجام دادی!** 🎉\n`;
    checkAchievement(userId, 'ALL_QUESTS', { allQuests: true });
  }
  
  msg += `📅 **استریک روزانه: ${user.dailyStreak || 0} روز**\n`;
  msg += `💡 هر روز جایزه روزانه بگیری استریکت بیشتر میشه!`;
  
  await bot.editMessageText(msg, {
    chat_id: ctx.chat.id,
    message_id: ctx.message.message_id,
    reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] }
  });
}

// ================== HANDLE CELL CLICK ==================
async function handleCellClick(ctx, game, idx) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  
  if (game.userId !== userId) {
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
    return false;
  }
  
  if (game.processing) {
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '⏳ در حال پردازش... صبر کن', show_alert: false });
    return false;
  }
  game.processing = true;
  
  try {
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی تموم شده!', show_alert: false });
      return false;
    }
    
    if (game.revealed[idx]) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🔓 قبلا باز شده', show_alert: false });
      return false;
    }
    if (game.flags[idx]) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🚩 پرچم داره', show_alert: false });
      return false;
    }
    
    let user = getUser(userId);
    
    if (!game.minesPlaced) {
      game.placeMinesAfterFirstClick(idx);
      if (game.board[idx] === '💣') {
        for (let i = 0; i < game.totalCells; i++) {
          if (game.board[i] !== '💣') {
            game.board[idx] = game.board[i];
            game.board[i] = '💣';
            game.calculateNumbers();
            break;
          }
        }
      }
    }
    
    if (game.board[idx] === '💣' && user.inventory?.bomb_disabler > 0) {
      user.inventory.bomb_disabler--;
      updateUser(user);
      game.disableMine(idx);
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '💣 مین با مین‌شکن خنثی شد!', show_alert: false });
      await bot.editMessageText(`💣 ${DIFFICULTY[game.difficulty]?.name}\n💣 مین خنثی شد!\n${game.getStats()}`, {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        ...renderGame(game, false)
      });
      return true;
    }
    
    game.actualClicks++;
    game.moves++;
    
    if (game.isBlitz && game.board[idx] !== '💣') game.addTime();
    
    if (game.board[idx] === '💣') {
      if (user.inventory?.shield > 0 && !game.shieldActive) {
        game.shieldActive = true;
        user.inventory.shield--;
        updateUser(user);
        updateQuestProgress(userId, 'shield_use');
        await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🛡️ سپر محافظ فعال شد!', show_alert: false });
        await bot.editMessageText(`💣 ${DIFFICULTY[game.difficulty]?.name}\n🛡️ سپر محافظ یک مین رو دفع کرد!\n${game.getStats()}`, {
          chat_id: chatId,
          message_id: ctx.callbackQuery.message.message_id,
          ...renderGame(game, false)
        });
        return true;
      }
      
      if (user.inventory?.extra_life > 0 && !game.extraLifeUsed) {
        game.extraLifeUsed = true;
        user.inventory.extra_life--;
        updateUser(user);
        await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❤️ جان اضافه استفاده شد!', show_alert: false });
        await bot.editMessageText(`💣 ${DIFFICULTY[game.difficulty]?.name}\n❤️ جان اضافه فعال شد!\n${game.getStats()}`, {
          chat_id: chatId,
          message_id: ctx.callbackQuery.message.message_id,
          ...renderGame(game, false)
        });
        return true;
      }
      
      game.alive = false;
      game.revealAllMines();
      user.losses++;
      user.gamesPlayed++;
      updateQuestProgress(userId, 'game_played');
      updateStreak(userId, false);
      updateUser(user);
      await bot.editMessageText(`💥 باختی! 💀\n\n${game.getStats()}\n🔥 استریک فعلی: 0`, {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        ...renderGame(game, true)
      });
      return false;
    }
    
    game.revealEmpty(idx);
    
    if (game.checkWin()) {
      game.alive = false;
      const gameTime = game.getTimeInSeconds();
      const safeCells = game.totalCells - game.minesCount;
      let coinReward = DIFFICULTY[game.difficulty].coin;
      
      if (game.isBlitz) {
        coinReward = BLITZ_CONFIG[game.blitzLevel]?.coin || coinReward * 2;
        updateQuestProgress(userId, 'blitz_win');
      }
      
      if (game.difficulty === 'expert') updateQuestProgress(userId, 'expert_win');
      updateQuestProgress(userId, 'win');
      updateQuestProgress(userId, 'game_played');
      
      if (user.inventory?.double_reward > 0 && !game.doubleRewardActive) {
        game.doubleRewardActive = true;
        user.inventory.double_reward--;
        coinReward *= 2;
        updateUser(user);
      }
      
      const newStreak = updateStreak(userId, true);
      let xpGain = 10 + (game.difficulty === 'expert' ? 30 : 0) + Math.floor(newStreak * 1.5);
      if (game.isBlitz) xpGain = Math.floor(xpGain * 1.5);
      const levelUpMsg = addXP(userId, xpGain);
      
      user = getUser(userId);
      user.coins += coinReward;
      user.wins++;
      user.gamesPlayed++;
      user.weeklyWins++;
      
      if (game.isBlitz) {
        user.blitzWins++;
        if (gameTime < (user.blitzBestTime || 999) || user.blitzBestTime === 0) {
          user.blitzBestTime = gameTime;
        }
      }
      
      const scoreGain = 10 + (game.difficulty === 'expert' ? 30 : 0);
      user.totalScore = (user.totalScore || 0) + scoreGain;
      user.weeklyScore = (user.weeklyScore || 0) + scoreGain;
      
      if (game.difficulty === 'expert') user.expertWins++;
      if (!user.bestTime || gameTime < user.bestTime) user.bestTime = gameTime;
      
      updateUser(user);
      
      let achievementMsg = '';
      const checks = ['FIRST_WIN', 'EXPERT', 'SPEEDRUN', 'PERFECT', 'LUCKY', 'STREAK_5', 'STREAK_10'];
      if (game.isBlitz) checks.push('BLITZ_WIN');
      for (const ach of checks) {
        const result = checkAchievement(userId, ach, { 
          difficulty: game.difficulty, 
          time: gameTime, 
          moves: game.actualClicks, 
          safeCells 
        });
        if (result) achievementMsg += `\n🏆 ${result.name} +${result.coin} سکه!`;
      }
      
      const finalUser = getUser(userId);
      const modeText = game.isBlitz ? '⚡ **بلیتز** ⚡' : '🎮 **حالت عادی**';
      
      await bot.editMessageText(
        `🎉 **بردی!** 🎉\n${modeText}\n\n` +
        `⏱️ زمان: ${gameTime} ثانیه\n` +
        `🎯 حرکت: ${game.actualClicks}\n` +
        `💰 +${coinReward} سکه\n` +
        `🔥 استریک: ${finalUser.currentStreak}\n` +
        `✨ +${xpGain} XP${levelUpMsg}${achievementMsg}\n\n` +
        `📊 سکه: ${finalUser.coins} | سطح: ${finalUser.level}`,
        {
          chat_id: chatId,
          message_id: ctx.callbackQuery.message.message_id,
          ...renderGame(game, true)
        }
      );
      return true;
    }
    
    await bot.editMessageText(`${game.isBlitz ? '⚡' : '💣'} ${DIFFICULTY[game.difficulty]?.name}\n${game.getStats()}`, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...renderGame(game, false)
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '✅ باز شد', show_alert: false });
    return true;
    
  } finally {
    setTimeout(() => { game.processing = false; }, 100);
  }
}

async function handleFlag(ctx, game, idx) {
  const userId = ctx.from.id;
  
  if (game.userId !== userId) {
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
    return false;
  }
  
  if (!game || !game.alive) {
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی فعال نیست', show_alert: false });
    return false;
  }
  if (game.revealed[idx]) {
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ باز شده رو پرچم نمیشه زد', show_alert: false });
    return false;
  }
  game.flags[idx] = !game.flags[idx];
  game.flaggedCount += game.flags[idx] ? 1 : -1;
  await bot.editMessageText(`${game.isBlitz ? '⚡' : '💣'} ${DIFFICULTY[game.difficulty]?.name}\n${game.getStats()}`, {
    chat_id: ctx.chat.id,
    message_id: ctx.callbackQuery.message.message_id,
    ...renderGame(game, false)
  });
  await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: game.flags[idx] ? '🚩 پرچم زده شد' : '🔓 پرچم برداشته شد', show_alert: false });
  return true;
}

// ================== BOT COMMANDS ==================
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const user = getUser(userId);
  if (ctx.from.first_name) {
    user.name = ctx.from.first_name;
    updateUser(user);
  }
  
  if (ctx.message.text === '/start') {
    await bot.sendMessage(
      ctx.chat.id,
      `🎯 به Minesweeper PRO v6.3 خوش اومدی!\n\n👤 ${user.name}\n💰 سکه: ${user.coins}\n🏆 برد: ${user.wins} | باخت: ${user.losses}\n🔥 استریک: ${user.currentStreak || 0}\n⭐ سطح ${user.level} | ${LEVELS[user.level-1]?.name || 'قهرمان'}\n🎨 تم: ${THEMES[user.theme].name}\n⚡ برد بلیتز: ${user.blitzWins || 0}\n📅 استریک روزانه: ${user.dailyStreak || 0} روز\n\n⚡ از دکمه‌های زیر استفاده کن:`,
      getMainMenu()
    );
  }
});

// ================== BOT ACTIONS ==================
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  
  if (data === 'main_menu') {
    await showMainMenu(ctx, userId);
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'settings_menu') {
    await showSettings(ctx, userId);
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'daily_quests') {
    await showDailyQuests(ctx, userId);
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'daily_reward') {
    const result = claimDailyReward(userId);
    const user = getUser(userId);
    let msg = result.message;
    if (result.claimed) {
      const streakAch = checkAchievement(userId, 'DAILY_STREAK_7', {});
      if (streakAch) msg += `\n\n🏆 ${streakAch.name} +${streakAch.coin} سکه!`;
      msg += `\n\n💰 سکه کل: ${user.coins}`;
    }
    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] }
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'blitz_mode') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚡ بلیتز آسان (۲ دقیقه)', callback_data: 'blitz_easy' }],
          [{ text: '⚡ بلیتز معمولی (۳ دقیقه)', callback_data: 'blitz_normal' }],
          [{ text: '⚡ بلیتز سخت (۴ دقیقه)', callback_data: 'blitz_hard' }],
          [{ text: '⚡ بلیتز حرفه‌ای (۵ دقیقه)', callback_data: 'blitz_expert' }],
          [{ text: '🔙 برگشت', callback_data: 'new_game' }]
        ]
      }
    };
    await bot.editMessageText('⚡ **حالت بلیتز (زمان‌دار)**\n\nهر حرکت درست زمان اضافه میکنه!\nزمان تموم شد = باخت!\nجایزه ×۲ سکه!', {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...keyboard
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'new_game') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🍃 آسان (۱۰ سکه)', callback_data: 'difficulty_easy' }],
          [{ text: '⚙️ معمولی (۲۵ سکه)', callback_data: 'difficulty_normal' }],
          [{ text: '🔥 سخت (۵۰ سکه)', callback_data: 'difficulty_hard' }],
          [{ text: '💀 حرفه‌ای (۱۰۰ سکه)', callback_data: 'difficulty_expert' }],
          [{ text: '🔙 برگشت', callback_data: 'main_menu' }]
        ]
      }
    };
    await bot.editMessageText('🎲 سطح سختی رو انتخاب کن:', {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...keyboard
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'shop_menu') {
    const user = getUser(userId);
    let msg = '🛒 فروشگاه آیتم‌ها:\n━━━━━━━━━━━━━━━\n\n';
    
    const shopItems = [
      { key: 'bomb_disabler', emoji: '💣', name: 'مین‌شکن', desc: 'یه مین رو نابود کن', price: 50 },
      { key: 'extra_life', emoji: '❤️', name: 'جان اضافه', desc: 'یه بار میتونی اشتباه کنی', price: 75 },
      { key: 'mine_detector', emoji: '🔦', name: 'مین‌یاب', desc: 'یک مین رو نشون میده', price: 120 },
      { key: 'smart_hint', emoji: '🧠', name: 'حسگر هوشمند', desc: 'بهترین خونه امن رو پیشنهاد میده', price: 90 },
      { key: 'time_freeze', emoji: '⏰', name: 'فریز زمان', desc: '+۳۰ ثانیه به زمان (فقط عادی)', price: 80 },
      { key: 'double_reward', emoji: '🔥', name: 'جایزه دوبرابر', desc: 'برد بعدی ×۲ سکه', price: 200 },
      { key: 'shield', emoji: '🛡️', name: 'سپر محافظ', desc: 'یک بار مرگ رو نجات میده', price: 150 }
    ];
    
    for (const item of shopItems) {
      const count = user.inventory?.[item.key] || 0;
      msg += `${item.emoji} **${item.name}**\n`;
      msg += `   📝 ${item.desc}\n`;
      msg += `   💰 ${item.price} سکه\n`;
      if (count > 0) msg += `   📦 موجودی: ${count}\n`;
      msg += `\n`;
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💣 خرید مین‌شکن (۵۰)', callback_data: 'buy_bomb_disabler' }],
          [{ text: '❤️ خرید جان اضافه (۷۵)', callback_data: 'buy_extra_life' }],
          [{ text: '🔦 خرید مین‌یاب (۱۲۰)', callback_data: 'buy_mine_detector' }],
          [{ text: '🧠 خرید حسگر هوشمند (۹۰)', callback_data: 'buy_smart_hint' }],
          [{ text: '⏰ خرید فریز زمان (۸۰)', callback_data: 'buy_time_freeze' }],
          [{ text: '🔥 خرید جایزه دوبرابر (۲۰۰)', callback_data: 'buy_double_reward' }],
          [{ text: '🛡️ خرید سپر محافظ (۱۵۰)', callback_data: 'buy_shield' }],
          [{ text: '🔙 برگشت', callback_data: 'main_menu' }]
        ]
      }
    };
    
    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...keyboard
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'wallet') {
    const user = getUser(userId);
    await bot.editMessageText(`💰 کیف پول شما\n\nسکه: ${user.coins} 🪙\n\n🎮 هر برد عادی: +${DIFFICULTY.easy.coin}-${DIFFICULTY.expert.coin} سکه\n⚡ هر برد بلیتز: +${BLITZ_CONFIG.easy.coin}-${BLITZ_CONFIG.expert.coin} سکه\n🏆 دستاوردها: سکه اضافه میدن\n🔥 استریک فعلی: ${user.currentStreak || 0}\n⭐ سطح: ${user.level}\n⚡ برد بلیتز: ${user.blitzWins || 0}\n📅 استریک روزانه: ${user.dailyStreak || 0} روز`, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] }
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'achievements') {
    const user = getUser(userId);
    let msg = '🏆 دستاوردهای شما:\n\n';
    for (const [key, ach] of Object.entries(ACHIEVEMENTS)) {
      const earned = user.achievements.includes(key);
      msg += `${earned ? '✅' : '🔒'} ${ach.name}\n   ${ach.desc} (+${ach.coin} سکه)\n\n`;
    }
    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] }
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'my_stats') {
    const user = getUser(userId);
    const winRate = user.gamesPlayed > 0 ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) : 0;
    const levelName = LEVELS[user.level-1]?.name || 'قهرمان';
    const nextLevelXp = LEVELS[user.level]?.xp_needed || user.xp;
    const xpToNext = nextLevelXp - user.xp;
    
    await bot.editMessageText(
      `📊 **آمار شما**\n\n` +
      `🎮 بازی‌ها: ${user.gamesPlayed}\n` +
      `🏆 برد عادی: ${user.wins}\n` +
      `⚡ برد بلیتز: ${user.blitzWins || 0}\n` +
      `💀 باخت: ${user.losses}\n` +
      `📈 نرخ برد: ${winRate}%\n` +
      `💰 سکه: ${user.coins}\n` +
      `⚡ بهترین زمان بلیتز: ${user.blitzBestTime || '-'} ثانیه\n` +
      `🔥 بهترین استریک: ${user.bestStreak || 0}\n` +
      `⭐ سطح: ${user.level} | ${levelName}\n` +
      `✨ XP: ${user.xp} (${xpToNext > 0 ? `${xpToNext} XP تا سطح بعد` : 'حداکثر سطح'})\n` +
      `🏅 دستاوردها: ${user.achievements.length}/${Object.keys(ACHIEVEMENTS).length}\n` +
      `🎨 تم فعلی: ${THEMES[user.theme].name}\n` +
      `📅 استریک روزانه: ${user.dailyStreak || 0} روز`,
      {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] }
      }
    );
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'level_info') {
    const user = getUser(userId);
    const levelInfo = getCurrentLevelInfo(user.xp);
    const progressBar = '█'.repeat(Math.floor(levelInfo.progress / 10)) + '░'.repeat(10 - Math.floor(levelInfo.progress / 10));
    
    await bot.editMessageText(
      `⭐ **سطح ${user.level}** | ${LEVELS[user.level-1]?.name || 'قهرمان'}\n\n` +
      `📊 **پیشرفت به سطح ${levelInfo.nextLevel.level}** (${LEVELS[levelInfo.nextLevel.level-1]?.name || 'حداکثر'})\n` +
      `[${progressBar}] ${levelInfo.progress.toFixed(1)}%\n` +
      `📈 ${user.xp}/${levelInfo.nextLevel.xp_needed} XP\n` +
      `🔥 ${levelInfo.xpNeeded} XP تا سطح بعد\n\n` +
      `🏆 **پاداش سطح بعدی:**\n` +
      `💰 +${levelInfo.nextLevel.coin_bonus || 0} سکه\n\n` +
      `✨ **چگونه XP بگیریم؟**\n` +
      `• برد در هر سطح: +۱۰-۳۰ XP\n` +
      `• استریک: +استریک فعلی × 1.5 XP\n` +
      `• برد حرفه‌ای: +۳۰ XP اضافه\n` +
      `• برد بلیتز: XP × 1.5`,
      {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] }
      }
    );
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'help') {
    await bot.editMessageText(
      `📖 **راهنمای v6.3**\n\n` +
      `🎯 **هدف:** همه سلول‌های بدون مین رو باز کن\n\n` +
      `🕹️ **حالت‌های بازی:**\n` +
      `• 🎮 حالت عادی: بازی کلاسیک بدون محدودیت زمان\n` +
      `• ⚡ حالت بلیتز: بازی زمان‌دار با جایزه ×۲\n\n` +
      `⏱️ **قوانین بلیتز:**\n` +
      `• با هر حرکت درست، زمان اضافه میشه\n` +
      `• زمان تموم بشه = باخت\n` +
      `• جایزه و XP بیشتر\n\n` +
      `📅 **ماموریت‌های روزانه:**\n` +
      `• هر روز ۳ ماموریت جدید\n` +
      `• با انجام ماموریت‌ها سکه و XP بگیر\n` +
      `• استریک روزانه = پاداش بیشتر\n\n` +
      `🕹️ **کنترل‌ها:**\n` +
      `• کلیک عادی: باز کردن سلول\n` +
      `• حالت 🚩 Flag: پرچم گذاری روی مین\n` +
      `• 🔍 Auto: باز کردن خودکار خانه‌های امن\n` +
      `• 🧰 آیتم‌ها: استفاده از آیتم‌های خریداری شده\n\n` +
      `💰 **سیستم جایزه:**\n` +
      `• برد در هر سطح: سکه میگیری\n` +
      `• دستاوردها: سکه اضافه\n` +
      `• استریک: برد متوالی جایزه داره\n` +
      `• لیدربورد: رقابت با دیگران\n\n` +
      `✨ **سیستم سطح:**\n` +
      `• با برد XP میگیری\n` +
      `• سطح بالاتر = پاداش بیشتر\n` +
      `• استریک به XP اضافه میشه\n` +
      `• برد بلیتز XP × 1.5\n\n` +
      `🎨 **تم‌ها (${Object.keys(THEMES).length} تم):**\n` +
      `• ۲ تم رایگان: کلاسیک، طبیعت\n` +
      `• تم‌های جدید: ماتریکس، هالووین، کریسمس، فضا، انیمه\n` +
      `• از بخش تنظیمات میتونی ظاهر بازی رو عوض کنی`,
      {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] }
      }
    );
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'leaderboard_menu') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏆 بیشترین برد', callback_data: 'lb_wins_all' }],
          [{ text: '🔥 بهترین استریک', callback_data: 'lb_streak' }],
          [{ text: '⭐ بیشترین امتیاز', callback_data: 'lb_score_menu' }],
          [{ text: '💰 ثروتمندترین‌ها', callback_data: 'lb_coins' }],
          [{ text: '✨ بالاترین سطح', callback_data: 'lb_level' }],
          [{ text: '⚡ سلطان بلیتز', callback_data: 'lb_blitz' }],
          [{ text: '📅 استریک روزانه', callback_data: 'lb_daily_streak' }],
          [{ text: '🔙 برگشت', callback_data: 'main_menu' }]
        ]
      }
    };
    await bot.editMessageText('🏆 لیدربورد - انتخاب کنید:', {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...keyboard
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data === 'lb_score_menu') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⭐ همیشه', callback_data: 'lb_score_all' }],
          [{ text: '📅 هفتگی', callback_data: 'lb_score_weekly' }],
          [{ text: '🔙 برگشت', callback_data: 'leaderboard_menu' }]
        ]
      }
    };
    await bot.editMessageText('⭐ انتخاب کنید:', {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...keyboard
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data.startsWith('blitz_')) {
    const level = data.replace('blitz_', '');
    if (games.size >= MAX_ACTIVE_GAMES) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ شلوغه! کمی صبر کن', show_alert: true });
      return;
    }
    
    const gameId = generateGameId(chatId, userId);
    const config = BLITZ_CONFIG[level];
    const game = new BlitzGame(config.size, config.mines, level, userId, gameId, chatId, config.timeLimit, config.timeBonus, level);
    const gameKey = `${chatId}_${userId}`;
    games.set(gameKey, game);
    await bot.editMessageText(
      `⚡ **${config.name}**\n💰 جایزه: ${config.coin} سکه\n⏰ زمان: ${Math.floor(config.timeLimit/60)} دقیقه\n➕ پاداش هر حرکت: +${config.timeBonus} ثانیه\n${game.getStats()}`,
      {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        ...renderGame(game, false)
      }
    );
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '⚡ بلیتز شروع شد! سریع باش!', show_alert: false });
  }
  else if (data.startsWith('difficulty_')) {
    const level = data.replace('difficulty_', '');
    if (games.size >= MAX_ACTIVE_GAMES) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ شلوغه! کمی صبر کن', show_alert: true });
      return;
    }
    
    const gameId = generateGameId(chatId, userId);
    const config = DIFFICULTY[level];
    const game = new MinesweeperGame(config.size, config.mines, level, userId, gameId, chatId);
    const gameKey = `${chatId}_${userId}`;
    games.set(gameKey, game);
    await bot.editMessageText(`🎮 بازی ${config.name}\n💰 جایزه: ${config.coin} سکه\n${game.getStats()}`, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...renderGame(game, false)
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🎮 بازی شروع شد!', show_alert: false });
  }
  else if (data.startsWith('buy_')) {
    const item = data.replace('buy_', '');
    const prices = {
      bomb_disabler: 50,
      extra_life: 75,
      mine_detector: 120,
      smart_hint: 90,
      time_freeze: 80,
      double_reward: 200,
      shield: 150
    };
    const names = {
      bomb_disabler: 'مین‌شکن',
      extra_life: 'جان اضافه',
      mine_detector: 'مین‌یاب',
      smart_hint: 'حسگر هوشمند',
      time_freeze: 'فریز زمان',
      double_reward: 'جایزه دوبرابر',
      shield: 'سپر محافظ'
    };
    const emojis = {
      bomb_disabler: '💣',
      extra_life: '❤️',
      mine_detector: '🔦',
      smart_hint: '🧠',
      time_freeze: '⏰',
      double_reward: '🔥',
      shield: '🛡️'
    };
    
    const user = getUser(userId);
    if (user.coins >= prices[item]) {
      user.coins -= prices[item];
      if (!user.inventory) user.inventory = {};
      user.inventory[item] = (user.inventory[item] || 0) + 1;
      updateUser(user);
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: `✅ ${names[item]} خریداری شد! ${emojis[item]}`, show_alert: true });
      await bot.editMessageText(`✅ ${names[item]} به انبارت اضافه شد!`, {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'main_menu' }]] }
      });
    } else {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ سکه کافی نیست!', show_alert: true });
    }
  }
  else if (data.startsWith('buy_theme_')) {
    const themeKey = data.replace('buy_theme_', '');
    const theme = THEMES[themeKey];
    const user = getUser(userId);
    
    if (!theme) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ تم یافت نشد', show_alert: true });
      return;
    }
    
    if (user.coins < theme.price) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: `❌ سکه کافی نیست! نیاز به ${theme.price} سکه داری`, show_alert: true });
      return;
    }
    
    user.coins -= theme.price;
    updateUser(user);
    
    db.prepare('INSERT OR IGNORE INTO user_themes (user_id, theme_key) VALUES (?, ?)').run(user.userId, themeKey);
    
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: `✅ تم ${theme.name} خریداری شد!`, show_alert: true });
    await showSettings(ctx, userId);
  }
  else if (data.startsWith('activate_theme_')) {
    const themeKey = data.replace('activate_theme_', '');
    const theme = THEMES[themeKey];
    const user = getUser(userId);
    
    if (!theme) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ تم یافت نشد', show_alert: true });
      return;
    }
    
    user.theme = themeKey;
    updateUser(user);
    
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: `✅ تم ${theme.name} فعال شد!`, show_alert: true });
    await showSettings(ctx, userId);
  }
  else if (data.startsWith('lb_')) {
    const stat = data.replace('lb_', '');
    const titles = {
      wins_all: '🏆 بیشترین برد (همیشه)',
      streak: '🔥 بهترین استریک',
      score_all: '⭐ بیشترین امتیاز (همیشه)',
      score_weekly: '📅 رتبه‌بندی هفتگی',
      coins: '💰 ثروتمندترین‌ها',
      level: '✨ بالاترین سطح',
      blitz: '⚡ سلطان بلیتز',
      daily_streak: '📅 استریک روزانه'
    };
    
    if (stat === 'score_weekly') checkWeeklyReset();
    const topUsers = getLeaderboard('all_time', stat === 'score_all' ? 'score_all' : stat === 'score_weekly' ? 'score_weekly' : stat);
    let msg = `${titles[stat] || '🏆 لیدربورد'}:\n\n`;
    let rank = 1;
    for (const user of topUsers) {
      let value = user[stat === 'score_all' ? 'total_score' : stat === 'score_weekly' ? 'weekly_score' : stat];
      let displayName = stat === 'daily_streak' ? 'روز' : stat === 'level' ? 'سطح' : stat === 'blitz' ? 'برد بلیتز' : stat;
      msg += `${rank}. ${user.name || 'کاربر'} — ${value} ${displayName}\n`;
      rank++;
    }
    const currentUser = getUser(userId);
    const userValue = currentUser[stat === 'score_all' ? 'totalScore' : stat === 'score_weekly' ? 'weeklyScore' : stat] || 0;
    msg += `\n📊 شما: ${userValue} ${stat === 'level' ? 'سطح' : stat === 'blitz' ? 'برد بلیتز' : stat === 'daily_streak' ? 'روز' : stat}`;
    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'leaderboard_menu' }]] }
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data.startsWith('cell_')) {
    const parts = data.split('_');
    const gameId = parts[1];
    const idx = parseInt(parts[2]);
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی تموم شده! New Game بزن', show_alert: false });
      return;
    }
    
    const isFlag = flagMode.get(gameKey) || false;
    if (isFlag) await handleFlag(ctx, game, idx);
    else await handleCellClick(ctx, game, idx);
  }
  else if (data.startsWith('flag_')) {
    const gameId = data.replace('flag_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی تموم شده! New Game بزن', show_alert: false });
      return;
    }
    
    const current = flagMode.get(gameKey) || false;
    flagMode.set(gameKey, !current);
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: `${!current ? '🚩' : '🔍'} حالت ${!current ? 'پرچم' : 'کلیک'} فعال شد`, show_alert: false });
  }
  else if (data.startsWith('auto_')) {
    const gameId = data.replace('auto_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی تموم شده! New Game بزن', show_alert: false });
      return;
    }
    if (game.userId !== userId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
      return;
    }
    
    if (game.isBlitz && game.getTimeLeft() <= 0) {
      game.alive = false;
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '⏰ زمان تموم شد!', show_alert: false });
      await bot.editMessageText(`💥 زمانت تموم شد! 💀\n\n${game.getStats()}`, {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        ...renderGame(game, true)
      });
      return;
    }
    
    let changed = false;
    for (let i = 0; i < game.totalCells; i++) {
      if (!game.revealed[i] && !game.flags[i] && game.board[i] !== '💣') {
        if (!game.minesPlaced) game.placeMinesAfterFirstClick(i);
        game.revealEmpty(i);
        changed = true;
        if (game.isBlitz) game.addTime();
        break;
      }
    }
    
    if (changed) {
      if (game.checkWin()) {
        game.alive = false;
        let user = getUser(userId);
        let coinReward = DIFFICULTY[game.difficulty].coin;
        
        if (game.isBlitz) {
          coinReward = BLITZ_CONFIG[game.blitzLevel]?.coin || coinReward * 2;
          updateQuestProgress(userId, 'blitz_win');
        }
        
        if (game.difficulty === 'expert') updateQuestProgress(userId, 'expert_win');
        updateQuestProgress(userId, 'win');
        updateQuestProgress(userId, 'game_played');
        
        if (user.inventory?.double_reward > 0 && !game.doubleRewardActive) {
          game.doubleRewardActive = true;
          user.inventory.double_reward--;
          coinReward *= 2;
          updateUser(user);
        }
        
        const newStreak = updateStreak(userId, true);
        let xpGain = 10 + (game.difficulty === 'expert' ? 30 : 0) + Math.floor(newStreak * 1.5);
        if (game.isBlitz) xpGain = Math.floor(xpGain * 1.5);
        const levelUpMsg = addXP(userId, xpGain);
        
        user = getUser(userId);
        user.coins += coinReward;
        user.wins++;
        user.gamesPlayed++;
        
        if (game.isBlitz) {
          user.blitzWins++;
          const gameTime = game.getTimeInSeconds();
          if (gameTime < (user.blitzBestTime || 999) || user.blitzBestTime === 0) {
            user.blitzBestTime = gameTime;
          }
        }
        
        updateUser(user);
        
        await bot.editMessageText(`🎉 بردی! 🎉\n💰 +${coinReward} سکه\n✨ +${xpGain} XP${levelUpMsg}\n🔥 استریک جدید: ${newStreak}\n${game.getStats()}`, {
          chat_id: chatId,
          message_id: ctx.callbackQuery.message.message_id,
          ...renderGame(game, true)
        });
      } else {
        await bot.editMessageText(`${game.isBlitz ? '⚡' : '💣'} ${DIFFICULTY[game.difficulty]?.name}\n${game.getStats()}`, {
          chat_id: chatId,
          message_id: ctx.callbackQuery.message.message_id,
          ...renderGame(game, false)
        });
      }
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '✨ خانه‌های امن باز شدن', show_alert: false });
    } else {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🔍 هیچ خانۀ امنی نیست', show_alert: false });
    }
  }
  else if (data.startsWith('items_')) {
    const gameId = data.replace('items_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    const user = getUser(userId);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی فعال نیست', show_alert: false });
      return;
    }
    if (game.userId !== userId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
      return;
    }
    
    let msg = '🧰 **آیتم‌های موجود:**\n\n';
    const keyboardButtons = [];
    
    if (user.inventory?.mine_detector > 0) {
      msg += `🔦 مین‌یاب (${user.inventory.mine_detector} عدد)\n   یک مین رو نشون میده\n\n`;
      keyboardButtons.push([{ text: `🔦 استفاده از مین‌یاب`, callback_data: `use_mine_detector_${gameId}` }]);
    }
    
    if (user.inventory?.smart_hint > 0) {
      msg += `🧠 حسگر هوشمند (${user.inventory.smart_hint} عدد)\n   بهترین خونه امن رو پیشنهاد میده\n\n`;
      keyboardButtons.push([{ text: `🧠 استفاده از حسگر`, callback_data: `use_smart_hint_${gameId}` }]);
    }
    
    if (user.inventory?.time_freeze > 0 && !game.isBlitz) {
      msg += `⏰ فریز زمان (${user.inventory.time_freeze} عدد)\n   +۳۰ ثانیه به زمان\n\n`;
      keyboardButtons.push([{ text: `⏰ فریز زمان`, callback_data: `use_time_freeze_${gameId}` }]);
    }
    
    if (user.inventory?.double_reward > 0 && !game.doubleRewardActive) {
      msg += `🔥 جایزه دوبرابر (${user.inventory.double_reward} عدد)\n   برد بعدی ×۲ سکه\n\n`;
      keyboardButtons.push([{ text: `🔥 فعال‌سازی جایزه ×۲`, callback_data: `use_double_reward_${gameId}` }]);
    }
    
    if (user.inventory?.shield > 0 && !game.shieldActive) {
      msg += `🛡️ سپر محافظ (${user.inventory.shield} عدد)\n   یک بار مرگ رو نجات میده\n\n`;
      keyboardButtons.push([{ text: `🛡️ فعال‌سازی سپر`, callback_data: `use_shield_${gameId}` }]);
    }
    
    if (keyboardButtons.length === 0) {
      msg = '❌ هیچ آیتمی برای استفاده نداری!\nاز فروشگاه بخر.';
    }
    
    keyboardButtons.push([{ text: '🔙 برگشت به بازی', callback_data: `back_${gameId}` }]);
    
    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      reply_markup: { inline_keyboard: keyboardButtons }
    });
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
  else if (data.startsWith('use_mine_detector_')) {
    const gameId = data.replace('use_mine_detector_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    const user = getUser(userId);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی فعال نیست', show_alert: false });
      return;
    }
    if (game.userId !== userId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
      return;
    }
    if (user.inventory?.mine_detector <= 0) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ مین‌یاب نداری!', show_alert: true });
      return;
    }
    
    const mineIdx = game.useMineDetector();
    if (mineIdx === -1) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🔍 هیچ مین پنهانی پیدا نشد!', show_alert: true });
      return;
    }
    
    user.inventory.mine_detector--;
    updateUser(user);
    updateQuestProgress(userId, 'mine_detector');
    
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🔦 مین‌یاب استفاده شد!', show_alert: false });
    await bot.editMessageText(`${game.isBlitz ? '⚡' : '💣'} ${DIFFICULTY[game.difficulty]?.name}\n🔦 مین‌یاب: یک مین پیدا شد!\n${game.getStats()}`, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...renderGame(game, false)
    });
  }
  else if (data.startsWith('use_smart_hint_')) {
    const gameId = data.replace('use_smart_hint_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    const user = getUser(userId);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی فعال نیست', show_alert: false });
      return;
    }
    if (game.userId !== userId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
      return;
    }
    if (user.inventory?.smart_hint <= 0) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ حسگر هوشمند نداری!', show_alert: true });
      return;
    }
    
    const hintIdx = game.useSmartHint();
    if (hintIdx === -1) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🧠 هیچ خونه امنی پیدا نشد!', show_alert: true });
      return;
    }
    
    user.inventory.smart_hint--;
    updateUser(user);
    updateQuestProgress(userId, 'use_item');
    
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🧠 حسگر هوشمند استفاده شد!', show_alert: false });
    await bot.editMessageText(`${game.isBlitz ? '⚡' : '💣'} ${DIFFICULTY[game.difficulty]?.name}\n🧠 حسگر هوشمند: یه خونه امن پیدا شد!\n${game.getStats()}`, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...renderGame(game, false)
    });
  }
  else if (data.startsWith('use_time_freeze_')) {
    const gameId = data.replace('use_time_freeze_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    const user = getUser(userId);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی فعال نیست', show_alert: false });
      return;
    }
    if (game.userId !== userId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
      return;
    }
    if (game.isBlitz) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ فریز زمان در حالت بلیتز قابل استفاده نیست!', show_alert: true });
      return;
    }
    if (user.inventory?.time_freeze <= 0) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ فریز زمان نداری!', show_alert: true });
      return;
    }
    
    user.inventory.time_freeze--;
    updateUser(user);
    updateQuestProgress(userId, 'use_item');
    game.freezeTime();
    
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '⏰ ۳۰ ثانیه به زمان اضافه شد!', show_alert: false });
    await bot.editMessageText(`💣 ${DIFFICULTY[game.difficulty]?.name}\n⏰ فریز زمان فعال شد! +۳۰ ثانیه\n${game.getStats()}`, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...renderGame(game, false)
    });
  }
  else if (data.startsWith('use_double_reward_')) {
    const gameId = data.replace('use_double_reward_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    const user = getUser(userId);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی فعال نیست', show_alert: false });
      return;
    }
    if (game.userId !== userId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
      return;
    }
    if (user.inventory?.double_reward <= 0 || game.doubleRewardActive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ جایزه دوبرابر فعال نیست یا نداری!', show_alert: true });
      return;
    }
    
    user.inventory.double_reward--;
    game.doubleRewardActive = true;
    updateUser(user);
    updateQuestProgress(userId, 'use_item');
    
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🔥 جایزه دوبرابر فعال شد! برد بعدی ×۲ سکه!', show_alert: false });
    await bot.editMessageText(`${game.isBlitz ? '⚡' : '💣'} ${DIFFICULTY[game.difficulty]?.name}\n🔥 جایزه دوبرابر فعال شد!\n${game.getStats()}`, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...renderGame(game, false)
    });
  }
  else if (data.startsWith('use_shield_')) {
    const gameId = data.replace('use_shield_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    const user = getUser(userId);
    
    if (!game || game.gameId !== gameId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی معتبر نیست!', show_alert: false });
      return;
    }
    if (!game.alive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی فعال نیست', show_alert: false });
      return;
    }
    if (game.userId !== userId) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ این بازی مال تو نیست!', show_alert: false });
      return;
    }
    if (user.inventory?.shield <= 0 || game.shieldActive) {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ سپر محافظ فعال نیست یا نداری!', show_alert: true });
      return;
    }
    
    user.inventory.shield--;
    game.shieldActive = true;
    updateUser(user);
    updateQuestProgress(userId, 'use_item');
    
    await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '🛡️ سپر محافظ فعال شد! یک بار مرگ رو نجات میده!', show_alert: false });
    await bot.editMessageText(`${game.isBlitz ? '⚡' : '💣'} ${DIFFICULTY[game.difficulty]?.name}\n🛡️ سپر محافظ فعال شد!\n${game.getStats()}`, {
      chat_id: chatId,
      message_id: ctx.callbackQuery.message.message_id,
      ...renderGame(game, false)
    });
  }
  else if (data.startsWith('back_')) {
    const gameId = data.replace('back_', '');
    const gameKey = `${chatId}_${userId}`;
    const game = games.get(gameKey);
    
    if (game && game.alive && game.gameId === gameId) {
      await bot.editMessageText(`${game.isBlitz ? '⚡' : '💣'} ${DIFFICULTY[game.difficulty]?.name}\n${game.getStats()}`, {
        chat_id: chatId,
        message_id: ctx.callbackQuery.message.message_id,
        ...renderGame(game, false)
      });
    } else {
      await bot.answerCallbackQuery(ctx.callbackQuery.id, { text: '❌ بازی تموم شده', show_alert: false });
    }
  }
  else {
    await bot.answerCallbackQuery(ctx.callbackQuery.id);
  }
});

// ================== CLEANUP ==================
setInterval(cleanupOldGames, 600000);
setInterval(checkWeeklyReset, 3600000);

// ================== ERROR HANDLING ==================
bot.on('error', (err) => {
  console.error('❌ Bot Error:', err);
});

// ================== LAUNCH ==================
bot.start()
  .then(() => console.log('🚀 Minesweeper PRO v6.3 Bale Running!'))
  .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

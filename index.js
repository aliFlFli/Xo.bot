const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

// ================== CONFIG ==================
const SIZE = 5;
const MINES = 5;

const bot = new Telegraf(process.env.BOT_TOKEN);
const games = new Map();
let flagMode = new Map();

// ================== GAME CLASS ==================
class MinesweeperGame {
  constructor() {
    this.size = SIZE;
    this.totalCells = SIZE * SIZE;
    this.minesCount = MINES;
    this.board = Array(this.totalCells).fill(0);
    this.revealed = Array(this.totalCells).fill(false);
    this.flags = Array(this.totalCells).fill(false);
    this.alive = true;
    this.opened = 0;
    this.startTime = Date.now();
    
    this.placeMines();
    this.calculateNumbers();
  }
  
  placeMines() {
    let placed = 0;
    while (placed < this.minesCount) {
      const idx = Math.floor(Math.random() * this.totalCells);
      if (this.board[idx] !== '💣') {
        this.board[idx] = '💣';
        placed++;
      }
    }
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
  
  revealEmpty(idx) {
    if (this.revealed[idx] || this.flags[idx]) return;
    
    this.revealed[idx] = true;
    this.opened++;
    
    if (this.board[idx] !== 0) return;
    
    const x = Math.floor(idx / this.size);
    const y = idx % this.size;
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
          const neighborIdx = nx * this.size + ny;
          if (!this.revealed[neighborIdx] && this.board[neighborIdx] !== '💣') {
            this.revealEmpty(neighborIdx);
          }
        }
      }
    }
  }
  
  revealAllMines() {
    for (let i = 0; i < this.totalCells; i++) {
      if (this.board[i] === '💣') {
        this.revealed[i] = true;
      }
    }
  }
  
  checkWin() {
    return this.opened === this.totalCells - this.minesCount;
  }
  
  getTime() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

// ================== RENDER ==================
function renderGame(game, gameOver = false) {
  const rows = [];
  
  for (let i = 0; i < game.size; i++) {
    const row = [];
    for (let j = 0; j < game.size; j++) {
      const idx = i * game.size + j;
      let display = '⬜';
      
      if (game.revealed[idx]) {
        if (game.board[idx] === '💣') display = '💣';
        else if (game.board[idx] === 0) display = '▪️';
        else display = String(game.board[idx]);
      } else if (game.flags[idx]) {
        display = '🚩';
      }
      
      row.push(Markup.button.callback(display, `cell_${idx}`));
    }
    rows.push(row);
  }
  
  const controlRow = [];
  if (!gameOver && game.alive) {
    controlRow.push(Markup.button.callback('🏁 پرچم', 'toggle_flag'));
  }
  controlRow.push(Markup.button.callback('🔄 جدید', 'new_game'));
  controlRow.push(Markup.button.callback('🏠 منو', 'menu'));
  rows.push(controlRow);
  
  return Markup.inlineKeyboard(rows);
}

// ================== BOT COMMANDS ==================
bot.start((ctx) => {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🎮 شروع بازی', 'start_game')]
  ]);
  
  ctx.reply(
    `💣 **ماین‌سوییپر کلاسیک**\n\n` +
    `• تخته ${SIZE}×${SIZE}\n` +
    `• ${MINES} مین\n` +
    `• روی خانه‌ها کلیک کن\n` +
    `• 🏁 پرچم مین‌ها رو علامت بزن\n\n` +
    `🎯 شروع کن!`,
    keyboard
  );
});

// ================== ACTIONS ==================
bot.action('start_game', (ctx) => {
  const game = new MinesweeperGame();
  games.set(ctx.chat.id, game);
  flagMode.set(ctx.chat.id, false);
  
  ctx.editMessageText(
    `💣 بازی شروع شد!\n⏱️ زمان: 0`,
    renderGame(game, false)
  );
  ctx.answerCbQuery();
});

bot.action('menu', (ctx) => {
  games.delete(ctx.chat.id);
  flagMode.delete(ctx.chat.id);
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🎮 شروع بازی', 'start_game')]
  ]);
  
  ctx.editMessageText(
    `💣 **ماین‌سوییپر کلاسیک**\n\n` +
    `• تخته ${SIZE}×${SIZE}\n` +
    `• ${MINES} مین\n` +
    `• روی خانه‌ها کلیک کن\n` +
    `• 🏁 پرچم مین‌ها رو علامت بزن`,
    keyboard
  );
});

bot.action('new_game', (ctx) => {
  const game = new MinesweeperGame();
  games.set(ctx.chat.id, game);
  flagMode.set(ctx.chat.id, false);
  
  ctx.editMessageText(
    `💣 بازی جدید!\n⏱️ زمان: 0`,
    renderGame(game, false)
  );
  ctx.answerCbQuery();
});

bot.action('toggle_flag', (ctx) => {
  const current = flagMode.get(ctx.chat.id) || false;
  flagMode.set(ctx.chat.id, !current);
  ctx.answerCbQuery(`${!current ? '🏁 حالت پرچم' : '🔍 حالت کلیک'} فعال شد`);
});

bot.action(/cell_(\d+)/, async (ctx) => {
  const game = games.get(ctx.chat.id);
  if (!game || !game.alive) {
    await ctx.answerCbQuery('❌ بازی فعال نیست! شروع کن');
    return;
  }
  
  const idx = parseInt(ctx.match[1]);
  const isFlagMode = flagMode.get(ctx.chat.id) || false;
  
  // حالت پرچم
  if (isFlagMode) {
    if (game.revealed[idx]) {
      await ctx.answerCbQuery('❌ نمیشه روی خونه باز شده پرچم زد');
      return;
    }
    
    game.flags[idx] = !game.flags[idx];
    const flagCount = game.flags.filter(f => f).length;
    
    await ctx.editMessageText(
      `💣 ماین‌سوییپر\n🚩 پرچم: ${flagCount}/${MINES}\n⏱️ زمان: ${game.getTime()}`,
      renderGame(game, false)
    );
    await ctx.answerCbQuery(game.flags[idx] ? '🚩 پرچم زده شد' : '🔓 پرچم برداشته شد');
    return;
  }
  
  // حالت کلیک عادی
  if (game.revealed[idx]) {
    await ctx.answerCbQuery('🔓 قبلاً باز شده');
    return;
  }
  
  if (game.flags[idx]) {
    await ctx.answerCbQuery('🚩 اول پرچم رو بردار');
    return;
  }
  
  // برخورد با مین
  if (game.board[idx] === '💣') {
    game.alive = false;
    game.revealAllMines();
    
    await ctx.editMessageText(
      `💥 **باختی!** 💀\n⏱️ زمان: ${game.getTime()}`,
      renderGame(game, true)
    );
    await ctx.answerCbQuery('💣 روی مین کلیک کردی!');
    return;
  }
  
  // باز کردن خونه
  game.revealEmpty(idx);
  
  // بررسی برد
  if (game.checkWin()) {
    game.alive = false;
    await ctx.editMessageText(
      `🎉 **بردی!** 🎉\n⏱️ زمان: ${game.getTime()}`,
      renderGame(game, true)
    );
    await ctx.answerCbQuery('🎉 بردی! آفرین!');
    return;
  }
  
  // آپدیت صفحه
  const flagCount = game.flags.filter(f => f).length;
  await ctx.editMessageText(
    `💣 ماین‌سوییپر\n🚩 پرچم: ${flagCount}/${MINES}\n⏱️ زمان: ${game.getTime()}`,
    renderGame(game, false)
  );
  await ctx.answerCbQuery('✅ باز شد');
});

// ================== LAUNCH ==================
bot.launch()
  .then(() => console.log('🚀 Minesweeper Bot Running!'))
  .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

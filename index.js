const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const games = {};

// ================== BOARD UI ==================
function boardUI(board) {
  const kb = [];
  for (let i = 0; i < 3; i++) {
    kb.push([
      Markup.button.callback(board[i*3] || '⬜️', `m_${i*3}`),
      Markup.button.callback(board[i*3+1] || '⬜️', `m_${i*3+1}`),
      Markup.button.callback(board[i*3+2] || '⬜️', `m_${i*3+2}`)
    ]);
  }
  return Markup.inlineKeyboard(kb);
}

// ================== WIN CHECK ==================
function checkWin(b) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (let [a, b2, c] of wins) {
    if (b[a] && b[a] === b[b2] && b[a] === b[c]) return b[a];
  }

  return b.every(x => x !== null) ? 'draw' : null;
}

// ================== AI ==================
function aiMove(board) {
  const empty = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
  return empty[Math.floor(Math.random() * empty.length)];
}

// ================== RENDER ==================
function render(game, result = null) {
  const rows = [];
  for (let i = 0; i < 3; i++) {
    rows.push(`${game.board[i*3]||'⬜️'} ${game.board[i*3+1]||'⬜️'} ${game.board[i*3+2]||'⬜️'}`);
  }

  let status = result 
    ? (result === '❌' ? `🏆 ${game.name} برد!` : result === '⭕️' ? `😈 ربات برد!` : `🤝 مساوی شد!`)
    : `👤 نوبت ${game.name}`;

  return `🎮 بازی دوز

👤 ${game.name}: ❌    🤖 ربات: ⭕️

${rows.join('\n')}

${status}`;
}

// ================== START ==================
bot.start(async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const userStarts = Math.random() < 0.5;

  games[id] = {
    board: Array(9).fill(null),
    name,
    userTurn: userStarts,
    finished: false
  };

  const game = games[id];

  await ctx.reply(render(game), boardUI(game.board));

  // اگر ربات اول شروع کند
  if (!userStarts) {
    setTimeout(async () => {
      const move = aiMove(game.board);
      game.board[move] = '⭕️';
      game.userTurn = true;

      await ctx.editMessageText(render(game), boardUI(game.board));
    }, 900);
  }
});

// ================== MOVE ==================
bot.action(/m_(\d+)/, async (ctx) => {
  const id = ctx.chat.id;
  const index = +ctx.match[1];
  const game = games[id];

  if (!game || game.finished || !game.userTurn) {
    return ctx.answerCbQuery('نوبت رباته!');
  }
  if (game.board[index] !== null) {
    return ctx.answerCbQuery('این خانه پر است!');
  }

  await ctx.answerCbQuery();

  // حرکت کاربر
  game.board[index] = '❌';
  let result = checkWin(game.board);

  if (result) {
    game.finished = true;
    return ctx.editMessageText(render(game, result), {
      reply_markup: Markup.inlineKeyboard([[ 
        { text: '🔁 بازی مجدد', callback_data: 'restart' } 
      ]])
    });
  }

  game.userTurn = false;

  // حرکت ربات
  const aiIndex = aiMove(game.board);
  game.board[aiIndex] = '⭕️';
  result = checkWin(game.board);

  game.userTurn = true;

  if (result) {
    game.finished = true;
    return ctx.editMessageText(render(game, result), {
      reply_markup: Markup.inlineKeyboard([[ 
        { text: '🔁 بازی مجدد', callback_data: 'restart' } 
      ]])
    });
  }

  // ادامه بازی
  await ctx.editMessageText(render(game), boardUI(game.board));
});

// ================== RESTART ==================
bot.action('restart', async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const userStarts = Math.random() < 0.5;

  games[id] = {
    board: Array(9).fill(null),
    name,
    userTurn: userStarts,
    finished: false
  };

  const game = games[id];

  await ctx.answerCbQuery('بازی جدید شروع شد ✅');
  await ctx.editMessageText(render(game), boardUI(game.board));

  if (!userStarts) {
    setTimeout(async () => {
      const move = aiMove(game.board);
      game.board[move] = '⭕️';
      game.userTurn = true;
      await ctx.editMessageText(render(game), boardUI(game.board));
    }, 800);
  }
});

bot.launch()
  .then(() => console.log('✅ ربات دوز آماده است'))
  .catch(err => console.error('❌ خطا:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

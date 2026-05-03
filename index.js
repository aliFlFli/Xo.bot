const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const games = {};

// ================= BOARD =================
function boardUI(board) {
  return Markup.inlineKeyboard(
    [0,1,2].map(r =>
      [
        Markup.button.callback(board[r*3] || '⬜️', `m_${r*3}`),
        Markup.button.callback(board[r*3+1] || '⬜️', `m_${r*3+1}`),
        Markup.button.callback(board[r*3+2] || '⬜️', `m_${r*3+2}`)
      ]
    )
  );
}

// ================= WIN =================
function checkWin(b) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (let [a,b2,c] of wins) {
    if (b[a] && b[a] === b[b2] && b[a] === b[c]) return b[a];
  }

  return b.every(x => x) ? 'draw' : null;
}

// ================= AI =================
function aiMove(board) {
  const empty = board
    .map((v,i)=>v===null?i:null)
    .filter(v=>v!==null);

  return empty[Math.floor(Math.random()*empty.length)];
}

// ================= RENDER =================
function render(game, result = null) {
  const b = game.board;

  const grid = [
    `${b[0]||'⬜️'} ${b[1]||'⬜️'} ${b[2]||'⬜️'}`,
    `${b[3]||'⬜️'} ${b[4]||'⬜️'} ${b[5]||'⬜️'}`,
    `${b[6]||'⬜️'} ${b[7]||'⬜️'} ${b[8]||'⬜️'}`
  ].join('\n');

  let status =
    result === '❌' ? `🏆 ${game.name} برد!` :
    result === '⭕️' ? `🤖 ربات برد!` :
    result === 'draw' ? `🤝 مساوی!` :
    `👤 نوبت ${game.name}`;

  return `🎮 دوز

👤 ${game.name} vs 🤖 ربات

${grid}

${status}`;
}

// ================= SAFE EDIT (FIXED) =================
async function safeEdit(ctx, game, result = null, keyboard = null) {
  try {
    await ctx.editMessageText(
      render(game, result),
      {
        reply_markup: keyboard ? keyboard.reply_markup : boardUI(game.board).reply_markup
      }
    );
  } catch (e) {
    console.log('edit ignored');
  }
}

// ================= START =================
bot.start(async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const userStarts = Math.random() < 0.5;

  const game = {
    board: Array(9).fill(null),
    name,
    userTurn: userStarts,
    finished: false,
    chatId: id
  };

  games[id] = game;

  await ctx.reply(render(game), boardUI(game.board));

  // ✅ FIX: no ctx inside timeout logic
  if (!userStarts) {
    setTimeout(async () => {
      if (!games[id]) return;

      const move = aiMove(game.board);
      game.board[move] = '⭕️';
      game.userTurn = true;

      await safeEdit(ctx, game);
    }, 400);
  }
});

// ================= MOVE =================
bot.action(/m_(\d+)/, async (ctx) => {
  const id = ctx.chat.id;
  const i = +ctx.match[1];
  const game = games[id];

  if (!game || game.finished) return ctx.answerCbQuery();
  if (!game.userTurn) return ctx.answerCbQuery('نوبت رباته 🤖');
  if (game.board[i]) return ctx.answerCbQuery('پر است!');

  await ctx.answerCbQuery();

  // user move
  game.board[i] = '❌';

  let res = checkWin(game.board);

  if (res) {
    game.finished = true;

    return safeEdit(
      ctx,
      game,
      res,
      Markup.inlineKeyboard([
        [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
      ])
    );
  }

  game.userTurn = false;

  // AI move
  const ai = aiMove(game.board);
  game.board[ai] = '⭕️';

  res = checkWin(game.board);

  game.userTurn = true;

  if (res) {
    game.finished = true;

    return safeEdit(
      ctx,
      game,
      res,
      Markup.inlineKeyboard([
        [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
      ])
    );
  }

  return safeEdit(ctx, game);
});

// ================= RESTART =================
bot.action('restart', async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const userStarts = Math.random() < 0.5;

  const game = {
    board: Array(9).fill(null),
    name,
    userTurn: userStarts,
    finished: false,
    chatId: id
  };

  games[id] = game;

  await ctx.answerCbQuery('شروع شد');

  await safeEdit(ctx, game);

  if (!userStarts) {
    setTimeout(async () => {
      if (!games[id]) return;

      const move = aiMove(game.board);
      game.board[move] = '⭕️';
      game.userTurn = true;

      await safeEdit(ctx, game);
    }, 350);
  }
});

bot.launch()
  .then(() => console.log('🤖 XO PRO CLEAN running'))
  .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

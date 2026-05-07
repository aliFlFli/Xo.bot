const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const games = {};

// ================== UI ==================
function boardUI(board) {
  return Markup.inlineKeyboard(
    [0,1,2].map(r => [
      Markup.button.callback(board[r*3] || '⬜️', `m_${r*3}`),
      Markup.button.callback(board[r*3+1] || '⬜️', `m_${r*3+1}`),
      Markup.button.callback(board[r*3+2] || '⬜️', `m_${r*3+2}`)
    ])
  );
}

function endKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔁 بازی مجدد', 'restart')]
  ]);
}

// ================== LOGIC ==================
function checkWin(b) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (let [a,b2,c] of wins) {
    if (b[a] && b[a] === b[b2] && b[a] === b[c]) return b[a];
  }

  return b.every(x => x !== null) ? 'draw' : null;
}

// ================== MINIMAX ==================
function minimax(board, isMax, depth = 0) {
  const result = checkWin(board);

  if (result === '⭕️') return 10 - depth;
  if (result === '❌') return -10 + depth;
  if (result === 'draw') return 0;

  if (isMax) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = '⭕️';
        best = Math.max(best, minimax(board, false, depth + 1));
        board[i] = null;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = '❌';
        best = Math.min(best, minimax(board, true, depth + 1));
        board[i] = null;
      }
    }
    return best;
  }
}

function bestMove(board) {
  let move = -1;
  let score = -Infinity;

  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = '⭕️';
      let s = minimax(board, false);
      board[i] = null;

      if (s > score) {
        score = s;
        move = i;
      }
    }
  }

  return move;
}

// ================== RENDER ==================
function render(game, result = null) {
  const b = game.board;

  const grid =
    [0,1,2].map(i =>
      `${b[i*3] || '⬜️'} ${b[i*3+1] || '⬜️'} ${b[i*3+2] || '⬜️'}`
    ).join('\n');

  const status =
    result
      ? (result === '❌'
          ? `🏆 ${game.name} برد!`
          : result === '⭕️'
            ? `🤖 ربات برد!`
            : `🤝 مساوی شد!`)
      : `👤 نوبت ${game.name}`;

  return `🎮 بازی دوز

👤 ${game.name}: ❌    🤖 ربات: ⭕️

${grid}

${status}`;
}

// ================== SAFE EDIT (FIXED) ==================
async function safeEdit(chatId, game, result = null, finished = false) {
  try {
    await bot.telegram.editMessageText(
      chatId,
      game.messageId,
      undefined,
      render(game, result),
      {
        reply_markup: finished ? endKeyboard().reply_markup : boardUI(game.board).reply_markup
      }
    );
  } catch (e) {
    // اگر edit نشد، پیام جدید نده → فقط بی‌صدا رد کن
  }
}

// ================== START ==================
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const msg = await ctx.reply(
    '🎮 در حال شروع...',
  );

  const game = {
    board: Array(9).fill(null),
    name,
    userTurn: Math.random() < 0.5,
    finished: false,
    messageId: msg.message_id
  };

  games[chatId] = game;

  await safeEdit(chatId, game);

  if (!game.userTurn) {
    setTimeout(() => botMove(chatId), 500);
  }
});

// ================== BOT MOVE ==================
async function botMove(chatId) {
  const game = games[chatId];
  if (!game || game.finished) return;

  const move = bestMove(game.board);
  if (move === -1) return;

  game.board[move] = '⭕️';

  const result = checkWin(game.board);

  if (result) {
    game.finished = true;
    return safeEdit(chatId, game, result, true);
  }

  game.userTurn = true;
  await safeEdit(chatId, game);
}

// ================== CLICK ==================
bot.action(/m_(\d+)/, async (ctx) => {
  const chatId = ctx.chat.id;
  const index = +ctx.match[1];

  const game = games[chatId];

  if (!game || game.finished) {
    return ctx.answerCbQuery('بازی وجود ندارد');
  }

  if (!game.userTurn) {
    return ctx.answerCbQuery('نوبت رباته 🤖');
  }

  if (game.board[index] !== null) {
    return ctx.answerCbQuery('این خانه پره!');
  }

  await ctx.answerCbQuery();

  game.board[index] = '❌';

  let result = checkWin(game.board);

  if (result) {
    game.finished = true;
    return safeEdit(chatId, game, result, true);
  }

  game.userTurn = false;
  await safeEdit(chatId, game);

  setTimeout(() => botMove(chatId), 400);
});

// ================== RESTART ==================
bot.action('restart', async (ctx) => {
  const chatId = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const msg = await ctx.editMessageText('🔄 شروع دوباره...');

  games[chatId] = {
    board: Array(9).fill(null),
    name,
    userTurn: Math.random() < 0.5,
    finished: false,
    messageId: msg.message_id
  };

  const game = games[chatId];

  await safeEdit(chatId, game);

  if (!game.userTurn) {
    setTimeout(() => botMove(chatId), 500);
  }
});

bot.launch()
  .then(() => console.log('🚀 دوز نهایی بدون باگ اجرا شد'))
  .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

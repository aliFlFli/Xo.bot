const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const games = {};

// ================== UI ==================
function boardUI(board) {
  return Markup.inlineKeyboard(
    [0, 1, 2].map(r => [
      Markup.button.callback(board[r * 3] || '⬜️', `m_${r * 3}`),
      Markup.button.callback(board[r * 3 + 1] || '⬜️', `m_${r * 3 + 1}`),
      Markup.button.callback(board[r * 3 + 2] || '⬜️', `m_${r * 3 + 2}`)
    ])
  );
}

function endKeyboard() {
  return Markup.inlineKeyboard([
    [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
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

function aiBestMove(board) {
  let bestScore = -Infinity;
  let move = -1;

  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = '⭕️';
      const score = minimax(board, false);
      board[i] = null;

      if (score > bestScore) {
        bestScore = score;
        move = i;
      }
    }
  }

  return move;
}

// ================== RENDER ==================
function render(game, result = null) {
  const b = game.board;

  const grid = [0,1,2]
    .map(i => `${b[i*3]||'⬜️'} ${b[i*3+1]||'⬜️'} ${b[i*3+2]||'⬜️'}`)
    .join('\n');

  let status = result
    ? (result === '❌'
        ? `🏆 ${game.name} برد!`
        : result === '⭕️'
        ? `🤖 ربات برد!`
        : `🤝 مساوی!`)
    : `👤 نوبت ${game.name}`;

  return `🎮 بازی دوز

👤 ${game.name}: ❌    🤖 ربات: ⭕️

${grid}

${status}`;
}

// ================== SAFE EDIT ==================
async function safeEdit(chatId, game, result = null, finished = false) {
  const keyboard = finished ? endKeyboard() : boardUI(game.board);

  try {
    await bot.telegram.editMessageText(
      chatId,
      undefined,
      undefined,
      render(game, result),
      { reply_markup: keyboard.reply_markup }
    );
  } catch (e) {
    // فقط لاگ، بدون اسپم
    console.log(`[edit failed] chat ${chatId}`);
  }
}

// ================== BOT MOVE ==================
async function makeBotMove(chatId) {
  const game = games[chatId];
  if (!game || game.finished) return;

  const version = game.version;
  const move = aiBestMove(game.board);

  if (move === -1) return;

  game.board[move] = '⭕️';
  game.userTurn = true;

  await safeEdit(chatId, game);

  if (games[chatId]?.version !== version) return;
}

// ================== END GAME ==================
async function endGame(chatId, game, result) {
  game.finished = true;
  await safeEdit(chatId, game, result, true);
}

// ================== START GAME ==================
async function startGame(ctx, isRestart = false) {
  const chatId = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const version = Date.now();

  games[chatId] = {
    board: Array(9).fill(null),
    name,
    userTurn: Math.random() < 0.5,
    finished: false,
    version
  };

  const game = games[chatId];

  if (isRestart) await ctx.answerCbQuery('🔄 بازی جدید');

  if (isRestart) {
    await safeEdit(chatId, game);
  } else {
    await ctx.reply(render(game), boardUI(game.board));
  }

  // اگر نوبت ربات باشد
  if (!game.userTurn) {
    setTimeout(() => {
      const current = games[chatId];
      if (current && current.version === version) {
        makeBotMove(chatId);
      }
    }, 650);
  }
}

// ================== COMMANDS ==================
bot.start((ctx) => startGame(ctx));
bot.action('restart', (ctx) => startGame(ctx, true));

// ================== MOVE ==================
bot.action(/m_(\d+)/, async (ctx) => {
  const chatId = ctx.chat.id;
  const index = +ctx.match[1];
  const game = games[chatId];

  if (!game || game.finished || !game.userTurn || game.board[index] !== null) {
    return ctx.answerCbQuery('⚠️ حرکت نامعتبر!');
  }

  await ctx.answerCbQuery();

  game.board[index] = '❌';

  let result = checkWin(game.board);
  if (result) return endGame(chatId, game, result);

  game.userTurn = false;

  await makeBotMove(chatId);

  const updated = games[chatId];
  if (!updated || updated.finished) return;

  result = checkWin(updated.board);

  if (result) {
    await endGame(chatId, updated, result);
  } else {
    updated.userTurn = true;
  }
});

// ================== LAUNCH ==================
bot.launch()
  .then(() => console.log('🚀 دوز نهایی با Minimax آماده است'))
  .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

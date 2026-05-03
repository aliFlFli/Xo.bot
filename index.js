const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const games = {};

// ================== UI ==================
function boardUI(board) {
  return Markup.inlineKeyboard(
    [0,1,2].map(r => [
      Markup.button.callback(board[r*3]   || '⬜️', `m_${r*3}`),
      Markup.button.callback(board[r*3+1] || '⬜️', `m_${r*3+1}`),
      Markup.button.callback(board[r*3+2] || '⬜️', `m_${r*3+2}`)
    ])
  );
}

function endKeyboard() {
  return Markup.inlineKeyboard([[{ text: '🔁 بازی مجدد', callback_data: 'restart' }]]);
}

// ================== LOGIC ==================
function checkWin(b) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (let [a,b2,c] of wins) {
    if (b[a] && b[a] === b[b2] && b[a] === b[c]) return b[a];
  }
  return b.every(x => x !== null) ? 'draw' : null;
}

// ================== MINIMAX (با Depth) ==================
function minimax(board, isMaximizing, depth = 0) {
  const result = checkWin(board);

  if (result === '⭕️') return 10 - depth;   // ترجیح برد سریع
  if (result === '❌') return -10 + depth;  // ترجیح باخت دیرتر
  if (result === 'draw') return 0;

  if (isMaximizing) {
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
  let bestMove = -1;

  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = '⭕️';
      const score = minimax(board, false);
      board[i] = null;

      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }
  return bestMove;
}

// ================== RENDER ==================
function render(game, result = null) {
  const b = game.board;
  const grid = [0,1,2].map(i => 
    `${b[i*3]||'⬜️'} ${b[i*3+1]||'⬜️'} ${b[i*3+2]||'⬜️'}`
  ).join('\n');

  let status = result 
    ? (result === '❌' ? `🏆 ${game.name} برد!` 
       : result === '⭕️' ? `🤖 ربات برد!` 
       : `🤝 مساوی!`)
    : `👤 نوبت ${game.name}`;

  return `🎮 بازی دوز

👤 ${game.name}: ❌    🤖 ربات: ⭕️

${grid}

${status}`;
}

// ================== SAFE EDIT (بدون fallback پیام جدید) ==================
async function safeEdit(chatId, game, result = null, isFinished = false) {
  const keyboard = isFinished ? endKeyboard() : boardUI(game.board);

  try {
    await bot.telegram.editMessageText(
      chatId,
      undefined,
      undefined,
      render(game, result),
      { reply_markup: keyboard.reply_markup }
    );
  } catch (e) {
    console.log(`[SafeEdit] Failed for chat ${chatId}`);
    // عمداً fallback پیام جدید نداریم تا چت شلوغ نشود
  }
}

// ================== BOT MOVE ==================
async function makeBotMove(chatId) {
  const game = games[chatId];
  if (!game || game.finished) return;

  const currentVersion = game.version;
  const bestMove = aiBestMove(game.board);

  if (bestMove < 0) return; // هیچ حرکت معتبری نبود

  game.board[bestMove] = '⭕️';
  game.userTurn = true;

  await safeEdit(chatId, game);

  if (games[chatId]?.version !== currentVersion) return;
}

// ================== END GAME ==================
async function endGame(chatId, game, result) {
  game.finished = true;
  await safeEdit(chatId, game, result, true);
}

// ================== START NEW GAME ==================
async function startNewGame(ctx, isRestart = false) {
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

  const sendMethod = isRestart ? safeEdit : ctx.reply.bind(ctx);
  await sendMethod(chatId, game);

  if (!game.userTurn) {
    setTimeout(() => {
      const current = games[chatId];
      if (current && current.version === version) makeBotMove(chatId);
    }, 650);
  }
}

bot.start((ctx) => startNewGame(ctx));
bot.action('restart', (ctx) => startNewGame(ctx, true));

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
  if (updated && !updated.finished) {
    result = checkWin(updated.board);
    if (result) await endGame(chatId, updated, result);
    else updated.userTurn = true;
  }
});

bot.launch()
  .then(() => console.log('🚀 ربات دوز نهایی با Minimax هوشمند اجرا شد'))
  .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

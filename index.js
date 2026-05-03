const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const games = {};

// ================= BOARD =================
function createBoard(board) {
  const keyboard = [];

  for (let i = 0; i < 3; i++) {
    keyboard.push([
      Markup.button.callback(board[i*3]     || '⬜️', `move_${i*3}`),
      Markup.button.callback(board[i*3 + 1] || '⬜️', `move_${i*3 + 1}`),
      Markup.button.callback(board[i*3 + 2] || '⬜️', `move_${i*3 + 2}`)
    ]);
  }

  return Markup.inlineKeyboard(keyboard);
}

// ================= CHECK WIN =================
function checkWin(board) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (let [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return board.every(v => v !== null) ? 'draw' : null;
}

// ================= MINIMAX =================
function minimax(board, isMaximizing) {
  const result = checkWin(board);

  if (result === '⭕️') return 1;
  if (result === '❌') return -1;
  if (result === 'draw') return 0;

  const empty = board
    .map((v,i)=>v===null?i:null)
    .filter(v=>v!==null);

  if (isMaximizing) {
    let best = -Infinity;

    for (let i of empty) {
      board[i] = '⭕️';
      let score = minimax(board, false);
      board[i] = null;

      best = Math.max(best, score);
    }

    return best;
  } else {
    let best = Infinity;

    for (let i of empty) {
      board[i] = '❌';
      let score = minimax(board, true);
      board[i] = null;

      best = Math.min(best, score);
    }

    return best;
  }
}

// ================= AI MOVE =================
function aiMove(board) {
  let bestScore = -Infinity;
  let move = null;

  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      board[i] = '⭕️';

      let score = minimax(board, false);

      board[i] = null;

      if (score > bestScore) {
        bestScore = score;
        move = i;
      }
    }
  }

  return move;
}

// ================= START =================
bot.start((ctx) => {
  const id = ctx.chat.id;

  games[id] = {
    board: Array(9).fill(null)
  };

  ctx.reply(
`🎮 دوز شروع شد!

❌ تو vs ⭕️ ربات

نوبت تو 👇`,
    createBoard(games[id].board)
  );
});

// ================= MOVE =================
bot.action(/move_(\d+)/, async (ctx) => {
  const id = ctx.chat.id;
  const index = parseInt(ctx.match[1]);

  await ctx.answerCbQuery();

  const game = games[id];
  if (!game) return ctx.answerCbQuery('اول /start بزن');

  if (game.board[index]) {
    return ctx.answerCbQuery('این خانه پر است!');
  }

  // حرکت کاربر
  game.board[index] = '❌';

  let result = checkWin(game.board);

  if (result) {
    await ctx.editMessageText(getResultText(result), {
      reply_markup: restartKeyboard().reply_markup
    });
    delete games[id];
    return;
  }

  // حرکت ربات (Minimax AI)
  const aiIndex = aiMove(game.board);
  game.board[aiIndex] = '⭕️';

  result = checkWin(game.board);

  await ctx.editMessageText(
    result
      ? getResultText(result)
      : '🤖 فکر کردم... نوبت تو 😎👇',
    {
      reply_markup: result
        ? restartKeyboard().reply_markup
        : createBoard(game.board).reply_markup
    }
  );

  if (result) delete games[id];
});

// ================= RESTART =================
function restartKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
      ]
    }
  };
}

bot.action('restart', async (ctx) => {
  const id = ctx.chat.id;

  await ctx.answerCbQuery();

  games[id] = {
    board: Array(9).fill(null)
  };

  await ctx.editMessageText(
`🎮 بازی جدید شروع شد!

❌ تو vs ⭕️ ربات

نوبت تو 👇`,
    createBoard(games[id].board)
  );
});

// ================= RESULT =================
function getResultText(result) {
  if (result === '❌') return '🏆 تو بردی (خیلی کم پیش میاد 😄)';
  if (result === '⭕️') return '😈 من بردم!';
  if (result === 'draw') return '🤝 مساوی شد!';
  return '';
}

// ================= RUN =================
bot.launch()
  .then(() => console.log('🤖 XO Minimax Bot Running'))
  .catch(err => console.error('❌ Error:', err));

// ================= STOP =================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

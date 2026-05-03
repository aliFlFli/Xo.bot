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

// ================= WIN CHECK =================
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

// ================= AI =================
function aiMove(board) {
  const empty = board
    .map((v,i)=>v===null?i:null)
    .filter(v=>v!==null);

  // 1. برد
  for (let i of empty) {
    const test = [...board];
    test[i] = '⭕️';
    if (checkWin(test) === '⭕️') return i;
  }

  // 2. بلاک
  for (let i of empty) {
    const test = [...board];
    test[i] = '❌';
    if (checkWin(test) === '❌') return i;
  }

  // 3. مرکز
  if (board[4] === null) return 4;

  // 4. گوشه‌ها
  const corners = [0,2,6,8].filter(i => board[i] === null);
  if (corners.length) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // 5. رندوم
  return empty[Math.floor(Math.random() * empty.length)];
}

// ================= START =================
bot.start((ctx) => {
  const id = ctx.chat.id;

  games[id] = {
    board: Array(9).fill(null)
  };

  ctx.reply(
`🎮 دوز

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
    return ctx.answerCbQuery('این خونه پره!');
  }

  // حرکت کاربر
  game.board[index] = '❌';

  let result = checkWin(game.board);

  // پایان بازی
  if (result) {
    await ctx.editMessageText(getResultText(result), {
      reply_markup: restartKeyboard().reply_markup
    });
    delete games[id];
    return;
  }

  // حرکت ربات
  const aiIndex = aiMove(game.board);
  game.board[aiIndex] = '⭕️';

  result = checkWin(game.board);

  await ctx.editMessageText(
    result
      ? getResultText(result)
      : '🤖 حرکت من...\n\nنوبت تو 😎👇',
    {
      reply_markup: result
        ? restartKeyboard().reply_markup
        : createBoard(game.board).reply_markup
    }
  );

  if (result) delete games[id];
});

// ================= RESTART BUTTON =================
function restartKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
      ]
    }
  };
}

// ================= RESTART GAME =================
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

// ================= RESULT TEXT =================
function getResultText(result) {
  if (result === '❌') return '🏆 تبریک! تو بردی!';
  if (result === '⭕️') return '😈 ربات برد!';
  if (result === 'draw') return '🤝 مساوی شد!';
  return '';
}

// ================= RUN =================
bot.launch()
  .then(() => console.log('🤖 XO Bot Running'))
  .catch(err => console.error('❌ Error:', err));

// ================= STOP =================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

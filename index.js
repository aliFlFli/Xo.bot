const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const games = {};

// ================= HELPERS =================
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

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

// ================= MINIMAX =================
function minimax(board, isMax) {
  const result = checkWin(board);

  if (result === '⭕️') return 1;
  if (result === '❌') return -1;
  if (result === 'draw') return 0;

  const empty = board
    .map((v,i)=>v===null?i:null)
    .filter(v=>v!==null);

  if (isMax) {
    let best = -Infinity;

    for (let i of empty) {
      board[i] = '⭕️';
      best = Math.max(best, minimax(board, false));
      board[i] = null;
    }

    return best;
  } else {
    let best = Infinity;

    for (let i of empty) {
      board[i] = '❌';
      best = Math.min(best, minimax(board, true));
      board[i] = null;
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

// ================= RESULT TEXT =================
function getResultText(result) {
  if (result === '❌') return '🏆 تو بردی!';
  if (result === '⭕️') return '😈 ربات برد!';
  if (result === 'draw') return '🤝 مساوی شد!';
  return '';
}

// ================= END KEYBOARD =================
function endKeyboard(text) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `🏁 ${text}`, callback_data: 'info' }],
        [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
      ]
    }
  };
}

// ================= START =================
bot.start((ctx) => {
  const id = ctx.chat.id;

  games[id] = {
    board: Array(9).fill(null)
  };

  ctx.reply(
`🎮 دوز شروع شد

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
  if (!game) return;

  if (game.board[index]) {
    return ctx.answerCbQuery('این خانه پره!');
  }

  // 👤 حرکت کاربر
  game.board[index] = '❌';

  let result = checkWin(game.board);

  if (result) {
    await ctx.editMessageText(
      getResultText(result),
      endKeyboard(getResultText(result))
    );
    delete games[id];
    return;
  }

  // ================= 🤖 THINKING =================
  await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

  const thinkingMsg = await ctx.reply('🤖 دارم فکر می‌کنم...');

  await sleep(900);

  // 🤖 حرکت AI
  const aiIndex = aiMove(game.board);
  game.board[aiIndex] = '⭕️';

  await sleep(400);

  await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id);

  result = checkWin(game.board);

  await ctx.editMessageText(
    result
      ? getResultText(result)
      : '🤖 فکر کردم... نوبت تو 😎👇',
    {
      reply_markup: result
        ? endKeyboard(getResultText(result)).reply_markup
        : createBoard(game.board).reply_markup
    }
  );

  if (result) delete games[id];
});

// ================= RESTART =================
bot.action('restart', async (ctx) => {
  const id = ctx.chat.id;

  await ctx.answerCbQuery();

  games[id] = {
    board: Array(9).fill(null)
  };

  await ctx.editMessageText(
`🎮 بازی جدید شروع شد

❌ تو vs ⭕️ ربات

نوبت تو 👇`,
    createBoard(games[id].board)
  );
});

// ================= RUN =================
bot.launch()
  .then(() => console.log('🤖 XO Bot Running (Minimax + Thinking)'))
  .catch(console.error);

// ================= STOP =================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

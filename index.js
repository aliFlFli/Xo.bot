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
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];

  for (let [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return board.every(cell => cell !== null) ? 'draw' : null;
}

// ================= AI (UPGRADED) =================
function aiMove(board) {
  const empty = board
    .map((v,i)=>v===null?i:null)
    .filter(v=>v!==null);

  // 1. برد ربات
  for (let i of empty) {
    const test = [...board];
    test[i] = '⭕️';
    if (checkWin(test) === '⭕️') return i;
  }

  // 2. بلاک بازیکن
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
  const chatId = ctx.chat.id;

  games[chatId] = {
    board: Array(9).fill(null)
  };

  ctx.reply(
`🎮 دوز

❌ تو vs ⭕️ ربات

نوبت تو 👇`,
    createBoard(games[chatId].board)
  );
});

// ================= MOVE =================
bot.action(/move_(\d+)/, async (ctx) => {
  const chatId = ctx.chat.id;
  const index = parseInt(ctx.match[1]);

  await ctx.answerCbQuery(); // جلوگیری از اسپم کلیک

  const game = games[chatId];
  if (!game) return ctx.answerCbQuery('🎮 اول /start بزن');

  if (game.board[index] !== null) {
    return ctx.answerCbQuery('❌ این خونه پره!');
  }

  // حرکت بازیکن
  game.board[index] = '❌';

  let result = checkWin(game.board);

  if (result) {
    await ctx.editMessageText(getResultText(result), {
      reply_markup: createBoard(game.board).reply_markup
    });
    delete games[chatId];
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
      reply_markup: createBoard(game.board).reply_markup
    }
  );

  if (result) delete games[chatId];
});

// ================= RESULT =================
function getResultText(result) {
  if (result === '❌') return '🏆 تبریک! تو بردی!';
  if (result === '⭕️') return '😈 من بردم!';
  if (result === 'draw') return '🤝 مساوی شد!';
  return '';
}

// ================= RUN =================
bot.launch()
  .then(() => console.log('✅ XO Bot Running'))
  .catch(err => console.error('❌ Error:', err));

// ================= STOP =================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ذخیره بازی‌ها
const games = {};

// ساخت کیبورد
function createBoard(board) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(board[0] || '⬜️', 'move_0'),
      Markup.button.callback(board[1] || '⬜️', 'move_1'),
      Markup.button.callback(board[2] || '⬜️', 'move_2')
    ],
    [
      Markup.button.callback(board[3] || '⬜️', 'move_3'),
      Markup.button.callback(board[4] || '⬜️', 'move_4'),
      Markup.button.callback(board[5] || '⬜️', 'move_5')
    ],
    [
      Markup.button.callback(board[6] || '⬜️', 'move_6'),
      Markup.button.callback(board[7] || '⬜️', 'move_7'),
      Markup.button.callback(board[8] || '⬜️', 'move_8')
    ]
  ]);
}

// بررسی برنده
function checkWin(b) {
  const win = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (let [a,b1,c] of win) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
  }

  if (!b.includes(null)) return 'draw';
  return null;
}

// حرکت ربات (ساده)
function aiMove(board) {
  const empty = board
    .map((v,i)=>v===null?i:null)
    .filter(v=>v!==null);

  return empty[Math.floor(Math.random() * empty.length)];
}

// شروع بازی
bot.start((ctx) => {
  const id = ctx.chat.id;

  games[id] = {
    board: Array(9).fill(null)
  };

  ctx.reply('🎮 دوز شروع شد!\nتو: ❌', createBoard(games[id].board));
});

// هندل کلیک‌ها
bot.action(/move_(\d+)/, async (ctx) => {
  const id = ctx.chat.id;
  const index = parseInt(ctx.match[1]);

  const game = games[id];
  if (!game) return ctx.answerCbQuery('اول /start بزن');

  if (game.board[index]) {
    return ctx.answerCbQuery('این خونه پره!');
  }

  // حرکت کاربر
  game.board[index] = '❌';

  let result = checkWin(game.board);
  if (result) {
    await ctx.editMessageText(getResult(result), createBoard(game.board));
    delete games[id];
    return;
  }

  // حرکت ربات
  const aiIndex = aiMove(game.board);
  game.board[aiIndex] = '⭕️';

  result = checkWin(game.board);
  if (result) {
    await ctx.editMessageText(getResult(result), createBoard(game.board));
    delete games[id];
    return;
  }

  await ctx.editMessageText('نوبت تو 👇', createBoard(game.board));
});

// متن نتیجه
function getResult(result) {
  if (result === '❌') return '🏆 تو بردی!';
  if (result === '⭕️') return '🤖 ربات برد!';
  return '🤝 مساوی!';
}

// اجرای ربات
bot.launch()
  .then(() => console.log('🤖 Bot is running'))
  .catch(err => console.log('❌ Error:', err));

// خاموشی امن
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

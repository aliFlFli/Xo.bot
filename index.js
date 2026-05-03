const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const games = {};

// ================= BOARD =================
function createBoard(board) {
  const kb = [];

  for (let i = 0; i < 3; i++) {
    kb.push([
      Markup.button.callback(board[i*3]     || '⬜️', `move_${i*3}`),
      Markup.button.callback(board[i*3 + 1] || '⬜️', `move_${i*3 + 1}`),
      Markup.button.callback(board[i*3 + 2] || '⬜️', `move_${i*3 + 2}`)
    ]);
  }

  return Markup.inlineKeyboard(kb);
}

// ================= WIN CHECK =================
function checkWin(b) {
  const w = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (let [a,b2,c] of w) {
    if (b[a] && b[a] === b[b2] && b[a] === b[c]) return b[a];
  }

  return b.every(x => x !== null) ? 'draw' : null;
}

// ================= AI (ساده) =================
function aiMove(board) {
  const empty = board.map((v,i)=>v===null?i:null).filter(v=>v!==null);
  return empty[Math.floor(Math.random() * empty.length)];
}

// ================= START GAME =================
bot.start((ctx) => {
  const id = ctx.chat.id;

  const name = ctx.from.first_name || "بازیکن";

  const userStarts = Math.random() < 0.5;

  games[id] = {
    board: Array(9).fill(null),
    userTurn: userStarts
  };

  ctx.reply(
`🎮 دوز

👤 ${name}: ❌
🤖 ربات: ⭕️

${userStarts ? `🔥 نوبت ${name}` : `🤖 ربات شروع می‌کند`}`,
    createBoard(games[id].board)
  );

  // اگر ربات شروع کنه
  if (!userStarts) {
    const ai = aiMove(games[id].board);
    games[id].board[ai] = '⭕️';
    games[id].userTurn = true;

    ctx.reply(
`🤖 ربات حرکت کرد
👤 نوبت ${name}`,
      createBoard(games[id].board)
    );
  }
});

// ================= MOVE =================
bot.action(/move_(\d+)/, async (ctx) => {
  const id = ctx.chat.id;
  const i = +ctx.match[1];
  const game = games[id];

  await ctx.answerCbQuery();

  if (!game) return;

  if (!game.userTurn) {
    return ctx.answerCbQuery('الان نوبت رباته 🤖');
  }

  if (game.board[i]) {
    return ctx.answerCbQuery('این خانه پره!');
  }

  const name = ctx.from.first_name || "بازیکن";

  // 👤 حرکت کاربر
  game.board[i] = '❌';

  let res = checkWin(game.board);

  if (res) {
    return ctx.editMessageText(
      render(game.board, res, name),
      endKeyboard(res)
    );
  }

  game.userTurn = false;

  // 🤖 حرکت ربات
  const ai = aiMove(game.board);
  game.board[ai] = '⭕️';

  res = checkWin(game.board);

  game.userTurn = true;

  return ctx.editMessageText(
    render(game.board, res, name),
    createBoard(game.board)
  );
});

// ================= UI =================
function render(board, res, name) {
  const rows = [];

  for (let i = 0; i < 3; i++) {
    rows.push(`${board[i*3]||'⬜️'} ${board[i*3+1]||'⬜️'} ${board[i*3+2]||'⬜️'}`);
  }

  let status = '';

  if (!res) {
    status = `👤 نوبت ${name}`;
  } else if (res === '❌') {
    status = `🏆 ${name} برد!`;
  } else if (res === '⭕️') {
    status = `😈 ربات برد!`;
  } else {
    status = `🤝 مساوی شد!`;
  }

  return `🎮 دوز

👤 ${name} vs 🤖 ربات

${rows.join('\n')}

${status}`;
}

// ================= END BUTTONS =================
function endKeyboard(result) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `🏁 ${result}`, callback_data: 'info' }],
        [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
      ]
    }
  };
}

// ================= RESTART =================
bot.action('restart', async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  games[id] = {
    board: Array(9).fill(null),
    userTurn: Math.random() < 0.5
  };

  await ctx.answerCbQuery();

  return ctx.editMessageText(
`🎮 بازی جدید

👤 ${name} vs 🤖 ربات

${games[id].userTurn ? `🔥 نوبت ${name}` : `🤖 ربات شروع می‌کند`}`,
    createBoard(games[id].board)
  );
});

bot.launch()
  .then(() => console.log('🤖 XO upgraded bot running'))
  .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

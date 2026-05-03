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

// ================= WIN =================
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

// ================= MINIMAX =================
function minimax(board, isMax) {
  const res = checkWin(board);

  if (res === '⭕️') return 1;
  if (res === '❌') return -1;
  if (res === 'draw') return 0;

  const empty = board.map((v,i)=>v===null?i:null).filter(v=>v!==null);

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

// ================= AI =================
function aiMove(board) {
  let best = -Infinity;
  let move = null;

  for (let i = 0; i < board.length; i++) {
    if (!board[i]) {
      board[i] = '⭕️';
      let score = minimax(board, false);
      board[i] = null;

      if (score > best) {
        best = score;
        move = i;
      }
    }
  }

  return move;
}

// ================= RESULT TEXT =================
function resultText(r) {
  if (r === '❌') return '🏆 تو بردی!';
  if (r === '⭕️') return '😈 ربات برد!';
  if (r === 'draw') return '🤝 مساوی شد!';
  return '';
}

// ================= END UI =================
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
`🎮 دوز

❌ تو vs ⭕️ ربات

نوبت تو 👇`,
    createBoard(games[id].board)
  );
});

// ================= MOVE =================
bot.action(/move_(\d+)/, async (ctx) => {
  const id = ctx.chat.id;
  const i = +ctx.match[1];

  await ctx.answerCbQuery();

  const game = games[id];
  if (!game) return;

  if (game.board[i]) return ctx.answerCbQuery('پر است!');

  // 👤 حرکت کاربر
  game.board[i] = '❌';

  let res = checkWin(game.board);

  if (res) {
    return ctx.editMessageText(
      renderBoard(game.board, resultText(res)),
      endKeyboard(resultText(res))
    );
  }

  // 🤖 حرکت AI (بدون typing، بدون پیام اضافی)
  const ai = aiMove(game.board);
  game.board[ai] = '⭕️';

  res = checkWin(game.board);

  await ctx.editMessageText(
    renderBoard(game.board, res ? resultText(res) : 'نوبت تو 👇'),
    res
      ? endKeyboard(resultText(res))
      : createBoard(game.board)
  );

  if (res) delete games[id];
});

// ================= RESTART =================
bot.action('restart', async (ctx) => {
  const id = ctx.chat.id;

  await ctx.answerCbQuery();

  games[id] = {
    board: Array(9).fill(null)
  };

  await ctx.editMessageText(
`🎮 بازی جدید

❌ تو vs ⭕️ ربات

نوبت تو 👇`,
    createBoard(games[id].board)
  );
});

// ================= BOARD RENDER =================
function renderBoard(board, status) {
  const rows = [];

  for (let i = 0; i < 3; i++) {
    rows.push(`${board[i*3] || '⬜️'} ${board[i*3+1] || '⬜️'} ${board[i*3+2] || '⬜️'}`);
  }

  return `🎮 دوز

${rows.join('\n')}

${status}`;
}

// ================= RUN =================
bot.launch()
  .then(() => console.log('🤖 XO Fixed UI Bot Running'))
  .catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

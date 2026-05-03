const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const games = {};

// ================= BOARD =================
function boardUI(board) {
  const kb = [];

  for (let i = 0; i < 3; i++) {
    kb.push([
      Markup.button.callback(board[i*3] || '⬜️', `m_${i*3}`),
      Markup.button.callback(board[i*3+1] || '⬜️', `m_${i*3+1}`),
      Markup.button.callback(board[i*3+2] || '⬜️', `m_${i*3+2}`)
    ]);
  }

  return Markup.inlineKeyboard(kb);
}

// ================= WIN =================
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

// ================= AI =================
function aiMove(board) {
  const empty = board.map((v,i)=>v===null?i:null).filter(v=>v!==null);
  return empty[Math.floor(Math.random()*empty.length)];
}

// ================= RENDER =================
function render(game, result=null) {
  const rows = [];

  for (let i=0;i<3;i++) {
    rows.push(`${game.board[i*3]||'⬜️'} ${game.board[i*3+1]||'⬜️'} ${game.board[i*3+2]||'⬜️'}`);
  }

  let status = '';

  if (!result) status = `👤 نوبت ${game.name}`;
  else if (result === '❌') status = `🏆 ${game.name} برد!`;
  else if (result === '⭕️') status = `😈 ربات برد!`;
  else status = `🤝 مساوی شد!`;

  return `🎮 دوز

👤 ${game.name} vs 🤖 ربات

${rows.join('\n')}

${status}`;
}

// ================= SAFE EDIT =================
async function safeEdit(ctx, game, result=null, keyboard=null) {
  try {
    return await ctx.editMessageText(
      render(game, result),
      keyboard ? keyboard : boardUI(game.board)
    );
  } catch (e) {
    // اگر پیام قابل edit نبود → ignore
    console.log('edit skipped');
  }
}

// ================= START =================
bot.start(async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const userStarts = Math.random() < 0.5;

  const game = {
    board: Array(9).fill(null),
    name,
    userTurn: userStarts,
    finished: false
  };

  games[id] = game;

  const msg = await ctx.reply(render(game), boardUI(game.board));

  game.messageId = msg.message_id;

  // اگر ربات شروع کند (بدون timeout خراب‌کننده)
  if (!userStarts) {
    setTimeout(() => {
      if (!games[id]) return;

      const move = aiMove(game.board);
      game.board[move] = '⭕️';
      game.userTurn = true;

      safeEdit(ctx, game);
    }, 600);
  }
});

// ================= MOVE =================
bot.action(/m_(\d+)/, async (ctx) => {
  const id = ctx.chat.id;
  const i = +ctx.match[1];
  const game = games[id];

  if (!game || game.finished) return ctx.answerCbQuery();

  if (!game.userTurn) return ctx.answerCbQuery('نوبت رباته 🤖');
  if (game.board[i]) return ctx.answerCbQuery('پر است!');

  await ctx.answerCbQuery();

  // user move
  game.board[i] = '❌';

  let res = checkWin(game.board);

  if (res) {
    game.finished = true;
    return safeEdit(ctx, game, res, Markup.inlineKeyboard([
      [{ text:'🔁 بازی مجدد', callback_data:'restart' }]
    ]));
  }

  game.userTurn = false;

  // ai move
  const ai = aiMove(game.board);
  game.board[ai] = '⭕️';

  res = checkWin(game.board);

  game.userTurn = true;

  if (res) {
    game.finished = true;
    return safeEdit(ctx, game, res, Markup.inlineKeyboard([
      [{ text:'🔁 بازی مجدد', callback_data:'restart' }]
    ]));
  }

  return safeEdit(ctx, game);
});

// ================= RESTART =================
bot.action('restart', async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const userStarts = Math.random() < 0.5;

  games[id] = {
    board: Array(9).fill(null),
    name,
    userTurn: userStarts,
    finished: false
  };

  const game = games[id];

  await ctx.answerCbQuery('شروع شد');

  await safeEdit(ctx, game);

  if (!userStarts) {
    setTimeout(() => {
      if (!games[id]) return;

      const move = aiMove(game.board);
      game.board[move] = '⭕️';
      game.userTurn = true;

      safeEdit(ctx, game);
    }, 500);
  }
});

bot.launch()
  .then(() => console.log('🤖 XO stable version running'))
  .catch(console.error);

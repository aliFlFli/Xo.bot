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
function check(b) {
  const w = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (let [a,b2,c] of w) {
    if (b[a] && b[a] === b[b2] && b[a] === b[c]) return b[a];
  }

  return b.every(x => x) ? 'draw' : null;
}

// ================= AI (همان ساده ولی درست) =================
function aiMove(board) {
  const empty = board.map((v,i)=>v?null:i).filter(v=>v!==null);
  return empty[Math.floor(Math.random()*empty.length)];
}

// ================= RENDER =================
function render(game, result = null) {
  const { board, name } = game;

  const rows = [];
  for (let i = 0; i < 3; i++) {
    rows.push(`${board[i*3]||'⬜️'} ${board[i*3+1]||'⬜️'} ${board[i*3+2]||'⬜️'}`);
  }

  let status = '';

  if (!result) {
    status = `👤 نوبت ${name}`;
  } else if (result === '❌') {
    status = `🏆 ${name} برد!`;
  } else if (result === '⭕️') {
    status = `😈 ربات برد!`;
  } else {
    status = `🤝 مساوی شد!`;
  }

  return `🎮 دوز

👤 ${name} vs 🤖 ربات

${rows.join('\n')}

${status}`;
}

// ================= START =================
bot.start(async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  const userStarts = Math.random() < 0.5;

  games[id] = {
    board: Array(9).fill(null),
    name,
    userTurn: userStarts,
    finished: false
  };

  await ctx.reply(
    render(games[id]),
    boardUI(games[id].board)
  );

  // اگر ربات شروع کند → فقط edit همان پیام
  if (!userStarts) {
    const g = games[id];
    const move = aiMove(g.board);
    g.board[move] = '⭕️';
    g.userTurn = true;

    await ctx.reply(
      render(g),
      boardUI(g.board)
    );
  }
});

// ================= MOVE =================
bot.action(/m_(\d+)/, async (ctx) => {
  const id = ctx.chat.id;
  const i = +ctx.match[1];

  await ctx.answerCbQuery();

  const g = games[id];
  if (!g || g.finished) return;

  if (!g.userTurn) return ctx.answerCbQuery('نوبت رباته 🤖');
  if (g.board[i]) return ctx.answerCbQuery('پر است!');

  // 👤 move user
  g.board[i] = '❌';

  let res = check(g.board);

  if (res) {
    g.finished = true;
    return ctx.editMessageText(render(g, res), {
      reply_markup: Markup.inlineKeyboard([
        [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
      ])
    });
  }

  g.userTurn = false;

  // 🤖 move AI
  const ai = aiMove(g.board);
  g.board[ai] = '⭕️';

  res = check(g.board);

  g.userTurn = true;

  if (res) {
    g.finished = true;
    return ctx.editMessageText(render(g, res), {
      reply_markup: Markup.inlineKeyboard([
        [{ text: '🔁 بازی مجدد', callback_data: 'restart' }]
      ])
    });
  }

  return ctx.editMessageText(render(g), boardUI(g.board));
});

// ================= RESTART =================
bot.action('restart', async (ctx) => {
  const id = ctx.chat.id;
  const name = ctx.from.first_name || "بازیکن";

  games[id] = {
    board: Array(9).fill(null),
    name,
    userTurn: Math.random() < 0.5,
    finished: false
  };

  await ctx.answerCbQuery();

  const g = games[id];

  // اگر ربات شروع کند
  if (!g.userTurn) {
    const move = aiMove(g.board);
    g.board[move] = '⭕️';
    g.userTurn = true;
  }

  return ctx.editMessageText(render(g), boardUI(g.board));
});

bot.launch()
  .then(() => console.log('🤖 XO FIXED running'))
  .catch(console.error);

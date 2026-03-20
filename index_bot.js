// =========================
// 🚀 IMPORTS
// =========================
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// =========================
// ⚙️ CONFIG
// =========================
const TOKEN = process.env.TELEGRAM_TOKEN;
const API_URL = process.env.API_URL || 'https://api.alfateh.cloudtech-it.com';
const PORT = process.env.PORT || 5000;

const LOGO_URL = 'https://raw.githubusercontent.com/ramisalh21022/alfatehisp_boot_telegram/main/alfateh.png';

const bot = new TelegramBot(TOKEN, { polling: false });
const app = express();

app.use(bodyParser.json());

// =========================
// 🌐 LANGUAGE DICTIONARY
// =========================
const LANG = {
  ar: {
    welcome: '👋 أهلاً بك في مزود الفتح',
    login: '🔐 تسجيل الدخول',
    nationalId: '🆔 طلب الرقم الوطني',
    address: '📍 العنوان',
    pos: '🏪 نقاط البيع',
    contact: '📞 التواصل',
  },
  en: {
    welcome: '👋 Welcome to Alfateh ISP',
    login: '🔐 Login',
    nationalId: '🆔 Request National ID',
    address: '📍 Address',
    pos: '🏪 Points of Sale',
    contact: '📞 Contact',
  }
};

const t = (session, key) => {
  const lang = session.lang || 'ar';
  return LANG[lang][key] || key;
};

// =========================
// 🔥 SESSIONS
// =========================
const sessions = new Map();

// =========================
// 📊 HELPERS
// =========================
const octetsToGB = (octets = 0) =>
  octets ? octets / 1024 / 1024 / 1024 : 0;

const calculateUsage = (s) => {
  const used = octetsToGB(s.currentInputOctets) + octetsToGB(s.currentOutputOctets);
  const total = octetsToGB(s.downloadLimit) + octetsToGB(s.uploadLimit);
  const remaining = total - used;
  const percent = total > 0 ? (used / total) * 100 : 0;

  return {
    usedGB: used.toFixed(2),
    totalGB: total.toFixed(2),
    remainingGB: remaining.toFixed(2),
    percent: percent.toFixed(1)
  };
};

// =========================
// 🧠 API
// =========================
async function getUserInfo(token) {
  try {
    const profile = await axios.get(`${API_URL}/api/customers/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const accounts = await axios.get(`${API_URL}/api/customers/me/accounts`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return {
      fullName: profile.data.fullName || '—',
      balance: accounts.data?.[0]
        ? `${accounts.data[0].balance} ${accounts.data[0].currency}`
        : '—'
    };

  } catch {
    return { fullName: 'غير معروف', balance: '—' };
  }
}

// =========================
// 🎨 UI: WELCOME
// =========================
async function showWelcome(chatId, session) {
  const caption = `
╔══════════════════════╗
   🌐 *ALFATEH ISP*
╚══════════════════════╝

${t(session, 'welcome')}

${t(session, 'address')}:
Damascus - Syria

${t(session, 'pos')}:
• City Center
• Mazzeh

${t(session, 'contact')}:
📞 099999999
📞 098888888
`;

  return bot.sendPhoto(chatId, LOGO_URL, {
    caption,
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [t(session, 'login')],
        [t(session, 'nationalId')],
        ['🌐 العربية', '🌐 English']
      ],
      resize_keyboard: true
    }
  });
}

// =========================
// 🎛️ UI: MAIN MENU
// =========================
async function showMainMenu(chatId, session) {
  const user = await getUserInfo(session.token);

  return bot.sendMessage(chatId,
`📡 *ALFATEH ISP*

👤 ${user.fullName}
💰 ${user.balance}
`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          ['💰 الرصيد', '📄 الفواتير'],
          ['📶 الاشتراكات', '📡 حالة الاتصال'],
          ['🔄 تمديد الاشتراك', '📦 شحن باقة'],
          ['📊 استهلاك الباقة'],
          ['☎️ الدعم الفني', '💳 طرق الدفع']
        ],
        resize_keyboard: true
      }
    }
  );
}

// =========================
// 🌐 WEBHOOK
// =========================
app.post(`/webhook/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (_, res) => res.send('Bot running ✅'));

// =========================
// 📩 MESSAGE HANDLER
// =========================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: null, lang: 'ar' });
  }

  const session = sessions.get(chatId);

  // =========================
  // 🚀 START
  // =========================
  if (text === '/start') {
    return showWelcome(chatId, session);
  }

  // =========================
  // 🌐 LANGUAGE SWITCH
  // =========================
  if (text === '🌐 العربية') {
    session.lang = 'ar';
    return session.token
      ? showMainMenu(chatId, session)
      : showWelcome(chatId, session);
  }

  if (text === '🌐 English') {
    session.lang = 'en';
    return session.token
      ? showMainMenu(chatId, session)
      : showWelcome(chatId, session);
  }

  // =========================
  // 🔐 LOGIN FLOW
  // =========================
  if (text === t(session, 'login')) {
    session.step = 'username';
    return bot.sendMessage(chatId, '👤 Username:');
  }

  if (session.step === 'username') {
    session.username = text;
    session.step = 'password';
    return bot.sendMessage(chatId, '🔑 Password:');
  }

  if (session.step === 'password') {
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, {
        username: session.username,
        password: text,
        deviceId: chatId.toString()
      });

      session.token = res.data.accessToken;
      session.step = null;

      await bot.sendMessage(chatId, '✅ Login successful');
      return showMainMenu(chatId, session);

    } catch {
      return bot.sendMessage(chatId, '❌ Login failed');
    }
  }

  // =========================
  // 🔒 PROTECTION
  // =========================
  if (!session.token) {
    return bot.sendMessage(chatId, '⚠️ Please login first');
  }

  // =========================
  // 📊 USAGE
  // =========================
  if (text === '📊 استهلاك الباقة') {
    if (!session.selectedSubscriptionId) {
      return bot.sendMessage(chatId, '❌ اختر اشتراك أولاً');
    }

    try {
      const res = await axios.get(`${API_URL}/api/customers/me/subscriptions`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });

      const sub = res.data.find(s => s.subscriptionId == session.selectedSubscriptionId);

      if (!sub) return bot.sendMessage(chatId, '❌ غير موجود');

      const usage = calculateUsage(sub);

      return bot.sendMessage(chatId,
`📊 Usage

⬇️ ${usage.usedGB} GB
📦 ${usage.totalGB} GB
🔋 ${usage.remainingGB} GB
📉 ${usage.percent}%`);

    } catch {
      return bot.sendMessage(chatId, '❌ Error');
    }
  }

});

// =========================
// 🌐 SERVER
// =========================
app.listen(PORT, async () => {
  console.log(`🚀 Running on ${PORT}`);

  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook/${TOKEN}`;

  try {
    await bot.setWebHook(webhookUrl);
    console.log(`✅ Webhook set`);
  } catch (e) {
    console.error(e.message);
  }
});

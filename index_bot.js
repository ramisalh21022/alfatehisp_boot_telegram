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

const bot = new TelegramBot(TOKEN, { polling: false });
const app = express();
const LOGO_URL = https://raw.githubusercontent.com/ramisalh21022/alfatehisp_boot_telegram/main/alfateh.png';

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
// 🎛️ MAIN MENU
// =========================
async function showMainMenu(chatId, session) {
  const user = await getUserInfo(session.token);

 await bot.sendPhoto(chatId,
  'https://raw.githubusercontent.com/ramisalh21022/alfatehisp_boot_telegram/main/alfateh.png',
  {
    caption: `
╔══════════════════════╗
   🌐 *ALFATEH ISP*
╚══════════════════════╝

👋 أهلاً بك في مزود الفتح

📍 العنوان:
دمشق - سوريا

🏪 نقاط البيع:
• مركز المدينة
• المزة

📞 التواصل:
099999999
098888888
`,
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        ['🔐 تسجيل الدخول'],
        ['🆔 طلب الرقم الوطني'],
        ['🌐 العربية', '🌐 English']
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
  // 🚀 START (V2)
  // =========================
  if (text === '/start') {
    return bot.sendPhoto(chatId, LOGO_URL, {
      caption: `
╔══════════════════════╗
   🌐 *ALFATEH ISP*
╚══════════════════════╝

${t(session, 'welcome')}

${t(session, 'address')}:
دمشق - سوريا

${t(session, 'pos')}:
• مركز المدينة
• المزة

${t(session, 'contact')}:
📞 099999999
📞 098888888
`,
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
  // 🌐 LANGUAGE
  // =========================
  if (text === '🌐 العربية') {
    session.lang = 'ar';
    return bot.sendMessage(chatId, '✅ تم التبديل للعربية');
  }

  if (text === '🌐 English') {
    session.lang = 'en';
    return bot.sendMessage(chatId, '✅ Switched to English');
  }

  // =========================
  // 🔐 LOGIN
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
  // 🆔 NATIONAL ID
  // =========================
  if (text === t(session, 'nationalId')) {
    session.step = 'national_id';
    return bot.sendMessage(chatId, '🆔 أدخل الرقم الوطني:');
  }

  if (session.step === 'national_id') {
    session.step = null;
    return bot.sendMessage(chatId, '📩 تم إرسال البيانات');
  }

  // =========================
  // 🔒 AUTH GUARD
  // =========================
  if (!session.token) {
    return bot.sendMessage(chatId, '⚠️ سجل الدخول أولاً');
  }

  // =========================
  // 💰 BALANCE
  // =========================
  if (text === '💰 الرصيد') {
    const user = await getUserInfo(session.token);

    return bot.sendMessage(chatId,
`👤 ${user.fullName}
💰 ${user.balance}`);
  }

  // =========================
  // 📄 TRANSACTIONS
  // =========================
  if (text === '📄 الفواتير') {
    try {
      const res = await axios.get(
        `${API_URL}/api/customers/me/transactions?page=0&size=5`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      const list = res.data?.content || [];

      let msg = '📄 الفواتير:\n\n';

      list.forEach(tx => {
        msg += `🧾 #${tx.trxNo}\n`;
        msg += `💰 ${tx.amount} ${tx.Currency}\n`;
        msg += `📅 ${new Date(tx.trxDate).toLocaleString()}\n`;
        msg += `━━━━━━━━━━\n`;
      });

      return bot.sendMessage(chatId, msg);

    } catch {
      return bot.sendMessage(chatId, '❌ خطأ');
    }
  }

  // =========================
  // 📶 SUBSCRIPTIONS
  // =========================
  if (text === '📶 الاشتراكات') {
    try {
      const res = await axios.get(
        `${API_URL}/api/customers/me/subscriptions`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      session.subscriptions = res.data;

      if (res.data.length > 0 && !session.selectedSubscriptionId) {
        session.selectedSubscriptionId = res.data[0].subscriptionId;
      }

      let msg = '📶 الاشتراكات:\n\n';

      res.data.forEach(s => {
        msg += `📶 ${s.serviceName}\n👤 ${s.username}\n${s.online ? '🟢' : '🔴'}\n\n`;
      });

      return bot.sendMessage(chatId, msg);

    } catch {
      return bot.sendMessage(chatId, '❌ خطأ');
    }
  }

  // =========================
  // 📊 USAGE
  // =========================
  if (text === '📊 استهلاك الباقة') {
    const subId = session.selectedSubscriptionId;

    if (!subId) return bot.sendMessage(chatId, '❌ اختر اشتراك');

    try {
      const res = await axios.get(
        `${API_URL}/api/customers/me/subscriptions`,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      const s = res.data.find(x => x.subscriptionId == subId);
      const usage = calculateUsage(s);

      return bot.sendMessage(chatId,
`📊 الاستخدام

⬇️ ${usage.usedGB} GB
📦 ${usage.totalGB} GB
🔋 ${usage.remainingGB} GB
📉 ${usage.percent}%`);

    } catch {
      return bot.sendMessage(chatId, '❌ خطأ');
    }
  }

  // =========================
  // 📡 STATUS
  // =========================
  if (text === '📡 حالة الاتصال') {
    const s = session.subscriptions?.[0];
    if (!s) return bot.sendMessage(chatId, '❌ لا يوجد');

    return bot.sendMessage(chatId,
s.online ? '🟢 متصل' : '🔴 غير متصل');
  }

  // =========================
  // 🔄 EXTEND
  // =========================
  if (text === '🔄 تمديد الاشتراك') {
    const s = session.subscriptions?.[0];
    if (!s) return;

    try {
      await axios.put(
        `${API_URL}/api/services/extend-expiry/${s.subscriptionId}`,
        {},
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      return bot.sendMessage(chatId, '✅ تم التمديد');

    } catch {
      return bot.sendMessage(chatId, '❌ فشل');
    }
  }

  // =========================
  // 📦 CHARGE
  // =========================
  if (text === '📦 شحن باقة') {
    const s = session.subscriptions?.[0];
    if (!s) return;

    try {
      await axios.post(
        `${API_URL}/api/services/charge-service-type/${s.subscriptionId}/1`,
        {},
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      return bot.sendMessage(chatId, '✅ تم الشحن');

    } catch {
      return bot.sendMessage(chatId, '❌ فشل');
    }
  }

});

// =========================
// 🚀 SERVER
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

const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const API_URL = process.env.API_URL || 'https://api.alfateh.cloudtech-it.com';
const PORT = process.env.PORT || 5000;

const bot = new TelegramBot(TOKEN, { polling: false });
const app = express();

app.use(bodyParser.json());

// =========================
// 🔥 Sessions
// =========================
const sessions = new Map();

// =========================
// 📊 Helpers
// =========================
const octetsToGB = (octets = 0) => {
  return octets ? octets / 1024 / 1024 / 1024 : 0;
};

const calculateUsage = (subscription) => {
  const downloadGB = octetsToGB(subscription.currentInputOctets);
  const uploadGB = octetsToGB(subscription.currentOutputOctets);

  const usedGB = downloadGB + uploadGB;

  const totalGB =
    octetsToGB(subscription.downloadLimit) +
    octetsToGB(subscription.uploadLimit);

  const remainingGB = totalGB - usedGB;

  const percent = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;

  return {
    usedGB: usedGB.toFixed(2),
    totalGB: totalGB.toFixed(2),
    remainingGB: remainingGB.toFixed(2),
    percent: percent.toFixed(1),
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
// 🎛️ Menu
// =========================
async function showMainMenu(chatId, session) {
  const user = await getUserInfo(session.token);

  const msg = `
📡 *ALFATEH ISP*

👤 ${user.fullName}
💰 الرصيد: ${user.balance}
`;

  return bot.sendMessage(chatId, msg, {
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
  });
}

// =========================
// 🔄 CALLBACK (اختياري)
// =========================
bot.on('callback_query', (q) => {
  const chatId = q.message.chat.id;
  const session = sessions.get(chatId);
  if (!session) return;

  if (q.data.startsWith('select_sub_')) {
    session.selectedSubscriptionId = q.data.split('_')[2];
    bot.sendMessage(chatId, `✅ تم اختيار الاشتراك`);
  }
});

// =========================
// 📩 MESSAGE HANDLER
// =========================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: null });
  }

  const session = sessions.get(chatId);

  // ========= START =========
  if (text === '/start') {
    return bot.sendMessage(chatId, '👋 أهلاً بك\n\n🔐 تسجيل الدخول', {
      reply_markup: {
        keyboard: [[{ text: '🔐 تسجيل الدخول' }]],
        resize_keyboard: true
      }
    });
  }

  // ========= LOGIN =========
  if (text === '🔐 تسجيل الدخول') {
    session.step = 'username';
    return bot.sendMessage(chatId, '👤 اسم المستخدم:');
  }

  if (session.step === 'username') {
    session.username = text;
    session.step = 'password';
    return bot.sendMessage(chatId, '🔑 كلمة المرور:');
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

      await bot.sendMessage(chatId, '✅ تم تسجيل الدخول');
      return showMainMenu(chatId, session);

    } catch {
      return bot.sendMessage(chatId, '❌ فشل تسجيل الدخول');
    }
  }

  if (!session.token) {
    return bot.sendMessage(chatId, '⚠️ سجل الدخول أولاً');
  }

  // ========= BALANCE =========
  if (text === '💰 الرصيد') {
    const user = await getUserInfo(session.token);
    return bot.sendMessage(chatId, `💰 ${user.balance}`);
  }

  // ========= SUBSCRIPTIONS =========
  if (text === '📶 الاشتراكات') {
    try {
      const res = await axios.get(`${API_URL}/api/customers/me/subscriptions`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });

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

  // ========= USAGE =========
  if (text === '📊 استهلاك الباقة') {
    const subId = session.selectedSubscriptionId;

    if (!subId) {
      return bot.sendMessage(chatId, '❌ اختر اشتراك أولاً');
    }

    try {
      const res = await axios.get(`${API_URL}/api/customers/me/subscriptions`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });

      const subscription = res.data.find(s => s.subscriptionId == subId);

      if (!subscription) {
        return bot.sendMessage(chatId, '❌ الاشتراك غير موجود');
      }

      const usage = calculateUsage(subscription);

      return bot.sendMessage(chatId,
`📊 استهلاك الباقة

⬇️ المستخدم: ${usage.usedGB} GB
📦 الكلي: ${usage.totalGB} GB
🔋 المتبقي: ${usage.remainingGB} GB
📉 ${usage.percent}%`);

    } catch {
      return bot.sendMessage(chatId, '❌ خطأ');
    }
  }

  // ========= STATUS =========
  if (text === '📡 حالة الاتصال') {
    const s = session.subscriptions?.[0];

    if (!s) return bot.sendMessage(chatId, '❌ لا يوجد اشتراك');

    return bot.sendMessage(chatId, s.online ? '🟢 متصل' : '🔴 غير متصل');
  }

  // ========= EXTEND =========
  if (text === '🔄 تمديد الاشتراك') {
    const s = session.subscriptions?.[0];
    if (!s) return;

    try {
      await axios.put(`${API_URL}/api/services/extend-expiry/${s.subscriptionId}`, {}, {
        headers: { Authorization: `Bearer ${session.token}` }
      });

      return bot.sendMessage(chatId, '✅ تم التمديد');
    } catch {
      return bot.sendMessage(chatId, '❌ فشل');
    }
  }

  // ========= CHARGE =========
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
// 🌐 SERVER
// =========================
app.post(`/webhook/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Bot running ✅');
});

app.listen(PORT, async () => {
  console.log(`🚀 Running on ${PORT}`);

  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook/${TOKEN}`;

  try {
    await bot.setWebHook(webhookUrl);
    console.log(`✅ Webhook: ${webhookUrl}`);
  } catch (e) {
    console.error(e.message);
  }
});

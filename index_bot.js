const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TOKEN = process.env.TELEGRAM_TOKEN;
const API_URL = process.env.API_URL || 'https://api.alfateh.cloudtech-it.com';
const PORT = process.env.PORT || 5000;
//const webhookUrl = process.env.WEBHOOK_URL;
const bot = new TelegramBot(TOKEN, { polling: false });
const app = express();

app.use(bodyParser.json());



// استقبال التحديثات من Telegram عبر Webhook
app.post(`/webhook/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
// ✅ Route test
app.get('/', (req, res) => {
  res.send('Bot is running ✅');
});

// 🔥 جلسات المستخدمين
const sessions = new Map();
// 🧠دالة جلب بيانات المستخدم
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

  } catch (err) {
    return {
      fullName: 'غير معروف',
      balance: '—'
    };
  }
}
// 🧠 دالة عرض القائمة الرئيسية
async function showMainMenu(chatId, session) {
  const user = await getUserInfo(session.token);

  const header = `
📡 *ALFATEH ISP*

👤 ${user.fullName}
💰 الرصيد: ${user.balance}
`;

  bot.sendMessage(chatId, header + '\n📊 اختر الخدمة:', {
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

// 📩 استقبال الرسائل
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: null });
  }

  const session = sessions.get(chatId);

  // ========= START =========
  if (text === '/start') {
    session.step = 'start';

    return bot.sendMessage(chatId, '👋 أهلاً بك في مزود الفتح\n\nاضغط تسجيل الدخول للمتابعة', {
      reply_markup: {
        keyboard: [[{ text: '🔐 تسجيل الدخول' }]],
        resize_keyboard: true
      }
    });
  }

  // ========= LOGIN =========
  if (text === '🔐 تسجيل الدخول') {
    session.step = 'await_username';
    return bot.sendMessage(chatId, '👤 أدخل اسم المستخدم:');
  }

  if (session.step === 'await_username') {
    session.username = text;
    session.step = 'await_password';
    return bot.sendMessage(chatId, '🔑 أدخل كلمة المرور:');
  }

  if (session.step === 'await_password') {
    session.password = text;

    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, {
        username: session.username,
        password: session.password,
        deviceId: chatId.toString()
      });

      session.token = res.data.accessToken;
      session.step = 'dashboard';

      await bot.sendMessage(chatId, '✅ تم تسجيل الدخول بنجاح');
      return showMainMenu(chatId, session);

    } catch (err) {
      return bot.sendMessage(chatId, '❌ فشل تسجيل الدخول');
    }
  }

  // ========= الحماية =========
  if (!session.token) {
    return bot.sendMessage(chatId, '⚠️ يجب تسجيل الدخول أولاً /start');
  }

  // ========= الأزرار =========

// =========================
  
  // 💰 BALANCE
  // =========================
  if (text === '💰 الرصيد') {
    const user = await getUserInfo(session.token);

    return bot.sendMessage(chatId,
`👤 ${user.fullName}
💰  الرصيد: ${user.balance}`);
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

      if (!list.length) {
        return bot.sendMessage(chatId, '📄 لا يوجد فواتير');
      }

      let msg = '📄 آخر الفواتير:\n\n';

      list.forEach(tx => {
        const date = new Date(tx.trxDate);

        msg += `🧾 #${tx.trxNo}\n`;
        msg += `💰 ${tx.amount} ${tx.Currency}\n`;
        msg += `📅 ${date.toLocaleString()}\n`;
        msg += `----------------\n`;
      });

      return bot.sendMessage(chatId, msg);

    } catch {
      return bot.sendMessage(chatId, '❌ خطأ في جلب الفواتير');
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

      let msg = '📶 الاشتراكات:\n\n';

      res.data.forEach(s => {
        msg += `📶 ${s.serviceName}\n`;
        msg += `👤 ${s.username}\n`;
        msg += `📊 ${s.online ? '🟢' : '🔴'}\n\n`;
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
    const s = session.subscriptions?.[0];

    if (!s) return bot.sendMessage(chatId, '❌ لا يوجد اشتراك');

    const used = toGB(s.currentInputOctets + s.currentOutputOctets);
    const total = toGB(s.downloadLimit + s.uploadLimit);
    const remaining = total - used;

    return bot.sendMessage(chatId,
`📊 الاستخدام

⬇️ ${used} GB
📦 ${total} GB
🔋 ${remaining} GB`);
  }

  // =========================
  // 📡 STATUS
  // =========================
  if (text === '📡 حالة الاتصال') {
    const s = session.subscriptions?.[0];

    if (!s) return bot.sendMessage(chatId, '❌ لا يوجد اشتراك');

    return bot.sendMessage(chatId,
`📡 الحالة

${s.online ? '🟢 متصل' : '🔴 غير متصل'}`);
  }

  // =========================
  // 🔄 EXTEND
  // =========================
  if (text === '🔄 تمديد الاشتراك') {
    const s = session.subscriptions?.[0];

    if (!s) return bot.sendMessage(chatId, '❌ لا يوجد اشتراك');

    try {
      await axios.put(
        `${API_URL}/api/services/extend-expiry/${s.subscriptionId}`,
        {},
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      return bot.sendMessage(chatId, '✅ تم التمديد');

    } catch {
      return bot.sendMessage(chatId, '❌ فشل التمديد');
    }
  }

  // =========================
  // 📦 CHARGE
  // =========================
  if (text === '📦 شحن باقة') {
    const s = session.subscriptions?.[0];

    if (!s) return bot.sendMessage(chatId, '❌ لا يوجد اشتراك');

    try {
      const serviceTypeId = 1; // مثال

      await axios.post(
        `${API_URL}/api/services/charge-service-type/${s.subscriptionId}/${serviceTypeId}`,
        {},
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      return bot.sendMessage(chatId, '✅ تم الشحن');

    } catch {
      return bot.sendMessage(chatId, '❌ فشل الشحن');
    }
  }
  // ☎️ الدعم الفني
  if (text === '☎️ الدعم الفني') {
    return bot.sendMessage(chatId, `
☎️ الدعم الفني:

📞 099999999
📞 098888888

🕐 متاح 24/7
`);
    
  }

  // 💳 طرق الدفع
  if (text === '💳 طرق الدفع') {
    return bot.sendMessage(chatId, `
💳 طرق الدفع:

1. نقاط البيع
2. شام كاش
3. تحويل بنكي
`);
    
  }

});

// تشغيل السيرفر
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook/${TOKEN}`;
  try {
    await bot.setWebHook(webhookUrl);
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  } catch (err) {
    console.error("❌ Error setting webhook:", err.message);
  }
});

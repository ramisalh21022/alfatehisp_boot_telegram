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

  // 💰 الرصيد
 if (text === '💰 الرصيد') {
  try {
    const res = await axios.get(`${API_URL}/api/customers/me/accounts`, {
      headers: {
        Authorization: `Bearer ${session.token}`
      }
    });

    const personalInfo = res.data.personalInfo || {};
    const accounts = res.data.accounts || [];

    const fullName = personalInfo.fullName || 'عميل';
    const balance = accounts.length
      ? `${accounts[0].balance} ${accounts[0].currency}`
      : '—';

    bot.sendMessage(chatId,
`👤 الاسم: ${fullName}
💰 الرصيد: ${balance}`);
  } catch (err) {
    bot.sendMessage(chatId, '⚠️ خطأ في جلب الرصيد');
  }
}
  // 📄 الفواتير
  if (text === '📄 الفواتير') {
    return bot.sendMessage(chatId, '📄 جاري جلب الفواتير...');
    return showMainMenu(chatId, session);
  }

 if (text === '📶 الاشتراكات') {
  try {
    const res = await axios.get(`${API_URL}/api/customers/me/subscriptions`, {
      headers: {
        Authorization: `Bearer ${session.token}`
      }
    });

    let message = '📶 اشتراكاتك:\n\n';

    res.data.forEach(sub => {
      message += `🔹 ${sub.serviceName}\n`;
      message += `📡 الحالة: ${sub.online ? 'متصل' : 'غير متصل'}\n`;
      message += `📅 الانتهاء: ${sub.expiryDate}\n\n`;
    });

    bot.sendMessage(chatId, message);
  } catch {
    bot.sendMessage(chatId, '⚠️ خطأ في جلب الاشتراكات');
  }
}

 if (text === '🔄 تمديد الاشتراك') {
  session.step = 'extend';

  return bot.sendMessage(chatId, '🔢 أدخل رقم الاشتراك:');
}

if (session.step === 'extend') {
  try {
    await axios.post(`${API_URL}/api/extend`, {
      subscriptionId: text
    }, {
      headers: {
        Authorization: `Bearer ${session.token}`
      }
    });

    session.step = null;

    bot.sendMessage(chatId, '✅ تم تمديد الاشتراك بنجاح');
  } catch {
    bot.sendMessage(chatId, '❌ فشل التمديد');
  }
}

if (text === '📦 شحن باقة') {
  session.step = 'charge';

  return bot.sendMessage(chatId, '💳 أدخل كود الشحن:');
}

if (session.step === 'charge') {
  try {
    await axios.post(`${API_URL}/api/recharge`, {
      code: text
    }, {
      headers: {
        Authorization: `Bearer ${session.token}`
      }
    });

    session.step = null;

    bot.sendMessage(chatId, '✅ تم الشحن بنجاح');
  } catch {
    bot.sendMessage(chatId, '❌ كود غير صحيح');
  }
}

  // 📊 استهلاك الباقة
  if (text === '📊 استهلاك الباقة') {
    return bot.sendMessage(chatId, '📊 جاري حساب الاستهلاك...');
    return showMainMenu(chatId, session);
  }

 if (text === '📡 حالة الاتصال') {
  const res = await axios.get(`${API_URL}/api/status`, {
    headers: {
      Authorization: `Bearer ${session.token}`
    }
  });

  bot.sendMessage(chatId, `📡 الحالة: ${res.data.status}`);
}

  // ☎️ الدعم الفني
  if (text === '☎️ الدعم الفني') {
    return bot.sendMessage(chatId, `
☎️ الدعم الفني:

📞 099999999
📞 098888888

🕐 متاح 24/7
`);
    return showMainMenu(chatId, session);
  }

  // 💳 طرق الدفع
  if (text === '💳 طرق الدفع') {
    return bot.sendMessage(chatId, `
💳 طرق الدفع:

1. نقاط البيع
2. شام كاش
3. تحويل بنكي
`);
    return showMainMenu(chatId, session);
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

// =========================
const octetsToGB = (octets = 0) => {
  if (!octets) return 0;
  return octets / 1024 / 1024 / 1024;
};

const percentBar = (percent) => {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  return '█'.repeat(filled) + '░'.repeat(total - filled);
};

// =========================
// 📊 CALCULATE USAGE
// =========================
function calculateUsage(subscription) {
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
    percent: percent.toFixed(1)
  };
}

// =========================
// 🌐 API HELPERS
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
// 🧾 MAIN MENU
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
// 📩 MESSAGE HANDLER
// =========================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!sessions.has(chatId)) {
    sessions.set(chatId, {});
  }

  const session = sessions.get(chatId);

  // =========================
  // START
  // =========================
  if (text === '/start') {
    session.step = null;

    return bot.sendMessage(chatId, '👋 أهلاً بك', {
      reply_markup: {
        keyboard: [['🔐 تسجيل الدخول']],
        resize_keyboard: true
      }
    });
  }

  // =========================
  // LOGIN FLOW
  // =========================
  if (text === '🔐 تسجيل الدخول') {
    session.step = 'username';
    return bot.sendMessage(chatId, '👤 أدخل اسم المستخدم:');
  }

  if (session.step === 'username') {
    session.username = text;
    session.step = 'password';
    return bot.sendMessage(chatId, '🔑 أدخل كلمة المرور:');
  }

  if (session.step === 'password') {
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, {
        username: session.username,
        password: text,
        deviceId: chatId.toString()
      });

      session.token = res.data.accessToken;
      session.step = 'logged';

      await bot.sendMessage(chatId, '✅ تم تسجيل الدخول');
      return showMainMenu(chatId, session);

    } catch {
      return bot.sendMessage(chatId, '❌ فشل تسجيل الدخول');
    }
  }

  // =========================
  // PROTECTION
  // =========================
  if (!session.token) {
    return bot.sendMessage(chatId, '⚠️ سجل دخول أولاً /start');
  }

  // =========================
  // BALANCE
  // =========================
  if (text === '💰 الرصيد') {
    const user = await getUserInfo(session.token);

    return bot.sendMessage(chatId,
`👤 ${user.fullName}
💰 ${user.balance}`);
  }

  // =========================
  // SUBSCRIPTIONS
  // =========================
  if (text === '📶 الاشتراكات') {
    const res = await axios.get(
      `${API_URL}/api/customers/me/subscriptions`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );

    session.subscriptions = res.data;

    // اختيار تلقائي
    if (!session.selectedSubscriptionId && res.data.length > 0) {
      session.selectedSubscriptionId = res.data[0].subscriptionId;
    }

    let msg = '📶 الاشتراكات:\n\n';

    res.data.forEach(s => {
      msg += `📶 ${s.serviceName}\n`;
      msg += `👤 ${s.username}\n`;
      msg += `📊 ${s.online ? '🟢' : '🔴'}\n\n`;
    });

    return bot.sendMessage(chatId, msg);
  }

  // =========================
  // USAGE
  // =========================
  if (text === '📊 استهلاك الباقة') {
    const subId = session.selectedSubscriptionId;

    if (!subId) {
      return bot.sendMessage(chatId, '❌ اختر اشتراك أولاً');
    }

    const res = await axios.get(
      `${API_URL}/api/customers/me/subscriptions`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );

    const sub = res.data.find(s => s.subscriptionId == subId);

    if (!sub) return bot.sendMessage(chatId, '❌ اشتراك غير موجود');

    const usage = calculateUsage(sub);

    return bot.sendMessage(chatId,
`📊 استهلاك الباقة

⬇️ ${usage.usedGB} GB
📦 ${usage.totalGB} GB
🔋 ${usage.remainingGB} GB
📉 ${percentBar(usage.percent)} ${usage.percent}%`);
  }

  // =========================
  // STATUS
  // =========================
  if (text === '📡 حالة الاتصال') {
    const subId = session.selectedSubscriptionId;

    if (!subId) return bot.sendMessage(chatId, '❌ اختر اشتراك');

    return bot.sendMessage(chatId, `📡 ${subId}`);
  }

  // =========================
  // EXTEND
  // =========================
  if (text === '🔄 تمديد الاشتراك') {
    const subId = session.selectedSubscriptionId;

    if (!subId) return bot.sendMessage(chatId, '❌ اختر اشتراك');

    await axios.put(
      `${API_URL}/api/services/extend-expiry/${subId}`,
      {},
      { headers: { Authorization: `Bearer ${session.token}` } }
    );

    return bot.sendMessage(chatId, '✅ تم التمديد');
  }

  // =========================
  // CHARGE
  // =========================
  if (text === '📦 شحن باقة') {
    const subId = session.selectedSubscriptionId;

    if (!subId) return bot.sendMessage(chatId, '❌ اختر اشتراك');

    const serviceTypeId = 1;

    await axios.post(
      `${API_URL}/api/services/charge-service-type/${subId}/${serviceTypeId}`,
      {},
      { headers: { Authorization: `Bearer ${session.token}` } }
    );

    return bot.sendMessage(chatId, '✅ تم الشحن');
  }

  // =========================
  // SUPPORT
  // =========================
  if (text === '☎️ الدعم الفني') {
    return bot.sendMessage(chatId, '📞 099999999');
  }

  // =========================
  // PAY
  // =========================
  if (text === '💳 طرق الدفع') {
    return bot.sendMessage(chatId, '💳 شام كاش / تحويل / نقاط بيع');
  }
});

// =========================
// 🌐 WEBHOOK
// =========================
app.post(`/webhook/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

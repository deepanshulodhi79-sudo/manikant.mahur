// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

// 🔑 Hardcoded login
const HARD_USERNAME = "!@#$%^&*())(*&^%$#@!@#$%^&*";
const HARD_PASSWORD = "!@#$%^&*())(*&^%$#@!@#$%^&*";

// ================= GLOBAL STATE =================
let mailLimits = {};
let launcherLocked = false;
const sessionStore = new session.MemoryStore();

// ================= CONTENT ROTATION =================
const subjects = [
  "Quick question",
  "Just checking",
  "A small note",
  "One thing to ask",
  "Hello"
];

const greetings = [
  "Hi",
  "Hello",
  "Hey"
];

// ================= MIDDLEWARE =================
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'bulk-mailer-secret',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: { maxAge: 60 * 60 * 1000 }
}));

// ================= HELPERS =================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 180000, max = 420000) { // 3–7 min
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ================= AUTH =================
function requireAuth(req, res, next) {
  if (launcherLocked) return res.redirect('/');
  if (req.session.user) return next();
  return res.redirect('/');
}

// ================= ROUTES =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    return res.json({ success: true });
  }
  return res.json({ success: false });
});

app.get('/launcher', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// ================= SEND MAIL =================
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, message } = req.body;

    if (!email || !password || !recipients || !message) {
      return res.json({ success: false, message: "Missing fields" });
    }

    const now = Date.now();

    // VERY LOW SAFE LIMIT (per Gmail ID)
    if (!mailLimits[email] || now - mailLimits[email].start > 24 * 60 * 60 * 1000) {
      mailLimits[email] = { count: 0, start: now };
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(Boolean);

    if (mailLimits[email].count + recipientList.length > 8) {
      return res.json({
        success: false,
        message: "Daily safe limit reached (8 emails)"
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: email, pass: password }
    });

    // Neutral professional footer
    const footer = "\n\n—\nRegards,\n" + (senderName || "Support");

    // Instant response (UI stuck nahi hoga)
    res.json({
      success: true,
      message: `⏳ Sending started (${recipientList.length})`
    });

    // ONE BY ONE sending (human-like)
    for (const r of recipientList) {
      const subject = subjects[Math.floor(Math.random() * subjects.length)];
      const greeting = greetings[Math.floor(Math.random() * greetings.length)];
      const msgId = `<${crypto.randomUUID()}@gmail.com>`;

      await transporter.sendMail({
        from: `"${senderName || 'Support'}" <${email}>`,
        to: r,
        subject,
        text: `${greeting},\n\n${message}${footer}`,
        headers: {
          "Message-ID": msgId,
          "Reply-To": email
        }
      });

      mailLimits[email].count++;
      await delay(randomDelay());
    }

  } catch (err) {
    console.error(err);
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 Gmail Mailer running on port ${PORT}`);
});

// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// 🔑 Hardcoded login
const HARD_USERNAME = "!@#$%^&*())(*&^%$#@!@#$%^&*";
const HARD_PASSWORD = "!@#$%^&*())(*&^%$#@!@#$%^&*";

// ================= GLOBAL STATE =================
let mailLimits = {}; // { email: { count, day, lastSentAt } }
const sessionStore = new session.MemoryStore();

// ================= MIDDLEWARE =================
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'gmail-safe-mailer',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: { maxAge: 60 * 60 * 1000 }
}));

// ================= AUTH =================
function requireAuth(req, res, next) {
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
  return res.json({ success: false, message: "Invalid credentials" });
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

// ================= SEND MAIL (GMAIL SAFE MODE) =================
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients || !message) {
      return res.json({ success: false, message: "Missing fields" });
    }

    // ❗ Allow ONLY ONE recipient
    const list = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(Boolean);

    if (list.length !== 1) {
      return res.json({
        success: false,
        message: "Gmail safe mode: send to ONLY ONE recipient at a time"
      });
    }

    const recipient = list[0];
    const today = new Date().toDateString();
    const now = Date.now();

    if (!mailLimits[email] || mailLimits[email].day !== today) {
      mailLimits[email] = { count: 0, day: today, lastSentAt: 0 };
    }

    // ❗ Daily hard limit = 2
    if (mailLimits[email].count >= 2) {
      return res.json({
        success: false,
        message: "Daily safe limit reached (2 emails/day per Gmail)"
      });
    }

    // ❗ Enforce 30 minutes gap
    if (now - mailLimits[email].lastSentAt < 30 * 60 * 1000) {
      return res.json({
        success: false,
        message: "Please wait at least 30 minutes before next email"
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: email, pass: password }
    });

    // Simple, personal-style footer
    const footer = `\n\n—\n${senderName || "Regards"}`;

    // Instant UI response
    res.json({
      success: true,
      message: "Email queued and sending now"
    });

    await transporter.sendMail({
      from: `"${senderName || 'Me'}" <${email}>`,
      to: recipient,
      subject: subject || "Quick question",
      text: `${message}${footer}`,
      headers: {
        "Reply-To": email
      }
    });

    mailLimits[email].count += 1;
    mailLimits[email].lastSentAt = Date.now();

  } catch (err) {
    console.error(err);
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 Gmail Safe Mailer running on port ${PORT}`);
});

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
let mailLimits = {};
let launcherLocked = false;
let unsubscribed = new Set();

const sessionStore = new session.MemoryStore();

// ================= CONTENT ROTATION =================
const subjects = [
  "Quick question",
  "Just checking in",
  "Regarding your interest",
  "One small update",
  "Thought this might help"
];

const greetings = [
  "Hi",
  "Hello",
  "Hey",
  "Greetings"
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

function randomDelay(min = 60000, max = 180000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ================= FULL RESET =================
function fullServerReset() {
  console.log("🔁 FULL RESET");
  launcherLocked = true;
  mailLimits = {};
  sessionStore.clear(() => console.log("🧹 Sessions cleared"));

  setTimeout(() => {
    launcherLocked = false;
    console.log("✅ Launcher unlocked");
  }, 2000);
}

// ================= AUTH =================
function requireAuth(req, res, next) {
  if (launcherLocked) return res.redirect('/');
  if (req.session.user) return next();
  return res.redirect('/');
}

// ================= ROUTES =================

// Login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (launcherLocked) {
    return res.json({ success: false, message: "Server reset in progress" });
  }

  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    setTimeout(fullServerReset, 60 * 60 * 1000);
    return res.json({ success: true });
  }

  return res.json({ success: false, message: "Invalid credentials" });
});

// Launcher
app.get('/launcher', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// ================= UNSUBSCRIBE =================
app.post('/unsubscribe', (req, res) => {
  const { email } = req.body;
  if (email) unsubscribed.add(email);
  res.json({ success: true });
});

// ================= SEND MAIL =================
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, message } = req.body;
    if (!email || !password || !recipients) {
      return res.json({ success: false, message: "Missing fields" });
    }

    const now = Date.now();
    if (!mailLimits[email] || now - mailLimits[email].startTime > 60 * 60 * 1000) {
      mailLimits[email] = { count: 0, startTime: now };
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(r => r && !unsubscribed.has(r));

    // SAFE LIMIT
    if (mailLimits[email].count + recipientList.length > 10) {
      return res.json({
        success: false,
        message: `Hourly limit reached (${mailLimits[email].count}/10)`
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: email, pass: password }
    });

    const footer = `
--
You are receiving this email because you opted in.
To unsubscribe reply STOP.
`;

    for (const r of recipientList) {
      const greeting = greetings[Math.floor(Math.random() * greetings.length)];
      const subjectLine = subjects[Math.floor(Math.random() * subjects.length)];

      await transporter.sendMail({
        from: `"${senderName || 'Support'}" <${email}>`,
        to: r,
        subject: subjectLine,
        text: `${greeting},\n\n${message}\n\n${footer}`,
        html: `
          <p>${greeting},</p>
          <p>${message}</p>
          <hr/>
          <small>${footer}</small>
        `
      });

      mailLimits[email].count++;
      await delay(randomDelay());
    }

    res.json({
      success: true,
      message: `Emails sent: ${mailLimits[email].count}/10`
    });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 Mail Launcher running on port ${PORT}`);
});

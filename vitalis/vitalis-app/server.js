'use strict';
require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const store = require('./lib/store');
const hospitals = require('./lib/hospitals');
const triage = require('./lib/triage');
const firstAid = require('./lib/firstaid');
const mailer = require('./lib/mailer');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const DEMO_RESET = process.env.DEMO_RESET === 'true' && !mailer.configured;
const COOKIE = 'vt_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (IS_PROD) {
    console.error('JWT_SECRET is not set. Add it in your Render environment variables, then redeploy.');
    process.exit(1);
  }
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('JWT_SECRET not set. Using a temporary secret; everyone is signed out when the server restarts.');
}

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", 'https://accounts.google.com/gsi/client'],
        'style-src': ["'self'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https://*.googleusercontent.com'],
        'connect-src': ["'self'", 'https://accounts.google.com/gsi/'],
        'frame-src': ["'self'", 'https://accounts.google.com/gsi/'],
        'upgrade-insecure-requests': IS_PROD ? [] : null,
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait 15 minutes and try again.' },
});
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

/* ---------- helpers ---------- */

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, provider: u.googleId ? 'google' : 'password' });

function startSession(res, user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: SESSION_MS,
    path: '/',
  });
}

function currentUser(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, JWT_SECRET);
    return store.findById(sub);
  } catch {
    return null;
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true; // safe to show to the user
  return err;
}

function cleanPassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw fail(400, 'Use a password with at least 8 characters.');
  if (p.length > 128) throw fail(400, 'Use a password under 128 characters.');
  return p;
}

/* ---------- public data ---------- */

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || null });
});

app.get('/api/stats', (req, res) => res.json(hospitals.stats()));

app.get('/api/hospitals', (req, res) => {
  const lat = req.query.lat !== undefined ? parseFloat(req.query.lat) : NaN;
  const lng = req.query.lng !== undefined ? parseFloat(req.query.lng) : NaN;
  if (req.query.lat !== undefined || req.query.lng !== undefined) {
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) {
      return res.status(400).json({ error: 'Location is not valid.' });
    }
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  res.json(
    hospitals.search({
      q: String(req.query.q || '').slice(0, 80),
      district: String(req.query.district || '').slice(0, 80),
      lat,
      lng,
      limit,
      offset,
    })
  );
});

app.get('/api/triage/symptoms', (req, res) => res.json(triage.catalog()));
app.post('/api/triage', (req, res, next) => {
  try {
    res.json(triage.assess({ symptoms: req.body && req.body.symptoms, age: req.body && req.body.age }));
  } catch (err) {
    next(err);
  }
});

app.get('/api/firstaid', (req, res) => res.json(firstAid));

/* ---------- auth ---------- */

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  res.json({ user: u ? publicUser(u) : null });
});

app.post(
  '/api/auth/register',
  wrap(async (req, res) => {
    const name = String((req.body && req.body.name) || '').trim();
    const email = store.normEmail(req.body && req.body.email);
    const password = cleanPassword(req.body && req.body.password);
    if (!name || name.length > 80) throw fail(400, 'Enter your name (up to 80 characters).');
    if (!EMAIL_RE.test(email)) throw fail(400, 'Enter a valid email address.');
    if (store.findByEmail(email)) throw fail(409, 'An account with this email already exists. Sign in instead.');

    const user = await store.create({
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      googleId: null,
      createdAt: new Date().toISOString(),
    });
    startSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  })
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const email = store.normEmail(req.body && req.body.email);
    const password = String((req.body && req.body.password) || '');
    const user = store.findByEmail(email);
    const ok = await bcrypt.compare(password, (user && user.passwordHash) || DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) {
      if (user && !user.passwordHash) throw fail(401, 'This account uses Google sign-in. Use the Google button.');
      throw fail(401, 'Email or password is incorrect.');
    }
    startSession(res, user);
    res.json({ user: publicUser(user) });
  })
);

app.post(
  '/api/auth/google',
  wrap(async (req, res) => {
    if (!googleClient) throw fail(503, 'Google sign-in is not set up on this server.');
    const credential = req.body && req.body.credential;
    if (typeof credential !== 'string') throw fail(400, 'Google sign-in failed. Try again.');

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      throw fail(401, 'Google sign-in failed. Try again.');
    }
    if (!payload || !payload.email || !payload.email_verified) throw fail(401, 'Your Google email is not verified.');

    const email = store.normEmail(payload.email);
    let user = store.findByGoogleId(payload.sub) || store.findByEmail(email);
    if (user) {
      if (!user.googleId) {
        user.googleId = payload.sub;
        await store.persist();
      }
    } else {
      user = await store.create({
        id: crypto.randomUUID(),
        name: String(payload.name || email.split('@')[0]).slice(0, 80),
        email,
        passwordHash: null,
        googleId: payload.sub,
        createdAt: new Date().toISOString(),
      });
    }
    startSession(res, user);
    res.json({ user: publicUser(user) });
  })
);

app.post(
  '/api/auth/forgot',
  wrap(async (req, res) => {
    const email = store.normEmail(req.body && req.body.email);
    if (!EMAIL_RE.test(email)) throw fail(400, 'Enter a valid email address.');

    const reply = { ok: true, message: 'If an account exists for this email, a reset link is on its way.' };
    const user = store.findByEmail(email);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = sha256(token); // only the hash is stored
      user.resetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
      await store.persist();

      const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const link = `${base}/?reset=${token}`;
      try {
        const sent = await mailer.sendReset(user.email, link);
        if (!sent) console.log(`[reset link for ${user.email}] ${link}`);
      } catch (err) {
        console.error('Reset email failed:', err.message);
      }
      if (DEMO_RESET) reply.demoLink = link;
    }
    res.json(reply);
  })
);

app.post(
  '/api/auth/reset',
  wrap(async (req, res) => {
    const token = String((req.body && req.body.token) || '');
    const password = cleanPassword(req.body && req.body.password);
    const user = token ? store.findByResetHash(sha256(token)) : null;
    if (!user || !user.resetExpires || user.resetExpires < Date.now()) {
      throw fail(400, 'This reset link has expired or was already used. Ask for a new one.');
    }
    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetTokenHash = null;
    user.resetExpires = null;
    await store.persist();
    startSession(res, user);
    res.json({ user: publicUser(user) });
  })
);

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

/* ---------- static app ---------- */

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '1h' : 0 }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500 && !err.expose) console.error(err);
  const show = status < 500 || err.expose;
  res.status(status).json({ error: show ? err.message : 'Something went wrong on our side. Try again.' });
});

app.listen(PORT, () => console.log(`Vitalis running on port ${PORT}`));

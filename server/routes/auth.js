import { Router } from 'express';
import {
  clearSession,
  clearSessionCookie,
  createSession,
  hashPassword,
  publicUser,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import { cleanText, getCompanyName, isValidEmail, validISODate } from '../util.js';

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const signups = new Map();
const MAX_SIGNUPS = 5;

function isRateLimited(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function isSignupLimited(key) {
  const entry = signups.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    signups.delete(key);
    return false;
  }
  return entry.count >= MAX_SIGNUPS;
}

function recordSignup(key) {
  const entry = signups.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    signups.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function authRoutes(db) {
  const router = Router();

  router.post('/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const key = `${req.ip}:${email}`;
    if (isRateLimited(key)) {
      return res.status(429).json({ error: 'Too many sign-in attempts. Please try again in a few minutes.' });
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'Enter your email address and password.' });
    }
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      recordFailure(key);
      return res.status(401).json({ error: 'The email or password is incorrect.' });
    }
    if (row.pending) {
      return res.status(403).json({
        error: 'Your account is waiting for an administrator to approve it. Try again once you have been approved.',
      });
    }
    if (!row.active) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact your administrator.' });
    }
    attempts.delete(key);
    const session = createSession(db, row.id);
    setSessionCookie(res, session.token, session.expires);
    res.json({ user: publicUser(row), companyName: getCompanyName(db) });
  });

  router.post('/register', (req, res) => {
    const key = req.ip;
    if (isSignupLimited(key)) {
      return res.status(429).json({ error: 'Too many sign-up requests. Please try again in a few minutes.' });
    }
    recordSignup(key);

    const name = cleanText(req.body?.name, 80);
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const department = cleanText(req.body?.department, 60);
    const startDate = String(req.body?.startDate ?? '');
    const password = String(req.body?.password ?? '');

    if (!name || name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid work email address.' });
    if (!validISODate(startDate)) return res.status(400).json({ error: 'Enter a valid employment start date.' });
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Choose a password between 8 and 128 characters.' });
    }

    try {
      db.prepare(
        `INSERT INTO users (name, email, password_hash, role, department, start_date, active, pending)
         VALUES (?, ?, ?, 'employee', ?, ?, 0, 1)`,
      ).run(name, email, hashPassword(password), department, startDate);
      res.status(201).json({
        message: 'Account created. An administrator will review and activate it before you can sign in.',
      });
    } catch (error) {
      if (/UNIQUE constraint failed: users.email/.test(error.message)) {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw error;
    }
  });

  router.post('/logout', (req, res) => {
    clearSession(db, req.sessionToken);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user, companyName: getCompanyName(db) });
  });

  return router;
}

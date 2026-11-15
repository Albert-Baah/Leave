import { Router } from 'express';
import { hashPassword, requireRole } from '../auth.js';
import { ensureCurrentYearEntitlements, getBalances, runAccrual } from '../accrual.js';
import { statutoryHolidays } from '../holidays.js';
import { parseISO, roundHalf } from '../leaveLogic.js';
import {
  cleanText,
  isValidEmail,
  mapUser,
  parseYear,
  toCsv,
  validISODate,
} from '../util.js';

const ROLES = ['employee', 'manager', 'admin'];
const COUNT_MODES = ['working', 'calendar'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function makeCode(db, name) {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20) || 'LEAVE';
  let code = base;
  let suffix = 2;
  while (db.prepare('SELECT 1 FROM leave_types WHERE code = ?').get(code)) {
    code = `${base}_${suffix}`;
    suffix += 1;
  }
  return code;
}

function typeRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    daysPerYear: row.days_per_year,
    countMode: row.count_mode,
    paid: Boolean(row.paid),
    carryoverCap: row.carryover_cap,
    color: row.color,
    description: row.description,
    sortOrder: row.sort_order,
    active: Boolean(row.active),
  };
}

export function adminRoutes(db) {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/users', (req, res) => {
    const rows = db
      .prepare(
        `SELECT u.*, m.name AS manager_name FROM users u
         LEFT JOIN users m ON m.id = u.manager_id
         ORDER BY u.pending DESC, u.active DESC, u.name COLLATE NOCASE`,
      )
      .all();
    res.json({ users: rows.map(mapUser) });
  });

  router.post('/users', (req, res) => {
    const name = cleanText(req.body?.name, 80);
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const role = String(req.body?.role ?? 'employee');
    const department = cleanText(req.body?.department, 60);
    const managerId = req.body?.managerId ? Number(req.body.managerId) : null;
    const startDate = String(req.body?.startDate ?? '');
    const password = String(req.body?.password ?? '');

    if (!name || name.length < 2) return res.status(400).json({ error: 'Enter the employee’s full name.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Choose a valid role.' });
    if (!validISODate(startDate)) return res.status(400).json({ error: 'Enter a valid start date.' });
    if (password.length < 8) return res.status(400).json({ error: 'The temporary password must be at least 8 characters.' });
    if (managerId != null) {
      const manager = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(managerId);
      if (!manager) return res.status(400).json({ error: 'Choose a valid line manager.' });
    }

    try {
      const result = db
        .prepare(
          `INSERT INTO users (name, email, password_hash, role, department, manager_id, start_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(name, email, hashPassword(password), role, department, managerId, startDate);
      ensureCurrentYearEntitlements(db);
      const user = db
        .prepare(
          `SELECT u.*, m.name AS manager_name FROM users u
           LEFT JOIN users m ON m.id = u.manager_id WHERE u.id = ?`,
        )
        .get(Number(result.lastInsertRowid));
      res.status(201).json({ user: mapUser(user) });
    } catch (error) {
      if (/UNIQUE constraint failed: users.email/.test(error.message)) {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw error;
    }
  });

  router.patch('/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'Employee not found.' });

    const updates = {};
    if (req.body?.name != null) {
      const name = cleanText(req.body.name, 80);
      if (!name || name.length < 2) return res.status(400).json({ error: 'Enter the employee’s full name.' });
      updates.name = name;
    }
    if (req.body?.email != null) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      updates.email = email;
    }
    if (req.body?.role != null) {
      if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'Choose a valid role.' });
      updates.role = req.body.role;
    }
    if (req.body?.department != null) updates.department = cleanText(req.body.department, 60);
    if (req.body?.startDate != null) {
      if (!validISODate(req.body.startDate)) return res.status(400).json({ error: 'Enter a valid start date.' });
      updates.start_date = req.body.startDate;
    }
    if (req.body?.managerId !== undefined) {
      const managerId = req.body.managerId ? Number(req.body.managerId) : null;
      if (managerId != null) {
        if (managerId === id) return res.status(400).json({ error: 'An employee cannot be their own manager.' });
        const manager = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(managerId);
        if (!manager) return res.status(400).json({ error: 'Choose a valid line manager.' });
      }
      updates.manager_id = managerId;
    }
    if (req.body?.active != null) {
      updates.active = req.body.active ? 1 : 0;
      updates.pending = 0;
    }

    const nextRole = updates.role ?? target.role;
    const nextActive = updates.active ?? target.active;
    if (target.id === req.user.id) {
      if (nextRole !== 'admin' || !nextActive) {
        return res.status(400).json({ error: 'You cannot remove your own administrator access.' });
      }
      if (updates.manager_id === target.id) {
        return res.status(400).json({ error: 'An employee cannot be their own manager.' });
      }
    }
    if (target.role === 'admin' && target.active && (nextRole !== 'admin' || !nextActive)) {
      const otherAdmins = db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?")
        .get(id).n;
      if (otherAdmins === 0) {
        return res.status(400).json({ error: 'At least one active administrator is required.' });
      }
    }

    const keys = Object.keys(updates);
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update.' });
    try {
      db.prepare(`UPDATE users SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(
        ...keys.map((key) => updates[key]),
        id,
      );
    } catch (error) {
      if (/UNIQUE constraint failed: users.email/.test(error.message)) {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw error;
    }
    if (updates.active === 1) ensureCurrentYearEntitlements(db);
    if (nextActive === 0) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    const user = db
      .prepare(
        `SELECT u.*, m.name AS manager_name FROM users u
         LEFT JOIN users m ON m.id = u.manager_id WHERE u.id = ?`,
      )
      .get(id);
    res.json({ user: mapUser(user) });
  });

  router.post('/users/:id/password', (req, res) => {
    const id = Number(req.params.id);
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Employee not found.' });
    const password = String(req.body?.password ?? '');
    if (password.length < 8) return res.status(400).json({ error: 'The password must be at least 8 characters.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    res.json({ ok: true });
  });

  router.get('/leave-types', (req, res) => {
    const rows = db.prepare('SELECT * FROM leave_types ORDER BY sort_order, id').all();
    res.json({ leaveTypes: rows.map(typeRow) });
  });

  router.post('/leave-types', (req, res) => {
    const name = cleanText(req.body?.name, 60);
    const countMode = String(req.body?.countMode ?? 'working');
    const daysPerYear =
      req.body?.daysPerYear === null || req.body?.daysPerYear === '' || req.body?.daysPerYear === undefined
        ? null
        : Number(req.body.daysPerYear);
    const paid = req.body?.paid === false ? 0 : 1;
    const carryoverCap = Number(req.body?.carryoverCap ?? 0);
    const color = String(req.body?.color ?? '#177245');
    const description = cleanText(req.body?.description, 300);

    if (!name || name.length < 2) return res.status(400).json({ error: 'Enter a name for the leave type.' });
    if (!COUNT_MODES.includes(countMode)) return res.status(400).json({ error: 'Choose a valid day-counting mode.' });
    if (daysPerYear != null && (!Number.isFinite(daysPerYear) || daysPerYear < 0 || daysPerYear > 365)) {
      return res.status(400).json({ error: 'Days per year must be between 0 and 365, or blank for unlimited.' });
    }
    if (!Number.isFinite(carryoverCap) || carryoverCap < 0 || carryoverCap > 60) {
      return res.status(400).json({ error: 'Carry-over cap must be between 0 and 60 days.' });
    }
    if (!COLOR_RE.test(color)) return res.status(400).json({ error: 'Choose a valid colour.' });

    const nextOrder =
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM leave_types').get().n;
    const result = db
      .prepare(
        `INSERT INTO leave_types
          (code, name, days_per_year, count_mode, paid, carryover_cap, color, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        makeCode(db, name),
        name,
        daysPerYear == null ? null : roundHalf(daysPerYear),
        countMode,
        paid,
        roundHalf(carryoverCap),
        color,
        description,
        nextOrder,
      );
    const type = db.prepare('SELECT * FROM leave_types WHERE id = ?').get(Number(result.lastInsertRowid));
    res.status(201).json({ leaveType: typeRow(type) });
  });

  router.patch('/leave-types/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM leave_types WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Leave type not found.' });

    const updates = {};
    if (req.body?.name != null) {
      const name = cleanText(req.body.name, 60);
      if (!name || name.length < 2) return res.status(400).json({ error: 'Enter a name for the leave type.' });
      updates.name = name;
    }
    if (req.body?.daysPerYear !== undefined) {
      const value =
        req.body.daysPerYear === null || req.body.daysPerYear === ''
          ? null
          : Number(req.body.daysPerYear);
      if (value != null && (!Number.isFinite(value) || value < 0 || value > 365)) {
        return res.status(400).json({ error: 'Days per year must be between 0 and 365, or blank for unlimited.' });
      }
      updates.days_per_year = value == null ? null : roundHalf(value);
    }
    if (req.body?.countMode != null) {
      if (!COUNT_MODES.includes(req.body.countMode)) {
        return res.status(400).json({ error: 'Choose a valid day-counting mode.' });
      }
      updates.count_mode = req.body.countMode;
    }
    if (req.body?.paid != null) updates.paid = req.body.paid ? 1 : 0;
    if (req.body?.carryoverCap != null) {
      const cap = Number(req.body.carryoverCap);
      if (!Number.isFinite(cap) || cap < 0 || cap > 60) {
        return res.status(400).json({ error: 'Carry-over cap must be between 0 and 60 days.' });
      }
      updates.carryover_cap = roundHalf(cap);
    }
    if (req.body?.color != null) {
      if (!COLOR_RE.test(req.body.color)) return res.status(400).json({ error: 'Choose a valid colour.' });
      updates.color = req.body.color;
    }
    if (req.body?.description != null) updates.description = cleanText(req.body.description, 300);
    if (req.body?.active != null) updates.active = req.body.active ? 1 : 0;

    const keys = Object.keys(updates);
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update.' });
    db.prepare(`UPDATE leave_types SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(
      ...keys.map((key) => updates[key]),
      id,
    );
    res.json({ leaveType: typeRow(db.prepare('SELECT * FROM leave_types WHERE id = ?').get(id)) });
  });

  router.get('/holidays', (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const rows = db
      .prepare('SELECT * FROM holidays WHERE substr(date, 1, 4) = ? ORDER BY date')
      .all(String(year));
    res.json({ year, holidays: rows });
  });

  router.post('/holidays', (req, res) => {
    const date = String(req.body?.date ?? '');
    const name = cleanText(req.body?.name, 100);
    if (!validISODate(date)) return res.status(400).json({ error: 'Choose a valid date.' });
    if (!name) return res.status(400).json({ error: 'Enter the holiday name.' });
    try {
      const result = db.prepare('INSERT INTO holidays (date, name) VALUES (?, ?)').run(date, name);
      res.status(201).json({ holiday: db.prepare('SELECT * FROM holidays WHERE id = ?').get(Number(result.lastInsertRowid)) });
    } catch (error) {
      if (/UNIQUE constraint failed: holidays.date/.test(error.message)) {
        return res.status(409).json({ error: 'A holiday already exists on that date.' });
      }
      throw error;
    }
  });

  router.delete('/holidays/:id', (req, res) => {
    const result = db.prepare('DELETE FROM holidays WHERE id = ?').run(Number(req.params.id));
    if (result.changes === 0) return res.status(404).json({ error: 'Holiday not found.' });
    res.json({ ok: true });
  });

  router.post('/holidays/generate', (req, res) => {
    const year = parseYear(req.body?.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const insert = db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)');
    let added = 0;
    for (const holiday of statutoryHolidays(year)) {
      added += Number(insert.run(holiday.date, holiday.name).changes);
    }
    const rows = db
      .prepare('SELECT * FROM holidays WHERE substr(date, 1, 4) = ? ORDER BY date')
      .all(String(year));
    res.json({ year, added, holidays: rows });
  });

  router.get('/entitlements', (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const users = db
      .prepare('SELECT id, name, department, start_date FROM users WHERE active = 1 ORDER BY name COLLATE NOCASE')
      .all();
    const types = db
      .prepare(
        'SELECT id, name, days_per_year, count_mode, color FROM leave_types WHERE active = 1 AND days_per_year IS NOT NULL ORDER BY sort_order, id',
      )
      .all();
    const entitlementRows = db.prepare('SELECT * FROM entitlements WHERE year = ?').all(year);
    const entitlementMap = new Map(
      entitlementRows.map((row) => [`${row.user_id}:${row.leave_type_id}`, row]),
    );
    const approvedRows = db
      .prepare(
        `SELECT user_id, leave_type_id, COALESCE(SUM(days), 0) AS days FROM requests
         WHERE status = 'approved' AND substr(start_date, 1, 4) = ?
         GROUP BY user_id, leave_type_id`,
      )
      .all(String(year));
    const approvedMap = new Map(
      approvedRows.map((row) => [`${row.user_id}:${row.leave_type_id}`, row.days]),
    );
    const rows = [];
    for (const user of users) {
      for (const type of types) {
        const key = `${user.id}:${type.id}`;
        const entitlement = entitlementMap.get(key);
        rows.push({
          userId: user.id,
          userName: user.name,
          department: user.department,
          startDate: user.start_date,
          typeId: type.id,
          entitledDays: entitlement?.entitled_days ?? null,
          carryoverDays: entitlement?.carryover_days ?? null,
          approvedDays: approvedMap.get(key) ?? 0,
        });
      }
    }
    res.json({
      year,
      types: types.map((type) => ({
        id: type.id,
        name: type.name,
        daysPerYear: type.days_per_year,
        countMode: type.count_mode,
        color: type.color,
      })),
      rows,
    });
  });

  router.put('/entitlements', (req, res) => {
    const year = parseYear(req.body?.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Nothing to save.' });
    if (items.length > 500) return res.status(400).json({ error: 'Too many changes in one save.' });

    const normalized = [];
    for (const item of items) {
      const userId = Number(item.userId);
      const typeId = Number(item.typeId);
      const entitled = roundHalf(Number(item.entitledDays ?? 0));
      const carryover = roundHalf(Number(item.carryoverDays ?? 0));
      if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) continue;
      if (!db.prepare('SELECT 1 FROM leave_types WHERE id = ?').get(typeId)) continue;
      if (!Number.isFinite(entitled) || entitled < 0 || entitled > 365) {
        return res.status(400).json({ error: 'Entitlements must be between 0 and 365 days.' });
      }
      if (!Number.isFinite(carryover) || carryover < 0 || carryover > 60) {
        return res.status(400).json({ error: 'Carry-over must be between 0 and 60 days.' });
      }
      normalized.push({ userId, typeId, entitled, carryover });
    }

    const upsert = db.prepare(
      `INSERT INTO entitlements (user_id, leave_type_id, year, entitled_days, carryover_days)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, leave_type_id, year)
       DO UPDATE SET entitled_days = excluded.entitled_days, carryover_days = excluded.carryover_days`,
    );
    db.exec('BEGIN');
    try {
      for (const item of normalized) {
        upsert.run(item.userId, item.typeId, year, item.entitled, item.carryover);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json({ ok: true, saved: items.length });
  });

  router.post('/accrual', (req, res) => {
    const year = parseYear(req.body?.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    if (year < new Date().getFullYear() - 1 || year > new Date().getFullYear() + 3) {
      return res.status(400).json({ error: 'Accruals can be run for nearby years only.' });
    }
    const result = runAccrual(db, year, { overwrite: Boolean(req.body?.overwrite) });
    res.json(result);
  });

  router.get('/settings', (req, res) => {
    const companyName =
      db.prepare("SELECT value FROM settings WHERE key = 'company_name'").get()?.value ?? '';
    res.json({ companyName });
  });

  router.put('/settings', (req, res) => {
    const companyName = cleanText(req.body?.companyName, 80);
    if (!companyName || companyName.length < 2) {
      return res.status(400).json({ error: 'Enter your company name.' });
    }
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('company_name', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(companyName);
    res.json({ companyName });
  });

  router.get('/reports/summary', (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const statusRows = db
      .prepare(
        `SELECT status, COUNT(*) AS count, COALESCE(SUM(days), 0) AS days FROM requests
         WHERE substr(start_date, 1, 4) = ? GROUP BY status`,
      )
      .all(String(year));
    const byStatus = {};
    for (const row of statusRows) byStatus[row.status] = { count: row.count, days: row.days };
    const daysByType = db
      .prepare(
        `SELECT t.name, t.color, COUNT(r.id) AS requests, COALESCE(SUM(r.days), 0) AS days
         FROM requests r JOIN leave_types t ON t.id = r.leave_type_id
         WHERE r.status = 'approved' AND substr(r.start_date, 1, 4) = ?
         GROUP BY t.id ORDER BY days DESC`,
      )
      .all(String(year));
    const headcount = db.prepare('SELECT COUNT(*) AS n FROM users WHERE active = 1').get().n;
    const pending = db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'pending'").get().n;
    const onLeaveToday = db
      .prepare(
        "SELECT COUNT(DISTINCT user_id) AS n FROM requests WHERE status = 'approved' AND start_date <= date('now') AND end_date >= date('now')",
      )
      .get().n;
    res.json({ year, byStatus, daysByType, headcount, pending, onLeaveToday });
  });

  router.get('/reports/requests.csv', (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const rows = db
      .prepare(
        `SELECT r.*, t.name AS type_name, u.name AS user_name, u.department,
                d.name AS decider_name
         FROM requests r
         JOIN leave_types t ON t.id = r.leave_type_id
         JOIN users u ON u.id = r.user_id
         LEFT JOIN users d ON d.id = r.decided_by
         WHERE substr(r.start_date, 1, 4) = ?
         ORDER BY r.start_date, r.id`,
      )
      .all(String(year));
    const header = [
      'Employee',
      'Department',
      'Leave type',
      'Start date',
      'End date',
      'Days',
      'Status',
      'Reason',
      'Handover',
      'Requested on',
      'Decided by',
      'Decision comment',
    ];
    const lines = rows.map((row) => [
      row.user_name,
      row.department ?? '',
      row.type_name,
      row.start_date,
      row.end_date,
      row.days,
      row.status,
      row.reason ?? '',
      row.handover ?? '',
      row.created_at,
      row.decider_name ?? '',
      row.decision_comment ?? '',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leave-requests-${year}.csv"`);
    res.send(toCsv([header, ...lines]));
  });

  router.get('/reports/balances.csv', (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const users = db
      .prepare('SELECT id, name, department FROM users WHERE active = 1 ORDER BY name COLLATE NOCASE')
      .all();
    const header = [
      'Employee',
      'Department',
      'Leave type',
      'Unit',
      'Entitled',
      'Carry-over',
      'Approved',
      'Pending',
      'Available',
    ];
    const lines = [];
    for (const user of users) {
      for (const balance of getBalances(db, user.id, year)) {
        lines.push([
          user.name,
          user.department ?? '',
          balance.name,
          balance.countMode === 'calendar' ? 'Calendar days' : 'Working days',
          balance.unlimited ? 'Unlimited' : balance.entitled,
          balance.unlimited ? '' : balance.carryover,
          balance.approved,
          balance.pending,
          balance.unlimited ? 'Unlimited' : balance.available,
        ]);
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leave-balances-${year}.csv"`);
    res.send(toCsv([header, ...lines]));
  });

  return router;
}

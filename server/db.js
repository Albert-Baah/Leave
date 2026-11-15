import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';
import { statutoryHolidays } from './holidays.js';
import { addDaysISO, countLeaveDays, todayISO, isWeekend } from './leaveLogic.js';
import { runAccrual } from './accrual.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'leavedesk.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee','manager','admin')),
  department TEXT,
  manager_id INTEGER REFERENCES users(id),
  start_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  days_per_year REAL,
  count_mode TEXT NOT NULL DEFAULT 'working' CHECK (count_mode IN ('working','calendar')),
  paid INTEGER NOT NULL DEFAULT 1,
  carryover_cap REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  entitled_days REAL NOT NULL DEFAULT 0,
  carryover_days REAL NOT NULL DEFAULT 0,
  UNIQUE (user_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  half_day INTEGER NOT NULL DEFAULT 0,
  days REAL NOT NULL,
  reason TEXT,
  handover TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by INTEGER REFERENCES users(id),
  decision_comment TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_user_year ON requests (user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status);
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
if (!userColumns.includes('pending')) {
  db.exec('ALTER TABLE users ADD COLUMN pending INTEGER NOT NULL DEFAULT 0');
}

function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const insert = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, department, manager_id, start_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const adminId = Number(
    insert.run(
      'Akosua Frimpong',
      'admin@leavedesk.app',
      hashPassword('Admin@123'),
      'admin',
      'People Operations',
      null,
      '2021-02-01',
    ).lastInsertRowid,
  );
  const managerId = Number(
    insert.run(
      'Kwame Mensah',
      'manager@leavedesk.app',
      hashPassword('Manager@123'),
      'manager',
      'Operations',
      adminId,
      '2020-06-15',
    ).lastInsertRowid,
  );

  insert.run('Ama Serwaa', 'employee@leavedesk.app', hashPassword('Employee@123'), 'employee', 'Operations', managerId, '2024-03-04');
  insert.run('Kofi Asante', 'kofi@leavedesk.app', hashPassword('Employee@123'), 'employee', 'Finance', adminId, '2025-01-13');
  insert.run('Efua Owusu', 'efua@leavedesk.app', hashPassword('Employee@123'), 'employee', 'Operations', managerId, '2026-02-02');
  insert.run('Yaw Bediako', 'yaw@leavedesk.app', hashPassword('Employee@123'), 'employee', 'Sales', managerId, '2024-09-09');
  insert.run('Abena Sarpong', 'abena@leavedesk.app', hashPassword('Employee@123'), 'employee', 'Technology', adminId, '2023-07-24');
}

function seedLeaveTypes() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM leave_types').get().n;
  if (count > 0) return;
  const insert = db.prepare(
    `INSERT INTO leave_types
      (code, name, days_per_year, count_mode, paid, carryover_cap, color, description, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run(
    'ANNUAL',
    'Annual Leave',
    15,
    'working',
    1,
    5,
    '#177245',
    "15 working days per year with full pay, per the Ghana Labour Act 2003 (Act 651).",
    1,
  );
  insert.run(
    'SICK',
    'Sick Leave',
    10,
    'working',
    1,
    0,
    '#c07a15',
    'Company policy default of 10 paid sick days per year. Adjust to match your staff handbook.',
    2,
  );
  insert.run(
    'MATERNITY',
    'Maternity Leave',
    84,
    'calendar',
    1,
    0,
    '#8b5cf6',
    '12 weeks (84 calendar days) of maternity leave under Act 651. Confirm company top-up policy.',
    3,
  );
  insert.run(
    'PATERNITY',
    'Paternity Leave',
    5,
    'working',
    1,
    0,
    '#2b6cb0',
    'Company policy default of 5 paid working days. Paternity leave is not statutory in Ghana.',
    4,
  );
  insert.run(
    'UNPAID',
    'Unpaid Leave',
    null,
    'working',
    0,
    0,
    '#6b7280',
    'Additional time off without pay, subject to manager approval.',
    5,
  );
}

function seedHolidays() {
  const year = new Date().getFullYear();
  const insert = db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)');
  for (let y = year - 1; y <= year + 2; y += 1) {
    for (const holiday of statutoryHolidays(y)) {
      insert.run(holiday.date, holiday.name);
    }
  }
}

function seedSettings() {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(
    'company_name',
    'FarmPadi Ltd',
  );
}

function seedDemoRequests() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM requests').get().n;
  if (count > 0) return;

  const users = db.prepare('SELECT id, email FROM users').all();
  const types = db.prepare('SELECT id, code FROM leave_types').all();
  const userId = (email) => users.find((u) => u.email === email)?.id;
  const typeId = (code) => types.find((t) => t.code === code)?.id;
  const admin = userId('admin@leavedesk.app');
  const manager = userId('manager@leavedesk.app');

  const year = new Date().getFullYear();
  const holidayRows = db.prepare('SELECT date FROM holidays WHERE substr(date, 1, 4) = ?').all(String(year));
  const holidays = new Set(holidayRows.map((h) => h.date));

  const nextMonday = (() => {
    let d = addDaysISO(todayISO(), 7);
    while (isWeekend(d)) d = addDaysISO(d, 1);
    return d;
  })();

  const requests = [
    {
      email: 'employee@leavedesk.app',
      code: 'ANNUAL',
      start: nextMonday,
      end: addDaysISO(nextMonday, 4),
      status: 'pending',
      reason: 'Family visit in Kumasi and a short rest.',
      handover: 'Efua will cover the operations tracker while I am away.',
      decidedBy: null,
      createdAt: '-2 days',
    },
    {
      email: 'yaw@leavedesk.app',
      code: 'ANNUAL',
      start: addDaysISO(nextMonday, 21),
      end: addDaysISO(nextMonday, 23),
      status: 'pending',
      reason: 'Attending a cousin’s wedding in Takoradi.',
      handover: 'Abena is covering my client follow-ups.',
      decidedBy: null,
      createdAt: '-1 days',
    },
    {
      email: 'kofi@leavedesk.app',
      code: 'ANNUAL',
      start: addDaysISO(todayISO(), -20),
      end: addDaysISO(todayISO(), -16),
      status: 'approved',
      reason: 'Rest and personal errands.',
      handover: 'Month-end journals prepped before I left.',
      decidedBy: admin,
      createdAt: '-30 days',
    },
    {
      email: 'efua@leavedesk.app',
      code: 'SICK',
      start: addDaysISO(todayISO(), -6),
      end: addDaysISO(todayISO(), -5),
      status: 'approved',
      reason: 'Malaria treatment and recovery at home.',
      handover: 'Team notified; urgent tasks reassigned.',
      decidedBy: manager,
      createdAt: '-7 days',
    },
    {
      email: 'abena@leavedesk.app',
      code: 'SICK',
      start: addDaysISO(todayISO(), -40),
      end: addDaysISO(todayISO(), -40),
      status: 'approved',
      reason: 'Clinic appointment.',
      handover: null,
      decidedBy: admin,
      createdAt: '-42 days',
    },
  ];

  const insert = db.prepare(
    `INSERT INTO requests
      (user_id, leave_type_id, start_date, end_date, half_day, days, reason, handover, status, decided_by, decision_comment, decided_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
  );

  for (const request of requests) {
    const uid = userId(request.email);
    const tid = typeId(request.code);
    if (!uid || !tid) continue;
    const days = countLeaveDays(request.start, request.end, holidays, 'working');
    if (days <= 0) continue;
    insert.run(
      uid,
      tid,
      request.start,
      request.end,
      days,
      request.reason,
      request.handover,
      request.status,
      request.decidedBy,
      request.status === 'approved' ? 'Approved. Enjoy your time off.' : null,
      request.decidedBy ? new Date().toISOString() : null,
      request.createdAt,
    );
  }
}

export function initDatabase() {
  seedUsers();
  seedLeaveTypes();
  seedSettings();
  seedHolidays();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  runAccrual(db, new Date().getFullYear(), { overwrite: false });
  seedDemoRequests();
}

initDatabase();

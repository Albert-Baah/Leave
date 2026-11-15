import { parseISO } from './leaveLogic.js';

export const REQUEST_SELECT = `
  SELECT r.*, t.name AS leave_type_name, t.color AS leave_type_color, t.count_mode,
         t.days_per_year AS type_days_per_year, t.paid AS type_paid,
         u.name AS user_name, u.email AS user_email, u.department AS user_department,
         d.name AS decided_by_name
  FROM requests r
  JOIN leave_types t ON t.id = r.leave_type_id
  JOIN users u ON u.id = r.user_id
  LEFT JOIN users d ON d.id = r.decided_by
`;

export function mapRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    department: row.user_department,
    leaveTypeId: row.leave_type_id,
    leaveType: row.leave_type_name,
    color: row.leave_type_color,
    countMode: row.count_mode,
    daysPerYear: row.type_days_per_year,
    unlimited: row.type_days_per_year == null,
    startDate: row.start_date,
    endDate: row.end_date,
    halfDay: Boolean(row.half_day),
    days: row.days,
    reason: row.reason,
    handover: row.handover,
    status: row.status,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name,
    decisionComment: row.decision_comment,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

export function fetchRequest(db, id) {
  return mapRequest(db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id));
}

export function getCompanyName(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('company_name');
  return row?.value ?? 'Your Company';
}

export function parseYear(value, fallback = new Date().getFullYear()) {
  const year = Number(value ?? fallback);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

export function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function validISODate(value) {
  return Boolean(parseISO(value));
}

export function cleanText(value, max = 500) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

export function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    managerId: row.manager_id,
    managerName: row.manager_name ?? null,
    startDate: row.start_date,
    active: Boolean(row.active),
    pending: Boolean(row.pending),
    createdAt: row.created_at,
  };
}

export function csvEscape(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

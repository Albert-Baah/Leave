import { parseISO, prorateEntitlement, roundHalf } from './leaveLogic.js';

function yearOf(isoDate) {
  return Number(isoDate.slice(0, 4));
}

export function approvedDaysFor(db, userId, typeId, year, excludeRequestId = null) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(days), 0) AS total FROM requests
       WHERE user_id = ? AND leave_type_id = ? AND status = 'approved'
         AND substr(start_date, 1, 4) = ? AND (? IS NULL OR id != ?)`,
    )
    .get(userId, typeId, String(year), excludeRequestId, excludeRequestId);
  return row?.total ?? 0;
}

export function pendingDaysFor(db, userId, typeId, year, excludeRequestId = null) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(days), 0) AS total FROM requests
       WHERE user_id = ? AND leave_type_id = ? AND status = 'pending'
         AND substr(start_date, 1, 4) = ? AND (? IS NULL OR id != ?)`,
    )
    .get(userId, typeId, String(year), excludeRequestId, excludeRequestId);
  return row?.total ?? 0;
}

export function getYearEntitlements(db, userId, year) {
  const rows = db
    .prepare('SELECT * FROM entitlements WHERE user_id = ? AND year = ?')
    .all(userId, year);
  return new Map(rows.map((row) => [row.leave_type_id, row]));
}

export function getBalances(db, userId, year) {
  const types = db
    .prepare('SELECT * FROM leave_types WHERE active = 1 ORDER BY sort_order, id')
    .all();
  const entitlements = getYearEntitlements(db, userId, year);
  return types.map((type) => {
    const entitlement = entitlements.get(type.id);
    const unlimited = type.days_per_year == null;
    const entitled = unlimited ? null : entitlement?.entitled_days ?? 0;
    const carryover = unlimited ? 0 : entitlement?.carryover_days ?? 0;
    const approved = approvedDaysFor(db, userId, type.id, year);
    const pending = pendingDaysFor(db, userId, type.id, year);
    const available = unlimited ? null : roundHalf(entitled + carryover - approved - pending);
    return {
      leaveTypeId: type.id,
      code: type.code,
      name: type.name,
      color: type.color,
      description: type.description,
      countMode: type.count_mode,
      paid: Boolean(type.paid),
      daysPerYear: type.days_per_year,
      carryoverCap: type.carryover_cap,
      unlimited,
      entitled,
      carryover,
      approved: roundHalf(approved),
      pending: roundHalf(pending),
      available,
    };
  });
}

/** Balance available for a new/under-review request, excluding that request itself. */
export function availableForRequest(db, userId, typeId, year, requestId = null) {
  const type = db.prepare('SELECT * FROM leave_types WHERE id = ?').get(typeId);
  if (!type) return null;
  if (type.days_per_year == null) return null;
  const entitlement = db
    .prepare('SELECT * FROM entitlements WHERE user_id = ? AND leave_type_id = ? AND year = ?')
    .get(userId, typeId, year);
  const approved = approvedDaysFor(db, userId, typeId, year, requestId);
  const pending = pendingDaysFor(db, userId, typeId, year, requestId);
  return roundHalf((entitlement?.entitled_days ?? 0) + (entitlement?.carryover_days ?? 0) - approved - pending);
}

export function previousYearUnused(db, userId, typeId, year) {
  const existing = db
    .prepare('SELECT * FROM entitlements WHERE user_id = ? AND leave_type_id = ? AND year = ?')
    .get(userId, typeId, year - 1);
  if (!existing) return 0;
  const used = approvedDaysFor(db, userId, typeId, year - 1);
  return Math.max(0, roundHalf(existing.entitled_days + existing.carryover_days - used));
}

/**
 * Create or refresh yearly entitlements.
 * By default only missing rows are created; pass overwrite to recalculate.
 */
export function runAccrual(db, year, { overwrite = false } = {}) {
  const users = db.prepare('SELECT * FROM users WHERE active = 1').all();
  const types = db.prepare('SELECT * FROM leave_types WHERE active = 1').all();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO entitlements (user_id, leave_type_id, year, entitled_days, carryover_days)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const upsert = db.prepare(
    `INSERT INTO entitlements (user_id, leave_type_id, year, entitled_days, carryover_days)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, leave_type_id, year)
     DO UPDATE SET entitled_days = excluded.entitled_days, carryover_days = excluded.carryover_days`,
  );

  let created = 0;
  let updated = 0;
  db.exec('BEGIN');
  try {
    for (const user of users) {
      for (const type of types) {
        if (type.days_per_year == null) continue;
        const start = parseISO(user.start_date);
        if (!start || start.getUTCFullYear() > year) continue;
        const entitled = prorateEntitlement(type.days_per_year, user.start_date, year);
        const carryCap = type.carryover_cap ?? 0;
        const carry =
          carryCap > 0 && start.getUTCFullYear() < year
            ? Math.min(carryCap, previousYearUnused(db, user.id, type.id, year))
            : 0;
        const exists = db
          .prepare('SELECT id FROM entitlements WHERE user_id = ? AND leave_type_id = ? AND year = ?')
          .get(user.id, type.id, year);
        if (exists && !overwrite) continue;
        if (exists) {
          upsert.run(user.id, type.id, year, entitled, carry);
          updated += 1;
        } else {
          insert.run(user.id, type.id, year, entitled, carry);
          created += 1;
        }
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { year, created, updated };
}

export function ensureCurrentYearEntitlements(db) {
  const year = new Date().getFullYear();
  return runAccrual(db, year, { overwrite: false });
}

export function holidaySetFor(db, year) {
  const rows = db
    .prepare('SELECT date FROM holidays WHERE substr(date, 1, 4) = ?')
    .all(String(year));
  return new Set(rows.map((row) => row.date));
}

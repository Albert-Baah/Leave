import { Router } from 'express';
import { hashPassword, hashToken, requireAuth, verifyPassword } from '../auth.js';
import {
  availableForRequest,
  getBalances,
  holidaySetFor,
} from '../accrual.js';
import {
  addDaysISO,
  countLeaveDays,
  daysInclusive,
  parseISO,
  todayISO,
} from '../leaveLogic.js';
import {
  REQUEST_SELECT,
  cleanText,
  fetchRequest,
  getCompanyName,
  mapRequest,
  parseYear,
  validISODate,
} from '../util.js';

function yearOf(isoDate) {
  return Number(isoDate.slice(0, 4));
}

function pendingApprovalsFor(db, user) {
  const base = `${REQUEST_SELECT} WHERE r.status = 'pending'`;
  let rows;
  if (user.role === 'admin') {
    rows = db.prepare(`${base} ORDER BY r.created_at ASC`).all();
  } else if (user.role === 'manager') {
    rows = db
      .prepare(`${base} AND u.manager_id = ? ORDER BY r.created_at ASC`)
      .all(user.id);
  } else {
    rows = [];
  }
  return rows.map((row) => {
    const request = mapRequest(row);
    return {
      ...request,
      available: availableForRequest(
        db,
        request.userId,
        request.leaveTypeId,
        yearOf(request.startDate),
        request.id,
      ),
    };
  });
}

function teamMemberIds(db, user) {
  if (user.role === 'admin') return null;
  if (user.role !== 'manager') return [user.id];
  const reports = db
    .prepare('SELECT id FROM users WHERE manager_id = ? AND active = 1')
    .all(user.id)
    .map((row) => row.id);
  return [user.id, ...reports];
}

function requestableEmployees(db, user) {
  if (user.role === 'admin') {
    return db
      .prepare(
        `SELECT id, name, department, role FROM users
         WHERE active = 1 ORDER BY name COLLATE NOCASE`,
      )
      .all();
  }
  if (user.role === 'manager') {
    return db
      .prepare(
        `SELECT id, name, department, role FROM users
         WHERE active = 1 AND (id = ? OR manager_id = ?)
         ORDER BY name COLLATE NOCASE`,
      )
      .all(user.id, user.id);
  }
  return db
    .prepare('SELECT id, name, department, role FROM users WHERE id = ?')
    .all(user.id);
}

export function appRoutes(db) {
  const router = Router();
  router.use(requireAuth);

  router.get('/leave-types', (req, res) => {
    const rows = db
      .prepare('SELECT * FROM leave_types WHERE active = 1 ORDER BY sort_order, id')
      .all();
    res.json({
      leaveTypes: rows.map((type) => ({
        id: type.id,
        code: type.code,
        name: type.name,
        daysPerYear: type.days_per_year,
        countMode: type.count_mode,
        paid: Boolean(type.paid),
        carryoverCap: type.carryover_cap,
        color: type.color,
        description: type.description,
      })),
    });
  });

  router.get('/holidays', (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const rows = db
      .prepare('SELECT * FROM holidays WHERE substr(date, 1, 4) = ? ORDER BY date')
      .all(String(year));
    res.json({ year, holidays: rows });
  });

  router.get('/requestable-employees', (req, res) => {
    res.json({ employees: requestableEmployees(db, req.user) });
  });

  router.get('/employees/:id/balances', (req, res) => {
    const id = Number(req.params.id);
    if (!requestableEmployees(db, req.user).some((employee) => employee.id === id)) {
      return res.status(403).json({ error: 'You can only view leave for yourself or staff you manage.' });
    }
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    res.json({ year, balances: getBalances(db, id, year) });
  });

  router.get('/me/dashboard', (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const balances = getBalances(db, req.user.id, year);
    const requests = db
      .prepare(`${REQUEST_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 6`)
      .all(req.user.id)
      .map(mapRequest);
    const pendingMine = db
      .prepare("SELECT COUNT(*) AS n FROM requests WHERE user_id = ? AND status = 'pending'")
      .get(req.user.id).n;
    const approvals = pendingApprovalsFor(db, req.user);
    const holidays = db
      .prepare('SELECT * FROM holidays WHERE date >= ? ORDER BY date LIMIT 4')
      .all(todayISO());
    res.json({
      year,
      companyName: getCompanyName(db),
      balances,
      recentRequests: requests,
      pendingMine,
      pendingApprovals: approvals.slice(0, 4),
      pendingApprovalsCount: approvals.length,
      upcomingHolidays: holidays,
      manager: req.user.managerId
        ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.user.managerId)
        : null,
    });
  });

  router.get('/me/requests', (req, res) => {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: 'Choose a valid year.' });
    const rows = db
      .prepare(
        `${REQUEST_SELECT} WHERE r.user_id = ? AND substr(r.start_date, 1, 4) = ?
         ORDER BY r.start_date DESC, r.id DESC`,
      )
      .all(req.user.id, String(year))
      .map(mapRequest);
    res.json({ year, requests: rows });
  });

  router.post('/me/password', (req, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(currentPassword, row.password_hash)) {
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(newPassword),
      req.user.id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(
      req.user.id,
      hashToken(req.sessionToken),
    );
    res.json({ ok: true });
  });

  router.post('/requests', (req, res) => {
    const typeId = Number(req.body?.typeId);
    const startDate = String(req.body?.startDate ?? '');
    const endDate = String(req.body?.endDate ?? '');
    const halfDay = Boolean(req.body?.halfDay);
    const reason = cleanText(req.body?.reason);
    const handover = cleanText(req.body?.handover);

    const type = db.prepare('SELECT * FROM leave_types WHERE id = ? AND active = 1').get(typeId);
    if (!type) return res.status(400).json({ error: 'Choose a valid leave type.' });

    const requestedUserId = req.body?.userId == null ? req.user.id : Number(req.body.userId);
    const employee = requestableEmployees(db, req.user).find(
      (candidate) => candidate.id === requestedUserId,
    );
    if (!employee) {
      return res.status(403).json({ error: 'You can only request leave for yourself or for staff you manage.' });
    }
    const targetUserId = employee.id;

    if (!validISODate(startDate) || !validISODate(endDate)) {
      return res.status(400).json({ error: 'Choose valid start and end dates.' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'The end date must be on or after the start date.' });
    }
    if (yearOf(startDate) !== yearOf(endDate)) {
      return res.status(400).json({ error: 'Leave cannot cross a calendar year. Please split the request.' });
    }
    if (halfDay && (startDate !== endDate || type.count_mode !== 'working')) {
      return res.status(400).json({ error: 'A half day must be a single working day.' });
    }
    if (daysInclusive(startDate, endDate) > 366) {
      return res.status(400).json({ error: 'Requests cannot be longer than one year.' });
    }

    const today = todayISO();
    const backdatedLimit = type.code === 'SICK' ? addDaysISO(today, -14) : today;
    if (startDate < backdatedLimit) {
      return res.status(400).json({
        error:
          type.code === 'SICK'
            ? 'Sick leave can only be backdated by up to 14 days.'
            : 'The start date cannot be in the past.',
      });
    }
    if (startDate > addDaysISO(today, 400)) {
      return res.status(400).json({ error: 'Leave can only be requested up to about a year in advance.' });
    }

    const holidays = holidaySetFor(db, yearOf(startDate));
    const days = countLeaveDays(startDate, endDate, holidays, type.count_mode, halfDay);
    if (days <= 0) {
      return res.status(400).json({
        error: 'That range contains no working days. Choose dates that fall on working days.',
      });
    }

    const overlap = db
      .prepare(
        `SELECT r.id, r.start_date, r.end_date, r.status, t.name AS type_name
         FROM requests r JOIN leave_types t ON t.id = r.leave_type_id
         WHERE r.user_id = ? AND r.status IN ('pending','approved')
           AND r.start_date <= ? AND r.end_date >= ?
         ORDER BY r.start_date LIMIT 1`,
      )
      .get(targetUserId, endDate, startDate);
    if (overlap) {
      const isSelf = targetUserId === req.user.id;
      const owner = isSelf ? 'your' : `${employee.name}'s`;
      const nextStep =
        overlap.status === 'pending'
          ? isSelf
            ? 'Cancel it under My leave if you need those dates, or choose different dates.'
            : `Ask ${employee.name} to cancel it, or choose different dates.`
          : 'Choose dates that do not overlap it.';
      return res.status(409).json({
        error: `These dates overlap ${owner} ${overlap.status} ${overlap.type_name} request (${overlap.start_date} to ${overlap.end_date}). ${nextStep}`,
        conflict: {
          id: overlap.id,
          leaveType: overlap.type_name,
          startDate: overlap.start_date,
          endDate: overlap.end_date,
          status: overlap.status,
        },
      });
    }

    if (type.days_per_year != null) {
      const available = availableForRequest(db, targetUserId, typeId, yearOf(startDate));
      if (days > available) {
        return res.status(400).json({
          error: `This request needs ${days} day(s), but only ${available} day(s) of ${type.name} are available.`,
        });
      }
    }

    const autoApprove = req.user.role === 'admin' && targetUserId === req.user.id;
    const insert = db
      .prepare(
        `INSERT INTO requests
          (user_id, leave_type_id, start_date, end_date, half_day, days, reason, handover,
           status, decided_by, decision_comment, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        targetUserId,
        typeId,
        startDate,
        endDate,
        halfDay ? 1 : 0,
        days,
        reason,
        handover,
        autoApprove ? 'approved' : 'pending',
        autoApprove ? req.user.id : null,
        autoApprove ? 'Auto-approved (administrator).' : null,
        autoApprove ? new Date().toISOString() : null,
      );

    res.status(201).json({
      request: fetchRequest(db, Number(insert.lastInsertRowid)),
      autoApproved: autoApprove,
    });
  });

  router.post('/requests/:id/cancel', (req, res) => {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(Number(req.params.id));
    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (request.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only cancel your own requests.' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending requests can be cancelled.' });
    }
    db.prepare("UPDATE requests SET status = 'cancelled' WHERE id = ?").run(request.id);
    res.json({ request: fetchRequest(db, request.id) });
  });

  router.get('/approvals', (req, res) => {
    if (!['manager', 'admin'].includes(req.user.role)) {
      return res.json({ approvals: [] });
    }
    res.json({ approvals: pendingApprovalsFor(db, req.user) });
  });

  router.get('/approvals/history', (req, res) => {
    const rows = db
      .prepare(
        `${REQUEST_SELECT} WHERE r.decided_by = ? AND r.status IN ('approved','rejected')
         ORDER BY r.decided_at DESC LIMIT 12`,
      )
      .all(req.user.id)
      .map(mapRequest);
    res.json({ decisions: rows });
  });

  router.post('/requests/:id/decision', (req, res) => {
    const decision = String(req.body?.decision ?? '');
    const comment = cleanText(req.body?.comment);
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Choose approve or reject.' });
    }
    if (decision === 'rejected' && !comment) {
      return res.status(400).json({ error: 'Add a short reason when rejecting a request.' });
    }

    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Request not found.' });
    if (row.status !== 'pending') {
      return res.status(409).json({ error: 'This request has already been decided.' });
    }
    if (row.user_id === req.user.id) {
      return res.status(403).json({ error: 'You cannot decide your own leave request.' });
    }
    const requester = db.prepare('SELECT manager_id FROM users WHERE id = ?').get(row.user_id);
    const allowed =
      req.user.role === 'admin' || (req.user.role === 'manager' && requester.manager_id === req.user.id);
    if (!allowed) {
      return res.status(403).json({ error: 'You are not the approver for this request.' });
    }

    if (decision === 'approved') {
      const available = availableForRequest(
        db,
        row.user_id,
        row.leave_type_id,
        yearOf(row.start_date),
        row.id,
      );
      if (available != null && row.days > available) {
        return res.status(409).json({
          error: `Cannot approve: only ${available} day(s) are available and this request needs ${row.days}.`,
        });
      }
    }

    db.prepare(
      `UPDATE requests
       SET status = ?, decided_by = ?, decision_comment = ?, decided_at = ?
       WHERE id = ?`,
    ).run(decision, req.user.id, comment, new Date().toISOString(), row.id);
    res.json({ request: fetchRequest(db, row.id) });
  });

  router.get('/calendar', (req, res) => {
    const month = String(req.query.month ?? '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'Choose a valid month.' });
    }
    const [year, monthNumber] = month.split('-').map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;

    let scope = String(req.query.scope ?? 'mine');
    if (!['mine', 'team', 'all'].includes(scope)) scope = 'mine';
    if (scope === 'all' && req.user.role !== 'admin') scope = 'team';

    const ids = scope === 'mine' ? [req.user.id] : teamMemberIds(db, req.user);
    const idClause = ids ? `AND r.user_id IN (${ids.map(() => '?').join(',')})` : '';
    const rows = db
      .prepare(
        `${REQUEST_SELECT}
         WHERE r.status IN ('pending','approved')
           AND r.start_date <= ? AND r.end_date >= ?
           ${idClause}
         ORDER BY r.start_date, r.id`,
      )
      .all(monthEnd, monthStart, ...(ids ?? []));

    const holidays = db
      .prepare("SELECT * FROM holidays WHERE substr(date, 1, 7) = ? ORDER BY date")
      .all(month);

    res.json({ month, scope, events: rows.map(mapRequest), holidays });
  });

  return router;
}

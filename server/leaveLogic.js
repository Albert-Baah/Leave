const DAY_MS = 86400000;

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toISO(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function parseISO(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toISO(date) !== value) return null;
  return date;
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function addDaysISO(value, days) {
  const date = parseISO(value);
  if (!date) return null;
  return toISO(new Date(date.getTime() + days * DAY_MS));
}

export function daysInclusive(startISO, endISO) {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!start || !end || end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

export function eachDay(startISO, endISO) {
  const days = [];
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!start || !end || end < start) return days;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    days.push(toISO(new Date(t)));
  }
  return days;
}

export function isWeekend(isoDate) {
  const date = parseISO(isoDate);
  if (!date) return false;
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Count chargeable days for a leave range.
 * working: Mon–Fri, excluding public holidays; calendar: every calendar day.
 */
export function countLeaveDays(startISO, endISO, holidayDates = new Set(), countMode = 'working', halfDay = false) {
  if (countMode === 'calendar') {
    return daysInclusive(startISO, endISO);
  }
  let count = 0;
  for (const day of eachDay(startISO, endISO)) {
    if (!isWeekend(day) && !holidayDates.has(day)) count += 1;
  }
  if (halfDay && count === 1 && startISO === endISO) return 0.5;
  return count;
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function monthsRemainingInYear(startDate, year) {
  const start = parseISO(startDate);
  if (!start) return 0;
  const startYear = start.getUTCFullYear();
  if (startYear > year) return 0;
  if (startYear < year) return 12;
  return 12 - start.getUTCMonth();
}

/** Prorate an annual entitlement from an employment start date, to half-day precision. */
export function prorateEntitlement(daysPerYear, startDate, year) {
  if (daysPerYear == null) return 0;
  const months = monthsRemainingInYear(startDate, year);
  if (months <= 0) return 0;
  const raw = (daysPerYear * months) / 12;
  return Math.round(raw * 2) / 2;
}

export function roundHalf(value) {
  return Math.round(Number(value) * 2) / 2;
}

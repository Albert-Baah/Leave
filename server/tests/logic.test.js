import test from 'node:test';
import assert from 'node:assert/strict';
import { easterSunday, statutoryHolidays } from '../holidays.js';
import {
  countLeaveDays,
  monthsRemainingInYear,
  prorateEntitlement,
  rangesOverlap,
  addDaysISO,
  daysInclusive,
} from '../leaveLogic.js';

test('Easter Sunday matches known dates', () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(easterSunday(2027).toISOString().slice(0, 10), '2027-03-28');
  assert.equal(easterSunday(2024).toISOString().slice(0, 10), '2024-03-31');
});

test('Ghana statutory holidays include fixed, Easter and Farmers Day', () => {
  const dates = new Map(statutoryHolidays(2026).map((h) => [h.date, h.name]));
  assert.equal(dates.get('2026-01-01'), "New Year's Day");
  assert.equal(dates.get('2026-03-06'), 'Independence Day');
  assert.equal(dates.get('2026-04-03'), 'Good Friday');
  assert.equal(dates.get('2026-04-06'), 'Easter Monday');
  assert.equal(dates.get('2026-12-04'), "Farmers' Day");
  assert.ok(dates.get('2026-03-20')?.startsWith('Eid al-Fitr'));
  assert.equal(statutoryHolidays(2026).length, 13);
});

test('working days exclude weekends and public holidays', () => {
  const none = new Set();
  assert.equal(countLeaveDays('2026-11-16', '2026-11-20', none), 5);
  assert.equal(countLeaveDays('2026-11-16', '2026-11-22', none), 5);
  const holidays = new Set(['2026-11-18']);
  assert.equal(countLeaveDays('2026-11-16', '2026-11-20', holidays), 4);
  assert.equal(countLeaveDays('2026-11-21', '2026-11-22', none), 0);
});

test('half day applies only to a single working day', () => {
  assert.equal(countLeaveDays('2026-11-16', '2026-11-16', new Set(), 'working', true), 0.5);
  assert.equal(countLeaveDays('2026-11-16', '2026-11-17', new Set(), 'working', true), 2);
});

test('calendar mode counts every day', () => {
  assert.equal(countLeaveDays('2026-11-14', '2026-11-22', new Set(), 'calendar'), 9);
});

test('proration uses remaining months and half-day precision', () => {
  assert.equal(monthsRemainingInYear('2024-03-04', 2026), 12);
  assert.equal(monthsRemainingInYear('2026-02-02', 2026), 11);
  assert.equal(monthsRemainingInYear('2026-12-01', 2026), 1);
  assert.equal(monthsRemainingInYear('2027-01-05', 2026), 0);
  assert.equal(prorateEntitlement(15, '2026-02-02', 2026), 14);
  assert.equal(prorateEntitlement(15, '2026-11-01', 2026), 2.5);
  assert.equal(prorateEntitlement(15, '2024-03-04', 2026), 15);
});

test('overlap and date helpers', () => {
  assert.equal(rangesOverlap('2026-11-16', '2026-11-20', '2026-11-20', '2026-11-24'), true);
  assert.equal(rangesOverlap('2026-11-16', '2026-11-20', '2026-11-21', '2026-11-24'), false);
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
  assert.equal(daysInclusive('2026-11-16', '2026-11-20'), 5);
});

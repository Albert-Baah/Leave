// Ghana statutory public holidays (Public Holidays Act, 2001 — Act 601).
// Islamic holidays depend on moon sighting; dates below are published estimates
// and remain editable in the admin UI.

const ISLAMIC_HOLIDAYS = {
  2025: [
    ['2025-03-31', 'Eid al-Fitr'],
    ['2025-06-07', 'Eid al-Adha'],
  ],
  2026: [
    ['2026-03-20', 'Eid al-Fitr'],
    ['2026-05-27', 'Eid al-Adha'],
  ],
  2027: [
    ['2027-03-09', 'Eid al-Fitr'],
    ['2027-05-17', 'Eid al-Adha'],
  ],
  2028: [
    ['2028-02-26', 'Eid al-Fitr'],
    ['2028-05-05', 'Eid al-Adha'],
  ],
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function iso(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Anonymous Gregorian algorithm for Easter Sunday.
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function shift(base, days) {
  const d = new Date(base.getTime() + days * 86400000);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function statutoryHolidays(year) {
  const easter = easterSunday(year);
  const list = [
    { date: iso(year, 1, 1), name: "New Year's Day" },
    { date: iso(year, 1, 7), name: 'Constitution Day' },
    { date: iso(year, 3, 6), name: 'Independence Day' },
    { date: shift(easter, -2), name: 'Good Friday' },
    { date: shift(easter, 1), name: 'Easter Monday' },
    { date: iso(year, 5, 1), name: 'May Day' },
    { date: iso(year, 8, 4), name: "Founders' Day" },
    { date: iso(year, 9, 21), name: 'Kwame Nkrumah Memorial Day' },
    { date: iso(year, 12, 25), name: 'Christmas Day' },
    { date: iso(year, 12, 26), name: 'Boxing Day' },
  ];

  // Farmers' Day: first Friday of December.
  for (let day = 1; day <= 7; day += 1) {
    const d = new Date(Date.UTC(year, 11, day));
    if (d.getUTCDay() === 5) {
      list.push({ date: iso(year, 12, day), name: "Farmers' Day" });
      break;
    }
  }

  for (const [date, name] of ISLAMIC_HOLIDAYS[year] ?? []) {
    list.push({ date, name: `${name} (subject to moon sighting)` });
  }

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

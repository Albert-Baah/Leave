const DAY_MS = 86400000;

export function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function parseISO(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toISO(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + days * DAY_MS));
}

export function daysInclusive(start: string, end: string): number {
  const diff = parseISO(end).getTime() - parseISO(start).getTime();
  return diff < 0 ? 0 : Math.round(diff / DAY_MS) + 1;
}

export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  const first = parseISO(start).getTime();
  const last = parseISO(end).getTime();
  for (let time = first; time <= last; time += DAY_MS) {
    days.push(toISO(new Date(time)));
  }
  return days;
}

export function isWeekend(iso: string): boolean {
  const day = parseISO(iso).getUTCDay();
  return day === 0 || day === 6;
}

export function countLeaveDays(
  start: string,
  end: string,
  holidays: Set<string>,
  countMode: 'working' | 'calendar',
  halfDay = false,
): number {
  if (!start || !end || end < start) return 0;
  if (countMode === 'calendar') return daysInclusive(start, end);
  let count = 0;
  for (const day of eachDay(start, end)) {
    if (!isWeekend(day) && !holidays.has(day)) count += 1;
  }
  if (halfDay && count === 1 && start === end) return 0.5;
  return count;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const weekdayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  timeZone: 'UTC',
});

export function formatDate(iso: string): string {
  return dateFmt.format(parseISO(iso));
}

export function formatShort(iso: string): string {
  return shortFmt.format(parseISO(iso));
}

export function formatWeekday(iso: string): string {
  return weekdayFmt.format(parseISO(iso));
}

export function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const a = parseISO(start);
  const b = parseISO(end);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(b)}`;
  }
  return `${formatShort(start)} – ${formatDate(end)}`;
}

export function monthTitle(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function monthGrid(month: string): { iso: string; inMonth: boolean }[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday-first grid
  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(first.getTime() + (index - offset) * DAY_MS);
    cells.push({
      iso: toISO(date),
      inMonth: date.getUTCMonth() === monthNumber - 1,
    });
  }
  return cells;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export function pluralDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

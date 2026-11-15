# LeaveDesk

A small, local-first leave management system for Ghanaian companies. Employees request leave, managers approve it, and administrators manage staff, leave types, public holidays, accruals and reports.

The seeded policy follows **Ghana's Labour Act 2003 (Act 651)** where it applies, and every allowance is editable from the admin area.

Built with React 19 + TypeScript (Vite), Node/Express and SQLite.

## Features

- **Requests and balances** — working-day counts that exclude weekends and Ghana public holidays, half days, live balance preview, overlap detection, cancel own pending requests. Managers and administrators can file a request on behalf of a staff member by choosing the employee on the request form; the request, balance and approval queue follow that person.
- **Accounts** — employees can request an account from the sign-in screen; administrators approve or reject it under People before first sign-in. Admins can also create accounts directly.
- **Approval workflow** — managers see and decide requests from their direct reports; administrators see everything. Rejections require a reason; approvals re-check the balance. Administrators' own requests are auto-approved with an audit comment.
- **Leave types and accrual** — yearly entitlements, prorated for mid-year starters, carry-over caps per leave type, unlimited (unpaid) types, admin-triggered accrual runs and per-employee overrides.
- **Admin and Ghana policy** — staff directory with roles and reporting lines, seeded statutory holidays (including Easter-derived dates, Farmers' Day and estimated Eid dates), custom holidays, CSV exports for requests and balances, and a company-wide reports dashboard.
- **Security** — scrypt password hashing, HTTP-only session cookies (7 days), login rate limiting, role-based access on every API route.

## Requirements

- Node.js **22.5 or newer** (this project uses the built-in `node:sqlite` module; developed on Node 24)
- npm

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. The API runs on port 4000 and the Vite dev server proxies `/api` to it.

The SQLite database is created and seeded automatically on first run at `server/data/leavedesk.db`.

### Production-style run

```bash
npm run build   # type-check + build the React client into client/dist
npm start       # serves the API and the built client on http://localhost:4000
```

Set `PORT` to change the API port.

## Demo accounts

All demo accounts use the local database and seeded sample requests.

| Role | Email | Password |
| --- | --- | --- |
| Employee | `employee@leavedesk.app` | `Employee@123` |
| Manager | `manager@leavedesk.app` | `Manager@123` |
| Administrator | `admin@leavedesk.app` | `Admin@123` |

Other seeded employees (password `Employee@123`): `efua@leavedesk.app`, `kofi@leavedesk.app`, `yaw@leavedesk.app`, `abena@leavedesk.app`.

The sign-in screen has demo cards that fill the form for you.

**Change these passwords before real use.** Anyone with admin access can reset passwords under **People**.

## Creating accounts

Two paths are available:

1. **Self-sign-up** — an employee chooses **Create an account** on the sign-in screen and submits their name, work email, department, employment start date and a password. The account is stored as **Pending approval** and cannot sign in yet. An administrator opens **People**, sees the pending request at the top of the list, and chooses **Approve** (activates the account and creates prorated leave balances) or **Reject** (keeps it inactive).
2. **Admin-created** — an administrator adds the employee under **People → Add employee** with a temporary password, role and line manager. The account is active immediately and balances are created automatically.

Self sign-ups get the Employee role and no line manager, so their requests land in the administrator's approval queue. Assign a manager under **People → Edit** after approval if needed. Sign-up requests are rate-limited to 5 per 15 minutes per IP address.

## Seeded leave policy

| Leave type | Allowance | Counting | Paid | Carry-over |
| --- | --- | --- | --- | --- |
| Annual | 15 days | Working days | Yes | Up to 5 days |
| Sick | 10 days | Working days | Yes | None |
| Maternity | 84 days | Calendar days | Yes | None |
| Paternity | 5 days | Working days | Yes | None |
| Unpaid | Unlimited | Working days | No | None |

Notes:

- Annual (15 working days) and maternity (12 weeks) follow Act 651. Sick and paternity allowances are **company policy defaults** — edit them under **Admin → Leave types** to match your staff handbook.
- Sick leave can be backdated up to 14 days. Other leave types cannot start in the past.
- Requests must fall within a single calendar year, because balances are tracked per year.
- A half day deducts 0.5 and is only allowed when the request is one working day long.
- Pending requests reserve days immediately; approving re-checks availability, rejecting releases the days.

### Public holidays

The seeder includes statutory holidays for the current year ±2:

New Year's Day, Constitution Day (7 Jan), Independence Day (6 Mar), Good Friday, Easter Monday, May Day, Eid al-Fitr, Eid al-Adha, Founders' Day (4 Aug), Kwame Nkrumah Memorial Day (21 Sep), Farmers' Day (first Friday of December), Christmas Day, Boxing Day.

Eid dates are published estimates and depend on moon sighting — confirm them each year under **Admin → Public holidays** and adjust with the add/remove controls. Changing holidays affects new requests only; existing requests keep their recorded day counts.

## Admin workflows

**People** — create accounts (balances are prorated from the start date automatically), approve or reject self sign-ups, edit roles/departments/managers, reset passwords, deactivate staff. The last active administrator cannot be demoted or deactivated.

**Leave types** — change allowances, carry-over caps, paid/unpaid status, counting mode and colours. Setting days to blank makes a type unlimited. New allowances apply to future accrual runs; adjust the current year under Accruals.

**Accruals** — pick a year and run accrual to create missing entitlements for active staff. Proration uses the employee's start date; unused days from the previous year carry over up to each type's cap. "Recalculate existing" overwrites manual edits. You can also edit entitled days and carry-over per employee directly in the grid.

**Reports** — active headcount, pending requests, people on leave today, approved days by type and status, plus CSV downloads for leave requests and leave balances.

**Settings** — change the company name shown in the sidebar and on sign-in. The policy summary and day-counting notes update automatically.

## Data and reset

All data lives in `server/data/leavedesk.db` (SQLite, WAL mode). It is not committed to version control.

To wipe everything and reseed the demo data, stop the server and delete the database files:

```bash
rm -f server/data/leavedesk.db server/data/leavedesk.db-wal server/data/leavedesk.db-shm
```

The next start recreates the schema, seed users, leave types, holidays and demo requests.

To back up, copy `leavedesk.db` while the server is stopped (or use SQLite's backup tooling).

## Project structure

```
server/
  index.js          Express app, static client hosting, error handling
  db.js             SQLite schema and seed data
  auth.js           scrypt hashing, sessions, cookie helpers, role guards
  leaveLogic.js     date math, working-day counts, proration
  holidays.js       Ghana statutory holiday generation
  accrual.js        entitlements, balances, carry-over, accrual runs
  util.js           shared query/mapping/CSV helpers
  routes/           auth, employee/manager, admin endpoints
  tests/            node:test unit tests for leave logic
client/
  src/
    App.tsx         session bootstrap and page routing
    pages/          Login, Dashboard, MyRequests, Approvals, Calendar
    pages/admin/    People, LeaveTypes, Holidays, Accruals, Reports, Settings
    components/     Layout, RequestModal, shared UI and icons
    api.ts, dates.ts, types.ts
    styles.css      design system (green/gold/cream, responsive)
```

## API overview

All endpoints are under `/api`. Authentication is a session cookie; JSON errors use `{ "error": "..." }`.

- `POST /auth/login`, `POST /auth/register`, `POST /auth/logout`, `GET /auth/me`
- `GET /me/dashboard?year=`, `GET /me/requests?year=`, `POST /me/password`
- `GET /requestable-employees`, `GET /employees/:id/balances?year=`
- `GET /leave-types`, `GET /holidays?year=`
- `POST /requests` (optional `userId` for managers and administrators filing on behalf of staff), `POST /requests/:id/cancel`
- `GET /approvals`, `GET /approvals/history`, `POST /requests/:id/decision`
- `GET /calendar?month=YYYY-MM&scope=mine|team|all`
- `GET/POST/PATCH /admin/users`, `POST /admin/users/:id/reset-password`
- `GET/POST/PATCH /admin/leave-types`
- `GET/POST/DELETE /admin/holidays`, `POST /admin/holidays/generate`
- `GET/PUT /admin/entitlements`, `POST /admin/accrual`, `GET /admin/reports/summary`
- `GET /admin/reports/requests.csv?year=`, `GET /admin/reports/balances.csv?year=`
- `GET/PUT /admin/settings`

## Tests

```bash
npm test
```

Covers Easter calculation, statutory holiday generation, working-day counting, half days, calendar-day mode, proration and date helpers.

## Notes for production

- Serve over HTTPS and keep the SQLite file on a backed-up volume.
- This is a single-node app. For multiple server instances or very large teams, move the database to PostgreSQL and use a shared session store instead of the local session table.
- Set a process manager (systemd, pm2, Docker) to keep `npm start` running and restart on boot.
- The seeded demo accounts exist only to make the first run explorable — change the passwords or deactivate them before real use.

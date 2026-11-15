import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../api';
import { formatDate, formatShort, formatWeekday, pluralDays } from '../dates';
import type { Balance, DashboardData, User } from '../types';
import type { PageKey } from '../components/Layout';
import { RequestModal } from '../components/RequestModal';
import {
  Avatar,
  EmptyState,
  ErrorNote,
  Icon,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  useToast,
} from '../components/ui';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function BalanceCard({ balance, onRequest }: { balance: Balance; onRequest: () => void }) {
  const total = (balance.entitled ?? 0) + balance.carryover;
  const used = balance.approved + balance.pending;
  const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const metaParts: string[] = [];
  if (!balance.unlimited) {
    metaParts.push(`${balance.entitled ?? 0} entitled`);
    if (balance.carryover > 0) metaParts.push(`${balance.carryover} carried over`);
    if (balance.approved > 0) metaParts.push(`${balance.approved} used`);
    if (balance.pending > 0) metaParts.push(`${balance.pending} pending`);
  }
  return (
    <article
      className="balance-card"
      style={{ '--accent': balance.color } as CSSProperties}
    >
      <div className="balance-head">
        <span className="balance-name">
          <span className="balance-dot" />
          {balance.name}
        </span>
        <span className={`pay-tag ${balance.paid ? '' : 'pay-tag-unpaid'}`}>
          {balance.paid ? 'Paid' : 'Unpaid'}
        </span>
      </div>
      <div className="balance-number">
        {balance.unlimited ? (
          <span className="balance-infinity">Unlimited</span>
        ) : (
          <>
            {balance.available}
            <small>days</small>
          </>
        )}
      </div>
      <span className="balance-caption">
        {balance.unlimited ? 'Approval required, no fixed allowance' : 'available to book'}
      </span>
      {!balance.unlimited ? (
        <div className="balance-meter" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <div className="balance-meta">
        <span>{metaParts.length ? metaParts.join(' · ') : 'No activity yet'}</span>
        <button type="button" className="link-btn" onClick={onRequest}>
          Request <Icon name="plus" size={14} />
        </button>
      </div>
    </article>
  );
}

export function DashboardPage({
  user,
  onNavigate,
}: {
  user: User;
  onNavigate: (page: PageKey) => void;
}) {
  const notify = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const [initialTypeId, setInitialTypeId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const dashboard = await api.get<DashboardData>(`/me/dashboard?year=${year}`);
      setData(dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const leaveTypes = useMemo(
    () =>
      (data?.balances ?? []).map((balance) => ({
        id: balance.leaveTypeId,
        code: balance.code,
        name: balance.name,
        daysPerYear: balance.daysPerYear,
        countMode: balance.countMode,
        paid: balance.paid,
        carryoverCap: balance.carryoverCap,
        color: balance.color,
        description: balance.description,
        active: true,
      })),
    [data],
  );

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];
  const annual = data?.balances.find((balance) => balance.code === 'ANNUAL');
  const canApprove = user.role === 'manager' || user.role === 'admin';

  function openRequest(typeId?: number) {
    setInitialTypeId(typeId ?? null);
    setRequestOpen(true);
  }

  return (
    <div className="page">
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={
          <>
            {formatDate(new Date().toISOString().slice(0, 10))} ·{' '}
            {data?.manager ? `You report to ${data.manager.name}.` : 'Here is your leave at a glance.'}
          </>
        }
        actions={
          <>
            <select
              className="year-select"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              aria-label="Leave year"
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openRequest()}
              disabled={!data}
            >
              <Icon name="plus" size={18} /> Request leave
            </button>
          </>
        }
      />

      {error ? (
        <ErrorNote>
          {error}{' '}
          <button type="button" className="link-btn" onClick={() => void load()}>
            Try again
          </button>
        </ErrorNote>
      ) : null}

      {loading && !data ? <LoadingBlock label="Loading your leave…" /> : null}

      {data ? (
        <>
          {canApprove && data.pendingApprovalsCount > 0 ? (
            <div className="attention-banner">
              <span className="attention-icon">
                <Icon name="clock" size={20} />
              </span>
              <div>
                <strong>
                  {data.pendingApprovalsCount} request
                  {data.pendingApprovalsCount === 1 ? '' : 's'} waiting for your approval
                </strong>
                <span>
                  {data.pendingApprovals
                    .slice(0, 2)
                    .map((request) => request.userName.split(' ')[0])
                    .join(', ')}
                  {data.pendingApprovalsCount > 2 ? ' and others' : ''}
                </span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('approvals')}>
                Review requests <Icon name="arrowRight" size={16} />
              </button>
            </div>
          ) : null}

          <section className="balance-grid" aria-label="Leave balances">
            {data.balances.map((balance) => (
              <BalanceCard
                key={balance.leaveTypeId}
                balance={balance}
                onRequest={() => openRequest(balance.leaveTypeId)}
              />
            ))}
          </section>

          <div className="dashboard-columns">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Recent requests</h2>
                  <p>Your latest leave activity in {year}.</p>
                </div>
                <button type="button" className="link-btn" onClick={() => onNavigate('requests')}>
                  View all <Icon name="arrowRight" size={15} />
                </button>
              </div>
              {data.recentRequests.length === 0 ? (
                <EmptyState
                  title="No requests yet"
                  hint="When you book leave it will appear here."
                  action={
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openRequest()}>
                      Request leave
                    </button>
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentRequests.map((request) => (
                        <tr key={request.id}>
                          <td>
                            <span className="type-cell">
                              <span className="type-dot" style={{ background: request.color }} />
                              {request.leaveType}
                            </span>
                          </td>
                          <td className="nowrap">
                            {formatShort(request.startDate)}
                            {request.startDate !== request.endDate
                              ? ` – ${formatShort(request.endDate)}`
                              : ''}
                          </td>
                          <td>{pluralDays(request.days)}</td>
                          <td>
                            <StatusBadge status={request.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="dashboard-aside">
              <section className="card holiday-card">
                <div className="card-head">
                  <div>
                    <h2>Upcoming holidays</h2>
                    <p>Ghana public holidays.</p>
                  </div>
                  <span className="card-icon">
                    <Icon name="holidays" size={18} />
                  </span>
                </div>
                {data.upcomingHolidays.length === 0 ? (
                  <p className="muted">No upcoming holidays on record.</p>
                ) : (
                  <ul className="holiday-list">
                    {data.upcomingHolidays.map((holiday) => {
                      const date = new Date(`${holiday.date}T00:00:00Z`);
                      return (
                        <li key={holiday.id}>
                          <span className="holiday-date">
                            <strong>{date.getUTCDate()}</strong>
                            <small>
                              {new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(date)}
                            </small>
                          </span>
                          <span className="holiday-body">
                            <strong>{holiday.name}</strong>
                            <small>{formatWeekday(holiday.date)}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {annual && !annual.unlimited ? (
                <section className="card annual-card">
                  <span className="eyebrow">Annual leave</span>
                  <div className="annual-value">
                    {annual.available}
                    <small>days left</small>
                  </div>
                  <p>
                    {annual.entitled} entitled
                    {annual.carryover > 0 ? ` + ${annual.carryover} carried over` : ''} ·{' '}
                    {annual.pending > 0 ? `${annual.pending} pending` : 'nothing pending'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onNavigate('calendar')}
                  >
                    Open team calendar <Icon name="calendar" size={16} />
                  </button>
                </section>
              ) : null}

              {canApprove && data.pendingApprovalsCount > 0 ? (
                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2>Awaiting you</h2>
                      <p>Requests from your team.</p>
                    </div>
                    <span className="count-pill">{data.pendingApprovalsCount}</span>
                  </div>
                  <ul className="approval-mini-list">
                    {data.pendingApprovals.map((request) => (
                      <li key={request.id}>
                        <Avatar name={request.userName} size="sm" />
                        <div>
                          <strong>{request.userName.split(' ')[0]}</strong>
                          <small>
                            {request.leaveType} · {pluralDays(request.days)}
                          </small>
                        </div>
                        <span className="approval-mini-date">{formatShort(request.startDate)}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-block"
                    onClick={() => onNavigate('approvals')}
                  >
                    Go to approvals
                  </button>
                </section>
              ) : null}
            </aside>
          </div>

          <RequestModal
            open={requestOpen}
            onClose={() => setRequestOpen(false)}
            onCreated={() => {
              void load();
              notify('Your leave balance has been updated.');
            }}
            leaveTypes={leaveTypes}
            balances={data.balances}
            initialTypeId={initialTypeId}
            onReviewRequests={() => {
              setRequestOpen(false);
              onNavigate('requests');
            }}
          />
        </>
      ) : null}
    </div>
  );
}

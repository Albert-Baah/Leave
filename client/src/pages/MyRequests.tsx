import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { formatRange, formatShort, pluralDays } from '../dates';
import type { Balance, DashboardData, LeaveRequest, LeaveType, RequestStatus } from '../types';
import { RequestModal } from '../components/RequestModal';
import {
  EmptyState,
  ErrorNote,
  Icon,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  useToast,
} from '../components/ui';

const filters: { key: 'all' | RequestStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function MyRequestsPage() {
  const notify = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [filter, setFilter] = useState<'all' | RequestStatus>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const [initialTypeId, setInitialTypeId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, dashboard] = await Promise.all([
        api.get<{ requests: LeaveRequest[] }>(`/me/requests?year=${year}`),
        api.get<DashboardData>(`/me/dashboard?year=${year}`),
      ]);
      setRequests(list.requests);
      setBalances(dashboard.balances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your leave requests.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const leaveTypes: LeaveType[] = useMemo(
    () =>
      balances.map((balance) => ({
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
    [balances],
  );

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: requests.length };
    for (const request of requests) {
      result[request.status] = (result[request.status] ?? 0) + 1;
    }
    return result;
  }, [requests]);

  const visible = useMemo(
    () => (filter === 'all' ? requests : requests.filter((request) => request.status === filter)),
    [requests, filter],
  );

  async function cancelRequest(request: LeaveRequest) {
    if (!window.confirm(`Cancel your ${request.leaveType.toLowerCase()} request for ${formatRange(request.startDate, request.endDate)}?`)) {
      return;
    }
    try {
      await api.post(`/requests/${request.id}/cancel`);
      notify('Leave request cancelled.');
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to cancel the request.', 'error');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="My leave"
        subtitle="Every request, balance and decision in one place."
        actions={
          <>
            <select
              className="year-select"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              aria-label="Leave year"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setInitialTypeId(null);
                setRequestOpen(true);
              }}
              disabled={!leaveTypes.length}
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

      <div className="filter-bar">
        <div className="filter-pills" role="tablist" aria-label="Filter requests">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={`filter-pill ${filter === item.key ? 'active' : ''}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              {counts[item.key] ? <span>{counts[item.key]}</span> : null}
            </button>
          ))}
        </div>
        <span className="filter-note">
          {visible.length} request{visible.length === 1 ? '' : 's'} in {year}
        </span>
      </div>

      {loading ? <LoadingBlock label="Loading requests…" /> : null}

      {!loading && visible.length === 0 ? (
        <div className="card">
          <EmptyState
            title={filter === 'all' ? 'No leave requests yet' : `No ${filter} requests`}
            hint={
              filter === 'all'
                ? 'Book annual leave, sick days or time off — your balances update automatically.'
                : 'Try a different filter or request leave.'
            }
            action={
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setInitialTypeId(null);
                  setRequestOpen(true);
                }}
              >
                Request leave
              </button>
            }
          />
        </div>
      ) : null}

      {!loading && visible.length > 0 ? (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Leave type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <span className="type-cell">
                        <span className="type-dot" style={{ background: request.color }} />
                        {request.leaveType}
                      </span>
                      {request.reason ? <span className="cell-sub">{request.reason}</span> : null}
                    </td>
                    <td>
                      <span className="nowrap">{formatRange(request.startDate, request.endDate)}</span>
                      <span className="cell-sub">
                        {request.halfDay ? 'Half day' : `${request.countMode === 'calendar' ? 'Calendar' : 'Working'} days`}
                      </span>
                    </td>
                    <td className="nowrap">{pluralDays(request.days)}</td>
                    <td>
                      <StatusBadge status={request.status} />
                      <span className="cell-sub">
                        {request.status === 'pending'
                          ? 'With your manager'
                          : request.decidedByName
                            ? `By ${request.decidedByName}`
                            : '—'}
                      </span>
                      {request.decisionComment ? (
                        <span className="cell-sub cell-comment">“{request.decisionComment}”</span>
                      ) : null}
                    </td>
                    <td className="nowrap muted">{formatShort(request.createdAt.slice(0, 10))}</td>
                    <td className="cell-actions">
                      {request.status === 'pending' ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void cancelRequest(request)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <RequestModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onCreated={() => void load()}
        leaveTypes={leaveTypes}
        balances={balances}
        initialTypeId={initialTypeId}
        onReviewRequests={() => setRequestOpen(false)}
      />
    </div>
  );
}

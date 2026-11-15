import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { ReportSummary, RequestStatus } from '../../types';
import {
  ErrorNote,
  Icon,
  LoadingBlock,
  PageHeader,
} from '../../components/ui';

const statusOrder: { key: RequestStatus; label: string }[] = [
  { key: 'approved', label: 'Approved' },
  { key: 'pending', label: 'Pending' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<ReportSummary>(`/admin/reports/summary?year=${year}`);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load report data.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const approvedDays = summary?.byStatus.approved?.days ?? 0;
  const maxTypeDays = Math.max(1, ...(summary?.daysByType.map((item) => item.days) ?? [1]));

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Company leave activity, ready for HR reviews and payroll."
        actions={
          <select
            className="year-select"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="Report year"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
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

      {loading && !summary ? <LoadingBlock label="Building your report…" /> : null}

      {summary ? (
        <>
          <section className="stat-grid">
            <article className="stat-card">
              <span className="stat-label">Active staff</span>
              <strong>{summary.headcount}</strong>
              <span className="stat-note">accounts with access</span>
            </article>
            <article className="stat-card">
              <span className="stat-label">Pending requests</span>
              <strong>{summary.pending}</strong>
              <span className="stat-note">awaiting a manager</span>
            </article>
            <article className="stat-card">
              <span className="stat-label">On leave today</span>
              <strong>{summary.onLeaveToday}</strong>
              <span className="stat-note">approved leave</span>
            </article>
            <article className="stat-card stat-card-accent">
              <span className="stat-label">Approved days</span>
              <strong>{approvedDays}</strong>
              <span className="stat-note">booked in {year}</span>
            </article>
          </section>

          <div className="report-columns">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Approved days by leave type</h2>
                  <p>{year} totals across the company.</p>
                </div>
              </div>
              {summary.daysByType.length === 0 ? (
                <p className="muted">No approved leave for {year} yet.</p>
              ) : (
                <ul className="type-bars">
                  {summary.daysByType.map((item) => (
                    <li key={item.name}>
                      <div className="type-bar-head">
                        <span>
                          <span className="type-dot" style={{ background: item.color }} />
                          {item.name}
                        </span>
                        <strong>
                          {item.days} day{item.days === 1 ? '' : 's'} · {item.requests} request
                          {item.requests === 1 ? '' : 's'}
                        </strong>
                      </div>
                      <div className="type-bar">
                        <span
                          style={{
                            width: `${Math.max(4, (item.days / maxTypeDays) * 100)}%`,
                            background: item.color,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Requests by status</h2>
                  <p>The full {year} pipeline.</p>
                </div>
              </div>
              <ul className="status-breakdown">
                {statusOrder.map((item) => {
                  const value = summary.byStatus[item.key];
                  return (
                    <li key={item.key}>
                      <span className={`status status-${item.key}`}>{item.label}</span>
                      <strong>{value?.count ?? 0}</strong>
                      <span className="muted">{value?.days ?? 0} days</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <section className="card download-card">
            <div>
              <h2>Download reports</h2>
              <p>
                CSV files open in Excel, Google Sheets or your payroll tool. Totals are limited to{' '}
                {year}.
              </p>
            </div>
            <div className="download-actions">
              <a className="btn btn-secondary" href={`/api/admin/reports/requests.csv?year=${year}`}>
                <Icon name="download" size={18} /> Leave requests CSV
              </a>
              <a className="btn btn-secondary" href={`/api/admin/reports/balances.csv?year=${year}`}>
                <Icon name="download" size={18} /> Leave balances CSV
              </a>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

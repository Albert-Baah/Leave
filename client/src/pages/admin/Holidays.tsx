import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { formatDate, formatWeekday } from '../../dates';
import type { Holiday } from '../../types';
import {
  EmptyState,
  ErrorNote,
  Field,
  Icon,
  InfoNote,
  LoadingBlock,
  PageHeader,
  useToast,
} from '../../components/ui';

export function HolidaysPage() {
  const notify = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<{ holidays: Holiday[] }>(`/admin/holidays?year=${year}`);
      setHolidays(result.holidays);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load public holidays.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    try {
      const result = await api.post<{ added: number }>('/admin/holidays/generate', { year });
      notify(
        result.added === 0
          ? `All statutory holidays for ${year} are already on record.`
          : `${result.added} statutory holiday${result.added === 1 ? '' : 's'} added for ${year}.`,
      );
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to generate holidays.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function addHoliday() {
    if (!date || !name.trim()) {
      notify('Choose a date and enter a name.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post('/admin/holidays', { date, name });
      notify('Holiday added. New leave requests will exclude that date.');
      setDate('');
      setName('');
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to add the holiday.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeHoliday(holiday: Holiday) {
    if (!window.confirm(`Remove ${holiday.name} on ${formatDate(holiday.date)}?`)) return;
    try {
      await api.del(`/admin/holidays/${holiday.id}`);
      notify('Holiday removed.');
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to remove the holiday.', 'error');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Public holidays"
        subtitle="Ghana statutory holidays are excluded when counting working-day leave."
        actions={
          <>
            <select
              className="year-select"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              aria-label="Holiday year"
            >
              {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={() => void generate()} disabled={busy}>
              <Icon name="holidays" size={18} /> Generate statutory
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

      <div className="admin-columns">
        <section className="card card-flush">
          <div className="card-head card-head-padded">
            <div>
              <h2>{year} holidays</h2>
              <p>{holidays.length} dates on record.</p>
            </div>
          </div>
          {loading ? (
            <LoadingBlock label="Loading holidays…" />
          ) : holidays.length === 0 ? (
            <EmptyState
              icon="holidays"
              title="No holidays for this year"
              hint="Generate the statutory list, then add any company-specific days."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Holiday</th>
                    <th>Weekday</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((holiday) => (
                    <tr key={holiday.id}>
                      <td className="nowrap">{formatDate(holiday.date)}</td>
                      <td>{holiday.name}</td>
                      <td>{formatWeekday(holiday.date)}</td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => void removeHoliday(holiday)}
                          aria-label={`Remove ${holiday.name}`}
                          title="Remove holiday"
                        >
                          <Icon name="trash" size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Add a holiday</h2>
                <p>Company days or observed dates.</p>
              </div>
            </div>
            <div className="stack">
              <Field label="Date">
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              <Field label="Name">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Company Founders’ Day"
                />
              </Field>
              <button type="button" className="btn btn-primary btn-block" onClick={() => void addHoliday()} disabled={busy}>
                Add holiday
              </button>
            </div>
          </section>

          <InfoNote>
            Eid al-Fitr and Eid al-Adha depend on moon sighting. Seeded dates are published
            estimates — confirm and adjust them each year. Changes apply to new leave requests;
            requests already submitted keep their recorded day counts.
          </InfoNote>
        </aside>
      </div>
    </div>
  );
}

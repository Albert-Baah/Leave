import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../api';
import {
  currentMonth,
  formatRange,
  firstName,
  formatWeekday,
  monthGrid,
  monthTitle,
  shiftMonth,
  todayISO,
} from '../dates';
import type { CalendarData, LeaveRequest, LeaveType, User } from '../types';
import {
  EmptyState,
  ErrorNote,
  Icon,
  LoadingBlock,
  Modal,
  PageHeader,
  StatusBadge,
} from '../components/ui';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function eventStyle(color: string): CSSProperties {
  return {
    '--event-color': color,
  } as CSSProperties;
}

export function CalendarPage({ user }: { user: User }) {
  const [month, setMonth] = useState(currentMonth());
  const [scope, setScope] = useState<'mine' | 'team' | 'all'>(
    user.role === 'admin' ? 'all' : user.role === 'manager' ? 'team' : 'mine',
  );
  const [data, setData] = useState<CalendarData | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<LeaveRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const calendar = await api.get<CalendarData>(`/calendar?month=${month}&scope=${scope}`);
      setData(calendar);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the calendar.');
    } finally {
      setLoading(false);
    }
  }, [month, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .get<{ leaveTypes: LeaveType[] }>('/leave-types')
      .then((result) => setLeaveTypes(result.leaveTypes))
      .catch(() => setLeaveTypes([]));
  }, []);

  const cells = useMemo(() => monthGrid(month), [month]);
  const today = todayISO();

  const holidayMap = useMemo(
    () => new Map((data?.holidays ?? []).map((holiday) => [holiday.date, holiday.name])),
    [data],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    for (const event of data?.events ?? []) {
      for (const cell of cells) {
        if (cell.iso >= event.startDate && cell.iso <= event.endDate) {
          const list = map.get(cell.iso) ?? [];
          list.push(event);
          map.set(cell.iso, list);
        }
      }
    }
    return map;
  }, [data, cells]);

  const scopeOptions: { key: 'mine' | 'team' | 'all'; label: string }[] = [
    { key: 'mine', label: 'My leave' },
    ...(user.role === 'manager' ? [{ key: 'team' as const, label: 'Team' }] : []),
    ...(user.role === 'admin' ? [{ key: 'all' as const, label: 'Everyone' }] : []),
  ];

  return (
    <div className="page">
      <PageHeader
        title="Team calendar"
        subtitle="See who is away and plan around each other."
        actions={
          <div className="month-nav">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((value) => shiftMonth(value, -1))}
              aria-label="Previous month"
            >
              <Icon name="chevronLeft" size={18} />
            </button>
            <strong>{monthTitle(month)}</strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMonth((value) => shiftMonth(value, 1))}
              aria-label="Next month"
            >
              <Icon name="chevronRight" size={18} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMonth(currentMonth())}>
              Today
            </button>
          </div>
        }
      />

      <div className="calendar-toolbar">
        {scopeOptions.length > 1 ? (
          <div className="segmented" role="group" aria-label="Calendar scope">
            {scopeOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={scope === option.key ? 'active' : ''}
                onClick={() => setScope(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="muted">Showing your own leave</span>
        )}
        <div className="calendar-legend">
          {leaveTypes.map((type) => (
            <span key={type.id} className="legend-item">
              <span className="type-dot" style={{ background: type.color }} />
              {type.name}
            </span>
          ))}
          <span className="legend-item legend-pending">
            <span className="legend-dash" /> Pending
          </span>
        </div>
      </div>

      {error ? (
        <ErrorNote>
          {error}{' '}
          <button type="button" className="link-btn" onClick={() => void load()}>
            Try again
          </button>
        </ErrorNote>
      ) : null}

      {loading && !data ? <LoadingBlock label="Loading calendar…" /> : null}

      {data ? (
        <section className={`card calendar-card ${loading ? 'is-loading' : ''}`}>
          <div className="calendar-scroll">
            <div className="calendar-grid">
              {weekdays.map((day) => (
                <div key={day} className="calendar-weekday">
                  {day}
                </div>
              ))}
              {cells.map((cell) => {
                const events = cell.inMonth ? eventsByDay.get(cell.iso) ?? [] : [];
                const holiday = holidayMap.get(cell.iso);
                const isToday = cell.iso === today;
                return (
                  <div
                    key={cell.iso}
                    className={[
                      'calendar-day',
                      cell.inMonth ? '' : 'outside',
                      isToday ? 'today' : '',
                      holiday ? 'holiday' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="calendar-day-head">
                      <span>{Number(cell.iso.slice(8, 10))}</span>
                      {isToday ? <em>Today</em> : null}
                    </div>
                    {holiday ? <div className="calendar-holiday">{holiday}</div> : null}
                    <div className="calendar-events">
                      {events.slice(0, 3).map((event) => (
                        <button
                          key={`${event.id}-${cell.iso}`}
                          type="button"
                          className={`calendar-event ${event.status === 'pending' ? 'event-pending' : ''}`}
                          style={eventStyle(event.color)}
                          onClick={() => setSelected(event)}
                          title={`${event.userName} · ${event.leaveType} · ${formatRange(
                            event.startDate,
                            event.endDate,
                          )}`}
                        >
                          <span>
                            {scope !== 'mine' ? `${firstName(event.userName)} · ` : ''}
                            {event.leaveType}
                          </span>
                        </button>
                      ))}
                      {events.length > 3 ? (
                        <span className="calendar-more" title={events.map((event) => event.userName).join(', ')}>
                          +{events.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {data && data.events.length === 0 && !loading ? (
        <div className="calendar-empty-note">
          <EmptyState
            icon="calendar"
            title="Nobody is on leave this month"
            hint="Approved and pending requests will show up here automatically."
          />
        </div>
      ) : null}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? selected.leaveType : 'Leave details'}
        subtitle={selected ? `${selected.userName} · ${selected.department ?? 'No department'}` : undefined}
        footer={
          <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
            Close
          </button>
        }
      >
        {selected ? (
          <div className="stack">
            <div className="detail-row">
              <span>Dates</span>
              <strong>{formatRange(selected.startDate, selected.endDate)}</strong>
            </div>
            <div className="detail-row">
              <span>Duration</span>
              <strong>
                {selected.days} {selected.days === 1 ? 'day' : 'days'}
                {selected.halfDay ? ' (half day)' : ''}
              </strong>
            </div>
            <div className="detail-row">
              <span>Status</span>
              <StatusBadge status={selected.status} />
            </div>
            <div className="detail-row">
              <span>First day</span>
              <strong>{formatWeekday(selected.startDate)}</strong>
            </div>
            {selected.reason ? (
              <div className="detail-block">
                <span>Reason</span>
                <p>{selected.reason}</p>
              </div>
            ) : null}
            {selected.handover ? (
              <div className="detail-block">
                <span>Handover</span>
                <p>{selected.handover}</p>
              </div>
            ) : null}
            {selected.decidedByName ? (
              <div className="detail-row">
                <span>Decision</span>
                <strong>{selected.decidedByName}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

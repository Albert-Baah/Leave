import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import {
  addDays,
  countLeaveDays,
  eachDay,
  formatRange,
  todayISO,
} from '../dates';
import type { Balance, Holiday, LeaveRequest, LeaveType } from '../types';
import { ErrorNote, Field, Icon, InfoNote, Modal, useToast } from './ui';

type Conflict = {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
};

type EmployeeOption = {
  id: number;
  name: string;
  department: string | null;
};

function conflictFrom(error: unknown): Conflict | null {
  if (!(error instanceof ApiError) || !error.data || typeof error.data !== 'object') return null;
  const conflict = (error.data as { conflict?: unknown }).conflict;
  if (!conflict || typeof conflict !== 'object') return null;
  return conflict as Conflict;
}

export function RequestModal({
  open,
  onClose,
  onCreated,
  leaveTypes,
  balances,
  initialTypeId = null,
  onReviewRequests,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  leaveTypes: LeaveType[];
  balances: Balance[];
  initialTypeId?: number | null;
  onReviewRequests?: () => void;
}) {
  const notify = useToast();
  const [typeId, setTypeId] = useState<number>(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [handover, setHandover] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [targetBalances, setTargetBalances] = useState<Balance[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setTypeId(initialTypeId ?? leaveTypes[0]?.id ?? 0);
    setStartDate('');
    setEndDate('');
    setHalfDay(false);
    setReason('');
    setHandover('');
    setError('');
    setConflict(null);
    setBusy(false);
    setEmployees([]);
    setTargetId(null);
    setTargetBalances(null);
  }, [open, initialTypeId, leaveTypes]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    api
      .get<{ employees: EmployeeOption[] }>('/requestable-employees')
      .then((data) => {
        if (active) setEmployees(data.employees);
      })
      .catch(() => {
        if (active) setEmployees([]);
      });
    return () => {
      active = false;
    };
  }, [open]);

  function clearFeedback() {
    setError('');
    setConflict(null);
  }

  const showEmployeePicker = employees.length > 1;
  const effectiveBalances = showEmployeePicker ? targetBalances ?? [] : balances;
  const selectedType = leaveTypes.find((type) => type.id === typeId) ?? null;
  const balance = effectiveBalances.find((item) => item.leaveTypeId === typeId) ?? null;
  const today = todayISO();
  const startYear = startDate ? startDate.slice(0, 4) : today.slice(0, 4);

  useEffect(() => {
    if (!open || !showEmployeePicker || targetId == null) {
      setTargetBalances(null);
      return;
    }
    let active = true;
    api
      .get<{ balances: Balance[] }>(`/employees/${targetId}/balances?year=${startYear}`)
      .then((data) => {
        if (active) setTargetBalances(data.balances);
      })
      .catch(() => {
        if (active) setTargetBalances(null);
      });
    return () => {
      active = false;
    };
  }, [open, showEmployeePicker, targetId, startYear]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    api
      .get<{ holidays: Holiday[] }>(`/holidays?year=${startYear}`)
      .then((data) => {
        if (active) setHolidays(new Set(data.holidays.map((holiday) => holiday.date)));
      })
      .catch(() => {
        if (active) setHolidays(new Set());
      });
    return () => {
      active = false;
    };
  }, [open, startYear]);

  useEffect(() => {
    if (halfDay && (startDate !== endDate || selectedType?.countMode !== 'working')) {
      setHalfDay(false);
    }
  }, [halfDay, startDate, endDate, selectedType?.countMode]);

  const preview = useMemo(() => {
    if (!selectedType || !startDate || !endDate) return 0;
    return countLeaveDays(
      startDate,
      endDate,
      holidays,
      selectedType.countMode,
      halfDay,
    );
  }, [selectedType, startDate, endDate, holidays, halfDay]);

  const excludedHolidays = useMemo(() => {
    if (!startDate || !endDate || selectedType?.countMode !== 'working') return 0;
    return eachDay(startDate, endDate).filter((day) => holidays.has(day)).length;
  }, [startDate, endDate, holidays, selectedType?.countMode]);

  const minDate =
    selectedType?.code === 'SICK' ? addDays(today, -14) : today;
  const maxDate = addDays(today, 400);
  const canHalfDay = Boolean(
    selectedType?.countMode === 'working' && startDate && startDate === endDate,
  );
  const remaining =
    balance && !balance.unlimited && preview > 0 ? Number(balance.available ?? 0) - preview : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    if (showEmployeePicker && targetId == null) {
      setError('Choose the employee this leave is for.');
      return;
    }
    if (!selectedType) {
      setError('Choose a leave type.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Choose the first and last day of leave.');
      return;
    }
    if (preview <= 0) {
      setError('That range has no chargeable working days. Pick different dates.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ request: LeaveRequest; autoApproved: boolean }>('/requests', {
        typeId,
        startDate,
        endDate,
        halfDay,
        reason,
        handover,
        userId: showEmployeePicker ? targetId : undefined,
      });
      const targetName = employees.find((employee) => employee.id === targetId)?.name;
      let message = 'Leave request submitted for approval.';
      if (result.autoApproved) {
        message = 'Leave recorded and auto-approved as an administrator.';
      } else if (showEmployeePicker && targetName) {
        message = `Leave request for ${targetName} submitted for approval.`;
      }
      notify(message);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit the request.');
      setConflict(conflictFrom(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request leave"
      subtitle="Weekends and Ghana public holidays are excluded from working-day leave."
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="leave-request-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit request'}
          </button>
        </>
      }
    >
      <form id="leave-request-form" onSubmit={submit} className="stack">
        {error ? (
          <ErrorNote>
            {error}
            {conflict?.status === 'pending' && onReviewRequests ? (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={onReviewRequests}>
                  Review my requests
                </button>
              </>
            ) : null}
          </ErrorNote>
        ) : null}
        {showEmployeePicker ? (
          <Field label="Employee" hint="Who is this leave for?">
            <select
              value={targetId ?? ''}
              onChange={(event) => {
                setTargetId(event.target.value ? Number(event.target.value) : null);
                clearFeedback();
              }}
            >
              <option value="">Choose an employee…</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                  {employee.department ? ` · ${employee.department}` : ''}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Leave type">
          <select
            value={typeId}
            onChange={(event) => {
              setTypeId(Number(event.target.value));
              clearFeedback();
            }}
          >
            {leaveTypes.map((type) => {
              const item = effectiveBalances.find((entry) => entry.leaveTypeId === type.id);
              const availability = !showEmployeePicker || targetId != null
                ? item?.unlimited
                  ? 'no fixed limit'
                  : `${item?.available ?? 0} days available`
                : 'select an employee';
              return (
                <option key={type.id} value={type.id}>
                  {type.name} — {availability}
                </option>
              );
            })}
          </select>
        </Field>

        <div className="field-row">
          <Field label="First day">
            <input
              type="date"
              value={startDate}
              min={minDate}
              max={maxDate}
              onChange={(event) => {
                const value = event.target.value;
                setStartDate(value);
                if (!endDate || endDate < value) setEndDate(value);
                clearFeedback();
              }}
            />
          </Field>
          <Field label="Last day">
            <input
              type="date"
              value={endDate}
              min={startDate || minDate}
              max={maxDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                clearFeedback();
              }}
            />
          </Field>
        </div>

        {canHalfDay ? (
          <label className="check-line">
            <input
              type="checkbox"
              checked={halfDay}
              onChange={(event) => {
                setHalfDay(event.target.checked);
                clearFeedback();
              }}
            />
            <span>
              Half day <small>Deducts 0.5 day for this single date.</small>
            </span>
          </label>
        ) : null}

        {selectedType?.code === 'SICK' ? (
          <InfoNote>Sick leave can be backdated by up to 14 days.</InfoNote>
        ) : null}

        <Field label="Reason" hint="Optional, but useful for your manager.">
          <textarea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Family visit in Kumasi"
          />
        </Field>
        <Field label="Handover notes" hint="Who covers your work while you are away?">
          <textarea
            rows={2}
            maxLength={500}
            value={handover}
            onChange={(event) => setHandover(event.target.value)}
            placeholder="e.g. Efua will manage the weekly report"
          />
        </Field>

        <div className="request-preview">
          <div className="preview-icon">
            <Icon name="calendar" size={22} />
          </div>
          <div className="preview-main">
            <strong>
              {startDate && endDate
                ? `${preview} ${preview === 1 ? 'day' : 'days'} · ${formatRange(startDate, endDate)}`
                : 'Pick your dates to see the duration'}
            </strong>
            <span>
              {selectedType?.countMode === 'calendar'
                ? 'Calendar days, including weekends.'
                : 'Working days, excluding weekends and public holidays.'}
              {excludedHolidays > 0
                ? ` ${excludedHolidays} public holiday${excludedHolidays === 1 ? '' : 's'} excluded.`
                : ''}
            </span>
          </div>
          {balance ? (
            <div className="preview-balance">
              {balance.unlimited ? (
                <span>Unlimited</span>
              ) : (
                <>
                  <strong>{Math.max(0, Number(balance.available ?? 0))}</strong>
                  <span>available now</span>
                  {remaining != null ? <small>{remaining} after this request</small> : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

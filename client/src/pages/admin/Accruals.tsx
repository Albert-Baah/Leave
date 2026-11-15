import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatDate } from '../../dates';
import type { EntitlementData, EntitlementRow, EntitlementType } from '../../types';
import {
  Avatar,
  EmptyState,
  ErrorNote,
  InfoNote,
  LoadingBlock,
  PageHeader,
  useToast,
} from '../../components/ui';

type Draft = { entitled: string; carryover: string };

function keyOf(userId: number, typeId: number) {
  return `${userId}:${typeId}`;
}

function buildDrafts(data: EntitlementData): Record<string, Draft> {
  const drafts: Record<string, Draft> = {};
  for (const row of data.rows) {
    drafts[keyOf(row.userId, row.typeId)] = {
      entitled: row.entitledDays == null ? '' : String(row.entitledDays),
      carryover: row.carryoverDays == null ? '' : String(row.carryoverDays),
    };
  }
  return drafts;
}

type Group = {
  userId: number;
  userName: string;
  department: string | null;
  startDate: string;
  rows: { type: EntitlementType; row: EntitlementRow }[];
};

export function AccrualsPage() {
  const notify = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<EntitlementData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<EntitlementData>(`/admin/entitlements?year=${year}`);
      setData(result);
      setDrafts(buildDrafts(result));
      setDirty(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load entitlements.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    const typesById = new Map(data.types.map((type) => [type.id, type]));
    const map = new Map<number, Group>();
    for (const row of data.rows) {
      const type = typesById.get(row.typeId);
      if (!type) continue;
      let group = map.get(row.userId);
      if (!group) {
        group = {
          userId: row.userId,
          userName: row.userName,
          department: row.department,
          startDate: row.startDate,
          rows: [],
        };
        map.set(row.userId, group);
      }
      group.rows.push({ type, row });
    }
    return [...map.values()];
  }, [data]);

  function updateDraft(row: EntitlementRow, field: keyof Draft, value: string) {
    const key = keyOf(row.userId, row.typeId);
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
    setDirty((current) => new Set(current).add(key));
  }

  function availableFor(row: EntitlementRow) {
    const draft = drafts[keyOf(row.userId, row.typeId)];
    const entitled = Number(draft?.entitled || 0);
    const carryover = Number(draft?.carryover || 0);
    return Math.round((entitled + carryover - row.approvedDays) * 2) / 2;
  }

  async function save() {
    if (!data || dirty.size === 0) return;
    setSaving(true);
    try {
      const items = [...dirty].map((key) => {
        const [userId, typeId] = key.split(':').map(Number);
        const draft = drafts[key];
        return {
          userId,
          typeId,
          entitledDays: Number(draft?.entitled || 0),
          carryoverDays: Number(draft?.carryover || 0),
        };
      });
      await api.put('/admin/entitlements', { year, items });
      notify('Entitlements saved.');
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to save entitlements.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runYearAccrual() {
    setRunning(true);
    try {
      const result = await api.post<{ created: number; updated: number }>('/admin/accrual', {
        year,
        overwrite,
      });
      notify(
        `Accrual for ${year}: ${result.created} created, ${result.updated} recalculated.`,
      );
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to run accruals.', 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Accruals & entitlements"
        subtitle="Review yearly allowances, carry-over and per-employee adjustments."
        actions={
          <select
            className="year-select"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="Accrual year"
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

      <section className="card accrual-runner">
        <div>
          <h2>Yearly accrual</h2>
          <p>
            Creates missing {year} entitlements for active staff. Days are prorated from each
            employee’s start date, and unused days carry over up to each leave type’s cap.
          </p>
        </div>
        <div className="accrual-runner-actions">
          <label className="check-line">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
            />
            <span>
              Recalculate existing
              <small>Overwrites manual edits for {year}.</small>
            </span>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => void runYearAccrual()} disabled={running}>
            {running ? 'Running…' : `Run accrual for ${year}`}
          </button>
        </div>
      </section>

      {loading ? <LoadingBlock label="Loading entitlements…" /> : null}

      {!loading && data && data.types.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No fixed-allowance leave types"
            hint="Unlimited leave types do not need entitlements. Add or edit a leave type first."
          />
        </div>
      ) : null}

      {!loading && data && data.types.length > 0 ? (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table entitlement-table">
              <thead>
                <tr>
                  <th>Leave type</th>
                  <th>Entitled days</th>
                  <th>Carry-over</th>
                  <th>Approved</th>
                  <th>Available</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.userId}>
                  <tr className="ent-group">
                    <td colSpan={5}>
                      <span className="ent-group-inner">
                        <Avatar name={group.userName} size="sm" />
                        <strong>{group.userName}</strong>
                        <span>{group.department ?? 'No department'}</span>
                        <span className="ent-group-meta">Started {formatDate(group.startDate)}</span>
                      </span>
                    </td>
                  </tr>
                  {group.rows.map(({ type, row }) => {
                    const key = keyOf(row.userId, row.typeId);
                    const draft = drafts[key] ?? { entitled: '', carryover: '' };
                    const available = availableFor(row);
                    return (
                      <tr key={key}>
                        <td>
                          <span className="type-cell">
                            <span className="type-dot" style={{ background: type.color }} />
                            {type.name}
                            <small className="ent-unit">
                              {type.countMode === 'calendar' ? 'calendar' : 'working'}
                            </small>
                          </span>
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            type="number"
                            min="0"
                            max="365"
                            step="0.5"
                            value={draft.entitled}
                            placeholder={String(type.daysPerYear)}
                            onChange={(event) => updateDraft(row, 'entitled', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            type="number"
                            min="0"
                            max="60"
                            step="0.5"
                            value={draft.carryover}
                            placeholder="0"
                            onChange={(event) => updateDraft(row, 'carryover', event.target.value)}
                          />
                        </td>
                        <td className="muted">{row.approvedDays}</td>
                        <td className={available < 0 ? 'negative' : 'positive'}>{available}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </section>
      ) : null}

      <InfoNote>
        Unlimited leave types are not listed here. Editing a balance affects all new requests and
        approvals immediately; already-approved leave is not recalculated.
      </InfoNote>

      {dirty.size > 0 ? (
        <div className="save-bar">
          <span>
            {dirty.size} unsaved change{dirty.size === 1 ? '' : 's'}
          </span>
          <div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (data) {
                  setDrafts(buildDrafts(data));
                  setDirty(new Set());
                }
              }}
            >
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

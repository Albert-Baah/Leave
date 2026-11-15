import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api';
import type { CountMode, LeaveType } from '../../types';
import {
  ErrorNote,
  Field,
  Icon,
  InfoNote,
  LoadingBlock,
  Modal,
  PageHeader,
  useToast,
} from '../../components/ui';

type Editor = { type: LeaveType } | { type: null } | null;

const blankForm = {
  name: '',
  daysPerYear: '15',
  countMode: 'working' as CountMode,
  paid: true,
  carryoverCap: '0',
  color: '#177245',
  description: '',
  active: true,
};

export function LeaveTypesPage() {
  const notify = useToast();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<{ leaveTypes: LeaveType[] }>('/admin/leave-types');
      setTypes(result.leaveTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load leave types.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditor({ type: null });
    setForm(blankForm);
    setFormError('');
  }

  function openEdit(type: LeaveType) {
    setEditor({ type });
    setForm({
      name: type.name,
      daysPerYear: type.daysPerYear == null ? '' : String(type.daysPerYear),
      countMode: type.countMode,
      paid: type.paid,
      carryoverCap: String(type.carryoverCap),
      color: type.color,
      description: type.description ?? '',
      active: type.active,
    });
    setFormError('');
  }

  async function save() {
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Enter a name for the leave type.');
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name,
      daysPerYear: form.daysPerYear.trim() === '' ? null : Number(form.daysPerYear),
      countMode: form.countMode,
      paid: form.paid,
      carryoverCap: Number(form.carryoverCap || 0),
      color: form.color,
      description: form.description,
      active: form.active,
    };
    try {
      if (editor && 'type' in editor && editor.type) {
        await api.patch(`/admin/leave-types/${editor.type.id}`, payload);
        notify('Leave type updated.');
      } else {
        await api.post('/admin/leave-types', payload);
        notify('Leave type created. Run accruals to add it to this year’s balances.');
      }
      setEditor(null);
      void load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save the leave type.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(type: LeaveType) {
    if (type.active && !window.confirm(`Deactivate ${type.name}? It will no longer be requestable, but existing requests stay intact.`)) {
      return;
    }
    try {
      await api.patch(`/admin/leave-types/${type.id}`, { active: !type.active });
      notify(`${type.name} ${type.active ? 'deactivated' : 'activated'}.`);
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update the leave type.', 'error');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Leave types"
        subtitle="Set allowances, carry-over caps and how each type is counted."
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Icon name="plus" size={18} /> Add leave type
          </button>
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

      {loading ? <LoadingBlock label="Loading leave types…" /> : null}

      {!loading ? (
        <div className="type-grid">
          {types.map((type) => (
            <article
              key={type.id}
              className={`card type-card ${type.active ? '' : 'type-inactive'}`}
              style={{ '--accent': type.color } as CSSProperties}
            >
              <div className="type-card-head">
                <span className="type-swatch" />
                <div>
                  <strong>{type.name}</strong>
                  <small>{type.code}</small>
                </div>
                <span className={`status ${type.active ? 'status-approved' : 'status-cancelled'}`}>
                  {type.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="type-allowance">
                {type.daysPerYear == null ? (
                  <strong>Unlimited</strong>
                ) : (
                  <>
                    <strong>{type.daysPerYear}</strong>
                    <span>
                      {type.countMode === 'calendar' ? 'calendar' : 'working'} days / year
                    </span>
                  </>
                )}
              </div>
              <div className="type-facts">
                <span>{type.paid ? 'Paid leave' : 'Unpaid leave'}</span>
                <span>
                  {type.carryoverCap > 0 ? `Up to ${type.carryoverCap} days carried over` : 'No carry-over'}
                </span>
              </div>
              {type.description ? <p className="type-description">{type.description}</p> : null}
              <div className="type-card-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(type)}>
                  Edit
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggle(type)}>
                  {type.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <InfoNote>
        The seeded policy follows Ghana’s Labour Act 2003 (Act 651): at least 15 working days of
        annual leave and 12 weeks of maternity leave. Sick and paternity rules are company policy
        defaults — edit them to match your staff handbook. Changing an allowance updates future
        accruals; adjust current entitlements under Accruals.
      </InfoNote>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor && 'type' in editor && editor.type ? 'Edit leave type' : 'Add leave type'}
        subtitle="These settings shape how leave is counted and accrued."
        wide
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditor(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save leave type'}
            </button>
          </>
        }
      >
        <div className="stack">
          {formError ? <ErrorNote>{formError}</ErrorNote> : null}
          <div className="field-row">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. Study Leave"
              />
            </Field>
            <Field label="Colour" hint="Used across balances and the team calendar.">
              <span className="color-field">
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) => setForm({ ...form, color: event.target.value })}
                />
                <span>{form.color}</span>
              </span>
            </Field>
          </div>
          <div className="field-row">
            <Field label="Days per year" hint="Leave blank for unlimited time off.">
              <input
                type="number"
                min="0"
                max="365"
                step="0.5"
                value={form.daysPerYear}
                onChange={(event) => setForm({ ...form, daysPerYear: event.target.value })}
                placeholder="Unlimited"
              />
            </Field>
            <Field label="Counted in">
              <select
                value={form.countMode}
                onChange={(event) => setForm({ ...form, countMode: event.target.value as CountMode })}
              >
                <option value="working">Working days (Mon–Fri, excluding holidays)</option>
                <option value="calendar">Calendar days (including weekends)</option>
              </select>
            </Field>
          </div>
          <div className="field-row">
            <Field label="Carry-over cap" hint="Maximum unused days carried into the next year.">
              <input
                type="number"
                min="0"
                max="60"
                step="0.5"
                value={form.carryoverCap}
                onChange={(event) => setForm({ ...form, carryoverCap: event.target.value })}
              />
            </Field>
            <div className="field">
              <span className="field-label">Options</span>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={(event) => setForm({ ...form, paid: event.target.checked })}
                />
                <span>Paid leave</span>
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                />
                <span>Available for new requests</span>
              </label>
            </div>
          </div>
          <Field label="Description" hint="Shown to admins as policy context. Optional.">
            <textarea
              rows={2}
              maxLength={300}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="e.g. Encouraged for professional development."
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

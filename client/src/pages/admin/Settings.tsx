import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api';
import type { LeaveType } from '../../types';
import {
  ErrorNote,
  Field,
  Icon,
  InfoNote,
  LoadingBlock,
  PageHeader,
  useToast,
} from '../../components/ui';

export function SettingsPage() {
  const notify = useToast();
  const [companyName, setCompanyName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [settings, leaveTypes] = await Promise.all([
        api.get<{ companyName: string }>('/admin/settings'),
        api.get<{ leaveTypes: LeaveType[] }>('/admin/leave-types'),
      ]);
      setCompanyName(settings.companyName);
      setSavedName(settings.companyName);
      setTypes(leaveTypes.leaveTypes.filter((type) => type.active));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.put<{ companyName: string }>('/admin/settings', {
        companyName,
      });
      setSavedName(result.companyName);
      notify('Settings saved. The workspace name updates after your next sign-in.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to save settings.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        subtitle="Workspace details and policy reference."
        actions={
          <button
            type="submit"
            form="settings-form"
            className="btn btn-primary"
            disabled={busy || !companyName.trim() || companyName === savedName}
          >
            {busy ? 'Saving…' : 'Save changes'}
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

      {loading ? <LoadingBlock label="Loading settings…" /> : null}

      {!loading ? (
        <div className="admin-columns">
          <div className="stack">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Workspace</h2>
                  <p>Shown in the sidebar and on sign-in.</p>
                </div>
              </div>
              <form id="settings-form" onSubmit={save} className="stack">
                <Field label="Company name">
                  <input
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    maxLength={80}
                    placeholder="e.g. FarmPadi Ltd"
                  />
                </Field>
              </form>
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Current leave policy</h2>
                  <p>Defaults follow Ghana’s Labour Act 2003 (Act 651) where applicable.</p>
                </div>
                <span className="card-icon">
                  <Icon name="holidays" size={18} />
                </span>
              </div>
              <ul className="policy-list">
                {types.map((type) => (
                  <li key={type.id}>
                    <span className="type-dot" style={{ background: type.color }} />
                    <div>
                      <strong>{type.name}</strong>
                      <small>
                        {type.daysPerYear == null
                          ? 'Unlimited, subject to approval'
                          : `${type.daysPerYear} ${type.countMode === 'calendar' ? 'calendar' : 'working'} days per year`}
                        {type.carryoverCap > 0 ? ` · up to ${type.carryoverCap} carried over` : ''}
                      </small>
                    </div>
                    <span className={`pay-tag ${type.paid ? '' : 'pay-tag-unpaid'}`}>
                      {type.paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </li>
                ))}
              </ul>
              <InfoNote>
                Annual, sick and paternity entitlements are company-configurable. Update them under
                Leave types; use Accruals to adjust the current year.
              </InfoNote>
            </section>
          </div>

          <aside className="stack">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Data & security</h2>
                  <p>How this workspace is protected.</p>
                </div>
                <span className="card-icon">
                  <Icon name="lock" size={18} />
                </span>
              </div>
              <ul className="security-list">
                <li>
                  <strong>Local-first storage</strong>
                  <span>All data lives in server/data/leavedesk.db on this machine.</span>
                </li>
                <li>
                  <strong>Hashed passwords</strong>
                  <span>Passwords use salted scrypt hashing, never plain text.</span>
                </li>
                <li>
                  <strong>7-day sessions</strong>
                  <span>Session cookies are HTTP-only; signing out ends the session.</span>
                </li>
                <li>
                  <strong>Role-based access</strong>
                  <span>Employees see their own leave; managers see their team; admins manage all.</span>
                </li>
              </ul>
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Good to know</h2>
                  <p>Day counting rules.</p>
                </div>
              </div>
              <ul className="plain-list">
                <li>Working-day leave skips weekends and Ghana public holidays.</li>
                <li>Maternity leave counts calendar days (12 weeks = 84 days).</li>
                <li>Half days deduct 0.5 from the balance.</li>
                <li>Pending requests reserve days until they are approved or rejected.</li>
                <li>Administrators’ own requests are auto-approved for audit clarity.</li>
              </ul>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

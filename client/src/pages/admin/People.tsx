import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatDate, todayISO } from '../../dates';
import type { Role, User } from '../../types';
import {
  Avatar,
  ErrorNote,
  Field,
  Icon,
  InfoNote,
  LoadingBlock,
  Modal,
  PageHeader,
  useToast,
} from '../../components/ui';

type Editor =
  | { mode: 'create' }
  | { mode: 'edit'; user: User }
  | null;

const roleLabels: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  employee: 'Employee',
};

const emptyForm = {
  name: '',
  email: '',
  role: 'employee' as Role,
  department: '',
  managerId: '',
  startDate: todayISO(),
  password: 'Welcome@123',
  active: true,
};

export function PeoplePage() {
  const notify = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<{ users: User[] }>('/admin/users');
      setUsers(result.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the staff directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const managerOptions = useMemo(
    () =>
      users.filter(
        (user) =>
          user.active &&
          (user.role === 'manager' || user.role === 'admin') &&
          (!editor || editor.mode === 'create' || user.id !== editor.user.id),
      ),
    [users, editor],
  );

  const pendingCount = users.filter((user) => user.pending).length;

  function openCreate() {
    setEditor({ mode: 'create' });
    setForm(emptyForm);
    setFormError('');
  }

  function openEdit(user: User) {
    setEditor({ mode: 'edit', user });
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department ?? '',
      managerId: user.managerId ? String(user.managerId) : '',
      startDate: user.startDate,
      password: '',
      active: user.active,
    });
    setFormError('');
  }

  async function save() {
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Enter the employee’s full name.');
      return;
    }
    if (!form.email.trim()) {
      setFormError('Enter a work email address.');
      return;
    }
    if (editor?.mode === 'create' && form.password.length < 8) {
      setFormError('The temporary password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (editor?.mode === 'create') {
        await api.post('/admin/users', {
          name: form.name,
          email: form.email,
          role: form.role,
          department: form.department,
          managerId: form.managerId ? Number(form.managerId) : null,
          startDate: form.startDate,
          password: form.password,
        });
        notify(`${form.name.split(' ')[0]} has been added. Leave balances were created automatically.`);
      } else if (editor?.mode === 'edit') {
        await api.patch(`/admin/users/${editor.user.id}`, {
          name: form.name,
          email: form.email,
          role: form.role,
          department: form.department,
          managerId: form.managerId ? Number(form.managerId) : null,
          startDate: form.startDate,
          active: form.active,
        });
        notify('Employee details updated.');
      }
      setEditor(null);
      void load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save the employee.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: User) {
    const action = user.active ? 'deactivate' : 'activate';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Activate'} ${user.name}?`)) return;
    try {
      await api.patch(`/admin/users/${user.id}`, { active: !user.active });
      notify(`Account ${action}d.`);
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update the account.', 'error');
    }
  }

  async function approveUser(user: User) {
    if (!window.confirm(`Approve ${user.name}’s account? They will be able to sign in and use their leave balances.`)) {
      return;
    }
    try {
      await api.patch(`/admin/users/${user.id}`, { active: true });
      notify(`${user.name.split(' ')[0]}’s account approved. Leave balances were created.`);
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to approve the account.', 'error');
    }
  }

  async function rejectUser(user: User) {
    if (!window.confirm(`Reject ${user.name}’s sign-up request? The account stays inactive.`)) return;
    try {
      await api.patch(`/admin/users/${user.id}`, { active: false });
      notify('Sign-up request declined.');
      void load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to decline the request.', 'error');
    }
  }

  async function savePassword() {
    if (!resetTarget) return;
    setResetError('');
    if (resetPassword.length < 8) {
      setResetError('The password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/admin/users/${resetTarget.id}/password`, { password: resetPassword });
      notify(`Password reset for ${resetTarget.name}. Their other sessions were signed out.`);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Unable to reset the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="People"
        subtitle="Manage staff accounts, roles and reporting lines."
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Icon name="plus" size={18} /> Add employee
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

      {pendingCount > 0 ? (
        <InfoNote>
          {pendingCount} sign-up request{pendingCount === 1 ? '' : 's'} waiting for approval. Pending
          accounts cannot sign in — use Approve to activate one.
        </InfoNote>
      ) : null}

      {loading ? <LoadingBlock label="Loading the staff directory…" /> : null}

      {!loading ? (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Line manager</th>
                  <th>Start date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={user.pending ? 'row-pending' : user.active ? '' : 'row-muted'}>
                    <td>
                      <span className="person-cell">
                        <Avatar name={user.name} size="sm" />
                        <span>
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`role-tag role-${user.role}`}>{roleLabels[user.role]}</span>
                    </td>
                    <td>{user.department || '—'}</td>
                    <td>{user.managerName || '—'}</td>
                    <td className="nowrap">{formatDate(user.startDate)}</td>
                    <td>
                      <span
                        className={`status ${
                          user.pending ? 'status-pending' : user.active ? 'status-approved' : 'status-cancelled'
                        }`}
                      >
                        {user.pending ? 'Pending approval' : user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="cell-actions">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => openEdit(user)}
                          title={`Edit ${user.name}`}
                          aria-label={`Edit ${user.name}`}
                        >
                          <Icon name="edit" size={17} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => {
                            setResetTarget(user);
                            setResetPassword('');
                            setResetError('');
                          }}
                          title={`Reset password for ${user.name}`}
                          aria-label={`Reset password for ${user.name}`}
                        >
                          <Icon name="key" size={17} />
                        </button>
                        {user.pending ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void approveUser(user)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void rejectUser(user)}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void toggleActive(user)}
                          >
                            {user.active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <InfoNote>
        New employees receive prorated leave balances for the current year automatically. Edit those
        under Admin → Accruals if you need a different starting entitlement.
      </InfoNote>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? 'Edit employee' : 'Add employee'}
        subtitle="Accounts are created locally — no email invitation is sent."
        wide
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditor(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : editor?.mode === 'edit' ? 'Save changes' : 'Create account'}
            </button>
          </>
        }
      >
        <div className="stack">
          {formError ? <ErrorNote>{formError}</ErrorNote> : null}
          <div className="field-row">
            <Field label="Full name">
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. Ama Serwaa"
              />
            </Field>
            <Field label="Work email">
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="ama@company.com"
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Role">
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
            <Field label="Department">
              <input
                value={form.department}
                onChange={(event) => setForm({ ...form, department: event.target.value })}
                placeholder="e.g. Operations"
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Line manager" hint="Approves this employee’s leave requests.">
              <select
                value={form.managerId}
                onChange={(event) => setForm({ ...form, managerId: event.target.value })}
              >
                <option value="">No manager (admin queue)</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} · {roleLabels[manager.role]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Employment start date" hint="Used to prorate the first year’s leave.">
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            </Field>
          </div>
          {editor?.mode === 'create' ? (
            <Field label="Temporary password" hint="At least 8 characters. Share it securely.">
              <input
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </Field>
          ) : (
            <label className="check-line">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              <span>
                Account active <small>Inactive staff cannot sign in.</small>
              </span>
            </label>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title="Reset password"
        subtitle={resetTarget ? `${resetTarget.name} · ${resetTarget.email}` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setResetTarget(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void savePassword()} disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </>
        }
      >
        <div className="stack">
          {resetError ? <ErrorNote>{resetError}</ErrorNote> : null}
          <InfoNote>This signs the employee out on all devices. Share the new password securely.</InfoNote>
          <Field label="New password" hint="At least 8 characters.">
            <input
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              placeholder="Temporary password"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

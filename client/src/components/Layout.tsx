import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { Role, User } from '../types';
import { Brand } from './Brand';
import { useToast, Avatar, Field, Icon, Modal, type IconName } from './ui';

export type PageKey =
  | 'dashboard'
  | 'requests'
  | 'approvals'
  | 'calendar'
  | 'people'
  | 'types'
  | 'holidays'
  | 'accruals'
  | 'reports'
  | 'settings';

type NavItem = { key: PageKey; label: string; icon: IconName };

const mainNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'requests', label: 'My leave', icon: 'leave' },
  { key: 'approvals', label: 'Approvals', icon: 'check' },
  { key: 'calendar', label: 'Team calendar', icon: 'calendar' },
];

const adminNav: NavItem[] = [
  { key: 'people', label: 'People', icon: 'users' },
  { key: 'types', label: 'Leave types', icon: 'types' },
  { key: 'holidays', label: 'Public holidays', icon: 'holidays' },
  { key: 'accruals', label: 'Accruals', icon: 'accrual' },
  { key: 'reports', label: 'Reports', icon: 'reports' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

const roleLabels: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  employee: 'Employee',
};

export function Layout({
  user,
  companyName,
  page,
  onNavigate,
  onLogout,
  children,
}: {
  user: User;
  companyName: string;
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState(false);
  const notify = useToast();

  const navItems = mainNav.filter((item) => item.key !== 'approvals' || user.role !== 'employee');

  useEffect(() => {
    setMenuOpen(false);
  }, [page]);

  async function changePassword() {
    setPasswordError('');
    if (newPassword.length < 8) {
      setPasswordError('The new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/me/password', { currentPassword, newPassword });
      notify('Your password has been updated.');
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unable to change your password.');
    } finally {
      setBusy(false);
    }
  }

  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  function NavList({ items }: { items: NavItem[] }) {
    return (
      <nav className="nav-list">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${page === item.key ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <div className="app-shell">
      {menuOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Brand light />
          <button
            type="button"
            className="icon-btn sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="workspace-chip">
          <span className="workspace-dot" />
          <div>
            <small>Workspace</small>
            <strong>{companyName}</strong>
          </div>
        </div>
        <div className="sidebar-nav">
          <span className="nav-eyebrow">Workspace</span>
          <NavList items={navItems} />
          {user.role === 'admin' ? (
            <>
              <span className="nav-eyebrow">Administration</span>
              <NavList items={adminNav} />
            </>
          ) : null}
        </div>
        <div className="sidebar-user">
          <Avatar name={user.name} size="md" />
          <div className="sidebar-user-text">
            <strong>{user.name}</strong>
            <small>{roleLabels[user.role]}</small>
          </div>
          <button
            type="button"
            className="icon-btn sidebar-user-btn"
            onClick={() => setPasswordOpen(true)}
            aria-label="Change password"
            title="Change password"
          >
            <Icon name="key" size={17} />
          </button>
          <button
            type="button"
            className="icon-btn sidebar-user-btn"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn topbar-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="topbar-context">
            <small>{companyName}</small>
            <span>{today}</span>
          </div>
          <div className="topbar-user" onClick={() => setPasswordOpen(true)} role="button" tabIndex={0}>
            <Avatar name={user.name} size="sm" />
            <span>{user.name.split(' ')[0]}</span>
            <Icon name="chevronRight" size={15} />
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change your password"
        subtitle="Other devices signed in with this account will be signed out."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPasswordOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={changePassword} disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </>
        }
      >
        <div className="stack">
          {passwordError ? <div className="error-note">{passwordError}</div> : null}
          <Field label="Current password">
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

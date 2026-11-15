import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Session } from '../types';
import { Brand } from '../components/Brand';
import { ErrorNote, Icon, InfoNote } from '../components/ui';
import { todayISO } from '../dates';

const demoAccounts = [
  {
    label: 'Employee',
    name: 'Ama Serwaa',
    email: 'employee@leavedesk.app',
    password: 'Employee@123',
  },
  {
    label: 'Manager',
    name: 'Kwame Mensah',
    email: 'manager@leavedesk.app',
    password: 'Manager@123',
  },
  {
    label: 'Admin',
    name: 'Akosua Frimpong',
    email: 'admin@leavedesk.app',
    password: 'Admin@123',
  },
];

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [signupSuccess, setSignupSuccess] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        const result = await api.post<{ message: string }>('/auth/register', {
          name,
          email,
          department,
          startDate,
          password,
        });
        setSignupSuccess(result.message);
        setPassword('');
        return;
      }
      const session = await api.post<Session>('/auth/login', { email, password });
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'signup' ? 'Unable to create the account.' : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  function useDemo(account: (typeof demoAccounts)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
  }

  function switchMode(next: 'signin' | 'signup') {
    setMode(next);
    setError('');
    setSignupSuccess('');
    setPassword('');
  }

  return (
    <div className="login-shell">
      <section className="login-brand">
        <div className="login-brand-top">
          <Brand light />
        </div>
        <div className="login-brand-copy">
          <span className="eyebrow">Built for Ghanaian teams</span>
          <h1>Time off, handled properly.</h1>
          <p>
            Plan leave, approve requests and keep public holidays in sync — one calm place for your
            whole team.
          </p>
          <ul className="brand-points">
            <li>
              <Icon name="calendar" size={18} /> Working-day balances that skip weekends and holidays
            </li>
            <li>
              <Icon name="check" size={18} /> Clear manager approvals with a full audit trail
            </li>
            <li>
              <Icon name="holidays" size={18} /> Ghana statutory holidays built in, editable by HR
            </li>
          </ul>
        </div>
        <div className="login-brand-foot">
          <div className="quote-mark">“</div>
          <p>A rested team is a productive team. Keep the process fair, visible and simple.</p>
          <span>Act 651 defaults · FarmPadi Ltd</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-heading">
            {signupSuccess ? (
              <>
                <span className="eyebrow">Request received</span>
                <h2>Account created</h2>
                <p>An administrator will review it before your first sign-in.</p>
              </>
            ) : mode === 'signin' ? (
              <>
                <span className="eyebrow">Welcome back</span>
                <h2>Sign in to LeaveDesk</h2>
                <p>Use your work email. New to the team? Create an account below.</p>
              </>
            ) : (
              <>
                <span className="eyebrow">Join the workspace</span>
                <h2>Create your account</h2>
                <p>An administrator approves new accounts before first sign-in.</p>
              </>
            )}
          </div>

          {signupSuccess ? (
            <div className="stack">
              <InfoNote>{signupSuccess}</InfoNote>
              <p className="auth-note">
                You signed up with <strong>{email}</strong>. An administrator can approve it under
                People. Your leave balances are created when the account is activated.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => switchMode('signin')}
              >
                Back to sign in <Icon name="arrowRight" size={18} />
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="stack">
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              {mode === 'signup' ? (
                <label className="field">
                  <span className="field-label">Full name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Ama Serwaa"
                    autoComplete="name"
                    required
                  />
                </label>
              ) : null}
              <label className="field">
                <span className="field-label">Work email</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </label>
              {mode === 'signup' ? (
                <>
                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Department</span>
                      <input
                        value={department}
                        onChange={(event) => setDepartment(event.target.value)}
                        placeholder="e.g. Operations"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Employment start date</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span className="field-label">Password</span>
                    <span className="password-wrap">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="At least 8 characters"
                        minLength={8}
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </span>
                  </label>
                </>
              ) : (
                <label className="field">
                  <span className="field-label">Password</span>
                  <span className="password-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </span>
                </label>
              )}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Sign in'}
                {!busy ? <Icon name="arrowRight" size={18} /> : null}
              </button>
            </form>
          )}

          <p className="auth-switch">
            {mode === 'signin' ? (
              <>
                New to LeaveDesk?{' '}
                <button type="button" className="link-btn" onClick={() => switchMode('signup')}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button type="button" className="link-btn" onClick={() => switchMode('signin')}>
                  Sign in
                </button>
              </>
            )}
          </p>

          {mode === 'signin' && !signupSuccess ? (
            <div className="demo-block">
              <div className="demo-heading">
                <span>Explore the demo</span>
                <span className="demo-tag">No data leaves this computer</span>
              </div>
              <div className="demo-grid">
                {demoAccounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="demo-account"
                    onClick={() => useDemo(account)}
                  >
                    <span className={`demo-role demo-role-${account.label.toLowerCase()}`}>
                      {account.label}
                    </span>
                    <strong>{account.name}</strong>
                    <small>{account.email}</small>
                    <small className="demo-password">{account.password}</small>
                  </button>
                ))}
              </div>
              <p className="demo-hint">Tap an account to fill the form, then press Sign in.</p>
            </div>
          ) : null}
        </div>
        <p className="login-foot">LeaveDesk · A local-first leave manager for Ghanaian companies</p>
      </section>
    </div>
  );
}

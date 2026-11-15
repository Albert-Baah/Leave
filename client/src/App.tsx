import { useEffect, useState } from 'react';
import { api } from './api';
import type { Session } from './types';
import { Brand } from './components/Brand';
import { Layout, type PageKey } from './components/Layout';
import { ToastProvider } from './components/ui';
import { Login } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { MyRequestsPage } from './pages/MyRequests';
import { ApprovalsPage } from './pages/Approvals';
import { CalendarPage } from './pages/Calendar';
import { PeoplePage } from './pages/admin/People';
import { LeaveTypesPage } from './pages/admin/LeaveTypes';
import { HolidaysPage } from './pages/admin/Holidays';
import { AccrualsPage } from './pages/admin/Accruals';
import { ReportsPage } from './pages/admin/Reports';
import { SettingsPage } from './pages/admin/Settings';

const adminPages: PageKey[] = ['people', 'types', 'holidays', 'accruals', 'reports', 'settings'];

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [page, setPage] = useState<PageKey>('dashboard');

  useEffect(() => {
    api
      .get<Session>('/auth/me')
      .then((result) => setSession(result))
      .catch(() => setSession(null));
  }, []);

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // The session is cleared client-side even if the request fails.
    }
    setSession(null);
    setPage('dashboard');
  }

  function renderPage(user: Session['user']) {
    if (adminPages.includes(page) && user.role !== 'admin') return <DashboardPage user={user} onNavigate={setPage} />;
    switch (page) {
      case 'dashboard':
        return <DashboardPage user={user} onNavigate={setPage} />;
      case 'requests':
        return <MyRequestsPage />;
      case 'approvals':
        return <ApprovalsPage />;
      case 'calendar':
        return <CalendarPage user={user} />;
      case 'people':
        return <PeoplePage />;
      case 'types':
        return <LeaveTypesPage />;
      case 'holidays':
        return <HolidaysPage />;
      case 'accruals':
        return <AccrualsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage user={user} onNavigate={setPage} />;
    }
  }

  if (session === undefined) {
    return (
      <div className="boot-screen">
        <Brand />
        <span className="spinner" aria-label="Loading LeaveDesk" />
      </div>
    );
  }

  return (
    <ToastProvider>
      {session === null ? (
        <Login
          onLogin={(result) => {
            setSession(result);
            setPage('dashboard');
          }}
        />
      ) : (
        <Layout
          user={session.user}
          companyName={session.companyName}
          page={page}
          onNavigate={setPage}
          onLogout={() => void logout()}
        >
          {renderPage(session.user)}
        </Layout>
      )}
    </ToastProvider>
  );
}

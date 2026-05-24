import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { TicketsPage } from './pages/TicketsPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewTicketPage } from './pages/NewTicketPage';
import { fetchBootstrap, type BootstrapResponse } from './bootstrap';
import { personaStore } from './personaStore';

type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; data: BootstrapResponse }
  | { status: 'error'; message: string };

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    fetchBootstrap()
      .then((data) => {
        if (cancelled) {
          return;
        }
        if (!personaStore.getId() && data.defaultPersonaId) {
          personaStore.setId(data.defaultPersonaId);
        }
        setBootstrap({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load bootstrap';
        setBootstrap({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (bootstrap.status === 'loading') {
    return (
      <div className="app-shell">
        <div role="status" aria-live="polite" className="bootstrap-loading">
          Loading…
        </div>
      </div>
    );
  }

  if (bootstrap.status === 'error') {
    return (
      <div className="app-shell">
        <div role="alert" className="bootstrap-error">
          Failed to start: {bootstrap.message}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header initialUsers={bootstrap.data.users} />
      <main>
        <Routes>
          <Route path="/" element={<TicketsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tickets/new" element={<NewTicketPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}

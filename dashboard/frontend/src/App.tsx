import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Analysis } from './pages/Analysis';
import { Controls } from './pages/Controls';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
          <Navbar />
          <main className="max-w-[1400px] mx-auto px-5 py-5">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/controls" element={<Controls />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Navbar() {
  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-md border-b px-5"
      style={{
        background: 'rgba(8, 11, 18, 0.85)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-[1400px] mx-auto flex items-center h-12 gap-1">
        <div className="flex items-center gap-2.5 mr-6">
          <EvolutionIcon />
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            NeuroEvolve
          </span>
        </div>
        <NavTab to="/" label="Dashboard" end />
        <NavTab to="/analysis" label="Analysis" />
        <NavTab to="/controls" label="Controls" />
      </div>
    </nav>
  );
}

function NavTab({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative px-3 py-1 text-[13px] font-medium rounded-md transition-all duration-150 ${
          isActive
            ? 'text-white'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`
      }
      style={({ isActive }) =>
        isActive
          ? { background: 'var(--surface-3)' }
          : {}
      }
    >
      {label}
    </NavLink>
  );
}

function EvolutionIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="2.5" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx="6" cy="19" r="2.5" stroke="var(--green)" strokeWidth="1.5" />
      <circle cx="18" cy="19" r="2.5" stroke="var(--purple)" strokeWidth="1.5" />
      <path d="M12 7.5V12M12 12L7 16.5M12 12L17 16.5" stroke="var(--text-muted)" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="1.2" fill="var(--amber)" />
    </svg>
  );
}

export default App;

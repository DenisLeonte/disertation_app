import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Overview } from './pages/Overview';
import { Analysis } from './pages/Analysis';
import { RunControl } from './pages/RunControl';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 4000 } } });

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <header style={{
          borderBottom: '1px solid var(--border)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          height: 40,
          gap: 24,
          position: 'sticky',
          top: 0,
          background: 'var(--bg)',
          zIndex: 10,
        }}>
          <span className="mono bright" style={{ fontSize: 13, letterSpacing: '-0.02em' }}>
            neuroevolve
          </span>
          <nav style={{ display: 'flex', gap: 4 }}>
            <Tab to="/" end>overview</Tab>
            <Tab to="/analysis">analysis</Tab>
            <Tab to="/run">run</Tab>
          </nav>
        </header>
        <main style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/run" element={<RunControl />} />
          </Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Tab({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        padding: '4px 10px',
        fontSize: 12,
        color: isActive ? 'var(--text-bright)' : 'var(--text-dim)',
        background: isActive ? 'var(--bg-raised)' : 'transparent',
        borderRadius: 3,
        textDecoration: 'none',
        transition: 'color 0.1s',
      })}
    >
      {children}
    </NavLink>
  );
}

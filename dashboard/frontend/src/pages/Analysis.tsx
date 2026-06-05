import { useState } from 'react';
import {
  useSummary,
  useTrajectory,
  useChampionRegression,
  useDiversity,
  useClusters,
} from '../hooks/useQueries';

export function Analysis() {
  return (
    <div className="space-y-4">
      <SummaryCard />
      <TrajectoryCard />
      <ChampionRegressionCard />
      <DiversityCollapseCard />
      <ClustersCard />
    </div>
  );
}

function Panel({
  title,
  children,
  badge,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button
        className="w-full px-5 py-3.5 flex items-center justify-between text-left transition-colors"
        style={{ borderBottom: open ? '1px solid var(--border)' : 'none' }}
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <svg
            width="12" height="12" viewBox="0 0 12 12"
            className="transition-transform duration-200"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--text-muted)' }}
          >
            <path d="M4 2L8 6L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
        </div>
        {badge}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

function StatusBadge({ label, variant }: { label: string; variant: 'ok' | 'warn' | 'error' }) {
  const styles = {
    ok: { color: 'var(--green)', bg: 'rgba(63,185,80,0.08)', border: 'rgba(63,185,80,0.25)' },
    warn: { color: 'var(--amber)', bg: 'rgba(210,153,34,0.08)', border: 'rgba(210,153,34,0.25)' },
    error: { color: 'var(--red)', bg: 'rgba(248,81,73,0.08)', border: 'rgba(248,81,73,0.25)' },
  }[variant];
  return (
    <span className="badge" style={{ color: styles.color, background: styles.bg, borderColor: styles.border }}>
      {label}
    </span>
  );
}

function SummaryCard() {
  const { data, isLoading } = useSummary();
  if (isLoading) return <div className="card h-16 animate-pulse" />;
  if (!data) return null;

  return (
    <Panel title="Run Summary">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KV label="Generations" value={`${data.n_generations}`} sub={`gen ${data.gen_range[0]}–${data.gen_range[1]}`} />
        <KV label="Population" value={Array.isArray(data.pop_size) ? 'variable' : String(data.pop_size)} />
        <KV label="Total Rows" value={String(data.total_rows)} />
        <KV label="Schema" value={data.log_schema} />
        <KV label="Unique Archs" value={String(data.unique_archs)} />
      </div>
    </Panel>
  );
}

function TrajectoryCard() {
  const { data, isLoading } = useTrajectory();
  if (isLoading) return <div className="card h-16 animate-pulse" />;
  if (!data) return null;

  return (
    <Panel
      title="Best-Ever Trajectory"
      badge={
        data.stagnation >= 10
          ? <StatusBadge label={`${data.stagnation} gens stagnant`} variant="warn" />
          : <StatusBadge label="Healthy" variant="ok" />
      }
    >
      <div className="grid grid-cols-3 gap-4 mb-4">
        <KV label="Best Loss" value={data.best_ever.toFixed(6)} highlight />
        <KV label="Achieved" value={`Gen ${data.best_gen}`} sub={`indiv ${data.best_indiv}`} />
        <KV label="Stagnation" value={`${data.stagnation} gens`} />
      </div>
      <div className="terminal max-h-52 scrollbar-thin">
        {data.points.map(p => (
          <div key={p.generation} style={{ color: p.is_new_best ? 'var(--green)' : undefined }}>
            gen {String(p.generation).padStart(3)}: {p.best_so_far.toFixed(6)}
            {p.is_new_best && '  ← new best'}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ChampionRegressionCard() {
  const { data, isLoading } = useChampionRegression();
  if (isLoading) return <div className="card h-16 animate-pulse" />;
  if (!data) return null;

  return (
    <Panel
      title="Champion Regression"
      badge={
        data.count > 0
          ? <StatusBadge label={`${data.count} regression${data.count > 1 ? 's' : ''}`} variant="error" />
          : <StatusBadge label="Clean" variant="ok" />
      }
    >
      {data.count === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No champion regressions detected. The carried-over champion maintained or improved its loss across all generations.
        </p>
      ) : (
        <div className="space-y-1.5">
          {data.flagged.map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-[12px] metric-value" style={{ color: 'var(--red)' }}>
              <span style={{ color: 'var(--text-muted)' }}>gen {f.prev_gen}→{f.cur_gen}</span>
              <span>{f.prev_val.toFixed(5)} → {f.cur_val.toFixed(5)}</span>
              <span className="badge" style={{ color: 'var(--red)', background: 'rgba(248,81,73,0.08)', borderColor: 'rgba(248,81,73,0.25)' }}>
                +{f.delta.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function DiversityCollapseCard() {
  const { data, isLoading } = useDiversity();
  if (isLoading) return <div className="card h-16 animate-pulse" />;
  if (!data) return null;

  const hasCollapse = data.collapse_events.length > 0;

  return (
    <Panel
      title="Diversity Collapse"
      badge={
        hasCollapse
          ? <StatusBadge label={`${data.collapse_events.length} collapse${data.collapse_events.length > 1 ? 's' : ''}`} variant="warn" />
          : <StatusBadge label="Diverse" variant="ok" />
      }
    >
      {!hasCollapse ? (
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No sustained diversity collapse detected at the 60% threshold.
        </p>
      ) : (
        <div className="space-y-2">
          {data.collapse_events.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--amber)' }}>
              <svg width="14" height="14" viewBox="0 0 16 16">
                <path d="M8 1l7 13H1z" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Generations {e.start_gen}–{e.end_gen} ({e.length} gens): single architecture dominated the population
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ClustersCard() {
  const { data, isLoading } = useClusters();
  if (isLoading) return <div className="card h-16 animate-pulse" />;
  if (!data) return null;

  return (
    <Panel title={`Architecture Clusters — Gen ${data.final_generation}`}>
      {data.clusters.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No duplicate architectures in the final generation.
        </p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="px-4 py-2 text-left text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Count</th>
                <th className="px-4 py-2 text-left text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Spread</th>
                <th className="px-4 py-2 text-left text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Range</th>
                <th className="px-4 py-2 text-left text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Architecture</th>
              </tr>
            </thead>
            <tbody>
              {data.clusters.map((c, i) => (
                <tr key={i} className="table-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2.5 metric-value" style={{ color: 'var(--accent)' }}>x{c.count}</td>
                  <td className="px-4 py-2.5 metric-value" style={{ color: 'var(--text-secondary)' }}>{c.spread.toFixed(5)}</td>
                  <td className="px-4 py-2.5 metric-value text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    {c.min_val.toFixed(5)} – {c.max_val.toFixed(5)}
                  </td>
                  <td className="px-4 py-2.5 metric-value text-[11px] max-w-[320px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {c.architecture}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function KV({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`text-[15px] font-semibold ${highlight ? 'metric-value' : ''}`} style={{ color: highlight ? 'var(--green)' : 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

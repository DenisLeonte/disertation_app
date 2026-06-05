import { useStatus, useSummary, useTrajectory } from '../hooks/useQueries';

export function StatusBar() {
  const { data: status } = useStatus();
  const { data: summary } = useSummary();
  const { data: trajectory } = useTrajectory();

  if (!status) return <Skeleton />;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
      <Metric
        label="Generations"
        value={status.n_generations ?? 0}
        sub={status.has_checkpoint ? 'in progress' : 'complete'}
        color="blue"
      />
      <Metric
        label="Best Loss"
        value={status.best_ever?.toFixed(6) ?? '--'}
        sub={trajectory ? `gen ${trajectory.best_gen}` : ''}
        color="green"
        mono
      />
      <Metric
        label="Pop Size"
        value={status.pop_size ?? '--'}
        sub={`${summary?.unique_archs ?? '?'} unique archs`}
        color="purple"
      />
      <Metric
        label="Stagnation"
        value={trajectory?.stagnation ?? 0}
        sub="gens without improvement"
        color={trajectory && trajectory.stagnation >= 10 ? 'amber' : 'blue'}
      />
      <Metric
        label="Schema"
        value={summary?.log_schema === 'extended' ? 'Extended' : 'Legacy'}
        sub={`${summary?.total_rows ?? 0} total rows`}
        color="blue"
      />
    </div>
  );
}

function Metric({
  label, value, sub, color, mono,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: 'green' | 'blue' | 'amber' | 'purple' | 'red';
  mono?: boolean;
}) {
  const accents: Record<string, string> = {
    green: 'var(--green)',
    blue: 'var(--accent)',
    amber: 'var(--amber)',
    purple: 'var(--purple)',
    red: 'var(--red)',
  };
  const glows: Record<string, string> = {
    green: 'glow-green',
    blue: 'glow-blue',
    amber: 'glow-amber',
    purple: '',
    red: 'glow-red',
  };

  return (
    <div className={`card ${glows[color]} p-4`}>
      <div className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div
        className={`text-xl font-semibold leading-none ${mono ? 'metric-value' : ''}`}
        style={{ color: accents[color] }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card p-4 h-[88px] animate-pulse" />
      ))}
    </div>
  );
}

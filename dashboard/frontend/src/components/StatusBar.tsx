import { useStatus, useSummary } from '../hooks/useQueries';

export function StatusBar() {
  const { data: status } = useStatus();
  const { data: summary } = useSummary();

  if (!status) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Generations"
        value={status.n_generations ?? '-'}
      />
      <StatCard
        label="Best Val Loss"
        value={status.best_ever?.toFixed(6) ?? '-'}
        accent
      />
      <StatCard
        label="Population Size"
        value={status.pop_size ?? '-'}
      />
      <StatCard
        label="Unique Architectures"
        value={summary?.unique_archs ?? '-'}
      />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

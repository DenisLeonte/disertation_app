import { useMemo } from 'react';
import { useLogLatest } from '../hooks/useQueries';

const MUTATION_COLORS: Record<string, string> = {
  champion: 'var(--green)',
  weights: 'var(--accent)',
  add_layer: 'var(--purple)',
  remove_layer: 'var(--red)',
  resize_layer: 'var(--amber)',
};

export function MutationChart() {
  const { data: rows } = useLogLatest();

  const counts = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, number>();
    for (const r of rows) {
      const t = r.mutation_type ?? 'unknown';
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    const total = rows.length;
    return Array.from(map.entries())
      .map(([type, count]) => ({ type, count, pct: count / total }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  if (!counts.length) return null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Mutation Mix</span>
      </div>
      <div className="card-body space-y-2.5">
        {counts.map(({ type, count, pct }) => (
          <div key={type}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-medium" style={{ color: MUTATION_COLORS[type] ?? 'var(--text-secondary)' }}>
                {type.replace('_', ' ')}
              </span>
              <span className="metric-value text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {count} ({(pct * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-3)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct * 100}%`,
                  background: MUTATION_COLORS[type] ?? 'var(--text-muted)',
                  opacity: 0.7,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

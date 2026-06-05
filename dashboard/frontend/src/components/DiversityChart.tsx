import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useDiversity } from '../hooks/useQueries';

export function DiversityChart() {
  const { data, isLoading } = useDiversity();

  if (isLoading) return <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 h-[380px] animate-pulse" />;
  if (!data) return null;

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h2 className="text-lg font-semibold text-white mb-4">Architecture Diversity</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data.per_generation} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="generation" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
            labelStyle={{ color: '#e2e8f0' }}
            formatter={(value) => [String(value), 'Unique Archs']}
          />
          <Bar dataKey="unique_archs" name="Unique Archs" radius={[2, 2, 0, 0]}>
            {data.per_generation.map((entry, i) => (
              <Cell key={i} fill={entry.is_monoculture ? '#ef4444' : '#6366f1'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {data.collapse_events.length > 0 && (
        <div className="mt-2 text-sm text-amber-400">
          Diversity collapse detected: {data.collapse_events.map(e =>
            `gens ${e.start_gen}-${e.end_gen} (${e.length} gens)`
          ).join(', ')}
        </div>
      )}
    </div>
  );
}

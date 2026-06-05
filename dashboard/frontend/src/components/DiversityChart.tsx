import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useDiversity } from '../hooks/useQueries';

export function DiversityChart() {
  const { data, isLoading } = useDiversity();

  if (isLoading) return <div className="card h-[380px] animate-pulse" />;
  if (!data) return null;

  const hasCollapse = data.collapse_events.length > 0;

  return (
    <div className={`card ${hasCollapse ? 'glow-amber' : ''}`}>
      <div className="card-header">
        <span className="card-title">Architecture Diversity</span>
        {hasCollapse && (
          <span
            className="badge"
            style={{
              color: 'var(--amber)',
              background: 'rgba(210,153,34,0.1)',
              borderColor: 'rgba(210,153,34,0.3)',
            }}
          >
            {data.collapse_events.length} collapse{data.collapse_events.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="card-body">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data.per_generation} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2333" vertical={false} />
            <XAxis
              dataKey="generation"
              stroke="#484f58"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#1c2333' }}
            />
            <YAxis
              yAxisId="count"
              stroke="#484f58"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <YAxis
              yAxisId="frac"
              orientation="right"
              stroke="#484f58"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              domain={[0, 1]}
            />
            <Tooltip
              contentStyle={{
                background: '#151b27',
                border: '1px solid #252d3d',
                borderRadius: 8,
                fontSize: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
              labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}
              labelFormatter={(gen) => `Generation ${gen}`}
            />
            <Bar yAxisId="count" dataKey="unique_archs" name="Unique Archs" radius={[3, 3, 0, 0]} barSize={14}>
              {data.per_generation.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.is_monoculture ? 'var(--red)' : 'var(--accent)'}
                  fillOpacity={entry.is_monoculture ? 0.7 : 0.5}
                />
              ))}
            </Bar>
            <Line
              yAxisId="frac"
              type="monotone"
              dataKey="top_cluster_frac"
              name="Top Cluster %"
              stroke="var(--amber)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
            />
          </ComposedChart>
        </ResponsiveContainer>
        {hasCollapse && (
          <div className="mt-3 text-[12px] space-y-1">
            {data.collapse_events.map((e, i) => (
              <div key={i} className="flex items-center gap-2" style={{ color: 'var(--amber)' }}>
                <svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 1l7 13H1z" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                Gens {e.start_gen}–{e.end_gen} ({e.length} gens): monoculture
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

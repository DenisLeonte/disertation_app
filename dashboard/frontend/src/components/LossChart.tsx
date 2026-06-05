import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useTrajectory } from '../hooks/useQueries';

const CHART_COLORS = {
  grid: '#1c2333',
  axis: '#484f58',
  bestEver: '#3fb950',
  genBest: '#58a6ff',
  tooltip: { bg: '#151b27', border: '#252d3d' },
};

export function LossChart() {
  const { data, isLoading } = useTrajectory();

  if (isLoading) return <div className="card h-[430px] animate-pulse" />;
  if (!data) return null;

  return (
    <div className="card glow-green">
      <div className="card-header">
        <span className="card-title">Best-Ever Trajectory</span>
        <span className="metric-value text-xs" style={{ color: 'var(--green)' }}>
          {data.best_ever.toFixed(6)}
        </span>
      </div>
      <div className="card-body">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data.points} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
            <defs>
              <linearGradient id="bestGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.bestEver} stopOpacity={0.25} />
                <stop offset="100%" stopColor={CHART_COLORS.bestEver} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.genBest} stopOpacity={0.1} />
                <stop offset="100%" stopColor={CHART_COLORS.genBest} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="generation"
              stroke={CHART_COLORS.axis}
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: CHART_COLORS.grid }}
            />
            <YAxis
              stroke={CHART_COLORS.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => v.toFixed(3)}
            />
            <Tooltip
              contentStyle={{
                background: CHART_COLORS.tooltip.bg,
                border: `1px solid ${CHART_COLORS.tooltip.border}`,
                borderRadius: 8,
                fontSize: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
              labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}
              labelFormatter={(gen) => `Generation ${gen}`}
              itemStyle={{ padding: 0 }}
            />
            <Area
              type="monotone"
              dataKey="gen_best_val"
              name="Gen Best"
              stroke={CHART_COLORS.genBest}
              strokeWidth={1}
              fill="url(#genGrad)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="best_so_far"
              name="Best Ever"
              stroke={CHART_COLORS.bestEver}
              strokeWidth={2}
              fill="url(#bestGrad)"
              dot={false}
            />
            <ReferenceLine
              y={data.best_ever}
              stroke={CHART_COLORS.bestEver}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span>
            Best at <strong style={{ color: 'var(--text-secondary)' }}>gen {data.best_gen}</strong>
            {' '}(indiv {data.best_indiv})
          </span>
          {data.stagnation > 0 && (
            <span style={{ color: data.stagnation >= 10 ? 'var(--amber)' : undefined }}>
              {data.stagnation} gens stagnant
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useTrajectory } from '../hooks/useQueries';

export function LossChart() {
  const { data, isLoading } = useTrajectory();

  if (isLoading) return <ChartSkeleton />;
  if (!data) return null;

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h2 className="text-lg font-semibold text-white mb-4">Loss Trajectory</h2>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data.points} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="generation"
            stroke="#94a3b8"
            fontSize={12}
            label={{ value: 'Generation', position: 'insideBottom', offset: -2, fill: '#94a3b8' }}
          />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="best_so_far"
            name="Best Ever"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="gen_best_val"
            name="Gen Best Val"
            stroke="#6366f1"
            strokeWidth={1}
            dot={false}
            opacity={0.7}
          />
          <ReferenceLine
            y={data.best_ever}
            stroke="#10b981"
            strokeDasharray="5 5"
            label={{ value: `Best: ${data.best_ever.toFixed(6)}`, fill: '#10b981', fontSize: 11 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-sm text-slate-400">
        Best: {data.best_ever.toFixed(6)} at gen {data.best_gen} (individual {data.best_indiv})
        {data.stagnation > 0 && (
          <span className={data.stagnation >= 10 ? 'text-amber-400 ml-2' : 'ml-2'}>
            | Stagnation: {data.stagnation} gens
          </span>
        )}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 h-[420px] animate-pulse" />
  );
}

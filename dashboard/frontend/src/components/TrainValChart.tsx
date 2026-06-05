import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useMemo } from 'react';
import { useLog } from '../hooks/useQueries';
import type { LogRow } from '../api/client';

export function TrainValChart() {
  const { data: rows, isLoading } = useLog();

  const chartData = useMemo(() => {
    if (!rows) return [];
    const byGen = new Map<number, LogRow[]>();
    for (const r of rows) {
      if (!byGen.has(r.generation)) byGen.set(r.generation, []);
      byGen.get(r.generation)!.push(r);
    }
    return Array.from(byGen.entries()).map(([gen, individuals]) => {
      const avgTrain = individuals.reduce((s, r) => s + (r.train_loss ?? 0), 0) / individuals.length;
      const avgVal = individuals.reduce((s, r) => s + r.val_loss, 0) / individuals.length;
      const bestVal = Math.min(...individuals.map(r => r.val_loss));
      return { generation: gen, avg_train: avgTrain, avg_val: avgVal, best_val: bestVal };
    });
  }, [rows]);

  if (isLoading) return <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 h-[420px] animate-pulse" />;
  if (!chartData.length) return null;

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h2 className="text-lg font-semibold text-white mb-4">Train vs Val Loss</h2>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="generation" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Legend />
          <Line type="monotone" dataKey="avg_train" name="Avg Train" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="avg_val" name="Avg Val" stroke="#ef4444" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="best_val" name="Best Val" stroke="#10b981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

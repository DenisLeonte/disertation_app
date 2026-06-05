import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
      const worstVal = Math.max(...individuals.map(r => r.val_loss));
      return { generation: gen, avg_train: avgTrain, avg_val: avgVal, best_val: bestVal, worst_val: worstVal };
    });
  }, [rows]);

  if (isLoading) return <div className="card h-[430px] animate-pulse" />;
  if (!chartData.length) return null;

  return (
    <div className="card glow-blue">
      <div className="card-header">
        <span className="card-title">Train / Val Spread</span>
        <div className="flex items-center gap-3">
          <LegendDot color="var(--amber)" label="Train" />
          <LegendDot color="var(--red)" label="Val" />
          <LegendDot color="var(--green)" label="Best" />
        </div>
      </div>
      <div className="card-body">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2333" vertical={false} />
            <XAxis
              dataKey="generation"
              stroke="#484f58"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#1c2333' }}
            />
            <YAxis
              stroke="#484f58"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => v.toFixed(3)}
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
            <Line type="monotone" dataKey="worst_val" name="Worst Val" stroke="#484f58" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            <Line type="monotone" dataKey="avg_train" name="Avg Train" stroke="var(--amber)" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="avg_val" name="Avg Val" stroke="var(--red)" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="best_val" name="Best Val" stroke="var(--green)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

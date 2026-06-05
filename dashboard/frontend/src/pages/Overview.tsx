import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { useStatus, useTrajectory, useLog, useLogLatest, useDiversity } from '../hooks/useQueries';
import type { LogRow, TrajectoryPoint, DiversityGen } from '../api/client';

export function Overview() {
  const { data: status } = useStatus();
  const { data: trajectory } = useTrajectory();
  const { data: log } = useLog();
  const { data: latest } = useLogLatest();
  const { data: diversity } = useDiversity();

  if (status && !status.has_log) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <SystemInfo />
        <p className="mono dim" style={{ fontSize: 12, margin: 0 }}>
          no training data yet — go to <a href="/run" style={{ color: 'var(--text)' }}>run</a> to start a session
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* top numbers */}
      {status && trajectory && (
        <dl style={{ display: 'flex', gap: 32, margin: 0 }}>
          <Num label="generations" value={status.n_generations ?? 0} />
          <Num label="best val mse" value={status.best_ever?.toFixed(6) ?? '--'} green />
          <Num label="best at" value={trajectory ? `gen ${trajectory.best_gen}` : '--'} />
          <Num label="stagnation" value={trajectory?.stagnation ?? 0} warn={trajectory ? trajectory.stagnation >= 10 : false} />
          <Num label="pop size" value={status.pop_size ?? '--'} />
        </dl>
      )}

      {/* charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Section title="best val mse over generations" subtitle="lower is better — green line should trend down and flatten">
          {trajectory ? <LossTrajectory data={trajectory.points} bestEver={trajectory.best_ever} /> : <Skel h={280} />}
        </Section>
        <Section title="population loss distribution" subtitle="gap between train and val indicates overfitting">
          {log ? <TrainVal rows={log} /> : <Skel h={280} />}
        </Section>
      </div>

      {/* architecture + diversity row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Section title="architecture diversity" subtitle={`unique architectures per generation (pop size: ${status?.pop_size ?? '?'})`}>
          {diversity ? <DiversityBars data={diversity.per_generation} popSize={status?.pop_size ?? 0} /> : <Skel h={200} />}
        </Section>
        <Section title="parameter count vs val loss" subtitle="latest generation — each dot is one individual">
          {latest ? <ParamVsLoss rows={latest} /> : <Skel h={200} />}
        </Section>
      </div>

      {/* mutation + table */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        <Section title={`mutations — gen ${latest?.[0]?.generation ?? '?'}`} subtitle="how the current population was produced">
          {latest ? <MutationBreakdown rows={latest} /> : <Skel h={180} />}
        </Section>
        <Section title="leaderboard" subtitle="overfitting ratio > 1 means val loss is worse than train loss">
          {latest ? <MiniLeaderboard rows={latest} /> : <Skel h={180} />}
        </Section>
      </div>

      {/* full table */}
      {latest && <PopTable rows={latest} />}

      {/* system */}
      <SystemInfo />
    </div>
  );
}

function Num({ label, value, green, warn }: { label: string; value: string | number; green?: boolean; warn?: boolean }) {
  let color = 'var(--text-bright)';
  if (green) color = 'var(--green)';
  if (warn) color = 'var(--yellow)';
  return (
    <div>
      <dt className="dim" style={{ fontSize: 11, marginBottom: 2 }}>{label}</dt>
      <dd className="mono tabnum" style={{ margin: 0, fontSize: 18, color, lineHeight: 1.2 }}>{value}</dd>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="dim" style={{ fontSize: 11, fontWeight: 500, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
      {subtitle && <p className="dim" style={{ fontSize: 10, margin: '0 0 8px', lineHeight: 1.3 }}>{subtitle}</p>}
      {children}
    </section>
  );
}

function Skel({ h }: { h: number }) {
  return <div className="skeleton" style={{ height: h }} />;
}

const tt = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 3, fontSize: 12, padding: '6px 10px' },
  labelStyle: { color: '#999', fontSize: 11, marginBottom: 2 },
  itemStyle: { padding: 0, fontSize: 12 },
};

const legendStyle = { fontSize: 10, color: '#777' };

function LossTrajectory({ data, bestEver }: { data: TrajectoryPoint[]; bestEver: number }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity={0.15} />
            <stop offset="100%" stopColor="var(--green)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="generation" stroke="#333" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'generation', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#555' }} />
        <YAxis stroke="#333" fontSize={10} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(4)} label={{ value: 'val MSE', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#555' }} />
        <Tooltip {...tt} labelFormatter={(g) => `generation ${g}`} formatter={(v: any, name: any) => [Number(v).toFixed(6), name === 'gen_best_val' ? 'best this gen' : 'best ever']} />
        <Legend wrapperStyle={legendStyle} formatter={(v: string) => v === 'gen_best_val' ? 'best this gen' : 'best ever'} />
        <Area type="monotone" dataKey="gen_best_val" stroke="#555" strokeWidth={1} fill="none" dot={false} />
        <Area type="monotone" dataKey="best_so_far" stroke="var(--green)" strokeWidth={1.5} fill="url(#lg)" dot={false} />
        <ReferenceLine y={bestEver} stroke="var(--green)" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: `best: ${bestEver.toFixed(6)}`, position: 'right', fontSize: 9, fill: 'var(--green)' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TrainVal({ rows }: { rows: LogRow[] }) {
  const data = useMemo(() => {
    const byGen = new Map<number, LogRow[]>();
    for (const r of rows) {
      if (!byGen.has(r.generation)) byGen.set(r.generation, []);
      byGen.get(r.generation)!.push(r);
    }
    return Array.from(byGen.entries()).map(([gen, pop]) => {
      const vals = pop.map(r => r.val_loss);
      const trains = pop.map(r => r.train_loss ?? 0);
      return {
        gen,
        avg_train: trains.reduce((s, v) => s + v, 0) / trains.length,
        avg_val: vals.reduce((s, v) => s + v, 0) / vals.length,
        best_val: Math.min(...vals),
        worst_val: Math.max(...vals),
      };
    });
  }, [rows]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey="gen" stroke="#333" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'generation', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#555' }} />
        <YAxis stroke="#333" fontSize={10} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(4)} label={{ value: 'MSE', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#555' }} />
        <Tooltip {...tt} labelFormatter={(g) => `generation ${g}`} formatter={(v: any, name: any) => [Number(v).toFixed(6), name]} />
        <Legend wrapperStyle={legendStyle} />
        <Line type="monotone" dataKey="worst_val" stroke="#333" strokeWidth={1} strokeDasharray="4 2" dot={false} name="worst val" />
        <Line type="monotone" dataKey="avg_val" stroke="var(--red)" strokeWidth={1} dot={false} name="avg val" />
        <Line type="monotone" dataKey="avg_train" stroke="var(--yellow)" strokeWidth={1} dot={false} name="avg train" />
        <Line type="monotone" dataKey="best_val" stroke="var(--green)" strokeWidth={1.5} dot={false} name="best val" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DiversityBars({ data, popSize }: { data: DiversityGen[]; popSize: number }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey="generation" stroke="#333" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'generation', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#555' }} />
        <YAxis stroke="#333" fontSize={10} tickLine={false} axisLine={false} width={28} domain={[0, Math.max(popSize, 1)]} label={{ value: 'unique', angle: -90, position: 'insideLeft', offset: 4, fontSize: 10, fill: '#555' }} />
        <Tooltip {...tt} labelFormatter={(g) => `generation ${g}`} formatter={(v: any) => [`${v} / ${popSize}`, 'unique archs']} />
        {popSize > 0 && <ReferenceLine y={popSize} stroke="#333" strokeDasharray="3 3" label={{ value: `pop: ${popSize}`, position: 'right', fontSize: 9, fill: '#555' }} />}
        <Bar dataKey="unique_archs" name="unique archs" radius={[2, 2, 0, 0]} maxBarSize={14}>
          {data.map((d, i) => <Cell key={i} fill={d.is_monoculture ? 'var(--red)' : d.unique_archs <= Math.ceil(popSize * 0.3) ? 'var(--yellow)' : '#555'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ParamVsLoss({ rows }: { rows: LogRow[] }) {
  const data = useMemo(() =>
    rows.map(r => ({
      params: r.n_params,
      val: r.val_loss,
      label: `#${r.individual}`,
      mutation: r.mutation_type ?? 'init',
      isChamp: r.is_champion,
    })),
  [rows]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey="params" stroke="#333" fontSize={10} tickLine={false} axisLine={false} name="params" type="number" tickFormatter={(v: number) => fmtParams(v)} label={{ value: 'parameters', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#555' }} />
        <YAxis dataKey="val" stroke="#333" fontSize={10} tickLine={false} axisLine={false} width={52} name="val MSE" domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(4)} label={{ value: 'val MSE', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#555' }} />
        <ZAxis range={[30, 30]} />
        <Tooltip {...tt} formatter={(v: any, name: any) => [name === 'params' ? fmtParams(Number(v)) : Number(v).toFixed(6), name]} />
        <Scatter data={data} fill="#555">
          {data.map((d, i) => <Cell key={i} fill={d.isChamp ? 'var(--green)' : mutColor(d.mutation)} />)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function MutationBreakdown({ rows }: { rows: LogRow[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const t = r.mutation_type ?? 'init';
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([type, count]) => ({ type, count, pct: count / rows.length }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {counts.map(({ type, count, pct }) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ width: 80, fontSize: 11, color: mutColor(type) }}>{type.replace('_', ' ')}</span>
          <div style={{ flex: 1, height: 6, background: 'var(--bg-inset)', borderRadius: 1 }}>
            <div style={{ width: `${pct * 100}%`, height: '100%', background: mutColor(type), opacity: 0.6, borderRadius: 1 }} />
          </div>
          <span className="mono dim" style={{ width: 40, textAlign: 'right', fontSize: 11 }}>{count} ({(pct * 100).toFixed(0)}%)</span>
        </div>
      ))}
    </div>
  );
}

function MiniLeaderboard({ rows }: { rows: LogRow[] }) {
  const top5 = useMemo(() => [...rows].sort((a, b) => a.val_loss - b.val_loss).slice(0, 5), [rows]);
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <th className="dim" style={{ padding: '3px 6px', fontSize: 10, textAlign: 'left' }}>#</th>
          <th className="dim" style={{ padding: '3px 6px', fontSize: 10, textAlign: 'left' }}>val mse</th>
          <th className="dim" style={{ padding: '3px 6px', fontSize: 10, textAlign: 'left' }}>train mse</th>
          <th className="dim" style={{ padding: '3px 6px', fontSize: 10, textAlign: 'left' }}>overfit ratio</th>
          <th className="dim" style={{ padding: '3px 6px', fontSize: 10, textAlign: 'left' }}>mutation</th>
        </tr>
      </thead>
      <tbody>
        {top5.map((r, i) => {
          const ratio = r.train_loss != null && r.train_loss > 0 ? r.val_loss / r.train_loss : null;
          return (
            <tr key={r.individual} style={{ borderBottom: '1px solid #1a1a1a' }}>
              <td className="mono tabnum" style={{ padding: '3px 6px' }}>
                {r.individual}
                {r.is_champion && <span className="green" style={{ marginLeft: 4, fontSize: 9 }}>champ</span>}
              </td>
              <td className="mono tabnum" style={{ padding: '3px 6px', color: i === 0 ? 'var(--green)' : undefined }}>{r.val_loss.toFixed(6)}</td>
              <td className="mono tabnum dim" style={{ padding: '3px 6px' }}>{r.train_loss?.toFixed(6) ?? '--'}</td>
              <td className="mono tabnum" style={{ padding: '3px 6px', color: ratio != null && ratio > 1.5 ? 'var(--red)' : ratio != null && ratio > 1.1 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                {ratio != null ? `${ratio.toFixed(2)}x` : '--'}
              </td>
              <td className="mono" style={{ padding: '3px 6px', fontSize: 11, color: mutColor(r.mutation_type) }}>
                {r.mutation_type?.replace('_', ' ') ?? '--'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PopTable({ rows }: { rows: LogRow[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.val_loss - b.val_loss), [rows]);
  const bestVal = sorted[0]?.val_loss;

  return (
    <section>
      <h3 className="dim" style={{ fontSize: 11, fontWeight: 500, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        all individuals — gen {sorted[0]?.generation}
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="dim" style={{ padding: '4px 8px', fontSize: 11 }}>#</th>
              <th className="dim" style={{ padding: '4px 8px', fontSize: 11 }}>val mse</th>
              <th className="dim" style={{ padding: '4px 8px', fontSize: 11 }}>train mse</th>
              <th className="dim" style={{ padding: '4px 8px', fontSize: 11 }}>overfit</th>
              <th className="dim" style={{ padding: '4px 8px', fontSize: 11 }}>params</th>
              <th className="dim" style={{ padding: '4px 8px', fontSize: 11 }}>layers</th>
              <th className="dim" style={{ padding: '4px 8px', fontSize: 11 }}>mutation</th>
              <th className="dim" style={{ padding: '4px 8px', fontSize: 11 }}>architecture</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const ratio = r.train_loss != null && r.train_loss > 0 ? r.val_loss / r.train_loss : null;
              return (
                <tr key={r.individual} style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <td className="mono tabnum" style={{ padding: '4px 8px' }}>
                    {r.individual}
                    {r.is_champion && <span className="green" style={{ marginLeft: 4, fontSize: 10 }}>champ</span>}
                  </td>
                  <td className="mono tabnum" style={{ padding: '4px 8px', color: r.val_loss === bestVal ? 'var(--green)' : undefined }}>
                    {r.val_loss.toFixed(6)}
                  </td>
                  <td className="mono tabnum dim" style={{ padding: '4px 8px' }}>{r.train_loss?.toFixed(6) ?? '--'}</td>
                  <td className="mono tabnum" style={{ padding: '4px 8px', color: ratio != null && ratio > 1.5 ? 'var(--red)' : ratio != null && ratio > 1.1 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                    {ratio != null ? `${ratio.toFixed(2)}x` : '--'}
                  </td>
                  <td className="mono tabnum dim" style={{ padding: '4px 8px' }}>{fmtParams(r.n_params)}</td>
                  <td className="mono tabnum dim" style={{ padding: '4px 8px' }}>{r.n_layers}</td>
                  <td className="mono" style={{ padding: '4px 8px', fontSize: 11, color: mutColor(r.mutation_type) }}>
                    {r.mutation_type?.replace('_', ' ') ?? '--'}
                  </td>
                  <td className="mono dim" style={{ padding: '4px 8px', fontSize: 11, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.architecture}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SystemInfo() {
  const { data } = useQuery({ queryKey: ['system'], queryFn: () => fetch('/api/system').then(r => r.json()), refetchInterval: 5000 });
  if (!data) return null;

  return (
    <section>
      <h3 className="dim" style={{ fontSize: 11, fontWeight: 500, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>system</h3>
      <div className="mono dim" style={{ display: 'flex', gap: 24, fontSize: 11 }}>
        <span>cpu {data.cpu_percent_total}% ({data.cpu_cores_physical}c/{data.cpu_cores_logical}t)</span>
        <span>mem {data.memory_used_gb.toFixed(1)}/{data.memory_total_gb.toFixed(1)} gb</span>
        <span>disk {data.disk_used_gb.toFixed(0)}/{data.disk_total_gb.toFixed(0)} gb</span>
        {data.gpus?.length > 0 && data.gpus.map((g: { index: number; name: string; utilization: number | null; memory_used_mb: number | null; memory_total_mb: number | null; temperature_c: number | null; backend: string }) => (
          <span key={g.index}>
            gpu{g.index} {g.name}
            {g.utilization != null && ` ${g.utilization}%`}
            {g.memory_used_mb != null && g.memory_total_mb != null && ` ${(g.memory_used_mb/1024).toFixed(1)}/${(g.memory_total_mb/1024).toFixed(1)}gb`}
            {g.temperature_c != null && ` ${g.temperature_c}°c`}
          </span>
        ))}
        {data.gpus?.length === 0 && <span>gpu: none detected</span>}
      </div>
    </section>
  );
}

function fmtParams(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function mutColor(t: string | null): string {
  if (!t) return 'var(--text-dim)';
  if (t === 'init') return 'var(--text-dim)';
  if (t === 'champion') return 'var(--green)';
  if (t === 'weights') return 'var(--text)';
  if (t === 'add_layer') return 'var(--blue)';
  if (t === 'remove_layer') return 'var(--red)';
  if (t === 'resize_layer') return 'var(--yellow)';
  return 'var(--text-dim)';
}

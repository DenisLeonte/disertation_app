import { useState } from 'react';
import {
  useSummary,
  useTrajectory,
  useChampionRegression,
  useDiversity,
  useClusters,
} from '../hooks/useQueries';

export function Analysis() {
  return (
    <div className="space-y-4">
      <SummaryCard />
      <TrajectoryCard />
      <ChampionRegressionCard />
      <DiversityCollapseCard />
      <ClustersCard />
    </div>
  );
}

function CollapsibleCard({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      <button
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/30"
        onClick={() => setOpen(!open)}
      >
        <span className="text-lg font-semibold text-white">{title}</span>
        <div className="flex items-center gap-2">
          {badge}
          <span className="text-slate-400">{open ? '▼' : '▶'}</span>
        </div>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function SummaryCard() {
  const { data, isLoading } = useSummary();
  if (isLoading) return <CardSkeleton />;
  if (!data) return null;

  return (
    <CollapsibleCard title="Run Summary">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <Info label="Generations" value={`${data.n_generations} (gen ${data.gen_range[0]}-${data.gen_range[1]})`} />
        <Info label="Population" value={Array.isArray(data.pop_size) ? `variable ${data.pop_size}` : String(data.pop_size)} />
        <Info label="Total Rows" value={String(data.total_rows)} />
        <Info label="Schema" value={data.log_schema} />
        <Info label="Unique Architectures" value={String(data.unique_archs)} />
      </div>
    </CollapsibleCard>
  );
}

function TrajectoryCard() {
  const { data, isLoading } = useTrajectory();
  if (isLoading) return <CardSkeleton />;
  if (!data) return null;

  const stagnationBadge = data.stagnation >= 10 ? (
    <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
      Stagnant: {data.stagnation} gens
    </span>
  ) : null;

  return (
    <CollapsibleCard title="Best-Ever Trajectory" badge={stagnationBadge}>
      <div className="text-sm space-y-1">
        <Info label="Best Ever" value={data.best_ever.toFixed(6)} />
        <Info label="Achieved At" value={`Gen ${data.best_gen}, Individual ${data.best_indiv}`} />
        <Info label="Stagnation" value={`${data.stagnation} generations`} />
      </div>
      <div className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-slate-400">
        {data.points.map(p => (
          <div key={p.generation} className={p.is_new_best ? 'text-emerald-400' : ''}>
            gen {String(p.generation).padStart(3)}: best_so_far={p.best_so_far.toFixed(6)}
            {p.is_new_best && '  <-- new best'}
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}

function ChampionRegressionCard() {
  const { data, isLoading } = useChampionRegression();
  if (isLoading) return <CardSkeleton />;
  if (!data) return null;

  const badge = data.count > 0 ? (
    <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700">
      {data.count} regressions
    </span>
  ) : (
    <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700">
      Clean
    </span>
  );

  return (
    <CollapsibleCard title="Champion Regression" badge={badge}>
      {data.count === 0 ? (
        <p className="text-sm text-slate-400">No champion regressions detected.</p>
      ) : (
        <div className="text-xs font-mono space-y-1">
          {data.flagged.map((f, i) => (
            <div key={i} className="text-red-300">
              gen {f.prev_gen} &rarr; {f.cur_gen}: {f.prev_val.toFixed(5)} &rarr; {f.cur_val.toFixed(5)} (+{f.delta.toFixed(4)})
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function DiversityCollapseCard() {
  const { data, isLoading } = useDiversity();
  if (isLoading) return <CardSkeleton />;
  if (!data) return null;

  const hasCollapse = data.collapse_events.length > 0;
  const badge = hasCollapse ? (
    <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
      {data.collapse_events.length} collapse(s)
    </span>
  ) : null;

  return (
    <CollapsibleCard title="Diversity Collapse" badge={badge}>
      {!hasCollapse ? (
        <p className="text-sm text-slate-400">No sustained diversity collapse detected.</p>
      ) : (
        <div className="text-sm space-y-2">
          {data.collapse_events.map((e, i) => (
            <div key={i} className="text-amber-300">
              Generations {e.start_gen}-{e.end_gen} ({e.length} gens): single architecture dominated &ge;60% of population
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function ClustersCard() {
  const { data, isLoading } = useClusters();
  if (isLoading) return <CardSkeleton />;
  if (!data) return null;

  return (
    <CollapsibleCard title={`Architecture Clusters (Gen ${data.final_generation})`}>
      {data.clusters.length === 0 ? (
        <p className="text-sm text-slate-400">No duplicate architectures in the final generation.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-3 py-2">Count</th>
                <th className="px-3 py-2">Spread</th>
                <th className="px-3 py-2">Min Val</th>
                <th className="px-3 py-2">Max Val</th>
                <th className="px-3 py-2">Architecture</th>
              </tr>
            </thead>
            <tbody>
              {data.clusters.map((c, i) => (
                <tr key={i} className="border-b border-slate-700/50">
                  <td className="px-3 py-2 font-mono">x{c.count}</td>
                  <td className="px-3 py-2 font-mono">{c.spread.toFixed(5)}</td>
                  <td className="px-3 py-2 font-mono">{c.min_val.toFixed(5)}</td>
                  <td className="px-3 py-2 font-mono">{c.max_val.toFixed(5)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400 max-w-xs truncate">{c.architecture}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}: </span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function CardSkeleton() {
  return <div className="bg-slate-800 rounded-lg border border-slate-700 h-20 animate-pulse" />;
}

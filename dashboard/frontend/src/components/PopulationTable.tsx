import { useState, useMemo } from 'react';
import { useLogLatest } from '../hooks/useQueries';
import type { LogRow } from '../api/client';

type SortKey = 'individual' | 'val_loss' | 'train_loss' | 'n_params' | 'n_layers' | 'mutation_type';

export function PopulationTable() {
  const { data: rows, isLoading } = useLogLatest();
  const [sortKey, setSortKey] = useState<SortKey>('val_loss');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  if (isLoading) return <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 h-64 animate-pulse" />;
  if (!sorted.length) return null;

  const gen = sorted[0].generation;

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h2 className="text-lg font-semibold text-white mb-4">
        Population — Generation {gen}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-slate-400 border-b border-slate-700">
            <tr>
              {(['individual', 'val_loss', 'train_loss', 'n_params', 'n_layers', 'mutation_type'] as SortKey[]).map(key => (
                <th
                  key={key}
                  className="px-3 py-2 cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort(key)}
                >
                  {formatHeader(key)} {sortKey === key ? (sortAsc ? '▲' : '▼') : ''}
                </th>
              ))}
              <th className="px-3 py-2">Architecture</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <Row key={r.individual} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row }: { row: LogRow }) {
  const isChampion = row.is_champion;
  return (
    <tr className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${isChampion ? 'bg-emerald-900/20' : ''}`}>
      <td className="px-3 py-2 font-mono">
        {row.individual}
        {isChampion && <span className="ml-1 text-emerald-400 text-xs">champ</span>}
      </td>
      <td className="px-3 py-2 font-mono">{row.val_loss.toFixed(6)}</td>
      <td className="px-3 py-2 font-mono">{row.train_loss?.toFixed(6) ?? '-'}</td>
      <td className="px-3 py-2 font-mono">{(row.n_params / 1e6).toFixed(2)}M</td>
      <td className="px-3 py-2 font-mono">{row.n_layers}</td>
      <td className="px-3 py-2">
        <MutationBadge type={row.mutation_type} />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-slate-400 max-w-xs truncate">
        {row.architecture}
      </td>
    </tr>
  );
}

function MutationBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-slate-500">-</span>;
  const colors: Record<string, string> = {
    champion: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    weights: 'bg-blue-900/50 text-blue-300 border-blue-700',
    add_layer: 'bg-purple-900/50 text-purple-300 border-purple-700',
    remove_layer: 'bg-red-900/50 text-red-300 border-red-700',
    resize_layer: 'bg-amber-900/50 text-amber-300 border-amber-700',
  };
  const cls = colors[type] ?? 'bg-slate-700 text-slate-300 border-slate-600';
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${cls}`}>
      {type}
    </span>
  );
}

function formatHeader(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

import { useState, useMemo } from 'react';
import { useLogLatest } from '../hooks/useQueries';
import type { LogRow } from '../api/client';

type SortKey = 'individual' | 'val_loss' | 'train_loss' | 'n_params' | 'n_layers' | 'mutation_type';

const HEADERS: { key: SortKey; label: string; align?: string }[] = [
  { key: 'individual', label: '#' },
  { key: 'val_loss', label: 'Val Loss' },
  { key: 'train_loss', label: 'Train Loss' },
  { key: 'n_params', label: 'Params' },
  { key: 'n_layers', label: 'Layers' },
  { key: 'mutation_type', label: 'Mutation' },
];

export function PopulationTable() {
  const { data: rows, isLoading } = useLogLatest();
  const [sortKey, setSortKey] = useState<SortKey>('val_loss');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const bestVal = useMemo(() => {
    if (!rows) return 0;
    return Math.min(...rows.map(r => r.val_loss));
  }, [rows]);

  if (isLoading) return <div className="card h-[300px] animate-pulse" />;
  if (!sorted.length) return null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Population &middot; Generation {sorted[0].generation}</span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {sorted.length} individuals
        </span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {HEADERS.map(h => (
                <th
                  key={h.key}
                  className="px-4 py-2.5 text-left font-medium cursor-pointer select-none hover:text-white transition-colors"
                  style={{ color: sortKey === h.key ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 11 }}
                  onClick={() => handleSort(h.key)}
                >
                  {h.label}
                  {sortKey === h.key && (
                    <span className="ml-1 opacity-50">{sortAsc ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
              <th
                className="px-4 py-2.5 text-left font-medium"
                style={{ color: 'var(--text-muted)', fontSize: 11 }}
              >
                Architecture
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <Row key={r.individual} row={r} isBest={r.val_loss === bestVal} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row, isBest }: { row: LogRow; isBest: boolean }) {
  return (
    <tr
      className="table-row"
      style={{
        borderBottom: '1px solid var(--border)',
        background: row.is_champion ? 'rgba(63, 185, 80, 0.04)' : undefined,
      }}
    >
      <td className="px-4 py-2 metric-value" style={{ color: 'var(--text-primary)' }}>
        {row.individual}
        {row.is_champion && (
          <span className="badge ml-2" style={{ color: 'var(--green)', borderColor: 'rgba(63,185,80,0.3)', background: 'rgba(63,185,80,0.08)' }}>
            champ
          </span>
        )}
      </td>
      <td className="px-4 py-2 metric-value" style={{ color: isBest ? 'var(--green)' : 'var(--text-primary)' }}>
        {row.val_loss.toFixed(6)}
        {isBest && <span className="ml-1 text-[10px]" style={{ color: 'var(--green)' }}>best</span>}
      </td>
      <td className="px-4 py-2 metric-value" style={{ color: 'var(--text-secondary)' }}>
        {row.train_loss?.toFixed(6) ?? '--'}
      </td>
      <td className="px-4 py-2 metric-value" style={{ color: 'var(--text-secondary)' }}>
        {formatParams(row.n_params)}
      </td>
      <td className="px-4 py-2 metric-value" style={{ color: 'var(--text-secondary)' }}>
        {row.n_layers}
      </td>
      <td className="px-4 py-2">
        <MutationBadge type={row.mutation_type} />
      </td>
      <td className="px-4 py-2 metric-value text-[11px] max-w-[260px] truncate" style={{ color: 'var(--text-muted)' }}>
        {row.architecture}
      </td>
    </tr>
  );
}

function MutationBadge({ type }: { type: string | null }) {
  if (!type) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
  const styles: Record<string, { color: string; bg: string; border: string }> = {
    champion: { color: 'var(--green)', bg: 'rgba(63,185,80,0.08)', border: 'rgba(63,185,80,0.25)' },
    weights: { color: 'var(--accent)', bg: 'rgba(88,166,255,0.08)', border: 'rgba(88,166,255,0.25)' },
    add_layer: { color: 'var(--purple)', bg: 'rgba(188,140,255,0.08)', border: 'rgba(188,140,255,0.25)' },
    remove_layer: { color: 'var(--red)', bg: 'rgba(248,81,73,0.08)', border: 'rgba(248,81,73,0.25)' },
    resize_layer: { color: 'var(--amber)', bg: 'rgba(210,153,34,0.08)', border: 'rgba(210,153,34,0.25)' },
  };
  const s = styles[type] ?? { color: 'var(--text-secondary)', bg: 'var(--surface-2)', border: 'var(--border)' };
  return (
    <span className="badge" style={{ color: s.color, background: s.bg, borderColor: s.border }}>
      {type.replace('_', ' ')}
    </span>
  );
}

function formatParams(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

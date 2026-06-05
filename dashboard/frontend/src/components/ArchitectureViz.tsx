import { useMemo } from 'react';
import { useLogLatest } from '../hooks/useQueries';

export function ArchitectureViz() {
  const { data: rows } = useLogLatest();

  const bestRow = useMemo(() => {
    if (!rows?.length) return null;
    return rows.reduce((best, r) => r.val_loss < best.val_loss ? r : best);
  }, [rows]);

  if (!bestRow) return null;

  const layers = parseArchitecture(bestRow.architecture);

  return (
    <div className="card glow-blue">
      <div className="card-header">
        <span className="card-title">Best Architecture</span>
        <span className="metric-value text-xs" style={{ color: 'var(--accent)' }}>
          {formatParams(bestRow.n_params)} &middot; {bestRow.n_layers}L
        </span>
      </div>
      <div className="card-body">
        <div className="flex items-center justify-center py-3 overflow-x-auto scrollbar-thin">
          <svg viewBox={`0 0 ${Math.max(layers.length * 72 + 180, 300)} 160`} className="w-full" style={{ maxHeight: 160 }}>
            <InputBlock x={16} />
            <ConnectorLine x1={68} x2={98} />
            {layers.map((layer, i) => {
              const x = 100 + i * 72;
              return (
                <g key={i}>
                  <LayerBlock x={x} layer={layer} index={i} maxChannels={Math.max(...layers.map(l => l.channels))} />
                  {i < layers.length - 1 && <ConnectorLine x1={x + 50} x2={x + 70} />}
                </g>
              );
            })}
            <ConnectorLine x1={100 + (layers.length - 1) * 72 + 50} x2={100 + (layers.length - 1) * 72 + 70} />
            <OutputBlock x={100 + (layers.length - 1) * 72 + 72} />
          </svg>
        </div>
        <div className="metric-value text-[11px] text-center mt-1" style={{ color: 'var(--text-muted)' }}>
          {bestRow.architecture}
        </div>
      </div>
    </div>
  );
}

interface LayerInfo {
  channels: number;
  kernel: number;
}

function parseArchitecture(arch: string): LayerInfo[] {
  const inner = arch.replace(/^\[|\]$/g, '');
  if (!inner) return [];
  return inner.split(/→|->/).map(s => {
    const trimmed = s.trim();
    const match = trimmed.match(/(\d+)\/k(\d+)/);
    if (!match) return { channels: 0, kernel: 0 };
    return { channels: parseInt(match[1]), kernel: parseInt(match[2]) };
  });
}

function InputBlock({ x }: { x: number }) {
  return (
    <g>
      <rect x={x} y={55} width={50} height={50} rx={6}
        fill="rgba(88,166,255,0.08)" stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={x + 25} y={76} textAnchor="middle" fill="var(--accent)" fontSize={10} fontWeight={600}>23ch</text>
      <text x={x + 25} y={90} textAnchor="middle" fill="var(--text-muted)" fontSize={8}>input</text>
    </g>
  );
}

function OutputBlock({ x }: { x: number }) {
  return (
    <g>
      <rect x={x} y={55} width={50} height={50} rx={6}
        fill="rgba(63,185,80,0.08)" stroke="var(--green)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={x + 25} y={76} textAnchor="middle" fill="var(--green)" fontSize={10} fontWeight={600}>5ch</text>
      <text x={x + 25} y={90} textAnchor="middle" fill="var(--text-muted)" fontSize={8}>output</text>
    </g>
  );
}

function LayerBlock({ x, layer, index, maxChannels }: { x: number; layer: LayerInfo; index: number; maxChannels: number }) {
  const heightScale = Math.max(0.35, layer.channels / maxChannels);
  const h = 24 + heightScale * 36;
  const y = 80 - h / 2;
  const hue = layer.kernel === 1 ? 220 : 280;
  const fill = `hsla(${hue}, 60%, 60%, 0.12)`;
  const stroke = `hsla(${hue}, 60%, 60%, 0.5)`;

  return (
    <g>
      <rect x={x} y={y} width={48} height={h} rx={5}
        fill={fill} stroke={stroke} strokeWidth={1} />
      <text x={x + 24} y={y + h / 2 - 4} textAnchor="middle"
        fill={`hsla(${hue}, 70%, 75%, 1)`} fontSize={10} fontWeight={600}>
        {layer.channels}
      </text>
      <text x={x + 24} y={y + h / 2 + 8} textAnchor="middle"
        fill="var(--text-muted)" fontSize={8}>
        k{layer.kernel}
      </text>
      <text x={x + 24} y={y - 4} textAnchor="middle"
        fill="var(--text-muted)" fontSize={7} opacity={0.5}>
        {index}
      </text>
    </g>
  );
}

function ConnectorLine({ x1, x2 }: { x1: number; x2: number }) {
  return (
    <line x1={x1} y1={80} x2={x2} y2={80}
      stroke="var(--border-bright)" strokeWidth={1} markerEnd="url(#arrowhead)" />
  );
}

function formatParams(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

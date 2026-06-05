import { useQuery } from '@tanstack/react-query';

interface GpuInfo {
  index: number;
  name: string;
  utilization: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  temperature_c: number | null;
  backend: string;
}

interface SystemMetrics {
  cpu_percent_per_core: number[];
  cpu_percent_total: number;
  cpu_freq_mhz: number | null;
  cpu_cores_physical: number;
  cpu_cores_logical: number;
  memory_used_gb: number;
  memory_total_gb: number;
  memory_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  gpus: GpuInfo[];
  gpu_backend: string;
}

export function SystemMonitor() {
  const { data, isLoading } = useQuery<SystemMetrics>({
    queryKey: ['system'],
    queryFn: () => fetch('/api/system').then(r => r.json()),
    refetchInterval: 3000,
  });

  if (isLoading) return <div className="card h-[200px] animate-pulse" />;
  if (!data) return null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">System Resources</span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {data.cpu_cores_physical}C/{data.cpu_cores_logical}T
          {data.cpu_freq_mhz ? ` @ ${(data.cpu_freq_mhz / 1000).toFixed(1)} GHz` : ''}
        </span>
      </div>
      <div className="card-body space-y-4">
        {/* CPU */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>CPU</span>
            <span className="metric-value text-[12px]" style={{ color: cpuColor(data.cpu_percent_total) }}>
              {data.cpu_percent_total.toFixed(1)}%
            </span>
          </div>
          <div className="flex gap-[3px]">
            {data.cpu_percent_per_core.map((pct, i) => (
              <CoreBar key={i} percent={pct} index={i} />
            ))}
          </div>
        </div>

        {/* Memory */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Memory</span>
            <span className="metric-value text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {data.memory_used_gb.toFixed(1)} / {data.memory_total_gb.toFixed(1)} GB
            </span>
          </div>
          <UsageBar percent={data.memory_percent} color="var(--purple)" />
        </div>

        {/* Disk */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Disk</span>
            <span className="metric-value text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {data.disk_used_gb.toFixed(1)} / {data.disk_total_gb.toFixed(1)} GB
            </span>
          </div>
          <UsageBar
            percent={(data.disk_used_gb / data.disk_total_gb) * 100}
            color="var(--text-muted)"
          />
        </div>

        {/* GPUs */}
        {data.gpus.length > 0 ? (
          <div className="space-y-3 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 pt-2">
              <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                GPU ({data.gpu_backend.toUpperCase()})
              </span>
            </div>
            {data.gpus.map(gpu => (
              <GpuCard key={gpu.index} gpu={gpu} />
            ))}
          </div>
        ) : (
          <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 pt-2">
              <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
                GPU
              </span>
              <span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                not detected
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CoreBar({ percent, index }: { percent: number; index: number }) {
  const height = 32;
  const fillHeight = (percent / 100) * height;

  return (
    <div
      className="flex-1 relative rounded-sm overflow-hidden"
      style={{ height, background: 'var(--surface-0)', minWidth: 12 }}
      title={`Core ${index}: ${percent.toFixed(1)}%`}
    >
      <div
        className="absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-300"
        style={{
          height: fillHeight,
          background: cpuColor(percent),
          opacity: 0.8,
        }}
      />
      {percent > 30 && (
        <span
          className="absolute inset-0 flex items-center justify-center text-[8px] font-bold"
          style={{ color: 'rgba(255,255,255,0.8)' }}
        >
          {percent.toFixed(0)}
        </span>
      )}
    </div>
  );
}

function UsageBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-0)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(percent, 100)}%`, background: color, opacity: 0.7 }}
      />
    </div>
  );
}

function GpuCard({ gpu }: { gpu: GpuInfo }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <GpuIcon />
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {gpu.name}
          </span>
        </div>
        {gpu.temperature_c != null && (
          <span className="metric-value text-[11px]" style={{ color: tempColor(gpu.temperature_c) }}>
            {gpu.temperature_c.toFixed(0)}°C
          </span>
        )}
      </div>

      {gpu.utilization != null && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Utilization</span>
            <span className="metric-value text-[11px]" style={{ color: 'var(--green)' }}>
              {gpu.utilization.toFixed(0)}%
            </span>
          </div>
          <UsageBar percent={gpu.utilization} color="var(--green)" />
        </div>
      )}

      {gpu.memory_used_mb != null && gpu.memory_total_mb != null && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>VRAM</span>
            <span className="metric-value text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {(gpu.memory_used_mb / 1024).toFixed(1)} / {(gpu.memory_total_mb / 1024).toFixed(1)} GB
            </span>
          </div>
          <UsageBar percent={(gpu.memory_used_mb / gpu.memory_total_mb) * 100} color="var(--accent)" />
        </div>
      )}

      {gpu.utilization == null && gpu.memory_used_mb == null && (
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Detected via {gpu.backend} (no live metrics available)
        </span>
      )}
    </div>
  );
}

function GpuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="8" rx="1.5" stroke="var(--green)" strokeWidth="1.2" />
      <rect x="3" y="6" width="3" height="4" rx="0.5" fill="var(--green)" fillOpacity="0.3" />
      <rect x="7" y="6" width="3" height="4" rx="0.5" fill="var(--green)" fillOpacity="0.3" />
      <rect x="11" y="6" width="2" height="4" rx="0.5" fill="var(--green)" fillOpacity="0.2" />
    </svg>
  );
}

function cpuColor(pct: number): string {
  if (pct > 85) return 'var(--red)';
  if (pct > 60) return 'var(--amber)';
  if (pct > 30) return 'var(--accent)';
  return 'var(--green)';
}

function tempColor(temp: number): string {
  if (temp > 85) return 'var(--red)';
  if (temp > 70) return 'var(--amber)';
  return 'var(--green)';
}

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface RunStatus {
  running: boolean;
  return_code: number | null;
  output_lines: number;
}

interface OutputResponse {
  lines: string[];
}

const fetchRunStatus = (): Promise<RunStatus> =>
  fetch('/api/run/status').then(r => r.json());

const fetchOutput = (lastN?: number): Promise<OutputResponse> =>
  fetch(`/api/run/output${lastN ? `?last_n=${lastN}` : ''}`).then(r => r.json());

export function Controls() {
  return (
    <div className="space-y-5">
      <RunControlPanel />
      <OutputTerminal />
    </div>
  );
}

function RunControlPanel() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['run-status'],
    queryFn: fetchRunStatus,
    refetchInterval: 2000,
  });

  const [config, setConfig] = useState({
    pop_size: 16,
    n_survivors: 8,
    max_generations: '',
    patience: 10,
    epochs_per_gen: 50,
    batch_size: 1024,
    lr: 0.001,
  });

  const startMutation = useMutation({
    mutationFn: (cfg: Record<string, number | null>) =>
      fetch('/api/run/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      }).then(r => {
        if (!r.ok) throw new Error('Failed to start');
        return r.json();
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['run-status'] }),
  });

  const stopMutation = useMutation({
    mutationFn: (force: boolean) =>
      fetch(`/api/run/stop?force=${force}`, { method: 'POST' }).then(r => {
        if (!r.ok) throw new Error('Failed to stop');
        return r.json();
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['run-status'] }),
  });

  const handleStart = () => {
    const cfg: Record<string, number | null> = {
      pop_size: config.pop_size,
      n_survivors: config.n_survivors,
      patience: config.patience,
      epochs_per_gen: config.epochs_per_gen,
      batch_size: config.batch_size,
      lr: config.lr,
      max_generations: config.max_generations ? parseInt(config.max_generations) : null,
    };
    startMutation.mutate(cfg);
  };

  const isRunning = status?.running ?? false;

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <span className="card-title">Training Control</span>
          <div className="flex items-center gap-1.5">
            <div
              className="pulse-dot"
              style={{ background: isRunning ? 'var(--green)' : 'var(--text-muted)' }}
            />
            <span className="text-[11px] font-medium" style={{ color: isRunning ? 'var(--green)' : 'var(--text-muted)' }}>
              {isRunning ? 'Running' : status?.return_code != null ? `Exited (${status.return_code})` : 'Idle'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={startMutation.isPending}
              className="px-4 py-1.5 text-[12px] font-medium rounded-md transition-all"
              style={{
                background: 'rgba(63,185,80,0.15)',
                color: 'var(--green)',
                border: '1px solid rgba(63,185,80,0.3)',
              }}
            >
              {startMutation.isPending ? 'Starting...' : 'Start Training'}
            </button>
          ) : (
            <>
              <button
                onClick={() => stopMutation.mutate(false)}
                className="px-4 py-1.5 text-[12px] font-medium rounded-md transition-all"
                style={{
                  background: 'rgba(210,153,34,0.15)',
                  color: 'var(--amber)',
                  border: '1px solid rgba(210,153,34,0.3)',
                }}
              >
                Graceful Stop
              </button>
              <button
                onClick={() => stopMutation.mutate(true)}
                className="px-4 py-1.5 text-[12px] font-medium rounded-md transition-all"
                style={{
                  background: 'rgba(248,81,73,0.1)',
                  color: 'var(--red)',
                  border: '1px solid rgba(248,81,73,0.25)',
                }}
              >
                Force Kill
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConfigField label="Population Size" value={config.pop_size} onChange={v => setConfig(c => ({ ...c, pop_size: +v }))} type="number" disabled={isRunning} />
          <ConfigField label="Survivors" value={config.n_survivors} onChange={v => setConfig(c => ({ ...c, n_survivors: +v }))} type="number" disabled={isRunning} />
          <ConfigField label="Max Generations" value={config.max_generations} onChange={v => setConfig(c => ({ ...c, max_generations: v }))} placeholder="None" disabled={isRunning} />
          <ConfigField label="Patience" value={config.patience} onChange={v => setConfig(c => ({ ...c, patience: +v }))} type="number" disabled={isRunning} />
          <ConfigField label="Epochs / Gen" value={config.epochs_per_gen} onChange={v => setConfig(c => ({ ...c, epochs_per_gen: +v }))} type="number" disabled={isRunning} />
          <ConfigField label="Batch Size" value={config.batch_size} onChange={v => setConfig(c => ({ ...c, batch_size: +v }))} type="number" disabled={isRunning} />
          <ConfigField label="Learning Rate" value={config.lr} onChange={v => setConfig(c => ({ ...c, lr: +v }))} type="number" step="0.0001" disabled={isRunning} />
        </div>

        <div className="flex gap-2 mt-4">
          <PresetButton
            label="Smoke Test"
            disabled={isRunning}
            onClick={() => setConfig({ pop_size: 4, n_survivors: 2, max_generations: '1', patience: 10, epochs_per_gen: 5, batch_size: 1024, lr: 0.001 })}
          />
          <PresetButton
            label="Quick Run"
            disabled={isRunning}
            onClick={() => setConfig({ pop_size: 8, n_survivors: 4, max_generations: '10', patience: 5, epochs_per_gen: 20, batch_size: 1024, lr: 0.001 })}
          />
          <PresetButton
            label="Full Training"
            disabled={isRunning}
            onClick={() => setConfig({ pop_size: 16, n_survivors: 8, max_generations: '', patience: 10, epochs_per_gen: 50, batch_size: 1024, lr: 0.001 })}
          />
        </div>
      </div>
    </div>
  );
}

function ConfigField({
  label, value, onChange, type = 'text', placeholder, step, disabled,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        disabled={disabled}
        className="w-full px-3 py-2 text-[13px] rounded-md metric-value outline-none transition-colors disabled:opacity-40"
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  );
}

function PresetButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1 text-[11px] font-medium rounded-md transition-colors disabled:opacity-30"
      style={{
        background: 'var(--surface-3)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      {label}
    </button>
  );
}

function OutputTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery({
    queryKey: ['run-status'],
    queryFn: fetchRunStatus,
    refetchInterval: 2000,
  });

  const { data: output } = useQuery({
    queryKey: ['run-output'],
    queryFn: () => fetchOutput(200),
    refetchInterval: status?.running ? 1000 : false,
    enabled: (status?.output_lines ?? 0) > 0,
  });

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const lines = output?.lines ?? [];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Training Output</span>
        {lines.length > 0 && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {lines.length} lines
          </span>
        )}
      </div>
      <div
        ref={terminalRef}
        className="terminal scrollbar-thin"
        style={{ maxHeight: 400, margin: 12, minHeight: 120 }}
      >
        {lines.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>No output yet. Start a training run to see logs here.</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{ color: colorForLine(line) }}>
              {line || ' '}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function colorForLine(line: string): string {
  if (line.includes('New best') || line.includes('★')) return 'var(--green)';
  if (line.includes('ANOMALY') || line.includes('Error')) return 'var(--red)';
  if (line.includes('Generation')) return 'var(--text-primary)';
  if (line.includes('Plateau') || line.includes('Stop')) return 'var(--amber)';
  return 'var(--text-secondary)';
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface RunStatus {
  running: boolean;
  return_code: number | null;
  output_lines: number;
}

interface StartConfig {
  pop_size?: number;
  n_survivors?: number;
  max_generations?: number;
  patience?: number;
  epochs_per_gen?: number;
  batch_size?: number;
  lr?: number;
}

const fetchStatus = (): Promise<RunStatus> =>
  fetch('/api/run/status').then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });

const fetchOutput = (lastN?: number): Promise<{ lines: string[] }> => {
  const q = lastN != null ? `?last_n=${lastN}` : '';
  return fetch(`/api/run/output${q}`).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
};

const postStart = (config: StartConfig): Promise<RunStatus> =>
  fetch('/api/run/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
    .then(r => { if (!r.ok) throw r.json().then((e: { detail: string }) => { throw new Error(e.detail); }); return r.json(); });

const postStop = (force: boolean): Promise<RunStatus> =>
  fetch(`/api/run/stop?force=${force}`, { method: 'POST' })
    .then(r => { if (!r.ok) throw r.json().then((e: { detail: string }) => { throw new Error(e.detail); }); return r.json(); });

export function RunControl() {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['run-status'], queryFn: fetchStatus, refetchInterval: 2000 });
  const { data: output } = useQuery({ queryKey: ['run-output'], queryFn: () => fetchOutput(), refetchInterval: 2000 });

  const startMut = useMutation({ mutationFn: postStart, onSuccess: () => qc.invalidateQueries({ queryKey: ['run-status'] }) });
  const stopMut = useMutation({ mutationFn: postStop, onSuccess: () => qc.invalidateQueries({ queryKey: ['run-status'] }) });

  const [config, setConfig] = useState<StartConfig>({
    pop_size: 16,
    n_survivors: 8,
    patience: 10,
    epochs_per_gen: 50,
    batch_size: 1024,
    lr: 0.001,
  });

  const running = status?.running ?? false;

  const handleStart = useCallback(() => {
    const clean: StartConfig = {};
    if (config.pop_size != null) clean.pop_size = config.pop_size;
    if (config.n_survivors != null) clean.n_survivors = config.n_survivors;
    if (config.max_generations != null) clean.max_generations = config.max_generations;
    if (config.patience != null) clean.patience = config.patience;
    if (config.epochs_per_gen != null) clean.epochs_per_gen = config.epochs_per_gen;
    if (config.batch_size != null) clean.batch_size = config.batch_size;
    if (config.lr != null) clean.lr = config.lr;
    startMut.mutate(clean);
  }, [config, startMut]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* status line */}
      <div className="mono" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: running ? 'var(--green)' : '#555', display: 'inline-block' }} />
        <span>{running ? 'training running' : status?.return_code != null ? `stopped (exit ${status.return_code})` : 'idle'}</span>
      </div>

      {/* config form */}
      <section>
        <h3 className="dim" style={{ fontSize: 11, fontWeight: 500, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 16px' }}>
          <Field label="pop size" value={config.pop_size} onChange={v => setConfig(c => ({ ...c, pop_size: v }))} disabled={running} />
          <Field label="survivors" value={config.n_survivors} onChange={v => setConfig(c => ({ ...c, n_survivors: v }))} disabled={running} />
          <Field label="max generations" value={config.max_generations} onChange={v => setConfig(c => ({ ...c, max_generations: v }))} disabled={running} />
          <Field label="patience" value={config.patience} onChange={v => setConfig(c => ({ ...c, patience: v }))} disabled={running} />
          <Field label="epochs / gen" value={config.epochs_per_gen} onChange={v => setConfig(c => ({ ...c, epochs_per_gen: v }))} disabled={running} />
          <Field label="batch size" value={config.batch_size} onChange={v => setConfig(c => ({ ...c, batch_size: v }))} disabled={running} />
          <Field label="learning rate" value={config.lr} onChange={v => setConfig(c => ({ ...c, lr: v }))} step={0.0001} disabled={running} />
        </div>
      </section>

      {/* controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleStart} disabled={running || startMut.isPending}>
          {startMut.isPending ? 'starting...' : 'start training'}
        </button>
        <button onClick={() => stopMut.mutate(false)} disabled={!running || stopMut.isPending}>
          stop (graceful)
        </button>
        <button onClick={() => stopMut.mutate(true)} disabled={!running || stopMut.isPending} style={{ color: 'var(--red)' }}>
          kill
        </button>
      </div>
      {(startMut.error || stopMut.error) && (
        <p className="mono" style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>
          {(startMut.error as Error)?.message || (stopMut.error as Error)?.message}
        </p>
      )}

      {/* output terminal */}
      <section>
        <h3 className="dim" style={{ fontSize: 11, fontWeight: 500, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>output</h3>
        <Terminal lines={output?.lines ?? []} />
      </section>
    </div>
  );
}

function Field({ label, value, onChange, step, disabled }: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{label}</label>
      <input
        type="number"
        step={step}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        disabled={disabled}
      />
    </div>
  );
}

function Terminal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  return (
    <pre
      ref={ref}
      className="mono"
      style={{
        background: 'var(--bg-inset)',
        border: '1px solid var(--border)',
        borderRadius: 3,
        padding: '10px 12px',
        fontSize: 11,
        lineHeight: 1.6,
        height: 360,
        overflow: 'auto',
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {lines.length === 0 ? <span className="dim">no output</span> : lines.join('\n')}
    </pre>
  );
}

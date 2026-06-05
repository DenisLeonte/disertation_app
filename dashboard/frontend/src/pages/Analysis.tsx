import { useSummary, useTrajectory, useChampionRegression, useDiversity, useClusters } from '../hooks/useQueries';
import type { RegressionEvent, DiversityGen, CollapseEvent, ClusterEntry } from '../api/client';

export function Analysis() {
  const { data: summary } = useSummary();
  const { data: trajectory } = useTrajectory();
  const { data: regression } = useChampionRegression();
  const { data: diversity } = useDiversity();
  const { data: clusters } = useClusters();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* run summary */}
      <section>
        <H3>run summary</H3>
        {summary ? (
          <dl className="mono" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', fontSize: 12, margin: 0 }}>
            <Dt>generations</Dt><Dd>{summary.n_generations} ({summary.gen_range[0]}–{summary.gen_range[1]})</Dd>
            <Dt>pop size</Dt><Dd>{Array.isArray(summary.pop_size) ? summary.pop_size.join(', ') : summary.pop_size}{summary.pop_size_variable ? ' (variable)' : ''}</Dd>
            <Dt>total rows</Dt><Dd>{summary.total_rows}</Dd>
            <Dt>schema</Dt><Dd>{summary.log_schema}</Dd>
            <Dt>unique archs</Dt><Dd>{summary.unique_archs}</Dd>
          </dl>
        ) : <Skel h={80} />}
      </section>

      {/* trajectory */}
      <section>
        <H3>best-ever trajectory</H3>
        {trajectory ? (
          <div>
            <div className="mono" style={{ fontSize: 12, marginBottom: 8 }}>
              <span>best <span className="green">{trajectory.best_ever.toFixed(6)}</span></span>
              <span className="dim" style={{ marginLeft: 16 }}>at gen {trajectory.best_gen} / indiv {trajectory.best_indiv}</span>
              <span className="dim" style={{ marginLeft: 16 }}>stagnation: <span style={{ color: trajectory.stagnation >= 10 ? 'var(--yellow)' : undefined }}>{trajectory.stagnation}</span></span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <Th>gen</Th><Th>gen best</Th><Th>best so far</Th><Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {trajectory.points.map(p => (
                    <tr key={p.generation} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <Td>{p.generation}</Td>
                      <Td dim>{p.gen_best_val.toFixed(6)}</Td>
                      <Td green={p.is_new_best}>{p.best_so_far.toFixed(6)}</Td>
                      <Td>{p.is_new_best ? <span className="green" style={{ fontSize: 10 }}>new best</span> : null}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : <Skel h={120} />}
      </section>

      {/* champion regression */}
      <section>
        <H3>champion regression</H3>
        {regression ? (
          regression.count === 0 ? (
            <p className="mono dim" style={{ fontSize: 12, margin: 0 }}>no regression events detected</p>
          ) : (
            <div>
              <p className="mono dim" style={{ fontSize: 12, margin: '0 0 8px' }}>{regression.count} event{regression.count !== 1 ? 's' : ''} where champion val loss degraded after re-training</p>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <Th>gen</Th><Th>prev val</Th><Th>cur val</Th><Th>delta</Th><Th>architecture</Th>
                  </tr>
                </thead>
                <tbody>
                  {regression.flagged.map((e: RegressionEvent, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <Td>{e.prev_gen} -&gt; {e.cur_gen}</Td>
                      <Td dim>{e.prev_val.toFixed(6)}</Td>
                      <Td>{e.cur_val.toFixed(6)}</Td>
                      <Td><span className="red">+{e.delta.toFixed(6)}</span></Td>
                      <Td dim truncate>{e.architecture}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : <Skel h={80} />}
      </section>

      {/* diversity */}
      <section>
        <H3>diversity collapse</H3>
        {diversity ? (
          <div>
            {diversity.collapse_events.length === 0 ? (
              <p className="mono dim" style={{ fontSize: 12, margin: '0 0 12px' }}>no collapse events</p>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <p className="mono" style={{ fontSize: 12, margin: '0 0 8px', color: 'var(--yellow)' }}>
                  {diversity.collapse_events.length} collapse event{diversity.collapse_events.length !== 1 ? 's' : ''}
                </p>
                {diversity.collapse_events.map((e: CollapseEvent, i: number) => (
                  <p key={i} className="mono dim" style={{ fontSize: 12, margin: '2px 0' }}>
                    gen {e.start_gen}–{e.end_gen} ({e.length} gens)
                  </p>
                ))}
              </div>
            )}
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <Th>gen</Th><Th>unique</Th><Th>top cluster</Th><Th>frac</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {diversity.per_generation.map((d: DiversityGen) => (
                  <tr key={d.generation} style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <Td>{d.generation}</Td>
                    <Td>{d.unique_archs}</Td>
                    <Td dim>{d.top_cluster_size}/{d.pop_size}</Td>
                    <Td>{(d.top_cluster_frac * 100).toFixed(0)}%</Td>
                    <Td>{d.is_monoculture ? <span className="red" style={{ fontSize: 10 }}>monoculture</span> : null}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Skel h={120} />}
      </section>

      {/* clusters */}
      <section>
        <H3>architecture clusters — gen {clusters?.final_generation ?? '?'}</H3>
        {clusters ? (
          clusters.clusters.length === 0 ? (
            <p className="mono dim" style={{ fontSize: 12, margin: 0 }}>no duplicate architectures</p>
          ) : (
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <Th>count</Th><Th>min val</Th><Th>max val</Th><Th>spread</Th><Th>architecture</Th>
                </tr>
              </thead>
              <tbody>
                {clusters.clusters.map((c: ClusterEntry, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <Td>{c.count}</Td>
                    <Td green>{c.min_val.toFixed(6)}</Td>
                    <Td dim>{c.max_val.toFixed(6)}</Td>
                    <Td>{c.spread.toFixed(6)}</Td>
                    <Td dim truncate>{c.architecture}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : <Skel h={80} />}
      </section>
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="dim" style={{ fontSize: 11, fontWeight: 500, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</h3>;
}

function Skel({ h }: { h: number }) {
  return <div className="skeleton" style={{ height: h }} />;
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="dim" style={{ padding: '4px 8px', fontSize: 11, textAlign: 'left' }}>{children}</th>;
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="dim">{children}</dt>;
}

function Dd({ children }: { children: React.ReactNode }) {
  return <dd style={{ margin: 0 }}>{children}</dd>;
}

function Td({ children, dim, green, truncate }: { children: React.ReactNode; dim?: boolean; green?: boolean; truncate?: boolean }) {
  return (
    <td className={`mono tabnum${dim ? ' dim' : ''}`} style={{
      padding: '4px 8px',
      color: green ? 'var(--green)' : undefined,
      maxWidth: truncate ? 260 : undefined,
      overflow: truncate ? 'hidden' : undefined,
      textOverflow: truncate ? 'ellipsis' : undefined,
      whiteSpace: truncate ? 'nowrap' : undefined,
    }}>
      {children}
    </td>
  );
}

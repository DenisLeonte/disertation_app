const BASE = '/api';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export interface LogRow {
  generation: number;
  individual: number;
  val_loss: number;
  n_params: number;
  n_layers: number;
  architecture: string;
  train_loss: number | null;
  best_ever: number | null;
  is_champion: boolean | null;
  mutation_type: string | null;
  parent_idx: number | null;
}

export interface Status {
  has_log: boolean;
  has_checkpoint: boolean;
  has_best_model: boolean;
  n_generations: number | null;
  best_ever: number | null;
  pop_size: number | null;
}

export interface Summary {
  n_generations: number;
  gen_range: [number, number];
  pop_size: number | number[];
  pop_size_variable: boolean;
  total_rows: number;
  log_schema: string;
  unique_archs: number;
}

export interface TrajectoryPoint {
  generation: number;
  best_so_far: number;
  gen_best_val: number;
  is_new_best: boolean;
}

export interface Trajectory {
  best_ever: number;
  best_gen: number;
  best_indiv: number;
  stagnation: number;
  points: TrajectoryPoint[];
}

export interface RegressionEvent {
  prev_gen: number;
  cur_gen: number;
  prev_val: number;
  cur_val: number;
  delta: number;
  architecture: string;
}

export interface Regression {
  count: number;
  flagged: RegressionEvent[];
}

export interface DiversityGen {
  generation: number;
  unique_archs: number;
  top_cluster_size: number;
  pop_size: number;
  top_cluster_frac: number;
  is_monoculture: boolean;
}

export interface CollapseEvent {
  start_gen: number;
  end_gen: number;
  length: number;
}

export interface Diversity {
  per_generation: DiversityGen[];
  collapse_events: CollapseEvent[];
}

export interface ClusterEntry {
  architecture: string;
  count: number;
  spread: number;
  min_val: number;
  max_val: number;
}

export interface Clusters {
  final_generation: number;
  clusters: ClusterEntry[];
}

export const api = {
  status: () => fetchJson<Status>('/status'),
  log: (fromGen?: number) => {
    const params = fromGen != null ? `?from_gen=${fromGen}` : '';
    return fetchJson<LogRow[]>(`/log${params}`);
  },
  logLatest: () => fetchJson<LogRow[]>('/log/latest'),
  summary: () => fetchJson<Summary>('/analysis/summary'),
  trajectory: () => fetchJson<Trajectory>('/analysis/trajectory'),
  championRegression: () => fetchJson<Regression>('/analysis/champion-regression'),
  diversity: () => fetchJson<Diversity>('/analysis/diversity'),
  clusters: () => fetchJson<Clusters>('/analysis/clusters'),
};

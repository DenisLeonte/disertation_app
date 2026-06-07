import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const REFETCH_INTERVAL = 10_000;

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useLog() {
  return useQuery({
    queryKey: ['log'],
    queryFn: () => api.log(),
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useLogLatest() {
  return useQuery({
    queryKey: ['log-latest'],
    queryFn: api.logLatest,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useSummary() {
  return useQuery({
    queryKey: ['summary'],
    queryFn: api.summary,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useTrajectory() {
  return useQuery({
    queryKey: ['trajectory'],
    queryFn: api.trajectory,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useChampionRegression() {
  return useQuery({
    queryKey: ['champion-regression'],
    queryFn: api.championRegression,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useDiversity() {
  return useQuery({
    queryKey: ['diversity'],
    queryFn: api.diversity,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useClusters() {
  return useQuery({
    queryKey: ['clusters'],
    queryFn: api.clusters,
    refetchInterval: REFETCH_INTERVAL,
  });
}

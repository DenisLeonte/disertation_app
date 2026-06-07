"""
analyze_log.py — anomaly detector for training_log.csv.

Reads the CSV produced by evolution.Logger and reports:
  1. Run summary
  2. Best-ever trajectory + stagnation
  3. Champion regression (carried-over best whose val degraded after re-training)
  4. Diversity collapse
  5. Top duplicate-architecture clusters in the final generation

Handles both schemas:
  * Legacy:   generation, individual, val_loss, n_params, n_layers, architecture
  * Extended: ... + train_loss, best_ever, is_champion, mutation_type, parent_idx

Usage:
    python analyze_log.py [training_log.csv]
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

# The architecture column contains the '->' arrow as a Unicode glyph (genome.describe()),
# so Windows' cp1252 console will choke. Reconfigure stdout/stderr to UTF-8.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')


# ── I/O ────────────────────────────────────────────────────────────────────────

def load_log(path: Path) -> list[dict]:
    with open(path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    for r in rows:
        r['generation'] = int(r['generation'])
        r['individual'] = int(r['individual'])
        r['val_loss']   = float(r['val_loss'])
        r['n_params']   = int(r['n_params'])
        r['n_layers']   = int(r['n_layers'])
        # Optional extended columns — coerce iff present and non-empty
        if r.get('train_loss'):
            r['train_loss'] = float(r['train_loss'])
        if r.get('best_ever'):
            r['best_ever'] = float(r['best_ever'])
        if r.get('is_champion'):
            r['is_champion'] = r['is_champion'].strip().lower() in ('true', '1', 'yes')
        if r.get('parent_idx'):
            r['parent_idx'] = int(r['parent_idx'])
    return rows


def by_generation(rows: list[dict]) -> dict[int, list[dict]]:
    gens: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        gens[r['generation']].append(r)
    return dict(sorted(gens.items()))


def section(title: str) -> None:
    print(f"\n{'-' * 64}")
    print(f"  {title}")
    print(f"{'-' * 64}")


# ── Analyses ───────────────────────────────────────────────────────────────────

def run_summary(rows: list[dict], gens: dict[int, list[dict]], verbose: bool = True) -> dict:
    if verbose:
        section("Run summary")
    pop_sizes = {len(individuals) for individuals in gens.values()}
    result = {
        'n_generations': len(gens),
        'gen_range': [min(gens), max(gens)],
        'pop_size': next(iter(pop_sizes)) if len(pop_sizes) == 1 else sorted(pop_sizes),
        'pop_size_variable': len(pop_sizes) > 1,
        'total_rows': len(rows),
        'schema': 'extended' if 'train_loss' in rows[0] else 'legacy',
        'unique_archs': len({r['architecture'] for r in rows}),
    }
    if verbose:
        print(f"  Generations:       {result['n_generations']} (gen {result['gen_range'][0]} - gen {result['gen_range'][1]})")
        pop_display = result['pop_size'] if not result['pop_size_variable'] else f"variable {result['pop_size']}"
        print(f"  Population size:   {pop_display}")
        print(f"  Total rows:        {result['total_rows']}")
        print(f"  Schema:            {result['schema']}")
        print(f"  Unique archs (lifetime): {result['unique_archs']}")
    return result


def best_ever_trajectory(gens: dict[int, list[dict]], patience: int = 10,
                         verbose: bool = True) -> dict:
    """Best-ever curve; warn if stagnation exceeds `patience`."""
    if verbose:
        section("Best-ever trajectory")
    best_ever, best_gen, best_indiv = float('inf'), None, None
    points = []
    for g, individuals in gens.items():
        gen_best = min(individuals, key=lambda r: r['val_loss'])
        is_new_best = gen_best['val_loss'] < best_ever
        if is_new_best:
            best_ever = gen_best['val_loss']
            best_gen, best_indiv = g, gen_best['individual']
        points.append({
            'generation': g,
            'best_so_far': best_ever,
            'gen_best_val': gen_best['val_loss'],
            'is_new_best': is_new_best,
        })
        if verbose:
            marker = "  <- new best" if is_new_best else ""
            print(f"  gen {g:>3}: best_so_far={best_ever:.6f}  "
                  f"(from gen {best_gen} indiv {best_indiv}){marker}")

    last_gen = max(gens)
    stagnation = last_gen - best_gen
    if verbose and stagnation >= patience:
        print()
        print(f"  [!] ANOMALY: Best-ever frozen at {best_ever:.6f} from generation {best_gen}, "
              f"individual {best_indiv} -- {stagnation}-generation stagnation, "
              f"exceeds PATIENCE={patience}.")
    return {'best_ever': best_ever, 'best_gen': best_gen, 'best_indiv': best_indiv,
            'stagnation': stagnation, 'points': points}


def champion_regression(gens: dict[int, list[dict]], threshold: float = 0.01,
                        verbose: bool = True) -> dict:
    """Detect cases where the carried-over champion's val got worse after re-training."""
    if verbose:
        section(f"Champion regression  (threshold >= +{threshold})")
    sorted_gens = sorted(gens.items())
    flagged = []

    for (prev_g, prev_pop), (cur_g, cur_pop) in zip(sorted_gens, sorted_gens[1:]):
        prev_champion = min(prev_pop, key=lambda r: r['val_loss'])
        cur_champion_rows = [r for r in cur_pop if r.get('is_champion') is True]
        if not cur_champion_rows:
            cur_champion_rows = [r for r in cur_pop if r['individual'] == 0]
        if not cur_champion_rows:
            continue
        cur_match = cur_champion_rows[0]
        if cur_match['architecture'] != prev_champion['architecture']:
            continue
        delta = cur_match['val_loss'] - prev_champion['val_loss']
        if delta > threshold:
            flagged.append({
                'prev_gen': prev_g,
                'cur_gen': cur_g,
                'prev_val': prev_champion['val_loss'],
                'cur_val': cur_match['val_loss'],
                'delta': delta,
                'architecture': prev_champion['architecture'],
            })

    result = {'flagged': flagged, 'count': len(flagged)}

    if verbose:
        if not flagged:
            print("  No champion regressions detected.")
        else:
            affected_gens = sorted({f['cur_gen'] for f in flagged})
            head = affected_gens[:8]
            tail = f" ... (+{len(affected_gens) - 8} more)" if len(affected_gens) > 8 else ""
            print(f"  Found {len(flagged)} champion regressions in gens {head}{tail}.")
            print()
            for f in flagged[:15]:
                arch = f['architecture']
                if len(arch) > 60:
                    arch = arch[:57] + '...'
                print(f"    gen {f['prev_gen']:>2}->{f['cur_gen']:<2}: "
                      f"{f['prev_val']:.5f} -> {f['cur_val']:.5f}  (+{f['delta']:.4f})  arch={arch}")
            if len(flagged) > 15:
                print(f"    ... {len(flagged) - 15} more.")
            print()
            print(f"  [!] ANOMALY: Champion regression detected in {len(affected_gens)} generations "
                  f"(architecture preserved, val degraded by >= {threshold} vs parent). "
                  f"This indicates the carried champion is being re-trained and overfitting.")
    return result


def diversity_collapse(
    gens: dict[int, list[dict]],
    monoculture_frac: float = 0.6,
    window: int = 5,
    verbose: bool = True,
) -> dict:
    """Warn if a single architecture occupies >= monoculture_frac of the population
    for >= window consecutive generations."""
    if verbose:
        section(f"Diversity  (warn if any single arch occupies >= {monoculture_frac:.0%} "
                f"for >= {window} consecutive gens)")

    per_gen = []
    per_gen_top_map: dict[int, int] = {}
    per_gen_pop_map: dict[int, int] = {}
    for g, individuals in gens.items():
        counts: dict[str, int] = defaultdict(int)
        for r in individuals:
            counts[r['architecture']] += 1
        unique = len(counts)
        top = max(counts.values())
        pop = len(individuals)
        per_gen_top_map[g] = top
        per_gen_pop_map[g] = pop
        per_gen.append({
            'generation': g,
            'unique_archs': unique,
            'top_cluster_size': top,
            'pop_size': pop,
            'top_cluster_frac': top / pop,
            'is_monoculture': (top / pop) >= monoculture_frac,
        })
        if verbose:
            bar = "#" * top
            marker = "  <- monoculture" if (top / pop) >= monoculture_frac else ""
            print(f"    gen {g:>3}: unique={unique:>2}  top={top}/{pop}  {bar}{marker}")

    runs: list[list[int]] = []
    current: list[int] = []
    for g in gens:
        if (per_gen_top_map[g] / per_gen_pop_map[g]) >= monoculture_frac:
            current.append(g)
        else:
            if current:
                runs.append(current)
            current = []
    if current:
        runs.append(current)

    long_runs = [r for r in runs if len(r) >= window]
    collapse_events = [{'start_gen': r[0], 'end_gen': r[-1], 'length': len(r)} for r in long_runs]

    if verbose:
        if not long_runs:
            print()
            print("  No sustained diversity collapse detected at the configured threshold.")
        else:
            print()
            for r in long_runs:
                last_top = per_gen_top_map[r[-1]]
                last_pop = per_gen_pop_map[r[-1]]
                print(f"  [!] ANOMALY: Diversity collapse: generations {r[0]}-{r[-1]} ({len(r)} gens) "
                      f"have a single architecture occupying >= {monoculture_frac:.0%} of the population; "
                      f"gen {r[-1]} top cluster is {last_top}/{last_pop} = {last_top/last_pop:.0%}.")

    return {'per_generation': per_gen, 'collapse_events': collapse_events}


def duplicate_clusters(gens: dict[int, list[dict]], top_n: int = 5,
                       verbose: bool = True) -> dict:
    """Top architecture clusters in the final generation, with intra-cluster val spread."""
    if verbose:
        section("Top duplicate-architecture clusters (final generation)")
    last_g = max(gens)
    last_pop = gens[last_g]
    counts: dict[str, list[float]] = defaultdict(list)
    for r in last_pop:
        counts[r['architecture']].append(r['val_loss'])

    sorted_clusters = sorted(counts.items(), key=lambda kv: -len(kv[1]))[:top_n]
    clusters = []
    for arch, losses in sorted_clusters:
        if len(losses) <= 1:
            continue
        spread = max(losses) - min(losses)
        clusters.append({
            'architecture': arch,
            'count': len(losses),
            'spread': spread,
            'min_val': min(losses),
            'max_val': max(losses),
        })
        if verbose:
            short = arch if len(arch) <= 60 else arch[:57] + '...'
            print(f"    x{len(losses):>2}  spread={spread:.5f}  arch={short}")
    if verbose and not clusters:
        print("    (no duplicate architectures in the final generation)")

    return {'final_generation': last_g, 'clusters': clusters}


# ── Entrypoint ─────────────────────────────────────────────────────────────────

def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else 'training_log.csv')
    if not path.exists():
        print(f"  [x] {path} not found", file=sys.stderr)
        sys.exit(1)

    rows = load_log(path)
    if not rows:
        print(f"  [x] {path} is empty", file=sys.stderr)
        sys.exit(1)

    gens = by_generation(rows)
    print(f"Analyzing {path}  ({len(rows)} rows, {len(gens)} generations)")

    run_summary(rows, gens)
    best_ever_trajectory(gens)
    champion_regression(gens)
    diversity_collapse(gens)
    duplicate_clusters(gens)
    print()


if __name__ == '__main__':
    main()

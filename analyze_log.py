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

def run_summary(rows: list[dict], gens: dict[int, list[dict]]) -> None:
    section("Run summary")
    pop_sizes = {len(individuals) for individuals in gens.values()}
    print(f"  Generations:       {len(gens)} (gen {min(gens)} - gen {max(gens)})")
    print(f"  Population size:   "
          f"{next(iter(pop_sizes)) if len(pop_sizes) == 1 else f'variable {sorted(pop_sizes)}'}")
    print(f"  Total rows:        {len(rows)}")
    print(f"  Schema:            {'extended' if 'train_loss' in rows[0] else 'legacy (6 col)'}")
    print(f"  Unique archs (lifetime): {len({r['architecture'] for r in rows})}")


def best_ever_trajectory(gens: dict[int, list[dict]], patience: int = 10) -> dict:
    """Print best-ever curve and warn if stagnation exceeds `patience`."""
    section("Best-ever trajectory")
    best_ever, best_gen, best_indiv = float('inf'), None, None
    for g, individuals in gens.items():
        gen_best = min(individuals, key=lambda r: r['val_loss'])
        if gen_best['val_loss'] < best_ever:
            best_ever = gen_best['val_loss']
            best_gen, best_indiv = g, gen_best['individual']
        marker = "  <- new best" if (g == best_gen) else ""
        print(f"  gen {g:>3}: best_so_far={best_ever:.6f}  "
              f"(from gen {best_gen} indiv {best_indiv}){marker}")

    last_gen = max(gens)
    stagnation = last_gen - best_gen
    if stagnation >= patience:
        print()
        print(f"  [!] ANOMALY: Best-ever frozen at {best_ever:.6f} from generation {best_gen}, "
              f"individual {best_indiv} -- {stagnation}-generation stagnation, "
              f"exceeds PATIENCE={patience}.")
    return {'best_ever': best_ever, 'best_gen': best_gen, 'best_indiv': best_indiv,
            'stagnation': stagnation}


def champion_regression(gens: dict[int, list[dict]], threshold: float = 0.01) -> None:
    """Detect cases where the carried-over champion's val got worse after re-training.

    The carried champion lives at individual=0 of the next generation (Population.evolve
    invariant). For extended CSVs we additionally trust the `is_champion` flag.
    """
    section(f"Champion regression  (threshold >= +{threshold})")
    sorted_gens = sorted(gens.items())
    flagged = []

    for (prev_g, prev_pop), (cur_g, cur_pop) in zip(sorted_gens, sorted_gens[1:]):
        prev_champion = min(prev_pop, key=lambda r: r['val_loss'])
        # Prefer explicit flag; fall back to individual==0 invariant
        cur_champion_rows = [r for r in cur_pop if r.get('is_champion') is True]
        if not cur_champion_rows:
            cur_champion_rows = [r for r in cur_pop if r['individual'] == 0]
        if not cur_champion_rows:
            continue
        cur_match = cur_champion_rows[0]
        # Only count it if the architecture is actually preserved (else evolve never carried it)
        if cur_match['architecture'] != prev_champion['architecture']:
            continue
        delta = cur_match['val_loss'] - prev_champion['val_loss']
        if delta > threshold:
            flagged.append((prev_g, cur_g, prev_champion, cur_match, delta))

    if not flagged:
        print("  No champion regressions detected.")
        return

    affected_gens = sorted({cur_g for _, cur_g, *_ in flagged})
    head = affected_gens[:8]
    tail = f" ... (+{len(affected_gens) - 8} more)" if len(affected_gens) > 8 else ""
    print(f"  Found {len(flagged)} champion regressions in gens {head}{tail}.")
    print()
    for prev_g, cur_g, prev, cur, delta in flagged[:15]:
        arch = prev['architecture']
        if len(arch) > 60:
            arch = arch[:57] + '...'
        print(f"    gen {prev_g:>2}->{cur_g:<2}: "
              f"{prev['val_loss']:.5f} -> {cur['val_loss']:.5f}  (+{delta:.4f})  arch={arch}")
    if len(flagged) > 15:
        print(f"    ... {len(flagged) - 15} more.")
    print()
    print(f"  [!] ANOMALY: Champion regression detected in {len(affected_gens)} generations "
          f"(architecture preserved, val degraded by >= {threshold} vs parent). "
          f"This indicates the carried champion is being re-trained and overfitting.")


def diversity_collapse(
    gens: dict[int, list[dict]],
    monoculture_frac: float = 0.6,
    window: int = 5,
) -> None:
    """Warn if a single architecture occupies >= monoculture_frac of the population
    for >= window consecutive generations.

    Counting unique architectures alone undercounts concentration: a population of
    [A, A, A, A, A, A, B, C] has 3 unique values but is plainly a monoculture. The
    max-cluster fraction captures this correctly.
    """
    section(f"Diversity  (warn if any single arch occupies >= {monoculture_frac:.0%} "
            f"for >= {window} consecutive gens)")

    per_gen_unique: dict[int, int] = {}
    per_gen_top: dict[int, int] = {}
    per_gen_pop: dict[int, int] = {}
    for g, individuals in gens.items():
        counts: dict[str, int] = defaultdict(int)
        for r in individuals:
            counts[r['architecture']] += 1
        per_gen_unique[g] = len(counts)
        per_gen_top[g] = max(counts.values())
        per_gen_pop[g] = len(individuals)

    print("  Per-generation diversity (n_unique / top-cluster size / pop):")
    for g in gens:
        n = per_gen_unique[g]
        top = per_gen_top[g]
        pop = per_gen_pop[g]
        bar = "#" * top
        marker = "  <- monoculture" if (top / pop) >= monoculture_frac else ""
        print(f"    gen {g:>3}: unique={n:>2}  top={top}/{pop}  {bar}{marker}")

    runs: list[list[int]] = []
    current: list[int] = []
    for g in gens:
        if (per_gen_top[g] / per_gen_pop[g]) >= monoculture_frac:
            current.append(g)
        else:
            if current:
                runs.append(current)
            current = []
    if current:
        runs.append(current)

    long_runs = [r for r in runs if len(r) >= window]
    if not long_runs:
        print()
        print("  No sustained diversity collapse detected at the configured threshold.")
        return

    print()
    for r in long_runs:
        last_top = per_gen_top[r[-1]]
        last_pop = per_gen_pop[r[-1]]
        print(f"  [!] ANOMALY: Diversity collapse: generations {r[0]}-{r[-1]} ({len(r)} gens) "
              f"have a single architecture occupying >= {monoculture_frac:.0%} of the population; "
              f"gen {r[-1]} top cluster is {last_top}/{last_pop} = {last_top/last_pop:.0%}.")


def duplicate_clusters(gens: dict[int, list[dict]], top_n: int = 5) -> None:
    """Top architecture clusters in the final generation, with intra-cluster val spread."""
    section("Top duplicate-architecture clusters (final generation)")
    last_g = max(gens)
    last_pop = gens[last_g]
    counts: dict[str, list[float]] = defaultdict(list)
    for r in last_pop:
        counts[r['architecture']].append(r['val_loss'])

    sorted_clusters = sorted(counts.items(), key=lambda kv: -len(kv[1]))[:top_n]
    printed = 0
    for arch, losses in sorted_clusters:
        if len(losses) <= 1:
            continue
        spread = max(losses) - min(losses)
        short = arch if len(arch) <= 60 else arch[:57] + '...'
        print(f"    x{len(losses):>2}  spread={spread:.5f}  arch={short}")
        printed += 1
    if printed == 0:
        print("    (no duplicate architectures in the final generation)")


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

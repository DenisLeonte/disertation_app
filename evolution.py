"""
Evolution — population management, training helpers, and CSV logging.
"""

from __future__ import annotations

import csv
import random
import time
from pathlib import Path

import torch
import torch.nn as nn

from genome import Genome, DynamicConvNet


# ── Per-individual training ────────────────────────────────────────────────────

def train_epoch(model: DynamicConvNet, loader, optimizer, criterion) -> float:
    model.train()
    total = n = 0
    for x, y in loader:
        pred = model(x)
        loss = criterion(pred, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        total += loss.item() * x.size(0)
        n += x.size(0)
    return total / n


@torch.no_grad()
def eval_loss(model: DynamicConvNet, loader, criterion) -> float:
    model.eval()
    total = n = 0
    for x, y in loader:
        total += criterion(model(x), y).item() * x.size(0)
        n += x.size(0)
    return total / n


# ── Population ─────────────────────────────────────────────────────────────────

class Population:
    def __init__(self, genomes: list[Genome]):
        self.genomes = genomes
        self.scores  = [float('inf')] * len(genomes)

    def __len__(self) -> int:
        return len(self.genomes)

    def best(self) -> tuple[Genome, float]:
        i = min(range(len(self.scores)), key=lambda i: self.scores[i])
        return self.genomes[i], self.scores[i]

    def run_generation(
        self,
        train_loader,
        val_loader,
        device,
        epochs_per_gen: int,
        lr: float,
        criterion,
    ):
        """Train every individual, evaluate on val set, update self.scores."""
        for idx, genome in enumerate(self.genomes):
            t0    = time.perf_counter()
            model = genome.build_model(device)
            opt   = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

            for _ in range(epochs_per_gen):
                train_epoch(model, train_loader, opt, criterion)

            val = eval_loss(model, val_loader, criterion)
            genome.sync_from(model)
            self.scores[idx] = val

            print(f"    [{idx+1:02d}/{len(self)}]  val={val:.5f}"
                  f"  params={genome.n_params/1e6:.2f}M"
                  f"  layers={len(genome.specs)}"
                  f"  {time.perf_counter()-t0:.1f}s")

        best_genome, best_val = self.best()
        print(f"  → generation best: {best_val:.5f}  arch: {best_genome.describe()}")

    def evolve(self, n_survivors: int, rng: random.Random) -> 'Population':
        """Elitist selection + mutation to produce the next generation."""
        ranked    = sorted(range(len(self.scores)), key=lambda i: self.scores[i])
        survivors = [self.genomes[i].clone() for i in ranked[:n_survivors]]

        new_genomes = list(survivors)
        while len(new_genomes) < len(self.genomes):
            parent = rng.choice(survivors)
            new_genomes.append(parent.mutate(rng))

        return Population(new_genomes)


# ── CSV logger ─────────────────────────────────────────────────────────────────

def save_checkpoint(path: Path, pop: 'Population', gen: int,
                    best_ever: float, best_history: list[float],
                    rng: random.Random):
    torch.save({
        'gen':            gen,
        'best_ever':      best_ever,
        'best_history':   best_history,
        'rng_state':      rng.getstate(),
        'torch_rng_state': torch.get_rng_state(),
        'genomes': [
            {'specs': g.specs, 'blocks': g._blocks, 'head': g._head}
            for g in pop.genomes
        ],
        'scores': pop.scores,
    }, path)


def load_checkpoint(path: Path, rng: random.Random) -> tuple['Population', int, float, list[float]]:
    ckpt = torch.load(path, map_location='cpu', weights_only=False)
    rng.setstate(ckpt['rng_state'])
    torch.set_rng_state(ckpt['torch_rng_state'])
    genomes = [Genome(g['specs'], g['blocks'], g['head']) for g in ckpt['genomes']]
    pop = Population(genomes)
    pop.scores = ckpt['scores']
    return pop, ckpt['gen'], ckpt['best_ever'], ckpt['best_history']


class Logger:
    HEADER = ['generation', 'individual', 'val_loss',
              'n_params', 'n_layers', 'architecture']

    def __init__(self, path: Path, append: bool = False):
        self.path = path
        if not append:
            with open(path, 'w', newline='', encoding='utf-8') as f:
                csv.writer(f).writerow(self.HEADER)

    def log(self, gen: int, pop: Population):
        with open(self.path, 'a', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            for i, (genome, score) in enumerate(zip(pop.genomes, pop.scores)):
                w.writerow([
                    gen, i, f"{score:.6f}",
                    genome.n_params, len(genome.specs), genome.describe(),
                ])


# ── Stop condition ─────────────────────────────────────────────────────────────

def plateau_detected(history: list[float], patience: int,
                     min_delta: float = 1e-4) -> bool:
    """Return True if best val loss hasn't improved by min_delta in `patience` gens."""
    if len(history) < patience:
        return False
    recent = history[-patience:]
    return (max(recent) - min(recent)) < min_delta

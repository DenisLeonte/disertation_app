"""
generate_figures.py — produces four result figures for the dissertation.

Figures produced:
    fig_4_1_val_loss.pdf        Best-ever validation loss over generations
    fig_4_2_layer_collapse.pdf  Mean layer count over generations
    fig_4_3_diversity.pdf       Unique architectures per generation
    fig_4_4_baseline_curve.pdf  Baseline train vs val loss over epochs

Usage:
    python generate_figures.py

Requires training_log.csv in the current directory.
Baseline curve data is hardcoded from the baseline run output.
"""

import csv
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

# ── Style ──────────────────────────────────────────────────────────────────────
plt.rcParams.update({
    "font.family":      "serif",
    "font.size":        11,
    "axes.titlesize":   12,
    "axes.labelsize":   11,
    "xtick.labelsize":  10,
    "ytick.labelsize":  10,
    "legend.fontsize":  10,
    "figure.dpi":       150,
    "axes.spines.top":  False,
    "axes.spines.right": False,
    "axes.grid":        True,
    "grid.alpha":       0.3,
    "grid.linestyle":   "--",
})

OUT = Path(".")

# ── Load training log ──────────────────────────────────────────────────────────

def load_log(path: str = "training_log.csv"):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append({
                "generation":   int(r["generation"]),
                "val_loss":     float(r["val_loss"]),
                "n_layers":     int(r["n_layers"]),
                "architecture": r["architecture"],
                "best_ever":    float(r["best_ever"]) if r.get("best_ever") else None,
            })
    return rows

rows = load_log()

# Aggregate per generation
gens = sorted({r["generation"] for r in rows})
best_ever_per_gen   = {}
mean_layers_per_gen = {}
unique_archs_per_gen = {}

by_gen = defaultdict(list)
for r in rows:
    by_gen[r["generation"]].append(r)

for g in gens:
    pop = by_gen[g]
    best_ever_per_gen[g]    = min(r["best_ever"] for r in pop if r["best_ever"] is not None)
    mean_layers_per_gen[g]  = sum(r["n_layers"] for r in pop) / len(pop)
    unique_archs_per_gen[g] = len({r["architecture"] for r in pop})

x = list(gens)

# ── Figure 4.1 — Best-ever validation loss ─────────────────────────────────────
fig, ax = plt.subplots(figsize=(7, 4))
y = [best_ever_per_gen[g] for g in x]
ax.plot(x, y, color="#2563eb", linewidth=1.8, marker="o", markersize=3)
ax.axvline(x=21, color="#dc2626", linewidth=1.2, linestyle="--", label="Best found (gen 21)")
ax.set_xlabel("Generation")
ax.set_ylabel("Best-ever validation MSE")
ax.set_title("Best-ever validation loss over generations")
ax.legend()
ax.xaxis.set_major_locator(ticker.MultipleLocator(5))
fig.tight_layout()
fig.savefig(OUT / "fig_4_1_val_loss.pdf")
plt.close(fig)
print("Saved fig_4_1_val_loss.pdf")

# ── Figure 4.2 — Mean layer count ──────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(7, 4))
y = [mean_layers_per_gen[g] for g in x]
ax.plot(x, y, color="#16a34a", linewidth=1.8, marker="o", markersize=3)
ax.set_xlabel("Generation")
ax.set_ylabel("Mean number of hidden layers")
ax.set_title("Architecture collapse: mean layer count over generations")
ax.xaxis.set_major_locator(ticker.MultipleLocator(5))
ax.yaxis.set_major_locator(ticker.MultipleLocator(1))
fig.tight_layout()
fig.savefig(OUT / "fig_4_2_layer_collapse.pdf")
plt.close(fig)
print("Saved fig_4_2_layer_collapse.pdf")

# ── Figure 4.3 — Unique architectures ─────────────────────────────────────────
fig, ax = plt.subplots(figsize=(7, 4))
y = [unique_archs_per_gen[g] for g in x]
ax.plot(x, y, color="#9333ea", linewidth=1.8, marker="o", markersize=3)
ax.set_xlabel("Generation")
ax.set_ylabel("Unique architectures in population")
ax.set_title("Population diversity over generations")
ax.xaxis.set_major_locator(ticker.MultipleLocator(5))
ax.yaxis.set_major_locator(ticker.MultipleLocator(2))
fig.tight_layout()
fig.savefig(OUT / "fig_4_3_diversity.pdf")
plt.close(fig)
print("Saved fig_4_3_diversity.pdf")

# ── Figure 4.4 — Baseline training curve ──────────────────────────────────────
# Hardcoded from baseline run output
epochs     = [20,  40,  60,  80,  100, 120, 140, 160, 180, 200]
train_loss = [0.37761, 0.34595, 0.32196, 0.29142, 0.27076,
              0.25774, 0.23390, 0.22380, 0.21222, 0.19906]
val_loss   = [0.40316, 0.40909, 0.42663, 0.44901, 0.46505,
              0.47189, 0.48736, 0.51379, 0.51117, 0.52410]

fig, ax = plt.subplots(figsize=(7, 4))
ax.plot(epochs, train_loss, color="#2563eb", linewidth=1.8,
        marker="o", markersize=4, label="Training loss")
ax.plot(epochs, val_loss,   color="#dc2626", linewidth=1.8,
        marker="s", markersize=4, label="Validation loss")
ax.axvline(x=20, color="#f59e0b", linewidth=1.2, linestyle="--",
           label="Best val (epoch 20)")
ax.set_xlabel("Epoch")
ax.set_ylabel("MSE")
ax.set_title("Baseline CNN: training vs validation loss")
ax.legend()
ax.xaxis.set_major_locator(ticker.MultipleLocator(20))
fig.tight_layout()
fig.savefig(OUT / "fig_4_4_baseline_curve.pdf")
plt.close(fig)
print("Saved fig_4_4_baseline_curve.pdf")

print("\nAll figures saved.")
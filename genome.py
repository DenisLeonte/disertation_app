"""
Genome — architecture + weight encoding for neuroevolution.

Each Genome holds:
  specs  : list of LayerSpec  (hidden layers only; head is always a 1×1 projection)
  weights: per-layer BlockWeights + HeadWeights  (None until first training)

Mutations
---------
  mutate_weights  — add Gaussian noise to all weight tensors
  add_layer       — insert a near-identity layer at a random position
  remove_layer    — drop a random hidden layer, repair channel mismatch
  resize_layer    — change a layer's width, resize neighbouring weight tensors
"""

from __future__ import annotations

import copy
import random
import torch
import torch.nn as nn
from torch import Tensor
from dataclasses import dataclass
from era5_dataset import N_CHANNELS, N_TARGETS

MIN_LAYERS   = 3
MAX_LAYERS   = 16
CHANNEL_OPTS = [32, 64, 128, 256, 512, 768, 1024]
KERNEL_OPTS  = [1, 3]


# ── Architecture spec ──────────────────────────────────────────────────────────

@dataclass
class LayerSpec:
    out_channels: int
    kernel_size:  int = 3


# ── Dynamic model ──────────────────────────────────────────────────────────────

class DynamicConvNet(nn.Module):
    """ConvNet whose depth and width are determined by a list of LayerSpecs."""

    def __init__(self, specs: list[LayerSpec],
                 in_ch: int = N_CHANNELS, out_ch: int = N_TARGETS,
                 dropout: float = 0.1):
        super().__init__()
        blocks, prev = [], in_ch
        for s in specs:
            blocks.append(nn.Sequential(
                nn.Conv2d(prev, s.out_channels, s.kernel_size,
                          padding=s.kernel_size // 2, bias=False),
                nn.BatchNorm2d(s.out_channels),
                nn.GELU(),
                nn.Dropout2d(p=dropout),
            ))
            prev = s.out_channels
        self.blocks = nn.ModuleList(blocks)
        self.head   = nn.Conv2d(prev, out_ch, 1)

    def forward(self, x: Tensor) -> Tensor:
        for block in self.blocks:
            x = block(x)
        return self.head(x)


# ── Per-layer weight containers ────────────────────────────────────────────────

@dataclass
class BlockWeights:
    conv_w: Tensor   # (out, in, kH, kW)
    bn_w:   Tensor   # (out,) gamma
    bn_b:   Tensor   # (out,) beta
    bn_rm:  Tensor   # (out,) running_mean
    bn_rv:  Tensor   # (out,) running_var

    def clone(self) -> 'BlockWeights':
        return BlockWeights(
            self.conv_w.clone(), self.bn_w.clone(), self.bn_b.clone(),
            self.bn_rm.clone(),  self.bn_rv.clone(),
        )


@dataclass
class HeadWeights:
    w: Tensor   # (N_TARGETS, in_ch, 1, 1)
    b: Tensor   # (N_TARGETS,)

    def clone(self) -> 'HeadWeights':
        return HeadWeights(self.w.clone(), self.b.clone())


# ── Weight extraction / injection ─────────────────────────────────────────────

def _extract(model: DynamicConvNet) -> tuple[list[BlockWeights], HeadWeights]:
    blocks = []
    for blk in model.blocks:
        conv, bn = blk[0], blk[1]
        blocks.append(BlockWeights(
            conv_w=conv.weight.detach().cpu().clone(),
            bn_w=bn.weight.detach().cpu().clone(),
            bn_b=bn.bias.detach().cpu().clone(),
            bn_rm=bn.running_mean.detach().cpu().clone(),
            bn_rv=bn.running_var.detach().cpu().clone(),
        ))
    head = HeadWeights(
        w=model.head.weight.detach().cpu().clone(),
        b=model.head.bias.detach().cpu().clone(),
    )
    return blocks, head


def _inject(model: DynamicConvNet, blocks: list[BlockWeights], head: HeadWeights):
    for blk, bw in zip(model.blocks, blocks):
        conv, bn = blk[0], blk[1]
        conv.weight.data.copy_(bw.conv_w)
        bn.weight.data.copy_(bw.bn_w)
        bn.bias.data.copy_(bw.bn_b)
        bn.running_mean.copy_(bw.bn_rm)
        bn.running_var.copy_(bw.bn_rv)
    model.head.weight.data.copy_(head.w)
    model.head.bias.data.copy_(head.b)


# ── Weight resize helpers ──────────────────────────────────────────────────────

def _resize_1d(t: Tensor, n: int, fill: float) -> Tensor:
    """Crop or pad a 1-D tensor to length n."""
    if t.shape[0] == n:
        return t.clone()
    out = torch.full((n,), fill, dtype=t.dtype)
    k   = min(n, t.shape[0])
    out[:k] = t[:k]
    return out


def _resize_conv(t: Tensor, new_out: int, new_in: int, new_k: int) -> Tensor:
    """Crop/pad a conv weight (out, in, kH, kW) to a new shape."""
    old_out, old_in, old_k, _ = t.shape

    if new_k != old_k:
        w = torch.zeros(new_out, new_in, new_k, new_k)
        nn.init.kaiming_normal_(w, nonlinearity='relu')
        return w * 0.01

    # --- out dimension ---
    if new_out < old_out:
        t_out = t[:new_out].clone()
    elif new_out > old_out:
        extra = torch.zeros(new_out - old_out, old_in, old_k, old_k)
        nn.init.kaiming_normal_(extra, nonlinearity='relu')
        t_out = torch.cat([t, extra * 0.01], dim=0)
    else:
        t_out = t.clone()

    # --- in dimension ---
    if new_in < old_in:
        return t_out[:, :new_in]
    elif new_in > old_in:
        pad = torch.zeros(new_out, new_in - old_in, old_k, old_k)
        return torch.cat([t_out, pad], dim=1)
    return t_out


def _near_identity_conv(ch: int, k: int) -> Tensor:
    """Conv weight (ch, ch, k, k) that starts as ~identity."""
    w = torch.zeros(ch, ch, k, k)
    c = k // 2
    w[:, :, c, c] = torch.eye(ch)
    return w + 1e-3 * torch.randn_like(w)


def _resize_block(bw: BlockWeights, new_out: int, new_in: int, k: int) -> BlockWeights:
    return BlockWeights(
        conv_w=_resize_conv(bw.conv_w, new_out, new_in, k),
        bn_w=_resize_1d(bw.bn_w,  new_out, 1.0),
        bn_b=_resize_1d(bw.bn_b,  new_out, 0.0),
        bn_rm=_resize_1d(bw.bn_rm, new_out, 0.0),
        bn_rv=_resize_1d(bw.bn_rv, new_out, 1.0),
    )


# ── Genome ─────────────────────────────────────────────────────────────────────

class Genome:
    def __init__(
        self,
        specs:  list[LayerSpec],
        blocks: list[BlockWeights] | None = None,
        head:   HeadWeights | None        = None,
        mutation_type: str | None = None,
        parent_idx:    int | None = None,
    ):
        self.specs   = specs
        self._blocks = blocks   # None → random init on first build
        self._head   = head
        # Lineage metadata, populated by Population.evolve. None for genesis genomes.
        self.mutation_type = mutation_type
        self.parent_idx    = parent_idx

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _in_ch_of(self, i: int) -> int:
        """Input channels for hidden layer i."""
        return N_CHANNELS if i == 0 else self.specs[i - 1].out_channels

    def _has_weights(self) -> bool:
        return self._blocks is not None

    # ── Build / sync ───────────────────────────────────────────────────────────

    def build_model(self, device=None) -> DynamicConvNet:
        model = DynamicConvNet(self.specs)
        if self._has_weights():
            _inject(model, self._blocks, self._head)
        if device is not None:
            model = model.to(device)
        return model

    def sync_from(self, model: DynamicConvNet):
        """Pull trained weights back from a model (must be same architecture)."""
        self._blocks, self._head = _extract(model)

    # ── Clone ──────────────────────────────────────────────────────────────────

    def clone(self) -> 'Genome':
        blocks = [b.clone() for b in self._blocks] if self._blocks else None
        head   = self._head.clone() if self._head else None
        return Genome(copy.deepcopy(self.specs), blocks, head,
                      self.mutation_type, self.parent_idx)

    # ── Factory ────────────────────────────────────────────────────────────────

    @classmethod
    def random(cls, rng: random.Random,
               depth_range: tuple[int, int] = (4, 10)) -> 'Genome':
        depth = rng.randint(*depth_range)
        specs = [
            LayerSpec(
                out_channels=rng.choice(CHANNEL_OPTS),  # up to 1024 initially
                kernel_size=rng.choice(KERNEL_OPTS),
            )
            for _ in range(depth)
        ]
        return cls(specs)

    # ── Mutations ──────────────────────────────────────────────────────────────

    def mutate_weights(self, sigma: float) -> 'Genome':
        g = self.clone()
        if not g._has_weights():
            return g
        for bw in g._blocks:
            for attr in ('conv_w', 'bn_w', 'bn_b'):
                t = getattr(bw, attr)
                setattr(bw, attr, t + sigma * torch.randn_like(t))
        g._head.w = g._head.w + sigma * torch.randn_like(g._head.w)
        g._head.b = g._head.b + sigma * torch.randn_like(g._head.b)
        return g

    def add_layer(self, rng: random.Random) -> 'Genome':
        """Insert a near-identity layer at a random position."""
        if len(self.specs) >= MAX_LAYERS:
            return self.clone()
        g        = self.clone()
        pos      = rng.randint(0, len(g.specs))
        prev_out = N_CHANNELS if pos == 0 else g.specs[pos - 1].out_channels
        new_spec = LayerSpec(out_channels=prev_out,
                             kernel_size=rng.choice(KERNEL_OPTS))
        g.specs.insert(pos, new_spec)

        if g._has_weights():
            new_bw = BlockWeights(
                conv_w=_near_identity_conv(prev_out, new_spec.kernel_size),
                bn_w=torch.ones(prev_out),
                bn_b=torch.zeros(prev_out),
                bn_rm=torch.zeros(prev_out),
                bn_rv=torch.ones(prev_out),
            )
            g._blocks.insert(pos, new_bw)
        return g

    def remove_layer(self, rng: random.Random) -> 'Genome':
        """Drop a random hidden layer, repairing any channel mismatch."""
        if len(self.specs) <= MIN_LAYERS:
            return self.clone()
        g   = self.clone()
        pos = rng.randint(0, len(g.specs) - 1)
        g.specs.pop(pos)

        if g._has_weights():
            g._blocks.pop(pos)
            if pos < len(g.specs):
                # Repair next layer's in_channels
                new_in = g._in_ch_of(pos)
                bw     = g._blocks[pos]
                if bw.conv_w.shape[1] != new_in:
                    g._blocks[pos] = _resize_block(
                        bw, bw.conv_w.shape[0], new_in, g.specs[pos].kernel_size
                    )
            else:
                # Removed last hidden layer → repair head
                new_in = N_CHANNELS if not g.specs else g.specs[-1].out_channels
                if g._head.w.shape[1] != new_in:
                    g._head.w = _resize_conv(g._head.w, N_TARGETS, new_in, 1)
        return g

    def resize_layer(self, rng: random.Random) -> 'Genome':
        """Change a random layer's width, resizing its and its successor's weights."""
        if not self.specs:
            return self.clone()
        g       = self.clone()
        pos     = rng.randint(0, len(g.specs) - 1)
        old_out = g.specs[pos].out_channels
        new_out = rng.choice([c for c in CHANNEL_OPTS if c != old_out])
        g.specs[pos] = LayerSpec(out_channels=new_out,
                                 kernel_size=g.specs[pos].kernel_size)

        if g._has_weights():
            # Resize current block
            g._blocks[pos] = _resize_block(
                g._blocks[pos], new_out, g._in_ch_of(pos), g.specs[pos].kernel_size
            )
            # Repair successor's in_channels
            if pos + 1 < len(g.specs):
                nxt = g._blocks[pos + 1]
                g._blocks[pos + 1] = _resize_block(
                    nxt, nxt.conv_w.shape[0], new_out, g.specs[pos + 1].kernel_size
                )
            else:
                g._head.w = _resize_conv(g._head.w, N_TARGETS, new_out, 1)
        return g

    def mutate(self, rng: random.Random) -> 'Genome':
        r = rng.random()
        if r < 0.60:
            child = self.mutate_weights(sigma=rng.uniform(0.0005, 0.005))
            child.mutation_type = 'weights'
        elif r < 0.75:
            child = self.add_layer(rng)
            child.mutation_type = 'add_layer'
        elif r < 0.88:
            child = self.remove_layer(rng)
            child.mutation_type = 'remove_layer'
        else:
            child = self.resize_layer(rng)
            child.mutation_type = 'resize_layer'
        return child

    # ── Info ───────────────────────────────────────────────────────────────────

    def describe(self) -> str:
        parts = [f"{s.out_channels}/k{s.kernel_size}" for s in self.specs]
        return '[' + '→'.join(parts) + ']'

    @property
    def n_params(self) -> int:
        return sum(p.numel() for p in DynamicConvNet(self.specs).parameters())

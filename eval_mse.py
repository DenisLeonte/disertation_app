import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from era5_dataset import get_splits
from genome import Genome
from evolution import eval_loss

device = torch.device("cpu")
_, _, test_loader = get_splits(batch_size=1024)

ckpt = torch.load("best_model.pth", map_location=device, weights_only=False)
genome = Genome(ckpt["specs"], ckpt["blocks"], ckpt["head"])
model = genome.build_model(device)
criterion = nn.MSELoss()
test_mse = eval_loss(model, test_loader, criterion)

print(f"Test MSE:  {test_mse:.5f}")
print(f"Arch:      {genome.describe()}")
print(f"Params:    {genome.n_params}")
print(f"Best gen:  {ckpt['generation']}")
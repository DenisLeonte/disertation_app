import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from era5_dataset import get_splits, N_CHANNELS, N_TARGETS
from evolution import train_epoch, eval_loss
from main import extract_tensors

try:
    import torch_directml
    device = torch_directml.device(0)
    print(f"Using DirectML: {torch_directml.device_name(0)}")
except ImportError:
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"Using: {device}")

train_loader_raw, val_loader_raw, test_loader_raw = get_splits(batch_size=1024)

train_X, train_Y = extract_tensors(train_loader_raw)
val_X, val_Y = extract_tensors(val_loader_raw)
test_X, test_Y = extract_tensors(test_loader_raw)

train_loader = DataLoader(TensorDataset(train_X.to(device), train_Y.to(device)), batch_size=1024, shuffle=True)
val_loader = DataLoader(TensorDataset(val_X.to(device), val_Y.to(device)), batch_size=1024, shuffle=False)
test_loader = DataLoader(TensorDataset(test_X.to(device), test_Y.to(device)), batch_size=1024, shuffle=False)

class BaselineCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.blocks = nn.Sequential(
            nn.Conv2d(N_CHANNELS, 64, 3, padding=1, bias=False),
            nn.BatchNorm2d(64), nn.GELU(),
            nn.Conv2d(64, 64, 3, padding=1, bias=False),
            nn.BatchNorm2d(64), nn.GELU(),
            nn.Conv2d(64, 32, 3, padding=1, bias=False),
            nn.BatchNorm2d(32), nn.GELU(),
        )
        self.head = nn.Conv2d(32, N_TARGETS, 1)

    def forward(self, x):
        return self.head(self.blocks(x))

model = BaselineCNN().to(device)
opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
criterion = nn.MSELoss()

best_val = float("inf")
for epoch in range(200):
    train_loss = train_epoch(model, train_loader, opt, criterion)
    val_loss = eval_loss(model, val_loader, criterion)
    if val_loss < best_val:
        best_val = val_loss
        torch.save(model.state_dict(), "baseline_best.pth")
    if (epoch + 1) % 20 == 0:
        print(f"Epoch {epoch+1:>3}: train={train_loss:.5f}  val={val_loss:.5f}  best={best_val:.5f}")

model.load_state_dict(torch.load("baseline_best.pth", weights_only=False))
test_mse = eval_loss(model, test_loader, criterion)
n_params = sum(p.numel() for p in model.parameters())
print(f"\nBaseline test MSE: {test_mse:.5f}")
print(f"Params:            {n_params}")
print(f"Best val:          {best_val:.5f}")
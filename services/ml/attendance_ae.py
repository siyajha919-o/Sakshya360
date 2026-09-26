"""PyTorch 1-D convolutional autoencoder for daily attendance sequences.

Trained only on genuine centres. The 6-number bottleneck is far smaller than the 30-day input, so the
model can only reproduce the underlying *shape* of a month (level, trend, a festival dip) and not the
day-to-day noise. The residual is therefore the noise, and it is informative in both directions:

  * too large  – spikes / sudden jumps the shape cannot explain (inspection-day spikes, over-reporting)
  * too small  – a register that is smoother than any real centre (copy-paste, ghost beneficiaries)

sequence_score is |z| of log residual energy against genuine centres, divided by the 99th percentile,
so > 1 is abnormal. Large per-day residuals mark individual suspicious days.
"""
import numpy as np
import torch
from torch import nn

SEQ_LEN = 30
LATENT = 6


def prepare(values, sanctioned):
    a = np.asarray(values, dtype=np.float32) / max(float(sanctioned), 1.0)
    if len(a) >= SEQ_LEN:
        return a[-SEQ_LEN:], 0
    pad = SEQ_LEN - len(a)
    return np.concatenate([np.full(pad, a.mean(), dtype=np.float32), a]), pad


class AttendanceAE(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv1d(1, 16, 5, padding=2), nn.ReLU(),
            nn.Conv1d(16, 16, 5, stride=2, padding=2), nn.ReLU(),   # 30 -> 15
            nn.Conv1d(16, 8, 3, stride=3), nn.ReLU(),               # 15 -> 5
            nn.Flatten(), nn.Linear(40, LATENT),
        )
        self.decoder = nn.Sequential(
            nn.Linear(LATENT, 40), nn.ReLU(), nn.Unflatten(1, (8, 5)),
            nn.ConvTranspose1d(8, 16, 3, stride=3), nn.ReLU(),      # 5 -> 15
            nn.ConvTranspose1d(16, 16, 2, stride=2), nn.ReLU(),     # 15 -> 30
            nn.Conv1d(16, 1, 5, padding=2),
        )

    def forward(self, x):
        # The series mean is removed and added back, so the model reconstructs shape, not level.
        mean = x.mean(dim=2, keepdim=True)
        return self.decoder(self.encoder(x - mean)) + mean


def _residuals(model, X):
    with torch.no_grad():
        return (model(X) - X).squeeze(1).numpy()


def train(sequences, epochs=80, seed=7):
    torch.manual_seed(seed)
    X = torch.tensor(np.stack(sequences))[:, None, :]
    model = AttendanceAE()
    opt = torch.optim.Adam(model.parameters(), lr=3e-3)
    loader = torch.utils.data.DataLoader(torch.utils.data.TensorDataset(X), batch_size=128, shuffle=True)
    for _ in range(epochs):
        for (batch,) in loader:
            opt.zero_grad()
            loss = nn.functional.mse_loss(model(batch), batch)
            loss.backward()
            opt.step()
    model.eval()
    resid = _residuals(model, X)
    log_e = np.log((resid ** 2).mean(axis=1) + 1e-9)
    mu, sd = float(log_e.mean()), float(log_e.std())
    return model, {
        "day_threshold": float(np.percentile(np.abs(resid), 99.5)),
        "log_energy_mean": mu,
        "log_energy_std": sd,
        "z_threshold": float(np.percentile(np.abs((log_e - mu) / sd), 99)),
    }


def score(model, thresholds, values, sanctioned):
    x, pad = prepare(values, sanctioned)
    with torch.no_grad():
        rec = model(torch.tensor(x)[None, None, :]).squeeze().numpy()
    resid = x - rec
    z = (np.log((resid ** 2).mean() + 1e-9) - thresholds["log_energy_mean"]) / thresholds["log_energy_std"]
    days = [int(i - pad) for i in np.where(np.abs(resid) > thresholds["day_threshold"])[0] if i >= pad]
    return {
        "sequence_score": round(float(abs(z) / thresholds["z_threshold"]), 3),  # > 1 is abnormal
        "direction": "too_regular" if z < 0 else "irregular",
        "anomalous_days": days,
        "reconstruction": [round(float(v * sanctioned), 1) for v in rec[pad:]],
    }

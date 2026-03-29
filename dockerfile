# CPU-based PyTorch container for Windows Docker Desktop
# NOTE: AMD GPU passthrough is not supported in Docker on Windows.
#       For GPU acceleration on Windows, run natively — see README below.
FROM python:3.11-slim

WORKDIR /app

# Install PyTorch (CPU build) + torchvision
RUN pip install --no-cache-dir \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY main.py .

# Mount ./data and ./models as volumes when running to persist downloads & checkpoints
CMD ["python", "main.py"]

#!/usr/bin/env bash
set -e

IMAGE="ml-training-rocm"

echo "==> Building Docker image..."
docker build -t $IMAGE .

echo "==> Running training container..."
docker run --rm \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add video \
  --group-add render \
  --ipc=host \
  --shm-size=8g \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/models:/app" \
  $IMAGE

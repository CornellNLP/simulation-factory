# syntax=docker/dockerfile:1
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y gcc g++ && rm -rf /var/lib/apt/lists/*

# Pre-built wheels for heavy deps — avoids compiling from source
RUN pip install --only-binary=:all: numpy scipy

# CPU-only torch so convokit doesn't pull the ~5GB NVIDIA CUDA stack
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch

COPY requirements.txt .
RUN pip install --no-cache-dir --retries 5 --timeout 120 -r requirements.txt
COPY judge.py exporter.py app.py ./
EXPOSE 8080
# binds 0.0.0.0 *inside* the container; still private because the port isn't published
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]

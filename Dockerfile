FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for healthcheck and UV
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install UV
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency file
COPY pyproject.toml ./

# Install Python dependencies using UV
RUN uv pip install --system --no-cache fastapi "uvicorn[standard]"

# Copy application code
COPY src/ ./src/
COPY static/ ./static/
COPY index.html ./

# Expose port
EXPOSE 8765

# Run the application
CMD ["python", "-m", "src.main"]

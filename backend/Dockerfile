FROM python:3.11-slim

# Set timezone to UTC for consistent datetime handling
ENV TZ=UTC

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install additional dependencies for alembic
RUN pip install --no-cache-dir alembic

# Copy application code
COPY . .

# Create directory for data if needed
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/api/status/health')" || exit 1

# Run migrations and start server
CMD alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000

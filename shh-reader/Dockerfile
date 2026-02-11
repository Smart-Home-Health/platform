FROM python:3.11-slim

# Install system dependencies for GPIO and serial
RUN apt-get update && apt-get install -y --no-install-recommends \
    gpiod \
    libgpiod-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY shh_reader/ ./shh_reader/

# Create data directory for SQLite
RUN mkdir -p /data

# Environment
ENV PYTHONUNBUFFERED=1
ENV SHH_READER_DATA_DIR=/data

# Expose NiceGUI web UI port
EXPOSE 8080

# Run the application
CMD ["python", "-m", "shh_reader", "--host", "0.0.0.0", "--port", "8080"]

# BeatForge Production Dockerfile
FROM node:20-slim

# Install system dependencies for FFmpeg and Python
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production

# Copy Python requirements and install
COPY requirements.txt ./
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Expose port (Cloud Run will set PORT env var automatically)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]

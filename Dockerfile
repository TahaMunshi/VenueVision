# Multi-stage build for VenueVision
# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

RUN npm run build

# Stage 2: Python backend with built frontend
FROM python:3.11-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY server ./server

# Copy built frontend from previous stage
COPY --from=frontend-build /app/dist ./dist

# Create required directories
RUN mkdir -p ./server/static/uploads \
    && mkdir -p ./server/static/user_assets \
    && mkdir -p ./server/static/models \
    && mkdir -p ./server/temp/instantmesh \
    && mkdir -p ./server/migrations

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:5000/api/v1/health')" || exit 1

# Start application
CMD ["python", "server/app.py"]



# =============================================================================
# VenueVision - Event Space Visualizer
# =============================================================================
#
# To run (recommended): use docker-compose so the database starts first:
#
#   docker-compose up --build
#
# Then open http://localhost:5000/mobile
#
# Optional: set JWT_SECRET in the environment or in a .env file for production.
# =============================================================================

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

# System deps: build (for some pip wheels), PostgreSQL, OpenCV runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# Python dependencies (all app + healthcheck deps are in requirements.txt)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend code
COPY server ./server

# Built frontend from stage 1
COPY --from=frontend-build /app/dist ./dist

# Create required directories (uploads, user assets, models, temp, migrations)
RUN mkdir -p ./server/static/uploads \
    && mkdir -p ./server/static/user_assets \
    && mkdir -p ./server/static/models \
    && mkdir -p ./server/temp/instantmesh \
    && mkdir -p ./server/migrations

EXPOSE 5000

# Health check (requires 'requests' in requirements.txt)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:5000/api/v1/health', timeout=5)" || exit 1

# Default: start app. Use docker-compose so DB is up and setup_database.py runs first.
CMD ["python", "server/app.py"]

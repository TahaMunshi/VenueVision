#!/bin/bash
# VenueVision Docker Startup Script
# This script starts the entire application using Docker

echo "========================================"
echo "   VenueVision Docker Launcher"
echo "========================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running!"
    echo ""
    echo "Please start Docker and try again."
    echo ""
    exit 1
fi

echo "[OK] Docker is running"
echo ""

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null; then
    echo "[ERROR] docker-compose not found!"
    echo ""
    echo "Please install docker-compose:"
    echo "  sudo apt install docker-compose  # Ubuntu/Debian"
    echo "  sudo yum install docker-compose  # CentOS/RHEL"
    echo "  brew install docker-compose      # macOS"
    echo ""
    exit 1
fi

echo "[OK] docker-compose is available"
echo ""

echo "Starting VenueVision..."
echo ""
echo "This will:"
echo "  1. Build the application (first time only)"
echo "  2. Start PostgreSQL database"
echo "  3. Set up database schema and demo user"
echo "  4. Start the Flask server"
echo ""
echo "Please wait, this may take a few minutes on first run..."
echo ""

# Start docker-compose
docker-compose up --build

# Cleanup message
echo ""
echo "VenueVision stopped."
echo ""

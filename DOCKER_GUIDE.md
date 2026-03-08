# 🐳 Docker Deployment Guide

Complete guide to running VenueVision with Docker and Docker Compose.

---

## 🚀 Quick Start (TL;DR)

```bash
# Build and start everything
docker-compose up --build

# Access the app
# Open: http://localhost:5000/mobile
# Login: demo / demo123
```

That's it! Docker handles everything: PostgreSQL, backend, frontend, database setup, and demo user creation.

---

## 📋 Prerequisites

1. **Docker Desktop** installed and running
   - Windows/Mac: https://www.docker.com/products/docker-desktop
   - Linux: Docker Engine + Docker Compose

2. **Port availability**:
   - Port 5000 (Flask app)
   - Port 5432 (PostgreSQL)

3. **Minimum resources** (Docker Desktop settings):
   - Memory: 2 GB
   - CPU: 2 cores
   - Disk: 5 GB

---

## 🏗️ Architecture

### Docker Compose Services

```
┌─────────────────────────────────────────┐
│         VenueVision Stack               │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  App Container (venuevision-app)  │ │
│  │  - React Frontend (built)         │ │
│  │  - Flask Backend                  │ │
│  │  - Python + Node.js               │ │
│  │  Port: 5000                       │ │
│  └──────────────┬────────────────────┘ │
│                 │                       │
│                 │ connects to           │
│                 ↓                       │
│  ┌───────────────────────────────────┐ │
│  │  DB Container (venuevision-db)    │ │
│  │  - PostgreSQL 15                  │ │
│  │  - Database: fyp_db               │ │
│  │  Port: 5432                       │ │
│  │  Volume: postgres_data            │ │
│  └───────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘

External Volume (Host):
└─ server/static/uploads/ (mounted)
```

---

## 🎮 Commands

### First Time Setup

```bash
# Build images and start containers
docker-compose up --build

# Or run in background (detached mode)
docker-compose up --build -d
```

**What happens**:
1. ✅ Builds React frontend
2. ✅ Builds Python backend
3. ✅ Starts PostgreSQL
4. ✅ Waits for database to be ready
5. ✅ Creates database schema
6. ✅ Creates demo user
7. ✅ Starts Flask server

---

### Regular Use

```bash
# Start (if already built)
docker-compose up

# Start in background
docker-compose up -d

# Stop containers
docker-compose down

# Stop and remove volumes (⚠️ deletes database data)
docker-compose down -v
```

---

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f db

# Last 50 lines
docker-compose logs --tail=50 app
```

---

### Rebuild

```bash
# Rebuild after code changes
docker-compose up --build

# Force rebuild (no cache)
docker-compose build --no-cache
docker-compose up
```

---

### Access Containers

```bash
# Open shell in app container
docker-compose exec app sh

# Access PostgreSQL
docker-compose exec db psql -U postgres -d fyp_db

# Run Python commands
docker-compose exec app python -c "print('Hello')"
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file (optional):

```bash
# Copy example
cp env.example .env

# Edit values
nano .env  # or use any text editor
```

**Example .env**:
```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=my-secure-password
POSTGRES_DB=fyp_db
JWT_SECRET=my-very-long-secret-key-for-jwt-tokens
FLASK_ENV=production
```

Then Docker Compose will automatically use these values.

---

### Ports Configuration

Edit `docker-compose.yml` to change ports:

```yaml
services:
  app:
    ports:
      - "8080:5000"  # Host:Container
  
  db:
    ports:
      - "5433:5432"  # Change if 5432 is in use
```

---

## 📊 Database Management

### View Data

```bash
# Connect to database
docker-compose exec db psql -U postgres -d fyp_db

# Inside psql:
\dt                    # List tables
SELECT * FROM users;   # View users
SELECT * FROM venues;  # View venues
\q                     # Exit
```

---

### Backup Database

```bash
# Create backup
docker-compose exec db pg_dump -U postgres fyp_db > backup.sql

# With timestamp
docker-compose exec db pg_dump -U postgres fyp_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

### Restore Database

```bash
# Stop app (to avoid connections)
docker-compose stop app

# Restore
docker-compose exec -T db psql -U postgres fyp_db < backup.sql

# Restart
docker-compose start app
```

---

### Reset Database

```bash
# Stop everything
docker-compose down

# Remove volumes (⚠️ deletes all data)
docker-compose down -v

# Start fresh
docker-compose up --build
```

---

## 🧪 Testing

### Health Check

```bash
# Check if app is running
curl http://localhost:5000/api/v1/health

# Expected: {"status": "healthy"}
```

---

### Test Authentication

```bash
# Sign up new user
curl -X POST http://localhost:5000/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@test.com","password":"test123"}'

# Login
curl -X POST http://localhost:5000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo123"}'
```

---

## 🐛 Troubleshooting

### Issue: "Port 5000 is already allocated"

**Solution 1**: Stop other containers
```bash
docker ps
docker stop <container_id>
```

**Solution 2**: Change port in `docker-compose.yml`
```yaml
ports:
  - "8080:5000"  # Use port 8080 instead
```

---

### Issue: "Cannot connect to Docker daemon"

**Fix**:
1. Start Docker Desktop (Windows/Mac)
2. Or start Docker service:
   ```bash
   # Linux
   sudo systemctl start docker
   ```

---

### Issue: "failed to copy" / "EOF" when pulling images

The connection to Docker Hub is dropping during the pull. Use the following in order.

**1. Use the startup script (recommended – retries pulls automatically)**  
From the project folder, run:
```powershell
# Windows (PowerShell)
.\start-docker.bat
# or directly:
powershell -ExecutionPolicy Bypass -File .\start-docker.ps1
```
The script pre-pulls images with 5 retries, then runs `docker-compose up --build`.

**2. Add a registry mirror (fixes many persistent pull failures)**  
Use a pull-through mirror so Docker fetches images from Google’s cache instead of Docker Hub.

- **Windows (Docker Desktop)**  
  1. Open **Docker Desktop** → **Settings** (gear) → **Docker Engine**.  
  2. Add or merge this into the JSON (keep any existing keys like `"builder"`):
     ```json
     "registry-mirrors": ["https://mirror.gcr.io"]
     ```
     If the file is empty, use:
     ```json
     {
       "registry-mirrors": ["https://mirror.gcr.io"]
     }
     ```
  3. Click **Apply & restart**.  
  4. Run `.\start-docker.bat` or `docker-compose up --build` again.

- **Using the example file**  
  The project includes `docker-daemon-mirror.json`. To use it:
  1. Copy it to your Docker config (back up existing first):
     - Windows: `%USERPROFILE%\.docker\daemon.json`
     - If you already have a `daemon.json`, merge the `"registry-mirrors"` key into it.
  2. Restart Docker Desktop.

**3. Other checks**  
- Disable VPN or try a different network.  
- Ensure firewall/antivirus isn’t blocking Docker.  
- Restart Docker Desktop and your machine, then run `.\start-docker.ps1` again.

---

### Issue: Database connection errors

**Check**:
```bash
# View app logs
docker-compose logs app

# Check database is running
docker-compose ps

# Test database connection
docker-compose exec db pg_isready -U postgres
```

**Fix**: Restart containers
```bash
docker-compose restart
```

---

### Issue: "Module not found" errors

**Fix**: Rebuild without cache
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up
```

---

### Issue: Changes not reflecting

**For backend changes**:
```bash
docker-compose up --build
```

**For frontend changes**:
```bash
# Frontend is built during Docker build
docker-compose down
docker-compose up --build
```

---

### Issue: Out of disk space

**Clean up Docker**:
```bash
# Remove unused containers, images, volumes
docker system prune -a --volumes

# Warning: This removes ALL unused Docker data
```

---

## 📦 Production Deployment

### Option 1: Single Server

```bash
# On your server
git clone <your-repo>
cd VenueVision

# Create production .env
nano .env
# Set secure passwords and JWT secret

# Start with systemd or as daemon
docker-compose up -d

# Set up reverse proxy (nginx/traefik)
# Point domain to localhost:5000
```

---

### Option 2: Separate Database

Update `docker-compose.yml`:

```yaml
services:
  app:
    environment:
      - DATABASE_URL=postgresql://user:pass@external-db:5432/fyp_db
    # Remove db service and depends_on
```

---

### Option 3: Cloud Deployment

**AWS ECS / Azure Container Instances / Google Cloud Run**:

1. Build and push image:
```bash
docker build -t venuevision:latest .
docker tag venuevision:latest your-registry/venuevision:latest
docker push your-registry/venuevision:latest
```

2. Use managed PostgreSQL (AWS RDS, Azure Database, Cloud SQL)

3. Deploy container with environment variables

---

## 🔒 Security Checklist

For production:

- [ ] Change default passwords in `.env`
- [ ] Generate secure JWT_SECRET (32+ random characters)
- [ ] Use HTTPS (reverse proxy with SSL/TLS)
- [ ] Restrict database port (don't expose 5432 publicly)
- [ ] Regular database backups
- [ ] Update base images regularly (`docker-compose pull`)
- [ ] Use secrets management (Docker secrets, Kubernetes secrets)
- [ ] Set up monitoring (Prometheus, Grafana)

---

## 📊 Monitoring

### Container Stats

```bash
# Real-time resource usage
docker stats

# Specific container
docker stats venuevision-app
```

---

### Health Checks

```bash
# Check container health
docker ps

# View health check logs
docker inspect venuevision-app | grep Health -A 10
```

---

## 🎯 Common Workflows

### Development Workflow

```bash
# 1. Make code changes
# 2. Rebuild and restart
docker-compose up --build

# View logs
docker-compose logs -f app
```

---

### Testing Workflow

```bash
# Start fresh
docker-compose down -v
docker-compose up --build

# Run tests
docker-compose exec app python -m pytest

# Check logs
docker-compose logs app
```

---

### Deployment Workflow

```bash
# 1. Test locally
docker-compose up --build

# 2. Tag version
docker build -t venuevision:v1.0.0 .

# 3. Push to registry
docker push your-registry/venuevision:v1.0.0

# 4. Deploy to production
# (depends on your hosting platform)
```

---

## 📚 Additional Resources

- **Docker Docs**: https://docs.docker.com/
- **Docker Compose**: https://docs.docker.com/compose/
- **PostgreSQL Docker**: https://hub.docker.com/_/postgres
- **Python Docker**: https://hub.docker.com/_/python

---

## 🎉 Success Checklist

After `docker-compose up --build`, verify:

- [ ] ✅ Containers are running: `docker-compose ps`
- [ ] ✅ App accessible: http://localhost:5000/mobile
- [ ] ✅ Can login with demo/demo123
- [ ] ✅ Database has data: `docker-compose exec db psql -U postgres -d fyp_db -c "SELECT * FROM users;"`
- [ ] ✅ No errors in logs: `docker-compose logs`

---

## 💡 Pro Tips

1. **Use .dockerignore** - Speeds up builds (already included)
2. **Layer caching** - Put dependencies before source code
3. **Multi-stage builds** - Reduces final image size (already implemented)
4. **Health checks** - Auto-restart unhealthy containers (included)
5. **Volumes for data** - Database persists across restarts (configured)
6. **Named volumes** - Easier to manage and backup

---

**Ready to Docker? Run `docker-compose up --build` and you're live! 🚀**

# 🎓 Professor Demo Guide - VenueVision Architecture

## Quick Demo Script for Your Professor

---

## Part 1: Show Multi-User System (5 minutes)

### 1.1 Login as Demo User
1. Open: http://localhost:5000/mobile
2. Login: `demo` / `demo123`
3. **Point out**: "Each user has their own account with secure authentication"

### 1.2 Show User's Venues Dashboard
- **Explain**: "This is the user's personal dashboard showing only their venues"
- Click on "Demo Venue"
- **Show**: Venue stats (dimensions, walls, assets)

### 1.3 Access Different Tools
Click through each option:
- 📸 Guided Tour - "For capturing walls"
- ✏️ Wall Editor - "For processing images"
- 📐 Floor Planner - "For 2D layout planning"
- 🎨 3D Viewer - "For immersive visualization"

---

## Part 2: Show Database Architecture (10 minutes)

### 2.1 Access Database via Docker

```bash
# Open terminal and run:
docker-compose exec db psql -U postgres -d fyp_db
```

### 2.2 Show Tables

```sql
-- List all tables
\dt

-- Output will show:
--  users
--  venues
--  venue_walls
--  venue_assets
--  venue_floor_plans
--  venue_polygons
```

### 2.3 Show User Data

```sql
-- Show all users
SELECT user_id, username, email, full_name, created_at 
FROM users;
```

**Explain**: "Each user has a unique ID and hashed password for security"

### 2.4 Show User's Venues

```sql
-- Show venues for demo user (ID: 1)
SELECT venue_id, venue_name, width, height, depth, created_at
FROM venues
WHERE user_id = 1;
```

**Explain**: "Each venue is linked to a specific user via foreign key"

### 2.5 Show Venue Walls

```sql
-- Show walls for demo venue
SELECT wall_id, wall_identifier, wall_name, length, height
FROM venue_walls
WHERE venue_id = 1;
```

**Explain**: "Wall metadata (coordinates, dimensions) in database, images in filesystem"

### 2.6 Show Venue Assets

```sql
-- Show assets (furniture) in demo venue
SELECT asset_type, width, depth, position_x, position_y, rotation
FROM venue_assets
WHERE venue_id = 1;
```

**Explain**: "Asset positions stored in database for 2D/3D rendering"

### 2.7 Show Relationships

```sql
-- Show complete venue structure with counts
SELECT 
    v.venue_name,
    u.username as owner,
    COUNT(DISTINCT w.wall_id) as wall_count,
    COUNT(DISTINCT a.asset_id) as asset_count
FROM venues v
JOIN users u ON v.user_id = u.user_id
LEFT JOIN venue_walls w ON v.venue_id = w.venue_id
LEFT JOIN venue_assets a ON v.venue_id = a.venue_id
WHERE v.venue_id = 1
GROUP BY v.venue_name, u.username;
```

**Explain**: "Database enforces relationships - if user is deleted, all their venues are automatically deleted (CASCADE)"

---

## Part 3: Show Hybrid Storage Model (5 minutes)

### 3.1 Show File Structure

```bash
# Exit psql first
\q

# Show file structure
docker-compose exec app ls -la /app/server/static/uploads/demo-venue/
```

**Output shows**:
```
drwxr-xr-x  wall_north/
drwxr-xr-x  wall_south/
drwxr-xr-x  wall_east/
drwxr-xr-x  wall_west/
-rw-r--r--  layout.json
-rw-r--r--  floor_plan.jpg (if exists)
```

### 3.2 Explain Hybrid Approach

**Show diagram on whiteboard or slide**:

```
┌────────────────────────────────────────┐
│         VenueVision Storage            │
├────────────────────────────────────────┤
│                                        │
│  PostgreSQL Database                  │
│  ├─ User accounts (10-50 KB)         │
│  ├─ Venue metadata (10-50 KB)        │
│  ├─ Wall coordinates (1-5 KB)        │
│  └─ Asset positions (1-10 KB)        │
│                                        │
│  Total per venue: ~20-100 KB          │
│                                        │
├────────────────────────────────────────┤
│                                        │
│  File System                          │
│  ├─ Wall images (100 KB - 5 MB each) │
│  ├─ Floor plans (500 KB - 2 MB)      │
│  └─ Processed images (100 KB - 3 MB) │
│                                        │
│  Total per venue: ~2-20 MB            │
│                                        │
└────────────────────────────────────────┘
```

**Key Points**:
1. **Database**: Fast queries, relationships, structured data
2. **Files**: Efficient image storage, direct serving
3. **Why Hybrid?**: 
   - Database stays small and fast (queries in milliseconds)
   - Images served efficiently (no DB overhead)
   - Standard industry pattern (Instagram, Facebook use this)

---

## Part 4: Show Scalability (3 minutes)

### 4.1 Create Second User

```sql
-- Back in psql:
docker-compose exec db psql -U postgres -d fyp_db
```

```sql
-- Check total users
SELECT COUNT(*) as total_users FROM users;

-- Check total venues
SELECT COUNT(*) as total_venues FROM venues;

-- Show data isolation (each user only sees their venues)
SELECT u.username, COUNT(v.venue_id) as venue_count
FROM users u
LEFT JOIN venues v ON u.user_id = v.user_id
GROUP BY u.username;
```

### 4.2 Demonstrate Isolation

Open browser in incognito mode:
1. Create new user account: `professor` / `test123`
2. **Show**: Empty dashboard (no access to demo user's venues)
3. **Explain**: "Complete data isolation between users"

---

## Part 5: Show Security Features (3 minutes)

### 5.1 Password Security

```sql
-- Show password hashing (NOT plain text!)
SELECT username, password_hash FROM users LIMIT 1;
```

**Output shows bcrypt hash**:
```
username | password_hash
---------+--------------------------------------------------------------
demo     | $2b$12$xYz...abc (60 characters - irreversible hash)
```

**Explain**: 
- Passwords hashed with bcrypt (industry standard)
- Impossible to reverse
- Salted (each hash unique even for same password)

### 5.2 JWT Authentication

**Show in browser DevTools** (F12 → Application → Local Storage):
```javascript
token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Explain**:
- Token-based authentication (stateless)
- Expires after 7 days
- Sent with every API request
- Server validates token before returning data

### 5.3 SQL Injection Protection

```sql
-- This would be DANGEROUS without parameterized queries:
-- SELECT * FROM users WHERE username = 'user' OR '1'='1';

-- But we use parameterized queries, so it's safe:
SELECT * FROM users WHERE username = %s;
```

**Explain**: All database queries use parameters, preventing SQL injection attacks

---

## Part 6: Show Performance (2 minutes)

### 6.1 Query Speed

```sql
-- Show how fast queries are
\timing on

-- Fast metadata query
SELECT * FROM venues WHERE user_id = 1;
-- Time: 0.234 ms

-- Join query still fast
SELECT v.venue_name, COUNT(w.wall_id)
FROM venues v
LEFT JOIN venue_walls w ON v.venue_id = w.venue_id
WHERE v.user_id = 1
GROUP BY v.venue_name;
-- Time: 0.456 ms
```

**Explain**: "Database queries complete in < 1 millisecond"

### 6.2 Show Database Size

```sql
-- Exit psql and run:
\q

# Show database size
docker-compose exec db psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('fyp_db'));"
```

**Explain**: "Even with all venues, database stays small because images are in filesystem"

---

## Part 7: Technical Details (3 minutes)

### 7.1 Technologies Used

**Backend**:
- Flask (Python web framework)
- PostgreSQL (relational database)
- bcrypt (password hashing)
- PyJWT (token authentication)
- OpenCV (image processing)

**Frontend**:
- React + TypeScript
- Three.js (3D rendering)
- Vite (build tool)

**Deployment**:
- Docker + Docker Compose
- Multi-container architecture
- One-command deployment

### 7.2 Architecture Diagram

```
┌──────────────────────────────────────────┐
│           User's Browser                  │
│  (React App - TypeScript)                │
└──────────────┬───────────────────────────┘
               │ HTTP/REST API
               │ JWT Authentication
               ↓
┌──────────────────────────────────────────┐
│         Flask Backend (Python)            │
│  ├─ Authentication (JWT + bcrypt)        │
│  ├─ API Endpoints (REST)                 │
│  ├─ Image Processing (OpenCV)            │
│  └─ File Management                      │
└──────┬──────────────────┬────────────────┘
       │                  │
       │                  │
       ↓                  ↓
┌─────────────┐    ┌────────────────┐
│ PostgreSQL  │    │  File System   │
│  Database   │    │   (Images)     │
│             │    │                │
│ - users     │    │ - Wall photos  │
│ - venues    │    │ - Floor plans  │
│ - walls     │    │ - Processed    │
│ - assets    │    │                │
└─────────────┘    └────────────────┘
```

---

## Summary Points for Professor

1. **Multi-User**: ✅ Each user has isolated data
2. **Security**: ✅ Bcrypt + JWT + SQL injection protection
3. **Scalable**: ✅ Hybrid storage keeps DB small and fast
4. **Industry Standard**: ✅ Same patterns as Instagram, Facebook
5. **Professional**: ✅ Docker deployment, proper architecture
6. **Complete**: ✅ Auth, CRUD, relationships, foreign keys

---

## Questions Your Professor Might Ask

### Q: "Why not store images in the database?"
**A**: "Database would grow to 50+ GB for 1000 users (20 MB per venue). Queries would slow down, backups would take hours. With hybrid approach, database stays < 1 GB, queries stay fast."

### Q: "Why PostgreSQL instead of NoSQL?"
**A**: "Need relational data (users → venues → walls → assets). PostgreSQL provides ACID compliance, foreign keys, and is industry standard for structured data. Also demonstrates SQL knowledge."

### Q: "How does authentication work?"
**A**: "User logs in → password verified with bcrypt → JWT token generated → token sent with every request → server validates token → returns user's data only. Stateless and scalable."

### Q: "What if two users try to edit the same venue?"
**A**: "Currently not possible - venues belong to one user. Could add sharing feature later with permissions table."

### Q: "How would you deploy this to production?"
**A**: "Already containerized with Docker. Can deploy to AWS ECS, Azure Container Instances, or Google Cloud Run. Would add: HTTPS, external PostgreSQL (RDS), S3 for images, Redis for caching."

### Q: "What about backups?"
**A**: "Database: `pg_dump` creates SQL backup. Files: copy uploads folder. With Docker volumes, can use volume backups. In production, would use automated daily backups."

---

## Live Demo Checklist

- [ ] Docker containers running
- [ ] Browser open to login page
- [ ] Terminal ready for database commands
- [ ] Incognito window ready for second user demo
- [ ] This guide printed or on second screen

---

**Good luck with your presentation!** 🎓🚀

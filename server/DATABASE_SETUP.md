# Database Setup Instructions

This guide will help you set up the PostgreSQL database for the FYP Event Space Visualizer.

**Note:** The application works with file-based storage by default. PostgreSQL setup is optional and can be used for future features.

## Prerequisites

1. **PostgreSQL installed and running**
   - Download from: https://www.postgresql.org/download/
   - Make sure PostgreSQL service is running

2. **Python dependencies**
   ```bash
   pip install psycopg2-binary
   ```

## Quick Setup (Automated)

The easiest way to set up the database is using the automated setup script:

```bash
cd server
python setup_database.py
```

The script will:
- ✅ Create the `fyp_db` database
- ✅ Execute any SQL from `schema.sql` (if tables are defined)
- ✅ Update `database.py` with correct connection string

### Custom Credentials

If your PostgreSQL uses different credentials, you can set them via environment variable:

**Windows (PowerShell):**
```powershell
$env:DATABASE_URL="postgresql://your_user:your_password@localhost:5432/postgres"
python setup_database.py
```

**Windows (CMD):**
```cmd
set DATABASE_URL=postgresql://your_user:your_password@localhost:5432/postgres
python setup_database.py
```

**Linux/Mac:**
```bash
export DATABASE_URL="postgresql://your_user:your_password@localhost:5432/postgres"
python setup_database.py
```

## Manual Setup

If you prefer to set up the database manually:

### Step 1: Create Database

Connect to PostgreSQL and create the database:

```sql
CREATE DATABASE fyp_db;
```

### Step 2: Create Tables

Run the schema file:

```bash
psql -U your_user -d fyp_db -f server/schema.sql
```

Or manually create tables as needed for your features.

### Step 3: Update Connection String

Edit `server/database.py` and update the `DATABASE_URL`:

```python
DATABASE_URL = 'postgresql://your_user:your_password@localhost:5432/fyp_db'
```

## Verify Setup

1. **Test database connection:**
   ```bash
   python -c "from server.database import get_db_connection; conn = get_db_connection(); print('✓ Connected!')"
   ```

2. **Start Flask server:**
   ```bash
   python server/app.py
   ```

3. **Test API endpoints:**
   - Health check: http://localhost:5000/api/v1/health
   - Venue progress: http://localhost:5000/api/v1/venue/demo-venue/progress

## Troubleshooting

### "Connection refused" or "Could not connect to server"

- Make sure PostgreSQL is running
- Check if PostgreSQL is listening on port 5432
- Verify your firewall settings

### "Authentication failed"

- Check your username and password
- Make sure the user has permission to create databases
- Try using the default `postgres` user

### "Database does not exist"

- Run the setup script again
- Or manually create the database: `CREATE DATABASE fyp_db;`

## Default PostgreSQL Credentials

If you just installed PostgreSQL, the default credentials are usually:
- **Username:** `postgres`
- **Password:** (the one you set during installation)
- **Host:** `localhost`
- **Port:** `5432`

If you forgot your PostgreSQL password, you can reset it or check your PostgreSQL configuration.

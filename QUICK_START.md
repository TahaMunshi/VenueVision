# 🚀 Quick Start Guide - VenueVision

Get up and running with your multi-user venue visualization app in 5 minutes!

## 📥 Pull the yumman branch (fresh clone or update)

If you're pulling this repo (or the **yumman** branch) for the first time:

```powershell
git clone https://github.com/TahaMunshi/VenueVision.git
cd VenueVision
git checkout yumman
# Or if already cloned: git fetch origin yumman && git checkout yumman && git pull origin yumman
```

Then use **Docker** (easiest) or **Manual** setup below. The yumman branch includes:
- Auth middleware, database helpers (`execute_query` / `execute_insert`), bcrypt & PyJWT in `requirements.docker.txt`
- Blue vase on table (2D planner + 3D viewer), `server/static/models/blue_vase.glb`
- All fixes needed for `docker-compose up --build` to succeed

---

## ⚡ Fast Track Setup

### 1. Install Dependencies

```powershell
# Backend (Python)
.\venv\Scripts\Activate.ps1
pip install -r requirements.docker.txt

# Frontend (Node)
npm install
```

### 2. Set Up Database

```powershell
cd server
python setup_database.py
cd ..
```

✅ This creates the database and a demo user:
- Username: `demo`
- Password: `demo123`

### 3. Start the App

**Option A: Production Mode (Recommended for testing)**
```powershell
# Build frontend
npm run build

# Start server
.\venv\Scripts\Activate.ps1
python server\app.py
```

Then open: **http://localhost:5000/mobile**

**Option B: Development Mode (Hot reload)**

Terminal 1:
```powershell
.\venv\Scripts\Activate.ps1
python server\app.py
```

Terminal 2:
```powershell
npm run dev
```

Then open: **http://localhost:5173**

---

## 🎮 Using the App

### First Time Login

1. Go to `http://localhost:5000/mobile`
2. Click "Sign up" to create your account
3. Or use demo credentials:
   - Username: `demo`
   - Password: `demo123`

### Creating Your First Venue

1. After logging in, you'll see the "My Venues" dashboard
2. Click "Create New Venue"
3. Follow the guided tour to capture walls
4. Or upload existing wall photos

### Workflow

```
Login → Venues Dashboard → Create Venue → Capture Walls → Edit Walls → 
Plan Layout (2D) → View 3D → Export
```

---

## 📁 Project Structure

```
VenueVision/
├── server/                 # Flask backend
│   ├── api/endpoints/      # API routes
│   │   ├── auth.py        # 🔐 Login/signup
│   │   ├── venues.py      # 🏢 Venue management
│   │   ├── walls.py       # 🖼️ Wall capture
│   │   └── layout.py      # 📐 Layout saving
│   ├── services/           # Business logic
│   │   ├── auth_service.py        # Auth logic
│   │   └── image_analysis.py     # Image processing
│   ├── middleware/         # Auth middleware
│   ├── database.py         # DB connection
│   ├── schema.sql          # Database schema
│   └── app.py             # Main Flask app
├── src/                    # React frontend
│   ├── pages/
│   │   ├── auth/          # 🔐 Login/Signup pages
│   │   ├── venues/        # 🏢 Venues dashboard
│   │   ├── guided/        # 📸 Wall capture workflow
│   │   ├── planner/       # 📐 2D floor planner
│   │   └── viewer/        # 🎨 3D viewer
│   └── App.tsx            # Main React app
└── dist/                   # Built frontend (after npm run build)
```

---

## 🔑 Key Features

### ✅ Implemented

- [x] User authentication (signup/login)
- [x] JWT token-based sessions
- [x] Multi-user support
- [x] User-specific venues
- [x] Database + file hybrid storage
- [x] Wall capture (camera or upload)
- [x] Wall editing (corner detection)
- [x] 2D floor planner
- [x] 3D visualization
- [x] Asset placement (tables, chairs)

### 🔜 Coming Soon

- [ ] Make existing endpoints fully user-aware
- [ ] Venue sharing (public/private)
- [ ] Export venue as GLB model
- [ ] Mobile-optimized capture
- [ ] Cloud storage integration

---

## 🐛 Common Issues & Fixes

### "Can't connect to database"
```powershell
# Check if PostgreSQL is running
# Windows: Check Services for "postgresql"
# Or restart setup:
cd server
python setup_database.py
```

### "Token expired"
- Just logout and login again
- Tokens last 7 days by default

### "Port 5000 already in use"
```powershell
# Windows: Find and kill process
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### "Module not found" errors
```powershell
# Reinstall dependencies
.\venv\Scripts\Activate.ps1
pip install -r requirements.docker.txt
npm install
```

---

## 📊 What Changed?

### Before (Single User)
- Files stored in `uploads/demo-venue/`
- No authentication
- One venue for everyone

### Now (Multi-User)
- Files stored in `uploads/<venue_identifier>/`
- PostgreSQL database for users & metadata
- Each user has their own venues
- Secure authentication with JWT
- Login/signup pages

---

## 🎯 Next Steps

1. **Create your account** - Sign up with your email
2. **Create a venue** - Use the guided tour or upload photos
3. **Plan layout** - Arrange furniture in 2D
4. **View in 3D** - See your venue come to life
5. **Share with your professor** - Show off your multi-user system!

---

## 📚 Documentation

- `README.md` - Project overview
- `AUTHENTICATION_SETUP.md` - Detailed auth guide
- `DATABASE_SETUP.md` - Database configuration
- `SETUP.md` - Original setup instructions

---

## 💡 Pro Tips

1. **Use demo user** for quick testing
2. **Check browser console** for any frontend errors
3. **Check terminal logs** for backend errors
4. **Keep PostgreSQL running** while using the app
5. **Use incognito mode** to test multiple users

---

## 🤝 Need Help?

Check the logs:
- **Backend logs**: In the terminal running `python server/app.py`
- **Frontend logs**: Browser console (F12)
- **Database logs**: PostgreSQL logs in installation directory

---

**Ready to go? Start with step 1! 🚀**

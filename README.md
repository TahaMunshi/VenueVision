# VenueVision - Event Space Visualizer

A multi-user 3D event space visualization tool that allows you to capture venue walls using guided tour or upload existing photos, then visualize the space in 3D.

## ✨ Features

- 🔐 **Multi-User Authentication**: Secure signup/login with JWT tokens
- 🏢 **Venue Management**: Each user has their own venues
- 📸 **Wall Capture**: Guided tour interface for capturing venue walls
- 🖼️ **Image Processing**: Automatic corner detection and wall warping
- 🎨 **3D Visualization**: View your venue in 3D with processed wall textures
- 📐 **Floor Planning**: 2D space planner for arranging furniture and assets
- 🔄 **Real-time Preview**: See your layout in 3D before finalizing
- 💾 **Hybrid Storage**: PostgreSQL for metadata, files for images

## 🚀 Quick Start

### Option 1: Docker (Recommended - Easiest!)

**Prerequisites**: Docker Desktop installed and running

```bash
# One command to start everything
docker-compose up --build

# Or use the startup script (Windows: start-docker.bat | Linux/Mac: ./start-docker.sh)
```

Then open: **http://localhost:5000/mobile**  
Login: **demo** / **demo123**

**If you get "failed to copy" or EOF when pulling images:**  
Docker Hub’s CDN can drop connections on some networks. Add a registry mirror:  
**Docker Desktop** → **Settings** → **Docker Engine** → add `"registry-mirrors": ["https://mirror.gcr.io"]` to the JSON → **Apply & restart**, then run `docker-compose up --build` again.

📚 See [DOCKER_GUIDE.md](DOCKER_GUIDE.md) for more Docker commands

---

### Option 2: Manual Installation

**Prerequisites**:
- Python 3.8+
- Node.js 16+
- PostgreSQL 12+

**Setup**:

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   cd VenueVision
   ```

2. **Install dependencies**
   ```bash
   # Backend
   python -m venv venv
   .\venv\Scripts\Activate.ps1  # Windows
   # source venv/bin/activate    # Mac/Linux
   pip install -r requirements.txt
   
   # Frontend
   npm install
   npm run build
   ```

3. **Set up database**
   ```bash
   cd server
   python setup_database.py
   cd ..
   ```

4. **Run the server**
   ```bash
   .\venv\Scripts\Activate.ps1
   python server\app.py
   ```

5. **Access the application**
   - App: http://localhost:5000/mobile
   - API: http://localhost:5000/api/v1
   - Login: **demo** / **demo123**

📚 See [QUICK_START.md](QUICK_START.md) for detailed manual setup

---

## 📖 Documentation

- **[DOCKER_GUIDE.md](DOCKER_GUIDE.md)** - Complete Docker setup and usage guide
- **[QUICK_START.md](QUICK_START.md)** - 5-minute manual setup guide
- **[PROFESSOR_DEMO_GUIDE.md](PROFESSOR_DEMO_GUIDE.md)** - Guide for demonstrating the project

## 🏗️ Architecture

### Multi-User System
```
Users → Authentication → Venues Dashboard → Create/Edit Venues
                                           ↓
                        Wall Capture → 2D Planner → 3D Viewer
```

### Hybrid Storage
- **PostgreSQL**: User accounts, venue metadata, wall coordinates
- **File System**: Wall images, floor plans, uploaded photos
- **Best of both**: Fast queries + efficient media storage

## 🎮 Usage

1. **Sign up / Login** - Create your account or use demo user
2. **Create Venue** - Start a new venue from dashboard
3. **Capture Walls** - Use guided tour or upload photos
4. **Edit Walls** - Adjust corner points for accurate detection
5. **Plan Layout** - Use 2D planner to arrange furniture
6. **View 3D** - See your venue in immersive 3D

## 📁 Project Structure

```
VenueVision/
├── server/                 # Flask backend
│   ├── api/endpoints/      # API routes (auth, venues, walls, layout)
│   ├── services/           # Business logic (auth, image processing)
│   ├── middleware/         # Authentication middleware
│   ├── database.py         # PostgreSQL connection
│   └── app.py             # Main Flask app
├── src/                    # React frontend
│   ├── pages/
│   │   ├── auth/          # Login/Signup pages
│   │   ├── venues/        # Venues dashboard
│   │   ├── guided/        # Wall capture workflow
│   │   ├── planner/       # 2D floor planner
│   │   └── viewer/        # 3D viewer
│   └── App.tsx            # Main React app
├── docker-compose.yml      # Docker orchestration
├── Dockerfile             # Container build instructions
└── dist/                  # Built frontend
```

## 🛠️ Technologies

- **Backend**: Flask (Python), PostgreSQL, bcrypt, JWT
- **Frontend**: React, TypeScript, Vite
- **3D Rendering**: Three.js
- **Image Processing**: OpenCV (Python)
- **Deployment**: Docker, Docker Compose

## 🔐 Security

- ✅ Password hashing with bcrypt
- ✅ JWT token-based authentication
- ✅ SQL injection protection (parameterized queries)
- ✅ User-specific data isolation
- ✅ Authorization checks on all protected endpoints

## 🐳 Docker Details

### Containers
- **venuevision-app**: React + Flask application
- **venuevision-db**: PostgreSQL 15 database

### Volumes
- **postgres_data**: Persistent database storage
- **uploads**: User-uploaded images (mounted from host)

### Ports
- **5000**: Web application
- **5432**: PostgreSQL (optional external access)

## 🎯 API Endpoints

### Authentication
- `POST /api/v1/signup` - Register new user
- `POST /api/v1/login` - Login and get token
- `GET /api/v1/me` - Get current user (protected)

### Venues
- `GET /api/v1/venues` - List user's venues (protected)
- `POST /api/v1/venues` - Create venue (protected)
- `DELETE /api/v1/venues/:id` - Delete venue (protected)

### Walls & Layout
- `GET /api/v1/venue/:id/progress` - Get capture progress
- `POST /api/v1/venue/:id/upload/:wallId` - Upload wall photo
- `POST /api/v1/venue/:id/layout` - Save venue layout

## 🤝 Contributing

This is an FYP (Final Year Project) for university. Feel free to:
- Report issues
- Suggest features
- Submit pull requests

## 📊 What's Next?

- [ ] Make all endpoints fully user-aware
- [ ] Venue sharing (public/private)
- [ ] Export venue as complete GLB model
- [ ] Mobile app (React Native)
- [ ] Cloud storage integration (S3/Azure)
- [ ] Real-time collaboration

## 📄 License

[Your License Here]

## 👥 Contributors

- [Your Name] - Initial work

---

**Need help?** Check the documentation files or run with Docker for the easiest experience! 🚀

# Event Space Visualizer

A 3D event space visualization tool that allows you to capture venue walls using guided tour or upload existing photos, then visualize the space in 3D.

## Features

- 📸 **Wall Capture**: Guided tour interface for capturing venue walls
- 🖼️ **Image Processing**: Automatic corner detection and wall warping
- 🎨 **3D Visualization**: View your venue in 3D with processed wall textures
- 📐 **Floor Planning**: 2D space planner for arranging furniture and assets
- 🔄 **Real-time Preview**: See your layout in 3D before finalizing

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   cd fyp
   ```

2. **Set up Python backend**
   ```bash
   # Create virtual environment
   python -m venv venv
   
   # Activate virtual environment
   # Windows:
   venv\Scripts\activate
   # Mac/Linux:
   source venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   ```

3. **Set up React frontend**
   ```bash
   # Install dependencies
   npm install
   
   # Build the frontend
   npm run build
   ```

4. **Set up database**
   ```bash
   cd server
   python setup_database.py
   ```

5. **Run the server**
   ```bash
   cd server
   python app.py
   ```

6. **Access the application**
   - Local: http://localhost:5000/mobile
   - API: http://localhost:5000/api/v1

## Project Structure

```
fyp/
├── server/           # Flask backend
│   ├── api/         # API routes
│   ├── services/    # Business logic
│   └── static/      # Static files and uploads
├── src/             # React frontend
│   ├── pages/      # Page components
│   └── components/  # Reusable components
└── dist/            # Built frontend (generated)
```

## Usage

1. **Capture Walls**: Use the guided tour interface to capture venue walls
2. **Edit Walls**: Adjust corner points for accurate wall detection
3. **Process Walls**: Apply perspective correction and stylization
4. **Plan Layout**: Use the 2D planner to arrange furniture
5. **View 3D**: See your venue in 3D with all processed textures

## Sharing with Friends

This project uses Git and GitHub for easy sharing:

- **Get updates**: `git pull`
- **Share changes**: `git push`
- **See changes**: Check commit history on GitHub

See `GIT_SETUP.md` for detailed instructions.

## Technologies

- **Backend**: Flask (Python)
- **Frontend**: React + TypeScript + Vite
- **3D Rendering**: Three.js
- **Image Processing**: OpenCV
- **Database**: SQLite

## License

[Your License Here]

## Contributors

- [Your Name]

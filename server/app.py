from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from flask_compress import Compress
import sys
import os

from dotenv import load_dotenv

# Project root .env (so TRIPO_API_KEY etc. apply when running `python server/app.py` locally)
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_project_root, ".env"))

# Add the server directory to the path to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.routes import api_bp
from utils.init_demo_data import init_demo_venue


def init_directories():
    """Initialize required directories for the application."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    directories = [
        os.path.join(base_dir, "static", "uploads"),
        os.path.join(base_dir, "static", "user_assets"),
        os.path.join(base_dir, "static", "models"),
        os.path.join(base_dir, "temp"),
        os.path.join(base_dir, "temp", "instantmesh"),
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)

# Function to create the Flask app instance
def create_app():
    # Initialize required directories
    init_directories()
    
    # Initialize demo data on startup
    init_demo_venue()
    # Path to the React app's dist folder (relative to server directory)
    # Navigates up from server/ to root fyp/ and then into dist/
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    client_dist_folder = os.path.abspath(os.path.join(BASE_DIR, '..', 'dist'))

    app = Flask(__name__, static_folder='static', static_url_path='/static')
    # Allow Vercel / any origin + ngrok browser-warning bypass header on cross-origin fetches
    CORS(
        app,
        resources={r"/*": {"origins": "*"}},
        allow_headers=["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
        expose_headers=["Content-Type"],
    )

    # Gzip/deflate compression for responses (including GLB model files)
    app.config['COMPRESS_MIMETYPES'] = [
        'text/html', 'text/css', 'text/xml', 'text/javascript',
        'application/json', 'application/javascript',
        'application/octet-stream', 'model/gltf-binary',
    ]
    app.config['COMPRESS_MIN_SIZE'] = 512
    Compress(app)

    @app.after_request
    def add_cache_headers(response):
        if request.path.startswith('/static/'):
            response.headers['Cache-Control'] = 'public, max-age=86400'
        return response

    # Register the Blueprint for API routes
    app.register_blueprint(api_bp, url_prefix='/api/v1')

    # Routes to serve React app for mobile access
    @app.route('/mobile', defaults={'path': ''})
    @app.route('/mobile/<path:path>')
    def serve_mobile_app(path):
        """
        Serve the React app for mobile access via /mobile/* routes.
        This allows a single Ngrok tunnel to serve both API and frontend.
        
        Logic:
        - If path exists and is not empty, serve the file (for static assets)
        - Otherwise, serve index.html for SPA routing
        """
        if path != "" and os.path.exists(os.path.join(client_dist_folder, path)):
            # Serve static assets (JS, CSS, images, etc.)
            return send_from_directory(client_dist_folder, path)
        # Serve index.html for all other routes (SPA routing)
        return send_from_directory(client_dist_folder, 'index.html')

    # This creates the "homepage" (the root route)
    @app.route('/')
    def index():
        return "Event Space Visualizer API is running! Go to /mobile for the guided tour interface."

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    app.run(host='0.0.0.0', debug=debug, port=port)


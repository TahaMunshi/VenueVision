from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import sys
import os

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

    # Configure Flask to serve static files from the server/static directory
    app = Flask(__name__, static_folder='static', static_url_path='/static')
    CORS(app) 

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
    app.run(host='0.0.0.0', debug=True, port=5000)


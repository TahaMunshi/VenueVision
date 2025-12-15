from flask import Blueprint

from .capture import capture_bp
from .floor_plan import floor_plan_bp
from .health import health_bp
from .layout import layout_bp
from .maintenance import maintenance_bp
from .walls import walls_bp

# Master API blueprint that groups feature-specific blueprints
api_bp = Blueprint("api", __name__)

for bp in [health_bp, floor_plan_bp, walls_bp, capture_bp, layout_bp, maintenance_bp]:
    api_bp.register_blueprint(bp)


"""
Database visualization script - generates HTML page showing database structure
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import execute_query

def generate_database_visualization():
    """Generate HTML visualization of database structure"""
    
    html = """
<!DOCTYPE html>
<html>
<head>
    <title>VenueVision Database Structure</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #1a202c;
            color: #e2e8f0;
            padding: 40px;
            margin: 0;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            color: #4fd1c5;
            margin-bottom: 40px;
        }
        .tables-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 24px;
            margin-bottom: 40px;
        }
        .table-card {
            background: #2d3748;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
        .table-name {
            font-size: 24px;
            font-weight: 700;
            color: #4fd1c5;
            margin: 0 0 16px 0;
        }
        .table-info {
            font-size: 14px;
            color: #a0aec0;
            margin-bottom: 16px;
        }
        .records-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }
        .records-table th {
            background: #1a202c;
            padding: 12px;
            text-align: left;
            color: #4fd1c5;
            border-bottom: 2px solid #4fd1c5;
        }
        .records-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #4a5568;
        }
        .records-table tr:hover {
            background: #374151;
        }
        .stat-box {
            display: inline-block;
            background: #4fd1c5;
            color: #1a202c;
            padding: 4px 12px;
            border-radius: 16px;
            font-weight: 600;
            font-size: 12px;
            margin-right: 8px;
        }
        .relationships {
            background: #2d3748;
            border-radius: 12px;
            padding: 24px;
            margin-top: 24px;
        }
        .relationships h2 {
            color: #4fd1c5;
            margin-top: 0;
        }
        .relationship {
            background: #1a202c;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            border-left: 4px solid #4fd1c5;
        }
        .code {
            background: #1a202c;
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            margin-top: 12px;
        }
        pre {
            margin: 0;
            color: #e2e8f0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🗄️ VenueVision Database Structure</h1>
"""
    
    try:
        # Get all tables data
        tables = ['users', 'venues', 'venue_walls', 'venue_assets', 'venue_floor_plans', 'venue_polygons']
        
        for table in tables:
            try:
                # Get count
                count_result = execute_query(f"SELECT COUNT(*) as count FROM {table}", fetch_one=True)
                count = count_result['count'] if count_result else 0
                
                # Get sample data
                records = execute_query(f"SELECT * FROM {table} LIMIT 5", fetch=True) or []
                
                html += f"""
        <div class="tables-grid">
            <div class="table-card">
                <h2 class="table-name">{table}</h2>
                <div class="table-info">
                    <span class="stat-box">{count} records</span>
                </div>
"""
                
                if records:
                    html += """
                <table class="records-table">
                    <thead>
                        <tr>
"""
                    # Headers
                    for key in records[0].keys():
                        html += f"                            <th>{key}</th>\n"
                    
                    html += """
                        </tr>
                    </thead>
                    <tbody>
"""
                    
                    # Rows
                    for record in records:
                        html += "                        <tr>\n"
                        for key, value in record.items():
                            # Truncate long values
                            display_value = str(value)[:50] if value else ''
                            if len(str(value)) > 50:
                                display_value += '...'
                            html += f"                            <td>{display_value}</td>\n"
                        html += "                        </tr>\n"
                    
                    html += """
                    </tbody>
                </table>
"""
                else:
                    html += "                <p style='color: #a0aec0;'>No records yet</p>\n"
                
                html += """
            </div>
        </div>
"""
            except Exception as e:
                print(f"Warning: Could not fetch data for {table}: {e}")
        
        # Add relationships section
        html += """
        <div class="relationships">
            <h2>📊 Database Relationships</h2>
            
            <div class="relationship">
                <strong>users → venues (1:many)</strong>
                <p>One user can have multiple venues</p>
                <div class="code">
                    <pre>venues.user_id → users.user_id (ON DELETE CASCADE)</pre>
                </div>
            </div>
            
            <div class="relationship">
                <strong>venues → venue_walls (1:many)</strong>
                <p>One venue can have multiple walls</p>
                <div class="code">
                    <pre>venue_walls.venue_id → venues.venue_id (ON DELETE CASCADE)</pre>
                </div>
            </div>
            
            <div class="relationship">
                <strong>venues → venue_assets (1:many)</strong>
                <p>One venue can have multiple assets (furniture)</p>
                <div class="code">
                    <pre>venue_assets.venue_id → venues.venue_id (ON DELETE CASCADE)</pre>
                </div>
            </div>
            
            <div class="relationship">
                <strong>venues → venue_floor_plans (1:many)</strong>
                <p>One venue can have multiple floor plan versions</p>
                <div class="code">
                    <pre>venue_floor_plans.venue_id → venues.venue_id (ON DELETE CASCADE)</pre>
                </div>
            </div>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding: 20px; background: #2d3748; border-radius: 12px;">
            <p style="color: #a0aec0;">Generated on: """ + str(__import__('datetime').datetime.now()) + """</p>
            <p style="color: #4fd1c5; font-weight: 600;">VenueVision Multi-User Database System</p>
        </div>
    </div>
</body>
</html>
"""
        
    except Exception as e:
        html += f"<p style='color: #fc8181;'>Error generating visualization: {e}</p>"
    
    # Save HTML file
    output_path = os.path.join(os.path.dirname(__file__), 'static', 'database_visualization.html')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"✅ Database visualization generated: {output_path}")
    print(f"📊 Access at: http://localhost:5000/static/database_visualization.html")
    
    return output_path


if __name__ == '__main__':
    generate_database_visualization()

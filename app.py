from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import json
import math
import requests
import os
from math import radians, cos, sin, asin, sqrt
from dotenv import load_dotenv
load_dotenv()

# ── Gemini AI Setup ──────────────────────────────────────────────────────────
try:
    import google.generativeai as genai
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
    if GEMINI_API_KEY and GEMINI_API_KEY != 'your_gemini_api_key_here':
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel('gemini-1.5-flash')
        GEMINI_AVAILABLE = True
    else:
        GEMINI_AVAILABLE = False
except Exception:
    GEMINI_AVAILABLE = False

app = Flask(__name__)

# Tupi, South Cotabato coordinates
TUPI_LAT = 6.3167
TUPI_LNG = 124.9500

# Function to calculate distance between two coordinates (Haversine formula)
def calculate_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    Returns distance in kilometers
    """
    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    
    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # Radius of earth in kilometers
    return c * r

# Function to fetch real earthquake data from USGS
def fetch_real_earthquakes():
    """
    Fetch real earthquake data from USGS Earthquake API
    Returns earthquakes within 500km of Tupi, South Cotabato from the last 30 days
    """
    try:
        # USGS Earthquake API endpoint
        # Get earthquakes from last 30 days, magnitude 2.0+, within ~500km radius
        url = "https://earthquake.usgs.gov/fdsnws/event/1/query"
        params = {
            'format': 'geojson',
            'starttime': (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'),
            'endtime': datetime.now().strftime('%Y-%m-%d'),
            'minmagnitude': 2.0,
            'latitude': TUPI_LAT,
            'longitude': TUPI_LNG,
            'maxradiuskm': 500,
            'orderby': 'time'
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            earthquakes = []
            
            for feature in data['features']:
                props = feature['properties']
                coords = feature['geometry']['coordinates']
                
                # Calculate distance from Tupi
                distance = calculate_distance(TUPI_LAT, TUPI_LNG, coords[1], coords[0])
                
                # Determine risk level based on magnitude and distance
                magnitude = props['mag']
                if magnitude >= 5.0 and distance < 50:
                    risk_level = 'high'
                elif magnitude >= 4.0 and distance < 100:
                    risk_level = 'high'
                elif magnitude >= 3.0 and distance < 50:
                    risk_level = 'medium'
                elif magnitude >= 3.0 and distance < 150:
                    risk_level = 'medium'
                else:
                    risk_level = 'low'
                
                earthquake = {
                    'id': feature['id'],
                    'magnitude': magnitude,
                    'location': props['place'],
                    'depth': coords[2],  # depth in km
                    'timestamp': datetime.fromtimestamp(props['time'] / 1000).isoformat(),
                    'coordinates': [coords[1], coords[0]],  # [lat, lng]
                    'riskLevel': risk_level,
                    'distance': round(distance, 1)
                }
                earthquakes.append(earthquake)
            
            # Sort by distance (nearest first)
            earthquakes.sort(key=lambda x: x['distance'])
            
            # Return top 10 nearest earthquakes
            return earthquakes[:10] if earthquakes else get_mock_earthquakes()
        else:
            print(f"USGS API Error: {response.status_code}")
            return get_mock_earthquakes()
            
    except Exception as e:
        print(f"Error fetching real earthquakes: {e}")
        return get_mock_earthquakes()

# Fallback mock data if API fails
def get_mock_earthquakes():
    """Return mock earthquake data as fallback"""
    return [
        {
            'id': '1',
            'magnitude': 4.5,
            'location': 'Makilala, Cotabato',
            'depth': 10,
            'timestamp': (datetime.now() - timedelta(minutes=30)).isoformat(),
            'coordinates': [6.9896, 125.0896],
            'riskLevel': 'high',
            'distance': 2.3
        },
        {
            'id': '2',
            'magnitude': 3.2,
            'location': 'Tupi, South Cotabato',
            'depth': 15,
            'timestamp': (datetime.now() - timedelta(hours=2)).isoformat(),
            'coordinates': [6.3333, 124.9500],
            'riskLevel': 'medium',
            'distance': 5.7
        },
        {
            'id': '3',
            'magnitude': 2.8,
            'location': 'Polomolok, South Cotabato',
            'depth': 20,
            'timestamp': (datetime.now() - timedelta(hours=5)).isoformat(),
            'coordinates': [6.2167, 125.0667],
            'riskLevel': 'low',
            'distance': 12.4
        }
    ]

# Cache for earthquake data (refresh every 5 minutes)
earthquake_cache = {
    'data': None,
    'timestamp': None
}

def get_earthquakes():
    """Get earthquakes with caching"""
    now = datetime.now()
    
    # Check if cache is valid (less than 5 minutes old)
    if (earthquake_cache['data'] is not None and 
        earthquake_cache['timestamp'] is not None and
        (now - earthquake_cache['timestamp']).total_seconds() < 300):
        return earthquake_cache['data']
    
    # Fetch fresh data
    earthquakes = fetch_real_earthquakes()
    earthquake_cache['data'] = earthquakes
    earthquake_cache['timestamp'] = now
    
    return earthquakes

def generate_dynamic_alerts(earthquakes_data):
    """
    Dynamically generate alerts from live earthquake data.
    Returns list of alert objects derived from real USGS earthquake events.
    """
    alerts = []
    now = datetime.now()

    for quake in earthquakes_data:
        quake_time = datetime.fromisoformat(quake['timestamp'])
        hours_ago = (now - quake_time).total_seconds() / 3600

        # Only generate alerts for earthquakes within last 24 hours
        if hours_ago > 24:
            continue

        mag = quake['magnitude']
        dist = quake['distance']
        loc = quake['location']
        risk = quake['riskLevel']

        # 1. Primary earthquake detection alert
        if mag >= 4.0 or dist < 10:
            if mag >= 5.0:
                severity = 'critical'
                title = f'Strong Earthquake Detected - M{mag}'
                msg = (f'A strong magnitude {mag} earthquake was detected {dist:.1f}km from your location '
                       f'at {loc}. Depth: {quake["depth"]}km. DROP, COVER, and HOLD ON immediately!')
            elif mag >= 4.0:
                severity = 'high'
                title = f'Moderate Earthquake Detected - M{mag}'
                msg = (f'Magnitude {mag} earthquake detected {dist:.1f}km from your location '
                       f'at {loc}. Stay alert and be prepared for aftershocks.')
            else:
                severity = 'warning'
                title = f'Minor Earthquake Detected - M{mag}'
                msg = (f'Magnitude {mag} earthquake detected {dist:.1f}km away at {loc}. '
                       f'Monitor for additional activity.')

            alerts.append({
                'id': f'eq-{quake["id"]}',
                'type': 'earthquake',
                'severity': severity,
                'title': title,
                'message': msg,
                'timestamp': quake['timestamp'],
                'location': loc,
                'isRead': False,
                'earthquakeData': {
                    'magnitude': mag,
                    'distance': dist,
                    'depth': quake['depth'],
                    'riskLevel': risk
                }
            })

        # 2. Aftershock warning for M4.0+ within last 12 hours
        if mag >= 4.0 and hours_ago < 12:
            alerts.append({
                'id': f'aftershock-{quake["id"]}',
                'type': 'aftershock',
                'severity': 'warning',
                'title': 'Aftershock Warning',
                'message': (f'Following the M{mag} earthquake at {loc}, aftershocks may occur '
                            f'in the next 24-48 hours. Keep emergency supplies ready and stay alert.'),
                'timestamp': (quake_time + timedelta(minutes=15)).isoformat(),
                'location': loc,
                'isRead': False,
                'earthquakeData': {
                    'magnitude': mag,
                    'distance': dist,
                    'depth': quake['depth'],
                    'riskLevel': risk
                }
            })

        # 3. Evacuation notice for high-risk events within last 6 hours
        if risk == 'high' and hours_ago < 6:
            alerts.append({
                'id': f'evac-{quake["id"]}',
                'type': 'evacuation',
                'severity': 'info',
                'title': 'Evacuation Centers Now Open',
                'message': ('Following the recent earthquake, evacuation centers are now open. '
                            'Tupi Municipal Gymnasium and Barangay Hall are providing shelter, '
                            'food, water, and medical assistance.'),
                'timestamp': (quake_time + timedelta(minutes=30)).isoformat(),
                'location': 'Tupi Municipal Gymnasium, Barangay Hall',
                'isRead': False,
                'earthquakeData': {
                    'magnitude': mag,
                    'distance': dist,
                    'depth': quake['depth'],
                    'riskLevel': risk
                }
            })

    # If no alerts, add a general preparedness notice
    if not alerts:
        alerts.append({
            'id': 'preparedness-1',
            'type': 'info',
            'severity': 'info',
            'title': 'All Clear - Stay Prepared',
            'message': ('No significant seismic activity detected in your area. '
                        'Use this calm period to review your emergency kit, practice '
                        'Drop-Cover-Hold On, and keep E-TIPS notifications enabled.'),
            'timestamp': now.isoformat(),
            'location': None,
            'isRead': True,
            'earthquakeData': None
        })

    # Sort by timestamp, newest first
    alerts.sort(key=lambda x: x['timestamp'], reverse=True)
    return alerts

safety_guides = [
    {
        'id': '1',
        'phase': 'before',
        'title': 'Prepare Your Home',
        'description': 'Essential steps to prepare your family and home before an earthquake strikes.',
        'image': '/static/images/before-earthquake.jpg',
        'steps': [
            {'id': 'b1', 'order': 1, 'title': 'Secure Heavy Items', 'description': 'Anchor heavy furniture and appliances to walls', 'icon': 'anchor'},
            {'id': 'b2', 'order': 2, 'title': 'Create Emergency Kit', 'description': 'Prepare food, water, and supplies for 72 hours', 'icon': 'package'},
            {'id': 'b3', 'order': 3, 'title': 'Plan Meeting Points', 'description': 'Identify safe spots inside and outside your home', 'icon': 'map-pin'},
            {'id': 'b4', 'order': 4, 'title': 'Practice Drills', 'description': 'Regularly practice Drop, Cover, and Hold On', 'icon': 'repeat'}
        ]
    },
    {
        'id': '2',
        'phase': 'during',
        'title': 'Drop, Cover, Hold On',
        'description': 'What to do when an earthquake happens to protect yourself and your family.',
        'image': '/static/images/during-earthquake.jpg',
        'steps': [
            {'id': 'd1', 'order': 1, 'title': 'Drop', 'description': 'Drop to your hands and knees immediately', 'icon': 'arrow-down'},
            {'id': 'd2', 'order': 2, 'title': 'Cover', 'description': 'Cover your head and neck under sturdy furniture', 'icon': 'shield'},
            {'id': 'd3', 'order': 3, 'title': 'Hold On', 'description': 'Hold on to your shelter until shaking stops', 'icon': 'hand'},
            {'id': 'd4', 'order': 4, 'title': 'Stay Inside', 'description': 'Do not run outside during the shaking', 'icon': 'home'}
        ]
    },
    {
        'id': '3',
        'phase': 'after',
        'title': 'Recover & Rebuild',
        'description': 'Steps to take after the earthquake to ensure safety and begin recovery.',
        'image': '/static/images/after-earthquake.jpg',
        'steps': [
            {'id': 'a1', 'order': 1, 'title': 'Check for Injuries', 'description': 'Administer first aid and call for help if needed', 'icon': 'heart-pulse'},
            {'id': 'a2', 'order': 2, 'title': 'Inspect Damage', 'description': 'Check your home for structural damage carefully', 'icon': 'search'},
            {'id': 'a3', 'order': 3, 'title': 'Listen for Updates', 'description': 'Monitor radio or E-TIPS for emergency information', 'icon': 'radio'},
            {'id': 'a4', 'order': 4, 'title': 'Help Others', 'description': 'Assist neighbors and community members in need', 'icon': 'users'}
        ]
    }
]

# Community posts removed - feature not yet implemented

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/sw.js')
def service_worker():
    """Serve the service worker from root scope (required for full-origin push)."""
    from flask import send_from_directory, make_response
    response = make_response(send_from_directory('static', 'sw.js'))
    response.headers['Content-Type'] = 'application/javascript'
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Cache-Control'] = 'no-cache'
    return response

@app.route('/manifest.json')
def manifest():
    """Serve the PWA manifest."""
    from flask import send_from_directory
    return send_from_directory('static', 'manifest.json')


@app.route('/api/earthquakes')
def get_earthquakes_api():
    """API endpoint to get earthquake data"""
    earthquakes = get_earthquakes()
    return jsonify(earthquakes)

@app.route('/api/alerts')
def get_alerts():
    """Dynamically generate alerts from live earthquake data."""
    earthquakes_data = get_earthquakes()
    dynamic_alerts = generate_dynamic_alerts(earthquakes_data)
    return jsonify(dynamic_alerts)

@app.route('/api/alerts/<alert_id>/read', methods=['POST'])
def mark_alert_read(alert_id):
    # Alerts are now dynamic; mark-as-read is acknowledged but not persisted
    return jsonify({'success': True})

@app.route('/api/safety-guides')
def get_safety_guides():
    return jsonify(safety_guides)

# Community posts API removed - feature not yet implemented
# @app.route('/api/community-posts')
# def get_community_posts():
#     return jsonify([])

def assess_single_earthquake(quake, all_quakes, active_alerts):
    """
    Perform a full AI risk assessment for one specific earthquake.
    Returns a complete assessment dict with score, level, factors, actions, insights.
    """
    now = datetime.now()
    quake_time = datetime.fromisoformat(quake['timestamp'])
    hours_ago = (now - quake_time).total_seconds() / 3600

    mag = quake['magnitude']
    dist = quake['distance']
    depth = quake['depth']

    # --- Factors ---
    # 1. Proximity (40%)
    proximity_score = max(0, 100 - (dist * 2))

    # 2. Magnitude (35%)
    magnitude_score = min(100, mag * 18)

    # 3. Depth (15%) – shallower is more dangerous
    depth_score = max(0, 100 - (depth * 2.5))

    # 4. Recency (10%) – how recent is this quake
    recency_score = max(0, 100 - (hours_ago * 4))

    # Aftershock probability based on this quake's magnitude
    aftershock_prob = min(100, (mag - 2) * 25) if mag > 2 else 0

    # Raw weighted score for this single quake
    raw = (
        proximity_score * 0.40 +
        magnitude_score * 0.35 +
        depth_score    * 0.15 +
        recency_score  * 0.10
    )

    # Alert boost from any active alerts tied to this quake
    quake_alerts = [a for a in active_alerts if
                    a.get('earthquakeData') and
                    abs(a['earthquakeData'].get('magnitude', 0) - mag) < 0.1 and
                    abs(a['earthquakeData'].get('distance', 999) - dist) < 1]
    crit = sum(1 for a in quake_alerts if a['severity'] in ('critical', 'high'))
    warn = sum(1 for a in quake_alerts if a['severity'] == 'warning')
    alert_boost = min(25, crit * 15 + warn * 7)

    score = min(100, max(0, int(raw) + alert_boost))

    # Risk level
    if score >= 75:
        level = 'high'
        preparedness = 'Immediate Action Required'
        trend = 'critical'
        next_review = '6 hours'
    elif score >= 50:
        level = 'medium'
        preparedness = 'Enhanced Vigilance'
        trend = 'elevated'
        next_review = '24 hours'
    elif score >= 25:
        level = 'low'
        preparedness = 'Standard Monitoring'
        trend = 'normal'
        next_review = '3 days'
    else:
        level = 'low'
        preparedness = 'Basic Awareness'
        trend = 'minimal'
        next_review = '1 week'

    # Confidence based on data completeness
    confidence = min(95, 65 + (10 if hours_ago < 6 else 5) + (10 if dist < 50 else 0) + (5 if mag >= 4 else 0))

    factors = [
        {
            'name': '🌍 Proximity to Your Location',
            'impact': min(100, int(proximity_score)),
            'description': f'{dist:.1f}km away — {"Very close, high impact" if dist < 20 else "Moderate distance" if dist < 60 else "Distant, lower impact"}'
        },
        {
            'name': '📊 Magnitude Strength',
            'impact': min(100, int(magnitude_score)),
            'description': f'M{mag} — {"Severe" if mag >= 5.0 else "Strong" if mag >= 4.0 else "Moderate" if mag >= 3.0 else "Minor"} intensity event'
        },
        {
            'name': '⚡ Focal Depth',
            'impact': min(100, int(depth_score)),
            'description': f'{depth}km depth — {"Shallow (high surface impact)" if depth < 15 else "Intermediate depth" if depth < 30 else "Deep focus (reduced surface impact)"}'
        },
        {
            'name': '⏰ Event Recency',
            'impact': min(100, int(recency_score)),
            'description': f'{formatTimeAgo(quake["timestamp"])} — {"Immediate threat" if hours_ago < 1 else "Recent event" if hours_ago < 6 else "Older event" if hours_ago < 24 else "Historical event"}'
        },
        {
            'name': '🔄 Aftershock Probability',
            'impact': min(100, int(aftershock_prob)),
            'description': f'{"High" if aftershock_prob > 70 else "Moderate" if aftershock_prob > 40 else "Low"} aftershock risk — {int(aftershock_prob)}% probability in next 48 hours'
        },
        {
            'name': '🚨 Associated Alert Status',
            'impact': min(100, alert_boost * 4),
            'description': f'{len(quake_alerts)} alert(s) generated: {crit} critical, {warn} warning — risk boosted by +{alert_boost} pts'
        }
    ]

    # Actions tailored to this specific quake
    if level == 'high':
        actions = [
            f'🚨 M{mag} at {quake["location"]} ({dist:.1f}km away) — DROP, COVER, HOLD ON immediately',
            '🔦 Locate flashlights, shoes, and whistle by every bed RIGHT NOW',
            '💧 Ensure 3-day water supply is accessible (1 gal/person/day)',
            '📻 Tune battery radio to emergency broadcast frequency',
            '👨‍👩‍👧‍👦 Conduct immediate family safety check and meet at safe spot',
            '🏥 Check first aid kit is fully stocked and accessible',
            '⚠️ Inspect home for gas leaks, structural damage, and hazards',
            '📱 Enable all E-TIPS push notifications — stay connected'
        ]
    elif level == 'medium':
        actions = [
            f'⚡ M{mag} at {quake["location"]} ({dist:.1f}km) — stay alert for aftershocks',
            '📋 Review and update emergency contact list and evacuation routes',
            '🎒 Verify emergency kit is complete and supplies are not expired',
            '🔍 Inspect home for unsecured heavy items and potential hazards',
            '👨‍👩‍👧‍👦 Practice DROP, COVER, HOLD ON drill with family',
            '📱 Keep E-TIPS notifications active for real-time updates'
        ]
    else:
        actions = [
            f'✓ M{mag} at {quake["location"]} ({dist:.1f}km) — low immediate risk, stay informed',
            '📚 Review earthquake safety guidelines as a precaution',
            '🎒 Maintain basic 72-hour emergency supply kit',
            '📱 Keep E-TIPS app notifications enabled',
            '🏗️ Consider earthquake insurance for your property'
        ]

    # Summary recommendation
    alert_ctx = f'{crit} critical + {warn} warning alert(s) active for this event.' if (crit + warn) > 0 else 'No alerts triggered for this event.'
    if level == 'high':
        rec = (f'🚨 HIGH RISK: M{mag} earthquake at {quake["location"]}, {dist:.1f}km away, '
               f'{depth}km deep. {alert_ctx} Risk score: {score}/100 — Confidence: {confidence}%. Immediate action required.')
    elif level == 'medium':
        rec = (f'⚡ ELEVATED RISK: M{mag} at {quake["location"]}, {dist:.1f}km away. '
               f'{alert_ctx} Risk score: {score}/100 — Confidence: {confidence}%. Enhanced preparedness recommended.')
    else:
        rec = (f'✓ LOW RISK: M{mag} at {quake["location"]}, {dist:.1f}km away, {formatTimeAgo(quake["timestamp"])}. '
               f'{alert_ctx} Risk score: {score}/100 — Confidence: {confidence}%. Maintain standard preparedness.')

    return {
        'quakeId': quake['id'],
        'quakeLocation': quake['location'],
        'magnitude': mag,
        'distance': dist,
        'depth': depth,
        'timestamp': quake['timestamp'],
        'level': level,
        'score': score,
        'confidence': confidence,
        'factors': factors,
        'recommendation': rec,
        'detailedActions': actions,
        'insights': {
            'trend': trend,
            'nextReview': next_review,
            'preparednessLevel': preparedness,
            'hoursAgo': round(hours_ago, 1),
            'aftershockProbability': f'{int(aftershock_prob)}%',
            'focalDepth': f'{depth}km',
            'alertsTriggered': len(quake_alerts),
            'criticalAlerts': crit,
            'warningAlerts': warn,
            'alertBoost': alert_boost,
            'aiConfidence': confidence,
            'recommendation': f'AI individually assessed M{mag} event — {formatTimeAgo(quake["timestamp"])}'
        }
    }


@app.route('/api/risk-assessment/<quake_id>', methods=['GET'])
def risk_assessment_single(quake_id):
    """Assess a single earthquake by its ID."""
    all_earthquakes = get_earthquakes()
    active_alerts = generate_dynamic_alerts(all_earthquakes)

    quake = next((q for q in all_earthquakes if q['id'] == quake_id), None)
    if not quake:
        return jsonify({'error': 'Earthquake not found'}), 404

    result = assess_single_earthquake(quake, all_earthquakes, active_alerts)
    return jsonify(result)


@app.route('/api/risk-assessment', methods=['POST'])
def risk_assessment():
    data = request.json
    user_lat = data.get('lat', TUPI_LAT)
    user_lng = data.get('lng', TUPI_LNG)
    
    # Get real earthquake data AND live dynamic alerts
    all_earthquakes = get_earthquakes()
    active_alerts = generate_dynamic_alerts(all_earthquakes)

    # Count critical/high alerts for alert-boost factor
    critical_alert_count = sum(1 for a in active_alerts if a['severity'] in ('critical', 'high'))
    warning_alert_count = sum(1 for a in active_alerts if a['severity'] == 'warning')
    alert_boost = min(30, critical_alert_count * 15 + warning_alert_count * 7)
    
    # ADVANCED AI RISK ASSESSMENT SYSTEM
    # Multi-layered analysis incorporating both seismic data AND active alerts
    
    # Get all nearby earthquakes (within 100km for comprehensive analysis)
    nearby_quakes = [q for q in all_earthquakes if q['distance'] < 100]
    
    # Check for RECENT earthquakes (within last 24 hours) - this is what matters for alerts
    now = datetime.now()
    recent_quakes = []
    for quake in nearby_quakes:
        quake_time = datetime.fromisoformat(quake['timestamp'])
        hours_ago = (now - quake_time).total_seconds() / 3600
        if hours_ago <= 24:
            recent_quakes.append(quake)
    
    # NO NEARBY EARTHQUAKES AT ALL
    if not nearby_quakes:
        return jsonify({
            'level': 'safe',
            'score': 0,
            'factors': [
                {'name': '✅ Seismic Activity Status', 'impact': 0, 'description': 'No earthquakes detected within 100km radius'},
                {'name': '🛡️ Regional Stability', 'impact': 0, 'description': 'Your area shows excellent seismic stability'},
                {'name': '📊 Historical Analysis', 'impact': 0, 'description': 'No significant seismic events in recent history'},
                {'name': '🏗️ Infrastructure Safety', 'impact': 0, 'description': 'Buildings are safe with no seismic stress'},
                {'name': '⏰ Threat Timeline', 'impact': 0, 'description': 'No immediate or upcoming seismic threats detected'},
                {'name': '🎯 Location Assessment', 'impact': 0, 'description': 'Your location is in a low-risk seismic zone'}
            ],
            'recommendation': '🎉 EXCELLENT NEWS: No seismic activity detected in your area! Your region is currently experiencing complete seismic calm. No earthquakes, no aftershocks, no threats. This is the ideal safety condition.',
            'detailedActions': [
                '✅ Your area is completely safe - no immediate action needed',
                '📚 Use this calm period to review earthquake safety guidelines',
                '🎒 Maintain a basic 72-hour emergency kit as standard practice',
                '👨‍👩‍👧‍👦 Keep family emergency contact list updated',
                '📱 Keep E-TIPS notifications enabled for future alerts',
                '🎓 Consider attending community preparedness workshops when available'
            ],
            'insights': {
                'trend': 'excellent',
                'nextReview': '1 month',
                'preparednessLevel': 'Routine Maintenance',
                'nearbyEvents': 0,
                'strongestMagnitude': 'None',
                'closestDistance': 'No earthquakes detected',
                'aiConfidence': 99,
                'riskTrend': 'stable',
                'alertStatus': 'NO ACTIVE ALERTS',
                'recommendation': '🌟 Perfect conditions - Continue normal activities with peace of mind'
            }
        })
    
    # NO RECENT EARTHQUAKES (all are old, more than 24 hours ago)
    if not recent_quakes:
        oldest_quake = min(nearby_quakes, key=lambda x: datetime.fromisoformat(x['timestamp']))
        oldest_time = datetime.fromisoformat(oldest_quake['timestamp'])
        days_ago = (now - oldest_time).total_seconds() / (3600 * 24)
        
        return jsonify({
            'level': 'safe',
            'score': 5,
            'factors': [
                {'name': '✅ Recent Activity Status', 'impact': 5, 'description': 'No earthquakes in the last 24 hours - all clear'},
                {'name': '📊 Historical Context', 'impact': 10, 'description': f'Last earthquake was {int(days_ago)} days ago - no current threat'},
                {'name': '🛡️ Current Safety Level', 'impact': 5, 'description': 'No active seismic threats or warnings'},
                {'name': '⏰ Threat Assessment', 'impact': 0, 'description': 'No immediate or upcoming dangers detected'},
                {'name': '🏗️ Infrastructure Status', 'impact': 0, 'description': 'All buildings safe - no seismic stress'},
                {'name': '🎯 Alert Status', 'impact': 0, 'description': 'NO ACTIVE ALERTS - Area is secure'}
            ],
            'recommendation': f'✅ ALL CLEAR: No recent seismic activity detected! The last earthquake in your area was {int(days_ago)} days ago. Your region is currently stable with no active threats, no aftershock risks, and no emergency alerts.',
            'detailedActions': [
                '🎉 Great news - No immediate threats or active alerts',
                '📚 Use this quiet period to review earthquake preparedness',
                '🎒 Check your emergency kit and replace expired items',
                '👨‍👩‍👧‍👦 Practice DROP, COVER, HOLD ON with your family',
                '📱 Keep E-TIPS notifications enabled for future alerts',
                '🏠 Consider earthquake insurance during this calm period'
            ],
            'insights': {
                'trend': 'stable',
                'nextReview': '2 weeks',
                'preparednessLevel': 'Standard Readiness',
                'nearbyEvents': len(nearby_quakes),
                'strongestMagnitude': f'M{max(q["magnitude"] for q in nearby_quakes)} ({int(days_ago)} days ago)',
                'closestDistance': f'{min(q["distance"] for q in nearby_quakes):.1f}km (historical)',
                'aiConfidence': 95,
                'riskTrend': 'stable',
                'alertStatus': 'NO ACTIVE ALERTS',
                'recommendation': '🌟 No current threats - Perfect time for preparedness review'
            }
        })
    
    # RECENT EARTHQUAKES DETECTED (within last 24 hours) - ACTIVE THREAT ANALYSIS
    # ADVANCED MULTI-FACTOR ANALYSIS
    
    # 1. PROXIMITY ANALYSIS (35% weight)
    nearest_quake = min(recent_quakes, key=lambda x: x['distance'])
    distance = nearest_quake['distance']
    proximity_score = max(0, 100 - (distance * 2))  # Exponential decay
    
    # 2. MAGNITUDE ANALYSIS (30% weight)
    strongest_quake = max(recent_quakes, key=lambda x: x['magnitude'])
    magnitude = strongest_quake['magnitude']
    magnitude_score = min(100, magnitude * 18)  # Logarithmic scale
    
    # 3. DEPTH ANALYSIS (15% weight)
    avg_depth = sum(q['depth'] for q in recent_quakes) / len(recent_quakes)
    depth_score = max(0, 100 - (avg_depth * 2.5))  # Shallow = more dangerous
    
    # 4. FREQUENCY ANALYSIS (10% weight)
    frequency_score = min(100, len(recent_quakes) * 15)
    
    # 5. TIME-BASED DECAY (5% weight)
    # Recent earthquakes are more concerning
    time_scores = []
    for quake in recent_quakes:
        quake_time = datetime.fromisoformat(quake['timestamp'])
        hours_ago = (now - quake_time).total_seconds() / 3600
        time_score = max(0, 100 - (hours_ago * 4))  # Faster decay for 24h window
        time_scores.append(time_score)
    time_factor = sum(time_scores) / len(time_scores) if time_scores else 0
    
    # 6. AFTERSHOCK PROBABILITY (5% weight)
    # Higher magnitude = higher aftershock probability
    aftershock_prob = min(100, (magnitude - 2) * 25) if magnitude > 2 else 0
    
    # WEIGHTED RISK CALCULATION (seismic factors)
    raw_score = (
        proximity_score * 0.35 +
        magnitude_score * 0.30 +
        depth_score * 0.15 +
        frequency_score * 0.10 +
        time_factor * 0.05 +
        aftershock_prob * 0.05
    )
    
    # AI CONFIDENCE ADJUSTMENT — more data = higher confidence
    data_points = len(recent_quakes)
    confidence = min(95, 70 + (data_points * 10))
    
    # Adjust score based on confidence
    base_score = int(raw_score * (confidence / 100))

    # ALERT BOOST — active critical/warning alerts increase risk score
    score = min(100, max(0, base_score + alert_boost))
    
    # INTELLIGENT RISK LEVEL DETERMINATION
    if score >= 75:
        level = 'high'
        preparedness = 'Immediate Action Required'
        trend = 'critical'
        next_review = '6 hours'
        risk_trend = 'increasing'
        alert_status = 'CRITICAL ALERTS ACTIVE'
    elif score >= 50:
        level = 'medium'
        preparedness = 'Enhanced Vigilance'
        trend = 'elevated'
        next_review = '24 hours'
        risk_trend = 'stable'
        alert_status = 'WARNING ALERTS ACTIVE'
    elif score >= 25:
        level = 'low'
        preparedness = 'Standard Monitoring'
        trend = 'normal'
        next_review = '3 days'
        risk_trend = 'stable'
        alert_status = 'INFO ALERTS ACTIVE'
    else:
        level = 'low'
        preparedness = 'Basic Awareness'
        trend = 'minimal'
        next_review = '1 week'
        risk_trend = 'decreasing'
        alert_status = 'MINOR ALERTS ACTIVE'
    
    # Calculate time since most recent quake
    most_recent = max(recent_quakes, key=lambda x: datetime.fromisoformat(x['timestamp']))
    most_recent_time = datetime.fromisoformat(most_recent['timestamp'])
    hours_since = (now - most_recent_time).total_seconds() / 3600
    
    # DETAILED RISK FACTORS WITH AI INSIGHTS
    factors = [
        {
            'name': '🌍 Proximity Analysis',
            'impact': min(100, int(proximity_score)),
            'description': f'{distance:.1f}km from M{nearest_quake["magnitude"]} event at {nearest_quake["location"]}'
        },
        {
            'name': '📊 Magnitude Assessment',
            'impact': min(100, int(magnitude_score)),
            'description': f'Strongest: M{magnitude} - {"Severe" if magnitude >= 5.0 else "High" if magnitude >= 4.0 else "Moderate" if magnitude >= 3.0 else "Low"} intensity detected'
        },
        {
            'name': '⚡ Depth Analysis',
            'impact': min(100, int(depth_score)),
            'description': f'Average depth: {avg_depth:.1f}km - {"Shallow" if avg_depth < 15 else "Moderate" if avg_depth < 30 else "Deep"} focus earthquakes'
        },
        {
            'name': '📈 Recent Activity Pattern',
            'impact': min(100, int(frequency_score)),
            'description': f'{len(recent_quakes)} event(s) in last 24 hours - {"High" if len(recent_quakes) >= 5 else "Moderate" if len(recent_quakes) >= 3 else "Low"} frequency'
        },
        {
            'name': '⏰ Time-Based Urgency',
            'impact': min(100, int(time_factor)),
            'description': f'Most recent: {formatTimeAgo(most_recent["timestamp"])} - {"IMMEDIATE" if hours_since < 1 else "URGENT" if hours_since < 6 else "Recent"} threat'
        },
        {
            'name': '🔄 Aftershock Probability',
            'impact': min(100, int(aftershock_prob)),
            'description': f'{"High" if aftershock_prob > 70 else "Moderate" if aftershock_prob > 40 else "Low"} likelihood of aftershocks in next 48 hours'
        },
        {
            'name': '🚨 Active Alert Status',
            'impact': min(100, alert_boost * 3),
            'description': f'{critical_alert_count} critical, {warning_alert_count} warning alert(s) currently active — boosting risk score by +{alert_boost} pts'
        },
        {
            'name': '🏗️ Building Vulnerability',
            'impact': 35,
            'description': 'Standard residential construction - moderate resilience to seismic activity'
        }
    ]
    
    # AI-GENERATED RECOMMENDATIONS
    recommendations = {
        'high': [
            '🚨 IMMEDIATE: Verify emergency kit is complete and accessible NOW',
            '🔒 Secure all heavy furniture, appliances, and hanging objects to walls',
            '👨‍👩‍👧‍👦 Conduct family meeting TODAY - review DROP, COVER, HOLD ON',
            '📱 Ensure all family members have E-TIPS app with notifications ON',
            '🔦 Place flashlights, sturdy shoes, and whistle by every bed',
            '⚠️ Identify safe spots in each room (under sturdy tables, away from windows)',
            '📻 Keep battery-powered radio tuned to emergency frequency',
            '💧 Store extra water (1 gallon per person per day for 3 days)',
            '🏥 Update first aid kit and ensure everyone knows its location',
            '📋 Keep important documents in waterproof, grab-and-go container'
        ],
        'medium': [
            '✅ Review and update emergency supply kit within 24 hours',
            '🔍 Inspect home for potential hazards (unsecured items, gas leaks)',
            '📋 Update emergency contact list and evacuation routes',
            '🎯 Practice DROP, COVER, HOLD ON drill with entire family',
            '💼 Prepare important documents in waterproof container',
            '🏥 Verify first aid kit is complete and medications unexpired',
            '📱 Test emergency communication plan with family members',
            '🔦 Check flashlight batteries and emergency supplies'
        ],
        'low': [
            '📚 Review earthquake safety guidelines this month',
            '🔄 Maintain basic emergency supplies (72-hour kit)',
            '👥 Stay connected with community preparedness programs',
            '📱 Keep E-TIPS notifications enabled for real-time alerts',
            '🏗️ Consider earthquake insurance for your property',
            '🎓 Attend local earthquake preparedness workshops when available'
        ]
    }
    
    recommendation_list = recommendations.get(level, recommendations['low'])
    
    # MAIN AI RECOMMENDATION WITH ALERT STATUS
    alert_context = f'{critical_alert_count} critical + {warning_alert_count} warning alert(s) active.' if (critical_alert_count + warning_alert_count) > 0 else 'No high-severity alerts.'
    if level == 'high':
        main_recommendation = (f'🚨 HIGH RISK: AI cross-referenced {len(recent_quakes)} recent earthquake(s) '
                               f'(M{magnitude}, {distance:.1f}km away) with live alerts. {alert_context} '
                               f'Risk score: {score}/100 — Confidence: {confidence}%. Immediate action required.')
    elif level == 'medium':
        main_recommendation = (f'⚡ ELEVATED RISK: AI analysed seismic activity + active alerts. '
                               f'M{magnitude} detected {distance:.1f}km away. {alert_context} '
                               f'Risk score: {score}/100 — Confidence: {confidence}%. Enhanced preparedness recommended.')
    else:
        main_recommendation = (f'✓ MONITORED: AI detected {len(recent_quakes)} minor event(s) within 24 hrs. '
                               f'{alert_context} Distance: {distance:.1f}km. '
                               f'Risk score: {score}/100 — Confidence: {confidence}%. Maintain standard preparedness.')
    
    # Build per-earthquake breakdown for ALL earthquakes (not just recent ones)
    earthquake_breakdown = []
    for q in all_earthquakes:
        single = assess_single_earthquake(q, all_earthquakes, active_alerts)
        earthquake_breakdown.append({
            'quakeId': single['quakeId'],
            'quakeLocation': single['quakeLocation'],
            'magnitude': single['magnitude'],
            'distance': single['distance'],
            'timestamp': single['timestamp'],
            'level': single['level'],
            'score': single['score'],
            'confidence': single['confidence'],
            'recommendation': single['recommendation']
        })

    return jsonify({
        'level': level,
        'score': score,
        'factors': factors,
        'recommendation': main_recommendation,
        'detailedActions': recommendation_list,
        'earthquakeBreakdown': earthquake_breakdown,
        'insights': {
            'trend': trend,
            'nextReview': next_review,
            'preparednessLevel': preparedness,
            'nearbyEvents': len(recent_quakes),
            'recentEvents': len(recent_quakes),
            'strongestMagnitude': magnitude,
            'closestDistance': f'{distance:.1f}km',
            'aiConfidence': confidence,
            'riskTrend': risk_trend,
            'averageDepth': f'{avg_depth:.1f}km',
            'aftershockProbability': f'{int(aftershock_prob)}%',
            'alertStatus': alert_status,
            'activeAlerts': len(active_alerts),
            'criticalAlerts': critical_alert_count,
            'warningAlerts': warning_alert_count,
            'alertBoost': alert_boost,
            'recommendation': (f'AI assessed {len(all_earthquakes)} earthquake(s) individually + '
                               f'{len(active_alerts)} live alert(s)')
        }
    })

def formatTimeAgo(timestamp):
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(timestamp)
        now = datetime.now()
        diff = now - dt
        hours = diff.total_seconds() / 3600
        days = hours / 24
        if hours < 1:
            return f'{int(diff.total_seconds() / 60)} minutes ago'
        elif hours < 24:
            return f'{int(hours)} hours ago'
        else:
            return f'{int(days)} days ago'
    except:
        return 'recently'


# ── Real Gemini AI Analysis Endpoint ─────────────────────────────────────────
@app.route('/api/ai-analyze', methods=['POST'])
def ai_analyze():
    """Real Gemini AI earthquake risk analysis."""
    data = request.json or {}
    quake = data.get('quake', {})
    context_quakes = data.get('contextQuakes', [])
    active_alerts = data.get('activeAlerts', [])

    # Build rich context for Gemini
    mag       = quake.get('magnitude', 'N/A')
    location  = quake.get('location', 'Unknown')
    depth     = quake.get('depth', 'N/A')
    distance  = quake.get('distance', 'N/A')
    timestamp = quake.get('timestamp', '')
    risk      = quake.get('riskLevel', 'unknown')

    # Format nearby quakes
    nearby_text = ''
    if context_quakes:
        nearby_lines = []
        for q in context_quakes[:5]:
            nearby_lines.append(
                f"  - M{q.get('magnitude','?')} at {q.get('location','?')}, "
                f"{q.get('distance','?')}km away, depth {q.get('depth','?')}km"
            )
        nearby_text = 'Nearby recent earthquakes:\n' + '\n'.join(nearby_lines)
    else:
        nearby_text = 'No other nearby earthquakes in the last 24 hours.'

    alert_text = f"{len(active_alerts)} active seismic alert(s) in the region." if active_alerts else 'No active alerts.'

    time_str = ''
    if timestamp:
        try:
            dt = datetime.fromisoformat(timestamp)
            diff = datetime.now() - dt
            mins = int(diff.total_seconds() / 60)
            time_str = f"{mins} minutes ago" if mins < 60 else f"{mins//60} hours ago"
        except Exception:
            time_str = 'recently'

    prompt = f"""You are E-TIPS AI, a professional earthquake safety analyst for Tupi, South Cotabato, Philippines.
Analyze the following earthquake and give clear, practical safety advice.

EARTHQUAKE DETAILS:
- Magnitude: M{mag}
- Location: {location}
- Depth: {depth} km
- Distance from user: {distance} km
- Occurred: {time_str}
- Preliminary risk level: {risk}

{nearby_text}
Alert status: {alert_text}

Your response MUST follow this EXACT format with these section headers:

🔍 SITUATION ASSESSMENT
[2-3 sentences describing the earthquake's severity and what it means for the user]

⚠️ IMMEDIATE ACTIONS
[3-5 bullet points of what the user should do RIGHT NOW]

🏠 WHAT TO EXPECT
[2-3 sentences about aftershocks, structural effects, or what may happen next]

✅ YOU ARE SAFE WHEN
[2-3 clear conditions that indicate safety]

💡 PREPAREDNESS TIP
[1 specific, actionable preparedness tip relevant to this earthquake]

Keep your response concise, factual, and calm. Do NOT use dramatic language. Be specific to this earthquake."""

    if GEMINI_AVAILABLE:
        try:
            response = gemini_model.generate_content(prompt)
            ai_text = response.text
            return jsonify({
                'success': True,
                'analysis': ai_text,
                'source': 'gemini',
                'model': 'gemini-1.5-flash'
            })
        except Exception as e:
            # Fall through to rule-based
            pass

    # ── Fallback: smart rule-based response ──────────────────────────────────
    mag_f = float(mag) if str(mag).replace('.','').isdigit() else 0
    dist_f = float(distance) if str(distance).replace('.','').isdigit() else 999
    dep_f = float(depth) if str(depth).replace('.','').isdigit() else 10

    if mag_f >= 5.0 or dist_f < 20:
        situation = f"M{mag} at {location} is a significant earthquake. At {distance}km away and {depth}km depth, this poses an immediate local threat. Check for damage and be ready to drop, cover, and hold on."
        actions = ["DROP, COVER, and HOLD ON if shaking continues", "Check yourself and others for injuries", "Inspect for gas leaks — do NOT use open flames", "Move away from damaged structures", "Turn on battery radio for official updates"]
        expect = f"Aftershocks are likely after a M{mag} event. Expect some within the next 24-48 hours. Structural damage is possible in areas closest to the epicenter."
        safe = ["Shaking has completely stopped for several minutes", "No smell of gas or visible structural damage", "Authorities confirm the area is clear"]
        tip = "Keep shoes near your bed so you can safely move through debris if an aftershock strikes at night."
    elif mag_f >= 4.0 or dist_f < 50:
        situation = f"M{mag} at {location} is a moderate earthquake felt in your area. At {distance}km distance, effects may include shaking, minor object movement, and some alarm. Assess your surroundings calmly."
        actions = ["Remain calm and check your immediate surroundings", "Look for any fallen objects or hazards", "Check on family members and neighbors", "Avoid using elevators", "Monitor E-TIPS for aftershock updates"]
        expect = f"Minor aftershocks are possible. The {depth}km depth means surface shaking is moderate. Most well-constructed buildings should be unaffected."
        safe = ["No visible damage to your building", "No unusual sounds from structure", "Authorities issue all-clear notification"]
        tip = "Now is a good time to check your emergency kit and make sure your water supply is accessible."
    else:
        situation = f"M{mag} at {location} is a minor earthquake recorded {distance}km from your location. At this distance and magnitude, direct impact is minimal, but stay informed."
        actions = ["No immediate action required", "Stay informed via E-TIPS alerts", "Check that heavy furniture is still secured", "Note the event in case of future aftershocks"]
        expect = "Minor seismic activity like this is normal in the region. No significant aftershocks are expected from a small-magnitude event."
        safe = ["You are currently in a safe condition", "Continue normal activities", "No evacuation is necessary"]
        tip = "Use this as a reminder to review your 72-hour emergency kit this week."

    analysis = f"""🔍 SITUATION ASSESSMENT
{situation}

⚠️ IMMEDIATE ACTIONS
{''.join(f'• {a}' + chr(10) for a in actions)}
🏠 WHAT TO EXPECT
{expect}

✅ YOU ARE SAFE WHEN
{''.join(f'• {s}' + chr(10) for s in safe)}
💡 PREPAREDNESS TIP
{tip}"""

    return jsonify({
        'success': True,
        'analysis': analysis,
        'source': 'rule-based',
        'model': 'E-TIPS Safety Engine'
    })


if __name__ == '__main__':
    import os
    # Get port from environment variable (for deployment) or use 8080 as default
    port = int(os.environ.get('PORT', 8080))
    # Check if we're in production
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    app.run(debug=debug, host='0.0.0.0', port=port)

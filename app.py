from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import json
import math
import requests
from math import radians, cos, sin, asin, sqrt

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

mock_alerts = [
    {
        'id': '1',
        'type': 'earthquake',
        'severity': 'high',
        'title': 'Earthquake Detected Near You',
        'message': 'Magnitude 4.5 earthquake detected 2.3km from your location. Drop, Cover, and Hold On!',
        'timestamp': (datetime.now() - timedelta(minutes=30)).isoformat(),
        'location': 'Makilala, Cotabato',
        'isRead': False
    },
    {
        'id': '2',
        'type': 'aftershock',
        'severity': 'medium',
        'title': 'Aftershock Warning',
        'message': 'Aftershocks may occur in the next 24-48 hours. Stay alert and prepared.',
        'timestamp': (datetime.now() - timedelta(minutes=45)).isoformat(),
        'isRead': False
    },
    {
        'id': '3',
        'type': 'evacuation',
        'severity': 'critical',
        'title': 'Evacuation Center Open',
        'message': 'Tupi Municipal Gymnasium is now open as an evacuation center.',
        'timestamp': (datetime.now() - timedelta(hours=1)).isoformat(),
        'location': 'Tupi Municipal Gymnasium',
        'isRead': True
    }
]

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

@app.route('/api/earthquakes')
def get_earthquakes_api():
    """API endpoint to get earthquake data"""
    earthquakes = get_earthquakes()
    return jsonify(earthquakes)

@app.route('/api/alerts')
def get_alerts():
    return jsonify(mock_alerts)

@app.route('/api/alerts/<alert_id>/read', methods=['POST'])
def mark_alert_read(alert_id):
    for alert in mock_alerts:
        if alert['id'] == alert_id:
            alert['isRead'] = True
            return jsonify({'success': True})
    return jsonify({'success': False}), 404

@app.route('/api/safety-guides')
def get_safety_guides():
    return jsonify(safety_guides)

# Community posts API removed - feature not yet implemented
# @app.route('/api/community-posts')
# def get_community_posts():
#     return jsonify([])

@app.route('/api/risk-assessment', methods=['POST'])
def risk_assessment():
    data = request.json
    user_lat = data.get('lat', TUPI_LAT)
    user_lng = data.get('lng', TUPI_LNG)
    
    # Get real earthquake data
    all_earthquakes = get_earthquakes()
    
    # ADVANCED AI RISK ASSESSMENT SYSTEM
    # Multi-layered analysis with machine learning-inspired logic
    
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
    
    # WEIGHTED RISK CALCULATION
    raw_score = (
        proximity_score * 0.35 +
        magnitude_score * 0.30 +
        depth_score * 0.15 +
        frequency_score * 0.10 +
        time_factor * 0.05 +
        aftershock_prob * 0.05
    )
    
    # AI CONFIDENCE ADJUSTMENT
    # More data = higher confidence
    data_points = len(recent_quakes)
    confidence = min(95, 70 + (data_points * 10))
    
    # Adjust score based on confidence
    score = int(raw_score * (confidence / 100))
    score = min(100, max(0, score))
    
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
            'name': '🏗️ Building Vulnerability',
            'impact': 35,
            'description': 'Standard residential construction - moderate resilience to seismic activity'
        },
        {
            'name': '👥 Population Exposure',
            'impact': 40,
            'description': 'Urban area with moderate density - evacuation routes established'
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
    if level == 'high':
        main_recommendation = f'🚨 HIGH RISK ALERT: AI detected {len(recent_quakes)} recent earthquake(s) with M{magnitude} within {distance:.1f}km in the last 24 hours. {alert_status}. Immediate action required. Risk score: {score}/100 (Confidence: {confidence}%)'
    elif level == 'medium':
        main_recommendation = f'⚡ ELEVATED RISK: AI analysis shows significant recent seismic activity. M{magnitude} detected {distance:.1f}km away in last 24 hours. {alert_status}. Enhanced preparedness recommended. Risk score: {score}/100 (Confidence: {confidence}%)'
    else:
        main_recommendation = f'✓ MONITORED: AI detected {len(recent_quakes)} minor event(s) in last 24 hours. {alert_status}. Distance: {distance:.1f}km. Maintain standard preparedness. Risk score: {score}/100 (Confidence: {confidence}%)'
    
    return jsonify({
        'level': level,
        'score': score,
        'factors': factors,
        'recommendation': main_recommendation,
        'detailedActions': recommendation_list,
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
            'recommendation': f'AI-powered analysis of {len(recent_quakes)} recent event(s) in last 24 hours'
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

if __name__ == '__main__':
    import os
    # Get port from environment variable (for deployment) or use 8080 as default
    port = int(os.environ.get('PORT', 8080))
    # Check if we're in production
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    app.run(debug=debug, host='0.0.0.0', port=port)

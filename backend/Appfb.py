from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import uuid
import json
import subprocess
import shutil
from pathlib import Path
from werkzeug.utils import secure_filename

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configuration
UPLOAD_FOLDER = Path('uploads')
OUTPUT_FOLDER = Path('outputs')
ALLOWED_EXTENSIONS = {'json'}

UPLOAD_FOLDER.mkdir(exist_ok=True)
OUTPUT_FOLDER.mkdir(exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Store analysis sessions
analysis_sessions = {}

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ============ API ENDPOINTS ============

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'active_sessions': len(analysis_sessions)
    })


@app.route('/api/upload', methods=['POST'])
def upload_matches():
    """
    Upload two match JSON files for analysis
    
    Expects multipart/form-data with:
    - match1: First match JSON file
    - match2: Second match JSON file
    - lookahead_frames: Optional (default: 3)
    - min_passes: Optional (default: 3)
    """
    # Validate files
    if 'match1' not in request.files or 'match2' not in request.files:
        return jsonify({'error': 'Both match1 and match2 files required'}), 400
    
    match1_file = request.files['match1']
    match2_file = request.files['match2']
    
    if match1_file.filename == '' or match2_file.filename == '':
        return jsonify({'error': 'No files selected'}), 400
    
    if not allowed_file(match1_file.filename) or not allowed_file(match2_file.filename):
        return jsonify({'error': 'Only JSON files allowed'}), 400
    
    # Get parameters
    lookahead_frames = int(request.form.get('lookahead_frames', 3))
    min_passes = int(request.form.get('min_passes', 3))
    
    # Generate session ID
    session_id = str(uuid.uuid4())
    
    # Save files
    match1_filename = secure_filename(f"{session_id}_match1.json")
    match2_filename = secure_filename(f"{session_id}_match2.json")
    
    match1_path = UPLOAD_FOLDER / match1_filename
    match2_path = UPLOAD_FOLDER / match2_filename
    
    match1_file.save(match1_path)
    match2_file.save(match2_path)
    
    # Store session info
    analysis_sessions[session_id] = {
        'status': 'uploaded',
        'match1_file': match1_filename,
        'match2_file': match2_filename,
        'lookahead_frames': lookahead_frames,
        'min_passes': min_passes
    }
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'message': 'Files uploaded successfully'
    }), 201


@app.route('/analyze', methods=['POST'])
@app.route('/api/analyze', methods=['POST'])
def analyze_direct():
    """
    Direct endpoint: Upload and analyze matches in one request
    
    Expects multipart/form-data with:
    - match1: First match JSON file
    - match2: Second match JSON file
    - lookahead_frames: Optional (default: 3)
    - min_passes: Optional (default: 3)
    """
    if 'match1' not in request.files or 'match2' not in request.files:
        return jsonify({'error': 'Both match1 and match2 files required'}), 400
    
    match1_file = request.files['match1']
    match2_file = request.files['match2']
    
    if match1_file.filename == '' or match2_file.filename == '':
        return jsonify({'error': 'No files selected'}), 400
    
    if not allowed_file(match1_file.filename) or not allowed_file(match2_file.filename):
        return jsonify({'error': 'Only JSON files allowed'}), 400
    
    # Get parameters
    lookahead_frames = int(request.form.get('lookahead_frames', 3))
    min_passes = int(request.form.get('min_passes', 3))
    
    # Generate session ID
    session_id = str(uuid.uuid4())
    
    # Save files
    match1_filename = secure_filename(f"{session_id}_match1.json")
    match2_filename = secure_filename(f"{session_id}_match2.json")
    
    match1_path = UPLOAD_FOLDER / match1_filename
    match2_path = UPLOAD_FOLDER / match2_filename
    
    match1_file.save(match1_path)
    match2_file.save(match2_path)
    
    # Store session info
    analysis_sessions[session_id] = {
        'status': 'analyzing',
        'match1_file': match1_filename,
        'match2_file': match2_filename,
        'lookahead_frames': lookahead_frames,
        'min_passes': min_passes
    }
    
    try:
        # Run integrated analysis script
        default_output = Path('integrated_analysis_output.json')
        
        cmd = [
            'python',
            'match.py',
            str(match1_path),
            str(match2_path),
            '--lookahead', str(lookahead_frames),
            '--minpasses', str(min_passes)
        ]
        
        # Execute analysis
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
            cwd=str(Path.cwd())
        )
        
        print(f"\n[Analysis {session_id}] Script return code: {result.returncode}")
        if result.stdout:
            print(f"[Analysis {session_id}] STDOUT:\n{result.stdout}")
        if result.stderr:
            print(f"[Analysis {session_id}] STDERR:\n{result.stderr}")
        
        if result.returncode != 0:
            analysis_sessions[session_id]['status'] = 'error'
            analysis_sessions[session_id]['error'] = result.stderr
            return jsonify({'error': 'Analysis failed', 'details': result.stderr}), 500
        
        # Load analysis results from default output file
        if not default_output.exists():
            analysis_sessions[session_id]['status'] = 'error'
            return jsonify({'error': 'Output file not generated'}), 500
        
        with open(default_output, 'r') as f:
            analysis_data = json.load(f)
        
        # Copy to session-specific location
        output_file = OUTPUT_FOLDER / f"{session_id}_analysis.json"
        shutil.copy(default_output, output_file)
        
        # Update session
        analysis_sessions[session_id]['status'] = 'completed'
        analysis_sessions[session_id]['output_file'] = f"{session_id}_analysis.json"
        analysis_sessions[session_id]['analysis_data'] = analysis_data
        
        # Return flattened response (frontend expects top-level keys)
        response_data = {
            'success': True,
            'session_id': session_id,
            'configuration': analysis_data.get('configuration', {}),
            'match1': analysis_data.get('match1', {}),
            'match2': analysis_data.get('match2', {}),
            'similarities': analysis_data.get('similarities', [])
        }
        
        return jsonify(response_data)
    
    except subprocess.TimeoutExpired:
        analysis_sessions[session_id]['status'] = 'error'
        analysis_sessions[session_id]['error'] = 'Analysis timeout'
        return jsonify({'error': 'Analysis timeout'}), 504
    
    except Exception as e:
        analysis_sessions[session_id]['status'] = 'error'
        analysis_sessions[session_id]['error'] = str(e)
        return jsonify({'error': str(e)}), 500



def analyze_matches(session_id):
    """
    Analyze uploaded matches and generate similarity report
    """
    if session_id not in analysis_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = analysis_sessions[session_id]
    
    if session['status'] == 'analyzing':
        return jsonify({'error': 'Analysis already in progress'}), 400
    
    # Update status
    session['status'] = 'analyzing'
    
    try:
        # Get file paths
        match1_path = UPLOAD_FOLDER / session['match1_file']
        match2_path = UPLOAD_FOLDER / session['match2_file']
        
        # Run integrated analysis script
        output_file = OUTPUT_FOLDER / f"{session_id}_analysis.json"
        
        cmd = [
            'python3',
            'match.py',
            str(match1_path),
            str(match2_path),
            '--lookahead', str(session['lookahead_frames']),
            '--minpasses', str(session['min_passes']),
            '--output', str(output_file)
        ]
        
        # Execute analysis
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode != 0:
            session['status'] = 'error'
            session['error'] = result.stderr
            return jsonify({
                'error': 'Analysis failed',
                'details': result.stderr
            }), 500
        
        # Load analysis results
        with open(output_file, 'r') as f:
            analysis_data = json.load(f)
        
        # Update session
        session['status'] = 'completed'
        session['output_file'] = f"{session_id}_analysis.json"
        session['analysis_data'] = analysis_data
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'data': analysis_data
        })
    
    except subprocess.TimeoutExpired:
        session['status'] = 'error'
        session['error'] = 'Analysis timeout'
        return jsonify({'error': 'Analysis timeout'}), 504
    
    except Exception as e:
        session['status'] = 'error'
        session['error'] = str(e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<session_id>', methods=['GET'])
def get_session(session_id):
    """Get session status and results"""
    if session_id not in analysis_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = analysis_sessions[session_id]
    
    response = {
        'session_id': session_id,
        'status': session['status'],
        'lookahead_frames': session['lookahead_frames'],
        'min_passes': session['min_passes']
    }
    
    if session['status'] == 'completed' and 'analysis_data' in session:
        response['data'] = session['analysis_data']
    
    if session['status'] == 'error' and 'error' in session:
        response['error'] = session['error']
    
    return jsonify(response)


@app.route('/api/sessions/<session_id>/download', methods=['GET'])
def download_results(session_id):
    """Download analysis results as JSON file"""
    if session_id not in analysis_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = analysis_sessions[session_id]
    
    if session['status'] != 'completed':
        return jsonify({'error': 'Analysis not completed'}), 400
    
    output_file = OUTPUT_FOLDER / session['output_file']
    
    if not output_file.exists():
        return jsonify({'error': 'Output file not found'}), 404
    
    return send_file(
        output_file,
        as_attachment=True,
        download_name=f"match_analysis_{session_id}.json"
    )


@app.route('/api/sessions', methods=['GET'])
def list_sessions():
    """List all analysis sessions"""
    sessions = []
    for sid, session in analysis_sessions.items():
        sessions.append({
            'session_id': sid,
            'status': session['status'],
            'lookahead_frames': session['lookahead_frames'],
            'min_passes': session['min_passes']
        })
    
    return jsonify({'sessions': sessions})


@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete session and associated files"""
    if session_id not in analysis_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = analysis_sessions[session_id]
    
    # Delete uploaded files
    for filename in [session['match1_file'], session['match2_file']]:
        filepath = UPLOAD_FOLDER / filename
        if filepath.exists():
            filepath.unlink()
    
    # Delete output file
    if 'output_file' in session:
        output_file = OUTPUT_FOLDER / session['output_file']
        if output_file.exists():
            output_file.unlink()
    
    # Remove session
    del analysis_sessions[session_id]
    
    return jsonify({'success': True})


# ============ ERROR HANDLERS ============

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large (max 50MB)'}), 413


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


# ============ STARTUP ============
if __name__ == '__main__':
    print("\n⚽ Football Analytics API Server\n")
    print(f"📂 Upload folder: {UPLOAD_FOLDER.resolve()}")
    print(f"📂 Output folder: {OUTPUT_FOLDER.resolve()}")
    print(f"\n🚀 Starting server on http://localhost:5000\n")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
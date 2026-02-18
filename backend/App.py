"""
Flask API Server for Humming-Based Song Detection
Provides REST endpoints for song database management and humming matching
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import uuid
from pathlib import Path
from werkzeug.utils import secure_filename
import json

from melody_matcher import (
    MelodyDatabase,
    HummingMatcher,
    PitchExtractor,
    ContourExtractor
)


# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configuration
UPLOAD_FOLDER = Path('uploads')
DATABASE_FOLDER = Path('database')
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'ogg', 'flac', 'm4a', 'mp4'}

UPLOAD_FOLDER.mkdir(exist_ok=True)
DATABASE_FOLDER.mkdir(exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Initialize melody database and matcher
melody_db = MelodyDatabase()
matcher = HummingMatcher(melody_db)

# Metadata storage (in production, use a real database)
METADATA_FILE = DATABASE_FOLDER / 'metadata.json'
song_metadata = {}

def load_metadata():
    """Load song metadata from file"""
    global song_metadata
    if METADATA_FILE.exists():
        try:
            with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                song_metadata = json.load(f)
                print(f"✅ Loaded metadata for {len(song_metadata)} songs")
        except Exception as e:
            print(f"⚠️ Failed to load metadata: {e}")
            song_metadata = {}
    else:
        print("ℹ️ No metadata file found, starting fresh")
        song_metadata = {}

def save_metadata():
    """Save song metadata to file"""
    try:
        with open(METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(song_metadata, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"⚠️ Failed to save metadata: {e}")

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ============ API ENDPOINTS ============

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'songs_in_database': len(melody_db.list_songs())
    })


@app.route('/api/songs', methods=['GET'])
def list_songs():
    """List all songs in the database"""
    songs = []
    for song_id in melody_db.list_songs():
        metadata = song_metadata.get(song_id, {})
        signature = melody_db.get_signature(song_id)
        
        songs.append({
            'id': song_id,
            'title': metadata.get('title', 'Unknown'),
            'artist': metadata.get('artist', 'Unknown'),
            'contour_length': len(signature.pitch_contour) if signature else 0,
            'duration': signature.duration if signature else 0
        })
    
    return jsonify({'songs': songs})


@app.route('/api/songs', methods=['POST'])
def add_song():
    """
    Add a new song to the database
    
    Expects multipart/form-data with:
    - file: Audio file
    - title: Song title
    - artist: Artist name
    - duration: Optional analysis duration (seconds)
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    
    # Get metadata
    title = request.form.get('title', 'Unknown')
    artist = request.form.get('artist', 'Unknown')
    duration = float(request.form.get('duration', 30.0))
    
    # Generate unique ID
    song_id = str(uuid.uuid4())
    
    # Save file
    filename = secure_filename(f"{song_id}_{file.filename}")
    filepath = UPLOAD_FOLDER / filename
    file.save(filepath)
    
    try:
        # Add to database
        signature = melody_db.add_song(song_id, str(filepath), duration)
        
        # Save metadata
        song_metadata[song_id] = {
            'title': title,
            'artist': artist,
            'filename': filename,
            'original_filename': file.filename
        }
        save_metadata()
        
        return jsonify({
            'success': True,
            'song_id': song_id,
            'title': title,
            'artist': artist,
            'contour_length': len(signature.pitch_contour)
        }), 201
    
    except Exception as e:
        # Clean up on error
        if filepath.exists():
            filepath.unlink()
        return jsonify({'error': str(e)}), 500


@app.route('/api/songs/<song_id>', methods=['DELETE'])
def delete_song(song_id):
    """Delete a song from the database"""
    if song_id not in melody_db.signatures:
        return jsonify({'error': 'Song not found'}), 404
    
    # Remove from database
    del melody_db.signatures[song_id]
    
    # Remove metadata
    metadata = song_metadata.pop(song_id, {})
    save_metadata()
    
    # Remove file
    if 'filename' in metadata:
        filepath = UPLOAD_FOLDER / metadata['filename']
        if filepath.exists():
            filepath.unlink()
    
    return jsonify({'success': True})


@app.route('/api/match', methods=['POST'])
def match_humming():
    """
    Match humming to songs in database
    
    Expects multipart/form-data with:
    - file: Humming audio file
    - top_k: Optional number of results (default: 5)
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    
    # Get parameters
    top_k = int(request.form.get('top_k', 5))
    
    # Save temporary file
    temp_id = str(uuid.uuid4())
    filename = secure_filename(f"hum_{temp_id}_{file.filename}")
    filepath = UPLOAD_FOLDER / filename
    file.save(filepath)
    
    try:
        # Perform matching
        results = matcher.match_with_details(str(filepath))
        
        # Enrich with metadata
        enriched_matches = []
        for match in results['matches']:
            song_id = match['song_id']
            metadata = song_metadata.get(song_id, {})
            
            enriched_matches.append({
                'song_id': song_id,
                'title': metadata.get('title', 'Unknown'),
                'artist': metadata.get('artist', 'Unknown'),
                'distance': match['distance'],
                'similarity_score': match['similarity_score'],
                'confidence': 'high' if match['similarity_score'] > 0.7 else 
                             'medium' if match['similarity_score'] > 0.5 else 'low'
            })
        
        results['matches'] = enriched_matches[:top_k]
        
        return jsonify(results)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    finally:
        # Clean up temporary file
        if filepath.exists():
            filepath.unlink()


@app.route('/api/analyze', methods=['POST'])
def analyze_audio():
    """
    Analyze an audio file and return pitch/contour information
    Useful for debugging and visualization
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Save temporary file
    temp_id = str(uuid.uuid4())
    filename = secure_filename(f"analyze_{temp_id}_{file.filename}")
    filepath = UPLOAD_FOLDER / filename
    file.save(filepath)
    
    try:
        # Extract pitch and contour
        pitch_extractor = PitchExtractor()
        contour_extractor = ContourExtractor()
        
        pitch = pitch_extractor.extract_pitch(str(filepath))
        contour = contour_extractor.extract_contour(pitch)
        
        # Convert to lists for JSON serialization
        import numpy as np
        pitch_clean = pitch[~np.isnan(pitch)]
        
        return jsonify({
            'pitch': {
                'length': len(pitch),
                'valid_frames': len(pitch_clean),
                'min': float(pitch_clean.min()) if len(pitch_clean) > 0 else None,
                'max': float(pitch_clean.max()) if len(pitch_clean) > 0 else None,
                'mean': float(pitch_clean.mean()) if len(pitch_clean) > 0 else None,
                'values': pitch.tolist()
            },
            'contour': {
                'length': len(contour),
                'ups': int((contour == 1).sum()),
                'downs': int((contour == -1).sum()),
                'stable': int((contour == 0).sum()),
                'values': contour.tolist()
            }
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    finally:
        # Clean up
        if filepath.exists():
            filepath.unlink()


@app.route('/api/batch-add', methods=['POST'])
def batch_add_songs():
    """
    Batch add multiple songs to the database
    Useful for initial setup
    """
    if 'songs_data' not in request.json:
        return jsonify({'error': 'No songs data provided'}), 400
    
    songs_data = request.json['songs_data']
    results = []
    
    for song_info in songs_data:
        try:
            filepath = song_info['filepath']
            title = song_info.get('title', Path(filepath).stem)
            artist = song_info.get('artist', 'Unknown')
            duration = float(song_info.get('duration', 30.0))
            
            # Generate ID
            song_id = str(uuid.uuid4())
            
            # Add to database
            signature = melody_db.add_song(song_id, filepath, duration)
            
            # Save metadata
            song_metadata[song_id] = {
                'title': title,
                'artist': artist,
                'filename': Path(filepath).name,
                'original_filename': Path(filepath).name
            }
            
            results.append({
                'success': True,
                'song_id': song_id,
                'title': title
            })
        
        except Exception as e:
            results.append({
                'success': False,
                'error': str(e),
                'filepath': song_info.get('filepath', 'unknown')
            })
    
    save_metadata()
    
    return jsonify({
        'total': len(songs_data),
        'successful': sum(1 for r in results if r.get('success')),
        'failed': sum(1 for r in results if not r.get('success')),
        'results': results
    })


# ============ ERROR HANDLERS ============

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large (max 16MB)'}), 413


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


# ============ STARTUP ============
if __name__ == '__main__':
    print("\n🎵 HumFinder - Humming Detection Server\n")
    
    # Step 1: Load existing metadata
    load_metadata()
    
    # Step 2: Auto-load songs from database folder
    print("\n📂 Scanning database folder for audio files...\n")
    print(f"   Database path: {DATABASE_FOLDER}")
    print(f"   Absolute path: {DATABASE_FOLDER.resolve()}\n")
    
    # List all files in database folder
    all_files = list(DATABASE_FOLDER.iterdir())
    print(f"   Total files found: {len(all_files)}")
    
    audio_files = [f for f in all_files if f.suffix.lower().lstrip('.') in ALLOWED_EXTENSIONS]
    print(f"   Audio files (.wav, .mp3, etc.): {len(audio_files)}\n")
    
    loaded_count = 0
    
    for file_path in audio_files:
        # Check if file already exists in metadata
        existing_id = None
        for sid, meta in song_metadata.items():
            if meta.get('filename') == file_path.name:
                existing_id = sid
                break
        
        # Use existing ID if found, otherwise generate new UUID
        song_id = existing_id or str(uuid.uuid4())
        
        signature_path = DATABASE_FOLDER / f"{song_id}.sig"

        if signature_path.exists():
            melody_db.load_signature(song_id, signature_path)
        else:
            signature = melody_db.add_song(song_id, str(file_path))
            signature.save(signature_path)
            # Only add to metadata if it's a new file
            if not existing_id:
                song_metadata[song_id] = {
                    'title': file_path.stem,
                    'artist': 'Unknown',
                    'filename': file_path.name
                }
            
            print(f"✅ Added ({len(signature.pitch_contour)} contour points)")
            loaded_count += 1
                
    
    # Step 3: Save updated metadata if new songs were added
    if loaded_count > 0:
        save_metadata()
        print(f"\n💾 Metadata saved with {loaded_count} new songs!")
    else:
        print(f"\n⚠️  No new songs added")
    
    # Print summary
    print(f"\n📊 Server Status:")
    print(f"   • Total songs in database: {len(melody_db.list_songs())}")
    print(f"   • Newly loaded: {loaded_count}")
    print(f"   • Metadata entries: {len(song_metadata)}")
    
    print(f"\n🚀 Starting server on http://localhost:5000\n")
    
    # app.run(debug=True, host='0.0.0.0', port=5000)
    app.run(debug=True, use_reloader=False)


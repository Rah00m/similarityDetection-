#!/usr/bin/env python3
"""
Integrated Football Match Analysis
Combines ball tracking with play identification and similarity analysis
"""

import json
import math
import numpy as np
from typing import List, Dict, Tuple, Optional


# ============================================================================
# BALL TRACKING FUNCTIONS
# ============================================================================

def get_ball_position(frame: Dict, last_known_pos: Optional[Tuple[float, float]]) -> Tuple[Optional[Tuple[float, float]], bool]:
    """Get ball position from frame, using last known position if missing"""
    ball_data = frame.get('ball', [])
    
    # Check if ball data exists and is not null
    if ball_data and len(ball_data) > 0 and ball_data[0] is not None:
        ball = ball_data[0]
        x = ball.get('x')
        y = ball.get('y')
        
        if x is not None and y is not None:
            return ((x, y), False)
    
    # Ball missing - use last known position
    if last_known_pos is not None:
        return (last_known_pos, True)
    
    return (None, False)


def get_all_players(frame: Dict) -> List[Dict]:
    """Get all visible players from both teams"""
    players = []
    
    # Add home players
    for player in frame.get('homePlayers', []):
        if player.get('visibility') != 'INVISIBLE':
            players.append({
                'id': player.get('playerId'),
                'x': player.get('x'),
                'y': player.get('y'),
                'team': 'home'
            })
    
    # Add away players
    for player in frame.get('awayPlayers', []):
        if player.get('visibility') != 'INVISIBLE':
            players.append({
                'id': player.get('playerId'),
                'x': player.get('x'),
                'y': player.get('y'),
                'team': 'away'
            })
    
    return players


def find_closest_player(ball_pos: Tuple[float, float], players: List[Dict]) -> Optional[Dict]:
    """Find player closest to ball position"""
    if not players or ball_pos is None:
        return None
    
    ball_x, ball_y = ball_pos
    closest_player = None
    min_distance = float('inf')
    
    for player in players:
        px = player.get('x')
        py = player.get('y')
        
        if px is None or py is None:
            continue
        
        # Calculate Euclidean distance
        distance = math.sqrt((px - ball_x)**2 + (py - ball_y)**2)
        
        if distance < min_distance:
            min_distance = distance
            closest_player = {
                'player_id': player['id'],
                'team': player['team'],
                'distance': distance
            }
    
    return closest_player


def normalize_coordinates(x: float, y: float, team: str, attacking_direction: str, 
                         pitch_length: float = 105.0, pitch_width: float = 68.0) -> Tuple[float, float]:
    """
    Normalize coordinates so all plays are oriented left-to-right attack
    
    Args:
        x, y: Original coordinates
        team: 'home' or 'away'
        attacking_direction: 'R' (right) or 'L' (left)
        pitch_length: Length of pitch
        pitch_width: Width of pitch
    
    Returns:
        Normalized (x, y) coordinates
    """
    # If team is attacking left, flip x coordinate
    if attacking_direction == 'L':
        x = pitch_length - x
        y = -y
    
    return (x, y)


def get_pitch_zone(x: float, pitch_length: float = 105.0) -> str:
    """
    Get pitch zone: 'defensive', 'middle', or 'attacking'
    
    Args:
        x: X coordinate
        pitch_length: Pitch length
    
    Returns:
        Zone name
    """
    third = pitch_length / 3.0
    
    if x < third:
        return 'defensive'
    elif x < 2 * third:
        return 'middle'
    else:
        return 'attacking'


# ============================================================================
# PLAY ANALYSIS FUNCTIONS
# ============================================================================

def get_team_from_player(frames: List[Dict], player_id: int) -> str:
    """Find which team a player belongs to"""
    for frame in frames:
        # Check home team
        for player in frame.get('homePlayers', []):
            if player.get('playerId') == player_id:
                return 'home'
        # Check away team
        for player in frame.get('awayPlayers', []):
            if player.get('playerId') == player_id:
                return 'away'
    return None


def get_player_position(frames: List[Dict], player_id: int, frame_time: float, lookahead_frames: int = 3) -> Tuple[float, float]:
    """Get player position at specific frame time with lookahead support"""
    # Find starting frame index
    frame_idx = None
    for i, frame in enumerate(frames):
        if abs(frame.get('startTime', 0) - frame_time) < 0.5:
            frame_idx = i
            break
    
    if frame_idx is None:
        return (0, 0)
    
    # Check current frame and lookahead frames
    for offset in range(lookahead_frames + 1):
        if frame_idx + offset >= len(frames):
            break
        
        frame = frames[frame_idx + offset]
        
        # Check home players
        for player in frame.get('homePlayers', []):
            if player.get('playerId') == player_id:
                return (player.get('x', 0), player.get('y', 0))
        
        # Check away players
        for player in frame.get('awayPlayers', []):
            if player.get('playerId') == player_id:
                return (player.get('x', 0), player.get('y', 0))
    
    return (0, 0)


def find_closest_teammate(frames: List[Dict], target_player_id: int, team: str, 
                          frame_time: float, max_radius: float = 5.0, 
                          lookahead_frames: int = 3) -> Tuple[int, float, float]:
    """
    Find closest player from same team if target player not found
    Improved to handle frame shifts between event and tracking data
    """
    # Get target player position (with lookahead)
    target_pos = get_player_position(frames, target_player_id, frame_time, lookahead_frames)
    
    # If target found, return it
    if target_pos != (0, 0):
        return (target_player_id, target_pos[0], target_pos[1])
    
    # Find frame index with wider tolerance for frame shifts
    frame_idx = None
    for i, frame in enumerate(frames):
        if abs(frame.get('startTime', 0) - frame_time) < 1.0:  # Increased tolerance to 1 second
            frame_idx = i
            break
    
    if frame_idx is None:
        return (None, 0, 0)
    
    # Search in wider window (before and after)
    closest_player = None
    closest_dist = float('inf')
    closest_pos = (0, 0)
    
    # Get ball position as reference, searching wider range
    ball_pos = None
    search_range = max(lookahead_frames, 5)  # Search at least 5 frames
    
    for offset in range(-2, search_range + 1):  # Also check 2 frames before
        idx = frame_idx + offset
        if idx < 0 or idx >= len(frames):
            continue
        
        frame = frames[idx]
        ball_data = frame.get('ball', [])
        if ball_data and ball_data[0] is not None:
            ball_pos = (ball_data[0].get('x', 0), ball_data[0].get('y', 0))
            if ball_pos != (0, 0):
                break
    
    if ball_pos is None:
        return (None, 0, 0)
    
    # Find closest player from same team in wider range
    for offset in range(-2, search_range + 1):
        idx = frame_idx + offset
        if idx < 0 or idx >= len(frames):
            continue
        
        frame = frames[idx]
        players = frame.get('homePlayers', []) if team == 'home' else frame.get('awayPlayers', [])
        
        for player in players:
            player_id = player.get('playerId')
            px, py = player.get('x', 0), player.get('y', 0)
            
            if px == 0 and py == 0:
                continue
            
            # Calculate distance to ball
            dist = math.sqrt((px - ball_pos[0])**2 + (py - ball_pos[1])**2)
            
            if dist < closest_dist and dist <= max_radius:
                closest_dist = dist
                closest_player = player_id
                closest_pos = (px, py)
    
    if closest_player:
        return (closest_player, closest_pos[0], closest_pos[1])
    
    return (None, 0, 0)


def identify_plays(frames: List[Dict], lookahead_frames: int = 3, max_radius: float = 5.0, 
                  min_passes: int = 3, pitch_length: float = 105.0, pitch_width: float = 68.0) -> List[List[Dict]]:
    """
    Identify plays as sequences of successful same-team passes
    Only returns plays with minimum number of passes
    Normalizes coordinates for consistent attacking direction
    """
    plays = []
    current_play = []
    current_team = None
    
    # Get attacking direction from stadium metadata (if available)
    attacking_direction = 'R'  # Default: attack right
    if frames and len(frames) > 0:
        stadium_meta = frames[0].get('stadiumMetadata', {})
        team_direction = stadium_meta.get('teamAttackingDirection', 'R')
        attacking_direction = team_direction
    
    for i, frame in enumerate(frames):
        poss_event = frame.get('possessionEvents', {})
        
        # Check if this is a pass event
        if poss_event.get('possessionEventType') != 'PA':
            continue
        
        passer_id = poss_event.get('passerPlayerId')
        receiver_id = poss_event.get('receiverPlayerId')
        outcome = poss_event.get('passOutcomeType')
        
        if not passer_id:
            continue
        
        # Get passer team
        passer_team = get_team_from_player([frame], passer_id)
        if not passer_team:
            continue
        
        # Get passer position (current frame)
        event_time = frame.get('eventTime', 0)
        passer_pos = get_player_position(frames, passer_id, event_time, lookahead_frames=0)
        
        # Get receiver position with lookahead
        receiver_pos = (0, 0)
        actual_receiver_id = receiver_id
        receiver_team = None
        
        if receiver_id:
            # Try to find receiver with lookahead
            receiver_pos = get_player_position(frames, receiver_id, event_time, lookahead_frames)
            receiver_team = get_team_from_player(frames[i:min(i+lookahead_frames+1, len(frames))], receiver_id)
            
            # If receiver not found, try closest player
            if receiver_pos == (0, 0) or receiver_team is None:
                actual_receiver_id, rx, ry = find_closest_teammate(
                    frames, receiver_id, passer_team, event_time, max_radius, lookahead_frames
                )
                if actual_receiver_id:
                    receiver_pos = (rx, ry)
                    receiver_team = passer_team
        
        # If still no receiver found, try closest player without target
        if not actual_receiver_id or receiver_pos == (0, 0):
            actual_receiver_id, rx, ry = find_closest_teammate(
                frames, -1, passer_team, event_time, max_radius, lookahead_frames
            )
            if actual_receiver_id:
                receiver_pos = (rx, ry)
                receiver_team = passer_team
        
        # Normalize coordinates for consistent direction
        passer_norm = normalize_coordinates(passer_pos[0], passer_pos[1], passer_team, 
                                           attacking_direction, pitch_length, pitch_width)
        receiver_norm = normalize_coordinates(receiver_pos[0], receiver_pos[1], passer_team,
                                             attacking_direction, pitch_length, pitch_width)
        
        # Determine if pass continues the play
        is_successful = (outcome == 'C' and 
                        receiver_team == passer_team and 
                        actual_receiver_id is not None)
        
        if is_successful:
            # Same team successful pass
            if current_team is None:
                current_team = passer_team
            
            if passer_team == current_team:
                # Add to current play
                current_play.append({
                    'passer_id': passer_id,
                    'receiver_id': actual_receiver_id,
                    'team': passer_team,
                    'passer_x': passer_norm[0],
                    'passer_y': passer_norm[1],
                    'receiver_x': receiver_norm[0],
                    'receiver_y': receiver_norm[1],
                    'outcome': outcome,
                    'frame_time': event_time
                })
            else:
                # Different team - end current play and start new one
                if len(current_play) >= min_passes:  # Only save if meets minimum
                    plays.append(current_play)
                current_play = [{
                    'passer_id': passer_id,
                    'receiver_id': actual_receiver_id,
                    'team': passer_team,
                    'passer_x': passer_norm[0],
                    'passer_y': passer_norm[1],
                    'receiver_x': receiver_norm[0],
                    'receiver_y': receiver_norm[1],
                    'outcome': outcome,
                    'frame_time': event_time
                }]
                current_team = passer_team
        else:
            # is_successful = Fals
            # Pass failed or intercepted - end play
            if len(current_play) >= min_passes:  # Only save if meets minimum
                plays.append(current_play)
            current_play = []
            current_team = None
    
    # Add final play if meets minimum
    if len(current_play) >= min_passes:
        plays.append(current_play)
    
    return plays


# ============================================================================
# DTW SIMILARITY FUNCTIONS
# ============================================================================

def pass_to_vector(pass_data: Dict, pitch_length: float = 105.0, pitch_width: float = 68.0) -> np.ndarray:
    """
    Convert pass to enhanced feature vector with relative coordinates
    
    Features:
    - Pass direction vector (Δx, Δy)
    - Pass distance
    - Start zone (0=defensive, 1=middle, 2=attacking)
    - End zone
    - Vertical position (normalized y)
    - Success indicator
    """
    passer_x = pass_data['passer_x']
    passer_y = pass_data['passer_y']
    receiver_x = pass_data['receiver_x']
    receiver_y = pass_data['receiver_y']
    
    # Pass direction vector (relative)
    delta_x = receiver_x - passer_x
    delta_y = receiver_y - passer_y
    
    # Pass distance
    distance = math.sqrt(delta_x**2 + delta_y**2)
    
    # Pitch zones (defensive=0, middle=1, attacking=2)
    start_zone = 0 if passer_x < pitch_length/3 else (1 if passer_x < 2*pitch_length/3 else 2)
    end_zone = 0 if receiver_x < pitch_length/3 else (1 if receiver_x < 2*pitch_length/3 else 2)
    
    # Normalized vertical positions
    start_y_norm = passer_y / pitch_width
    end_y_norm = receiver_y / pitch_width
    
    # Success indicator
    success = 1.0 if pass_data['outcome'] == 'C' else 0.0
    
    return np.array([
        delta_x,           # Pass direction X (relative)
        delta_y,           # Pass direction Y (relative)
        distance,          # Pass length
        start_zone,        # Starting zone
        end_zone,          # Ending zone
        start_y_norm,      # Vertical position (start)
        end_y_norm,        # Vertical position (end)
        success            # Outcome
    ])


def dtw_distance(seq1: List[Dict], seq2: List[Dict], pitch_length: float = 105.0, 
                pitch_width: float = 68.0) -> float:
    """
    Calculate DTW distance between two pass sequences
    Uses enhanced feature vectors with relative coordinates
    """
    # Convert to vectors
    vectors1 = [pass_to_vector(p, pitch_length, pitch_width) for p in seq1]
    vectors2 = [pass_to_vector(p, pitch_length, pitch_width) for p in seq2]
    
    n, m = len(vectors1), len(vectors2)
    
    # Initialize DTW matrix
    dtw = np.full((n + 1, m + 1), np.inf)
    dtw[0, 0] = 0
    
    # Fill DTW matrix
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            # Euclidean distance between vectors
            cost = np.linalg.norm(vectors1[i-1] - vectors2[j-1])
            dtw[i, j] = cost + min(
                dtw[i-1, j],      # Insertion
                dtw[i, j-1],      # Deletion
                dtw[i-1, j-1]     # Match
            )
    
    # Normalize by path length
    return dtw[n, m] / (n + m)


def compare_plays(plays1: List[List[Dict]], plays2: List[List[Dict]], 
                 pitch_length: float = 105.0, pitch_width: float = 68.0) -> List[Dict]:
    """
    Compare all plays between two matches
    Applies weighted scoring to favor longer sequences
    """
    similarities = []
    
    for i, play1 in enumerate(plays1):
        for j, play2 in enumerate(plays2):
            if len(play1) > 0 and len(play2) > 0:
                distance = dtw_distance(play1, play2, pitch_length, pitch_width)
                
                # Base similarity score
                base_similarity = 1 / (1 + distance)
                
                # Length bonus: reward longer plays
                avg_length = (len(play1) + len(play2)) / 2.0
                length_bonus = 1 + (avg_length - 3) * 0.1  # +10% per pass above minimum
                length_bonus = min(length_bonus, 2.0)  # Cap at 2x bonus
                
                # Weighted similarity
                weighted_similarity = base_similarity * length_bonus
                
                similarities.append({
                    'play1_id': i,
                    'play2_id': j,
                    'play1_passes': len(play1),
                    'play2_passes': len(play2),
                    'dtw_distance': distance,
                    'base_similarity': base_similarity,
                    'length_bonus': length_bonus,
                    'similarity_score': weighted_similarity
                })
    
    # Sort by weighted similarity score
    similarities.sort(key=lambda x: x['similarity_score'], reverse=True)
    
    return similarities


# ============================================================================
# INTEGRATED ANALYSIS
# ============================================================================

def analyze_match(frames: List[Dict], lookahead: int = 3, max_radius: float = 5.0, 
                 min_passes: int = 3, pitch_length: float = 105.0, 
                 pitch_width: float = 68.0) -> Dict:
    """
    Complete match analysis: ball tracking + play identification
    
    Args:
        frames: Match frame data
        lookahead: Number of frames to look ahead
        max_radius: Maximum search radius for closest player
        min_passes: Minimum passes required for a play
        pitch_length: Pitch length in meters
        pitch_width: Pitch width in meters
    
    Returns:
        Dictionary with ball tracking stats and identified plays
    """
    # Ball tracking
    last_known_ball = None
    frames_using_last_known = 0
    ball_tracking = []
    
    for i, frame in enumerate(frames):
        ball_pos, used_last_known = get_ball_position(frame, last_known_ball)
        
        if ball_pos:
            if not used_last_known:
                last_known_ball = ball_pos
            
            if used_last_known:
                frames_using_last_known += 1
            
            # Find closest player
            players = get_all_players(frame)
            closest = find_closest_player(ball_pos, players)
            
            ball_tracking.append({
                'frame_index': i,
                'ball_x': ball_pos[0],
                'ball_y': ball_pos[1],
                'used_last_known': used_last_known,
                'closest_player': closest
            })
    
    # Play identification with filtering
    plays = identify_plays(frames, lookahead, max_radius, min_passes, pitch_length, pitch_width)
    
    return {
        'ball_tracking': {
            'total_frames': len(frames),
            'frames_with_ball_data': len(ball_tracking),
            'frames_using_last_known': frames_using_last_known,
            'tracking_data': ball_tracking
        },
        'plays': {
            'total_plays': len(plays),
            'min_passes_filter': min_passes,
            'plays_data': [
                {
                    'play_id': i,
                    'team': play[0]['team'] if play else None,
                    'num_passes': len(play),
                    'passes': play
                }
                for i, play in enumerate(plays)
            ]
        }
    }


# ============================================================================
# MAIN FUNCTION
# ============================================================================

def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python match.py <match1.json> [match2.json] [options]")
        print("\nOptions:")
        print("  --lookahead N    Number of frames to look ahead (default: 3)")
        print("  --radius R       Maximum radius to search for closest player (default: 5.0)")
        print("  --minpasses N    Minimum passes per play (default: 3)")
        print("  --pitchlength L  Pitch length in meters (default: 105.0)")
        print("  --pitchwidth W   Pitch width in meters (default: 68.0)")
        print("  --output FILE    Output file path (default: integrated_analysis_output.json)")
        print("\nModes:")
        print("  One file:  Ball tracking + play identification")
        print("  Two files: Ball tracking + play identification + weighted similarity")
        sys.exit(1)
    
    # Parse arguments
    lookahead = 3
    max_radius = 5.0
    min_passes = 3
    pitch_length = 105.0
    pitch_width = 68.0
    output_file = 'integrated_analysis_output.json'
    json_files = []
    
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == '--lookahead' and i + 1 < len(sys.argv):
            lookahead = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--radius' and i + 1 < len(sys.argv):
            max_radius = float(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--minpasses' and i + 1 < len(sys.argv):
            min_passes = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--pitchlength' and i + 1 < len(sys.argv):
            pitch_length = float(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--pitchwidth' and i + 1 < len(sys.argv):
            pitch_width = float(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--output' and i + 1 < len(sys.argv):
            output_file = sys.argv[i + 1]
            i += 2
        else:
            json_files.append(sys.argv[i])
            i += 1
    
    print(f"Configuration:")
    print(f"  Lookahead: {lookahead} frames")
    print(f"  Search radius: {max_radius}m")
    print(f"  Minimum passes per play: {min_passes}")
    print(f"  Pitch dimensions: {pitch_length}m x {pitch_width}m\n")
    
    # Load and analyze match 1
    print(f"Loading {json_files[0]}...")
    with open(json_files[0], 'r') as f:
        match1_data = json.load(f)
    
    print("Analyzing match 1...")
    match1_analysis = analyze_match(match1_data, lookahead, max_radius, min_passes, 
                                   pitch_length, pitch_width)
    
    # Build output
    output = {
        'configuration': {
            'lookahead_frames': lookahead,
            'max_radius': max_radius,
            'min_passes': min_passes,
            'pitch_length': pitch_length,
            'pitch_width': pitch_width
        },
        'match1': match1_analysis
    }
    
    # If second match provided, compare
    if len(json_files) > 1:
        print(f"\nLoading {json_files[1]}...")
        with open(json_files[1], 'r') as f:
            match2_data = json.load(f)
        
        print("Analyzing match 2...")
        match2_analysis = analyze_match(match2_data, lookahead, max_radius, min_passes,
                                       pitch_length, pitch_width)
        
        plays1 = match1_analysis['plays']['plays_data']
        plays2 = match2_analysis['plays']['plays_data']
        
        # Calculate similarity with weighted scoring
        print("\nCalculating play similarities (with length weighting)...")
        plays1_sequences = [p['passes'] for p in plays1]
        plays2_sequences = [p['passes'] for p in plays2]
        similarities = compare_plays(plays1_sequences, plays2_sequences, pitch_length, pitch_width)
        
        output['match2'] = match2_analysis
        output['similarities'] = similarities
    
    # Save output
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Results saved to {output_file}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
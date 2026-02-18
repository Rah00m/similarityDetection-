"""
Humming-Based Song Similarity Detection System
Core melody matching engine using pitch extraction and Dynamic Time Warping
"""

import numpy as np
import librosa
import scipy.signal
import pickle
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
from pathlib import Path


@dataclass
class MelodySignature:
    """Represents the melodic contour of a song or humming"""
    pitch_contour: np.ndarray  # Array of +1, -1, 0 representing pitch movement
    pitch_values: np.ndarray   # Original pitch values (for debugging)
    song_id: str
    duration: float

    def save(self, file_path: Path) -> None:
        """Serialize signature to disk using pickle."""
        payload = {
            'pitch_contour': self.pitch_contour,
            'pitch_values': self.pitch_values,
            'song_id': self.song_id,
            'duration': self.duration
        }
        with open(file_path, 'wb') as f:
            pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)

    @staticmethod
    def from_payload(payload: object, song_id: str) -> "MelodySignature":
        """Create a MelodySignature from a pickle payload or dict."""
        if isinstance(payload, MelodySignature):
            return payload
        if isinstance(payload, dict):
            return MelodySignature(
                pitch_contour=payload.get('pitch_contour', np.array([], dtype=np.int8)),
                pitch_values=payload.get('pitch_values', np.array([], dtype=float)),
                song_id=payload.get('song_id', song_id),
                duration=float(payload.get('duration', 0.0))
            )
        raise ValueError("Unsupported signature payload type")

class PitchExtractor:
    """Extract fundamental frequency (F0) from audio signals"""
    
    def __init__(self, 
                 sample_rate: int = 22050,
                 frame_length: int = 2048,
                 hop_length: int = 512,
                 fmin: float = 80.0,    # Minimum frequency (Hz)
                 fmax: float = 800.0):  # Maximum frequency (Hz)
        """
        Initialize pitch extractor
        
        Args:
            sample_rate: Target sample rate for audio
            frame_length: FFT window size
            hop_length: Number of samples between frames
            fmin: Minimum expected pitch (Hz) - typical male humming
            fmax: Maximum expected pitch (Hz) - typical female humming
        """
        self.sample_rate = sample_rate
        self.frame_length = frame_length
        self.hop_length = hop_length
        self.fmin = fmin
        self.fmax = fmax
    
    def extract_pitch(self, audio_path: str, duration: Optional[float] = None) -> np.ndarray:
        """
        Extract pitch contour from audio file
        
        Args:
            audio_path: Path to audio file
            duration: Optional duration to analyze (seconds)
            
        Returns:
            Array of pitch values (Hz) over time
        """
        # Load audio file
        y, sr = librosa.load(audio_path, sr=self.sample_rate, duration=duration, mono=True)
        
        # Extract pitch using pYIN algorithm (robust for vocal pitch tracking)
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y,
            fmin=self.fmin,
            fmax=self.fmax,
            sr=sr,
            frame_length=self.frame_length,
            hop_length=self.hop_length
        )
        
        # Clean up pitch values
        pitch_cleaned = self._clean_pitch(f0, voiced_flag, voiced_probs)
        
        return pitch_cleaned #send to contour 
    
    def _clean_pitch(self, f0: np.ndarray, voiced_flag: np.ndarray, 
                     voiced_probs: np.ndarray, confidence_threshold: float = 0.3) -> np.ndarray:
        """
        Clean extracted pitch values
        
        Args:
            f0: Raw pitch values
            voiced_flag: Boolean array indicating voiced frames
            voiced_probs: Confidence scores for each frame
            confidence_threshold: Minimum confidence to consider pitch valid
            
        Returns:
            Cleaned pitch array
        """
        # Create copy to avoid modifying original
        pitch = f0.copy()
        
        # Remove low confidence and unvoiced segments
        pitch[voiced_probs < confidence_threshold] = np.nan
        pitch[~voiced_flag] = np.nan
        
        # Interpolate short gaps (up to 5 frames)
        pitch = self._interpolate_gaps(pitch, max_gap=5)
        
        # Apply median filter to remove outliers
        pitch = self._median_filter(pitch, window=5)
        
        return pitch
    
    def _interpolate_gaps(self, pitch: np.ndarray, max_gap: int = 5) -> np.ndarray:
        """Interpolate small gaps in pitch sequence"""
        pitch = pitch.copy()
        nans = np.isnan(pitch)
        
        if not nans.any():
            return pitch
        
        # Find start and end of NaN segments
        nans_idx = np.where(nans)[0]
        not_nans_idx = np.where(~nans)[0]
        
        if len(not_nans_idx) < 2:
            return pitch
        
        # Interpolate only small gaps
        for i in range(len(nans_idx)):
            if i == 0 or i == len(nans_idx) - 1:
                continue
                
            # Check if gap is small enough
            prev_valid = not_nans_idx[not_nans_idx < nans_idx[i]]
            next_valid = not_nans_idx[not_nans_idx > nans_idx[i]]
            
            if len(prev_valid) > 0 and len(next_valid) > 0:
                gap_size = next_valid[0] - prev_valid[-1]
                if gap_size <= max_gap:
                    # Linear interpolation
                    pitch[nans_idx[i]] = np.interp(
                        nans_idx[i],
                        [prev_valid[-1], next_valid[0]],
                        [pitch[prev_valid[-1]], pitch[next_valid[0]]]
                    )
        
        return pitch
    
    def _median_filter(self, pitch: np.ndarray, window: int = 5) -> np.ndarray:
        """Apply median filter to remove pitch tracking errors"""
        pitch_filtered = pitch.copy()
        valid_idx = ~np.isnan(pitch)
        
        if valid_idx.sum() > window:
            pitch_filtered[valid_idx] = scipy.signal.medfilt(
                pitch[valid_idx], 
                kernel_size=window
            )
        
        return pitch_filtered


class ContourExtractor:
    """Convert pitch values to melodic contour representation"""
    
    def __init__(self, 
                 pitch_threshold: float = 10.0,  # Hz - threshold for "stable" pitch
                 smoothing_window: int = 3):      # Frames for smoothing
        """
        Initialize contour extractor
        
        Args:
            pitch_threshold: Minimum pitch change (Hz) to consider as movement
            smoothing_window: Window size for smoothing pitch before computing contour
        """
        self.pitch_threshold = pitch_threshold
        self.smoothing_window = smoothing_window
    
    def extract_contour(self, pitch: np.ndarray) -> np.ndarray:
        """
        Convert pitch sequence to contour (+1, 0, -1)
        
        Args:
            pitch: Array of pitch values (Hz)
            
        Returns:
            Array of contour values: +1 (up), 0 (stable), -1 (down)
        """
        # Remove NaN values
        valid_idx = ~np.isnan(pitch)
        pitch_valid = pitch[valid_idx]
        
        if len(pitch_valid) < 2:
            return np.array([])
        
        # Smooth pitch to reduce noise
        pitch_smooth = self._smooth_pitch(pitch_valid)
        
        # Compute pitch differences
        pitch_diff = np.diff(pitch_smooth)
        
        # Convert to contour representation
        contour = np.zeros_like(pitch_diff, dtype=np.int8)
        contour[pitch_diff > self.pitch_threshold] = 1   # Up
        contour[pitch_diff < -self.pitch_threshold] = -1  # Down
        # pitch_diff within threshold remains 0 (stable)
        
        # Further smooth contour to remove rapid fluctuations
        contour = self._smooth_contour(contour)
        
        return contour
    
    def _smooth_pitch(self, pitch: np.ndarray) -> np.ndarray:
        """Apply moving average to smooth pitch"""
        if len(pitch) < self.smoothing_window:
            return pitch
        
        kernel = np.ones(self.smoothing_window) / self.smoothing_window
        return np.convolve(pitch, kernel, mode='same')
    
    def _smooth_contour(self, contour: np.ndarray, min_duration: int = 2) -> np.ndarray:
        """
        Remove very short contour segments
        
        Args:
            contour: Raw contour sequence
            min_duration: Minimum number of frames for a contour segment
            
        Returns:
            Smoothed contour
        """
        if len(contour) < min_duration:
            return contour
        
        contour_smooth = contour.copy()
        
        # Find segments of same direction
        changes = np.diff(contour)
        change_idx = np.where(changes != 0)[0] + 1
        segments = np.split(contour, change_idx)
        
        # Filter short segments
        result = []
        for segment in segments:
            if len(segment) >= min_duration:
                result.extend(segment)
            elif len(result) > 0:
                # Merge short segment with previous
                result.extend([result[-1]] * len(segment))
            else:
                result.extend(segment)
        
        return np.array(result, dtype=np.int8)


class DTWMatcher:
    """Dynamic Time Warping for melody contour matching"""
    
    def __init__(self, window_size: Optional[int] = None):
        """
        Initialize DTW matcher
        
        Args:
            window_size: Sakoe-Chiba band width (limits warping path)
                        None means no constraint
        """
        self.window_size = window_size
    
    def compute_distance(self, query: np.ndarray, reference: np.ndarray) -> float:
        """
        Compute DTW distance between query and reference contours
        
        Args:
            query: Query contour sequence
            reference: Reference contour sequence
            
        Returns:
            Normalized DTW distance (lower is more similar)
        """
        n, m = len(query), len(reference)
        
        if n == 0 or m == 0:
            return float('inf')
        
        # Initialize cost matrix
        dtw_matrix = np.full((n + 1, m + 1), np.inf)
        dtw_matrix[0, 0] = 0
        
        # Apply window constraint if specified
        if self.window_size is not None:
            window = max(self.window_size, abs(n - m))
        else:
            window = max(n, m)
        
        # Fill DTW matrix
        for i in range(1, n + 1):
            # Sakoe-Chiba band
            j_start = max(1, i - window)
            j_end = min(m + 1, i + window)
            
            for j in range(j_start, j_end):
                # Cost function: 0 if same, 1 if different, 2 if opposite direction
                cost = self._contour_distance(query[i-1], reference[j-1])
                
                # DTW recurrence relation
                dtw_matrix[i, j] = cost + min(
                    dtw_matrix[i-1, j],      # Insertion
                    dtw_matrix[i, j-1],      # Deletion
                    dtw_matrix[i-1, j-1]     # Match
                )
        
        # Normalize by path length to make distances comparable
        distance = dtw_matrix[n, m] / (n + m)
        
        return distance
    
    def _contour_distance(self, a: int, b: int) -> float:
        """
        Compute distance between two contour values
        
        Args:
            a, b: Contour values (-1, 0, +1)
            
        Returns:
            Distance score
        """
        if a == b:
            return 0.0
        elif a * b == -1:  # Opposite directions
            return 2.0
        else:  # One stable, one moving
            return 1.0


class MelodyDatabase:
    """Manages a database of song melody signatures"""
    
    def __init__(self):
        self.signatures: Dict[str, MelodySignature] = {}
        self.pitch_extractor = PitchExtractor()
        self.contour_extractor = ContourExtractor()
    
    def add_song(self, song_id: str, audio_path: str, duration: Optional[float] = 30.0):
        """
        Add a song to the database
        
        Args:
            song_id: Unique identifier for the song
            audio_path: Path to audio file
            duration: Duration to analyze (seconds)
        """
        # Extract pitch
        pitch = self.pitch_extractor.extract_pitch(audio_path, duration)
        
        # Extract contour
        contour = self.contour_extractor.extract_contour(pitch)
        
        # Create signature
        signature = MelodySignature(
            pitch_contour=contour,
            pitch_values=pitch,
            song_id=song_id,
            duration=duration or 0.0
        )
        
        self.signatures[song_id] = signature
        
        return signature
    
    def get_signature(self, song_id: str) -> Optional[MelodySignature]:
        """Retrieve a stored signature"""
        return self.signatures.get(song_id)

    def load_signature(self, song_id: str, signature_path: Path) -> MelodySignature:
        """Load a signature from disk and store it in memory."""
        with open(signature_path, 'rb') as f:
            payload = pickle.load(f)

        signature = MelodySignature.from_payload(payload, song_id)
        # Ensure song_id is consistent with filename
        signature.song_id = song_id
        self.signatures[song_id] = signature
        return signature
    
    def list_songs(self) -> List[str]:
        """List all song IDs in database"""
        return list(self.signatures.keys())


class HummingMatcher:
    """Main system for matching humming to songs"""
    
    def __init__(self, database: MelodyDatabase):
        """
        Initialize matcher
        
        Args:
            database: Pre-populated melody database
        """
        self.database = database
        self.pitch_extractor = PitchExtractor()
        self.contour_extractor = ContourExtractor()
        self.dtw_matcher = DTWMatcher(window_size=50)
    
    def match_humming(self, humming_path: str, top_k: int = 5) -> List[Tuple[str, float]]:
        """
        Match humming to songs in database
        
        Args:
            humming_path: Path to humming audio file
            top_k: Number of top matches to return
            
        Returns:
            List of (song_id, distance) tuples, sorted by similarity
        """
        # Extract humming signature
        pitch = self.pitch_extractor.extract_pitch(humming_path)
        contour = self.contour_extractor.extract_contour(pitch)
        
        if len(contour) == 0:
            raise ValueError("Could not extract valid melody from humming")
        
        # Compare with all songs
        results = []
        for song_id, signature in self.database.signatures.items():
            distance = self.dtw_matcher.compute_distance(contour, signature.pitch_contour)
            results.append((song_id, distance))
        
        # Sort by distance (ascending)
        results.sort(key=lambda x: x[1])
        
        # Return top k
        return results[:top_k]
    
    def match_with_details(self, humming_path: str) -> Dict:
        """
        Match humming and return detailed information
        
        Args:
            humming_path: Path to humming audio file
            
        Returns:
            Dictionary with match results and diagnostic info
        """
        # Extract humming signature
        pitch = self.pitch_extractor.extract_pitch(humming_path)
        contour = self.contour_extractor.extract_contour(pitch)
        
        # Get matches
        matches = self.match_humming(humming_path, top_k=5)
        
        return {
            'query': {
                'pitch_length': len(pitch),
                'contour_length': len(contour),
                'valid_pitch_ratio': (~np.isnan(pitch)).sum() / len(pitch) if len(pitch) > 0 else 0
            },
            'matches': [
                {
                    'song_id': song_id,
                    'distance': float(distance),
                    'similarity_score': float(1 / (1 + distance))  # Convert to 0-1 similarity
                }
                for song_id, distance in matches
            ]
        }
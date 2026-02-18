#!/usr/bin/env python3
"""
Vocal to Humming Converter
Converts vocal audio to humming-like audio by preserving pitch contour
while removing lyrics and timbre variations.
"""

import numpy as np
import librosa
import soundfile as sf
import sys


def vocal_to_humming(input_file, output_file, sample_rate=22050):
    """
    Convert vocal audio to humming-like audio
    
    Args:
        input_file: Path to input audio file (wav/mp3)
        output_file: Path to output audio file (wav)
        sample_rate: Target sample rate
    """
    # Load audio file
    print(f"Loading {input_file}...")
    y, sr = librosa.load(input_file, sr=sample_rate, mono=True)
    
    # Extract pitch using pYIN
    print("Extracting pitch...")
    f0, voiced_flag, voiced_probs = librosa.pyin(
        y,
        fmin=librosa.note_to_hz('C2'),  # 65 Hz
        fmax=librosa.note_to_hz('C7'),  # 2093 Hz
        sr=sr
    )
    
    # Clean pitch: interpolate unvoiced regions
    print("Cleaning pitch...")
    f0_clean = f0.copy()
    unvoiced = np.isnan(f0_clean)
    if not unvoiced.all():
        # Linear interpolation for missing values
        voiced_indices = np.where(~unvoiced)[0]
        if len(voiced_indices) > 1:
            f0_clean[unvoiced] = np.interp(
                np.where(unvoiced)[0],
                voiced_indices,
                f0_clean[voiced_indices]
            )
    
    # Generate humming-like audio using sine wave synthesis
    print("Synthesizing humming audio...")
    hop_length = 512
    humming = np.zeros(len(y))
    
    for i, freq in enumerate(f0_clean):
        if not np.isnan(freq):
            # Time range for this frame
            start = i * hop_length
            end = min(start + hop_length, len(humming))
            t = np.arange(end - start) / sr
            
            # Generate sine wave at extracted pitch
            humming[start:end] = np.sin(2 * np.pi * freq * t)
    
    # Apply amplitude envelope from original audio
    print("Applying envelope...")
    # Get RMS energy envelope
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    # Upsample envelope to match audio length
    envelope = np.interp(
        np.arange(len(humming)),
        np.linspace(0, len(humming), len(rms)),
        rms
    )
    
    # Apply envelope to humming
    humming = humming * envelope * 10  # Scale up amplitude
    
    # Normalize
    humming = humming / (np.abs(humming).max() + 1e-8)
    humming = humming * 0.8  # Prevent clipping
    
    # Save output
    print(f"Saving to {output_file}...")
    print("Humming min/max:", humming.min(), humming.max())
    print("Humming length:", len(humming))

    sf.write(output_file, humming, sr)
    
    print("Done!")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python vocal_to_humming.py <input_file> <output_file>")
        print("Example: python vocal_to_humming.py song.mp3 humming.wav")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    vocal_to_humming(input_file, output_file)
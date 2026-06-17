/* ==========================================================
  Imports
  - React hooks and component CSS
  ========================================================== */
import React, { useState, useRef, useEffect } from "react";
import "./HumFinder.css";

/* ==========================================================
  Config
  - API base and small constants
  ========================================================== */
const API_BASE_URL = "http://localhost:5000/api";

/* ==========================================================
   Component: HumFinder
   - Manages state, refs and lifecycle for humming matching UI
   ========================================================== */
function HumFinder({ onBack }) {
  const [songs, setSongs] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [matchResults, setMatchResults] = useState(null);
  const [isMatching, setIsMatching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("match"); // 'match' or 'manage'
  const [notification, setNotification] = useState(null);

  // Refs for media and file inputs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const songFileInputRef = useRef(null);

  // Load library on mount
  useEffect(() => {
    loadSongs();
  }, []);

  /* ----------------------------------------------------------
      API: Load songs
      - Fetches the saved song library from backend
      ---------------------------------------------------------- */
  const loadSongs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/songs`);
      const data = await response.json();
      setSongs(data.songs || []);
    } catch (error) {
      showNotification("Failed to load songs", "error");
    }
  };

  /* ----------------------------------------------------------
      UI: Notifications
      - Small helper to show temporary toast messages
      ---------------------------------------------------------- */
  const showNotification = (message, type = "info") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  /* ----------------------------------------------------------
      Recording Handlers
      - Start/stop recording and track elapsed time
      ---------------------------------------------------------- */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav/mp4",
        });
        await matchHumming(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      showNotification("Failed to access microphone", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  /* ----------------------------------------------------------
      Input Handling
      - Upload or receive recorded audio blobs for matching
      ---------------------------------------------------------- */
  const uploadHummingFile = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const blob = new Blob([file], { type: file.type });
    await matchHumming(blob);
  };

  /* ----------------------------------------------------------
      Matching Logic
      - Send audio blob to backend matcher and handle response
      ---------------------------------------------------------- */
  const matchHumming = async (audioBlob) => {
    setIsMatching(true);
    setMatchResults(null);

    const formData = new FormData();
    formData.append("file", audioBlob, "humming.wav");
    formData.append("top_k", "3");

    try {
      const response = await fetch(`${API_BASE_URL}/match`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Matching failed");
      }

      const data = await response.json();
      setMatchResults(data);
      showNotification("Matching complete!", "success");
    } catch (error) {
      showNotification("Failed to match humming", "error");
    } finally {
      setIsMatching(false);
    }
  };

  /* ----------------------------------------------------------
      Song Management
      - Upload new songs and delete existing ones from library
      ---------------------------------------------------------- */
  const uploadSong = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const title = prompt("Enter song title:");
    const artist = prompt("Enter artist name:");

    if (!title || !artist) {
      showNotification("Song upload cancelled", "info");
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("artist", artist);
    formData.append("duration", "30");

    try {
      const response = await fetch(`${API_BASE_URL}/songs`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      await loadSongs();
      showNotification(`"${title}" added successfully!`, "success");
    } catch (error) {
      showNotification("Failed to upload song", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const deleteSong = async (songId, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/songs/${songId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      await loadSongs();
      showNotification(`"${title}" deleted`, "success");
    } catch (error) {
      showNotification("Failed to delete song", "error");
    }
  };

  /* ----------------------------------------------------------
      Utilities
      - Small utility helpers used by the UI
      ---------------------------------------------------------- */
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case "high":
        return "#00ff88";
      case "medium":
        return "#ffaa00";
      case "low":
        return "#ff4466";
      default:
        return "#666";
    }
  };

  /* ----------------------------------------------------------
      Render
      - JSX structure: header, tabs, match/manage sections, footer
      ---------------------------------------------------------- */
  return (
    <div className="app">
      {notification && (
        <div className={`notification ${notification.type}`}>
          <div className="notification-content">{notification.message}</div>
        </div>
      )}

      <header className="header">
        <div className="header-content">
          <button
            className="back-button"
            onClick={() => onBack && onBack()}
            title="Go back"
          >
            ← Back
          </button>
          <div className="logo">
            <div className="waveform">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <h1>HumFinder</h1>
          </div>
          <p className="tagline">Identify songs from your humming</p>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${activeTab === "match" ? "active" : ""}`}
          onClick={() => setActiveTab("match")}
        >
          <span className="tab-icon">🎤</span>
          Match Song
        </button>
        <button
          className={`tab ${activeTab === "manage" ? "active" : ""}`}
          onClick={() => setActiveTab("manage")}
        >
          <span className="tab-icon">📚</span>
          Song Library ({songs.length})
        </button>
      </nav>

      <main className="main">
        {activeTab === "match" && (
          <div className="match-section">
            <div className="match-container">
              <div className="input-panel">
                <div className="recording-card">
                  <h2>Hum a melody</h2>
                  <p className="instructions">
                    Record yourself humming or upload an audio file to find
                    matching songs
                  </p>
                  <div className="recording-controls">
                    <div className="button-group">
                      {!isRecording ? (
                        <button
                          className="record-button"
                          onClick={startRecording}
                          disabled={isMatching}
                        >
                          <div className="record-icon"></div>
                          <span>Start Recording</span>
                        </button>
                      ) : (
                        <button className="stop-button" onClick={stopRecording}>
                          <div className="stop-icon"></div>
                          <span>Stop Recording</span>
                        </button>
                      )}

                      <button
                        className="upload-button"
                        onClick={() => fileInputRef.current.click()}
                        disabled={isMatching || isRecording}
                      >
                        <span className="upload-icon">📁</span>
                        Upload
                      </button>
                    </div>

                    {isRecording && (
                      <div className="recording-indicator">
                        <div className="pulse"></div>
                        <span>{formatTime(recordingTime)}</span>
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={uploadHummingFile}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              <div className="results-panel">
                {isMatching && (
                  <div className="loading-card">
                    <div className="loading-spinner"></div>
                    <p>Analyzing...</p>
                  </div>
                )}

                {matchResults && (
                  <div className="results-card">
                    <h2>Top 3 Matches</h2>

                    <div className="query-info">
                      <div className="info-item">
                        <span className="label">Pitch:</span>
                        <span className="value">
                          {matchResults.query.pitch_length}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="label">Quality:</span>
                        <span className="value">
                          {(matchResults.query.valid_pitch_ratio * 100).toFixed(
                            0,
                          )}
                          %
                        </span>
                      </div>
                    </div>

                    <div className="matches">
                      {matchResults.matches.slice(0, 3).map((match, index) => (
                        <div key={match.song_id} className="match-item">
                          <div className="match-rank">#{index + 1}</div>
                          <div className="match-info">
                            <h3>{match.title}</h3>
                            <p className="artist">{match.artist}</p>
                          </div>
                          <div className="match-score">
                            <div
                              className="confidence-badge"
                              style={{
                                backgroundColor: getConfidenceColor(
                                  match.confidence,
                                ),
                              }}
                            >
                              {match.confidence}
                            </div>
                            <div className="similarity">
                              {(match.similarity_score * 100).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isMatching && !matchResults && (
                  <div className="results-empty">
                    <div className="empty-icon">🎵</div>
                    <p>Results will appear here</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "manage" && (
          <div className="manage-section">
            <div className="manage-header">
              <h2>Song Library</h2>
              <button
                className="add-song-button"
                onClick={() => songFileInputRef.current.click()}
                disabled={isUploading}
              >
                <span>+</span> Add Song
              </button>
              <input
                ref={songFileInputRef}
                type="file"
                accept="audio/*"
                onChange={uploadSong}
                style={{ display: "none" }}
              />
            </div>

            {isUploading && (
              <div className="loading-card">
                <div className="loading-spinner"></div>
                <p>Processing song...</p>
              </div>
            )}

            <div className="songs-grid">
              {songs.map((song) => (
                <div key={song.id} className="song-card">
                  <div className="song-visual">
                    <div className="contour-visualization">
                      {[...Array(20)].map((_, i) => (
                        <div
                          key={i}
                          className="contour-bar"
                          style={{
                            height: `${Math.random() * 60 + 20}%`,
                            animationDelay: `${i * 0.05}s`,
                          }}
                        ></div>
                      ))}
                    </div>
                  </div>
                  <div className="song-details">
                    <h3>{song.title}</h3>
                    <p className="artist">{song.artist}</p>
                    <div className="song-stats">
                      <span className="stat">
                        Contour: {song.contour_length} points
                      </span>
                      <span className="stat">{song.duration.toFixed(0)}s</span>
                    </div>
                  </div>
                  <button
                    className="delete-button"
                    onClick={() => deleteSong(song.id, song.title)}
                    title="Delete song"
                  >
                    ×
                  </button>
                </div>
              ))}

              {songs.length === 0 && !isUploading && (
                <div className="empty-state">
                  <div className="empty-icon">🎵</div>
                  <p>No songs in library yet</p>
                  <p className="empty-hint">Add songs to start matching</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Powered by pitch contour extraction & dynamic time warping</p>
      </footer>
    </div>
  );
}

export default HumFinder;

import React, { useState } from "react";
import "./App.css";
import HumFinder from "./HumFinder";
import FootballAnalyticsDashboard from "./scorematch";

function App() {
  const [selectedMode, setSelectedMode] = useState(null);

  if (selectedMode === "match") {
    return <HumFinder onBack={() => setSelectedMode(null)} />;
  }

  if (selectedMode === "analysis") {
    return (
      <div>
        <button
          onClick={() => setSelectedMode(null)}
          style={{
            position: "fixed",
            top: "20px",
            left: "20px",
            zIndex: 1000,
            padding: "10px 20px",
            backgroundColor: "#ff6b6b",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          ← Back to Home
        </button>
        <FootballAnalyticsDashboard />
      </div>
    );
  }

  return (
    <div className="app">
      <main className="main">
        <div className="home-section">
          <h2 className="welcome-title">Welcome to MultiMatch</h2>
          <p className="welcome-subtitle">Choose a mode to get started</p>
          <div className="modes-container">
            <div
              className="mode-card"
              onClick={() => setSelectedMode("match")}
              style={{ cursor: "pointer" }}
            >
              <div className="mode-icon">🎤</div>
              <h3>Match Song</h3>
              <p className="mode-description">
                Record yourself humming or upload an audio file to find matching
                songs
              </p>
              <button className="mode-button">Start Matching</button>
            </div>
            <div
              className="mode-card"
              onClick={() => setSelectedMode("analysis")}
              style={{ cursor: "pointer" }}
            >
              <div className="mode-icon">📊</div>
              <h3>Analysis</h3>
              <p className="mode-description">
                Analyze pitch contours and visualization
              </p>
              <button className="mode-button">Go to Analysis</button>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>Powered by pitch contour extraction & dynamic time warping</p>
      </footer>
    </div>
  );
}

export default App;

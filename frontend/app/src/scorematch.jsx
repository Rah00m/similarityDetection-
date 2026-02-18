/* ==========================================================
  Imports & Styling
  - React, icons, motion, charts and component CSS
  ========================================================== */
import React, { useState, useMemo, useEffect } from "react";
import styles from "./upload.module.css";
import {
  Upload,
  X,
  Play,
  Zap,
  TrendingUp,
  Activity,
  Target,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadialBarChart,
  RadialBar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "./FootballAnalyticsDashboard.css";

/* ==========================================================
  - Keeps selection and UI flags shared across components
  ========================================================== */

// Create a single instance outside components
let storeInstance = null;

const getStore = () => {
  if (!storeInstance) {
    let state = {
      analysisData: null,
      selectedPlay1Id: null,
      selectedPlay2Id: null,
      ghostMode: false,
    };
    const listeners = new Set();

    storeInstance = {
      getState: () => state,
      setState: (updates) => {
        state = { ...state, ...updates };
        listeners.forEach((fn) => fn());
      },
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
  }
  return storeInstance;
};

const useStore = () => {
  const store = getStore();
  const [state, setState] = useState(store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setState(store.getState());
    });
    return unsubscribe;
  }, [store]);

  return { ...state, setState: store.setState };
};

/* ==========================================================
  Helpers
  - Shared utility functions used by tables and visualizations
  ========================================================== */
// Shared zone resolver (small helper to avoid duplicated logic)
const getZoneNameGlobal = (x, pitchLength = 105) => {
  const third = pitchLength / 3;
  if (x < third) return "defensive";
  if (x < 2 * third) return "middle";
  return "attacking";
};

// Map internal zone keys to display labels used elsewhere
const displayZoneLabel = (zone) =>
  zone === "defensive"
    ? "Defensive"
    : zone === "middle"
      ? "Midfield"
      : "Attack";

/* ==========================================================
  Visualization: FootballPitch
  - SVG pitch with sequential pass animation and helpers
  ========================================================== */
// Football Pitch SVG Component - FIXED WITH CONNECTED PASSES
const FootballPitch = ({
  passes = [],
  color = "#00ff88",
  label = "",
  pitchId = "pitch1",
}) => {
  const pitchWidth = 500;
  const pitchHeight = 340;
  const padding = 10;
  const drawWidth = pitchWidth - 2 * padding;
  const drawHeight = pitchHeight - 2 * padding;

  // ✅ FIX: Create connected chain of passes
  const createConnectedPasses = (originalPasses) => {
    if (originalPasses.length === 0) return [];

    const connected = [originalPasses[0]]; // First pass unchanged

    // Force each pass to start where the previous ended
    for (let i = 1; i < originalPasses.length; i++) {
      connected.push({
        ...originalPasses[i],
        passer_x: connected[i - 1].receiver_x,
        passer_y: connected[i - 1].receiver_y,
      });
    }

    return connected;
  };

  // Apply connection fix
  const connectedPasses = createConnectedPasses(passes);

  // Robust coordinate system detection and normalization
  const detectAndNormalize = (passes) => {
    if (passes.length === 0) return { normalized: [], rangeInfo: null };

    // Find min/max for all coordinates
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    passes.forEach((pass) => {
      minX = Math.min(minX, pass.passer_x, pass.receiver_x);
      maxX = Math.max(maxX, pass.passer_x, pass.receiver_x);
      minY = Math.min(minY, pass.passer_y, pass.receiver_y);
      maxY = Math.max(maxY, pass.passer_y, pass.receiver_y);
    });

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    // Normalize to 0-100 percentage scale
    const normalized = passes.map((pass) => ({
      ...pass,
      passer_x_norm: rangeX > 0 ? ((pass.passer_x - minX) / rangeX) * 100 : 50,
      passer_y_norm: rangeY > 0 ? ((pass.passer_y - minY) / rangeY) * 100 : 50,
      receiver_x_norm:
        rangeX > 0 ? ((pass.receiver_x - minX) / rangeX) * 100 : 50,
      receiver_y_norm:
        rangeY > 0 ? ((pass.receiver_y - minY) / rangeY) * 100 : 50,
    }));

    return {
      normalized,
      rangeInfo: { minX, maxX, minY, maxY, rangeX, rangeY },
    };
  };

  const { normalized: normalizedPasses, rangeInfo } =
    detectAndNormalize(connectedPasses);

  // Scale from 0-100 percentage to SVG coordinates with padding
  const scaleX = (normX) => (normX / 100) * drawWidth + padding;
  const scaleY = (normY) => (normY / 100) * drawHeight + padding;

  // Debug logging
  useEffect(() => {
    if (connectedPasses.length > 0 && rangeInfo) {
      console.log(`⚽ FootballPitch [${pitchId}]:`, {
        passesCount: connectedPasses.length,
        rangeInfo,
        firstOriginal: {
          x: connectedPasses[0].passer_x,
          y: connectedPasses[0].passer_y,
        },
        firstNormalized: {
          x: normalizedPasses[0].passer_x_norm,
          y: normalizedPasses[0].passer_y_norm,
        },
      });
    }
  }, [connectedPasses, pitchId, rangeInfo]);

  return (
    <svg
      viewBox={`0 0 ${pitchWidth} ${pitchHeight}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      style={{ maxHeight: "100%" }}
    >
      {/* Pitch background */}
      <defs>
        <pattern
          id={`grid-${pitchId}`}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth="0.5"
          />
        </pattern>
        <linearGradient
          id={`pitch-grad-${pitchId}`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#0a1f1a" />
          <stop offset="100%" stopColor="#051510" />
        </linearGradient>
      </defs>

      <rect
        width={pitchWidth}
        height={pitchHeight}
        fill={`url(#pitch-grad-${pitchId})`}
      />
      <rect
        width={pitchWidth}
        height={pitchHeight}
        fill={`url(#grid-${pitchId})`}
      />

      {/* Pitch markings */}
      <g stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" fill="none">
        {/* Outer lines */}
        <rect x="10" y="10" width={pitchWidth - 20} height={pitchHeight - 20} />
        {/* Center line */}
        <line
          x1={pitchWidth / 2}
          y1="10"
          x2={pitchWidth / 2}
          y2={pitchHeight - 10}
        />
        {/* Center circle */}
        <circle cx={pitchWidth / 2} cy={pitchHeight / 2} r="40" />
        <circle
          cx={pitchWidth / 2}
          cy={pitchHeight / 2}
          r="2"
          fill="rgba(255,255,255,0.15)"
        />

        {/* Penalty areas */}
        <rect x="10" y={pitchHeight / 2 - 70} width="70" height="140" />
        <rect
          x={pitchWidth - 80}
          y={pitchHeight / 2 - 70}
          width="70"
          height="140"
        />

        {/* Goal areas */}
        <rect x="10" y={pitchHeight / 2 - 35} width="25" height="70" />
        <rect
          x={pitchWidth - 35}
          y={pitchHeight / 2 - 35}
          width="25"
          height="70"
        />

        {/* Penalty spots */}
        <circle
          cx="55"
          cy={pitchHeight / 2}
          r="2"
          fill="rgba(255,255,255,0.15)"
        />
        <circle
          cx={pitchWidth - 55}
          cy={pitchHeight / 2}
          r="2"
          fill="rgba(255,255,255,0.15)"
        />
      </g>

      {/* ✅ CONNECTED Pass visualization */}
      <g>
        {normalizedPasses.map((pass, idx) => {
          const x1 = scaleX(pass.passer_x_norm);
          const y1 = scaleY(pass.passer_y_norm);
          const x2 = scaleX(pass.receiver_x_norm);
          const y2 = scaleY(pass.receiver_y_norm);
          const angle = Math.atan2(y2 - y1, x2 - x1);

          return (
            <g key={idx}>
              {/* Glow effect */}
              <motion.line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.3"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.3 }}
                transition={{ duration: 0.7, delay: idx * 0.4 }}
              />

              {/* Main pass line - SEQUENTIAL ANIMATION */}
              <motion.line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth="4"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.7, delay: idx * 0.4 }}
              />

              {/* Arrowhead */}
              <motion.polygon
                points={`${x2},${y2} ${x2 - 10 * Math.cos(angle - Math.PI / 6)},${y2 - 10 * Math.sin(angle - Math.PI / 6)} ${x2 - 10 * Math.cos(angle + Math.PI / 6)},${y2 - 10 * Math.sin(angle + Math.PI / 6)}`}
                fill={color}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.4 + 0.5 }}
              />

              {/* Player position - Start (only for first pass) */}
              {idx === 0 && (
                <>
                  <motion.circle
                    cx={x1}
                    cy={y1}
                    r="7"
                    fill={color}
                    opacity="0.95"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0 }}
                  />
                  <motion.circle
                    cx={x1}
                    cy={y1}
                    r="10"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    opacity="0.5"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0 }}
                  />
                  <motion.text
                    x={x1}
                    y={y1 - 16}
                    fill={color}
                    fontSize="13"
                    fontWeight="bold"
                    textAnchor="middle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    START
                  </motion.text>
                </>
              )}

              {/* Player position - End (receiver of each pass) */}
              <motion.circle
                cx={x2}
                cy={y2}
                r="7"
                fill={color}
                opacity="0.9"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.4 + 0.5 }}
              />
              <motion.circle
                cx={x2}
                cy={y2}
                r="10"
                fill="none"
                stroke={color}
                strokeWidth="2"
                opacity="0.5"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.4 + 0.5 }}
              />

              {/* Pass number label */}
              <motion.text
                x={x2}
                y={y2 - 16}
                fill={color}
                fontSize="13"
                fontWeight="bold"
                textAnchor="middle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.4 + 0.6 }}
              >
                {idx + 1}
              </motion.text>
            </g>
          );
        })}

        {/* Label */}
        {label && (
          <text
            x={pitchWidth / 2}
            y="25"
            fill="rgba(255,255,255,0.6)"
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
            letterSpacing="1"
          >
            {label}
          </text>
        )}
      </g>
    </svg>
  );
};

/* ==========================================================
  UI: Pass Sequence Table
  - Detailed per-pass rows and summary stats
  ========================================================== */
// Pass Sequence Details Table
const PassSequenceTable = ({ play }) => {
  if (!play || !play.passes || play.passes.length === 0) return null;

  const getZoneName = getZoneNameGlobal;

  const getDirectionArrow = (fromX, fromY, toX, toY) => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (angle >= -45 && angle < 45) return "→ Forward";
    if (angle >= 45 && angle < 135) return "↓ Right";
    if (angle >= -135 && angle < -45) return "↑ Left";
    return "← Backward";
  };

  const zoneColors = {
    Defensive: "bg-red-500/10 text-red-400 border-red-500/30",
    "Mid-Defense": "bg-orange-500/10 text-orange-400 border-orange-500/30",
    Midfield: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    Attack: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    "Attack-Wing": "bg-purple-500/10 text-purple-400 border-purple-500/30",
  };

  // Normalize X coordinates for this play and derive a zone function
  const xs = play.passes.flatMap((p) => [p.passer_x, p.receiver_x]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const rangeX = maxX - minX || 1;
  const normX = (v) => ((v - minX) / rangeX) * 100;
  const zoneFor = (v) => displayZoneLabel(getZoneNameGlobal(normX(v), 100));

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur-md">
      <div className="px-6 py-4 border-b border-slate-700">
        <h3 className="text-sm uppercase font-bold text-slate-400">
          📊 Pass Sequence Details
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-700/30 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-400">#</th>
              <th className="px-4 py-3 font-bold text-slate-400">Passer</th>
              <th className="px-4 py-3 font-bold text-slate-400">Receiver</th>
              <th className="px-4 py-3 font-bold text-slate-400">Distance</th>
              <th className="px-4 py-3 font-bold text-slate-400">Direction</th>
              <th className="px-4 py-3 font-bold text-slate-400">From Zone</th>
              <th className="px-4 py-3 font-bold text-slate-400">To Zone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {play.passes.map((pass, idx) => {
              const distance = Math.sqrt(
                (pass.receiver_x - pass.passer_x) ** 2 +
                  (pass.receiver_y - pass.passer_y) ** 2,
              ).toFixed(2);
              const direction = getDirectionArrow(
                pass.passer_x,
                pass.passer_y,
                pass.receiver_x,
                pass.receiver_y,
              );
              const fromZone = zoneFor(pass.passer_x);
              const toZone = zoneFor(pass.receiver_x);
              const passerId = pass.passer_id || `P${idx + 1}`;
              const receiverId = pass.receiver_id || `P${idx + 2}`;

              return (
                <motion.tr
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="hover:bg-slate-700/20 transition-colors"
                >
                  {/* Pass Number */}
                  <td className="px-4 py-3">
                    <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                      {idx + 1}
                    </span>
                  </td>

                  {/* Passer ID */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500/30 border border-blue-400 flex items-center justify-center text-xs font-bold text-blue-400">
                        {passerId.toString().slice(0, 1)}
                      </div>
                      <span className="text-slate-300">{passerId}</span>
                    </div>
                  </td>

                  {/* Receiver ID */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/30 border border-emerald-400 flex items-center justify-center text-xs font-bold text-emerald-400">
                        {receiverId.toString().slice(0, 1)}
                      </div>
                      <span className="text-slate-300">{receiverId}</span>
                    </div>
                  </td>

                  {/* Distance */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <motion.div
                        className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden"
                        initial={{ width: 0 }}
                        animate={{ width: "40px" }}
                        transition={{ delay: idx * 0.1 }}
                      >
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-emerald-500"
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ delay: idx * 0.1 + 0.2, duration: 0.4 }}
                        />
                      </motion.div>
                      <span className="text-amber-400 font-bold min-w-12">
                        {distance}m
                      </span>
                    </div>
                  </td>

                  {/* Direction */}
                  <td className="px-4 py-3">
                    <span className="text-slate-300 font-semibold">
                      {direction}
                    </span>
                  </td>

                  {/* From Zone */}
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold border ${
                        zoneColors[fromZone] || zoneColors.Midfield
                      }`}
                    >
                      {fromZone}
                    </span>
                  </td>

                  {/* To Zone */}
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold border ${
                        zoneColors[toZone] || zoneColors.Midfield
                      }`}
                    >
                      {toZone}
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-t border-slate-700 bg-slate-800/30">
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase mb-1">Total Passes</p>
          <p className="text-lg font-bold text-emerald-400">
            {play.passes.length}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase mb-1">Avg Distance</p>
          <p className="text-lg font-bold text-amber-400">
            {(
              play.passes.reduce((sum, p) => {
                const d = Math.sqrt(
                  (p.receiver_x - p.passer_x) ** 2 +
                    (p.receiver_y - p.passer_y) ** 2,
                );
                return sum + d;
              }, 0) / play.passes.length
            ).toFixed(2)}
            m
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase mb-1">Max Distance</p>
          <p className="text-lg font-bold text-purple-400">
            {Math.max(
              ...play.passes.map((p) =>
                Math.sqrt(
                  (p.receiver_x - p.passer_x) ** 2 +
                    (p.receiver_y - p.passer_y) ** 2,
                ),
              ),
            ).toFixed(2)}
            m
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase mb-1">
            Total Distance
          </p>
          <p className="text-lg font-bold text-cyan-400">
            {play.passes
              .reduce((sum, p) => {
                const d = Math.sqrt(
                  (p.receiver_x - p.passer_x) ** 2 +
                    (p.receiver_y - p.passer_y) ** 2,
                );
                return sum + d;
              }, 0)
              .toFixed(2)}
            m
          </p>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================
  UI: Play Stats Table
  - Summary metrics and zone badges for two plays
  ========================================================== */
// Play Stats Table Component with Visual Cues
const PlayStatsTable = ({ play1, play2, similarity }) => {
  if (!play1 || !play2) return null;

  const calculateAvgPassDistance = (passes) => {
    if (passes.length === 0) return 0;
    const sum = passes.reduce((acc, pass) => {
      const dx = pass.receiver_x - pass.passer_x;
      const dy = pass.receiver_y - pass.passer_y;
      return acc + Math.sqrt(dx * dx + dy * dy);
    }, 0);
    return (sum / passes.length).toFixed(2);
  };

  const getZoneName = getZoneNameGlobal;

  const getZones = (passes) => {
    if (!passes || passes.length === 0) return [];
    const xs = passes.flatMap((p) => [p.passer_x, p.receiver_x]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const rangeX = maxX - minX || 1;
    const normX = (v) => ((v - minX) / rangeX) * 100;

    const zones = new Set();
    passes.forEach((pass) => {
      zones.add(displayZoneLabel(getZoneNameGlobal(normX(pass.passer_x), 100)));
      zones.add(
        displayZoneLabel(getZoneNameGlobal(normX(pass.receiver_x), 100)),
      );
    });
    return Array.from(zones).slice(0, 3);
  };

  const zoneColors = {
    Defensive: "bg-red-500/20 text-red-300 border-red-500/30",
    "Mid-Defense": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    Midfield: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    Attack: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    "Attack-Wing": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  };

  const maxPasses = Math.max(play1.passes.length, play2.passes.length);
  const pass1Percent = (play1.passes.length / maxPasses) * 100;
  const pass2Percent = (play2.passes.length / maxPasses) * 100;

  const stats = [
    {
      label: "Number of Passes",
      p1: play1.passes.length,
      p2: play2.passes.length,
      showBar: true,
      p1Percent: pass1Percent,
      p2Percent: pass2Percent,
    },
    {
      label: "Duration (sec)",
      p1: (play1.duration || 0).toFixed(2),
      p2: (play2.duration || 0).toFixed(2),
    },
    {
      label: "Avg Pass Distance",
      p1: calculateAvgPassDistance(play1.passes),
      p2: calculateAvgPassDistance(play2.passes),
    },
    {
      label: "Team",
      p1: play1.team || "N/A",
      p2: play2.team || "N/A",
    },
    {
      label: "Completion",
      p1: "✅ Complete",
      p2: "✅ Complete",
      isCompletion: true,
    },
    {
      label: "Similarity Score",
      p1: "-",
      p2: `${(similarity * 100).toFixed(1)}%`,
      highlight: true,
    },
  ];

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 backdrop-blur-md">
      {/* Table Header */}
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-700/50">
          <tr>
            <th className="px-6 py-4 text-xs uppercase font-bold text-slate-400">
              Metric
            </th>
            <th className="px-6 py-4 text-xs uppercase font-bold text-emerald-400">
              Match 1 (Selected)
            </th>
            <th className="px-6 py-4 text-xs uppercase font-bold text-amber-400">
              Match 2 (Similar)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {stats.map((stat, index) => (
            <tr key={index} className="hover:bg-slate-700/30 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-300">
                {stat.label}
              </td>

              {/* Value 1 */}
              <td className="px-6 py-4">
                {stat.showBar ? (
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-emerald-400 min-w-8">
                      {stat.p1}
                    </span>
                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${stat.p1Percent}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                  </div>
                ) : stat.isCompletion ? (
                  <span className="text-green-400 font-bold">{stat.p1}</span>
                ) : (
                  <span className="text-slate-300">{stat.p1}</span>
                )}
              </td>

              {/* Value 2 */}
              <td
                className={`px-6 py-4 ${stat.highlight ? "font-bold text-amber-400" : ""}`}
              >
                {stat.showBar ? (
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-bold min-w-8 ${stat.highlight ? "text-amber-400" : "text-amber-300"}`}
                    >
                      {stat.p2}
                    </span>
                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-amber-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${stat.p2Percent}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                  </div>
                ) : stat.isCompletion ? (
                  <span className="text-green-400 font-bold">{stat.p2}</span>
                ) : (
                  <span className="text-slate-300">{stat.p2}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Zones Coverage */}
      <div className="border-t border-slate-700 bg-slate-800/30 px-6 py-4">
        <p className="text-xs font-bold text-slate-400 uppercase mb-3">
          Zones Covered
        </p>
        <div className="grid grid-cols-2 gap-6">
          {/* Play 1 Zones */}
          <div>
            <p className="text-xs text-emerald-400 font-bold mb-2">Match 1</p>
            <div className="flex flex-wrap gap-2">
              {getZones(play1.passes).map((zone, idx) => (
                <span
                  key={idx}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${zoneColors[zone] || zoneColors.Midfield}`}
                >
                  {zone}
                </span>
              ))}
            </div>
          </div>

          {/* Play 2 Zones */}
          <div>
            <p className="text-xs text-amber-400 font-bold mb-2">Match 2</p>
            <div className="flex flex-wrap gap-2">
              {getZones(play2.passes).map((zone, idx) => (
                <span
                  key={idx}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${zoneColors[zone] || zoneColors.Midfield}`}
                >
                  {zone}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================
  UI: Upload Interface
  - File drop / upload and backend analysis submit
  ========================================================== */
// Upload Interface Component
const UploadInterface = ({ onAnalyze }) => {
  const [match1File, setMatch1File] = useState(null);
  const [match2File, setMatch2File] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDrop = (e, setter) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/json") {
      setter(file);
    }
  };

  // Helper function to read JSON file
  const readJSONFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          console.log(`✓ Successfully read ${file.name}`);
          resolve(data);
        } catch (error) {
          reject(new Error(`Invalid JSON in ${file.name}: ${error.message}`));
        }
      };
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });
  };

  const handleAnalyze = async () => {
    if (!match1File || !match2File) return;

    setIsProcessing(true);

    try {
      // Step 1: Read both files
      console.log("📂 Reading uploaded files...");
      const match1Data = await readJSONFile(match1File);
      const match2Data = await readJSONFile(match2File);

      console.log("📊 Match 1 data structure:", {
        hasFrames: Array.isArray(match1Data),
        firstFrameKeys: match1Data[0] ? Object.keys(match1Data[0]) : "N/A",
      });
      console.log("📊 Match 2 data structure:", {
        hasFrames: Array.isArray(match2Data),
        firstFrameKeys: match2Data[0] ? Object.keys(match2Data[0]) : "N/A",
      });

      // Step 2: Send to backend for analysis
      console.log("🔄 Sending to backend for analysis...");
      const formData = new FormData();
      formData.append("match1", match1File);
      formData.append("match2", match2File);

      const response = await fetch("http://localhost:5000/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(
          `Backend error: ${response.status} ${response.statusText}`,
        );
      }

      const analysisResult = await response.json();
      console.log("✅ Backend analysis received:", {
        hasMath1: !!analysisResult.match1,
        hasMatch2: !!analysisResult.match2,
        hasSimilarities: !!analysisResult.similarities,
        totalSimilarities: analysisResult.similarities?.length || 0,
      });

      // Step 3: Verify data structure
      if (!analysisResult.match1 || !analysisResult.match2) {
        throw new Error(
          "Backend returned incomplete analysis - missing match data",
        );
      }

      // Step 4: Pass to Dashboard
      console.log("📈 Passing analysis results to dashboard...");
      onAnalyze({
        match1: analysisResult.match1,
        match2: analysisResult.match2,
        similarities: analysisResult.similarities || [],
      });

      setIsProcessing(false);
      console.log("✨ Analysis complete!");
    } catch (error) {
      console.error("❌ Analysis error:", error);
      setIsProcessing(false);
      // Optionally show error to user
      alert(`Analysis failed: ${error.message}`);
    }
  };

  if (isProcessing) {
    return (
      <div className={styles.loadingContainer}>
        <div style={{ textAlign: "center" }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            style={{
              width: "96px",
              height: "96px",
              marginLeft: "auto",
              marginRight: "auto",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                width: "96px",
                height: "96px",
                borderRadius: "50%",
                border: "4px solid rgba(16, 185, 129, 0.2)",
                borderTop: "4px solid #10b981",
              }}
            />
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={styles.loadingText}
          >
            ANALYZING PATTERNS
          </motion.p>
          <p className={styles.loadingSubtext}>
            Processing tactical sequences...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={styles.header}
        >
          <h1 className={styles.title}>TACTICAL ANALYZER</h1>
          <p className={styles.subtitle}>
            Upload match data to discover pattern similarities
          </p>
        </motion.div>

        <div className={styles.grid}>
          {[
            { file: match1File, setter: setMatch1File, label: "MATCH 1" },
            { file: match2File, setter: setMatch2File, label: "MATCH 2" },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: idx === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              onDrop={(e) => handleDrop(e, item.setter)}
              onDragOver={(e) => e.preventDefault()}
              style={{ position: "relative" }}
            >
              <div
                className={`${styles.uploadBox} ${item.file ? styles.active : ""}`}
              >
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => item.setter(e.target.files[0])}
                  className={styles.fileInput}
                  id={`file-${idx}`}
                />
                <label htmlFor={`file-${idx}`} className={styles.fileLabel}>
                  <div>
                    <Upload className={styles.uploadIcon} />
                    <p className={styles.uploadLabel}>{item.label}</p>
                    <p className={styles.uploadText}>
                      {item.file
                        ? item.file.name
                        : "Drop JSON or click to upload"}
                    </p>
                  </div>
                </label>
                {item.file && (
                  <button
                    onClick={() => item.setter(null)}
                    className={styles.closeBtn}
                  >
                    <X
                      style={{
                        width: "16px",
                        height: "16px",
                        color: "#94a3b8",
                      }}
                    />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={handleAnalyze}
          disabled={!match1File || !match2File}
          className={`${styles.analyzeBtn} ${match1File && match2File ? styles.active : ""}`}
        >
          {match1File && match2File ? (
            <span
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Zap style={{ width: "20px", height: "20px" }} />
              ANALYZE MATCHES
            </span>
          ) : (
            "UPLOAD BOTH MATCHES"
          )}
        </motion.button>
      </div>
    </div>
  );
};

/* ==========================================================
  Page: Dashboard
  - Play selector, similarity list, pitch canvas and panels
  ========================================================== */
// Dashboard Component
const Dashboard = ({ data }) => {
  const { selectedPlay1Id, selectedPlay2Id, ghostMode, setState } = useStore();

  // Parse data with safety checks
  if (!data || !data.match1 || !data.match2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl font-bold">Invalid data format</p>
          <p className="text-slate-500 mt-2">
            Please upload valid match data files
          </p>
        </div>
      </div>
    );
  }

  const match1Plays = data.match1.plays?.plays_data || [];
  const match2Plays = data.match2.plays?.plays_data || [];
  const similarities = data.similarities || [];

  // Get top 3 similar plays for selected play
  const topSimilarPlays = useMemo(() => {
    if (selectedPlay1Id === null) return [];

    const playComparisons = similarities
      .filter((s) => s.play1_id === selectedPlay1Id)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 3);

    console.log("📊 TopSimilarPlays calculation:", {
      selectedPlay1Id,
      foundComparisons: playComparisons.length,
      comparisons: playComparisons,
    });

    return playComparisons.map((comp, idx) => {
      const playData = match2Plays.find((p) => p.play_id === comp.play2_id);
      console.log(
        `  Comparison ${idx}: play2_id=${comp.play2_id} found=${!!playData}`,
      );
      return {
        ...comp,
        playData,
      };
    });
  }, [selectedPlay1Id, similarities, match2Plays]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalPlays1 = match1Plays.length;
    const totalPlays2 = match2Plays.length;
    const avgSimilarity =
      similarities.length > 0
        ? (
            (similarities.reduce((sum, s) => sum + s.similarity_score, 0) /
              similarities.length) *
            100
          ).toFixed(1)
        : 0;

    const totalPasses1 = match1Plays.reduce(
      (sum, p) => sum + p.passes.length,
      0,
    );
    const totalPasses2 = match2Plays.reduce(
      (sum, p) => sum + p.passes.length,
      0,
    );

    return {
      totalPlays1,
      totalPlays2,
      avgSimilarity,
      totalPasses1,
      totalPasses2,
    };
  }, [match1Plays, match2Plays, similarities]);

  // Get current play data by play_id
  const currentPlay1 =
    selectedPlay1Id !== null
      ? match1Plays.find((p) => p.play_id === selectedPlay1Id)
      : null;
  const currentPlay2 =
    selectedPlay2Id !== null
      ? match2Plays.find((p) => p.play_id === selectedPlay2Id)
      : null;

  // Extra debugging
  useEffect(() => {
    console.log("🔍 Play Selection Debug:");
    console.log("selectedPlay1Id:", selectedPlay1Id);
    console.log("selectedPlay2Id:", selectedPlay2Id);
    if (currentPlay1) {
      console.log("✅ CurrentPlay1 FULL OBJECT:", currentPlay1);
      console.log("   - play_id:", currentPlay1.play_id);
      console.log("   - team:", currentPlay1.team);
      console.log("   - passes type:", typeof currentPlay1.passes);
      console.log("   - passes count:", currentPlay1.passes?.length);
      console.log("   - passes:", currentPlay1.passes);
    } else {
      console.log("❌ currentPlay1 is NULL");
    }
    if (currentPlay2) {
      console.log("✅ CurrentPlay2 FULL OBJECT:", currentPlay2);
      console.log("   - play_id:", currentPlay2.play_id);
      console.log("   - team:", currentPlay2.team);
      console.log("   - passes type:", typeof currentPlay2.passes);
      console.log("   - passes count:", currentPlay2.passes?.length);
      console.log("   - passes:", currentPlay2.passes);
    } else {
      console.log("❌ currentPlay2 is NULL");
    }
  }, [selectedPlay1Id, selectedPlay2Id, currentPlay1, currentPlay2]);

  // Debug logging
  useEffect(() => {
    console.log("🎯 Selection state:", { selectedPlay1Id, selectedPlay2Id });
    console.log("📋 Match1Plays count:", match1Plays.length);
    console.log("📋 Match2Plays count:", match2Plays.length);
    if (currentPlay1) {
      console.log("✅ CurrentPlay1:", {
        play_id: currentPlay1.play_id,
        team: currentPlay1.team,
        passesCount: currentPlay1.passes?.length || 0,
        passesType: typeof currentPlay1.passes,
        firstPass: currentPlay1.passes?.[0],
        passes: currentPlay1.passes,
      });
    } else {
      console.log("❌ No currentPlay1 selected");
    }
    if (currentPlay2) {
      console.log("✅ CurrentPlay2:", {
        play_id: currentPlay2.play_id,
        team: currentPlay2.team,
        passesCount: currentPlay2.passes?.length || 0,
        passesType: typeof currentPlay2.passes,
        firstPass: currentPlay2.passes?.[0],
        passes: currentPlay2.passes,
      });
    } else {
      console.log("❌ No currentPlay2 selected");
    }
  }, [selectedPlay1Id, selectedPlay2Id, currentPlay1, currentPlay2]);

  // Diagnostic: Check Match1 zones (raw vs normalized thirds)
  useEffect(() => {
    if (
      !currentPlay1 ||
      !currentPlay1.passes ||
      currentPlay1.passes.length === 0
    )
      return;

    // compute simple normalization (0-100) for this play's X coordinates
    const xs = currentPlay1.passes.flatMap((p) => [p.passer_x, p.receiver_x]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const rangeX = maxX - minX || 1;

    const zoneFromThirds = (normX) => {
      if (normX < 33.333) return "defensive";
      if (normX < 66.666) return "middle";
      return "attacking";
    };

    const sample = currentPlay1.passes.slice(0, 6).map((pass, i) => {
      const passerNorm = ((pass.passer_x - minX) / rangeX) * 100;
      const receiverNorm = ((pass.receiver_x - minX) / rangeX) * 100;
      return {
        idx: i + 1,
        passer_raw_x: pass.passer_x,
        passer_zone_raw: getZoneNameGlobal(pass.passer_x, pass.passer_y),
        passer_zone_thirds: zoneFromThirds(passerNorm),
        passer_norm: +passerNorm.toFixed(1),
        receiver_raw_x: pass.receiver_x,
        receiver_zone_raw: getZoneNameGlobal(pass.receiver_x, pass.receiver_y),
        receiver_zone_thirds: zoneFromThirds(receiverNorm),
        receiver_norm: +receiverNorm.toFixed(1),
      };
    });

    console.log("🧭 Match1 zone diagnostics (first passes):", sample);
  }, [currentPlay1]);

  // Pass velocity data for chart
  const velocityData = useMemo(() => {
    if (!currentPlay1) return [];

    return currentPlay1.passes.map((pass, idx) => {
      const dx = pass.receiver_x - pass.passer_x;
      const dy = pass.receiver_y - pass.passer_y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return {
        pass: idx + 1,
        velocity: distance.toFixed(2),
      };
    });
  }, [currentPlay1]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-slate-800 bg-slate-900/50 backdrop-blur"
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 tracking-tight">
              TACTICAL ANALYZER
            </h1>
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="text-slate-500 text-xs">MATCH 1 PLAYS</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {stats.totalPlays1}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-500 text-xs">MATCH 2 PLAYS</p>
                <p className="text-2xl font-bold text-cyan-400">
                  {stats.totalPlays2}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-500 text-xs">AVG SIMILARITY</p>
                <p className="text-2xl font-bold text-amber-400">
                  {stats.avgSimilarity}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Grid */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Play Explorer */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="col-span-3 space-y-4"
          >
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <h2 className="text-emerald-400 font-bold mb-3 tracking-wider flex items-center gap-2">
                <Play className="w-4 h-4" />
                MATCH 1 PLAYS
              </h2>
              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar">
                {match1Plays.map((play, idx) => (
                  <button
                    key={play.play_id}
                    onClick={() => {
                      setState({
                        selectedPlay1Id: play.play_id,
                        selectedPlay2Id: null,
                      });
                    }}
                    className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                      selectedPlay1Id === play.play_id
                        ? "bg-emerald-500/20 border border-emerald-500"
                        : "bg-slate-800/50 border border-slate-700 hover:border-emerald-600"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm">
                        Play #{play.play_id}
                      </span>
                      <span className="text-xs text-slate-400">
                        {play.team}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {play.passes.length} pass
                      {play.passes.length !== 1 ? "es" : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Similar Plays */}
            {selectedPlay1Id !== null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-900/50 border border-slate-800 rounded-xl p-4"
              ></motion.div>
            )}
          </motion.div>

          {/* Main Canvas - Pitch Visualization */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-9"
          >
            <h2 className="text-cyan-400 font-bold mb-3 tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4" />
              TOP MATCHES
            </h2>
            <div className="space-y-2">
              {topSimilarPlays.map((sim, idx) => (
                <button
                  key={sim.play2_id}
                  onClick={() => setState({ selectedPlay2Id: sim.play2_id })}
                  className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                    selectedPlay2Id === sim.play2_id
                      ? "bg-cyan-500/20 border border-cyan-500"
                      : "bg-slate-800/50 border border-slate-700 hover:border-cyan-600"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm">
                      Play #{sim.play2_id}
                    </span>
                    <span className="text-xs font-bold text-cyan-400">
                      #{idx + 1}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">
                      {sim.play2_passes} passes
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {(sim.similarity_score * 100).toFixed(1)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-white font-bold tracking-wider flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  TACTICAL VISUALIZATION
                </h2>
                <div className="flex gap-4 items-center">
                  {currentPlay1 && currentPlay2 && selectedPlay2Id !== null && (
                    <div className="bg-emerald-500/20 border border-emerald-500 px-4 py-2 rounded-lg">
                      <p className="text-xs text-emerald-400 uppercase tracking-wider">
                        Similarity Score
                      </p>
                      <p className="text-2xl font-bold text-emerald-400">
                        {(() => {
                          const sim = topSimilarPlays.find(
                            (s) => s.play2_id === selectedPlay2Id,
                          );
                          return sim
                            ? (sim.similarity_score * 100).toFixed(1) + "%"
                            : "N/A";
                        })()}
                      </p>
                    </div>
                  )}
                  {currentPlay1 && currentPlay2 && (
                    <button
                      onClick={() => setState({ ghostMode: !ghostMode })}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        ghostMode
                          ? "bg-purple-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {ghostMode ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                      GHOST OVERLAY
                    </button>
                  )}
                </div>
              </div>

              {!currentPlay1 ? (
                <div className="h-[500px] flex items-center justify-center text-slate-600">
                  <div className="text-center">
                    <Target className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">Select a play to visualize</p>
                  </div>
                </div>
              ) : ghostMode && currentPlay2 ? (
                <div className="h-[500px]">
                  <div className="relative h-full">
                    <div className="absolute inset-0">
                      <FootballPitch
                        passes={currentPlay1.passes || []}
                        color="#00ff88"
                        label="OVERLAY MODE"
                        pitchId="overlay"
                      />
                    </div>
                    <div className="absolute inset-0 opacity-60">
                      <FootballPitch
                        passes={currentPlay2.passes || []}
                        color="#00d4ff"
                        label=""
                        pitchId="overlay2"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 h-[500px]">
                  <div>
                    <FootballPitch
                      passes={currentPlay1?.passes || []}
                      color="#00ff88"
                      label="MATCH 1"
                      pitchId="m1"
                    />
                  </div>
                  <div>
                    {currentPlay2 ? (
                      <FootballPitch
                        passes={currentPlay2.passes || []}
                        color="#00d4ff"
                        label="MATCH 2"
                        pitchId="m2"
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-700 rounded-xl">
                        <p className="text-slate-500">
                          Select a TOP MATCH to compare
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Statistics Panel */}
            {currentPlay1 && selectedPlay2Id !== null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 space-y-6"
              >
                <PlayStatsTable
                  play1={currentPlay1}
                  play2={currentPlay2}
                  similarity={
                    topSimilarPlays.find((p) => p.play2_id === selectedPlay2Id)
                      ?.similarity_score || 0
                  }
                />

                {/* Pass Sequence Tables */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-emerald-400 font-bold mb-3 text-sm uppercase">
                      Match 1 Passes
                    </h3>
                    <PassSequenceTable play={currentPlay1} />
                  </div>
                  <div>
                    <h3 className="text-amber-400 font-bold mb-3 text-sm uppercase">
                      Match 2 Passes
                    </h3>
                    <PassSequenceTable play={currentPlay2} />
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.5);
        }
      `}</style>
    </div>
  );
};

/* ==========================================================
  App Entry
  - Exports the main FootballAnalyticsDashboard component
  ========================================================== */
// Main App Component
export default function FootballAnalyticsDashboard() {
  const [analysisData, setAnalysisData] = useState(null);

  return (
    <div className="font-sans antialiased">
      {!analysisData ? (
        <UploadInterface onAnalyze={setAnalysisData} />
      ) : (
        <Dashboard data={analysisData} />
      )}
    </div>
  );
}

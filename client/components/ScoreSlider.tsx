"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Target } from "lucide-react";

interface ScoreSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "var(--accent-cyan)";
  if (score >= 60) return "var(--accent-emerald)";
  if (score >= 40) return "var(--accent-amber)";
  return "var(--accent-pink)";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Elite";
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Great";
  if (score >= 60) return "Good";
  if (score >= 50) return "Average";
  if (score >= 40) return "Below Avg";
  if (score >= 20) return "Needs Work";
  return "Poor";
}

export default function ScoreSlider({ value, onChange, disabled = false }: ScoreSliderProps) {
  const color = getScoreColor(value);
  const label = getScoreLabel(value);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <label className="cyber-label" style={{ marginBottom: 0 }}>
          <Target size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
          Self-Declared Score
        </label>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <motion.span
            key={value}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 32,
              fontWeight: 900,
              color,
              lineHeight: 1,
            }}
          >
            {value}
          </motion.span>
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>/100</span>
        </div>
      </div>

      {/* Score Label Badge */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <motion.span
          key={label}
          initial={{ y: -5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          style={{
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            borderRadius: 6,
            color,
            background: `${color}20`,
            border: `1px solid ${color}40`,
          }}
        >
          {label}
        </motion.span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="score-slider"
        disabled={disabled}
        style={{ opacity: disabled ? 0.5 : 1 }}
      />

      {/* Scale */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
}

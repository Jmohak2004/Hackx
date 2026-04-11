"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  targetTimestamp: number; // Unix timestamp in seconds
  label?: string;
  size?: "sm" | "md" | "lg";
  onComplete?: () => void;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calcTimeLeft(target: number): TimeLeft {
  const now = Math.floor(Date.now() / 1000);
  const total = Math.max(0, target - now);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    total,
  };
}

export default function CountdownTimer({
  targetTimestamp,
  label = "Time Remaining",
  size = "md",
  onComplete,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calcTimeLeft(targetTimestamp));

  useEffect(() => {
    const interval = setInterval(() => {
      const tl = calcTimeLeft(targetTimestamp);
      setTimeLeft(tl);
      if (tl.total === 0) {
        clearInterval(interval);
        onComplete?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTimestamp, onComplete]);

  const isUrgent = timeLeft.total > 0 && timeLeft.total < 3600; // < 1 hour
  const isExpired = timeLeft.total === 0;

  const fontSize = size === "sm" ? 18 : size === "lg" ? 36 : 26;
  const labelSize = size === "sm" ? 10 : size === "lg" ? 13 : 11;
  const unitGap = size === "sm" ? 8 : size === "lg" ? 16 : 12;
  const separatorSize = size === "sm" ? 14 : size === "lg" ? 24 : 18;

  const glowColor = isExpired
    ? "var(--text-muted)"
    : isUrgent
    ? "var(--accent-pink)"
    : "var(--accent-cyan)";

  const units = [
    { value: timeLeft.days, label: "Days" },
    { value: timeLeft.hours, label: "Hrs" },
    { value: timeLeft.minutes, label: "Min" },
    { value: timeLeft.seconds, label: "Sec" },
  ];

  return (
    <div>
      {label && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
            color: "var(--text-secondary)",
            fontSize: 13,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <Clock size={14} />
          {label}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: unitGap }}>
        {units.map((unit, i) => (
          <div key={unit.label} style={{ display: "flex", alignItems: "center", gap: unitGap }}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize,
                  fontWeight: 800,
                  color: glowColor,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                  minWidth: size === "sm" ? 28 : 40,
                }}
              >
                {String(unit.value).padStart(2, "0")}
              </div>
              <div
                style={{
                  fontSize: labelSize,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginTop: 4,
                  letterSpacing: "0.05em",
                }}
              >
                {unit.label}
              </div>
            </div>
            {i < units.length - 1 && (
              <span
                style={{
                  fontSize: separatorSize,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  opacity: timeLeft.seconds % 2 === 0 ? 1 : 0.3,
                  transition: "opacity 0.3s",
                  alignSelf: "flex-start",
                }}
              >
                :
              </span>
            )}
          </div>
        ))}
      </div>
      {isExpired && (
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--accent-pink)", fontWeight: 600 }}>
          Round Ended
        </div>
      )}
    </div>
  );
}

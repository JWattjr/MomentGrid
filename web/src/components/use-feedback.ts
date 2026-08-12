"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FeedbackCue } from "./screens/shared";

const VIBRATION: Record<FeedbackCue, number | number[]> = {
  tap: 12,
  confirm: [20, 25, 25],
  lock: [35, 30, 55],
  event: [20, 25, 20],
  reveal: [25, 20, 25, 20, 50],
  reward: [30, 20, 30, 20, 80],
};

const FREQUENCIES: Record<FeedbackCue, number[]> = {
  tap: [330],
  confirm: [392, 523],
  lock: [220, 165],
  event: [523, 659],
  reveal: [330, 440, 659],
  reward: [392, 523, 659, 784],
};

/// Haptics and tones for the game's interactions.
///
/// Extracted from the shell so the audio context lifecycle — created lazily on
/// first use, closed on unmount — lives with the code that needs it rather than
/// alongside the screen routing.
export function useFeedback() {
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFeedbackEnabled(window.localStorage.getItem("moment-grid-feedback") !== "off");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(
    () => () => {
      void audioContext.current?.close();
    },
    [],
  );

  const playFeedback = useCallback(
    (cue: FeedbackCue) => {
      if (!feedbackEnabled) return;
      window.navigator.vibrate?.(VIBRATION[cue]);

      if (!("AudioContext" in window)) return;
      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      if (context.state === "suspended") void context.resume();

      FREQUENCIES[cue].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.075;
        oscillator.type = cue === "lock" ? "square" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.095);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.11);
      });
    },
    [feedbackEnabled],
  );

  const toggleFeedback = useCallback(() => {
    setFeedbackEnabled((current) => {
      const next = !current;
      window.localStorage.setItem("moment-grid-feedback", next ? "on" : "off");
      if (next) window.navigator.vibrate?.(18);
      return next;
    });
  }, []);

  return { feedbackEnabled, playFeedback, toggleFeedback };
}

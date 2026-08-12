"use client";

import { Clock3, Eye, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EVENT_LABELS, MatchEvent, MatchEventType, MatchSnapshot, matchScore } from "@moment-grid/scoring";
import { PracticeBanner } from "./chrome";
import { EntryMode, WINDOW_LABELS } from "./shared";

const MAJOR_MOMENTS: MatchEventType[] = [
  "HOME_GOAL",
  "AWAY_GOAL",
  "SUBSTITUTE_GOAL",
  "YELLOW_CARD",
  "RED_CARD",
  "PENALTY_AWARDED",
  "VAR_REVIEW",
  "GOAL_OVERTURNED",
];

export function WatchScreen({
  snapshot,
  error,
  mode,
  onEvent,
  onContinue,
}: {
  snapshot: MatchSnapshot;
  error: string;
  mode: EntryMode;
  onEvent: (event: MatchEvent) => void;
  onContinue: () => void;
}) {
  const [reaction, setReaction] = useState<MatchEvent | null>(null);
  const previousEventCount = useRef(snapshot.events.length);
  const minute = Math.min(90, Math.floor(snapshot.virtualMinute));
  const seconds = minute === 90 ? 0 : Math.floor((snapshot.virtualMinute % 1) * 60);
  const activeWindow = Math.min(2, Math.floor(snapshot.virtualMinute / 30));
  const score = matchScore(snapshot.events);
  const eventCount = snapshot.events.length;
  const latestEvent = eventCount > 0 ? snapshot.events[eventCount - 1] : null;
  const latestEventMinute = latestEvent?.minute;
  const latestEventType = latestEvent?.eventType;

  useEffect(() => {
    if (eventCount <= previousEventCount.current || latestEventMinute === undefined || latestEventType === undefined)
      return;
    previousEventCount.current = eventCount;
    const newest: MatchEvent = { minute: latestEventMinute, eventType: latestEventType };
    onEvent(newest);
    if (!MAJOR_MOMENTS.includes(newest.eventType)) return;
    const showTimer = window.setTimeout(() => setReaction(newest), 0);
    const hideTimer = window.setTimeout(() => setReaction(null), 1450);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [eventCount, latestEventMinute, latestEventType, onEvent]);

  const reactionTone =
    reaction && ["HOME_GOAL", "AWAY_GOAL", "SUBSTITUTE_GOAL"].includes(reaction.eventType)
      ? "goal"
      : reaction && ["YELLOW_CARD", "RED_CARD", "PENALTY_AWARDED", "VAR_REVIEW"].includes(reaction.eventType)
        ? "alert"
        : "pulse";

  return (
    <div className="screen-stack watch-screen">
      {reaction && (
        <div className={`match-reaction reaction-${reactionTone}`} role="status" aria-live="assertive">
          <span>{Math.floor(reaction.minute)}′</span>
          <div className="reaction-glyph">
            <EventGlyph eventType={reaction.eventType} />
          </div>
          <strong>{EVENT_LABELS[reaction.eventType]}</strong>
          <small>Match moment</small>
        </div>
      )}
      {mode === "practice" && <PracticeBanner />}
      <div className="watch-head">
        <div>
          <span className="step-label live-label">
            <span /> Live replay
          </span>
          <h1>
            {minute}:{String(seconds).padStart(2, "0")}
          </h1>
        </div>
        <div className="score-bug" aria-label={`Arsenal ${score.home}, Chelsea ${score.away}`}>
          <span>ARS</span>
          <strong>
            {score.home}—{score.away}
          </strong>
          <span>CHE</span>
        </div>
      </div>
      <div className="timeline">
        {WINDOW_LABELS.map((window, index) => (
          <div
            className={`timeline-window ${index < activeWindow || snapshot.phase === "complete" ? "is-done" : ""} ${index === activeWindow && snapshot.phase !== "complete" ? "is-live" : ""}`}
            key={window}
          >
            <span>{window}′</span>
            <div>
              <i
                style={{
                  width:
                    index === activeWindow
                      ? `${Math.min(100, ((snapshot.virtualMinute - index * 30) / 30) * 100)}%`
                      : undefined,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="sealed-panel">
        <div className="sealed-orbit">
          <LockKeyhole size={26} />
          <span />
        </div>
        <strong>Your predictions are sealed</strong>
        <p>Conditions resolve across all 90 minutes. Consensus remains private until reveal.</p>
      </div>
      <div className="feed-section">
        <div className="section-heading">
          <span>Match pulse</span>
          <small>{snapshot.events.length} events</small>
        </div>
        <div className="event-feed">
          {snapshot.events.length === 0 && <div className="empty-event">Waiting for kickoff…</div>}
          {[...snapshot.events]
            .reverse()
            .slice(0, 4)
            .map((event, index) => (
              <EventRow event={event} newest={index === 0} key={`${event.minute}-${event.eventType}`} />
            ))}
        </div>
      </div>
      {error && <p className="error-message">{error}</p>}
      {snapshot.phase === "complete" ? (
        <button className="primary-button" onClick={onContinue}>
          Full time · reveal <Eye size={18} />
        </button>
      ) : (
        <div className="countdown">
          <Clock3 size={14} /> {Math.ceil(snapshot.remainingSeconds)}s until reveal
        </div>
      )}
    </div>
  );
}

function EventRow({ event, newest }: { event: MatchEvent; newest: boolean }) {
  return (
    <div className={`event-row ${newest ? "is-new" : ""}`}>
      <span className="event-minute">{Math.floor(event.minute)}′</span>
      <span className="event-glyph">
        <EventGlyph eventType={event.eventType} />
      </span>
      <strong>{EVENT_LABELS[event.eventType]}</strong>
      {newest && <small>just now</small>}
    </div>
  );
}

function EventGlyph({ eventType }: { eventType: MatchEventType }) {
  const glyphs: Record<MatchEventType, string> = {
    HOME_SHOT: "◎",
    AWAY_SHOT: "◎",
    HOME_GOAL: "✦",
    AWAY_GOAL: "✦",
    CORNER: "⌞",
    YELLOW_CARD: "▯",
    RED_CARD: "▮",
    VAR_REVIEW: "V",
    GOAL_OVERTURNED: "×",
    PENALTY_AWARDED: "◉",
    SUBSTITUTION: "⇄",
    SUBSTITUTE_GOAL: "★",
    EXTRA_TIME: "+",
  };
  return <span className="moment-glyph">{glyphs[eventType]}</span>;
}
